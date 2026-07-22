import { describe, it, expect } from 'vitest';
import { extractSSCCs } from '../../ssccExtractor.js';

describe('ssccExtractor', () => {
  describe('extractSSCCs', () => {
    it('should return empty array when doc is null or has no events', () => {
      expect(extractSSCCs(null)).toEqual([]);
      expect(extractSSCCs({})).toEqual([]);
      expect(extractSSCCs({ events: [] })).toEqual([]);
    });

    it('should detect SSCC in parentID field', () => {
      const doc = {
        events: [
          {
            eventType: 'AggregationEvent',
            eventTime: '2024-02-20T10:00:00.000Z',
            action: 'ADD',
            bizStep: 'urn:epcglobal:cbv:bizstep:packing',
            disposition: 'urn:epcglobal:cbv:disp:container_closed',
            parentID: 'urn:epc:id:sscc:0383745.0000000100',
            childEPCs: [
              'urn:epc:id:sgtin:0383745.038009.200001',
              'urn:epc:id:sgtin:0383745.038009.200002',
            ],
            epcList: [],
            sourceList: [],
            destinationList: [],
            bizTransactionList: [],
          },
        ],
      };

      const result = extractSSCCs(doc);
      expect(result).toHaveLength(1);
      expect(result[0].sscc).toBe('urn:epc:id:sscc:0383745.0000000100');
      expect(result[0].eventCount).toBe(1);
      expect(result[0].roles).toContain('parentID');
      expect(result[0].childEPCs).toEqual([
        'urn:epc:id:sgtin:0383745.038009.200001',
        'urn:epc:id:sgtin:0383745.038009.200002',
      ]);
      expect(result[0].associatedProducts).toContain('00383745380096');
      expect(result[0].events).toHaveLength(1);
      expect(result[0].events[0].role).toBe('parentID');
      expect(result[0].events[0].eventType).toBe('AggregationEvent');
    });

    it('should detect SSCC in epcList field', () => {
      const doc = {
        events: [
          {
            eventType: 'ObjectEvent',
            eventTime: '2024-02-20T14:00:00.000Z',
            action: 'OBSERVE',
            bizStep: 'urn:epcglobal:cbv:bizstep:shipping',
            disposition: 'urn:epcglobal:cbv:disp:in_transit',
            parentID: null,
            epcList: ['urn:epc:id:sscc:0383745.0000000100'],
            childEPCs: [],
            sourceList: [],
            destinationList: [],
            bizTransactionList: [],
          },
        ],
      };

      const result = extractSSCCs(doc);
      expect(result).toHaveLength(1);
      expect(result[0].sscc).toBe('urn:epc:id:sscc:0383745.0000000100');
      expect(result[0].roles).toContain('epcList');
    });

    it('should detect SSCC in childEPCs field', () => {
      const doc = {
        events: [
          {
            eventType: 'AggregationEvent',
            eventTime: '2024-02-20T11:00:00.000Z',
            action: 'ADD',
            bizStep: 'urn:epcglobal:cbv:bizstep:packing',
            disposition: null,
            parentID: 'urn:epc:id:sscc:0383745.0000000200',
            childEPCs: ['urn:epc:id:sscc:0383745.0000000100'],
            epcList: [],
            sourceList: [],
            destinationList: [],
            bizTransactionList: [],
          },
        ],
      };

      const result = extractSSCCs(doc);
      // Should detect both the parent SSCC and the child SSCC
      expect(result).toHaveLength(2);

      const parentSSCC = result.find(s => s.sscc === 'urn:epc:id:sscc:0383745.0000000200');
      const childSSCC = result.find(s => s.sscc === 'urn:epc:id:sscc:0383745.0000000100');

      expect(parentSSCC).toBeDefined();
      expect(parentSSCC.roles).toContain('parentID');

      expect(childSSCC).toBeDefined();
      expect(childSSCC.roles).toContain('childEPC');
    });

    it('should detect SSCC in sourceList values', () => {
      const doc = {
        events: [
          {
            eventType: 'ObjectEvent',
            eventTime: '2024-02-20T14:00:00.000Z',
            action: 'OBSERVE',
            bizStep: 'urn:epcglobal:cbv:bizstep:shipping',
            disposition: null,
            parentID: null,
            epcList: [],
            childEPCs: [],
            sourceList: [
              { type: 'urn:epcglobal:cbv:sdt:possessing_party', value: 'urn:epc:id:sscc:0383745.0000000100' },
            ],
            destinationList: [],
            bizTransactionList: [],
          },
        ],
      };

      const result = extractSSCCs(doc);
      expect(result).toHaveLength(1);
      expect(result[0].roles).toContain('source');
    });

    it('should detect SSCC in destinationList values', () => {
      const doc = {
        events: [
          {
            eventType: 'ObjectEvent',
            eventTime: '2024-02-20T14:00:00.000Z',
            action: 'OBSERVE',
            bizStep: null,
            disposition: null,
            parentID: null,
            epcList: [],
            childEPCs: [],
            sourceList: [],
            destinationList: [
              { type: 'urn:epcglobal:cbv:sdt:owning_party', value: 'urn:epc:id:sscc:0383745.0000000100' },
            ],
            bizTransactionList: [],
          },
        ],
      };

      const result = extractSSCCs(doc);
      expect(result).toHaveLength(1);
      expect(result[0].roles).toContain('destination');
    });

    it('should detect SSCC in bizTransactionList as shipmentIdentifier', () => {
      const doc = {
        events: [
          {
            eventType: 'TransactionEvent',
            eventTime: '2024-02-21T10:00:00.000Z',
            action: 'ADD',
            bizStep: 'urn:epcglobal:cbv:bizstep:shipping',
            disposition: null,
            parentID: null,
            epcList: [],
            childEPCs: [],
            sourceList: [],
            destinationList: [],
            bizTransactionList: [
              { type: 'urn:epcglobal:cbv:btt:desadv', value: 'urn:epc:id:sscc:0383745.0000000100' },
            ],
          },
        ],
      };

      const result = extractSSCCs(doc);
      expect(result).toHaveLength(1);
      expect(result[0].roles).toContain('shipmentIdentifier');
    });

    it('should track multiple roles for the same SSCC across events', () => {
      const doc = {
        events: [
          {
            eventType: 'AggregationEvent',
            eventTime: '2024-02-20T11:00:00.000Z',
            action: 'ADD',
            bizStep: 'urn:epcglobal:cbv:bizstep:packing',
            disposition: null,
            parentID: 'urn:epc:id:sscc:0383745.0000000100',
            childEPCs: ['urn:epc:id:sgtin:0383745.038009.200001'],
            epcList: [],
            sourceList: [],
            destinationList: [],
            bizTransactionList: [],
          },
          {
            eventType: 'ObjectEvent',
            eventTime: '2024-02-20T14:00:00.000Z',
            action: 'OBSERVE',
            bizStep: 'urn:epcglobal:cbv:bizstep:shipping',
            disposition: 'urn:epcglobal:cbv:disp:in_transit',
            parentID: null,
            epcList: ['urn:epc:id:sscc:0383745.0000000100'],
            childEPCs: [],
            sourceList: [],
            destinationList: [],
            bizTransactionList: [],
          },
        ],
      };

      const result = extractSSCCs(doc);
      expect(result).toHaveLength(1);
      expect(result[0].eventCount).toBe(2);
      expect(result[0].roles).toContain('parentID');
      expect(result[0].roles).toContain('epcList');
      expect(result[0].events).toHaveLength(2);
    });

    it('should derive associated products from child EPCs', () => {
      const doc = {
        events: [
          {
            eventType: 'AggregationEvent',
            eventTime: '2024-02-20T11:00:00.000Z',
            action: 'ADD',
            bizStep: 'urn:epcglobal:cbv:bizstep:packing',
            disposition: null,
            parentID: 'urn:epc:id:sscc:0383745.0000000100',
            childEPCs: [
              'urn:epc:id:sgtin:0383745.038009.200001',
              'urn:epc:id:sgtin:0383745.038009.200002',
              'urn:epc:id:sgtin:0383745.052100.300001',
            ],
            epcList: [],
            sourceList: [],
            destinationList: [],
            bizTransactionList: [],
          },
        ],
      };

      const result = extractSSCCs(doc);
      expect(result).toHaveLength(1);
      // Two distinct GTINs from two products
      expect(result[0].associatedProducts).toHaveLength(2);
      expect(result[0].associatedProducts).toContain('00383745380096');
      expect(result[0].associatedProducts).toContain('00383745521000');
    });

    it('should not duplicate child EPCs across multiple events', () => {
      const doc = {
        events: [
          {
            eventType: 'AggregationEvent',
            eventTime: '2024-02-20T11:00:00.000Z',
            action: 'ADD',
            bizStep: 'urn:epcglobal:cbv:bizstep:packing',
            disposition: null,
            parentID: 'urn:epc:id:sscc:0383745.0000000100',
            childEPCs: ['urn:epc:id:sgtin:0383745.038009.200001'],
            epcList: [],
            sourceList: [],
            destinationList: [],
            bizTransactionList: [],
          },
          {
            eventType: 'AggregationEvent',
            eventTime: '2024-02-20T12:00:00.000Z',
            action: 'OBSERVE',
            bizStep: null,
            disposition: null,
            parentID: 'urn:epc:id:sscc:0383745.0000000100',
            childEPCs: ['urn:epc:id:sgtin:0383745.038009.200001'],
            epcList: [],
            sourceList: [],
            destinationList: [],
            bizTransactionList: [],
          },
        ],
      };

      const result = extractSSCCs(doc);
      expect(result).toHaveLength(1);
      expect(result[0].childEPCs).toHaveLength(1);
      expect(result[0].associatedProducts).toHaveLength(1);
    });

    it('should ignore non-SSCC URIs', () => {
      const doc = {
        events: [
          {
            eventType: 'ObjectEvent',
            eventTime: '2024-02-20T08:00:00.000Z',
            action: 'ADD',
            bizStep: 'urn:epcglobal:cbv:bizstep:commissioning',
            disposition: null,
            parentID: null,
            epcList: [
              'urn:epc:id:sgtin:0383745.038009.200001',
              'urn:epc:id:sgtin:0383745.038009.200002',
            ],
            childEPCs: [],
            sourceList: [],
            destinationList: [],
            bizTransactionList: [],
          },
        ],
      };

      const result = extractSSCCs(doc);
      expect(result).toEqual([]);
    });

    it('should create correct event references', () => {
      const doc = {
        events: [
          {
            eventType: 'ObjectEvent',
            eventTime: '2024-02-20T14:00:00.000Z',
            action: 'OBSERVE',
            bizStep: 'urn:epcglobal:cbv:bizstep:shipping',
            disposition: 'urn:epcglobal:cbv:disp:in_transit',
            parentID: null,
            epcList: ['urn:epc:id:sscc:0383745.0000000100'],
            childEPCs: [],
            sourceList: [],
            destinationList: [],
            bizTransactionList: [],
          },
        ],
      };

      const result = extractSSCCs(doc);
      const eventRef = result[0].events[0];
      expect(eventRef.eventType).toBe('ObjectEvent');
      expect(eventRef.eventTime).toBe('2024-02-20T14:00:00.000Z');
      expect(eventRef.bizStep).toBe('urn:epcglobal:cbv:bizstep:shipping');
      expect(eventRef.disposition).toBe('urn:epcglobal:cbv:disp:in_transit');
      expect(eventRef.action).toBe('OBSERVE');
      expect(eventRef.role).toBe('epcList');
    });

    it('should handle SSCC appearing in all role types simultaneously', () => {
      const ssccUri = 'urn:epc:id:sscc:0383745.0000000100';
      const doc = {
        events: [
          {
            eventType: 'AggregationEvent',
            eventTime: '2024-02-20T10:00:00.000Z',
            action: 'ADD',
            bizStep: 'urn:epcglobal:cbv:bizstep:packing',
            disposition: null,
            parentID: ssccUri,
            childEPCs: ['urn:epc:id:sgtin:0383745.038009.100001'],
            epcList: [],
            sourceList: [],
            destinationList: [],
            bizTransactionList: [],
          },
          {
            eventType: 'ObjectEvent',
            eventTime: '2024-02-20T12:00:00.000Z',
            action: 'OBSERVE',
            bizStep: 'urn:epcglobal:cbv:bizstep:shipping',
            disposition: null,
            parentID: null,
            epcList: [ssccUri],
            childEPCs: [],
            sourceList: [
              { type: 'urn:epcglobal:cbv:sdt:possessing_party', value: ssccUri },
            ],
            destinationList: [
              { type: 'urn:epcglobal:cbv:sdt:owning_party', value: ssccUri },
            ],
            bizTransactionList: [
              { type: 'urn:epcglobal:cbv:btt:desadv', value: ssccUri },
            ],
          },
        ],
      };

      const result = extractSSCCs(doc);
      expect(result).toHaveLength(1);
      expect(result[0].eventCount).toBe(5); // parentID + epcList + source + destination + shipmentIdentifier
      expect(result[0].roles).toContain('parentID');
      expect(result[0].roles).toContain('epcList');
      expect(result[0].roles).toContain('source');
      expect(result[0].roles).toContain('destination');
      expect(result[0].roles).toContain('shipmentIdentifier');
    });

    it('should track multiple distinct SSCCs from different events', () => {
      const doc = {
        events: [
          {
            eventType: 'AggregationEvent',
            eventTime: '2024-02-20T10:00:00.000Z',
            action: 'ADD',
            bizStep: 'urn:epcglobal:cbv:bizstep:packing',
            disposition: null,
            parentID: 'urn:epc:id:sscc:0383745.0000000100',
            childEPCs: ['urn:epc:id:sgtin:0383745.038009.200001'],
            epcList: [],
            sourceList: [],
            destinationList: [],
            bizTransactionList: [],
          },
          {
            eventType: 'AggregationEvent',
            eventTime: '2024-02-20T10:30:00.000Z',
            action: 'ADD',
            bizStep: 'urn:epcglobal:cbv:bizstep:packing',
            disposition: null,
            parentID: 'urn:epc:id:sscc:0383745.0000000200',
            childEPCs: ['urn:epc:id:sgtin:0383745.052100.300001'],
            epcList: [],
            sourceList: [],
            destinationList: [],
            bizTransactionList: [],
          },
        ],
      };

      const result = extractSSCCs(doc);
      expect(result).toHaveLength(2);

      const sscc1 = result.find(s => s.sscc === 'urn:epc:id:sscc:0383745.0000000100');
      const sscc2 = result.find(s => s.sscc === 'urn:epc:id:sscc:0383745.0000000200');

      expect(sscc1).toBeDefined();
      expect(sscc1.childEPCs).toContain('urn:epc:id:sgtin:0383745.038009.200001');
      expect(sscc1.associatedProducts).toContain('00383745380096');

      expect(sscc2).toBeDefined();
      expect(sscc2.childEPCs).toContain('urn:epc:id:sgtin:0383745.052100.300001');
      expect(sscc2.associatedProducts).toContain('00383745521000');
    });

    it('should handle SSCC in TransactionEvent epcList', () => {
      const doc = {
        events: [
          {
            eventType: 'TransactionEvent',
            eventTime: '2024-02-21T08:00:00.000Z',
            action: 'ADD',
            bizStep: 'urn:epcglobal:cbv:bizstep:receiving',
            disposition: 'urn:epcglobal:cbv:disp:in_progress',
            parentID: null,
            epcList: ['urn:epc:id:sscc:0383745.0000000100'],
            childEPCs: [],
            sourceList: [],
            destinationList: [],
            bizTransactionList: [],
          },
        ],
      };

      const result = extractSSCCs(doc);
      expect(result).toHaveLength(1);
      expect(result[0].sscc).toBe('urn:epc:id:sscc:0383745.0000000100');
      expect(result[0].roles).toContain('epcList');
      expect(result[0].events[0].eventType).toBe('TransactionEvent');
      expect(result[0].events[0].bizStep).toBe('urn:epcglobal:cbv:bizstep:receiving');
    });

    it('should handle events with missing optional fields gracefully', () => {
      const doc = {
        events: [
          {
            eventType: 'ObjectEvent',
            eventTime: '2024-02-20T14:00:00.000Z',
            action: 'OBSERVE',
            parentID: null,
            epcList: ['urn:epc:id:sscc:0383745.0000000100'],
            childEPCs: [],
            // sourceList, destinationList, bizTransactionList missing
          },
        ],
      };

      const result = extractSSCCs(doc);
      expect(result).toHaveLength(1);
      expect(result[0].roles).toContain('epcList');
      expect(result[0].events[0].bizStep).toBeNull();
      expect(result[0].events[0].disposition).toBeNull();
    });

    it('should not collect childEPCs when parentID SSCC is in non-AggregationEvent', () => {
      const doc = {
        events: [
          {
            eventType: 'ObjectEvent',
            eventTime: '2024-02-20T10:00:00.000Z',
            action: 'OBSERVE',
            bizStep: null,
            disposition: null,
            parentID: 'urn:epc:id:sscc:0383745.0000000100',
            childEPCs: ['urn:epc:id:sgtin:0383745.038009.200001'],
            epcList: [],
            sourceList: [],
            destinationList: [],
            bizTransactionList: [],
          },
        ],
      };

      const result = extractSSCCs(doc);
      expect(result).toHaveLength(1);
      expect(result[0].roles).toContain('parentID');
      // childEPCs should NOT be collected since this is not an AggregationEvent
      expect(result[0].childEPCs).toHaveLength(0);
      expect(result[0].associatedProducts).toHaveLength(0);
    });

    it('should handle SSCC in childEPCs that is also a child of another SSCC parent', () => {
      const doc = {
        events: [
          {
            eventType: 'AggregationEvent',
            eventTime: '2024-02-20T10:00:00.000Z',
            action: 'ADD',
            bizStep: 'urn:epcglobal:cbv:bizstep:packing',
            disposition: null,
            parentID: 'urn:epc:id:sscc:0383745.0000000300',
            childEPCs: [
              'urn:epc:id:sscc:0383745.0000000100',
              'urn:epc:id:sscc:0383745.0000000200',
            ],
            epcList: [],
            sourceList: [],
            destinationList: [],
            bizTransactionList: [],
          },
        ],
      };

      const result = extractSSCCs(doc);
      // Parent SSCC + 2 child SSCCs = 3
      expect(result).toHaveLength(3);

      const parent = result.find(s => s.sscc === 'urn:epc:id:sscc:0383745.0000000300');
      expect(parent.roles).toContain('parentID');
      // childEPCs for the parent contain the nested SSCCs
      expect(parent.childEPCs).toContain('urn:epc:id:sscc:0383745.0000000100');
      expect(parent.childEPCs).toContain('urn:epc:id:sscc:0383745.0000000200');

      const child1 = result.find(s => s.sscc === 'urn:epc:id:sscc:0383745.0000000100');
      expect(child1.roles).toContain('childEPC');

      const child2 = result.find(s => s.sscc === 'urn:epc:id:sscc:0383745.0000000200');
      expect(child2.roles).toContain('childEPC');
    });

    it('should handle SSCC lifecycle across packing, shipping, and receiving', () => {
      const ssccUri = 'urn:epc:id:sscc:0383745.0000000100';
      const doc = {
        events: [
          {
            eventType: 'AggregationEvent',
            eventTime: '2024-02-20T10:00:00.000Z',
            action: 'ADD',
            bizStep: 'urn:epcglobal:cbv:bizstep:packing',
            disposition: 'urn:epcglobal:cbv:disp:container_closed',
            parentID: ssccUri,
            childEPCs: ['urn:epc:id:sgtin:0383745.038009.200001'],
            epcList: [],
            sourceList: [],
            destinationList: [],
            bizTransactionList: [],
          },
          {
            eventType: 'ObjectEvent',
            eventTime: '2024-02-20T14:00:00.000Z',
            action: 'OBSERVE',
            bizStep: 'urn:epcglobal:cbv:bizstep:shipping',
            disposition: 'urn:epcglobal:cbv:disp:in_transit',
            parentID: null,
            epcList: [ssccUri],
            childEPCs: [],
            sourceList: [],
            destinationList: [],
            bizTransactionList: [],
          },
          {
            eventType: 'ObjectEvent',
            eventTime: '2024-02-21T09:00:00.000Z',
            action: 'OBSERVE',
            bizStep: 'urn:epcglobal:cbv:bizstep:receiving',
            disposition: 'urn:epcglobal:cbv:disp:in_progress',
            parentID: null,
            epcList: [ssccUri],
            childEPCs: [],
            sourceList: [],
            destinationList: [],
            bizTransactionList: [],
          },
        ],
      };

      const result = extractSSCCs(doc);
      expect(result).toHaveLength(1);
      expect(result[0].sscc).toBe(ssccUri);
      expect(result[0].eventCount).toBe(3);
      expect(result[0].roles).toContain('parentID');
      expect(result[0].roles).toContain('epcList');
      expect(result[0].events[0].bizStep).toBe('urn:epcglobal:cbv:bizstep:packing');
      expect(result[0].events[1].bizStep).toBe('urn:epcglobal:cbv:bizstep:shipping');
      expect(result[0].events[2].bizStep).toBe('urn:epcglobal:cbv:bizstep:receiving');
    });

    it('should not derive products from non-SGTIN child EPCs', () => {
      const doc = {
        events: [
          {
            eventType: 'AggregationEvent',
            eventTime: '2024-02-20T10:00:00.000Z',
            action: 'ADD',
            bizStep: 'urn:epcglobal:cbv:bizstep:packing',
            disposition: null,
            parentID: 'urn:epc:id:sscc:0383745.0000000100',
            childEPCs: [
              'urn:epc:id:sscc:0383745.0000000200',
              'urn:epc:id:sgln:0383745.00001.0',
            ],
            epcList: [],
            sourceList: [],
            destinationList: [],
            bizTransactionList: [],
          },
        ],
      };

      const result = extractSSCCs(doc);
      const parent = result.find(s => s.sscc === 'urn:epc:id:sscc:0383745.0000000100');
      // No associated products since children are not SGTIN
      expect(parent.associatedProducts).toHaveLength(0);
    });
  });
});
