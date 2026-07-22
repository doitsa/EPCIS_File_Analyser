/**
 * lotExpirationExtractor.js - Lot & Expiration from ILMD
 *
 * Extracts lot numbers and expiration dates from ILMD data in EPCIS events,
 * grouped by GTIN. Scans all events for ILMD data containing lot numbers
 * and expiration dates, determines GTIN from event EPCs via SGTIN parsing.
 *
 * @module lotExpirationExtractor
 */

import { parseSGTIN } from './epcExtractor.js';

/**
 * Resolve GTINs from an event's EPC list and child EPCs using parseSGTIN.
 * Parses each EPC URI, extracting GTINs from valid SGTINs.
 *
 * @param {object} event - A parsed EPCIS event
 * @returns {string[]} Array of unique GTINs found in this event's EPCs
 */
function resolveGTINsFromEvent(event) {
  const gtins = new Set();

  const epcsToCheck = [
    ...(event.epcList || []),
    ...(event.childEPCs || []),
  ];

  for (const uri of epcsToCheck) {
    const parsed = parseSGTIN(uri);
    if (parsed && parsed.gtin) {
      gtins.add(parsed.gtin);
    }
  }

  return [...gtins];
}

/**
 * Add a value to a record of arrays, avoiding duplicates.
 *
 * @param {Record<string, string[]>} record - The record to update
 * @param {string} key - The key (GTIN)
 * @param {string} value - The value to add (lot number or expiration date)
 */
function addUnique(record, key, value) {
  if (!record[key]) {
    record[key] = [];
  }
  if (!record[key].includes(value)) {
    record[key].push(value);
  }
}

/**
 * Extract lot numbers and expiration dates from ILMD data, grouped by GTIN.
 *
 * Scans all events for ILMD data. For each event with ILMD containing
 * a lot number or expiration date, extracts GTINs from epcList and childEPCs
 * using parseSGTIN, then groups lotNumber and expirationDate by GTIN.
 *
 * @param {object} doc - The ParsedDocument from xmlParser
 * @param {object} [epcMap] - Optional EPCMap (unused, kept for interface compatibility)
 * @returns {{ lotsByProduct: Record<string, string[]>, expirationsByProduct: Record<string, string[]> }}
 */
export function extractLotExpiration(doc, epcMap) {
  const lotsByProduct = {};
  const expirationsByProduct = {};

  if (!doc || !doc.events) {
    return { lotsByProduct, expirationsByProduct };
  }

  for (const event of doc.events) {
    // Skip events without ILMD data
    if (!event.ilmd) continue;

    // Skip if both lot and expiration are missing
    if (!event.ilmd.lotNumber && !event.ilmd.expirationDate) continue;

    // Resolve GTINs from event's EPC URIs
    const gtins = resolveGTINsFromEvent(event);

    // If no GTINs found, skip (can't associate lot/exp with a product)
    if (gtins.length === 0) continue;

    // Group lot and expiration data by GTIN
    for (const gtin of gtins) {
      if (event.ilmd.lotNumber) {
        addUnique(lotsByProduct, gtin, event.ilmd.lotNumber);
      }
      if (event.ilmd.expirationDate) {
        addUnique(expirationsByProduct, gtin, event.ilmd.expirationDate);
      }
    }
  }

  return { lotsByProduct, expirationsByProduct };
}
