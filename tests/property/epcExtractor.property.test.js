import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  calculateGS1CheckDigit,
  isValidGTIN,
  isValidSSCC,
  computeGTIN,
  parseSGTIN,
  parseSSCC,
} from '../../epcExtractor.js';

/**
 * Property tests for epcExtractor.js
 * Validates: Requirements 7.8, 7.9, 7.10
 */

describe('Feature: epcis-file-analyzer, Property 3: GTIN Check Digit Round-Trip', () => {
  it('for any 13-digit numeric string, appending the computed check digit produces a valid GTIN', () => {
    fc.assert(
      fc.property(
        fc.stringOf(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), { minLength: 13, maxLength: 13 }),
        (digits13) => {
          const checkDigit = calculateGS1CheckDigit(digits13);
          const gtin14 = digits13 + String(checkDigit);
          expect(gtin14).toHaveLength(14);
          expect(isValidGTIN(gtin14)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Validates: Requirements 7.8
   */
  it('for any 14-digit string where the last digit does not equal the computed check digit, isValidGTIN returns false', () => {
    fc.assert(
      fc.property(
        fc.stringOf(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), { minLength: 13, maxLength: 13 }),
        fc.integer({ min: 0, max: 9 }),
        (digits13, wrongDigit) => {
          const correctCheckDigit = calculateGS1CheckDigit(digits13);
          // Only test when the wrong digit differs from the correct one
          fc.pre(wrongDigit !== correctCheckDigit);
          const invalidGtin = digits13 + String(wrongDigit);
          expect(isValidGTIN(invalidGtin)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Feature: epcis-file-analyzer, Property 4: SSCC Check Digit Round-Trip', () => {
  it('for any 17-digit numeric string, appending the computed check digit produces a valid SSCC', () => {
    fc.assert(
      fc.property(
        fc.stringOf(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), { minLength: 17, maxLength: 17 }),
        (digits17) => {
          const checkDigit = calculateGS1CheckDigit(digits17);
          const sscc18 = digits17 + String(checkDigit);
          expect(sscc18).toHaveLength(18);
          expect(isValidSSCC(sscc18)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Validates: Requirements 7.9
   */
  it('for any 18-digit string where the last digit does not equal the computed check digit, isValidSSCC returns false', () => {
    fc.assert(
      fc.property(
        fc.stringOf(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), { minLength: 17, maxLength: 17 }),
        fc.integer({ min: 0, max: 9 }),
        (digits17, wrongDigit) => {
          const correctCheckDigit = calculateGS1CheckDigit(digits17);
          fc.pre(wrongDigit !== correctCheckDigit);
          const invalidSscc = digits17 + String(wrongDigit);
          expect(isValidSSCC(invalidSscc)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Feature: epcis-file-analyzer, Property 5: SGTIN URI Parsing Round-Trip', () => {
  /**
   * Validates: Requirements 7.10
   *
   * Generator: produces valid SGTIN URIs where companyPrefix + itemReference = 13 digits.
   * Company prefix length ranges from 6 to 12 (GS1 standard range), item reference fills the rest.
   */
  const validSgtinArb = fc
    .integer({ min: 6, max: 12 })
    .chain((prefixLen) => {
      const itemRefLen = 13 - prefixLen;
      return fc.tuple(
        // Company prefix: prefixLen digits, first digit non-zero to be realistic
        fc.stringOf(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), { minLength: prefixLen, maxLength: prefixLen }),
        // Item reference: itemRefLen digits (first digit is the indicator digit)
        fc.stringOf(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), { minLength: itemRefLen, maxLength: itemRefLen }),
        // Serial number: arbitrary non-empty alphanumeric string
        fc.stringOf(fc.constantFrom(...'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.split('')), { minLength: 1, maxLength: 20 })
      );
    });

  it('for any valid SGTIN URI, parseSGTIN extracts components and computes a valid 14-digit GTIN', () => {
    fc.assert(
      fc.property(validSgtinArb, ([companyPrefix, itemReference, serialNumber]) => {
        const uri = `urn:epc:id:sgtin:${companyPrefix}.${itemReference}.${serialNumber}`;
        const result = parseSGTIN(uri);

        // Should successfully parse
        expect(result).not.toBeNull();
        expect(result.companyPrefix).toBe(companyPrefix);
        expect(result.itemReference).toBe(itemReference);
        expect(result.serialNumber).toBe(serialNumber);

        // Computed GTIN should be 14 digits and valid
        expect(result.gtin).toHaveLength(14);
        expect(isValidGTIN(result.gtin)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('for any URI that does not match the SGTIN pattern, parseSGTIN returns null', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          // Completely random strings
          fc.string({ minLength: 0, maxLength: 50 }),
          // URIs with wrong scheme
          fc.string({ minLength: 1, maxLength: 30 }).map((s) => `urn:epc:id:sscc:${s}`),
          // Missing parts
          fc.stringOf(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), { minLength: 5, maxLength: 10 })
            .map((s) => `urn:epc:id:sgtin:${s}`)
        ),
        (uri) => {
          // Filter out cases that accidentally match valid SGTIN pattern
          const match = uri.match(/^urn:epc:id:sgtin:(\d+)\.(\d+)\.(.+)$/);
          if (match) {
            const [, cp, ir] = match;
            fc.pre(cp.length + ir.length !== 13);
          }
          const result = parseSGTIN(uri);
          expect(result).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('for any SGTIN URI whose prefix+itemRef does not total 13 digits, parseSGTIN returns null', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          // Company prefix with lengths that won't sum to 13 with item reference
          fc.integer({ min: 1, max: 5 }).chain((prefixLen) =>
            fc.tuple(
              fc.stringOf(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), { minLength: prefixLen, maxLength: prefixLen }),
              // Item reference length chosen so prefix + itemRef != 13
              fc.integer({ min: 1, max: 5 }).chain((itemRefLen) =>
                fc.stringOf(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), { minLength: itemRefLen, maxLength: itemRefLen })
              )
            )
          ),
          fc.string({ minLength: 1, maxLength: 10 })
        ),
        ([[companyPrefix, itemReference], serialNumber]) => {
          // Ensure prefix + itemRef != 13
          fc.pre(companyPrefix.length + itemReference.length !== 13);
          // Ensure serial doesn't contain dots (would break parsing)
          fc.pre(!serialNumber.includes('.') && serialNumber.length > 0);
          const uri = `urn:epc:id:sgtin:${companyPrefix}.${itemReference}.${serialNumber}`;
          const result = parseSGTIN(uri);
          expect(result).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });
});
