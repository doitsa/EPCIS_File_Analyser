import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { extractProducts } from '../../productExtractor.js';
import { extractAll } from '../../epcExtractor.js';

/**
 * Feature: epcis-file-analyzer, Property 16: Product Extraction Completeness
 *
 * For any set of EPCIS events containing SGTIN URIs, the product extractor should
 * produce exactly one ProductInfo entry per distinct GTIN, where the serialCount
 * for each product equals the number of distinct serial numbers sharing that GTIN
 * across all events.
 *
 * Validates: Requirements 4.1, 4.3
 */

/**
 * Generator for a valid GS1 company prefix (6-12 digits).
 * We use fixed lengths to ensure companyPrefix + itemReference = 13 digits.
 */
const companyPrefixLengths = [6, 7, 8, 9, 10, 11, 12];

/**
 * Generate a valid SGTIN URI with a specific company prefix and item reference.
 * Ensures companyPrefix + itemReference = 13 digits.
 */
function sgtinUriArb() {
  return fc.record({
    prefixLength: fc.constantFrom(...companyPrefixLengths),
    serial: fc.stringOf(fc.constantFrom(...'0123456789abcdef'), { minLength: 1, maxLength: 12 }),
  }).chain(({ prefixLength, serial }) => {
    const itemRefLength = 13 - prefixLength;
    return fc.record({
      companyPrefix: fc.stringOf(fc.constantFrom(...'0123456789'), { minLength: prefixLength, maxLength: prefixLength }),
      itemReference: fc.stringOf(fc.constantFrom(...'0123456789'), { minLength: itemRefLength, maxLength: itemRefLength }),
      serial: fc.constant(serial),
    });
  }).map(({ companyPrefix, itemReference, serial }) => {
    // Item reference first digit is the indicator digit (0-9)
    return `urn:epc:id:sgtin:${companyPrefix}.${itemReference}.${serial}`;
  });
}

/**
 * Generate a set of SGTIN URIs from a fixed pool of company prefix + item reference
 * combos (representing distinct GTINs) with varying serial numbers.
 */
function sgtinEventsArb() {
  // Generate 1-5 distinct products (company prefix + item reference pairs)
  return fc.integer({ min: 1, max: 5 }).chain((numProducts) => {
    // For each product, pick a fixed prefix length and generate prefix + itemRef
    const productArbs = Array.from({ length: numProducts }, () =>
      fc.constantFrom(...companyPrefixLengths).chain((prefixLength) => {
        const itemRefLength = 13 - prefixLength;
        return fc.record({
          companyPrefix: fc.stringOf(fc.constantFrom(...'0123456789'), { minLength: prefixLength, maxLength: prefixLength }),
          itemReference: fc.stringOf(fc.constantFrom(...'0123456789'), { minLength: itemRefLength, maxLength: itemRefLength }),
          // 1-10 distinct serials per product
          serials: fc.uniqueArray(
            fc.stringOf(fc.constantFrom(...'0123456789abcdef'), { minLength: 1, maxLength: 10 }),
            { minLength: 1, maxLength: 10 }
          ),
        });
      })
    );

    return fc.tuple(...productArbs);
  });
}

/**
 * Build events containing the given SGTIN URIs distributed across 1 or more events.
 */
function buildEventsFromProducts(products) {
  const events = [];
  for (const product of products) {
    const { companyPrefix, itemReference, serials } = product;
    // Put all serials for this product in one or more events
    const epcList = serials.map(
      (serial) => `urn:epc:id:sgtin:${companyPrefix}.${itemReference}.${serial}`
    );
    events.push({
      eventType: 'ObjectEvent',
      action: 'ADD',
      bizStep: 'urn:epcglobal:cbv:bizstep:commissioning',
      epcList,
      parentID: null,
      childEPCs: [],
      quantityList: [],
      ilmd: null,
    });
  }
  return events;
}

describe('Property 16: Product Extraction Completeness', () => {
  it('should produce exactly one ProductInfo per distinct GTIN with correct serialCount', () => {
    fc.assert(
      fc.property(
        sgtinEventsArb(),
        (products) => {
          const events = buildEventsFromProducts(products);
          const doc = { masterData: {}, events, header: null, sbdh: null, parseErrors: [] };
          const epcMap = extractAll(events);
          const result = extractProducts(doc, epcMap);

          // Calculate expected distinct GTINs
          // Two products may collide if they have the same companyPrefix + itemReference
          const gtinToSerials = new Map();
          for (const product of products) {
            const { companyPrefix, itemReference, serials } = product;
            // Compute the GTIN the same way epcExtractor does
            const indicator = itemReference[0];
            const gtinBase = indicator + companyPrefix + itemReference.substring(1);
            // GS1 check digit
            let sum = 0;
            const len = gtinBase.length;
            for (let i = 0; i < len; i++) {
              const digit = parseInt(gtinBase[i], 10);
              const multiplier = (len - i) % 2 === 0 ? 1 : 3;
              sum += digit * multiplier;
            }
            const checkDigit = (10 - (sum % 10)) % 10;
            const gtin = gtinBase + checkDigit;

            if (!gtinToSerials.has(gtin)) {
              gtinToSerials.set(gtin, new Set());
            }
            for (const serial of serials) {
              gtinToSerials.get(gtin).add(serial);
            }
          }

          // Assert: one ProductInfo per distinct GTIN
          expect(result.length).toBe(gtinToSerials.size);

          // Assert: serialCount matches distinct serial count for each GTIN
          for (const productInfo of result) {
            const expectedSerials = gtinToSerials.get(productInfo.gtin);
            expect(expectedSerials).toBeDefined();
            expect(productInfo.serialCount).toBe(expectedSerials.size);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should produce zero products when events have no SGTIN URIs', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({
          eventType: fc.constant('ObjectEvent'),
          action: fc.constant('ADD'),
          bizStep: fc.constant('urn:epcglobal:cbv:bizstep:commissioning'),
          epcList: fc.constant([]),
          parentID: fc.constant(null),
          childEPCs: fc.constant([]),
          quantityList: fc.constant([]),
          ilmd: fc.constant(null),
        }), { minLength: 0, maxLength: 5 }),
        (events) => {
          const doc = { masterData: {}, events, header: null, sbdh: null, parseErrors: [] };
          const epcMap = extractAll(events);
          const result = extractProducts(doc, epcMap);
          expect(result.length).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should correctly count serials when same GTIN appears across multiple events', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...companyPrefixLengths).chain((prefixLength) => {
          const itemRefLength = 13 - prefixLength;
          return fc.record({
            companyPrefix: fc.stringOf(fc.constantFrom(...'0123456789'), { minLength: prefixLength, maxLength: prefixLength }),
            itemReference: fc.stringOf(fc.constantFrom(...'0123456789'), { minLength: itemRefLength, maxLength: itemRefLength }),
            // Two sets of serials to spread across different events
            serials1: fc.uniqueArray(
              fc.stringOf(fc.constantFrom(...'0123456789'), { minLength: 1, maxLength: 8 }),
              { minLength: 1, maxLength: 5 }
            ),
            serials2: fc.uniqueArray(
              fc.stringOf(fc.constantFrom(...'0123456789'), { minLength: 1, maxLength: 8 }),
              { minLength: 1, maxLength: 5 }
            ),
          });
        }),
        ({ companyPrefix, itemReference, serials1, serials2 }) => {
          // Create two events with possibly overlapping serials for the same product
          const event1 = {
            eventType: 'ObjectEvent',
            action: 'ADD',
            bizStep: 'urn:epcglobal:cbv:bizstep:commissioning',
            epcList: serials1.map(s => `urn:epc:id:sgtin:${companyPrefix}.${itemReference}.${s}`),
            parentID: null,
            childEPCs: [],
            quantityList: [],
            ilmd: null,
          };
          const event2 = {
            eventType: 'ObjectEvent',
            action: 'OBSERVE',
            bizStep: 'urn:epcglobal:cbv:bizstep:shipping',
            epcList: serials2.map(s => `urn:epc:id:sgtin:${companyPrefix}.${itemReference}.${s}`),
            parentID: null,
            childEPCs: [],
            quantityList: [],
            ilmd: null,
          };

          const events = [event1, event2];
          const doc = { masterData: {}, events, header: null, sbdh: null, parseErrors: [] };
          const epcMap = extractAll(events);
          const result = extractProducts(doc, epcMap);

          // Should produce exactly one product
          expect(result.length).toBe(1);

          // Serial count should be the distinct serials across both events
          const allDistinctSerials = new Set([...serials1, ...serials2]);
          expect(result[0].serialCount).toBe(allDistinctSerials.size);
        }
      ),
      { numRuns: 100 }
    );
  });
});
