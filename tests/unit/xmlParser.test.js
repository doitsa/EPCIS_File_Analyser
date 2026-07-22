import { describe, it, expect } from 'vitest';
import { parse } from '../../xmlParser.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const fixturesDir = resolve(__dirname, '../fixtures');

function loadFixture(name) {
  return readFileSync(resolve(fixturesDir, name), 'utf-8');
}

describe('xmlParser.parse', () => {
  describe('1. Valid document with one of each event type', () => {
    it('should parse all five event types and return correct eventType fields', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <epcis:EPCISDocument xmlns:epcis="urn:epcglobal:epcis:xsd:1">
          <EPCISBody>
            <EventList>
              <ObjectEvent>
                <eventTime>2024-01-01T00:00:00Z</eventTime>
                <eventTimeZoneOffset>+00:00</eventTimeZoneOffset>
                <epcList><epc>urn:epc:id:sgtin:0383745.038009.1</epc></epcList>
                <action>ADD</action>
              </ObjectEvent>
              <AggregationEvent>
                <eventTime>2024-01-02T00:00:00Z</eventTime>
                <eventTimeZoneOffset>+00:00</eventTimeZoneOffset>
                <parentID>urn:epc:id:sgtin:0383745.038009.900001</parentID>
                <childEPCs><epc>urn:epc:id:sgtin:0383745.038009.1</epc></childEPCs>
                <action>ADD</action>
              </AggregationEvent>
              <TransactionEvent>
                <eventTime>2024-01-03T00:00:00Z</eventTime>
                <eventTimeZoneOffset>+00:00</eventTimeZoneOffset>
                <epcList><epc>urn:epc:id:sgtin:0383745.038009.1</epc></epcList>
                <action>ADD</action>
              </TransactionEvent>
              <TransformationEvent>
                <eventTime>2024-01-04T00:00:00Z</eventTime>
                <eventTimeZoneOffset>+00:00</eventTimeZoneOffset>
                <inputEPCList><epc>urn:epc:id:sgtin:0383745.038009.1</epc></inputEPCList>
                <outputEPCList><epc>urn:epc:id:sgtin:0383745.038009.2</epc></outputEPCList>
              </TransformationEvent>
              <AssociationEvent>
                <eventTime>2024-01-05T00:00:00Z</eventTime>
                <eventTimeZoneOffset>+00:00</eventTimeZoneOffset>
                <parentID>urn:epc:id:sgtin:0383745.038009.900002</parentID>
                <childEPCs><epc>urn:epc:id:sgtin:0383745.038009.2</epc></childEPCs>
                <action>ADD</action>
              </AssociationEvent>
            </EventList>
          </EPCISBody>
        </epcis:EPCISDocument>`;
      const result = parse(xml);

      expect(result.parseErrors).toHaveLength(0);
      expect(result.events).toHaveLength(5);

      const types = result.events.map(e => e.eventType);
      expect(types).toContain('ObjectEvent');
      expect(types).toContain('AggregationEvent');
      expect(types).toContain('TransactionEvent');
      expect(types).toContain('TransformationEvent');
      expect(types).toContain('AssociationEvent');
    });
  });

  describe('2. ObjectEvent with all fields populated', () => {
    it('should parse ObjectEvent with eventTime, action, bizStep, disposition, readPoint, bizLocation, epcList, ilmd', () => {
      const xml = loadFixture('valid-epcis-simple.xml');
      const result = parse(xml);

      expect(result.parseErrors).toHaveLength(0);
      const objectEvents = result.events.filter(e => e.eventType === 'ObjectEvent');
      expect(objectEvents.length).toBeGreaterThanOrEqual(1);

      const commissioning = objectEvents[0];
      expect(commissioning.eventType).toBe('ObjectEvent');
      expect(commissioning.eventTime).toBe('2024-01-15T08:00:00.000Z');
      expect(commissioning.eventTimeZoneOffset).toBe('-05:00');
      expect(commissioning.action).toBe('ADD');
      expect(commissioning.bizStep).toBe('urn:epcglobal:cbv:bizstep:commissioning');
      expect(commissioning.disposition).toBe('urn:epcglobal:cbv:disp:active');
      expect(commissioning.readPoint).toBe('urn:epc:id:sgln:0383745.00001.0');
      expect(commissioning.bizLocation).toBe('urn:epc:id:sgln:0383745.00001.0');
      expect(commissioning.epcList).toEqual([
        'urn:epc:id:sgtin:0383745.038009.100001',
        'urn:epc:id:sgtin:0383745.038009.100002',
        'urn:epc:id:sgtin:0383745.038009.100003',
      ]);
      expect(commissioning.ilmd).not.toBeNull();
      expect(commissioning.ilmd.lotNumber).toBe('LOT-A2024-001');
      expect(commissioning.ilmd.expirationDate).toBe('2025-12-31');
    });

    it('should assign xmlPath to ObjectEvent', () => {
      const xml = loadFixture('valid-epcis-simple.xml');
      const result = parse(xml);

      const objectEvents = result.events.filter(e => e.eventType === 'ObjectEvent');
      expect(objectEvents[0].xmlPath).toBe('EPCISBody/EventList/ObjectEvent[1]');
    });
  });

  describe('3. AggregationEvent with parentID and childEPCs', () => {
    it('should parse AggregationEvent with parentID, childEPCs, action, and bizStep', () => {
      const xml = loadFixture('valid-epcis-simple.xml');
      const result = parse(xml);

      const aggregationEvents = result.events.filter(e => e.eventType === 'AggregationEvent');
      expect(aggregationEvents).toHaveLength(1);

      const aggEvent = aggregationEvents[0];
      expect(aggEvent.eventType).toBe('AggregationEvent');
      expect(aggEvent.eventTime).toBe('2024-01-15T09:00:00.000Z');
      expect(aggEvent.parentID).toBe('urn:epc:id:sgtin:0383745.038009.900001');
      expect(aggEvent.childEPCs).toEqual([
        'urn:epc:id:sgtin:0383745.038009.100001',
        'urn:epc:id:sgtin:0383745.038009.100002',
        'urn:epc:id:sgtin:0383745.038009.100003',
      ]);
      expect(aggEvent.action).toBe('ADD');
      expect(aggEvent.bizStep).toBe('urn:epcglobal:cbv:bizstep:packing');
    });
  });

  describe('4. TransformationEvent with inputEPCList and outputEPCList', () => {
    it('should store inputEPCList in epcList and outputEPCList in childEPCs', () => {
      const xml = loadFixture('valid-epcis-complex.xml');
      const result = parse(xml);

      const transformEvents = result.events.filter(e => e.eventType === 'TransformationEvent');
      expect(transformEvents).toHaveLength(1);

      const transformEvent = transformEvents[0];
      expect(transformEvent.eventType).toBe('TransformationEvent');
      expect(transformEvent.eventTime).toBe('2024-02-22T08:00:00.000Z');
      // inputEPCList stored in epcList
      expect(transformEvent.epcList).toEqual([
        'urn:epc:id:sgtin:0383745.038009.200001',
      ]);
      // outputEPCList stored in childEPCs
      expect(transformEvent.childEPCs).toEqual([
        'urn:epc:id:sgtin:0383745.038009.400001',
      ]);
      expect(transformEvent.bizStep).toBe('urn:epcglobal:cbv:bizstep:transforming');
    });
  });

  describe('5. Master data with VocabularyElement entries containing attributes', () => {
    it('should extract master data entries with id, type, and attributes', () => {
      const xml = loadFixture('valid-epcis-simple.xml');
      const result = parse(xml);

      expect(Object.keys(result.masterData)).toHaveLength(1);
      const entry = result.masterData['urn:epc:idpat:sgtin:0383745.038009.*'];
      expect(entry).toBeDefined();
      expect(entry.id).toBe('urn:epc:idpat:sgtin:0383745.038009.*');
      expect(entry.type).toBe('urn:epcglobal:epcis:vtype:EPCClass');
      expect(entry.attributes['urn:epcglobal:cbv:mda#descriptionShort']).toBe('Aspirin 100mg Tablets');
      expect(entry.attributes['urn:epcglobal:cbv:mda#gtin']).toBe('00383745380099');
      expect(entry.attributes['urn:epcglobal:cbv:mda#ndc']).toBe('38374-538-00');
    });

    it('should extract multiple master data entries from complex document', () => {
      const xml = loadFixture('valid-epcis-complex.xml');
      const result = parse(xml);

      expect(Object.keys(result.masterData)).toHaveLength(2);
      expect(result.masterData['urn:epc:idpat:sgtin:0383745.038009.*']).toBeDefined();
      expect(result.masterData['urn:epc:idpat:sgtin:0383745.052100.*']).toBeDefined();

      const ibuprofen = result.masterData['urn:epc:idpat:sgtin:0383745.052100.*'];
      expect(ibuprofen.attributes['urn:epcglobal:cbv:mda#descriptionShort']).toBe('Ibuprofen 200mg Capsules');
    });

    it('should return header with masterData array', () => {
      const xml = loadFixture('valid-epcis-simple.xml');
      const result = parse(xml);

      expect(result.header).not.toBeNull();
      expect(result.header.masterData).toHaveLength(1);
      expect(result.header.masterData[0].id).toBe('urn:epc:idpat:sgtin:0383745.038009.*');
    });
  });

  describe('6. SBDH with Sender/Receiver Identifier and Contact name', () => {
    it('should extract sender identifier and name from SBDH', () => {
      const xml = loadFixture('valid-epcis-simple.xml');
      const result = parse(xml);

      expect(result.sbdh).not.toBeNull();
      expect(result.sbdh.sender.identifier).toBe('urn:epc:id:sgln:0383745.00001.0');
      expect(result.sbdh.sender.name).toBe('PharmaCo Inc');
    });

    it('should extract receiver identifier and name from SBDH', () => {
      const xml = loadFixture('valid-epcis-simple.xml');
      const result = parse(xml);

      expect(result.sbdh.receiver.identifier).toBe('urn:epc:id:sgln:0614141.00001.0');
      expect(result.sbdh.receiver.name).toBe('DistributorCo LLC');
    });

    it('should return null sbdh when StandardBusinessDocumentHeader is missing', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <epcis:EPCISDocument xmlns:epcis="urn:epcglobal:epcis:xsd:1">
          <EPCISBody>
            <EventList>
              <ObjectEvent>
                <eventTime>2024-01-01T00:00:00Z</eventTime>
                <eventTimeZoneOffset>+00:00</eventTimeZoneOffset>
                <epcList><epc>urn:epc:id:sgtin:0383745.038009.1</epc></epcList>
                <action>ADD</action>
              </ObjectEvent>
            </EventList>
          </EPCISBody>
        </epcis:EPCISDocument>`;
      const result = parse(xml);

      expect(result.sbdh).toBeNull();
    });
  });

  describe('7. Empty EventList (valid XML but no events)', () => {
    it('should return zero events and no parseErrors for empty EventList', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <epcis:EPCISDocument xmlns:epcis="urn:epcglobal:epcis:xsd:1">
          <EPCISBody>
            <EventList>
            </EventList>
          </EPCISBody>
        </epcis:EPCISDocument>`;
      const result = parse(xml);

      expect(result.events).toHaveLength(0);
      expect(result.parseErrors).toHaveLength(0);
    });
  });

  describe('8. Malformed XML (unclosed tag)', () => {
    it('should return parseErrors with message for malformed XML', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <epcis:EPCISDocument xmlns:epcis="urn:epcglobal:epcis:xsd:1">
          <EPCISBody>
            <EventList>
              <ObjectEvent>
                <eventTime>2024-01-01T00:00:00Z</eventTime>
              </ObjectEvent>
            </EventList>
          <!-- unclosed EPCISBody tag -->
        </epcis:EPCISDocument>`;
      const result = parse(xml);

      expect(result.parseErrors.length).toBeGreaterThan(0);
      expect(result.parseErrors[0].message).toBeTruthy();
      expect(result.parseErrors[0].severity).toBe('Critical');
    });

    it('should return parseErrors for completely invalid XML', () => {
      const xml = '<<<not xml at all>>>';
      const result = parse(xml);

      expect(result.parseErrors.length).toBeGreaterThan(0);
      expect(result.parseErrors[0]).toHaveProperty('message');
      expect(result.parseErrors[0]).toHaveProperty('line');
      expect(result.parseErrors[0]).toHaveProperty('severity');
    });

    it('should attempt to extract line number from parse error', () => {
      const xml = loadFixture('invalid-xml.xml');
      const result = parse(xml);

      const error = result.parseErrors[0];
      expect(error).toHaveProperty('line');
      if (error.line !== null) {
        expect(typeof error.line).toBe('number');
        expect(error.line).toBeGreaterThan(0);
      }
    });
  });

  describe('9. Missing EPCISBody', () => {
    it('should return parseErrors with message about EPCISBody', () => {
      const xml = loadFixture('missing-epcisbody.xml');
      const result = parse(xml);

      expect(result.parseErrors.length).toBeGreaterThan(0);
      expect(result.parseErrors[0].message).toContain('EPCISBody');
      expect(result.parseErrors[0].severity).toBe('Critical');
      expect(result.events).toHaveLength(0);
    });
  });

  describe('10. Document with quantityList, sourceList, destinationList, bizTransactionList', () => {
    it('should parse quantityList with epcClass, quantity, and uom', () => {
      const xml = loadFixture('valid-epcis-complex.xml');
      const result = parse(xml);

      const txEvents = result.events.filter(e => e.eventType === 'TransactionEvent');
      expect(txEvents).toHaveLength(1);

      expect(txEvents[0].quantityList).toEqual([
        { epcClass: 'urn:epc:idpat:sgtin:0383745.038009.*', quantity: 5, uom: 'EACH' },
        { epcClass: 'urn:epc:idpat:sgtin:0383745.052100.*', quantity: 3, uom: 'EACH' },
      ]);
    });

    it('should parse sourceList with type and value', () => {
      const xml = loadFixture('valid-epcis-simple.xml');
      const result = parse(xml);

      const shippingEvent = result.events.find(
        e => e.eventType === 'ObjectEvent' && e.bizStep === 'urn:epcglobal:cbv:bizstep:shipping'
      );
      expect(shippingEvent).toBeDefined();
      expect(shippingEvent.sourceList).toEqual([
        { type: 'urn:epcglobal:cbv:sdt:owning_party', value: 'urn:epc:id:sgln:0383745.00001.0' },
      ]);
    });

    it('should parse destinationList with type and value', () => {
      const xml = loadFixture('valid-epcis-simple.xml');
      const result = parse(xml);

      const shippingEvent = result.events.find(
        e => e.eventType === 'ObjectEvent' && e.bizStep === 'urn:epcglobal:cbv:bizstep:shipping'
      );
      expect(shippingEvent).toBeDefined();
      expect(shippingEvent.destinationList).toEqual([
        { type: 'urn:epcglobal:cbv:sdt:owning_party', value: 'urn:epc:id:sgln:0614141.00001.0' },
      ]);
    });

    it('should parse bizTransactionList with type and value', () => {
      const xml = loadFixture('valid-epcis-complex.xml');
      const result = parse(xml);

      const txEvents = result.events.filter(e => e.eventType === 'TransactionEvent');
      expect(txEvents[0].bizTransactionList).toEqual([
        { type: 'urn:epcglobal:cbv:btt:po', value: 'PO-2024-98765' },
        { type: 'urn:epcglobal:cbv:btt:desadv', value: 'DESADV-2024-11111' },
      ]);
    });

    it('should return empty arrays when lists are absent', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <epcis:EPCISDocument xmlns:epcis="urn:epcglobal:epcis:xsd:1">
          <EPCISBody>
            <EventList>
              <ObjectEvent>
                <eventTime>2024-01-01T00:00:00Z</eventTime>
                <eventTimeZoneOffset>+00:00</eventTimeZoneOffset>
                <epcList><epc>urn:epc:id:sgtin:0383745.038009.1</epc></epcList>
                <action>ADD</action>
              </ObjectEvent>
            </EventList>
          </EPCISBody>
        </epcis:EPCISDocument>`;
      const result = parse(xml);

      const event = result.events[0];
      expect(event.quantityList).toEqual([]);
      expect(event.sourceList).toEqual([]);
      expect(event.destinationList).toEqual([]);
      expect(event.bizTransactionList).toEqual([]);
    });
  });
});
