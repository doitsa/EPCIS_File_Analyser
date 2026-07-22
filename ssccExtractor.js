/**
 * ssccExtractor.js - SSCC Tracking & Role Analysis
 *
 * Scans all EPCIS events for SSCC URIs and tracks their roles,
 * event references, child EPCs, and associated products.
 *
 * @module ssccExtractor
 */

import { parseSGTIN } from './epcExtractor.js';

/**
 * SSCC URI pattern: urn:epc:id:sscc:*
 */
const SSCC_PATTERN = /^urn:epc:id:sscc:/;

/**
 * Check if a URI is an SSCC URI.
 * @param {string} uri - URI string to check
 * @returns {boolean} True if the URI matches the SSCC pattern
 */
function isSSCC(uri) {
  return SSCC_PATTERN.test(uri);
}

/**
 * Extract GTINs from a list of EPC URIs by parsing SGTINs.
 * @param {string[]} epcs - Array of EPC URIs
 * @returns {string[]} Array of unique GTINs found
 */
function extractGTINsFromEPCs(epcs) {
  const gtins = new Set();
  for (const epc of epcs) {
    const parsed = parseSGTIN(epc);
    if (parsed && parsed.gtin) {
      gtins.add(parsed.gtin);
    }
  }
  return [...gtins];
}

/**
 * Create an SSCCEventReference object from an event and its role.
 * @param {object} event - EPCIS event
 * @param {string} role - The role of the SSCC in this event
 * @returns {object} SSCCEventReference
 */
function createEventReference(event, role) {
  return {
    eventType: event.eventType,
    eventTime: event.eventTime,
    bizStep: event.bizStep || null,
    disposition: event.disposition || null,
    action: event.action,
    role,
  };
}

/**
 * Extract all SSCCs from parsed EPCIS events, tracking their roles,
 * event count, child EPCs, and associated products.
 *
 * Scans the following fields for SSCC URIs:
 * - parentID
 * - childEPCs
 * - epcList
 * - sourceList (value field)
 * - destinationList (value field)
 * - bizTransactionList (value field for shipment identifiers)
 *
 * @param {object} doc - ParsedDocument from xmlParser
 * @returns {SSCCInfo[]} Array of SSCC info objects
 */
export function extractSSCCs(doc) {
  if (!doc || !doc.events || doc.events.length === 0) {
    return [];
  }

  /** @type {Map<string, { roles: Set<string>, events: object[], childEPCs: Set<string>, associatedProducts: Set<string> }>} */
  const ssccMap = new Map();

  /**
   * Register an SSCC occurrence with its role and event reference.
   * @param {string} ssccUri - The SSCC URI
   * @param {object} event - The event where it was found
   * @param {string} role - The role of the SSCC
   */
  function registerSSCC(ssccUri, event, role) {
    if (!ssccMap.has(ssccUri)) {
      ssccMap.set(ssccUri, {
        roles: new Set(),
        events: [],
        childEPCs: new Set(),
        associatedProducts: new Set(),
      });
    }
    const entry = ssccMap.get(ssccUri);
    entry.roles.add(role);
    entry.events.push(createEventReference(event, role));
  }

  for (const event of doc.events) {
    // Scan parentID
    if (event.parentID && isSSCC(event.parentID)) {
      registerSSCC(event.parentID, event, 'parentID');

      // When SSCC is parentID in an AggregationEvent, collect childEPCs and their GTINs
      if (event.eventType === 'AggregationEvent' && event.childEPCs && event.childEPCs.length > 0) {
        const entry = ssccMap.get(event.parentID);
        for (const childEPC of event.childEPCs) {
          entry.childEPCs.add(childEPC);
        }
        const gtins = extractGTINsFromEPCs(event.childEPCs);
        for (const gtin of gtins) {
          entry.associatedProducts.add(gtin);
        }
      }
    }

    // Scan childEPCs
    if (event.childEPCs) {
      for (const epc of event.childEPCs) {
        if (isSSCC(epc)) {
          registerSSCC(epc, event, 'childEPC');
        }
      }
    }

    // Scan epcList
    if (event.epcList) {
      for (const epc of event.epcList) {
        if (isSSCC(epc)) {
          registerSSCC(epc, event, 'epcList');
        }
      }
    }

    // Scan sourceList (value field)
    if (event.sourceList) {
      for (const source of event.sourceList) {
        if (source.value && isSSCC(source.value)) {
          registerSSCC(source.value, event, 'source');
        }
      }
    }

    // Scan destinationList (value field)
    if (event.destinationList) {
      for (const dest of event.destinationList) {
        if (dest.value && isSSCC(dest.value)) {
          registerSSCC(dest.value, event, 'destination');
        }
      }
    }

    // Scan bizTransactionList (value field for shipment identifiers)
    if (event.bizTransactionList) {
      for (const biz of event.bizTransactionList) {
        if (biz.value && isSSCC(biz.value)) {
          registerSSCC(biz.value, event, 'shipmentIdentifier');
        }
      }
    }
  }

  // Convert map to SSCCInfo array
  const results = [];
  for (const [sscc, data] of ssccMap) {
    results.push({
      sscc,
      eventCount: data.events.length,
      roles: [...data.roles],
      events: data.events,
      childEPCs: [...data.childEPCs],
      associatedProducts: [...data.associatedProducts],
    });
  }

  return results;
}
