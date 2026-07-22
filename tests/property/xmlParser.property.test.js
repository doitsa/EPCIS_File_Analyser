/**
 * Property-based tests for xmlParser.js
 *
 * Validates: Requirements 1.5, 1.7
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { parse } from '../../xmlParser.js';

const EVENT_TYPES = [
  'ObjectEvent',
  'AggregationEvent',
  'TransactionEvent',
  'TransformationEvent',
  'AssociationEvent',
];

/**
 * Generate a minimal valid EPCIS event XML element for a given event type.
 */
function generateEventXml(eventType) {
  const eventTime = '2024-01-15T10:30:00.000Z';
  const offset = '+00:00';

  if (eventType === 'TransformationEvent') {
    return `<${eventType}>
      <eventTime>${eventTime}</eventTime>
      <eventTimeZoneOffset>${offset}</eventTimeZoneOffset>
      <inputEPCList><epc>urn:epc:id:sgtin:0614141.107346.1</epc></inputEPCList>
      <outputEPCList><epc>urn:epc:id:sgtin:0614141.107346.2</epc></outputEPCList>
    </${eventType}>`;
  }

  if (eventType === 'AggregationEvent') {
    return `<${eventType}>
      <eventTime>${eventTime}</eventTime>
      <eventTimeZoneOffset>${offset}</eventTimeZoneOffset>
      <action>ADD</action>
      <parentID>urn:epc:id:sscc:0614141.1677777778</parentID>
      <childEPCs><epc>urn:epc:id:sgtin:0614141.107346.1</epc></childEPCs>
    </${eventType}>`;
  }

  return `<${eventType}>
      <eventTime>${eventTime}</eventTime>
      <eventTimeZoneOffset>${offset}</eventTimeZoneOffset>
      <action>ADD</action>
      <epcList><epc>urn:epc:id:sgtin:0614141.107346.1</epc></epcList>
    </${eventType}>`;
}

/**
 * Build a complete valid EPCIS XML document with a list of event elements.
 */
function buildEpcisDocument(eventXmls) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<epcis:EPCISDocument xmlns:epcis="urn:epcglobal:epcis:xsd:1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  schemaVersion="1.2" creationDate="2024-01-15T10:00:00Z">
  <EPCISBody>
    <EventList>
      ${eventXmls.join('\n      ')}
    </EventList>
  </EPCISBody>
</epcis:EPCISDocument>`;
}

/**
 * Arbitrary for generating a non-empty array of event types.
 */
const eventTypeListArb = fc.array(
  fc.constantFrom(...EVENT_TYPES),
  { minLength: 1, maxLength: 20 }
);

describe('xmlParser Property Tests', () => {
  it('Property 1: XML Parsing Round-Trip (Event Extraction Completeness) - Feature: epcis-file-analyzer, Property 1: XML Parsing Round-Trip (Event Extraction Completeness)', () => {
    /**
     * Validates: Requirements 1.7
     *
     * For any valid EPCIS XML document containing N events of any type,
     * parsing the document should produce exactly N event objects,
     * each with the correct eventType matching the XML element tag name.
     */
    fc.assert(
      fc.property(eventTypeListArb, (eventTypes) => {
        // Generate XML events for each requested type
        const eventXmls = eventTypes.map((type) => generateEventXml(type));
        const xmlDoc = buildEpcisDocument(eventXmls);

        // Parse the document
        const result = parse(xmlDoc);

        // Should have no parse errors
        expect(result.parseErrors).toHaveLength(0);

        // Should produce exactly N events
        expect(result.events).toHaveLength(eventTypes.length);

        // Count expected events per type
        const expectedCounts = {};
        for (const type of eventTypes) {
          expectedCounts[type] = (expectedCounts[type] || 0) + 1;
        }

        // Count actual events per type
        const actualCounts = {};
        for (const event of result.events) {
          actualCounts[event.eventType] = (actualCounts[event.eventType] || 0) + 1;
        }

        // Each event type count should match
        for (const type of EVENT_TYPES) {
          expect(actualCounts[type] || 0).toBe(expectedCounts[type] || 0);
        }

        // Every event should have a valid eventType that is one of the known types
        for (const event of result.events) {
          expect(EVENT_TYPES).toContain(event.eventType);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('Property 2: Invalid XML Detection - Feature: epcis-file-analyzer, Property 2: Invalid XML Detection', () => {
    /**
     * Validates: Requirements 1.5
     *
     * For any string that is not well-formed XML, the parser should return
     * one or more ParseError entries and zero successfully parsed events.
     */

    // Arbitrary that generates strings which are NOT well-formed XML
    const invalidXmlArb = fc.oneof(
      // Random strings that are clearly not XML
      fc.string({ minLength: 1, maxLength: 200 }).filter((s) => {
        // Only accept strings that won't accidentally be valid XML
        const trimmed = s.trim();
        return trimmed.length > 0 && !trimmed.startsWith('<?xml');
      }),
      // Strings with unclosed tags
      fc.tuple(fc.string({ minLength: 1, maxLength: 50 })).map(([tag]) => {
        const safeName = 'x' + tag.replace(/[^a-zA-Z0-9]/g, '').substring(0, 10);
        return `<${safeName}>content without closing`;
      }),
      // XML with mismatched tags
      fc.tuple(
        fc.stringOf(fc.constantFrom(...'abcdefghijklmnop'.split('')), { minLength: 1, maxLength: 8 }),
        fc.stringOf(fc.constantFrom(...'abcdefghijklmnop'.split('')), { minLength: 1, maxLength: 8 })
      ).filter(([a, b]) => a !== b).map(([a, b]) => `<${a}>content</${b}>`),
      // Completely broken XML with invalid characters in tags
      fc.constant('<root><unclosed>'),
      fc.constant('<<<not xml at all>>>'),
      fc.constant('<a><b></a></b>'),
      fc.constant('<root attr="unclosed>content</root>')
    );

    fc.assert(
      fc.property(invalidXmlArb, (invalidStr) => {
        const result = parse(invalidStr);

        // Should have at least one parse error
        expect(result.parseErrors.length).toBeGreaterThanOrEqual(1);

        // Should have zero successfully parsed events
        expect(result.events).toHaveLength(0);
      }),
      { numRuns: 100 }
    );
  });
});
