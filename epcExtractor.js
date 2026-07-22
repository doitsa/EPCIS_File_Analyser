/**
 * epcExtractor.js - EPC URI Parsing & Classification
 *
 * Parses EPC URIs (SGTIN, SSCC, etc.) from EPCIS events and builds
 * classification maps for downstream analysis.
 *
 * @module epcExtractor
 */

/**
 * Calculate the GS1 modulo-10 check digit.
 * @param {string} digits - String of N digits (13 for GTIN, 17 for SSCC)
 * @returns {number} The check digit (0-9)
 */
export function calculateGS1CheckDigit(digits) {
  let sum = 0;
  const len = digits.length;
  for (let i = 0; i < len; i++) {
    const digit = parseInt(digits[i], 10);
    const multiplier = (len - i) % 2 === 0 ? 1 : 3;
    sum += digit * multiplier;
  }
  return (10 - (sum % 10)) % 10;
}

/**
 * Validate a 14-digit GTIN string (check digit verification).
 * @param {string} gtin - 14-digit GTIN string
 * @returns {boolean} True if valid
 */
export function isValidGTIN(gtin) {
  if (!/^\d{14}$/.test(gtin)) return false;
  const check = calculateGS1CheckDigit(gtin.substring(0, 13));
  return check === parseInt(gtin[13], 10);
}

/**
 * Validate an 18-digit SSCC string (check digit verification).
 * @param {string} sscc - 18-digit SSCC string
 * @returns {boolean} True if valid
 */
export function isValidSSCC(sscc) {
  if (!/^\d{18}$/.test(sscc)) return false;
  const check = calculateGS1CheckDigit(sscc.substring(0, 17));
  return check === parseInt(sscc[17], 10);
}

/**
 * Compute a 14-digit GTIN from company prefix and item reference.
 * GTIN = indicator (first digit of itemRef) + companyPrefix + remaining itemRef + check digit
 *
 * @param {string} companyPrefix - GS1 company prefix
 * @param {string} itemReference - Item reference (first digit is indicator)
 * @returns {string} 14-digit GTIN with check digit
 */
export function computeGTIN(companyPrefix, itemReference) {
  const indicator = itemReference[0];
  const gtinBase = indicator + companyPrefix + itemReference.substring(1);
  const checkDigit = calculateGS1CheckDigit(gtinBase);
  return gtinBase + checkDigit;
}

/**
 * Derive NDC (National Drug Code) from a 14-digit GTIN where applicable.
 * NDC is derived from GTIN-14 when GTIN starts with "00" (indicator 0, no packaging).
 *
 * NDC formats (10 digits from positions 3-12 of GTIN-14):
 *  - 4-4-2 pattern: labeler(4)-product(4)-package(2)
 *  - 5-3-2 pattern: labeler(5)-product(3)-package(2)
 *  - 5-4-1 pattern: labeler(5)-product(4)-package(1)
 *
 * We return the 10-digit NDC in 5-4-1 format (most common for pharma) with dashes.
 *
 * @param {string} gtin - 14-digit GTIN
 * @returns {string|null} NDC string with dashes or null if not applicable
 */
export function deriveNDC(gtin) {
  if (!gtin || gtin.length !== 14) return null;
  // NDC derivation applies when GTIN starts with "00"
  // (indicator digit 0 and the leading GTIN-14 zero)
  if (!gtin.startsWith('00')) return null;

  // The 10 NDC digits are positions 3-12 of the GTIN-14 (0-indexed)
  const ndcDigits = gtin.substring(3, 13);

  // Return in 5-4-1 format (most common pharmaceutical NDC format)
  const labeler = ndcDigits.substring(0, 5);
  const product = ndcDigits.substring(5, 9);
  const packageCode = ndcDigits.substring(9, 10);
  return `${labeler}-${product}-${packageCode}`;
}

/**
 * Parse an SGTIN URI into its components.
 * Format: urn:epc:id:sgtin:<CompanyPrefix>.<ItemRef>.<SerialNumber>
 * CompanyPrefix + ItemRef must total 13 digits.
 *
 * @param {string} uri - Full SGTIN URI
 * @returns {ParsedEPC|null} Parsed EPC or null if invalid
 */
export function parseSGTIN(uri) {
  const match = uri.match(/^urn:epc:id:sgtin:(\d+)\.(\d+)\.(.+)$/);
  if (!match) return null;

  const [, companyPrefix, itemReference, serialNumber] = match;

  // CompanyPrefix + ItemRef must total 13 digits
  if (companyPrefix.length + itemReference.length !== 13) return null;

  const gtin = computeGTIN(companyPrefix, itemReference);
  const ndc = deriveNDC(gtin);

  return {
    uri,
    type: 'sgtin',
    companyPrefix,
    itemReference,
    serialNumber,
    gtin,
    ndc,
  };
}

/**
 * Parse an SSCC URI into its components.
 * Format: urn:epc:id:sscc:<CompanyPrefix>.<SerialRef>
 * The full 18-digit SSCC = extensionDigit (first digit of serialRef) + companyPrefix + remaining serialRef + check digit
 *
 * @param {string} uri - Full SSCC URI
 * @returns {ParsedEPC|null} Parsed EPC or null if invalid
 */
export function parseSSCC(uri) {
  const match = uri.match(/^urn:epc:id:sscc:(\d+)\.(\d+)$/);
  if (!match) return null;

  const [, companyPrefix, serialRef] = match;

  // CompanyPrefix + SerialRef must total 17 digits (18 - 1 check digit)
  if (companyPrefix.length + serialRef.length !== 17) return null;

  // Build the 18-digit SSCC: extensionDigit + companyPrefix + remaining serialRef + check digit
  const extensionDigit = serialRef[0];
  const ssccBase = extensionDigit + companyPrefix + serialRef.substring(1);
  const checkDigit = calculateGS1CheckDigit(ssccBase);
  const sscc18 = ssccBase + checkDigit;

  return {
    uri,
    type: 'sscc',
    companyPrefix,
    itemReference: null,
    serialNumber: serialRef,
    gtin: null,
    ndc: null,
    sscc: sscc18,
  };
}

/**
 * Parse any EPC URI and return a ParsedEPC object.
 * Supports SGTIN and SSCC; other formats return a generic 'other' type.
 *
 * @param {string} uri - Full EPC URI
 * @returns {ParsedEPC} Parsed EPC (never null, defaults to 'other' type)
 */
function parseEPC(uri) {
  if (uri.startsWith('urn:epc:id:sgtin:')) {
    const result = parseSGTIN(uri);
    if (result) return result;
  }

  if (uri.startsWith('urn:epc:id:sscc:')) {
    const result = parseSSCC(uri);
    if (result) return result;
  }

  // SGLN or other/unrecognized format
  const sglnMatch = uri.match(/^urn:epc:id:sgln:/);
  const type = sglnMatch ? 'sgln' : 'other';

  return {
    uri,
    type,
    companyPrefix: null,
    itemReference: null,
    serialNumber: null,
    gtin: null,
    ndc: null,
  };
}

/**
 * Extract all EPC URIs from parsed events and build classification maps.
 *
 * @param {EPCISEvent[]} events - Array of parsed EPCIS events
 * @returns {EPCMap} Map with all, bySGTIN, bySSCC, bySerial classifications
 */
export function extractAll(events) {
  /** @type {Map<string, ParsedEPC>} URI -> ParsedEPC */
  const all = new Map();
  /** @type {Map<string, ParsedEPC[]>} GTIN -> ParsedEPC[] */
  const bySGTIN = new Map();
  /** @type {Map<string, ParsedEPC>} SSCC URI -> ParsedEPC */
  const bySSCC = new Map();
  /** @type {Map<string, ParsedEPC>} SerialNumber -> ParsedEPC */
  const bySerial = new Map();

  for (const event of events) {
    // Collect all URIs from the event
    const uris = collectURIsFromEvent(event);

    for (const uri of uris) {
      // Skip if already processed
      if (all.has(uri)) continue;

      const parsed = parseEPC(uri);
      all.set(uri, parsed);

      // Classify by type
      if (parsed.type === 'sgtin' && parsed.gtin) {
        if (!bySGTIN.has(parsed.gtin)) {
          bySGTIN.set(parsed.gtin, []);
        }
        bySGTIN.get(parsed.gtin).push(parsed);

        // Index by serial number
        if (parsed.serialNumber) {
          bySerial.set(parsed.serialNumber, parsed);
        }
      } else if (parsed.type === 'sscc') {
        bySSCC.set(uri, parsed);
      }
    }
  }

  return { all, bySGTIN, bySSCC, bySerial };
}

/**
 * Collect all EPC URIs referenced in an event.
 * Scans epcList, parentID, childEPCs, and quantityList epcClass fields.
 *
 * @param {EPCISEvent} event - A single parsed event
 * @returns {string[]} Array of unique URIs from the event
 */
function collectURIsFromEvent(event) {
  const uris = new Set();

  // epcList
  if (event.epcList) {
    for (const epc of event.epcList) {
      if (epc) uris.add(epc);
    }
  }

  // parentID
  if (event.parentID) {
    uris.add(event.parentID);
  }

  // childEPCs
  if (event.childEPCs) {
    for (const epc of event.childEPCs) {
      if (epc) uris.add(epc);
    }
  }

  // quantityList epcClass
  if (event.quantityList) {
    for (const qty of event.quantityList) {
      if (qty.epcClass) uris.add(qty.epcClass);
    }
  }

  return [...uris];
}
