import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { classifyAndAggregate } from '../../issueDetector.js';

/**
 * Property tests for issueDetector.js
 * Validates: Requirements 9.1, 9.6
 */

const VALID_SEVERITIES = ['Critical', 'Warning', 'Info'];

/**
 * Generator: produce an arbitrary raw issue object
 */
const issueArb = fc.record({
  severity: fc.constantFrom('Critical', 'Warning', 'Info'),
  title: fc.string({ minLength: 1, maxLength: 80 }),
  description: fc.string({ minLength: 1, maxLength: 200 }),
  affectedItem: fc.oneof(
    fc.string({ minLength: 1, maxLength: 50 }),
    fc.constant('N/A')
  ),
  eventTime: fc.oneof(fc.constant(null), fc.constant('2024-06-01T10:00:00.000Z')),
  xmlPath: fc.string({ minLength: 0, maxLength: 50 }),
  suggestedCorrection: fc.string({ minLength: 0, maxLength: 100 }),
  category: fc.constantFrom('GS1 Format', 'GS1 Structure', 'GS1 Consistency', 'Sequence', 'DSCSA Compliance', 'General'),
});

/**
 * Generator: produce a DSCSA Compliance issue (should always be Critical)
 */
const dscsaIssueArb = fc.record({
  severity: fc.constantFrom('Warning', 'Info'), // intentionally lower severity
  title: fc.string({ minLength: 1, maxLength: 80 }),
  description: fc.string({ minLength: 1, maxLength: 200 }),
  affectedItem: fc.string({ minLength: 1, maxLength: 50 }),
  eventTime: fc.oneof(fc.constant(null), fc.constant('2024-06-01T10:00:00.000Z')),
  xmlPath: fc.string({ minLength: 0, maxLength: 50 }),
  suggestedCorrection: fc.string({ minLength: 0, maxLength: 100 }),
  category: fc.constant('DSCSA Compliance'),
});

describe('Feature: epcis-file-analyzer, Property 13: Severity Classification Determinism', () => {
  /**
   * Validates: Requirements 9.1, 9.6
   *
   * issueDetector.classifyAndAggregate assigns exactly one severity per issue.
   * DSCSA Compliance category always gets Critical.
   */
  it('assigns exactly one valid severity to every issue', () => {
    fc.assert(
      fc.property(
        fc.array(issueArb, { minLength: 1, maxLength: 20 }),
        (rawIssues) => {
          const result = classifyAndAggregate(rawIssues);

          for (const issue of result) {
            // Each issue must have exactly one severity from the valid set
            expect(VALID_SEVERITIES).toContain(issue.severity);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('DSCSA Compliance category issues are always classified as Critical', () => {
    fc.assert(
      fc.property(
        fc.array(dscsaIssueArb, { minLength: 1, maxLength: 10 }),
        (rawIssues) => {
          const result = classifyAndAggregate(rawIssues);

          // All DSCSA issues should be escalated to Critical
          const dscsaIssues = result.filter((i) => i.category === 'DSCSA Compliance');
          for (const issue of dscsaIssues) {
            expect(issue.severity).toBe('Critical');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('output is sorted by severity (Critical first, then Warning, then Info)', () => {
    fc.assert(
      fc.property(
        fc.array(issueArb, { minLength: 2, maxLength: 20 }),
        (rawIssues) => {
          const result = classifyAndAggregate(rawIssues);

          const severityOrder = { Critical: 0, Warning: 1, Info: 2 };
          for (let i = 1; i < result.length; i++) {
            expect(severityOrder[result[i].severity]).toBeGreaterThanOrEqual(
              severityOrder[result[i - 1].severity]
            );
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('removes exact duplicates (same title + affectedItem + xmlPath)', () => {
    fc.assert(
      fc.property(
        issueArb,
        fc.integer({ min: 2, max: 5 }),
        (baseIssue, count) => {
          // Create an array with exact duplicates
          const rawIssues = Array.from({ length: count }, () => ({ ...baseIssue }));
          const result = classifyAndAggregate(rawIssues);

          // After deduplication, should only have 1 instance of this issue
          const matching = result.filter(
            (i) => i.title === baseIssue.title.substring(0, 120) &&
              i.xmlPath === baseIssue.xmlPath
          );
          expect(matching.length).toBeLessThanOrEqual(1);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('handles empty input gracefully', () => {
    const result = classifyAndAggregate([]);
    expect(result).toEqual([]);
  });

  it('handles non-array input gracefully', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.constant(null), fc.constant(undefined), fc.constant('string'), fc.constant(42)),
        (invalidInput) => {
          const result = classifyAndAggregate(invalidInput);
          expect(result).toEqual([]);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('escalates issues matching critical title patterns to Critical', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('malformed xml detected', 'EPCISBody not found', 'EventList not found in document'),
        fc.constantFrom('Warning', 'Info'),
        (criticalTitle, inputSeverity) => {
          const rawIssues = [{
            severity: inputSeverity,
            title: criticalTitle,
            description: 'Test issue',
            affectedItem: 'N/A',
            eventTime: null,
            xmlPath: '',
            suggestedCorrection: '',
            category: 'General',
          }];

          const result = classifyAndAggregate(rawIssues);
          expect(result.length).toBe(1);
          expect(result[0].severity).toBe('Critical');
        }
      ),
      { numRuns: 100 }
    );
  });
});
