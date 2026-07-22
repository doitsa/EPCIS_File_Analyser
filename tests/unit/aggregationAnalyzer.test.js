import { describe, it, expect } from 'vitest';
import { analyzeCases } from '../../aggregationAnalyzer.js';
import { extractAll } from '../../epcExtractor.js';

/**
 * Helper to create a minimal ParsedDocument with given events.
 */
function makeDoc(events) {
  return {
    header: null,
    sbdh: null,
    masterData: {},
    events,
    parseErrors: [],
  };
}

/**
 * Helper to create a minimal EPCMap (not used directly by aggregationAnalyzer
 * but required by the interface).
 */
function makeEpcMap() {
  return {
    all: new Map(),
    bySGTIN: new Map(),
    bySSCC: new Map(),
    bySerial: new Map(),
  };
}

describe('aggregationAnalyzer - analyzeCases', () => {
  it('should return empty results when no events exist', () => {
    const doc = makeDoc([]);
    const result = analyzeCases(doc, makeEpcMap());

    expect(result.cases).toEqual([]);
    expect(result.emptyCases).toEqual([]);
    expect(result.orphanedSerials).toEqual([]);
  });

  it('should detect a valid case from AggregationEvent ADD with commissioned children', () => {
    const events = [
      {
        eventType: 'ObjectEvent',
        eventTime: '2024-02-20T08:00:00.000Z',
        action: 'ADD',
        bizStep: 'urn:epcglobal:cbv:bizstep:commissioning',
        epcList: [
          'urn:epc:id:sgtin:0383745.038009.100001',
          'urn:epc:id:sgtin:0383745.038009.100002',
        ],
        childEPCs: [],
        parentID: null,
      },
      {
        eventType: 'AggregationEvent',
        eventTime: '2024-02-20T10:00:00.000Z',
        action: 'ADD',
        bizStep: 'urn:epcglobal:cbv:bizstep:packing',
        parentID: 'urn:epc:id:sgtin:0383745.038009.900001',
        childEPCs: [
          'urn:epc:id:sgtin:0383745.038009.100001',
          'urn:epc:id:sgtin:0383745.038009.100002',
        ],
        epcList: [],
      },
    ];

    const doc = makeDoc(events);
    const result = analyzeCases(doc, makeEpcMap());

    expect(result.cases).toHaveLength(1);
    expect(result.cases[0].parentEPC).toBe('urn:epc:id:sgtin:0383745.038009.900001');
    expect(result.cases[0].childCount).toBe(2);
    expect(result.cases[0].associatedGTIN).toBe('00383745380096');
    expect(result.cases[0].aggregationStatus).toBe('Valid');
    expect(result.cases[0].childrenCommissioned).toBe('Yes');
    expect(result.cases[0].eventTime).toBe('2024-02-20T10:00:00.000Z');
    expect(result.emptyCases).toHaveLength(0);
    expect(result.orphanedSerials).toHaveLength(0);
  });

  it('should detect empty cases (parent with zero children)', () => {
    const events = [
      {
        eventType: 'AggregationEvent',
        eventTime: '2024-02-20T10:00:00.000Z',
        action: 'ADD',
        bizStep: 'urn:epcglobal:cbv:bizstep:packing',
        parentID: 'urn:epc:id:sgtin:0383745.038009.900001',
        childEPCs: [],
        epcList: [],
      },
    ];

    const doc = makeDoc(events);
    const result = analyzeCases(doc, makeEpcMap());

    expect(result.cases).toHaveLength(1);
    expect(result.cases[0].childCount).toBe(0);
    expect(result.emptyCases).toHaveLength(1);
    expect(result.emptyCases[0].parentEPC).toBe('urn:epc:id:sgtin:0383745.038009.900001');
  });

  it('should detect orphaned serials (commissioned but not aggregated)', () => {
    const events = [
      {
        eventType: 'ObjectEvent',
        eventTime: '2024-02-20T08:00:00.000Z',
        action: 'ADD',
        bizStep: 'urn:epcglobal:cbv:bizstep:commissioning',
        epcList: [
          'urn:epc:id:sgtin:0383745.038009.100001',
          'urn:epc:id:sgtin:0383745.038009.100002',
          'urn:epc:id:sgtin:0383745.038009.100003',
        ],
        childEPCs: [],
        parentID: null,
      },
      {
        eventType: 'AggregationEvent',
        eventTime: '2024-02-20T10:00:00.000Z',
        action: 'ADD',
        bizStep: 'urn:epcglobal:cbv:bizstep:packing',
        parentID: 'urn:epc:id:sgtin:0383745.038009.900001',
        childEPCs: ['urn:epc:id:sgtin:0383745.038009.100001'],
        epcList: [],
      },
    ];

    const doc = makeDoc(events);
    const result = analyzeCases(doc, makeEpcMap());

    expect(result.orphanedSerials).toHaveLength(2);
    expect(result.orphanedSerials).toContain('urn:epc:id:sgtin:0383745.038009.100002');
    expect(result.orphanedSerials).toContain('urn:epc:id:sgtin:0383745.038009.100003');
  });

  it('should report childrenCommissioned as No when children lack commissioning events', () => {
    const events = [
      {
        eventType: 'AggregationEvent',
        eventTime: '2024-02-20T10:00:00.000Z',
        action: 'ADD',
        bizStep: 'urn:epcglobal:cbv:bizstep:packing',
        parentID: 'urn:epc:id:sgtin:0383745.038009.900001',
        childEPCs: [
          'urn:epc:id:sgtin:0383745.038009.100001',
          'urn:epc:id:sgtin:0383745.038009.100002',
        ],
        epcList: [],
      },
    ];

    const doc = makeDoc(events);
    const result = analyzeCases(doc, makeEpcMap());

    expect(result.cases[0].childrenCommissioned).toBe('No');
  });

  it('should report childrenCommissioned as No when some children lack commissioning', () => {
    const events = [
      {
        eventType: 'ObjectEvent',
        eventTime: '2024-02-20T08:00:00.000Z',
        action: 'ADD',
        bizStep: 'urn:epcglobal:cbv:bizstep:commissioning',
        epcList: ['urn:epc:id:sgtin:0383745.038009.100001'],
        childEPCs: [],
        parentID: null,
      },
      {
        eventType: 'AggregationEvent',
        eventTime: '2024-02-20T10:00:00.000Z',
        action: 'ADD',
        bizStep: 'urn:epcglobal:cbv:bizstep:packing',
        parentID: 'urn:epc:id:sgtin:0383745.038009.900001',
        childEPCs: [
          'urn:epc:id:sgtin:0383745.038009.100001',
          'urn:epc:id:sgtin:0383745.038009.100002',
        ],
        epcList: [],
      },
    ];

    const doc = makeDoc(events);
    const result = analyzeCases(doc, makeEpcMap());

    expect(result.cases[0].childrenCommissioned).toBe('No');
  });

  it('should ignore AggregationEvents with action other than ADD', () => {
    const events = [
      {
        eventType: 'AggregationEvent',
        eventTime: '2024-02-20T10:00:00.000Z',
        action: 'DELETE',
        bizStep: 'urn:epcglobal:cbv:bizstep:unpacking',
        parentID: 'urn:epc:id:sgtin:0383745.038009.900001',
        childEPCs: ['urn:epc:id:sgtin:0383745.038009.100001'],
        epcList: [],
      },
      {
        eventType: 'AggregationEvent',
        eventTime: '2024-02-20T11:00:00.000Z',
        action: 'OBSERVE',
        bizStep: 'urn:epcglobal:cbv:bizstep:inspecting',
        parentID: 'urn:epc:id:sgtin:0383745.038009.900002',
        childEPCs: ['urn:epc:id:sgtin:0383745.038009.100002'],
        epcList: [],
      },
    ];

    const doc = makeDoc(events);
    const result = analyzeCases(doc, makeEpcMap());

    expect(result.cases).toHaveLength(0);
  });

  it('should determine associatedGTIN from child SGTIN URIs', () => {
    const events = [
      {
        eventType: 'AggregationEvent',
        eventTime: '2024-02-20T10:00:00.000Z',
        action: 'ADD',
        bizStep: 'urn:epcglobal:cbv:bizstep:packing',
        parentID: 'urn:epc:id:sscc:0383745.0000000100',
        childEPCs: [
          'urn:epc:id:sgtin:0383745.052100.300001',
          'urn:epc:id:sgtin:0383745.052100.300002',
        ],
        epcList: [],
      },
    ];

    const doc = makeDoc(events);
    const result = analyzeCases(doc, makeEpcMap());

    expect(result.cases[0].associatedGTIN).toBe('00383745521000');
  });

  it('should return null associatedGTIN when children are not SGTIN URIs', () => {
    const events = [
      {
        eventType: 'AggregationEvent',
        eventTime: '2024-02-20T10:00:00.000Z',
        action: 'ADD',
        bizStep: 'urn:epcglobal:cbv:bizstep:packing',
        parentID: 'urn:epc:id:sscc:0383745.0000000100',
        childEPCs: [
          'urn:epc:id:sscc:0383745.0000000200',
          'urn:epc:id:sscc:0383745.0000000300',
        ],
        epcList: [],
      },
    ];

    const doc = makeDoc(events);
    const result = analyzeCases(doc, makeEpcMap());

    expect(result.cases[0].associatedGTIN).toBeNull();
  });

  it('should handle multiple aggregation events correctly', () => {
    const events = [
      {
        eventType: 'ObjectEvent',
        eventTime: '2024-02-20T08:00:00.000Z',
        action: 'ADD',
        bizStep: 'urn:epcglobal:cbv:bizstep:commissioning',
        epcList: [
          'urn:epc:id:sgtin:0383745.038009.100001',
          'urn:epc:id:sgtin:0383745.038009.100002',
          'urn:epc:id:sgtin:0383745.052100.200001',
        ],
        childEPCs: [],
        parentID: null,
      },
      {
        eventType: 'AggregationEvent',
        eventTime: '2024-02-20T10:00:00.000Z',
        action: 'ADD',
        parentID: 'urn:epc:id:sgtin:0383745.038009.900001',
        childEPCs: [
          'urn:epc:id:sgtin:0383745.038009.100001',
          'urn:epc:id:sgtin:0383745.038009.100002',
        ],
        epcList: [],
        bizStep: 'urn:epcglobal:cbv:bizstep:packing',
      },
      {
        eventType: 'AggregationEvent',
        eventTime: '2024-02-20T10:15:00.000Z',
        action: 'ADD',
        parentID: 'urn:epc:id:sgtin:0383745.052100.900002',
        childEPCs: ['urn:epc:id:sgtin:0383745.052100.200001'],
        epcList: [],
        bizStep: 'urn:epcglobal:cbv:bizstep:packing',
      },
    ];

    const doc = makeDoc(events);
    const result = analyzeCases(doc, makeEpcMap());

    expect(result.cases).toHaveLength(2);
    expect(result.cases[0].childCount).toBe(2);
    expect(result.cases[1].childCount).toBe(1);
    expect(result.orphanedSerials).toHaveLength(0);
  });

  it('should handle childrenCommissioned when commissioning is after aggregation', () => {
    const events = [
      {
        eventType: 'ObjectEvent',
        eventTime: '2024-02-20T12:00:00.000Z', // After aggregation
        action: 'ADD',
        bizStep: 'urn:epcglobal:cbv:bizstep:commissioning',
        epcList: ['urn:epc:id:sgtin:0383745.038009.100001'],
        childEPCs: [],
        parentID: null,
      },
      {
        eventType: 'AggregationEvent',
        eventTime: '2024-02-20T10:00:00.000Z',
        action: 'ADD',
        parentID: 'urn:epc:id:sgtin:0383745.038009.900001',
        childEPCs: ['urn:epc:id:sgtin:0383745.038009.100001'],
        epcList: [],
        bizStep: 'urn:epcglobal:cbv:bizstep:packing',
      },
    ];

    const doc = makeDoc(events);
    const result = analyzeCases(doc, makeEpcMap());

    // Commissioning happened after aggregation, so childrenCommissioned should be No
    expect(result.cases[0].childrenCommissioned).toBe('No');
  });

  it('should resolve associatedGTIN from epcMap when available', () => {
    const childEPC = 'urn:epc:id:sgtin:0383745.038009.100001';
    const events = [
      {
        eventType: 'AggregationEvent',
        eventTime: '2024-02-20T10:00:00.000Z',
        action: 'ADD',
        parentID: 'urn:epc:id:sscc:0383745.0000000100',
        childEPCs: [childEPC],
        epcList: [],
        bizStep: 'urn:epcglobal:cbv:bizstep:packing',
      },
    ];

    // Build an epcMap with the child EPC pre-populated
    const epcMap = makeEpcMap();
    epcMap.all.set(childEPC, {
      uri: childEPC,
      type: 'sgtin',
      companyPrefix: '0383745',
      itemReference: '038009',
      serialNumber: '100001',
      gtin: '00383745380096',
      ndc: null,
    });
    epcMap.bySGTIN.set('00383745380096', [epcMap.all.get(childEPC)]);

    const doc = makeDoc(events);
    const result = analyzeCases(doc, epcMap);

    expect(result.cases[0].associatedGTIN).toBe('00383745380096');
  });

  it('should use extractAll to build epcMap and resolve GTIN correctly', () => {
    const events = [
      {
        eventType: 'ObjectEvent',
        eventTime: '2024-02-20T08:00:00.000Z',
        action: 'ADD',
        bizStep: 'urn:epcglobal:cbv:bizstep:commissioning',
        epcList: [
          'urn:epc:id:sgtin:0383745.038009.100001',
          'urn:epc:id:sgtin:0383745.038009.100002',
        ],
        childEPCs: [],
        parentID: null,
      },
      {
        eventType: 'AggregationEvent',
        eventTime: '2024-02-20T10:00:00.000Z',
        action: 'ADD',
        parentID: 'urn:epc:id:sscc:0383745.0000000100',
        childEPCs: [
          'urn:epc:id:sgtin:0383745.038009.100001',
          'urn:epc:id:sgtin:0383745.038009.100002',
        ],
        epcList: [],
        bizStep: 'urn:epcglobal:cbv:bizstep:packing',
      },
    ];

    const doc = makeDoc(events);
    // Use the real extractAll to build epcMap
    const epcMap = extractAll(events);
    const result = analyzeCases(doc, epcMap);

    expect(result.cases).toHaveLength(1);
    // GTIN resolved via epcMap lookup
    expect(result.cases[0].associatedGTIN).toBe('00383745380096');
    expect(result.cases[0].childrenCommissioned).toBe('Yes');
    expect(result.orphanedSerials).toHaveLength(0);
  });

  it('should not count non-ObjectEvent events for commissioning', () => {
    const events = [
      {
        eventType: 'TransactionEvent',
        eventTime: '2024-02-20T08:00:00.000Z',
        action: 'ADD',
        bizStep: 'urn:epcglobal:cbv:bizstep:commissioning',
        epcList: ['urn:epc:id:sgtin:0383745.038009.100001'],
        childEPCs: [],
        parentID: null,
      },
      {
        eventType: 'AggregationEvent',
        eventTime: '2024-02-20T10:00:00.000Z',
        action: 'ADD',
        parentID: 'urn:epc:id:sgtin:0383745.038009.900001',
        childEPCs: ['urn:epc:id:sgtin:0383745.038009.100001'],
        epcList: [],
        bizStep: 'urn:epcglobal:cbv:bizstep:packing',
      },
    ];

    const doc = makeDoc(events);
    const result = analyzeCases(doc, makeEpcMap());

    // TransactionEvent is not ObjectEvent, so children should not be considered commissioned
    expect(result.cases[0].childrenCommissioned).toBe('No');
  });

  it('should handle case-insensitive bizStep matching for commissioning', () => {
    const events = [
      {
        eventType: 'ObjectEvent',
        eventTime: '2024-02-20T08:00:00.000Z',
        action: 'ADD',
        bizStep: 'urn:epcglobal:cbv:bizstep:Commissioning',
        epcList: ['urn:epc:id:sgtin:0383745.038009.100001'],
        childEPCs: [],
        parentID: null,
      },
      {
        eventType: 'AggregationEvent',
        eventTime: '2024-02-20T10:00:00.000Z',
        action: 'ADD',
        parentID: 'urn:epc:id:sgtin:0383745.038009.900001',
        childEPCs: ['urn:epc:id:sgtin:0383745.038009.100001'],
        epcList: [],
        bizStep: 'urn:epcglobal:cbv:bizstep:packing',
      },
    ];

    const doc = makeDoc(events);
    const result = analyzeCases(doc, makeEpcMap());

    // Case-insensitive match on 'Commissioning'
    expect(result.cases[0].childrenCommissioned).toBe('Yes');
  });

  it('should handle missing parentID gracefully (defaults to empty string)', () => {
    const events = [
      {
        eventType: 'AggregationEvent',
        eventTime: '2024-02-20T10:00:00.000Z',
        action: 'ADD',
        bizStep: 'urn:epcglobal:cbv:bizstep:packing',
        parentID: null,
        childEPCs: ['urn:epc:id:sgtin:0383745.038009.100001'],
        epcList: [],
      },
    ];

    const doc = makeDoc(events);
    const result = analyzeCases(doc, makeEpcMap());

    expect(result.cases).toHaveLength(1);
    expect(result.cases[0].parentEPC).toBe('');
    expect(result.cases[0].childCount).toBe(1);
  });

  it('should handle missing eventTime gracefully', () => {
    const events = [
      {
        eventType: 'AggregationEvent',
        action: 'ADD',
        bizStep: 'urn:epcglobal:cbv:bizstep:packing',
        parentID: 'urn:epc:id:sscc:0383745.0000000100',
        childEPCs: ['urn:epc:id:sgtin:0383745.038009.100001'],
        epcList: [],
      },
    ];

    const doc = makeDoc(events);
    const result = analyzeCases(doc, makeEpcMap());

    expect(result.cases).toHaveLength(1);
    expect(result.cases[0].eventTime).toBe('');
  });

  it('should only count ObjectEvent ADD with commissioning bizStep for orphaned detection', () => {
    const events = [
      {
        eventType: 'ObjectEvent',
        eventTime: '2024-02-20T08:00:00.000Z',
        action: 'ADD',
        bizStep: 'urn:epcglobal:cbv:bizstep:shipping', // Not commissioning
        epcList: ['urn:epc:id:sgtin:0383745.038009.100001'],
        childEPCs: [],
        parentID: null,
      },
    ];

    const doc = makeDoc(events);
    const result = analyzeCases(doc, makeEpcMap());

    // Not a commissioning event, so no orphans should be detected
    expect(result.orphanedSerials).toHaveLength(0);
  });

  it('should detect all orphans when no aggregation events exist', () => {
    const events = [
      {
        eventType: 'ObjectEvent',
        eventTime: '2024-02-20T08:00:00.000Z',
        action: 'ADD',
        bizStep: 'urn:epcglobal:cbv:bizstep:commissioning',
        epcList: [
          'urn:epc:id:sgtin:0383745.038009.100001',
          'urn:epc:id:sgtin:0383745.038009.100002',
        ],
        childEPCs: [],
        parentID: null,
      },
    ];

    const doc = makeDoc(events);
    const result = analyzeCases(doc, makeEpcMap());

    expect(result.orphanedSerials).toHaveLength(2);
    expect(result.orphanedSerials).toContain('urn:epc:id:sgtin:0383745.038009.100001');
    expect(result.orphanedSerials).toContain('urn:epc:id:sgtin:0383745.038009.100002');
  });

  it('should handle multiple empty cases', () => {
    const events = [
      {
        eventType: 'AggregationEvent',
        eventTime: '2024-02-20T10:00:00.000Z',
        action: 'ADD',
        parentID: 'urn:epc:id:sscc:0383745.0000000100',
        childEPCs: [],
        epcList: [],
        bizStep: 'urn:epcglobal:cbv:bizstep:packing',
      },
      {
        eventType: 'AggregationEvent',
        eventTime: '2024-02-20T10:30:00.000Z',
        action: 'ADD',
        parentID: 'urn:epc:id:sscc:0383745.0000000200',
        childEPCs: [],
        epcList: [],
        bizStep: 'urn:epcglobal:cbv:bizstep:packing',
      },
    ];

    const doc = makeDoc(events);
    const result = analyzeCases(doc, makeEpcMap());

    expect(result.cases).toHaveLength(2);
    expect(result.emptyCases).toHaveLength(2);
  });
});
