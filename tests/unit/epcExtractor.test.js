import { describe, it, expect } from 'vitest';
import {
  calculateGS1CheckDigit,
  isValidGTIN,
  isValidSSCC,
  computeGTIN,
  deriveNDC,
  parseSGTIN,
  parseSSCC,
  extractAll,
} from '../../epcExtractor.js';

describe('parseSGTIN', () => {
  it('should parse SGTIN with 7-digit company prefix', () => {
    const uri = 'urn:epc:id:sgtin:0614141.812345.6789';
    const result = parseSGTIN(uri);
    expect(result).not.toBeNull();
    expect(result.type).toBe('sgtin');
    expect(result.companyPrefix).toBe('0614141');
    expect(result.itemReference).toBe('812345');
    expect(result.serialNumber).toBe('6789');
    expect(result.gtin).toHaveLength(14);
    expect(isValidGTIN(result.gtin)).toBe(true);
  });

  it('should parse SGTIN with 10-digit company prefix', () => {
    const uri = 'urn:epc:id:sgtin:0324208001.720.100000290093';
    const result = parseSGTIN(uri);
    expect(result).not.toBeNull();
    expect(result.type).toBe('sgtin');
    expect(result.companyPrefix).toBe('0324208001');
    expect(result.itemReference).toBe('720');
    expect(result.serialNumber).toBe('100000290093');
    expect(result.gtin).toHaveLength(14);
    expect(isValidGTIN(result.gtin)).toBe(true);
  });

  it('should return null when prefix+itemRef does not total 13 digits', () => {
    // 5+5 = 10 (not 13)
    expect(parseSGTIN('urn:epc:id:sgtin:12345.67890.SERIAL')).toBeNull();
    // 8+8 = 16 (not 13)
    expect(parseSGTIN('urn:epc:id:sgtin:12345678.90123456.SERIAL')).toBeNull();
    // 3+3 = 6 (not 13)
    expect(parseSGTIN('urn:epc:id:sgtin:123.456.SERIAL')).toBeNull();
  });

  it('should return null for non-matching URI format', () => {
    expect(parseSGTIN('urn:epc:id:sscc:0363391.10000000001')).toBeNull();
    expect(parseSGTIN('not-a-uri')).toBeNull();
    expect(parseSGTIN('')).toBeNull();
    expect(parseSGTIN('urn:epc:id:sgtin:0363391.005403')).toBeNull(); // missing serial
    expect(parseSGTIN('urn:epc:id:sgtin:0363391')).toBeNull(); // missing dots
  });

  it('should return null for non-digit prefix or item reference', () => {
    expect(parseSGTIN('urn:epc:id:sgtin:abc.def.123')).toBeNull();
    expect(parseSGTIN('urn:epc:id:sgtin:036339X.005403.SN1')).toBeNull();
    expect(parseSGTIN('urn:epc:id:sgtin:0363391.00540A.SN1')).toBeNull();
  });

  it('should handle serial numbers with special characters', () => {
    const uri = 'urn:epc:id:sgtin:0363391.005403.%21SN-123';
    const result = parseSGTIN(uri);
    expect(result).not.toBeNull();
    expect(result.serialNumber).toBe('%21SN-123');
  });

  it('should produce GTIN with valid check digit for all prefix lengths (Req 7.10)', () => {
    const uris = [
      'urn:epc:id:sgtin:038374.5038009.S1',       // 6+7=13
      'urn:epc:id:sgtin:0363391.005403.S2',       // 7+6=13
      'urn:epc:id:sgtin:03633910.05403.S3',       // 8+5=13
      'urn:epc:id:sgtin:036339100.0540.S4',       // 9+4=13
      'urn:epc:id:sgtin:0123456789.012.S5',       // 10+3=13
      'urn:epc:id:sgtin:01234567890.12.S6',       // 11+2=13
      'urn:epc:id:sgtin:012345678901.2.S7',       // 12+1=13
    ];
    for (const uri of uris) {
      const result = parseSGTIN(uri);
      expect(result).not.toBeNull();
      expect(isValidGTIN(result.gtin)).toBe(true);
    }
  });

  it('should derive NDC for GTIN starting with "00"', () => {
    // prefix="0363391", itemRef="005403" → indicator=0, GTIN starts with "00363..."
    const uri = 'urn:epc:id:sgtin:0363391.005403.ABC123';
    const result = parseSGTIN(uri);
    expect(result).not.toBeNull();
    expect(result.gtin.startsWith('00')).toBe(true);
    expect(result.ndc).not.toBeNull();
  });

  it('should return null NDC for GTIN not starting with "00"', () => {
    // itemRef starts with "5" so indicator is "5", GTIN starts with "5"
    const uri = 'urn:epc:id:sgtin:0363391.505403.XYZ';
    const result = parseSGTIN(uri);
    expect(result).not.toBeNull();
    expect(result.ndc).toBeNull();
  });
});

describe('parseSSCC', () => {
  it('should parse valid SSCC URI and return 18-digit sscc field', () => {
    const uri = 'urn:epc:id:sscc:0614141.1234567890';
    const result = parseSSCC(uri);
    expect(result).not.toBeNull();
    expect(result.type).toBe('sscc');
    expect(result.companyPrefix).toBe('0614141');
    expect(result.serialNumber).toBe('1234567890');
    expect(result.sscc).toHaveLength(18);
    expect(result.sscc).toMatch(/^\d{18}$/);
    expect(isValidSSCC(result.sscc)).toBe(true);
  });

  it('should return null when prefix+serialRef does not total 17 digits', () => {
    // 5+5 = 10 (not 17)
    expect(parseSSCC('urn:epc:id:sscc:12345.67890')).toBeNull();
    // 7+12 = 19 (not 17)
    expect(parseSSCC('urn:epc:id:sscc:0363391.123456789012')).toBeNull();
  });

  it('should return null for non-SSCC URI format', () => {
    expect(parseSSCC('urn:epc:id:sgtin:0363391.005403.123')).toBeNull();
    expect(parseSSCC('not-a-uri')).toBeNull();
    expect(parseSSCC('')).toBeNull();
    expect(parseSSCC('urn:epc:id:sscc:0363391')).toBeNull(); // missing serial ref
    expect(parseSSCC('urn:epc:id:sscc:0363391.10000000001.extra')).toBeNull(); // extra segment
  });

  it('should build SSCC as extensionDigit + companyPrefix + remaining serialRef + check', () => {
    const uri = 'urn:epc:id:sscc:0363391.1000000000';
    const result = parseSSCC(uri);
    expect(result).not.toBeNull();
    // extensionDigit is first digit of serialRef = "1"
    expect(result.sscc[0]).toBe('1');
    // companyPrefix follows
    expect(result.sscc.substring(1, 8)).toBe('0363391');
    // Check digit is valid
    expect(isValidSSCC(result.sscc)).toBe(true);
  });

  it('should handle various prefix lengths (Req 7.9)', () => {
    const testCases = [
      'urn:epc:id:sscc:038374.50000000001',    // 6+11=17
      'urn:epc:id:sscc:0363391.1000000000',    // 7+10=17
      'urn:epc:id:sscc:0123456789.1234567',    // 10+7=17
      'urn:epc:id:sscc:012345678901.23456',    // 12+5=17
    ];
    for (const uri of testCases) {
      const result = parseSSCC(uri);
      expect(result).not.toBeNull();
      expect(result.sscc).toHaveLength(18);
      expect(isValidSSCC(result.sscc)).toBe(true);
    }
  });
});

describe('computeGTIN', () => {
  it('should produce 14-digit string with valid check digit', () => {
    const gtin = computeGTIN('0614141', '812345');
    expect(gtin).toHaveLength(14);
    expect(gtin).toMatch(/^\d{14}$/);
    expect(isValidGTIN(gtin)).toBe(true);
  });

  it('should construct GTIN as indicator + prefix + remaining itemRef + check', () => {
    // prefix="0614141", itemRef="812345"
    // indicator = "8", remaining = "12345"
    // GTIN base = "8" + "0614141" + "12345" = "8061414112345"
    const gtin = computeGTIN('0614141', '812345');
    expect(gtin[0]).toBe('8'); // indicator (first digit of itemRef)
    expect(gtin.substring(1, 8)).toBe('0614141'); // prefix
    expect(gtin.substring(8, 13)).toBe('12345'); // remaining itemRef
  });

  it('should handle various prefix lengths', () => {
    // 6-digit prefix + 7-digit item ref
    expect(computeGTIN('038374', '5038009')).toHaveLength(14);
    expect(isValidGTIN(computeGTIN('038374', '5038009'))).toBe(true);

    // 10-digit prefix + 3-digit item ref
    expect(computeGTIN('0123456789', '012')).toHaveLength(14);
    expect(isValidGTIN(computeGTIN('0123456789', '012'))).toBe(true);

    // 12-digit prefix + 1-digit item ref
    expect(computeGTIN('012345678901', '2')).toHaveLength(14);
    expect(isValidGTIN(computeGTIN('012345678901', '2'))).toBe(true);
  });
});

describe('calculateGS1CheckDigit', () => {
  it('should compute known check digit for 0614141812345', () => {
    // We compute the expected check digit manually:
    // Digits: 0 6 1 4 1 4 1 8 1 2 3 4 5
    // Length = 13
    // Multipliers (from left): for position i, multiplier = (len - i) % 2 === 0 ? 1 : 3
    // (13-0)%2=1 → 3, (13-1)%2=0 → 1, (13-2)%2=1 → 3, (13-3)%2=0 → 1, ...
    // 0*3 + 6*1 + 1*3 + 4*1 + 1*3 + 4*1 + 1*3 + 8*1 + 1*3 + 2*1 + 3*3 + 4*1 + 5*3
    // = 0 + 6 + 3 + 4 + 3 + 4 + 3 + 8 + 3 + 2 + 9 + 4 + 15 = 64
    // check = (10 - 64%10)%10 = (10-4)%10 = 6
    const check = calculateGS1CheckDigit('0614141812345');
    expect(check).toBe(6);
  });

  it('should always return a digit between 0 and 9', () => {
    const testBases = ['1234567890123', '9999999999999', '0000000000000', '5050505050505'];
    for (const base of testBases) {
      const check = calculateGS1CheckDigit(base);
      expect(check).toBeGreaterThanOrEqual(0);
      expect(check).toBeLessThanOrEqual(9);
    }
  });

  it('should handle 17-digit SSCC base', () => {
    const check = calculateGS1CheckDigit('00363391000000001');
    expect(typeof check).toBe('number');
    expect(check).toBeGreaterThanOrEqual(0);
    expect(check).toBeLessThanOrEqual(9);
  });
});

describe('isValidGTIN', () => {
  it('should return true for known valid GTIN (00614141812345 + check)', () => {
    // computeGTIN('0614141', '812345') produces a valid GTIN
    const gtin = computeGTIN('0614141', '812345');
    expect(isValidGTIN(gtin)).toBe(true);
    // Also confirm format: starts with "8" (indicator from itemRef "812345")
    expect(gtin[0]).toBe('8');
  });

  it('should return false for GTIN with wrong check digit', () => {
    const gtin = computeGTIN('0614141', '812345');
    // Flip last digit
    const wrongCheck = (parseInt(gtin[13], 10) + 1) % 10;
    const invalidGTIN = gtin.substring(0, 13) + wrongCheck;
    expect(isValidGTIN(invalidGTIN)).toBe(false);
  });

  it('should return false for non-14-digit strings', () => {
    expect(isValidGTIN('12345')).toBe(false);
    expect(isValidGTIN('123456789012345')).toBe(false);
    expect(isValidGTIN('')).toBe(false);
    expect(isValidGTIN('1234567890123')).toBe(false); // 13 digits
  });

  it('should return false for non-numeric 14-char string', () => {
    expect(isValidGTIN('0036339105403a')).toBe(false);
    expect(isValidGTIN('abcdefghijklmn')).toBe(false);
  });

  it('should return false for null or undefined', () => {
    expect(isValidGTIN(null)).toBe(false);
    expect(isValidGTIN(undefined)).toBe(false);
  });

  it('should reject GTIN with corrupted single digit (Req 7.8)', () => {
    const validGTIN = computeGTIN('0614141', '812345');
    expect(isValidGTIN(validGTIN)).toBe(true);
    // Corrupt position 5
    const corrupted = validGTIN.substring(0, 5) + ((parseInt(validGTIN[5]) + 1) % 10) + validGTIN.substring(6);
    expect(isValidGTIN(corrupted)).toBe(false);
  });
});

describe('isValidSSCC', () => {
  it('should return true for valid 18-digit SSCC', () => {
    const base = '00363391000000001';
    const check = calculateGS1CheckDigit(base);
    const sscc = base + check;
    expect(isValidSSCC(sscc)).toBe(true);
  });

  it('should return false for incorrect check digit', () => {
    const base = '00363391000000001';
    const check = calculateGS1CheckDigit(base);
    const wrongCheck = (check + 1) % 10;
    const sscc = base + wrongCheck;
    expect(isValidSSCC(sscc)).toBe(false);
  });

  it('should return false for non-18-digit strings', () => {
    expect(isValidSSCC('12345')).toBe(false);
    expect(isValidSSCC('1234567890123456789')).toBe(false); // 19 digits
    expect(isValidSSCC('12345678901234567')).toBe(false);   // 17 digits
    expect(isValidSSCC('')).toBe(false);
  });

  it('should return false for null or undefined', () => {
    expect(isValidSSCC(null)).toBe(false);
    expect(isValidSSCC(undefined)).toBe(false);
  });

  it('should validate SSCC produced by parseSSCC (Req 7.9)', () => {
    const result = parseSSCC('urn:epc:id:sscc:0614141.1234567890');
    expect(result).not.toBeNull();
    expect(isValidSSCC(result.sscc)).toBe(true);
  });
});

describe('deriveNDC', () => {
  it('should return NDC in 5-4-1 format for GTIN starting with "00"', () => {
    // prefix="0363391", itemRef="005403"
    // GTIN = "0" + "0363391" + "05403" + check → starts with "00"
    const gtin = computeGTIN('0363391', '005403');
    expect(gtin.startsWith('00')).toBe(true);
    const ndc = deriveNDC(gtin);
    expect(ndc).not.toBeNull();
    expect(ndc).toMatch(/^\d{5}-\d{4}-\d{1}$/);
  });

  it('should return null for GTIN not starting with "00"', () => {
    // prefix="0363391", itemRef="505403" → indicator=5, GTIN starts with "5"
    const gtin = computeGTIN('0363391', '505403');
    expect(gtin.startsWith('00')).toBe(false);
    expect(deriveNDC(gtin)).toBeNull();
  });

  it('should return null for null or non-14-digit input', () => {
    expect(deriveNDC(null)).toBeNull();
    expect(deriveNDC('12345')).toBeNull();
    expect(deriveNDC('123456789012345')).toBeNull();
  });

  it('should extract correct NDC digits from GTIN positions 3-12', () => {
    // GTIN from prefix="0363391", itemRef="005403": "0036339105403" + check
    // NDC digits = positions 3-12 = "6339105403"
    // 5-4-1 format = "63391-0540-3"
    const gtin = computeGTIN('0363391', '005403');
    const ndc = deriveNDC(gtin);
    expect(ndc).toBe('63391-0540-3');
  });
});

describe('extractAll', () => {
  it('should return empty maps for empty events array', () => {
    const result = extractAll([]);
    expect(result.all.size).toBe(0);
    expect(result.bySGTIN.size).toBe(0);
    expect(result.bySSCC.size).toBe(0);
    expect(result.bySerial.size).toBe(0);
  });

  it('should correctly populate maps with mixed SGTIN and SSCC URIs', () => {
    const events = [
      {
        epcList: [
          'urn:epc:id:sgtin:0614141.812345.6789',
          'urn:epc:id:sgtin:0614141.812345.9999',
        ],
        parentID: 'urn:epc:id:sscc:0614141.1234567890',
        childEPCs: [],
        quantityList: [],
      },
    ];
    const result = extractAll(events);

    // All 3 unique URIs should be in the all map
    expect(result.all.size).toBe(3);

    // Two SGTINs share the same GTIN
    expect(result.bySGTIN.size).toBe(1);
    const gtinEntries = [...result.bySGTIN.values()][0];
    expect(gtinEntries).toHaveLength(2);

    // One SSCC
    expect(result.bySSCC.size).toBe(1);

    // Two serials indexed
    expect(result.bySerial.size).toBe(2);
    expect(result.bySerial.has('6789')).toBe(true);
    expect(result.bySerial.has('9999')).toBe(true);
  });

  it('should extract from epcList, parentID, childEPCs, and quantityList', () => {
    const events = [
      {
        epcList: ['urn:epc:id:sgtin:0363391.005403.A1'],
        parentID: 'urn:epc:id:sscc:0363391.1000000000',
        childEPCs: ['urn:epc:id:sgtin:0363391.005403.A2'],
        quantityList: [
          { epcClass: 'urn:epc:id:sgtin:0363391.005403.A3', quantity: 5, uom: 'EA' },
        ],
      },
    ];
    const result = extractAll(events);
    expect(result.all.size).toBe(4);
    expect(result.bySGTIN.size).toBe(1); // All SGTINs share same GTIN
    expect(result.bySSCC.size).toBe(1);
    expect(result.bySerial.size).toBe(3);
  });

  it('should deduplicate URIs across events', () => {
    const events = [
      { epcList: ['urn:epc:id:sgtin:0363391.005403.DUP'], parentID: null, childEPCs: [], quantityList: [] },
      { epcList: ['urn:epc:id:sgtin:0363391.005403.DUP'], parentID: null, childEPCs: [], quantityList: [] },
    ];
    const result = extractAll(events);
    expect(result.all.size).toBe(1);
  });

  it('should handle events with missing/null fields gracefully', () => {
    const events = [
      { epcList: null, parentID: null, childEPCs: null, quantityList: null },
      { epcList: undefined },
      {},
    ];
    const result = extractAll(events);
    expect(result.all.size).toBe(0);
  });

  it('should classify unrecognized URIs as "other" type', () => {
    const events = [{
      epcList: ['urn:epc:id:grai:1234567.12345.SERIAL'],
      parentID: null,
      childEPCs: [],
      quantityList: [],
    }];
    const result = extractAll(events);
    const parsed = result.all.get('urn:epc:id:grai:1234567.12345.SERIAL');
    expect(parsed.type).toBe('other');
  });
});
