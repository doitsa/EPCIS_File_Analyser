import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { extractAll } from '../../epcExtractor.js';
import { analyzeCases } from '../../aggregationAnalyzer.js';

/**
 * Property tests for Dashboard Metric Accuracy
 * Validates: Requirements 2.1, 2.2, 2.4, 2.9
 *
 * For any parsed EPCIS document, the computed dashboard metrics should satisfy:
 * - totalUniqueSerials = count of distinct EPC URIs across all events (SGTIN only, excluding SSCCs)
 * - totalCases = count of distinct parentIDs from AggregationEvents with action ADD
 * - totalProducts = count of distinct GTINs extracted from SGTIN URIs
 * - totalSSCCs = count of distinct SSCC URIs found across all event fields
 */

// --- Generators ---

/**
 * Generate a valid SGTIN URI with a given company prefix length (6-12).
 * CompanyPrefix + ItemReference must total 13 digits.
 */
const sgtinUriArb = fc
  .integer({ min: 6, max: 12 })
  .chain((prefixLen) => {
    const itemRefLen = 13 - prefixLen;
    return fc.tuple(
      fc.stringOf(
        fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'),
        { minLength: prefixLen, maxLength: prefixLen }
      ),
      fc.stringOf(
        fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'),
        { minLength: itemRefLen, maxLength: itemRefLen }
      ),
      fc.stringOf(
        fc.constantFrom(...'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')),
        { minLength: 1, maxLength: 12 }
      )
    );
  })
  .map(([cp, ir, serial]) => `urn:epc:id:sgtin:${cp}.${ir}.${serial}`);

/**
 * Generate a valid SSCC URI.
 * CompanyPrefix + SerialRef must total 17 digits.
 */
const ssccUriArb = fc
  .integer({ min: 6, max: 12 })
  .chain((prefixLen) => {
    const serialRefLen = 17 - prefixLen;
    return fc.tuple(
      fc.stringOf(
        fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'),
        { minLength: prefixLen, maxLength: prefixLen }
      ),
      fc.stringOf(
        fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'),
        { minLength: serialRefLen, maxLength: serialRefLen }
      )
    );
  })
  .map(([cp, serialRef]) => `urn:epc:id:sscc:${cp}.${serialRef}`);

/**
 * Generate an ObjectEvent with SGTIN EPCs in epcList.
 */
const objectEventArb = fc
  .array(sgtinUriArb, { minLength: 1, maxLength: 5 })
  .map((epcs) => ({
    eventType: 'ObjectEvent',
    action: 'ADD',
    bizStep: 'urn:epcglobal:cbv:bizstep:commissioning',
    eventTime: '2024-01-01T00:00:00Z',
    epcList: epcs,
  }));

/**
 * Generate an AggregationEvent with action ADD, an SSCC parentID, and SGTIN children.
 */
const aggregationEventArb = fc
  .tuple(
    ssccUriArb,
    fc.array(sgtinUriArb, { minLength: 0, maxLength: 5 })
  )
  .map(([parentID, childEPCs]) => ({
    eventType: 'AggregationEvent',
    action: 'ADD',
    bizStep: 'urn:epcglobal:cbv:bizstep:packing',
    eventTime: '2024-01-02T00:00:00Z',
    parentID,
    childEPCs,
    epcList: [],
  }));

/**
 * Generate a mixed set of events (ObjectEvents + AggregationEvents).
 */
const eventsArb = fc.tuple(
  fc.array(objectEventArb, { minLength: 1, maxLength: 4 }),
  fc.array(aggregationEventArb, { minLength: 1, maxLength: 4 })
).map(([objEvents, aggEvents]) => [...objEvents, ...aggEvents]);

describe('Feature: epcis-file-analyzer, Property 15: Dashboard Metric Accuracy', () => {
  /**
   * Validates: Requirements 2.1, 2.2, 2.4, 2.9
   */
  it('totalProducts equals the count of distinct GTINs from SGTIN URIs', () => {
    fc.assert(
      fc.property(eventsArb, (events) => {
        const epcMap = extractAll(events);

        // totalProducts = number of distinct GTINs (bySGTIN keys)
        const totalProducts = epcMap.bySGTIN.size;

        // Independently compute: collect all distinct GTINs from all entries in the map
        const gtins = new Set();
        for (const [, parsed] of epcMap.all) {
          if (parsed.type === 'sgtin' && parsed.gtin) {
            gtins.add(parsed.gtin);
          }
        }

        expect(totalProducts).toBe(gtins.size);
      }),
      { numRuns: 100 }
    );
  });

  it('totalSSCCs equals the count of distinct SSCC URIs found across all event fields', () => {
    fc.assert(
      fc.property(eventsArb, (events) => {
        const epcMap = extractAll(events);

        // totalSSCCs = number of distinct SSCC URIs (bySSCC keys)
        const totalSSCCs = epcMap.bySSCC.size;

        // Independently compute: count SSCC-type entries in all
        const ssccs = new Set();
        for (const [uri, parsed] of epcMap.all) {
          if (parsed.type === 'sscc') {
            ssccs.add(uri);
          }
        }

        expect(totalSSCCs).toBe(ssccs.size);
      }),
      { numRuns: 100 }
    );
  });

  it('totalUniqueSerials equals the count of SGTIN-type entries in the all map (excluding SSCCs)', () => {
    fc.assert(
      fc.property(eventsArb, (events) => {
        const epcMap = extractAll(events);

        // totalUniqueSerials = count of distinct SGTIN URIs in the all map (excluding SSCCs)
        let sgtinCount = 0;
        for (const [, parsed] of epcMap.all) {
          if (parsed.type === 'sgtin') {
            sgtinCount++;
          }
        }

        // Independently count distinct SGTIN URIs from events
        const sgtinUris = new Set();
        for (const event of events) {
          const uris = [];
          if (event.epcList) uris.push(...event.epcList);
          if (event.parentID) uris.push(event.parentID);
          if (event.childEPCs) uris.push(...event.childEPCs);
          for (const uri of uris) {
            if (uri && uri.startsWith('urn:epc:id:sgtin:')) {
              sgtinUris.add(uri);
            }
          }
        }

        // Only valid SGTINs are counted (prefix+itemRef must total 13 digits)
        // So sgtinCount may be <= sgtinUris.size if some URIs are malformed
        // But our generator always produces valid SGTINs, so they should be equal
        expect(sgtinCount).toBe(sgtinUris.size);
      }),
      { numRuns: 100 }
    );
  });

  it('totalCases equals the count of AggregationEvent ADD events from analyzeCases', () => {
    fc.assert(
      fc.property(eventsArb, (events) => {
        const epcMap = extractAll(events);

        // Create a minimal doc structure that analyzeCases expects
        const doc = { events };

        const aggregationResult = analyzeCases(doc, epcMap);

        // totalCases = aggregationResult.cases.length
        const totalCases = aggregationResult.cases.length;

        // Independently count AggregationEvent ADD events
        const aggAddCount = events.filter(
          (e) => e.eventType === 'AggregationEvent' && e.action === 'ADD'
        ).length;

        expect(totalCases).toBe(aggAddCount);
      }),
      { numRuns: 100 }
    );
  });
});
