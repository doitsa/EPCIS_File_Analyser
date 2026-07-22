import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validateSequences } from '../../sequenceValidator.js';

/**
 * Property tests for sequenceValidator.js
 * Validates: Requirements 7.7, 7.21, 7.22
 */

// Business step ordering used by the validator
const BIZ_STEP_ORDER = {
  'commissioning': 1,
  'packing': 2,
  'shipping': 3,
  'receiving': 4,
  'decommissioning': 5,
  'destroying': 5,
};

const BIZ_STEPS_ORDERED = ['commissioning', 'packing', 'shipping', 'receiving', 'decommissioning'];

/**
 * Generator: produce an EPC URI
 */
const epcArb = fc.stringOf(
  fc.constantFrom(...'0123456789'.split('')),
  { minLength: 4, maxLength: 8 }
).map((serial) => `urn:epc:id:sgtin:0383745.038009.${serial}`);

/**
 * Generator: produce an ISO 8601 timestamp string with controlled ordering
 */
function makeTimestamp(year, month, day, hour) {
  const y = String(year).padStart(4, '0');
  const m = String(month).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  const h = String(hour).padStart(2, '0');
  return `${y}-${m}-${d}T${h}:00:00.000Z`;
}

describe('Feature: epcis-file-analyzer, Property 6: Business Step Sequence Violation Detection', () => {
  /**
   * Validates: Requirements 7.7, 7.21, 7.22
   *
   * For any EPC with 2+ events where a logically later step has earlier eventTime
   * than a logically earlier step for the same EPC, sequenceValidator should report a violation.
   */
  it('detects sequence violations when a later business step has an earlier eventTime', () => {
    fc.assert(
      fc.property(
        // Pick two distinct biz steps with different order values
        fc.integer({ min: 0, max: 3 }).chain((earlierIdx) => {
          const laterIdx = earlierIdx + 1; // guaranteed to be higher order
          return fc.tuple(
            fc.constant(BIZ_STEPS_ORDERED[earlierIdx]),
            fc.constant(BIZ_STEPS_ORDERED[laterIdx]),
            epcArb
          );
        }),
        ([earlierStep, laterStep, epc]) => {
          // Create a doc where the later step (higher order) has an EARLIER timestamp
          // and the earlier step (lower order) has a LATER timestamp.
          // Events are sorted by eventTime, so the laterStep event comes first chronologically.
          const doc = {
            events: [
              {
                eventType: 'ObjectEvent',
                eventTime: '2024-01-01T08:00:00.000Z', // earlier time
                bizStep: `urn:epcglobal:cbv:bizstep:${laterStep}`, // but this is a later step
                action: 'ADD',
                epcList: [epc],
                xmlPath: 'EventList/Event[0]',
              },
              {
                eventType: 'ObjectEvent',
                eventTime: '2024-01-02T08:00:00.000Z', // later time
                bizStep: `urn:epcglobal:cbv:bizstep:${earlierStep}`, // but this is an earlier step
                action: 'OBSERVE',
                epcList: [epc],
                xmlPath: 'EventList/Event[1]',
              },
            ],
          };

          const issues = validateSequences(doc);

          // Should detect a business step sequence violation
          const sequenceViolations = issues.filter(
            (i) => i.title === 'Business step sequence violation' && i.affectedItem === epc
          );
          expect(sequenceViolations.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('reports no violations when events follow the correct business step order', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 3 }).chain((earlierIdx) => {
          const laterIdx = earlierIdx + 1;
          return fc.tuple(
            fc.constant(BIZ_STEPS_ORDERED[earlierIdx]),
            fc.constant(BIZ_STEPS_ORDERED[laterIdx]),
            epcArb
          );
        }),
        ([earlierStep, laterStep, epc]) => {
          // Correct order: earlier step has earlier timestamp, later step has later timestamp
          const doc = {
            events: [
              {
                eventType: 'ObjectEvent',
                eventTime: '2024-01-01T08:00:00.000Z',
                bizStep: `urn:epcglobal:cbv:bizstep:${earlierStep}`,
                action: 'ADD',
                epcList: [epc],
                xmlPath: 'EventList/Event[0]',
              },
              {
                eventType: 'ObjectEvent',
                eventTime: '2024-01-02T08:00:00.000Z',
                bizStep: `urn:epcglobal:cbv:bizstep:${laterStep}`,
                action: 'OBSERVE',
                epcList: [epc],
                xmlPath: 'EventList/Event[1]',
              },
            ],
          };

          const issues = validateSequences(doc);
          const sequenceViolations = issues.filter(
            (i) => i.title === 'Business step sequence violation' && i.affectedItem === epc
          );
          expect(sequenceViolations.length).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});
