/**
 * aggregationAnalyzer.js - Case/Parent-Child Aggregation Analysis
 *
 * Analyzes AggregationEvents to build case hierarchy, detect empty cases,
 * and identify orphaned serials (commissioned but never aggregated).
 *
 * @module aggregationAnalyzer
 */

import { parseSGTIN } from './epcExtractor.js';

/**
 * Analyze case/aggregation relationships from a parsed EPCIS document.
 *
 * @param {ParsedDocument} doc - The parsed EPCIS document from xmlParser
 * @param {EPCMap} epcMap - The EPC classification map from epcExtractor
 * @returns {AggregationResult} Cases, empty cases, and orphaned serials
 */
export function analyzeCases(doc, epcMap) {
  const cases = [];
  const emptyCases = [];

  // Collect all AggregationEvents with action ADD
  const aggregationAddEvents = doc.events.filter(
    (event) => event.eventType === 'AggregationEvent' && event.action === 'ADD'
  );

  // Collect all commissioned EPCs (ObjectEvent, action ADD, bizStep contains 'commissioning')
  const commissionedEPCs = getCommissionedEPCs(doc.events);

  // Track all child EPCs that appear in any AggregationEvent with action ADD
  const allAggregatedChildren = new Set();

  // Build cases from AggregationEvents with action ADD
  for (const event of aggregationAddEvents) {
    const parentEPC = event.parentID || '';
    const childEPCs = event.childEPCs || [];
    const childCount = childEPCs.length;
    const eventTime = event.eventTime || '';

    // Determine associated GTIN from child EPCs
    const associatedGTIN = resolveAssociatedGTIN(childEPCs, epcMap);

    // aggregationStatus is 'Valid' for events with action ADD
    const aggregationStatus = 'Valid';

    // Determine if all children were commissioned before this aggregation event
    const childrenCommissioned = checkChildrenCommissioned(
      childEPCs,
      eventTime,
      commissionedEPCs
    );

    const caseInfo = {
      parentEPC,
      childEPCs,
      childCount,
      associatedGTIN,
      aggregationStatus,
      childrenCommissioned,
      eventTime,
    };

    cases.push(caseInfo);

    // Track empty cases (zero children)
    if (childCount === 0) {
      emptyCases.push(caseInfo);
    }

    // Track all aggregated children
    for (const childEPC of childEPCs) {
      allAggregatedChildren.add(childEPC);
    }
  }

  // Detect orphaned serials: commissioned EPCs that never appear as children
  const orphanedSerials = [];
  for (const epc of commissionedEPCs.keys()) {
    if (!allAggregatedChildren.has(epc)) {
      orphanedSerials.push(epc);
    }
  }

  return {
    cases,
    emptyCases,
    orphanedSerials,
  };
}

/**
 * Get all commissioned EPCs from events.
 * A commissioned EPC is one from an ObjectEvent with action ADD and bizStep containing 'commissioning'.
 *
 * @param {EPCISEvent[]} events - All parsed events
 * @returns {Map<string, string>} Map of EPC URI -> eventTime of commissioning
 */
function getCommissionedEPCs(events) {
  const commissioned = new Map();

  for (const event of events) {
    if (
      event.eventType === 'ObjectEvent' &&
      event.action === 'ADD' &&
      event.bizStep &&
      event.bizStep.toLowerCase().includes('commissioning')
    ) {
      const eventTime = event.eventTime || '';
      for (const epc of event.epcList) {
        // Store the earliest commissioning time for each EPC
        if (!commissioned.has(epc) || eventTime < commissioned.get(epc)) {
          commissioned.set(epc, eventTime);
        }
      }
    }
  }

  return commissioned;
}

/**
 * Resolve the associated GTIN from child EPCs using the EPC map.
 * Returns the GTIN of the first child EPC that has a known SGTIN, or null.
 * Falls back to directly parsing the SGTIN URI if not found in the map.
 *
 * @param {string[]} childEPCs - Array of child EPC URIs
 * @param {EPCMap} epcMap - The EPC classification map
 * @returns {string|null} The associated GTIN or null
 */
function resolveAssociatedGTIN(childEPCs, epcMap) {
  // First try the epcMap for fast lookup
  for (const childEPC of childEPCs) {
    const parsed = epcMap.all.get(childEPC);
    if (parsed && parsed.gtin) {
      return parsed.gtin;
    }
  }

  // Try resolving via bySGTIN (iterate GTIN keys and check if any child matches)
  for (const [gtin, parsedEPCs] of epcMap.bySGTIN) {
    for (const parsedEPC of parsedEPCs) {
      if (childEPCs.includes(parsedEPC.uri)) {
        return gtin;
      }
    }
  }

  // Fallback: directly parse SGTIN URIs from children
  for (const childEPC of childEPCs) {
    const parsed = parseSGTIN(childEPC);
    if (parsed && parsed.gtin) {
      return parsed.gtin;
    }
  }

  return null;
}

/**
 * Check whether all child EPCs have been commissioned before the aggregation event.
 * childrenCommissioned is 'Yes' when ALL child EPCs have a prior ObjectEvent with
 * action ADD and bizStep containing 'commissioning' with an eventTime earlier than
 * the aggregation eventTime.
 *
 * @param {string[]} childEPCs - Array of child EPC URIs
 * @param {string} aggregationEventTime - The eventTime of the aggregation event
 * @param {Map<string, string>} commissionedEPCs - Map of EPC -> commissioning eventTime
 * @returns {'Yes'|'No'} Whether all children were commissioned before aggregation
 */
function checkChildrenCommissioned(childEPCs, aggregationEventTime, commissionedEPCs) {
  if (childEPCs.length === 0) {
    return 'No';
  }

  for (const childEPC of childEPCs) {
    const commissionTime = commissionedEPCs.get(childEPC);
    if (!commissionTime) {
      // Child was never commissioned
      return 'No';
    }
    // Commission time must be earlier than aggregation time
    if (aggregationEventTime && commissionTime >= aggregationEventTime) {
      return 'No';
    }
  }

  return 'Yes';
}
