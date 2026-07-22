import { describe, it, expect } from 'vitest';
import { extractLotExpiration } from '../../lotExpirationExtractor.js';

describe('lotExpirationExtractor', () => {
  describe('extractLotExpiration', () => {
    it('should extract lot numbers and expiration dates grouped by GTIN', () => {
      const doc = {
        events: [
          {
            eventType: 'ObjectEvent',
            action: 'ADD',
            epcList: [
              'urn:epc:id:sgtin:0383745.038009.100001',
              'urn:epc:id:sgtin:0383745.038009.100002',
            ],
            childEPCs: [],
            quantityList: [],
            ilmd: {
              lotNumber: 'LOT-A2024-001',
              expirationDate: '2025-12-31',
              additionalAttributes: {},
            },
          },
        ],
      };

      const result = extractLotExpiration(doc);

      // GTIN for 0383745.038009 = computeGTIN('0383745', '038009') = 00383745380099
      expect(result.lotsByProduct['00383745380099']).toEqual(['LOT-A2024-001']);
      expect(result.expirationsByProduct['00383745380099']).toEqual(['2025-12-31']);
    });

    it('should return unique lot numbers per GTIN', () => {
      const doc = {
        events: [
          {
            eventType: 'ObjectEvent',
            action: 'ADD',
            epcList: ['urn:epc:id:sgtin:0383745.038009.100001'],
            childEPCs: [],
            quantityList: [],
            ilmd: {
              lotNumber: 'LOT-A',
              expirationDate: '2025-06-30',
              additionalAttributes: {},
            },
          },
          {
            eventType: 'ObjectEvent',
            action: 'ADD',
            epcList: ['urn:epc:id:sgtin:0383745.038009.100002'],
            childEPCs: [],
            quantityList: [],
            ilmd: {
              lotNumber: 'LOT-A',
              expirationDate: '2025-06-30',
              additionalAttributes: {},
            },
          },
        ],
      };

      const result = extractLotExpiration(doc);

      expect(result.lotsByProduct['00383745380099']).toEqual(['LOT-A']);
      expect(result.expirationsByProduct['00383745380099']).toEqual(['2025-06-30']);
    });

    it('should handle multiple lots for the same GTIN', () => {
      const doc = {
        events: [
          {
            eventType: 'ObjectEvent',
            action: 'ADD',
            epcList: ['urn:epc:id:sgtin:0383745.038009.100001'],
            childEPCs: [],
            quantityList: [],
            ilmd: {
              lotNumber: 'LOT-A',
              expirationDate: '2025-06-30',
              additionalAttributes: {},
            },
          },
          {
            eventType: 'ObjectEvent',
            action: 'ADD',
            epcList: ['urn:epc:id:sgtin:0383745.038009.100002'],
            childEPCs: [],
            quantityList: [],
            ilmd: {
              lotNumber: 'LOT-B',
              expirationDate: '2026-01-15',
              additionalAttributes: {},
            },
          },
        ],
      };

      const result = extractLotExpiration(doc);

      expect(result.lotsByProduct['00383745380099']).toContain('LOT-A');
      expect(result.lotsByProduct['00383745380099']).toContain('LOT-B');
      expect(result.expirationsByProduct['00383745380099']).toContain('2025-06-30');
      expect(result.expirationsByProduct['00383745380099']).toContain('2026-01-15');
    });

    it('should handle multiple GTINs across events', () => {
      const doc = {
        events: [
          {
            eventType: 'ObjectEvent',
            action: 'ADD',
            epcList: ['urn:epc:id:sgtin:0383745.038009.100001'],
            childEPCs: [],
            quantityList: [],
            ilmd: {
              lotNumber: 'LOT-A',
              expirationDate: '2025-06-30',
              additionalAttributes: {},
            },
          },
          {
            eventType: 'ObjectEvent',
            action: 'ADD',
            epcList: ['urn:epc:id:sgtin:0614141.071234.200001'],
            childEPCs: [],
            quantityList: [],
            ilmd: {
              lotNumber: 'LOT-X',
              expirationDate: '2026-03-15',
              additionalAttributes: {},
            },
          },
        ],
      };

      const result = extractLotExpiration(doc);

      expect(result.lotsByProduct['00383745380099']).toEqual(['LOT-A']);
      // GTIN for 0614141.071234 = computeGTIN('0614141', '071234')
      // indicator=0, base=0+0614141+71234 = 0061414171234, check digit
      expect(Object.keys(result.lotsByProduct)).toHaveLength(2);
      expect(Object.keys(result.expirationsByProduct)).toHaveLength(2);
    });

    it('should handle event with ILMD but missing lot number', () => {
      const doc = {
        events: [
          {
            eventType: 'ObjectEvent',
            action: 'ADD',
            epcList: ['urn:epc:id:sgtin:0383745.038009.100001'],
            childEPCs: [],
            quantityList: [],
            ilmd: {
              lotNumber: null,
              expirationDate: '2025-12-31',
              additionalAttributes: {},
            },
          },
        ],
      };

      const result = extractLotExpiration(doc);

      expect(result.lotsByProduct['00383745380099']).toBeUndefined();
      expect(result.expirationsByProduct['00383745380099']).toEqual(['2025-12-31']);
    });

    it('should handle event with ILMD but missing expiration date', () => {
      const doc = {
        events: [
          {
            eventType: 'ObjectEvent',
            action: 'ADD',
            epcList: ['urn:epc:id:sgtin:0383745.038009.100001'],
            childEPCs: [],
            quantityList: [],
            ilmd: {
              lotNumber: 'LOT-A',
              expirationDate: null,
              additionalAttributes: {},
            },
          },
        ],
      };

      const result = extractLotExpiration(doc);

      expect(result.lotsByProduct['00383745380099']).toEqual(['LOT-A']);
      expect(result.expirationsByProduct['00383745380099']).toBeUndefined();
    });

    it('should skip events without ILMD data', () => {
      const doc = {
        events: [
          {
            eventType: 'ObjectEvent',
            action: 'OBSERVE',
            epcList: ['urn:epc:id:sgtin:0383745.038009.100001'],
            childEPCs: [],
            quantityList: [],
            ilmd: null,
          },
        ],
      };

      const result = extractLotExpiration(doc);

      expect(result.lotsByProduct).toEqual({});
      expect(result.expirationsByProduct).toEqual({});
    });

    it('should skip events with ILMD but both lot and expiration are null', () => {
      const doc = {
        events: [
          {
            eventType: 'ObjectEvent',
            action: 'ADD',
            epcList: ['urn:epc:id:sgtin:0383745.038009.100001'],
            childEPCs: [],
            quantityList: [],
            ilmd: {
              lotNumber: null,
              expirationDate: null,
              additionalAttributes: {},
            },
          },
        ],
      };

      const result = extractLotExpiration(doc);

      expect(result.lotsByProduct).toEqual({});
      expect(result.expirationsByProduct).toEqual({});
    });

    it('should skip events with no parseable SGTIN EPCs', () => {
      const doc = {
        events: [
          {
            eventType: 'ObjectEvent',
            action: 'ADD',
            epcList: ['urn:epc:id:sscc:0383745.0000000001'],
            childEPCs: [],
            quantityList: [],
            ilmd: {
              lotNumber: 'LOT-A',
              expirationDate: '2025-12-31',
              additionalAttributes: {},
            },
          },
        ],
      };

      const result = extractLotExpiration(doc);

      expect(result.lotsByProduct).toEqual({});
      expect(result.expirationsByProduct).toEqual({});
    });

    it('should handle null doc gracefully', () => {
      const result = extractLotExpiration(null);
      expect(result.lotsByProduct).toEqual({});
      expect(result.expirationsByProduct).toEqual({});
    });

    it('should handle doc with no events', () => {
      const result = extractLotExpiration({ events: [] });
      expect(result.lotsByProduct).toEqual({});
      expect(result.expirationsByProduct).toEqual({});
    });

    it('should handle doc with undefined events', () => {
      const result = extractLotExpiration({ events: undefined });
      expect(result.lotsByProduct).toEqual({});
      expect(result.expirationsByProduct).toEqual({});
    });

    it('should extract GTINs from childEPCs when epcList is empty', () => {
      const doc = {
        events: [
          {
            eventType: 'AggregationEvent',
            action: 'ADD',
            epcList: [],
            childEPCs: [
              'urn:epc:id:sgtin:0383745.038009.100001',
              'urn:epc:id:sgtin:0383745.038009.100002',
            ],
            quantityList: [],
            ilmd: {
              lotNumber: 'LOT-CHILD',
              expirationDate: '2026-05-01',
              additionalAttributes: {},
            },
          },
        ],
      };

      const result = extractLotExpiration(doc);

      expect(result.lotsByProduct['00383745380099']).toEqual(['LOT-CHILD']);
      expect(result.expirationsByProduct['00383745380099']).toEqual(['2026-05-01']);
    });

    it('should handle events with empty epcList and no childEPCs', () => {
      const doc = {
        events: [
          {
            eventType: 'ObjectEvent',
            action: 'ADD',
            epcList: [],
            childEPCs: [],
            quantityList: [],
            ilmd: {
              lotNumber: 'LOT-ORPHAN',
              expirationDate: '2025-01-01',
              additionalAttributes: {},
            },
          },
        ],
      };

      const result = extractLotExpiration(doc);

      expect(result.lotsByProduct).toEqual({});
      expect(result.expirationsByProduct).toEqual({});
    });
  });
});
