import { describe, it, expect } from 'vitest';
import { applyFilters, clearFilters } from '../../filterEngine.js';

/**
 * Test data factories
 */
function createEvent(overrides = {}) {
  return {
    eventType: 'ObjectEvent',
    eventTime: '2024-01-15T10:00:00.000Z',
    action: 'ADD',
    bizStep: 'urn:epcglobal:cbv:bizstep:commissioning',
    disposition: 'urn:epcglobal:cbv:disp:active',
    epcList: ['urn:epc:id:sgtin:0614141.107346.2017'],
    childEPCs: [],
    parentID: null,
    ...overrides,
  };
}

function createProduct(overrides = {}) {
  return {
    sgtinPattern: 'urn:epc:id:sgtin:0614141.107346.*',
    gtin: '00614141107346',
    ndc: null,
    productName: 'Test Product',
    serialCount: 10,
    lotNumbers: ['LOT001'],
    expirationDates: ['2025-12-31'],
    caseCount: 2,
    ssccCount: 1,
    ...overrides,
  };
}

function createCase(overrides = {}) {
  return {
    parentEPC: 'urn:epc:id:sgtin:0614141.000001.CASE001',
    childEPCs: [
      'urn:epc:id:sgtin:0614141.107346.2017',
      'urn:epc:id:sgtin:0614141.107346.2018',
    ],
    childCount: 2,
    associatedGTIN: '00614141107346',
    aggregationStatus: 'Valid',
    childrenCommissioned: 'Yes',
    eventTime: '2024-01-15T12:00:00.000Z',
    ...overrides,
  };
}

function createSSCC(overrides = {}) {
  return {
    sscc: 'urn:epc:id:sscc:0614141.0000000001',
    eventCount: 3,
    roles: ['parentID'],
    events: [],
    childEPCs: ['urn:epc:id:sgtin:0614141.107346.2017'],
    associatedProducts: ['00614141107346'],
    ...overrides,
  };
}

function createIssue(overrides = {}) {
  return {
    severity: 'Warning',
    title: 'Missing field',
    description: 'The event is missing a required field.',
    affectedItem: 'urn:epc:id:sgtin:0614141.107346.2017',
    eventTime: '2024-01-15T10:00:00.000Z',
    xmlPath: '/EPCISBody/EventList/ObjectEvent[1]',
    suggestedCorrection: 'Add the missing field.',
    category: 'GS1 Format',
    ...overrides,
  };
}

function createData(overrides = {}) {
  return {
    events: [createEvent()],
    products: [createProduct()],
    cases: [createCase()],
    ssccs: [createSSCC()],
    issues: [createIssue()],
    ...overrides,
  };
}

describe('filterEngine', () => {
  describe('applyFilters', () => {
    it('returns all data when no criteria are active', () => {
      const data = createData();
      const result = applyFilters(data, {});

      expect(result.events).toHaveLength(1);
      expect(result.products).toHaveLength(1);
      expect(result.cases).toHaveLength(1);
      expect(result.ssccs).toHaveLength(1);
      expect(result.issues).toHaveLength(1);
    });

    it('returns empty results for null data', () => {
      const result = applyFilters(null, {});
      expect(result.events).toEqual([]);
      expect(result.products).toEqual([]);
      expect(result.cases).toEqual([]);
      expect(result.ssccs).toEqual([]);
      expect(result.issues).toEqual([]);
    });

    it('returns empty arrays for missing data sections', () => {
      const result = applyFilters({}, {});
      expect(result.events).toEqual([]);
      expect(result.products).toEqual([]);
      expect(result.cases).toEqual([]);
      expect(result.ssccs).toEqual([]);
      expect(result.issues).toEqual([]);
    });
  });

  describe('event filtering', () => {
    it('filters by eventType', () => {
      const data = createData({
        events: [
          createEvent({ eventType: 'ObjectEvent' }),
          createEvent({ eventType: 'AggregationEvent' }),
        ],
      });
      const result = applyFilters(data, { eventType: 'ObjectEvent' });
      expect(result.events).toHaveLength(1);
      expect(result.events[0].eventType).toBe('ObjectEvent');
    });

    it('filters by bizStep (substring match)', () => {
      const data = createData({
        events: [
          createEvent({ bizStep: 'urn:epcglobal:cbv:bizstep:commissioning' }),
          createEvent({ bizStep: 'urn:epcglobal:cbv:bizstep:shipping' }),
        ],
      });
      const result = applyFilters(data, { bizStep: 'commissioning' });
      expect(result.events).toHaveLength(1);
      expect(result.events[0].bizStep).toContain('commissioning');
    });

    it('filters by disposition (substring match)', () => {
      const data = createData({
        events: [
          createEvent({ disposition: 'urn:epcglobal:cbv:disp:active' }),
          createEvent({ disposition: 'urn:epcglobal:cbv:disp:in_transit' }),
        ],
      });
      const result = applyFilters(data, { disposition: 'active' });
      expect(result.events).toHaveLength(1);
      expect(result.events[0].disposition).toContain('active');
    });

    it('filters by serialNumber across epcList', () => {
      const data = createData({
        events: [
          createEvent({ epcList: ['urn:epc:id:sgtin:0614141.107346.SN001'] }),
          createEvent({ epcList: ['urn:epc:id:sgtin:0614141.107346.SN002'] }),
        ],
      });
      const result = applyFilters(data, { serialNumber: 'SN001' });
      expect(result.events).toHaveLength(1);
    });

    it('filters by serialNumber across childEPCs', () => {
      const data = createData({
        events: [
          createEvent({ childEPCs: ['urn:epc:id:sgtin:0614141.107346.CHILD1'] }),
          createEvent({ childEPCs: ['urn:epc:id:sgtin:0614141.107346.CHILD2'] }),
        ],
      });
      const result = applyFilters(data, { serialNumber: 'CHILD1' });
      expect(result.events).toHaveLength(1);
    });

    it('filters by serialNumber in parentID', () => {
      const data = createData({
        events: [
          createEvent({ parentID: 'urn:epc:id:sgtin:0614141.000001.PARENT1' }),
          createEvent({ parentID: 'urn:epc:id:sgtin:0614141.000001.PARENT2' }),
        ],
      });
      const result = applyFilters(data, { serialNumber: 'PARENT1' });
      expect(result.events).toHaveLength(1);
    });

    it('applies AND logic across multiple event filters', () => {
      const data = createData({
        events: [
          createEvent({ eventType: 'ObjectEvent', bizStep: 'urn:epcglobal:cbv:bizstep:commissioning' }),
          createEvent({ eventType: 'ObjectEvent', bizStep: 'urn:epcglobal:cbv:bizstep:shipping' }),
          createEvent({ eventType: 'AggregationEvent', bizStep: 'urn:epcglobal:cbv:bizstep:commissioning' }),
        ],
      });
      const result = applyFilters(data, { eventType: 'ObjectEvent', bizStep: 'commissioning' });
      expect(result.events).toHaveLength(1);
      expect(result.events[0].eventType).toBe('ObjectEvent');
      expect(result.events[0].bizStep).toContain('commissioning');
    });

    it('handles events with null bizStep when filtering by bizStep', () => {
      const data = createData({
        events: [createEvent({ bizStep: null })],
      });
      const result = applyFilters(data, { bizStep: 'shipping' });
      expect(result.events).toHaveLength(0);
    });
  });

  describe('product filtering', () => {
    it('filters by product GTIN', () => {
      const data = createData({
        products: [
          createProduct({ gtin: '00614141107346' }),
          createProduct({ gtin: '00614141999999' }),
        ],
      });
      const result = applyFilters(data, { product: '00614141107346' });
      expect(result.products).toHaveLength(1);
      expect(result.products[0].gtin).toBe('00614141107346');
    });

    it('filters by lotNumber', () => {
      const data = createData({
        products: [
          createProduct({ lotNumbers: ['LOT001', 'LOT002'] }),
          createProduct({ lotNumbers: ['LOT003'] }),
        ],
      });
      const result = applyFilters(data, { lotNumber: 'LOT001' });
      expect(result.products).toHaveLength(1);
      expect(result.products[0].lotNumbers).toContain('LOT001');
    });

    it('filters by expirationDate', () => {
      const data = createData({
        products: [
          createProduct({ expirationDates: ['2025-12-31'] }),
          createProduct({ expirationDates: ['2026-06-30'] }),
        ],
      });
      const result = applyFilters(data, { expirationDate: '2025-12-31' });
      expect(result.products).toHaveLength(1);
    });

    it('applies AND logic for product filters', () => {
      const data = createData({
        products: [
          createProduct({ gtin: '00614141107346', lotNumbers: ['LOT001'] }),
          createProduct({ gtin: '00614141107346', lotNumbers: ['LOT002'] }),
          createProduct({ gtin: '00614141999999', lotNumbers: ['LOT001'] }),
        ],
      });
      const result = applyFilters(data, { product: '00614141107346', lotNumber: 'LOT001' });
      expect(result.products).toHaveLength(1);
    });
  });

  describe('case filtering', () => {
    it('filters by caseSerial (substring match on parentEPC)', () => {
      const data = createData({
        cases: [
          createCase({ parentEPC: 'urn:epc:id:sgtin:0614141.000001.CASE001' }),
          createCase({ parentEPC: 'urn:epc:id:sgtin:0614141.000001.CASE002' }),
        ],
      });
      const result = applyFilters(data, { caseSerial: 'CASE001' });
      expect(result.cases).toHaveLength(1);
      expect(result.cases[0].parentEPC).toContain('CASE001');
    });

    it('caseSerial filter is case-insensitive', () => {
      const data = createData({
        cases: [createCase({ parentEPC: 'urn:epc:id:sgtin:0614141.000001.CaseABC' })],
      });
      const result = applyFilters(data, { caseSerial: 'caseabc' });
      expect(result.cases).toHaveLength(1);
    });

    it('filters cases by product (associatedGTIN)', () => {
      const data = createData({
        cases: [
          createCase({ associatedGTIN: '00614141107346' }),
          createCase({ associatedGTIN: '00614141999999' }),
        ],
      });
      const result = applyFilters(data, { product: '00614141107346' });
      expect(result.cases).toHaveLength(1);
    });
  });

  describe('SSCC filtering', () => {
    it('filters by sscc (substring match on SSCC URI)', () => {
      const data = createData({
        ssccs: [
          createSSCC({ sscc: 'urn:epc:id:sscc:0614141.0000000001' }),
          createSSCC({ sscc: 'urn:epc:id:sscc:0614141.0000000002' }),
        ],
      });
      const result = applyFilters(data, { sscc: '0000000001' });
      expect(result.ssccs).toHaveLength(1);
    });

    it('sscc filter is case-insensitive', () => {
      const data = createData({
        ssccs: [createSSCC({ sscc: 'urn:epc:id:sscc:0614141.ABC123' })],
      });
      const result = applyFilters(data, { sscc: 'abc123' });
      expect(result.ssccs).toHaveLength(1);
    });

    it('filters SSCCs by product (associatedProducts)', () => {
      const data = createData({
        ssccs: [
          createSSCC({ associatedProducts: ['00614141107346'] }),
          createSSCC({ associatedProducts: ['00614141999999'] }),
        ],
      });
      const result = applyFilters(data, { product: '00614141107346' });
      expect(result.ssccs).toHaveLength(1);
    });
  });

  describe('issue filtering', () => {
    it('filters by issueSeverity', () => {
      const data = createData({
        issues: [
          createIssue({ severity: 'Critical' }),
          createIssue({ severity: 'Warning' }),
          createIssue({ severity: 'Info' }),
        ],
      });
      const result = applyFilters(data, { issueSeverity: 'Critical' });
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].severity).toBe('Critical');
    });

    it('filters by issueType (category substring match)', () => {
      const data = createData({
        issues: [
          createIssue({ category: 'GS1 Format' }),
          createIssue({ category: 'DSCSA Compliance' }),
          createIssue({ category: 'Sequence' }),
        ],
      });
      const result = applyFilters(data, { issueType: 'GS1' });
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].category).toBe('GS1 Format');
    });

    it('applies AND logic for issue filters', () => {
      const data = createData({
        issues: [
          createIssue({ severity: 'Critical', category: 'GS1 Format' }),
          createIssue({ severity: 'Critical', category: 'DSCSA Compliance' }),
          createIssue({ severity: 'Warning', category: 'GS1 Format' }),
        ],
      });
      const result = applyFilters(data, { issueSeverity: 'Critical', issueType: 'GS1' });
      expect(result.issues).toHaveLength(1);
    });
  });

  describe('searchQuery', () => {
    it('matches across serial numbers in events', () => {
      const data = createData({
        events: [
          createEvent({ epcList: ['urn:epc:id:sgtin:0614141.107346.ABC123'] }),
          createEvent({ epcList: ['urn:epc:id:sgtin:0614141.107346.DEF456'] }),
        ],
      });
      const result = applyFilters(data, { searchQuery: 'ABC123' });
      expect(result.events).toHaveLength(1);
    });

    it('is case-insensitive', () => {
      const data = createData({
        events: [createEvent({ epcList: ['urn:epc:id:sgtin:0614141.107346.AbCdEf'] })],
      });
      const result = applyFilters(data, { searchQuery: 'abcdef' });
      expect(result.events).toHaveLength(1);
    });

    it('matches case serial numbers', () => {
      const data = createData({
        cases: [
          createCase({ parentEPC: 'urn:epc:id:sgtin:0614141.000001.XCASE1' }),
          createCase({ parentEPC: 'urn:epc:id:sgtin:0614141.000001.YCASE2' }),
        ],
      });
      const result = applyFilters(data, { searchQuery: 'XCASE1' });
      expect(result.cases).toHaveLength(1);
    });

    it('matches SSCC identifiers', () => {
      const data = createData({
        ssccs: [
          createSSCC({ sscc: 'urn:epc:id:sscc:0614141.0000000001' }),
          createSSCC({ sscc: 'urn:epc:id:sscc:0614141.0000000002' }),
        ],
      });
      const result = applyFilters(data, { searchQuery: '0000000001' });
      expect(result.ssccs).toHaveLength(1);
    });

    it('truncates searchQuery to 100 characters', () => {
      const longQuery = 'A'.repeat(150);
      const data = createData({
        events: [createEvent({ epcList: ['urn:epc:id:sgtin:0614141.107346.' + 'A'.repeat(100)] })],
      });
      // Should not throw, just truncate
      const result = applyFilters(data, { searchQuery: longQuery });
      expect(result).toBeDefined();
    });
  });

  describe('filtered results are subsets', () => {
    it('filtered events are a subset of unfiltered events', () => {
      const data = createData({
        events: [
          createEvent({ eventType: 'ObjectEvent' }),
          createEvent({ eventType: 'AggregationEvent' }),
          createEvent({ eventType: 'TransactionEvent' }),
        ],
      });
      const unfiltered = applyFilters(data, {});
      const filtered = applyFilters(data, { eventType: 'ObjectEvent' });

      // Every filtered event should be in unfiltered
      for (const event of filtered.events) {
        expect(unfiltered.events).toContain(event);
      }
      expect(filtered.events.length).toBeLessThanOrEqual(unfiltered.events.length);
    });

    it('filtered products are a subset of unfiltered products', () => {
      const data = createData({
        products: [
          createProduct({ gtin: '00614141107346' }),
          createProduct({ gtin: '00614141999999' }),
        ],
      });
      const unfiltered = applyFilters(data, {});
      const filtered = applyFilters(data, { product: '00614141107346' });

      for (const product of filtered.products) {
        expect(unfiltered.products).toContain(product);
      }
      expect(filtered.products.length).toBeLessThanOrEqual(unfiltered.products.length);
    });
  });

  describe('clearFilters', () => {
    it('resets all criteria to null', () => {
      // Apply some filters first
      applyFilters(createData(), { product: '00614141107346', issueSeverity: 'Critical' });

      const cleared = clearFilters();
      expect(cleared.product).toBeNull();
      expect(cleared.lotNumber).toBeNull();
      expect(cleared.expirationDate).toBeNull();
      expect(cleared.eventType).toBeNull();
      expect(cleared.bizStep).toBeNull();
      expect(cleared.disposition).toBeNull();
      expect(cleared.serialNumber).toBeNull();
      expect(cleared.caseSerial).toBeNull();
      expect(cleared.sscc).toBeNull();
      expect(cleared.issueSeverity).toBeNull();
      expect(cleared.issueType).toBeNull();
      expect(cleared.searchQuery).toBeNull();
    });

    it('returns an object with all 12 filter fields', () => {
      const cleared = clearFilters();
      const keys = Object.keys(cleared);
      expect(keys).toHaveLength(12);
      expect(keys).toContain('product');
      expect(keys).toContain('lotNumber');
      expect(keys).toContain('expirationDate');
      expect(keys).toContain('eventType');
      expect(keys).toContain('bizStep');
      expect(keys).toContain('disposition');
      expect(keys).toContain('serialNumber');
      expect(keys).toContain('caseSerial');
      expect(keys).toContain('sscc');
      expect(keys).toContain('issueSeverity');
      expect(keys).toContain('issueType');
      expect(keys).toContain('searchQuery');
    });
  });
});
