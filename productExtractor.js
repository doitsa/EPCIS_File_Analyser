/**
 * productExtractor.js - Product & Master Data Extraction
 *
 * Extracts per-product metrics from a parsed EPCIS document and EPC classification map.
 * Produces one ProductInfo entry per distinct GTIN found in SGTIN URIs.
 *
 * @module productExtractor
 */

/**
 * Build the SGTIN pattern string for a given company prefix and item reference.
 * Pattern format: "urn:epc:id:sgtin:<companyPrefix>.<itemReference>.*"
 *
 * @param {string} companyPrefix
 * @param {string} itemReference
 * @returns {string}
 */
function buildSGTINPattern(companyPrefix, itemReference) {
  return `urn:epc:id:sgtin:${companyPrefix}.${itemReference}.*`;
}

/**
 * Build the idpat pattern used in master data vocabulary element IDs.
 * Pattern format: "urn:epc:idpat:sgtin:<companyPrefix>.<itemReference>.*"
 *
 * @param {string} companyPrefix
 * @param {string} itemReference
 * @returns {string}
 */
function buildIdpatPattern(companyPrefix, itemReference) {
  return `urn:epc:idpat:sgtin:${companyPrefix}.${itemReference}.*`;
}

/**
 * Look up product name from master data using the idpat SGTIN pattern.
 * Searches masterData entries whose id matches the product's idpat pattern.
 * Falls back to checking the descriptionShort or other name-related attributes.
 *
 * @param {object} masterData - Map of id -> MasterDataEntry
 * @param {string} idpatPattern - The idpat pattern to match
 * @returns {string|null} Product name or null
 */
function findProductName(masterData, idpatPattern) {
  const entry = masterData[idpatPattern];
  if (!entry || !entry.attributes) return null;

  // Check common master data attribute keys for product name
  const nameKeys = [
    'urn:epcglobal:cbv:mda#descriptionShort',
    'urn:epcglobal:cbv:mda#description',
    'urn:epcglobal:cbv:mda#productName',
    'urn:epcglobal:cbv:mda#additionalTradeItemDescription',
    'urn:epcglobal:cbv:mda#tradeItemDescription',
  ];

  for (const key of nameKeys) {
    if (entry.attributes[key]) {
      return entry.attributes[key];
    }
  }

  return null;
}

/**
 * Look up NDC from master data for a given product idpat pattern.
 *
 * @param {object} masterData - Map of id -> MasterDataEntry
 * @param {string} idpatPattern - The idpat pattern to match
 * @returns {string|null} NDC string or null
 */
function findNDCFromMasterData(masterData, idpatPattern) {
  const entry = masterData[idpatPattern];
  if (!entry || !entry.attributes) return null;

  const ndcKeys = [
    'urn:epcglobal:cbv:mda#ndc',
    'urn:epcglobal:cbv:mda#nationalDrugCode',
  ];

  for (const key of ndcKeys) {
    if (entry.attributes[key]) {
      return entry.attributes[key];
    }
  }

  return null;
}

/**
 * Determine if an event is a commissioning ObjectEvent (action ADD with bizStep containing 'commissioning').
 *
 * @param {object} event - Parsed EPCIS event
 * @returns {boolean}
 */
function isCommissioningEvent(event) {
  return (
    event.eventType === 'ObjectEvent' &&
    event.action === 'ADD' &&
    event.bizStep != null &&
    event.bizStep.includes('commissioning')
  );
}

/**
 * Determine if an event is an AggregationEvent with action ADD.
 *
 * @param {object} event - Parsed EPCIS event
 * @returns {boolean}
 */
function isAggregationAddEvent(event) {
  return event.eventType === 'AggregationEvent' && event.action === 'ADD';
}

/**
 * Check if a URI is an SSCC URI.
 *
 * @param {string} uri
 * @returns {boolean}
 */
function isSSCCUri(uri) {
  return uri != null && uri.startsWith('urn:epc:id:sscc:');
}

/**
 * Extract the GTIN from a parsed EPC in the epcMap.
 *
 * @param {Map<string, object>} allEpcs - The epcMap.all map
 * @param {string} uri - EPC URI to look up
 * @returns {string|null} GTIN or null
 */
function getGtinForUri(allEpcs, uri) {
  const parsed = allEpcs.get(uri);
  if (parsed && parsed.type === 'sgtin' && parsed.gtin) {
    return parsed.gtin;
  }
  return null;
}

/**
 * Extract lot numbers and expiration dates from commissioning events for a specific GTIN.
 * Per requirement 4.4 and 4.5: extracted from ILMD data in ObjectEvents with action ADD
 * and bizStep containing 'commissioning' that reference EPCs of that product's GTIN.
 *
 * @param {object[]} events - All parsed events
 * @param {Map<string, object>} allEpcs - The epcMap.all map
 * @param {string} targetGtin - The GTIN to filter for
 * @returns {{ lotNumbers: string[], expirationDates: string[] }}
 */
function extractLotAndExpirationForGtin(events, allEpcs, targetGtin) {
  const lotNumbers = new Set();
  const expirationDates = new Set();

  for (const event of events) {
    if (!isCommissioningEvent(event)) continue;
    if (!event.ilmd) continue;

    // Check if any EPC in this event belongs to the target GTIN
    const eventEpcs = event.epcList || [];
    const hasTargetGtin = eventEpcs.some(
      (uri) => getGtinForUri(allEpcs, uri) === targetGtin
    );

    if (!hasTargetGtin) continue;

    if (event.ilmd.lotNumber) {
      lotNumbers.add(event.ilmd.lotNumber);
    }
    if (event.ilmd.expirationDate) {
      expirationDates.add(event.ilmd.expirationDate);
    }
  }

  return {
    lotNumbers: [...lotNumbers],
    expirationDates: [...expirationDates],
  };
}

/**
 * Count cases associated with a product's GTIN.
 * Per requirement 4.6: a case is an EPC used as a parentID in an AggregationEvent
 * whose child EPCs share that product's GTIN.
 *
 * @param {object[]} events - All parsed events
 * @param {Map<string, object>} allEpcs - The epcMap.all map
 * @param {string} targetGtin - The GTIN to filter for
 * @returns {number} Count of distinct cases
 */
function countCasesForGtin(events, allEpcs, targetGtin) {
  const caseParents = new Set();

  for (const event of events) {
    if (!isAggregationAddEvent(event)) continue;
    if (!event.parentID) continue;

    const childEPCs = event.childEPCs || [];
    const hasTargetGtin = childEPCs.some(
      (uri) => getGtinForUri(allEpcs, uri) === targetGtin
    );

    if (hasTargetGtin) {
      caseParents.add(event.parentID);
    }
  }

  return caseParents.size;
}

/**
 * Count SSCCs associated with a product's GTIN.
 * Per requirement 4.7: an SSCC is associated with a product if any AggregationEvent
 * with that SSCC as parentID contains child EPCs or nested cases with items of that
 * product's GTIN.
 *
 * @param {object[]} events - All parsed events
 * @param {Map<string, object>} allEpcs - The epcMap.all map
 * @param {string} targetGtin - The GTIN to filter for
 * @param {Set<string>} casesForGtin - Set of case parentIDs that contain this product's GTIN
 * @returns {number} Count of distinct SSCCs
 */
function countSSCCsForGtin(events, allEpcs, targetGtin, casesForGtin) {
  const ssccSet = new Set();

  for (const event of events) {
    if (!isAggregationAddEvent(event)) continue;
    if (!event.parentID || !isSSCCUri(event.parentID)) continue;

    const childEPCs = event.childEPCs || [];

    // Check if any child EPC directly has the target GTIN
    const hasDirectChild = childEPCs.some(
      (uri) => getGtinForUri(allEpcs, uri) === targetGtin
    );

    // Check if any child EPC is a case that contains items of this GTIN (nested case)
    const hasNestedCase = childEPCs.some((uri) => casesForGtin.has(uri));

    if (hasDirectChild || hasNestedCase) {
      ssccSet.add(event.parentID);
    }
  }

  return ssccSet.size;
}

/**
 * Get the set of case parentIDs that contain children with a given GTIN.
 *
 * @param {object[]} events - All parsed events
 * @param {Map<string, object>} allEpcs - The epcMap.all map
 * @param {string} targetGtin - The GTIN to filter for
 * @returns {Set<string>} Set of case parent URIs
 */
function getCaseParentsForGtin(events, allEpcs, targetGtin) {
  const caseParents = new Set();

  for (const event of events) {
    if (!isAggregationAddEvent(event)) continue;
    if (!event.parentID) continue;

    const childEPCs = event.childEPCs || [];
    const hasTargetGtin = childEPCs.some(
      (uri) => getGtinForUri(allEpcs, uri) === targetGtin
    );

    if (hasTargetGtin) {
      caseParents.add(event.parentID);
    }
  }

  return caseParents;
}

/**
 * Extract product information from a parsed EPCIS document and EPC map.
 * Returns one ProductInfo entry per distinct GTIN found in SGTIN URIs.
 *
 * @param {object} doc - ParsedDocument from xmlParser
 * @param {object} epcMap - EPCMap from epcExtractor.extractAll()
 * @returns {object[]} Array of ProductInfo objects
 */
export function extractProducts(doc, epcMap) {
  if (!epcMap || !epcMap.bySGTIN) return [];

  const { bySGTIN, all: allEpcs } = epcMap;
  const masterData = doc.masterData || {};
  const events = doc.events || [];
  const products = [];

  // Iterate over each distinct GTIN in the EPC map
  for (const [gtin, parsedEpcs] of bySGTIN.entries()) {
    // Use the first parsed EPC to get company prefix and item reference
    const representative = parsedEpcs[0];
    const companyPrefix = representative.companyPrefix;
    const itemReference = representative.itemReference;

    // Build pattern strings
    const sgtinPattern = buildSGTINPattern(companyPrefix, itemReference);
    const idpatPattern = buildIdpatPattern(companyPrefix, itemReference);

    // Serial count: number of unique serial numbers (unique EPCs for this GTIN)
    const serialCount = parsedEpcs.length;

    // NDC: prefer master data (explicit), then fall back to EPC-derived NDC
    let ndc = findNDCFromMasterData(masterData, idpatPattern);
    if (!ndc) {
      ndc = representative.ndc;
    }

    // Product name from master data
    const productName = findProductName(masterData, idpatPattern);

    // Lot numbers and expiration dates from commissioning events
    const { lotNumbers, expirationDates } = extractLotAndExpirationForGtin(
      events,
      allEpcs,
      gtin
    );

    // Case count
    const caseCount = countCasesForGtin(events, allEpcs, gtin);

    // Get case parents for SSCC nested-case lookup
    const casesForGtin = getCaseParentsForGtin(events, allEpcs, gtin);

    // SSCC count
    const ssccCount = countSSCCsForGtin(events, allEpcs, gtin, casesForGtin);

    products.push({
      sgtinPattern,
      gtin,
      ndc,
      productName,
      serialCount,
      lotNumbers,
      expirationDates,
      caseCount,
      ssccCount,
    });
  }

  return products;
}
