import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { applyFilters, clearFilters } from '../../filterEngine.js';

/**
 * Property tests for filterEngine.js
 * Validates: Requirements 10.2, 10.3, 10.4, 10.7
 */

// --- Generators ---

const eventTypeArb = fc.constantFrom('ObjectEvent', 'AggregationEvent', 'TransactionEvent', 'TransformationEvent', 'AssociationEvent');
const bizStepArb = fc.constantFrom('commissioning', 'packing', 'shipping', 'receiving', 'decommissioning');
const dispositionArb = fc.constantFrom('active', 'inactive', 'in_transit', 'returned', 'destroyed');
const severityArb = fc.constantFrom('Critical', 'Warning', 'Info');
const issueTypeArb = fc.constantFrom('GS1 Violation', 'DSCSA Violation', 'Sequence Error', 'Missing Data', 'Format Error');

const gtinArb = fc.stringOf(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), { minLength: 14, maxLength: 14 });
const lotArb = fc.stringOf(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('')), { minLength: 3, maxLength: 10 });
const dateArb = fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }).map(d => d.toISOString().split('T')[0]);
const serialArb = fc.stringOf(fc.constantFrom(...'0123456789ABCDEFabcdef'.split('')), { minLength: 5, maxLength: 20 });

const epcUriArb = fc.tuple(gtinArb, serialArb).map(([gtin, serial]) => `urn:epc:id:sgtin:${gtin.slice(0, 7)}.${gtin.slice(7, 13)}.${serial}`);
const ssccUriArb = fc.stringOf(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), { minLength: 18, maxLength: 18 })
  .map(digits => `urn:epc:id:sscc:${digits.slice(0, 7)}.${digits.slice(7)}`);

/** Generate a random EPCIS event */
const eventArb = fc.record({
  eventType: eventTypeArb,
  eventTime: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }).map(d => d.toISOString()),
  bizStep: fc.oneof(bizStepArb, fc.constant(null)),
  disposition: fc.oneof(dispositionArb, fc.constant(null)),
  epcList: fc.array(epcUriArb, { minLength: 0, maxLength: 3 }),
  childEPCs: fc.array(epcUriArb, { minLength: 0, maxLength: 2 }),
  parentID: fc.oneof(epcUriArb, ssccUriArb, fc.constant(null)),
});

/** Generate a random product info */
const productArb = fc.record({
  gtin: gtinArb,
  sgtinPattern: epcUriArb,
  lotNumbers: fc.array(lotArb, { minLength: 1, maxLength: 3 }),
  expirationDates: fc.array(dateArb, { minLength: 1, maxLength: 2 }),
  serialCount: fc.integer({ min: 1, max: 100 }),
});

/** Generate a random case info */
const caseArb = fc.record({
  parentEPC: epcUriArb,
  childEPCs: fc.array(epcUriArb, { minLength: 1, maxLength: 5 }),
  associatedGTIN: gtinArb,
  childCount: fc.integer({ min: 1, max: 50 }),
});

/** Generate a random SSCC info */
const ssccInfoArb = fc.record({
  sscc: ssccUriArb,
  childEPCs: fc.array(epcUriArb, { minLength: 0, maxLength: 4 }),
  associatedProducts: fc.array(gtinArb, { minLength: 1, maxLength: 3 }),
});

/** Generate a random issue */
const issueArb = fc.record({
  severity: severityArb,
  category: issueTypeArb,
  affectedItem: epcUriArb,
  message: fc.string({ minLength: 5, maxLength: 50 }),
});

/** Generate a full analysis data set */
const dataSetArb = fc.record({
  events: fc.array(eventArb, { minLength: 1, maxLength: 10 }),
  products: fc.array(productArb, { minLength: 1, maxLength: 5 }),
  cases: fc.array(caseArb, { minLength: 1, maxLength: 5 }),
  ssccs: fc.array(ssccInfoArb, { minLength: 1, maxLength: 5 }),
  issues: fc.array(issueArb, { minLength: 1, maxLength: 8 }),
});

/** Generate a random filter criteria with some fields active (non-null) */
const criteriaArb = fc.record({
  product: fc.oneof(gtinArb, fc.constant(null)),
  lotNumber: fc.oneof(lotArb, fc.constant(null)),
  expirationDate: fc.oneof(dateArb, fc.constant(null)),
  eventType: fc.oneof(eventTypeArb, fc.constant(null)),
  bizStep: fc.oneof(bizStepArb, fc.constant(null)),
  disposition: fc.oneof(dispositionArb, fc.constant(null)),
  serialNumber: fc.oneof(serialArb, fc.constant(null)),
  caseSerial: fc.oneof(serialArb, fc.constant(null)),
  sscc: fc.oneof(fc.stringOf(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), { minLength: 3, maxLength: 8 }), fc.constant(null)),
  issueSeverity: fc.oneof(severityArb, fc.constant(null)),
  issueType: fc.oneof(issueTypeArb, fc.constant(null)),
  searchQuery: fc.oneof(fc.string({ minLength: 1, maxLength: 20 }), fc.constant(null)),
});

// --- Helpers ---

function containsSubstring(haystack, needle) {
  if (!haystack || !needle) return false;
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

/** Check if an event satisfies all active criteria */
function eventSatisfiesCriteria(event, criteria) {
  if (criteria.eventType && event.eventType !== criteria.eventType) return false;
  if (criteria.bizStep && !containsSubstring(event.bizStep, criteria.bizStep)) return false;
  if (criteria.disposition && !containsSubstring(event.disposition, criteria.disposition)) return false;
  if (criteria.serialNumber) {
    const matchesEpc = (event.epcList || []).some(epc => containsSubstring(epc, criteria.serialNumber));
    const matchesChild = (event.childEPCs || []).some(epc => containsSubstring(epc, criteria.serialNumber));
    const matchesParent = event.parentID && containsSubstring(event.parentID, criteria.serialNumber);
    if (!matchesEpc && !matchesChild && !matchesParent) return false;
  }
  if (criteria.searchQuery) {
    const query = criteria.searchQuery.length > 100 ? criteria.searchQuery.substring(0, 100) : criteria.searchQuery;
    const matchesEpc = (event.epcList || []).some(epc => containsSubstring(epc, query));
    const matchesChild = (event.childEPCs || []).some(epc => containsSubstring(epc, query));
    const matchesParent = event.parentID && containsSubstring(event.parentID, query);
    if (!matchesEpc && !matchesChild && !matchesParent) return false;
  }
  return true;
}

/** Check if a product satisfies all active criteria */
function productSatisfiesCriteria(product, criteria) {
  if (criteria.product && product.gtin !== criteria.product) return false;
  if (criteria.lotNumber && (!product.lotNumbers || !product.lotNumbers.includes(criteria.lotNumber))) return false;
  if (criteria.expirationDate && (!product.expirationDates || !product.expirationDates.includes(criteria.expirationDate))) return false;
  if (criteria.searchQuery) {
    const query = criteria.searchQuery.length > 100 ? criteria.searchQuery.substring(0, 100) : criteria.searchQuery;
    if (!containsSubstring(product.sgtinPattern, query) && !containsSubstring(product.gtin, query)) return false;
  }
  return true;
}

/** Check if a case satisfies all active criteria */
function caseSatisfiesCriteria(caseInfo, criteria) {
  if (criteria.caseSerial && !containsSubstring(caseInfo.parentEPC, criteria.caseSerial)) return false;
  if (criteria.product && caseInfo.associatedGTIN !== criteria.product) return false;
  if (criteria.searchQuery) {
    const query = criteria.searchQuery.length > 100 ? criteria.searchQuery.substring(0, 100) : criteria.searchQuery;
    const matchesParent = containsSubstring(caseInfo.parentEPC, query);
    const matchesChild = (caseInfo.childEPCs || []).some(epc => containsSubstring(epc, query));
    if (!matchesParent && !matchesChild) return false;
  }
  return true;
}

/** Check if an SSCC satisfies all active criteria */
function ssccSatisfiesCriteria(ssccInfo, criteria) {
  if (criteria.sscc && !containsSubstring(ssccInfo.sscc, criteria.sscc)) return false;
  if (criteria.product && (!ssccInfo.associatedProducts || !ssccInfo.associatedProducts.includes(criteria.product))) return false;
  if (criteria.searchQuery) {
    const query = criteria.searchQuery.length > 100 ? criteria.searchQuery.substring(0, 100) : criteria.searchQuery;
    const matchesSSCC = containsSubstring(ssccInfo.sscc, query);
    const matchesChild = (ssccInfo.childEPCs || []).some(epc => containsSubstring(epc, query));
    if (!matchesSSCC && !matchesChild) return false;
  }
  return true;
}

/** Check if an issue satisfies all active criteria */
function issueSatisfiesCriteria(issue, criteria) {
  if (criteria.issueSeverity && issue.severity !== criteria.issueSeverity) return false;
  if (criteria.issueType && !containsSubstring(issue.category, criteria.issueType)) return false;
  if (criteria.searchQuery) {
    const query = criteria.searchQuery.length > 100 ? criteria.searchQuery.substring(0, 100) : criteria.searchQuery;
    if (!containsSubstring(issue.affectedItem, query)) return false;
  }
  return true;
}

// --- Property Tests ---

describe('Feature: epcis-file-analyzer, Property 14: Filter AND Semantics', () => {
  /**
   * Validates: Requirements 10.2, 10.3, 10.4, 10.7
   *
   * Property: Every item in the filtered output satisfies ALL active filter criteria simultaneously.
   */
  it('every item in filtered output matches all active criteria simultaneously', () => {
    fc.assert(
      fc.property(dataSetArb, criteriaArb, (data, criteria) => {
        const result = applyFilters(data, criteria);

        // Every filtered event must satisfy all active criteria
        for (const event of result.events) {
          expect(eventSatisfiesCriteria(event, criteria)).toBe(true);
        }

        // Every filtered product must satisfy all active criteria
        for (const product of result.products) {
          expect(productSatisfiesCriteria(product, criteria)).toBe(true);
        }

        // Every filtered case must satisfy all active criteria
        for (const caseInfo of result.cases) {
          expect(caseSatisfiesCriteria(caseInfo, criteria)).toBe(true);
        }

        // Every filtered SSCC must satisfy all active criteria
        for (const ssccInfo of result.ssccs) {
          expect(ssccSatisfiesCriteria(ssccInfo, criteria)).toBe(true);
        }

        // Every filtered issue must satisfy all active criteria
        for (const issue of result.issues) {
          expect(issueSatisfiesCriteria(issue, criteria)).toBe(true);
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Validates: Requirements 10.2, 10.3, 10.4, 10.7
   *
   * Property: The filtered result is always a subset of the unfiltered result
   * (filtered.length <= original.length for each data category).
   */
  it('filtered result is a subset of unfiltered result', () => {
    fc.assert(
      fc.property(dataSetArb, criteriaArb, (data, criteria) => {
        const filtered = applyFilters(data, criteria);

        expect(filtered.events.length).toBeLessThanOrEqual(data.events.length);
        expect(filtered.products.length).toBeLessThanOrEqual(data.products.length);
        expect(filtered.cases.length).toBeLessThanOrEqual(data.cases.length);
        expect(filtered.ssccs.length).toBeLessThanOrEqual(data.ssccs.length);
        expect(filtered.issues.length).toBeLessThanOrEqual(data.issues.length);

        // Every item in filtered output must exist in the original dataset
        for (const event of filtered.events) {
          expect(data.events).toContain(event);
        }
        for (const product of filtered.products) {
          expect(data.products).toContain(product);
        }
        for (const caseInfo of filtered.cases) {
          expect(data.cases).toContain(caseInfo);
        }
        for (const ssccInfo of filtered.ssccs) {
          expect(data.ssccs).toContain(ssccInfo);
        }
        for (const issue of filtered.issues) {
          expect(data.issues).toContain(issue);
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Validates: Requirements 10.2, 10.3, 10.4, 10.7
   *
   * Property: Clearing all filters and applying with all-null criteria returns the full dataset unchanged.
   */
  it('clearFilters then applyFilters with all-null criteria returns full dataset', () => {
    fc.assert(
      fc.property(dataSetArb, (data) => {
        // First apply some random filter to change state
        applyFilters(data, { eventType: 'ObjectEvent' });

        // Clear filters
        const emptyCriteria = clearFilters();

        // Verify clearFilters returns all-null criteria
        for (const key of Object.keys(emptyCriteria)) {
          expect(emptyCriteria[key]).toBeNull();
        }

        // Apply with null criteria — should return full dataset
        const result = applyFilters(data, emptyCriteria);

        expect(result.events.length).toBe(data.events.length);
        expect(result.products.length).toBe(data.products.length);
        expect(result.cases.length).toBe(data.cases.length);
        expect(result.ssccs.length).toBe(data.ssccs.length);
        expect(result.issues.length).toBe(data.issues.length);

        // Verify exact same items are returned
        expect(result.events).toEqual(data.events);
        expect(result.products).toEqual(data.products);
        expect(result.cases).toEqual(data.cases);
        expect(result.ssccs).toEqual(data.ssccs);
        expect(result.issues).toEqual(data.issues);
      }),
      { numRuns: 100 }
    );
  });
});
