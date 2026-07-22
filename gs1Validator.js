/**
 * gs1Validator.js - GS1 Standards Validation
 *
 * Validates EPCIS document data against GS1 standards including
 * format checks, CBV vocabulary, consistency, and completeness.
 *
 * @module gs1Validator
 */

import { isValidGTIN, isValidSSCC, parseSGTIN, parseSSCC, computeGTIN } from './epcExtractor.js';

// Valid CBV business steps (last URI segment)
const VALID_BIZ_STEPS = [
  'commissioning', 'decommissioning', 'packing', 'unpacking',
  'shipping', 'receiving', 'accepting', 'rejecting', 'storing',
  'picking', 'loading', 'unloading', 'inspecting', 'holding',
  'destroying', 'encoding', 'killing', 'locking', 'unlocking',
  'void_shipping', 'cycle_counting', 'arriving', 'departing',
  'entering', 'exiting', 'repairing', 'replacing', 'sampling',
  'sensor_reporting', 'transforming'
];

// Valid CBV dispositions (last URI segment)
const VALID_DISPOSITIONS = [
  'active', 'container_closed', 'container_open', 'damaged',
  'destroyed', 'dispensed', 'disposed', 'encoded', 'expired',
  'in_progress', 'in_transit', 'inactive', 'mismatch_epc_class',
  'needs_replacement', 'no_pedigree_match', 'non_sellable_other',
  'partially_dispensed', 'recalled', 'reserved', 'retail_sold',
  'returned', 'sellable_accessible', 'sellable_not_accessible',
  'stolen', 'suspended', 'unavailable', 'unknown'
];

/**
 * Create an Issue object.
 */
function createIssue(severity, title, description, affectedItem, eventTime, xmlPath, suggestedCorrection, category) {
  return {
    severity,
    title,
    description,
    affectedItem: affectedItem || 'N/A',
    eventTime: eventTime || null,
    xmlPath: xmlPath || '',
    suggestedCorrection: suggestedCorrection || '',
    category
  };
}

/**
 * Extract the last segment from a URI (after the last colon or slash).
 */
function getLastSegment(uri) {
  if (!uri) return '';
  const colonIdx = uri.lastIndexOf(':');
  const slashIdx = uri.lastIndexOf('/');
  const idx = Math.max(colonIdx, slashIdx);
  return idx >= 0 ? uri.substring(idx + 1) : uri;
}

/**
 * Validate eventTime format (ISO 8601 with T separator).
 */
function validateEventTime(event, index, issues) {
  const path = `EventList/Event[${index}]/eventTime`;
  if (!event.eventTime) return; // Missing field handled separately

  const t = event.eventTime;
  // Must contain a T separator and have date + time components
  if (!t.includes('T') || !/^\d{4}-\d{2}-\d{2}T/.test(t)) {
    issues.push(createIssue(
      'Warning',
      'Invalid eventTime format',
      `eventTime "${t}" does not conform to ISO 8601 format (expected YYYY-MM-DDTHH:MM:SS with optional timezone).`,
      'N/A',
      t,
      path,
      'Use ISO 8601 format: YYYY-MM-DDTHH:MM:SS.sssZ or YYYY-MM-DDTHH:MM:SS.sss+HH:MM',
      'GS1 Format'
    ));
  }
}

/**
 * Validate eventTimeZoneOffset format.
 */
function validateTimeZoneOffset(event, index, issues) {
  const path = `EventList/Event[${index}]/eventTimeZoneOffset`;
  if (!event.eventTimeZoneOffset) return; // Missing field handled separately

  if (!/^[+-]\d{2}:\d{2}$/.test(event.eventTimeZoneOffset)) {
    issues.push(createIssue(
      'Warning',
      'Invalid eventTimeZoneOffset format',
      `eventTimeZoneOffset "${event.eventTimeZoneOffset}" does not match the required format [+-]HH:MM.`,
      'N/A',
      event.eventTime || null,
      path,
      'Use format +HH:MM or -HH:MM (e.g., +00:00 or -05:00)',
      'GS1 Format'
    ));
  }
}

/**
 * Validate required fields are present.
 */
function validateRequiredFields(event, index, issues) {
  const requiredFields = ['eventTime', 'eventTimeZoneOffset', 'action'];
  for (const field of requiredFields) {
    if (!event[field]) {
      issues.push(createIssue(
        'Warning',
        `Missing required field: ${field}`,
        `Event at index ${index} is missing the required field "${field}".`,
        'N/A',
        event.eventTime || null,
        `EventList/Event[${index}]/${field}`,
        `Add the required "${field}" field to this event.`,
        'GS1 Structure'
      ));
    }
  }
}

/**
 * Validate GTIN format from SGTIN URIs in an event.
 */
function validateGTINs(event, index, issues, epcMap) {
  const uris = collectAllURIs(event);
  for (const uri of uris) {
    if (!uri.startsWith('urn:epc:id:sgtin:')) continue;
    const parsed = parseSGTIN(uri);
    if (parsed && parsed.gtin) {
      if (!isValidGTIN(parsed.gtin)) {
        issues.push(createIssue(
          'Warning',
          'Invalid GTIN check digit',
          `GTIN "${parsed.gtin}" derived from URI "${uri}" has an invalid check digit.`,
          uri,
          event.eventTime || null,
          `EventList/Event[${index}]/epcList`,
          'Recalculate the GTIN using the GS1 modulo-10 check digit algorithm.',
          'GS1 Format'
        ));
      }
    }
  }
}

/**
 * Validate SSCC format from SSCC URIs in an event.
 */
function validateSSCCs(event, index, issues) {
  const uris = collectAllURIs(event);
  for (const uri of uris) {
    if (!uri.startsWith('urn:epc:id:sscc:')) continue;
    const parsed = parseSSCC(uri);
    if (parsed && parsed.sscc) {
      if (!isValidSSCC(parsed.sscc)) {
        issues.push(createIssue(
          'Warning',
          'Invalid SSCC check digit',
          `SSCC "${parsed.sscc}" derived from URI "${uri}" has an invalid check digit.`,
          uri,
          event.eventTime || null,
          `EventList/Event[${index}]/epcList`,
          'Recalculate the SSCC using the GS1 modulo-10 check digit algorithm.',
          'GS1 Format'
        ));
      }
    }
  }
}

/**
 * Validate SGTIN URI format.
 * Must match urn:epc:id:sgtin:<digits>.<digits>.<serial> where prefix+itemref=13 digits.
 */
function validateSGTINFormat(event, index, issues) {
  const uris = collectAllURIs(event);
  for (const uri of uris) {
    if (!uri.startsWith('urn:epc:id:sgtin:')) continue;
    const match = uri.match(/^urn:epc:id:sgtin:(\d+)\.(\d+)\.(.+)$/);
    if (!match) {
      issues.push(createIssue(
        'Warning',
        'Invalid SGTIN URI format',
        `URI "${uri}" does not conform to the SGTIN format urn:epc:id:sgtin:<CompanyPrefix>.<ItemRef>.<Serial>.`,
        uri,
        event.eventTime || null,
        `EventList/Event[${index}]/epcList`,
        'Ensure URI matches urn:epc:id:sgtin:<CompanyPrefix>.<ItemRef>.<SerialNumber> with prefix+itemRef=13 digits.',
        'GS1 Format'
      ));
      continue;
    }
    const [, companyPrefix, itemRef] = match;
    if (companyPrefix.length + itemRef.length !== 13) {
      issues.push(createIssue(
        'Warning',
        'Invalid SGTIN URI: prefix+itemRef length',
        `URI "${uri}" has CompanyPrefix(${companyPrefix.length}) + ItemRef(${itemRef.length}) = ${companyPrefix.length + itemRef.length} digits, expected 13.`,
        uri,
        event.eventTime || null,
        `EventList/Event[${index}]/epcList`,
        'Adjust CompanyPrefix and ItemReference so they total exactly 13 digits.',
        'GS1 Format'
      ));
    }
  }
}

/**
 * Validate business step URI against CBV vocabulary.
 */
function validateBizStep(event, index, issues) {
  if (!event.bizStep) return;
  const segment = getLastSegment(event.bizStep);
  if (!VALID_BIZ_STEPS.includes(segment)) {
    issues.push(createIssue(
      'Warning',
      'Invalid business step URI',
      `Business step "${event.bizStep}" is not a recognized CBV vocabulary term. Last segment "${segment}" not found in standard list.`,
      'N/A',
      event.eventTime || null,
      `EventList/Event[${index}]/bizStep`,
      `Use a valid CBV business step. Valid values include: ${VALID_BIZ_STEPS.slice(0, 5).join(', ')}, etc.`,
      'GS1 Format'
    ));
  }
}

/**
 * Validate disposition URI against CBV vocabulary.
 */
function validateDisposition(event, index, issues) {
  if (!event.disposition) return;
  const segment = getLastSegment(event.disposition);
  if (!VALID_DISPOSITIONS.includes(segment)) {
    issues.push(createIssue(
      'Warning',
      'Invalid disposition URI',
      `Disposition "${event.disposition}" is not a recognized CBV vocabulary term. Last segment "${segment}" not found in standard list.`,
      'N/A',
      event.eventTime || null,
      `EventList/Event[${index}]/disposition`,
      `Use a valid CBV disposition. Valid values include: ${VALID_DISPOSITIONS.slice(0, 5).join(', ')}, etc.`,
      'GS1 Format'
    ));
  }
}

/**
 * Validate ILMD presence and completeness for commissioning events.
 */
function validateILMD(event, index, issues) {
  const bizStepSegment = event.bizStep ? getLastSegment(event.bizStep) : '';
  const isCommissioning = bizStepSegment === 'commissioning';
  const isObjectEvent = event.eventType === 'ObjectEvent';
  const isAddAction = event.action === 'ADD';

  // Check missing ILMD in commissioning ObjectEvent with ADD
  if (isObjectEvent && isAddAction && isCommissioning && !event.ilmd) {
    issues.push(createIssue(
      'Warning',
      'Missing ILMD in commissioning event',
      `ObjectEvent with action ADD and bizStep commissioning at index ${index} is missing ILMD data (lot number and expiration date).`,
      'N/A',
      event.eventTime || null,
      `EventList/Event[${index}]/ilmd`,
      'Add ILMD element with lotNumber and expirationDate for commissioning events.',
      'GS1 Structure'
    ));
    return;
  }

  // Check ILMD completeness when present
  if (event.ilmd) {
    if (!event.ilmd.lotNumber) {
      issues.push(createIssue(
        'Warning',
        'Missing lot number in ILMD',
        `Event at index ${index} has ILMD data but is missing the lotNumber field.`,
        'N/A',
        event.eventTime || null,
        `EventList/Event[${index}]/ilmd/lotNumber`,
        'Add lotNumber to the ILMD element.',
        'GS1 Structure'
      ));
    }
    if (!event.ilmd.expirationDate) {
      issues.push(createIssue(
        'Warning',
        'Missing expiration date in ILMD',
        `Event at index ${index} has ILMD data but is missing the expirationDate field.`,
        'N/A',
        event.eventTime || null,
        `EventList/Event[${index}]/ilmd/expirationDate`,
        'Add expirationDate to the ILMD element.',
        'GS1 Structure'
      ));
    }
  }
}

/**
 * Detect duplicate serial numbers across commissioning events.
 */
function detectDuplicateSerials(events, issues) {
  // Track serials seen in commissioning events (ObjectEvent + ADD + commissioning)
  const serialCommissionMap = new Map(); // serial -> [eventIndices]

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const bizStepSegment = event.bizStep ? getLastSegment(event.bizStep) : '';
    const isCommissioning = bizStepSegment === 'commissioning';
    const isObjectEvent = event.eventType === 'ObjectEvent';
    const isAddAction = event.action === 'ADD';

    if (!(isObjectEvent && isAddAction && isCommissioning)) continue;

    const uris = collectAllURIs(event);
    for (const uri of uris) {
      if (!serialCommissionMap.has(uri)) {
        serialCommissionMap.set(uri, []);
      }
      serialCommissionMap.get(uri).push(i);
    }
  }

  for (const [uri, indices] of serialCommissionMap) {
    if (indices.length > 1) {
      issues.push(createIssue(
        'Warning',
        'Duplicate serial number in commissioning events',
        `EPC "${uri}" appears in ${indices.length} commissioning events (indices: ${indices.join(', ')}). Each serial should only be commissioned once.`,
        uri,
        null,
        'EventList',
        'Remove duplicate commissioning events for this serial number.',
        'GS1 Consistency'
      ));
    }
  }
}

/**
 * Detect duplicate event IDs.
 */
function detectDuplicateEventIDs(events, issues) {
  const eventIDMap = new Map(); // eventID -> [indices]

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (!event.eventID) continue;
    if (!eventIDMap.has(event.eventID)) {
      eventIDMap.set(event.eventID, []);
    }
    eventIDMap.get(event.eventID).push(i);
  }

  for (const [eventID, indices] of eventIDMap) {
    if (indices.length > 1) {
      issues.push(createIssue(
        'Warning',
        'Duplicate event ID',
        `Event ID "${eventID}" appears in ${indices.length} events (indices: ${indices.join(', ')}). Event IDs must be unique.`,
        eventID,
        null,
        'EventList',
        'Assign unique event IDs to each event.',
        'GS1 Consistency'
      ));
    }
  }
}

/**
 * Detect cross-event inconsistencies: same serial with different GTIN/lot/expiration.
 */
function detectCrossEventInconsistencies(events, issues) {
  // Map serial -> { gtin, lot, expiration } from commissioning events
  const serialData = new Map(); // EPC URI -> { gtin, lot, exp, eventIndex }

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const uris = collectAllURIs(event);

    for (const uri of uris) {
      if (!uri.startsWith('urn:epc:id:sgtin:')) continue;
      const parsed = parseSGTIN(uri);
      if (!parsed) continue;

      const gtin = parsed.gtin;
      const lot = event.ilmd ? event.ilmd.lotNumber || null : null;
      const exp = event.ilmd ? event.ilmd.expirationDate || null : null;

      if (!serialData.has(uri)) {
        serialData.set(uri, { gtin, lot, exp, eventIndex: i });
      } else {
        const existing = serialData.get(uri);

        // Check GTIN consistency
        if (gtin && existing.gtin && gtin !== existing.gtin) {
          issues.push(createIssue(
            'Warning',
            'Inconsistent GTIN for same serial',
            `EPC "${uri}" has GTIN "${gtin}" in event ${i} but GTIN "${existing.gtin}" in event ${existing.eventIndex}.`,
            uri,
            event.eventTime || null,
            `EventList/Event[${i}]`,
            'Ensure the same serial number always maps to the same GTIN.',
            'GS1 Consistency'
          ));
        }

        // Check lot consistency (only if both have lot info)
        if (lot && existing.lot && lot !== existing.lot) {
          issues.push(createIssue(
            'Warning',
            'Inconsistent lot number for same serial',
            `EPC "${uri}" has lot "${lot}" in event ${i} but lot "${existing.lot}" in event ${existing.eventIndex}.`,
            uri,
            event.eventTime || null,
            `EventList/Event[${i}]`,
            'Ensure the same serial number always references the same lot number.',
            'GS1 Consistency'
          ));
        }

        // Check expiration consistency (only if both have exp info)
        if (exp && existing.exp && exp !== existing.exp) {
          issues.push(createIssue(
            'Warning',
            'Inconsistent expiration date for same serial',
            `EPC "${uri}" has expiration "${exp}" in event ${i} but "${existing.exp}" in event ${existing.eventIndex}.`,
            uri,
            event.eventTime || null,
            `EventList/Event[${i}]`,
            'Ensure the same serial number always references the same expiration date.',
            'GS1 Consistency'
          ));
        }
      }
    }
  }
}

/**
 * Detect UOM inconsistency per GTIN across quantity elements.
 */
function detectUOMInconsistencies(events, issues) {
  // Map GTIN -> Set of UOMs observed
  const gtinUOMs = new Map(); // GTIN -> { uoms: Set, events: [] }

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (!event.quantityList) continue;

    for (const qty of event.quantityList) {
      if (!qty.epcClass || !qty.uom) continue;
      let gtin = null;

      if (qty.epcClass.startsWith('urn:epc:id:sgtin:')) {
        const parsed = parseSGTIN(qty.epcClass);
        if (parsed) gtin = parsed.gtin;
      } else if (qty.epcClass.startsWith('urn:epc:idpat:sgtin:')) {
        // Class-level pattern: urn:epc:idpat:sgtin:<prefix>.<itemref>.*
        const match = qty.epcClass.match(/^urn:epc:idpat:sgtin:(\d+)\.(\d+)\.\*$/);
        if (match) {
          const [, cp, ir] = match;
          if (cp.length + ir.length === 13) {
            gtin = computeGTIN(cp, ir);
          }
        }
      }

      if (!gtin) continue;

      if (!gtinUOMs.has(gtin)) {
        gtinUOMs.set(gtin, { uoms: new Set(), events: [] });
      }
      const entry = gtinUOMs.get(gtin);
      entry.uoms.add(qty.uom);
      entry.events.push(i);
    }
  }

  for (const [gtin, data] of gtinUOMs) {
    if (data.uoms.size > 1) {
      const uomList = [...data.uoms].join(', ');
      issues.push(createIssue(
        'Info',
        'UOM inconsistency for GTIN',
        `GTIN "${gtin}" uses multiple units of measure: ${uomList}. This may indicate a data quality issue.`,
        gtin,
        null,
        'EventList/quantityList',
        'Standardize the unit of measure for each GTIN across all quantity elements.',
        'GS1 Consistency'
      ));
    }
  }
}


/**
 * Detect missing readPoint in events with specific bizSteps.
 * Missing readPoint in ObjectEvents/AggregationEvents with bizStep commissioning/shipping/receiving.
 */
function detectMissingReadPoint(events, issues) {
  const requiredBizSteps = ['commissioning', 'shipping', 'receiving'];
  const requiredEventTypes = ['ObjectEvent', 'AggregationEvent'];

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (!requiredEventTypes.includes(event.eventType)) continue;

    const bizStepSegment = event.bizStep ? getLastSegment(event.bizStep) : '';
    if (!requiredBizSteps.includes(bizStepSegment)) continue;

    if (!event.readPoint) {
      issues.push(createIssue(
        'Info',
        'Missing readPoint in event',
        `${event.eventType} at index ${i} with bizStep "${bizStepSegment}" is missing a readPoint. ReadPoint is recommended for ${bizStepSegment} events.`,
        'N/A',
        event.eventTime || null,
        `EventList/Event[${i}]/readPoint`,
        'Add a readPoint element identifying the physical location of this event.',
        'GS1 Structure'
      ));
    }
  }
}

/**
 * Detect missing bizLocation in ObjectEvents with bizStep commissioning.
 */
function detectMissingBizLocation(events, issues) {
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (event.eventType !== 'ObjectEvent') continue;

    const bizStepSegment = event.bizStep ? getLastSegment(event.bizStep) : '';
    if (bizStepSegment !== 'commissioning') continue;

    if (!event.bizLocation) {
      issues.push(createIssue(
        'Info',
        'Missing bizLocation in commissioning event',
        `ObjectEvent at index ${i} with bizStep commissioning is missing a bizLocation. BizLocation is recommended for commissioning events.`,
        'N/A',
        event.eventTime || null,
        `EventList/Event[${i}]/bizLocation`,
        'Add a bizLocation element identifying the business location of this commissioning event.',
        'GS1 Structure'
      ));
    }
  }
}


/**
 * Detect invalid source/destination format.
 * Must have both type and value non-empty.
 */
function validateSourcesDestinations(event, index, issues) {
  if (event.sourceList) {
    for (const source of event.sourceList) {
      if (!source.type || !source.value) {
        issues.push(createIssue(
          'Warning',
          'Invalid source format',
          `Event at index ${index} has a source entry with missing ${!source.type ? 'type' : 'value'}. Both type and value are required.`,
          'N/A',
          event.eventTime || null,
          `EventList/Event[${index}]/sourceList`,
          'Ensure each source element has both a non-empty type and a non-empty value.',
          'GS1 Format'
        ));
      }
    }
  }

  if (event.destinationList) {
    for (const dest of event.destinationList) {
      if (!dest.type || !dest.value) {
        issues.push(createIssue(
          'Warning',
          'Invalid destination format',
          `Event at index ${index} has a destination entry with missing ${!dest.type ? 'type' : 'value'}. Both type and value are required.`,
          'N/A',
          event.eventTime || null,
          `EventList/Event[${index}]/destinationList`,
          'Ensure each destination element has both a non-empty type and a non-empty value.',
          'GS1 Format'
        ));
      }
    }
  }
}


/**
 * Collect all EPC URIs from an event (epcList, parentID, childEPCs, quantityList epcClass).
 * @param {object} event - Parsed EPCIS event
 * @returns {string[]} Array of URI strings
 */
function collectAllURIs(event) {
  const uris = [];

  if (event.epcList) {
    for (const epc of event.epcList) {
      if (epc) uris.push(epc);
    }
  }

  if (event.parentID) {
    uris.push(event.parentID);
  }

  if (event.childEPCs) {
    for (const epc of event.childEPCs) {
      if (epc) uris.push(epc);
    }
  }

  if (event.quantityList) {
    for (const qty of event.quantityList) {
      if (qty.epcClass) uris.push(qty.epcClass);
    }
  }

  return uris;
}

/**
 * Validate an EPCIS document against GS1 standards.
 *
 * @param {object} doc - Parsed EPCIS document with events array
 * @param {object} epcMap - EPC classification map from epcExtractor.extractAll()
 * @returns {Issue[]} Array of detected issues
 */
export function validateGS1(doc, epcMap) {
  const issues = [];
  const events = doc.events || [];

  // Per-event validations
  for (let i = 0; i < events.length; i++) {
    const event = events[i];

    // 1. eventTime format
    validateEventTime(event, i, issues);

    // 2. eventTimeZoneOffset format
    validateTimeZoneOffset(event, i, issues);

    // 3. Missing required fields
    validateRequiredFields(event, i, issues);

    // 4. GTIN validation (check digit)
    validateGTINs(event, i, issues, epcMap);

    // 5. SSCC validation (check digit)
    validateSSCCs(event, i, issues);

    // 6. SGTIN URI format
    validateSGTINFormat(event, i, issues);

    // 7. Business step URI
    validateBizStep(event, i, issues);

    // 8. Disposition URI
    validateDisposition(event, i, issues);

    // 9, 10, 11. ILMD validation
    validateILMD(event, i, issues);

    // 18. Source/destination format
    validateSourcesDestinations(event, i, issues);
  }

  // Cross-event validations
  // 12. Duplicate serial numbers
  detectDuplicateSerials(events, issues);

  // 13. Duplicate event IDs
  detectDuplicateEventIDs(events, issues);

  // 14. Cross-event inconsistencies
  detectCrossEventInconsistencies(events, issues);

  // 15. UOM inconsistencies
  detectUOMInconsistencies(events, issues);

  // 16. Missing readPoint
  detectMissingReadPoint(events, issues);

  // 17. Missing bizLocation
  detectMissingBizLocation(events, issues);

  return issues;
}
