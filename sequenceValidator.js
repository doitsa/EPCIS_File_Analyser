/**
 * sequenceValidator.js - Event Sequence Validation
 *
 * Validates temporal and logical ordering of EPCIS events per EPC:
 * - Timestamp ordering when business step implies a sequence
 * - Business step sequence: commissioning → packing → shipping → receiving → decommissioning
 * - DELETE without prior ADD/OBSERVE
 * - Shipping before commissioning/aggregation
 * - Receiving before shipping
 *
 * @module sequenceValidator
 */

/**
 * Defined business step ordering. Higher number = later in lifecycle.
 */
const BIZ_STEP_ORDER = {
  'commissioning': 1,
  'packing': 2,
  'shipping': 3,
  'receiving': 4,
  'decommissioning': 5,
  'destroying': 5
};

/**
 * Extract the last segment of a bizStep URI (after last colon or slash).
 * @param {string|null} bizStep - Full bizStep URI or short name
 * @returns {string|null} The normalized short name, or null if not provided
 */
function normalizeBizStep(bizStep) {
  if (!bizStep) return null;
  // Extract last segment after colon or slash
  const colonIdx = bizStep.lastIndexOf(':');
  const slashIdx = bizStep.lastIndexOf('/');
  const separatorIdx = Math.max(colonIdx, slashIdx);
  if (separatorIdx >= 0) {
    return bizStep.substring(separatorIdx + 1).toLowerCase();
  }
  return bizStep.toLowerCase();
}

/**
 * Collect all EPCs referenced by an event (from epcList, parentID, childEPCs).
 * @param {object} event - A parsed EPCIS event
 * @returns {string[]} Array of EPC URIs
 */
function getEventEPCs(event) {
  const epcs = [];
  if (event.epcList && Array.isArray(event.epcList)) {
    epcs.push(...event.epcList);
  }
  if (event.parentID) {
    epcs.push(event.parentID);
  }
  if (event.childEPCs && Array.isArray(event.childEPCs)) {
    epcs.push(...event.childEPCs);
  }
  return epcs;
}

/**
 * Build a map of EPC -> sorted event records for sequence analysis.
 * @param {object[]} events - Array of parsed EPCIS events
 * @returns {Map<string, Array<{eventTime: string, bizStep: string|null, action: string|null, xmlPath: string}>>}
 */
function buildEPCEventMap(events) {
  const epcMap = new Map();

  for (const event of events) {
    const epcs = getEventEPCs(event);
    const record = {
      eventTime: event.eventTime || '',
      bizStep: event.bizStep || null,
      action: event.action || null,
      xmlPath: event.xmlPath || ''
    };

    for (const epc of epcs) {
      if (!epcMap.has(epc)) {
        epcMap.set(epc, []);
      }
      epcMap.get(epc).push(record);
    }
  }

  // Sort each EPC's events by eventTime
  for (const [, records] of epcMap) {
    records.sort((a, b) => {
      if (!a.eventTime) return -1;
      if (!b.eventTime) return 1;
      return a.eventTime.localeCompare(b.eventTime);
    });
  }

  return epcMap;
}

/**
 * Validate event sequences across all EPCs in the document.
 * @param {object} doc - ParsedDocument from xmlParser (doc.events array)
 * @returns {Array<{severity: string, title: string, description: string, affectedItem: string, eventTime: string|null, xmlPath: string, suggestedCorrection: string, category: string}>} Issue[]
 */
export function validateSequences(doc) {
  const issues = [];

  if (!doc || !doc.events || !Array.isArray(doc.events) || doc.events.length === 0) {
    return issues;
  }

  const epcEventMap = buildEPCEventMap(doc.events);

  for (const [epc, records] of epcEventMap) {
    if (records.length < 2) {
      // Single event per EPC — only check DELETE without prior ADD/OBSERVE
      if (records.length === 1) {
        const record = records[0];
        if (record.action === 'DELETE') {
          issues.push({
            severity: 'Warning',
            title: 'DELETE without prior ADD/OBSERVE',
            description: `EPC "${epc}" has a DELETE action without any preceding ADD or OBSERVE action in the document.`,
            affectedItem: epc,
            eventTime: record.eventTime || null,
            xmlPath: record.xmlPath,
            suggestedCorrection: 'Ensure a prior ADD or OBSERVE event exists for this EPC before the DELETE action.',
            category: 'Sequence'
          });
        }
      }
      continue;
    }

    // Check for DELETE without prior ADD/OBSERVE
    checkDeleteWithoutPriorAddObserve(epc, records, issues);

    // Check business step sequence violations
    checkBizStepSequence(epc, records, issues);

    // Check shipping before commissioning
    checkShippingBeforeCommissioning(epc, records, issues);

    // Check receiving before shipping
    checkReceivingBeforeShipping(epc, records, issues);
  }

  return issues;
}

/**
 * Detect DELETE action without a preceding ADD or OBSERVE for the same EPC.
 * @param {string} epc
 * @param {Array} records - Sorted event records for this EPC
 * @param {Array} issues - Issues array to append to
 */
function checkDeleteWithoutPriorAddObserve(epc, records, issues) {
  for (let i = 0; i < records.length; i++) {
    if (records[i].action === 'DELETE') {
      const hasPrior = records.slice(0, i).some(
        r => r.action === 'ADD' || r.action === 'OBSERVE'
      );
      if (!hasPrior) {
        issues.push({
          severity: 'Warning',
          title: 'DELETE without prior ADD/OBSERVE',
          description: `EPC "${epc}" has a DELETE action without any preceding ADD or OBSERVE action in the document.`,
          affectedItem: epc,
          eventTime: records[i].eventTime || null,
          xmlPath: records[i].xmlPath,
          suggestedCorrection: 'Ensure a prior ADD or OBSERVE event exists for this EPC before the DELETE action.',
          category: 'Sequence'
        });
      }
    }
  }
}

/**
 * Detect non-sequential timestamps where a logically later business step
 * has an earlier eventTime than a preceding step.
 * @param {string} epc
 * @param {Array} records - Sorted event records for this EPC
 * @param {Array} issues - Issues array to append to
 */
function checkBizStepSequence(epc, records, issues) {
  // Collect records that have a recognized business step with an order value
  const steppedRecords = [];
  for (const record of records) {
    const normalizedStep = normalizeBizStep(record.bizStep);
    if (normalizedStep && BIZ_STEP_ORDER[normalizedStep] !== undefined) {
      steppedRecords.push({ ...record, normalizedStep });
    }
  }

  // Check pairs for non-sequential ordering
  for (let i = 0; i < steppedRecords.length; i++) {
    for (let j = i + 1; j < steppedRecords.length; j++) {
      const earlier = steppedRecords[i];
      const later = steppedRecords[j];

      // If the later-timestamped event has a lower business step order,
      // that's a sequence violation
      if (BIZ_STEP_ORDER[later.normalizedStep] < BIZ_STEP_ORDER[earlier.normalizedStep]) {
        issues.push({
          severity: 'Warning',
          title: 'Business step sequence violation',
          description: `EPC "${epc}" has "${later.normalizedStep}" (order ${BIZ_STEP_ORDER[later.normalizedStep]}) occurring after "${earlier.normalizedStep}" (order ${BIZ_STEP_ORDER[earlier.normalizedStep]}) in time, violating the expected lifecycle sequence.`,
          affectedItem: epc,
          eventTime: later.eventTime || null,
          xmlPath: later.xmlPath,
          suggestedCorrection: `Verify the eventTime values. "${earlier.normalizedStep}" should occur before "${later.normalizedStep}" in the lifecycle.`,
          category: 'Sequence'
        });
      }
    }
  }
}

/**
 * Detect shipping events occurring before any commissioning event for the same EPC.
 * @param {string} epc
 * @param {Array} records - Sorted event records for this EPC
 * @param {Array} issues - Issues array to append to
 */
function checkShippingBeforeCommissioning(epc, records, issues) {
  let hasCommissioning = false;

  for (const record of records) {
    const normalizedStep = normalizeBizStep(record.bizStep);
    if (normalizedStep === 'commissioning') {
      hasCommissioning = true;
    } else if (normalizedStep === 'shipping' && !hasCommissioning) {
      issues.push({
        severity: 'Warning',
        title: 'Shipping before commissioning',
        description: `EPC "${epc}" has a shipping event before any commissioning event in the document.`,
        affectedItem: epc,
        eventTime: record.eventTime || null,
        xmlPath: record.xmlPath,
        suggestedCorrection: 'Ensure a commissioning event with an earlier eventTime exists for this EPC before the shipping event.',
        category: 'Sequence'
      });
    }
  }
}

/**
 * Detect receiving events occurring before any shipping event for the same EPC.
 * @param {string} epc
 * @param {Array} records - Sorted event records for this EPC
 * @param {Array} issues - Issues array to append to
 */
function checkReceivingBeforeShipping(epc, records, issues) {
  let hasShipping = false;

  for (const record of records) {
    const normalizedStep = normalizeBizStep(record.bizStep);
    if (normalizedStep === 'shipping') {
      hasShipping = true;
    } else if (normalizedStep === 'receiving' && !hasShipping) {
      issues.push({
        severity: 'Warning',
        title: 'Receiving before shipping',
        description: `EPC "${epc}" has a receiving event before any shipping event in the document.`,
        affectedItem: epc,
        eventTime: record.eventTime || null,
        xmlPath: record.xmlPath,
        suggestedCorrection: 'Ensure a shipping event with an earlier eventTime exists for this EPC before the receiving event.',
        category: 'Sequence'
      });
    }
  }
}
