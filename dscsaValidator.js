/**
 * dscsaValidator.js - DSCSA Compliance Validator
 *
 * Validates EPCIS documents against Drug Supply Chain Security Act (DSCSA)
 * traceability requirements including Transaction Information (TI),
 * Transaction History (TH), Transaction Statement (TS), verification data,
 * suspect/illegitimate product handling, and void shipping notifications.
 *
 * @module dscsaValidator
 */

/**
 * Extract the last segment of a URI after the last '/' or ':' for comparison.
 * @param {string|null} uri - The full URI string
 * @returns {string} The last segment, lowercased
 */
function extractBizStepSegment(uri) {
  if (!uri) return '';
  const lastSlash = uri.lastIndexOf('/');
  const lastColon = uri.lastIndexOf(':');
  const pos = Math.max(lastSlash, lastColon);
  if (pos >= 0) {
    return uri.substring(pos + 1).toLowerCase();
  }
  return uri.toLowerCase();
}

/**
 * Check if a bizStep matches one of the target steps (case-insensitive last segment).
 * @param {string|null} bizStep - The full bizStep URI
 * @param {string[]} targets - Array of target step names to match
 * @returns {boolean}
 */
function bizStepMatches(bizStep, targets) {
  const segment = extractBizStepSegment(bizStep);
  return targets.some((t) => segment === t.toLowerCase());
}

/**
 * Check if a disposition matches one of the target dispositions (case-insensitive last segment).
 * @param {string|null} disposition - The full disposition URI
 * @param {string[]} targets - Array of target disposition names to match
 * @returns {boolean}
 */
function dispositionMatches(disposition, targets) {
  if (!disposition) return false;
  const segment = extractBizStepSegment(disposition);
  return targets.some((t) => segment === t.toLowerCase());
}

/**
 * Check if an EPC is an SGTIN URI (identifiable product).
 * @param {string} epc - EPC URI string
 * @returns {boolean}
 */
function isSGTIN(epc) {
  return epc.toLowerCase().includes(':sgtin:');
}

/**
 * Check if there are identifiable products (SGTINs) in epcList or quantityList.
 * @param {object} event - Parsed EPCIS event
 * @returns {boolean}
 */
function hasIdentifiableProducts(event) {
  // Check epcList for SGTIN URIs
  if (event.epcList && event.epcList.length > 0) {
    if (event.epcList.some(isSGTIN)) return true;
  }
  // Check quantityList for SGTIN-based epcClass URIs
  if (event.quantityList && event.quantityList.length > 0) {
    if (event.quantityList.some((q) => isSGTIN(q.epcClass || ''))) return true;
  }
  return false;
}

/**
 * Determine if source and destination reference different parties (change of ownership).
 * @param {object} event - Parsed EPCIS event
 * @returns {boolean}
 */
function isChangeOfOwnership(event) {
  const sources = event.sourceList || [];
  const destinations = event.destinationList || [];
  if (sources.length === 0 || destinations.length === 0) return false;

  // Collect all source values
  const sourceValues = new Set(sources.map((s) => s.value.toLowerCase()));
  // Check if any destination differs from all sources
  for (const dest of destinations) {
    if (!sourceValues.has(dest.value.toLowerCase())) {
      return true;
    }
  }
  return false;
}

/**
 * Check if a bizTransaction type contains a specific keyword.
 * @param {object[]} bizTransactionList - Array of { type, value }
 * @param {string} keyword - Keyword to search for in type URIs
 * @returns {boolean}
 */
function hasBizTransactionType(bizTransactionList, keyword) {
  if (!bizTransactionList || bizTransactionList.length === 0) return false;
  return bizTransactionList.some(
    (bt) => bt.type && bt.type.toLowerCase().includes(keyword.toLowerCase())
  );
}

/**
 * Build a map of EPC -> ILMD data from prior commissioning events.
 * @param {object[]} events - All parsed events
 * @returns {Map<string, object>} Map from EPC to ILMD data
 */
function buildILMDMap(events) {
  const ilmdMap = new Map();
  for (const event of events) {
    if (
      event.eventType === 'ObjectEvent' &&
      event.action === 'ADD' &&
      bizStepMatches(event.bizStep, ['commissioning']) &&
      event.ilmd
    ) {
      const epcs = event.epcList || [];
      for (const epc of epcs) {
        ilmdMap.set(epc, event.ilmd);
      }
    }
  }
  return ilmdMap;
}

/**
 * Create an Issue object with DSCSA Compliance category and Critical severity.
 * @param {object} params - Issue parameters
 * @returns {object} Issue object
 */
function createIssue({ title, description, affectedItem, eventTime, xmlPath, suggestedCorrection }) {
  return {
    severity: 'Critical',
    title: title.substring(0, 120),
    description: description.substring(0, 500),
    affectedItem: affectedItem || 'N/A',
    eventTime: eventTime || null,
    xmlPath: xmlPath || '',
    suggestedCorrection: suggestedCorrection || '',
    category: 'DSCSA Compliance',
  };
}

/**
 * Validate missing Transaction Information (TI) in shipping/receiving TransactionEvents.
 * Required TI: at least one bizTransaction (purchase order) and identifiable products (SGTIN URIs).
 * @param {object} event - Parsed EPCIS event
 * @returns {object[]} Array of issues
 */
function validateTI(event) {
  const issues = [];

  if (event.eventType !== 'TransactionEvent') return issues;
  if (!bizStepMatches(event.bizStep, ['shipping', 'receiving'])) return issues;

  const bizTransactions = event.bizTransactionList || [];
  const hasPurchaseOrder = bizTransactions.some(
    (bt) => bt.type && (bt.type.toLowerCase().includes('po') || bt.type.toLowerCase().includes('purchaseorder'))
  );

  if (!hasPurchaseOrder) {
    issues.push(
      createIssue({
        title: 'DSCSA: Missing Transaction Information (TI) - No purchase order',
        description:
          'TransactionEvent with shipping/receiving bizStep is missing a purchase order bizTransaction. DSCSA requires Transaction Information including purchase order number for all shipping and receiving events.',
        affectedItem: (event.epcList && event.epcList[0]) || 'N/A',
        eventTime: event.eventTime,
        xmlPath: event.xmlPath,
        suggestedCorrection:
          'Add a bizTransaction element with type "urn:epcglobal:cbv:btt:po" containing the purchase order number.',
      })
    );
  }

  if (!hasIdentifiableProducts(event)) {
    issues.push(
      createIssue({
        title: 'DSCSA: Missing Transaction Information (TI) - No identifiable products',
        description:
          'TransactionEvent with shipping/receiving bizStep has no identifiable products (SGTIN URIs) in epcList or quantityList. DSCSA requires product identifiers in Transaction Information.',
        affectedItem: 'N/A',
        eventTime: event.eventTime,
        xmlPath: event.xmlPath,
        suggestedCorrection:
          'Add SGTIN URIs to the epcList or quantityList elements to identify the products in this transaction.',
      })
    );
  }

  return issues;
}

/**
 * Validate missing Transaction History (TH) in change-of-ownership TransactionEvents.
 * Events with different source and destination parties must have a prior transaction reference.
 * @param {object} event - Parsed EPCIS event
 * @returns {object[]} Array of issues
 */
function validateTH(event) {
  const issues = [];

  if (event.eventType !== 'TransactionEvent') return issues;
  if (!isChangeOfOwnership(event)) return issues;

  // TH requires at least one bizTransaction referencing a prior transaction type
  // Prior transaction types include 'inv' (invoice), 'prodorder', 'po' (purchase order) from prior owner
  // We check for more than one bizTransaction or one that references prior ownership
  const bizTransactions = event.bizTransactionList || [];

  // Check if there's a bizTransaction that could serve as a prior transaction reference
  // A prior transaction reference is typically a second bizTransaction linking to previous owner's data
  const hasPriorRef = bizTransactions.length >= 2 ||
    bizTransactions.some(
      (bt) =>
        bt.type &&
        (bt.type.toLowerCase().includes('inv') ||
          bt.type.toLowerCase().includes('receipt') ||
          bt.type.toLowerCase().includes('prodorder'))
    );

  if (!hasPriorRef) {
    issues.push(
      createIssue({
        title: 'DSCSA: Missing Transaction History (TH)',
        description:
          'TransactionEvent representing a change of ownership (different source and destination parties) is missing Transaction History. DSCSA requires at least one prior transaction reference linking to the previous owner\'s transaction data.',
        affectedItem: (event.epcList && event.epcList[0]) || 'N/A',
        eventTime: event.eventTime,
        xmlPath: event.xmlPath,
        suggestedCorrection:
          'Add a bizTransaction element referencing the prior transaction from the previous owner (e.g., type "urn:epcglobal:cbv:btt:inv" or additional PO reference).',
      })
    );
  }

  return issues;
}

/**
 * Validate missing Transaction Statement (TS) in shipping/receiving TransactionEvents.
 * TS is represented by a bizTransaction of type containing 'desadv' (for shipping) or 'recadv' (for receiving).
 * @param {object} event - Parsed EPCIS event
 * @returns {object[]} Array of issues
 */
function validateTS(event) {
  const issues = [];

  if (event.eventType !== 'TransactionEvent') return issues;
  if (!bizStepMatches(event.bizStep, ['shipping', 'receiving'])) return issues;

  const hasDesadv = hasBizTransactionType(event.bizTransactionList, 'desadv');
  const hasRecadv = hasBizTransactionType(event.bizTransactionList, 'recadv');

  if (!hasDesadv && !hasRecadv) {
    issues.push(
      createIssue({
        title: 'DSCSA: Missing Transaction Statement (TS)',
        description:
          'TransactionEvent with shipping/receiving bizStep is missing a Transaction Statement indicator. DSCSA requires a bizTransaction of type "desadv" or "recadv" confirming the transaction is authorized and legitimate.',
        affectedItem: (event.epcList && event.epcList[0]) || 'N/A',
        eventTime: event.eventTime,
        xmlPath: event.xmlPath,
        suggestedCorrection:
          'Add a bizTransaction element with type "urn:epcglobal:cbv:btt:desadv" (shipping) or "urn:epcglobal:cbv:btt:recadv" (receiving) to confirm transaction legitimacy.',
      })
    );
  }

  return issues;
}

/**
 * Validate missing verification data (GTIN, serial, lot, expiration) in TransactionEvents.
 * Checks if EPCs can be resolved to GTIN+serial and if ILMD data is available.
 * @param {object} event - Parsed EPCIS event
 * @param {Map<string, object>} ilmdMap - Map from EPC to ILMD data from prior events
 * @returns {object[]} Array of issues
 */
function validateVerificationData(event, ilmdMap) {
  const issues = [];

  if (event.eventType !== 'TransactionEvent') return issues;

  const epcs = event.epcList || [];
  if (epcs.length === 0) return issues;

  // Check if EPCs have GTIN+serial (are SGTINs)
  const sgtinEpcs = epcs.filter(isSGTIN);
  if (sgtinEpcs.length === 0 && epcs.length > 0) {
    issues.push(
      createIssue({
        title: 'DSCSA: Missing verification data - No GTIN/serial identifiers',
        description:
          'TransactionEvent contains EPCs that cannot be resolved to GTIN and serial number. DSCSA requires product identifier (GTIN) and serial number for verification.',
        affectedItem: epcs[0] || 'N/A',
        eventTime: event.eventTime,
        xmlPath: event.xmlPath,
        suggestedCorrection:
          'Use SGTIN URIs (urn:epc:id:sgtin:...) in the epcList to provide GTIN and serial number identification.',
      })
    );
    return issues;
  }

  // Check if lot/expiration is available from ILMD data
  for (const epc of sgtinEpcs) {
    const ilmd = ilmdMap.get(epc);
    if (!ilmd || !ilmd.lotNumber || !ilmd.expirationDate) {
      issues.push(
        createIssue({
          title: 'DSCSA: Missing verification data - Lot/expiration unavailable',
          description:
            `TransactionEvent references EPC "${epc}" but lot number or expiration date cannot be established from prior commissioning ILMD data. DSCSA requires lot and expiration for product verification.`,
          affectedItem: epc,
          eventTime: event.eventTime,
          xmlPath: event.xmlPath,
          suggestedCorrection:
            'Ensure the referenced product has a prior commissioning ObjectEvent with ILMD containing lotNumber and itemExpirationDate.',
        })
      );
      break; // Report once per event to avoid excessive issues
    }
  }

  return issues;
}

/**
 * Validate suspect/illegitimate product handling.
 * Events with disposition 'recalled' or 'suspended' must have bizStep 'holding' or 'destroying'.
 * @param {object} event - Parsed EPCIS event
 * @returns {object[]} Array of issues
 */
function validateSuspectProduct(event) {
  const issues = [];

  if (!dispositionMatches(event.disposition, ['recalled', 'suspended'])) return issues;

  if (!bizStepMatches(event.bizStep, ['holding', 'destroying'])) {
    issues.push(
      createIssue({
        title: 'DSCSA: Recalled/suspended product without holding or destroying bizStep',
        description:
          `Event has disposition "${event.disposition}" indicating a recalled or suspended product, but the bizStep is not "holding" or "destroying". DSCSA requires proper quarantine or destruction action for suspect/illegitimate products.`,
        affectedItem: (event.epcList && event.epcList[0]) || event.parentID || 'N/A',
        eventTime: event.eventTime,
        xmlPath: event.xmlPath,
        suggestedCorrection:
          'Set the bizStep to "urn:epcglobal:cbv:bizstep:holding" (for quarantine) or "urn:epcglobal:cbv:bizstep:destroying" (for destruction) when disposition is recalled or suspended.',
      })
    );
  }

  return issues;
}

/**
 * Validate void shipping notification data.
 * Events with bizStep 'void_shipping' must have disposition, sourceList, and destinationList.
 * @param {object} event - Parsed EPCIS event
 * @returns {object[]} Array of issues
 */
function validateVoidShipping(event) {
  const issues = [];

  if (!bizStepMatches(event.bizStep, ['void_shipping'])) return issues;

  const missingParts = [];

  if (!event.disposition) {
    missingParts.push('disposition');
  }

  const sources = event.sourceList || [];
  if (sources.length === 0) {
    missingParts.push('source party identifier');
  }

  const destinations = event.destinationList || [];
  if (destinations.length === 0) {
    missingParts.push('destination party identifier');
  }

  if (missingParts.length > 0) {
    issues.push(
      createIssue({
        title: 'DSCSA: Void shipping missing required notification data',
        description:
          `Event with bizStep "void_shipping" is missing required notification data: ${missingParts.join(', ')}. DSCSA requires disposition, source party (reporter), and destination party (notified entity) for void shipping notifications.`,
        affectedItem: (event.epcList && event.epcList[0]) || event.parentID || 'N/A',
        eventTime: event.eventTime,
        xmlPath: event.xmlPath,
        suggestedCorrection:
          `Add the missing elements: ${missingParts.join(', ')}. Include disposition, sourceList with reporting party, and destinationList with notified party.`,
      })
    );
  }

  return issues;
}

/**
 * Validate an EPCIS document for DSCSA compliance.
 * @param {object} doc - Parsed EPCIS document (from xmlParser.parse())
 * @returns {object[]} Array of Issue objects with category 'DSCSA Compliance'
 */
export function validateDSCSA(doc) {
  const issues = [];

  if (!doc || !doc.events || doc.events.length === 0) {
    return issues;
  }

  // Build ILMD map from commissioning events for verification data checks
  const ilmdMap = buildILMDMap(doc.events);

  for (const event of doc.events) {
    // 1. Missing TI in shipping/receiving TransactionEvents
    issues.push(...validateTI(event));

    // 2. Missing TH in change-of-ownership TransactionEvents
    issues.push(...validateTH(event));

    // 3. Missing TS in shipping/receiving TransactionEvents
    issues.push(...validateTS(event));

    // 4. Missing verification data in TransactionEvents
    issues.push(...validateVerificationData(event, ilmdMap));

    // 5. Suspect/illegitimate product handling
    issues.push(...validateSuspectProduct(event));

    // 6. Void shipping notification data
    issues.push(...validateVoidShipping(event));
  }

  return issues;
}
