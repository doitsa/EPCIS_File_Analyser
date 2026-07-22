import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validateDSCSA } from '../../dscsaValidator.js';

/**
 * Property tests for dscsaValidator.js
 * Validates: Requirements 8.1, 8.2, 8.3, 8.7
 */

/**
 * Generator: produce a well-formed base event
 */
function makeBaseEvent(overrides = {}) {
  return {
    eventType: 'ObjectEvent',
    eventTime: '2024-06-01T10:00:00.000Z',
    eventTimeZoneOffset: '+00:00',
    action: 'OBSERVE',
    bizStep: null,
    disposition: null,
    readPoint: null,
    bizLocation: null,
    epcList: [],
    parentID: null,
    childEPCs: [],
    quantityList: [],
    sourceList: [],
    destinationList: [],
    ilmd: null,
    bizTransactionList: [],
    eventID: null,
    xmlPath: 'EventList/Event[0]',
    ...overrides,
  };
}

/**
 * Generator: produce a TransactionEvent with shipping/receiving bizStep missing TI elements
 */
const shippingReceivingBizStepArb = fc.constantFrom(
  'urn:epcglobal:cbv:bizstep:shipping',
  'urn:epcglobal:cbv:bizstep:receiving'
);

const sgtinEpcArb = fc.stringOf(
  fc.constantFrom(...'0123456789'.split('')),
  { minLength: 4, maxLength: 10 }
).map((serial) => `urn:epc:id:sgtin:0383745.038009.${serial}`);

describe('Feature: epcis-file-analyzer, Property 12: DSCSA Compliance Detection', () => {
  /**
   * Validates: Requirements 8.1, 8.2, 8.3, 8.7
   *
   * For any TransactionEvent with bizStep shipping or receiving that is missing
   * required TI elements (purchase order), the DSCSA validator should report a
   * Critical-severity issue. All DSCSA issues should have severity "Critical".
   */
  it('detects missing TI (no purchase order) in shipping/receiving TransactionEvents', () => {
    fc.assert(
      fc.property(
        shippingReceivingBizStepArb,
        sgtinEpcArb,
        (bizStep, epc) => {
          const event = makeBaseEvent({
            eventType: 'TransactionEvent',
            bizStep,
            epcList: [epc],
            // No bizTransactionList → missing purchase order
            bizTransactionList: [],
            xmlPath: 'EventList/Event[0]',
          });

          const doc = { events: [event] };
          const issues = validateDSCSA(doc);

          // Should report missing TI (no purchase order)
          const tiIssues = issues.filter(
            (i) => i.title.includes('Missing Transaction Information') && i.title.includes('purchase order')
          );
          expect(tiIssues.length).toBeGreaterThan(0);

          // All issues should have Critical severity
          for (const issue of tiIssues) {
            expect(issue.severity).toBe('Critical');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('detects missing TI (no identifiable products) in shipping/receiving TransactionEvents', () => {
    fc.assert(
      fc.property(
        shippingReceivingBizStepArb,
        (bizStep) => {
          const event = makeBaseEvent({
            eventType: 'TransactionEvent',
            bizStep,
            // EPCs that are NOT SGTIN (not identifiable products)
            epcList: ['urn:epc:id:sscc:0383745.1234567890'],
            bizTransactionList: [{ type: 'urn:epcglobal:cbv:btt:po', value: 'PO-12345' }],
            xmlPath: 'EventList/Event[0]',
          });

          const doc = { events: [event] };
          const issues = validateDSCSA(doc);

          // Should report missing identifiable products
          const productIssues = issues.filter(
            (i) => i.title.includes('Missing Transaction Information') && i.title.includes('identifiable products')
          );
          expect(productIssues.length).toBeGreaterThan(0);

          // All DSCSA issues should have Critical severity
          for (const issue of productIssues) {
            expect(issue.severity).toBe('Critical');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('all DSCSA issues have Critical severity and DSCSA Compliance category', () => {
    fc.assert(
      fc.property(
        shippingReceivingBizStepArb,
        sgtinEpcArb,
        (bizStep, epc) => {
          // TransactionEvent missing purchase order + TS indicators
          const event = makeBaseEvent({
            eventType: 'TransactionEvent',
            bizStep,
            epcList: [epc],
            bizTransactionList: [],
            xmlPath: 'EventList/Event[0]',
          });

          const doc = { events: [event] };
          const issues = validateDSCSA(doc);

          // All issues from dscsaValidator should be Critical
          for (const issue of issues) {
            expect(issue.severity).toBe('Critical');
            expect(issue.category).toBe('DSCSA Compliance');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('does not flag non-TransactionEvents for DSCSA TI violations', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('ObjectEvent', 'AggregationEvent', 'TransformationEvent'),
        sgtinEpcArb,
        (eventType, epc) => {
          const event = makeBaseEvent({
            eventType,
            bizStep: 'urn:epcglobal:cbv:bizstep:shipping',
            epcList: [epc],
            bizTransactionList: [],
            xmlPath: 'EventList/Event[0]',
          });

          const doc = { events: [event] };
          const issues = validateDSCSA(doc);

          // Non-TransactionEvents should not trigger TI issues
          const tiIssues = issues.filter(
            (i) => i.title.includes('Missing Transaction Information')
          );
          expect(tiIssues.length).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('detects missing Transaction Statement (TS) in shipping/receiving TransactionEvents', () => {
    fc.assert(
      fc.property(
        shippingReceivingBizStepArb,
        sgtinEpcArb,
        (bizStep, epc) => {
          // TransactionEvent with purchase order but no TS indicator (desadv/recadv)
          const event = makeBaseEvent({
            eventType: 'TransactionEvent',
            bizStep,
            epcList: [epc],
            bizTransactionList: [{ type: 'urn:epcglobal:cbv:btt:po', value: 'PO-12345' }],
            xmlPath: 'EventList/Event[0]',
          });

          const doc = { events: [event] };
          const issues = validateDSCSA(doc);

          // Should report missing TS
          const tsIssues = issues.filter(
            (i) => i.title.includes('Missing Transaction Statement')
          );
          expect(tsIssues.length).toBeGreaterThan(0);
          for (const issue of tsIssues) {
            expect(issue.severity).toBe('Critical');
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
