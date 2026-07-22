import { describe, it, expect } from 'vitest';
import { extractProducts } from '../../productExtractor.js';
import { extractAll, parseSGTIN } from '../../epcExtractor.js';

/**
 * Helper to build a minimal ParsedDocument
 */
function buildDoc({ events = [], masterData = {} } = {}) {
  return { header: null, sbdh: null, masterData, events, parseErrors: [] };
}

describe('extractProducts', () => {
  describe('basic extraction', () => {
    it('should return empty array when epcMap has no SGTINs', () => {
      const doc = buildDoc({ events: [] });
      const epcMap = { all: new Map(), bySGTIN: new Map(), bySSCC: new Map(), bySerial: new Map() };
      const result = extractProducts(doc, epcMap);
      expect(result).toEqual([]);
    });

    it('should return empty array when epcMap is null', () => {
      const doc = buildDoc();
      expect(extractProducts(doc, null)).toEqual([]);
    });

    it('should return one ProductInfo per distinct GTIN', () => {
      const events = [{
        eventType: 'ObjectEvent',
        action: 'ADD',
        bizStep: 'urn:epcglobal:cbv:bizstep:commissioning',
        epcList: [
          'urn:epc:id:sgtin:0383745.038009.100001',
          'urn:epc:id:sgtin:0383745.038009.100002',
          'urn:epc:id:sgtin:0383745.052100.200001',
        ],
        parentID: null,
        childEPCs: [],
        quantityList: [],
        ilmd: { lotNumber: 'LOT-A', expirationDate: '2026-01-01', additionalAttributes: {} },
      }];
      const doc = buildDoc({ events });
      const epcMap = extractAll(events);
      const result = extractProducts(doc, epcMap);

      expect(result).toHaveLength(2);
      const gtins = result.map(p => p.gtin);
      expect(gtins).toContain(parseSGTIN('urn:epc:id:sgtin:0383745.038009.100001').gtin);
      expect(gtins).toContain(parseSGTIN('urn:epc:id:sgtin:0383745.052100.200001').gtin);
    });
  });

  describe('serialCount', () => {
    it('should count distinct serial numbers per GTIN', () => {
      const events = [{
        eventType: 'ObjectEvent',
        action: 'ADD',
        bizStep: 'urn:epcglobal:cbv:bizstep:commissioning',
        epcList: [
          'urn:epc:id:sgtin:0383745.038009.100001',
          'urn:epc:id:sgtin:0383745.038009.100002',
          'urn:epc:id:sgtin:0383745.038009.100003',
        ],
        parentID: null,
        childEPCs: [],
        quantityList: [],
        ilmd: null,
      }];
      const doc = buildDoc({ events });
      const epcMap = extractAll(events);
      const result = extractProducts(doc, epcMap);

      expect(result).toHaveLength(1);
      expect(result[0].serialCount).toBe(3);
    });
  });

  describe('lotNumbers and expirationDates', () => {
    it('should extract lot numbers from ILMD in commissioning ObjectEvents', () => {
      const events = [{
        eventType: 'ObjectEvent',
        action: 'ADD',
        bizStep: 'urn:epcglobal:cbv:bizstep:commissioning',
        epcList: ['urn:epc:id:sgtin:0383745.038009.100001'],
        parentID: null,
        childEPCs: [],
        quantityList: [],
        ilmd: { lotNumber: 'LOT-ABC', expirationDate: '2025-12-31', additionalAttributes: {} },
      }];
      const doc = buildDoc({ events });
      const epcMap = extractAll(events);
      const result = extractProducts(doc, epcMap);

      expect(result[0].lotNumbers).toEqual(['LOT-ABC']);
      expect(result[0].expirationDates).toEqual(['2025-12-31']);
    });

    it('should not extract lot info from non-commissioning events', () => {
      const events = [{
        eventType: 'ObjectEvent',
        action: 'OBSERVE',
        bizStep: 'urn:epcglobal:cbv:bizstep:shipping',
        epcList: ['urn:epc:id:sgtin:0383745.038009.100001'],
        parentID: null,
        childEPCs: [],
        quantityList: [],
        ilmd: { lotNumber: 'LOT-SHIP', expirationDate: '2025-06-01', additionalAttributes: {} },
      }];
      const doc = buildDoc({ events });
      const epcMap = extractAll(events);
      const result = extractProducts(doc, epcMap);

      expect(result[0].lotNumbers).toEqual([]);
      expect(result[0].expirationDates).toEqual([]);
    });

    it('should not extract lot info from non-ADD action events', () => {
      const events = [{
        eventType: 'ObjectEvent',
        action: 'OBSERVE',
        bizStep: 'urn:epcglobal:cbv:bizstep:commissioning',
        epcList: ['urn:epc:id:sgtin:0383745.038009.100001'],
        parentID: null,
        childEPCs: [],
        quantityList: [],
        ilmd: { lotNumber: 'LOT-OBS', expirationDate: '2025-01-01', additionalAttributes: {} },
      }];
      const doc = buildDoc({ events });
      const epcMap = extractAll(events);
      const result = extractProducts(doc, epcMap);

      expect(result[0].lotNumbers).toEqual([]);
      expect(result[0].expirationDates).toEqual([]);
    });

    it('should deduplicate lot numbers and expiration dates', () => {
      const events = [
        {
          eventType: 'ObjectEvent',
          action: 'ADD',
          bizStep: 'urn:epcglobal:cbv:bizstep:commissioning',
          epcList: ['urn:epc:id:sgtin:0383745.038009.100001'],
          parentID: null,
          childEPCs: [],
          quantityList: [],
          ilmd: { lotNumber: 'LOT-A', expirationDate: '2025-12-31', additionalAttributes: {} },
        },
        {
          eventType: 'ObjectEvent',
          action: 'ADD',
          bizStep: 'urn:epcglobal:cbv:bizstep:commissioning',
          epcList: ['urn:epc:id:sgtin:0383745.038009.100002'],
          parentID: null,
          childEPCs: [],
          quantityList: [],
          ilmd: { lotNumber: 'LOT-A', expirationDate: '2025-12-31', additionalAttributes: {} },
        },
      ];
      const doc = buildDoc({ events });
      const epcMap = extractAll(events);
      const result = extractProducts(doc, epcMap);

      expect(result[0].lotNumbers).toEqual(['LOT-A']);
      expect(result[0].expirationDates).toEqual(['2025-12-31']);
    });
  });

  describe('caseCount', () => {
    it('should count cases from AggregationEvents with matching child GTINs', () => {
      const events = [
        {
          eventType: 'ObjectEvent',
          action: 'ADD',
          bizStep: 'urn:epcglobal:cbv:bizstep:commissioning',
          epcList: [
            'urn:epc:id:sgtin:0383745.038009.100001',
            'urn:epc:id:sgtin:0383745.038009.100002',
          ],
          parentID: null,
          childEPCs: [],
          quantityList: [],
          ilmd: null,
        },
        {
          eventType: 'AggregationEvent',
          action: 'ADD',
          bizStep: 'urn:epcglobal:cbv:bizstep:packing',
          epcList: [],
          parentID: 'urn:epc:id:sgtin:0383745.038009.900001',
          childEPCs: [
            'urn:epc:id:sgtin:0383745.038009.100001',
            'urn:epc:id:sgtin:0383745.038009.100002',
          ],
          quantityList: [],
          ilmd: null,
        },
      ];
      const doc = buildDoc({ events });
      const epcMap = extractAll(events);
      const result = extractProducts(doc, epcMap);

      expect(result[0].caseCount).toBe(1);
    });

    it('should not count cases from OBSERVE action aggregations', () => {
      const events = [
        {
          eventType: 'ObjectEvent',
          action: 'ADD',
          bizStep: 'urn:epcglobal:cbv:bizstep:commissioning',
          epcList: ['urn:epc:id:sgtin:0383745.038009.100001'],
          parentID: null,
          childEPCs: [],
          quantityList: [],
          ilmd: null,
        },
        {
          eventType: 'AggregationEvent',
          action: 'OBSERVE',
          bizStep: 'urn:epcglobal:cbv:bizstep:packing',
          epcList: [],
          parentID: 'urn:epc:id:sgtin:0383745.038009.900001',
          childEPCs: ['urn:epc:id:sgtin:0383745.038009.100001'],
          quantityList: [],
          ilmd: null,
        },
      ];
      const doc = buildDoc({ events });
      const epcMap = extractAll(events);
      const result = extractProducts(doc, epcMap);

      expect(result[0].caseCount).toBe(0);
    });
  });

  describe('ssccCount', () => {
    it('should count SSCCs from AggregationEvents with matching child GTINs', () => {
      const events = [
        {
          eventType: 'ObjectEvent',
          action: 'ADD',
          bizStep: 'urn:epcglobal:cbv:bizstep:commissioning',
          epcList: ['urn:epc:id:sgtin:0383745.038009.100001'],
          parentID: null,
          childEPCs: [],
          quantityList: [],
          ilmd: null,
        },
        {
          eventType: 'AggregationEvent',
          action: 'ADD',
          bizStep: 'urn:epcglobal:cbv:bizstep:packing',
          epcList: [],
          parentID: 'urn:epc:id:sscc:0383745.0000000100',
          childEPCs: ['urn:epc:id:sgtin:0383745.038009.100001'],
          quantityList: [],
          ilmd: null,
        },
      ];
      const doc = buildDoc({ events });
      const epcMap = extractAll(events);
      const result = extractProducts(doc, epcMap);

      expect(result[0].ssccCount).toBe(1);
    });

    it('should count SSCCs via nested cases', () => {
      const events = [
        {
          eventType: 'ObjectEvent',
          action: 'ADD',
          bizStep: 'urn:epcglobal:cbv:bizstep:commissioning',
          epcList: ['urn:epc:id:sgtin:0383745.038009.100001'],
          parentID: null,
          childEPCs: [],
          quantityList: [],
          ilmd: null,
        },
        // Case containing the product
        {
          eventType: 'AggregationEvent',
          action: 'ADD',
          bizStep: 'urn:epcglobal:cbv:bizstep:packing',
          epcList: [],
          parentID: 'urn:epc:id:sgtin:0383745.038009.900001',
          childEPCs: ['urn:epc:id:sgtin:0383745.038009.100001'],
          quantityList: [],
          ilmd: null,
        },
        // SSCC pallet containing the case
        {
          eventType: 'AggregationEvent',
          action: 'ADD',
          bizStep: 'urn:epcglobal:cbv:bizstep:packing',
          epcList: [],
          parentID: 'urn:epc:id:sscc:0383745.0000000100',
          childEPCs: ['urn:epc:id:sgtin:0383745.038009.900001'],
          quantityList: [],
          ilmd: null,
        },
      ];
      const doc = buildDoc({ events });
      const epcMap = extractAll(events);
      const result = extractProducts(doc, epcMap);

      expect(result[0].ssccCount).toBe(1);
    });
  });

  describe('master data extraction', () => {
    it('should extract product name from master data', () => {
      const events = [{
        eventType: 'ObjectEvent',
        action: 'ADD',
        bizStep: 'urn:epcglobal:cbv:bizstep:commissioning',
        epcList: ['urn:epc:id:sgtin:0383745.038009.100001'],
        parentID: null,
        childEPCs: [],
        quantityList: [],
        ilmd: null,
      }];
      const masterData = {
        'urn:epc:idpat:sgtin:0383745.038009.*': {
          id: 'urn:epc:idpat:sgtin:0383745.038009.*',
          type: 'urn:epcglobal:epcis:vtype:EPCClass',
          attributes: {
            'urn:epcglobal:cbv:mda#descriptionShort': 'Aspirin 100mg Tablets',
            'urn:epcglobal:cbv:mda#gtin': '00383745380099',
            'urn:epcglobal:cbv:mda#ndc': '38374-538-00',
          },
        },
      };
      const doc = buildDoc({ events, masterData });
      const epcMap = extractAll(events);
      const result = extractProducts(doc, epcMap);

      expect(result[0].productName).toBe('Aspirin 100mg Tablets');
      expect(result[0].ndc).toBe('38374-538-00');
    });

    it('should return null productName when no master data exists', () => {
      const events = [{
        eventType: 'ObjectEvent',
        action: 'ADD',
        bizStep: 'urn:epcglobal:cbv:bizstep:commissioning',
        epcList: ['urn:epc:id:sgtin:0383745.038009.100001'],
        parentID: null,
        childEPCs: [],
        quantityList: [],
        ilmd: null,
      }];
      const doc = buildDoc({ events });
      const epcMap = extractAll(events);
      const result = extractProducts(doc, epcMap);

      expect(result[0].productName).toBeNull();
    });
  });

  describe('sgtinPattern', () => {
    it('should build correct SGTIN pattern from company prefix and item reference', () => {
      const events = [{
        eventType: 'ObjectEvent',
        action: 'ADD',
        bizStep: 'urn:epcglobal:cbv:bizstep:commissioning',
        epcList: ['urn:epc:id:sgtin:0383745.038009.100001'],
        parentID: null,
        childEPCs: [],
        quantityList: [],
        ilmd: null,
      }];
      const doc = buildDoc({ events });
      const epcMap = extractAll(events);
      const result = extractProducts(doc, epcMap);

      expect(result[0].sgtinPattern).toBe('urn:epc:id:sgtin:0383745.038009.*');
    });
  });
});
