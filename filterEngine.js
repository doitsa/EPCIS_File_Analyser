/**
 * filterEngine.js - Data Filtering Engine
 *
 * Applies user-selected filter criteria across events, products, cases,
 * SSCCs, and issues. All active (non-null) filters are ANDed together.
 * Provides clear functionality to reset all criteria.
 *
 * @module filterEngine
 */

/**
 * @typedef {Object} FilterCriteria
 * @property {string|null} product - GTIN to match
 * @property {string|null} lotNumber - Lot number to match
 * @property {string|null} expirationDate - Expiration date to match
 * @property {string|null} eventType - Event type to match
 * @property {string|null} bizStep - Business step to match
 * @property {string|null} disposition - Disposition to match
 * @property {string|null} serialNumber - Serial number substring match on EPCs
 * @property {string|null} caseSerial - Case serial substring match on parentEPC
 * @property {string|null} sscc - SSCC substring match on SSCC URI
 * @property {'Critical'|'Warning'|'Info'|null} issueSeverity - Issue severity filter
 * @property {string|null} issueType - Issue category filter
 * @property {string|null} searchQuery - Case-insensitive substring match on serial/case/SSCC (max 100 chars)
 */

/**
 * @typedef {Object} FilteredResults
 * @property {object[]} events - Filtered EPCIS events
 * @property {object[]} products - Filtered product info entries
 * @property {object[]} cases - Filtered case info entries
 * @property {object[]} ssccs - Filtered SSCC info entries
 * @property {object[]} issues - Filtered issue entries
 */

/**
 * Internal store for the current filter criteria state.
 * @type {FilterCriteria}
 */
let currentCriteria = createEmptyCriteria();

/**
 * Create an empty FilterCriteria object with all fields set to null.
 * @returns {FilterCriteria}
 */
function createEmptyCriteria() {
  return {
    product: null,
    lotNumber: null,
    expirationDate: null,
    eventType: null,
    bizStep: null,
    disposition: null,
    serialNumber: null,
    caseSerial: null,
    sscc: null,
    issueSeverity: null,
    issueType: null,
    searchQuery: null,
  };
}

/**
 * Perform a case-insensitive substring check.
 * @param {string} haystack - The string to search in
 * @param {string} needle - The substring to search for
 * @returns {boolean} True if needle is found in haystack (case-insensitive)
 */
function containsSubstring(haystack, needle) {
  if (!haystack || !needle) return false;
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

/**
 * Check if any EPC in a list matches the serial number filter (case-insensitive substring).
 * Searches full URI strings for the serial substring.
 * @param {string[]} epcList - Array of EPC URIs
 * @param {string} serial - Serial number substring to match
 * @returns {boolean}
 */
function matchesSerialInEPCs(epcList, serial) {
  if (!epcList || epcList.length === 0) return false;
  return epcList.some((epc) => containsSubstring(epc, serial));
}

/**
 * Check if an event matches the serialNumber filter.
 * Searches epcList, childEPCs, and parentID for the serial substring.
 * @param {object} event - EPCIS event
 * @param {string} serial - Serial number substring
 * @returns {boolean}
 */
function eventMatchesSerial(event, serial) {
  if (matchesSerialInEPCs(event.epcList, serial)) return true;
  if (matchesSerialInEPCs(event.childEPCs, serial)) return true;
  if (event.parentID && containsSubstring(event.parentID, serial)) return true;
  return false;
}

/**
 * Check if an event matches the searchQuery (case-insensitive substring on serials, case serials, SSCCs).
 * @param {object} event - EPCIS event
 * @param {string} query - Search query string
 * @returns {boolean}
 */
function eventMatchesSearchQuery(event, query) {
  // Search in epcList
  if (matchesSerialInEPCs(event.epcList, query)) return true;
  // Search in childEPCs
  if (matchesSerialInEPCs(event.childEPCs, query)) return true;
  // Search in parentID (case serial / SSCC)
  if (event.parentID && containsSubstring(event.parentID, query)) return true;
  return false;
}

/**
 * Filter events based on active criteria.
 * @param {object[]} events - Array of EPCIS events
 * @param {FilterCriteria} criteria - Active filter criteria
 * @returns {object[]} Filtered events
 */
function filterEvents(events, criteria) {
  if (!events || events.length === 0) return [];

  return events.filter((event) => {
    // eventType filter
    if (criteria.eventType && event.eventType !== criteria.eventType) {
      return false;
    }

    // bizStep filter
    if (criteria.bizStep) {
      if (!event.bizStep || !containsSubstring(event.bizStep, criteria.bizStep)) {
        return false;
      }
    }

    // disposition filter
    if (criteria.disposition) {
      if (!event.disposition || !containsSubstring(event.disposition, criteria.disposition)) {
        return false;
      }
    }

    // serialNumber filter - match any EPC in epcList/childEPCs/parentID
    if (criteria.serialNumber) {
      if (!eventMatchesSerial(event, criteria.serialNumber)) {
        return false;
      }
    }

    // searchQuery - case-insensitive substring on serial/case/SSCC fields
    if (criteria.searchQuery) {
      if (!eventMatchesSearchQuery(event, criteria.searchQuery)) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Filter products based on active criteria.
 * @param {object[]} products - Array of ProductInfo objects
 * @param {FilterCriteria} criteria - Active filter criteria
 * @returns {object[]} Filtered products
 */
function filterProducts(products, criteria) {
  if (!products || products.length === 0) return [];

  return products.filter((product) => {
    // product (GTIN) filter
    if (criteria.product && product.gtin !== criteria.product) {
      return false;
    }

    // lotNumber filter
    if (criteria.lotNumber) {
      if (!product.lotNumbers || !product.lotNumbers.includes(criteria.lotNumber)) {
        return false;
      }
    }

    // expirationDate filter
    if (criteria.expirationDate) {
      if (!product.expirationDates || !product.expirationDates.includes(criteria.expirationDate)) {
        return false;
      }
    }

    // searchQuery - match against serial patterns in the product's SGTIN pattern
    if (criteria.searchQuery) {
      if (!containsSubstring(product.sgtinPattern, criteria.searchQuery) &&
          !containsSubstring(product.gtin, criteria.searchQuery)) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Filter cases based on active criteria.
 * @param {object[]} cases - Array of CaseInfo objects
 * @param {FilterCriteria} criteria - Active filter criteria
 * @returns {object[]} Filtered cases
 */
function filterCases(cases, criteria) {
  if (!cases || cases.length === 0) return [];

  return cases.filter((caseInfo) => {
    // caseSerial filter - substring match on parentEPC
    if (criteria.caseSerial) {
      if (!containsSubstring(caseInfo.parentEPC, criteria.caseSerial)) {
        return false;
      }
    }

    // product (GTIN) filter - match associatedGTIN
    if (criteria.product) {
      if (caseInfo.associatedGTIN !== criteria.product) {
        return false;
      }
    }

    // searchQuery - substring match on parentEPC or childEPCs
    if (criteria.searchQuery) {
      const matchesParent = containsSubstring(caseInfo.parentEPC, criteria.searchQuery);
      const matchesChild = caseInfo.childEPCs &&
        caseInfo.childEPCs.some((epc) => containsSubstring(epc, criteria.searchQuery));
      if (!matchesParent && !matchesChild) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Filter SSCCs based on active criteria.
 * @param {object[]} ssccs - Array of SSCCInfo objects
 * @param {FilterCriteria} criteria - Active filter criteria
 * @returns {object[]} Filtered SSCCs
 */
function filterSSCCs(ssccs, criteria) {
  if (!ssccs || ssccs.length === 0) return [];

  return ssccs.filter((ssccInfo) => {
    // sscc filter - substring match on SSCC URI
    if (criteria.sscc) {
      if (!containsSubstring(ssccInfo.sscc, criteria.sscc)) {
        return false;
      }
    }

    // product filter - match associatedProducts
    if (criteria.product) {
      if (!ssccInfo.associatedProducts || !ssccInfo.associatedProducts.includes(criteria.product)) {
        return false;
      }
    }

    // searchQuery - substring match on SSCC URI or childEPCs
    if (criteria.searchQuery) {
      const matchesSSCC = containsSubstring(ssccInfo.sscc, criteria.searchQuery);
      const matchesChild = ssccInfo.childEPCs &&
        ssccInfo.childEPCs.some((epc) => containsSubstring(epc, criteria.searchQuery));
      if (!matchesSSCC && !matchesChild) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Filter issues based on active criteria.
 * @param {object[]} issues - Array of Issue objects
 * @param {FilterCriteria} criteria - Active filter criteria
 * @returns {object[]} Filtered issues
 */
function filterIssues(issues, criteria) {
  if (!issues || issues.length === 0) return [];

  return issues.filter((issue) => {
    // issueSeverity filter
    if (criteria.issueSeverity && issue.severity !== criteria.issueSeverity) {
      return false;
    }

    // issueType filter - match category
    if (criteria.issueType) {
      if (!containsSubstring(issue.category, criteria.issueType)) {
        return false;
      }
    }

    // searchQuery - match against affectedItem
    if (criteria.searchQuery) {
      if (!containsSubstring(issue.affectedItem, criteria.searchQuery)) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Apply filter criteria to analysis data, returning filtered subsets.
 * All non-null criteria are ANDed together within each data section.
 * The searchQuery field is limited to 100 characters.
 *
 * @param {object} data - Analysis results containing { events, products, cases, ssccs, issues }
 * @param {FilterCriteria} criteria - Filter criteria (non-null fields are active)
 * @returns {FilteredResults} Filtered results across all data sections
 */
export function applyFilters(data, criteria) {
  if (!data) {
    return { events: [], products: [], cases: [], ssccs: [], issues: [] };
  }

  // Normalize criteria: treat undefined as null, truncate searchQuery to 100 chars
  const normalized = { ...createEmptyCriteria() };
  if (criteria) {
    for (const key of Object.keys(normalized)) {
      if (criteria[key] !== undefined && criteria[key] !== null) {
        normalized[key] = criteria[key];
      }
    }
  }

  // Enforce 100-character limit on searchQuery
  if (normalized.searchQuery && normalized.searchQuery.length > 100) {
    normalized.searchQuery = normalized.searchQuery.substring(0, 100);
  }

  // Store current criteria
  currentCriteria = normalized;

  const events = filterEvents(data.events || [], normalized);
  const products = filterProducts(data.products || [], normalized);
  const cases = filterCases(data.cases || [], normalized);
  const ssccs = filterSSCCs(data.ssccs || [], normalized);
  const issues = filterIssues(data.issues || [], normalized);

  return { events, products, cases, ssccs, issues };
}

/**
 * Clear all filter criteria, resetting to empty state.
 * @returns {FilterCriteria} The empty criteria object
 */
export function clearFilters() {
  currentCriteria = createEmptyCriteria();
  return currentCriteria;
}
