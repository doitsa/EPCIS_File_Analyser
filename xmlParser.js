/**
 * xmlParser.js - EPCIS XML Document Parser
 *
 * Parses EPCIS XML documents using browser-native DOMParser.
 * Extracts header, SBDH, master data, and all event types.
 *
 * @module xmlParser
 */

const EVENT_TYPES = [
  'ObjectEvent',
  'AggregationEvent',
  'TransactionEvent',
  'TransformationEvent',
  'AssociationEvent',
];

/**
 * Parse an EPCIS XML string into a structured document representation.
 * @param {string} xmlString - The raw XML string to parse
 * @returns {ParsedDocument} The parsed document with events, header, master data, and errors
 */
export function parse(xmlString) {
  const result = {
    header: null,
    sbdh: null,
    masterData: {},
    events: [],
    parseErrors: [],
  };

  // Parse XML using DOMParser
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'application/xml');

  // Check for parse errors
  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    const errorText = parserError.textContent || 'Unknown XML parsing error';
    result.parseErrors.push({
      message: errorText,
      line: extractLineNumber(errorText),
      severity: 'Critical',
    });
    return result;
  }

  // Extract SBDH
  const sbdh = extractSBDH(doc);
  result.sbdh = sbdh;

  // Extract EPCISHeader
  const header = extractHeader(doc, sbdh);
  result.header = header;

  // Build master data map from header
  if (header && header.masterData.length > 0) {
    for (const entry of header.masterData) {
      result.masterData[entry.id] = entry;
    }
  }

  // Check for EPCISBody
  const epcisBody = findByLocalName(doc.documentElement, 'EPCISBody');
  if (!epcisBody) {
    result.parseErrors.push({
      message: 'Invalid EPCIS document: EPCISBody element not found.',
      line: null,
      severity: 'Critical',
    });
    return result;
  }

  // Check for EventList
  const eventList = findByLocalName(epcisBody, 'EventList');
  if (!eventList) {
    result.parseErrors.push({
      message: 'Invalid EPCIS document: EventList element not found.',
      line: null,
      severity: 'Critical',
    });
    return result;
  }

  // Extract events
  result.events = extractEvents(doc);

  return result;
}

/**
 * Extract line number from a DOMParser error message.
 * @param {string} errorText - The error text from parsererror
 * @returns {number|null} The line number or null
 */
function extractLineNumber(errorText) {
  const lineMatch = errorText.match(/line\s+(\d+)/i);
  if (lineMatch) {
    return parseInt(lineMatch[1], 10);
  }
  return null;
}

/**
 * Find an element by its local name, ignoring namespace prefixes.
 * @param {Element} parent - Parent element to search within
 * @param {string} localName - Local name to find
 * @returns {Element|null} The first matching element or null
 */
function findByLocalName(parent, localName) {
  if (!parent) return null;
  const elements = parent.getElementsByTagName('*');
  for (let i = 0; i < elements.length; i++) {
    if (elements[i].localName === localName) {
      return elements[i];
    }
  }
  return null;
}

/**
 * Find all elements by their local name, ignoring namespace prefixes.
 * @param {Element} parent - Parent element to search within
 * @param {string} localName - Local name to find
 * @returns {Element[]} Array of matching elements
 */
function findAllByLocalName(parent, localName) {
  if (!parent) return [];
  const result = [];
  const elements = parent.getElementsByTagName('*');
  for (let i = 0; i < elements.length; i++) {
    if (elements[i].localName === localName) {
      result.push(elements[i]);
    }
  }
  return result;
}

/**
 * Find direct children by local name.
 * @param {Element} parent - Parent element
 * @param {string} localName - Local name to match
 * @returns {Element[]} Matching direct children
 */
function findDirectChildrenByLocalName(parent, localName) {
  if (!parent) return [];
  const result = [];
  for (let i = 0; i < parent.children.length; i++) {
    if (parent.children[i].localName === localName) {
      result.push(parent.children[i]);
    }
  }
  return result;
}

/**
 * Get text content of the first element matching localName within parent.
 * @param {Element} parent - Parent element
 * @param {string} localName - Local name to find
 * @returns {string|null} Text content or null
 */
function getTextByLocalName(parent, localName) {
  const el = findByLocalName(parent, localName);
  return el ? (el.textContent || '').trim() : null;
}

/**
 * Extract StandardBusinessDocumentHeader from the document.
 * @param {Document} doc - Parsed XML document
 * @returns {StandardBusinessDocumentHeader|null}
 */
function extractSBDH(doc) {
  const sbdhEl = findByLocalName(doc.documentElement, 'StandardBusinessDocumentHeader');
  if (!sbdhEl) return null;

  const senderEl = findByLocalName(sbdhEl, 'Sender');
  const receiverEl = findByLocalName(sbdhEl, 'Receiver');

  const sender = extractParty(senderEl);
  const receiver = extractParty(receiverEl);

  return { sender, receiver };
}

/**
 * Extract party (sender/receiver) information.
 * @param {Element|null} partyEl - Sender or Receiver element
 * @returns {{ identifier: string, name: string }}
 */
function extractParty(partyEl) {
  if (!partyEl) return { identifier: '', name: '' };

  const identifierEl = findByLocalName(partyEl, 'Identifier');
  const identifier = identifierEl ? (identifierEl.textContent || '').trim() : '';

  // Name can be in Contact or ContactInformation
  const contactEl = findByLocalName(partyEl, 'Contact');
  const name = contactEl ? (contactEl.textContent || '').trim() : '';

  return { identifier, name };
}

/**
 * Extract EPCISHeader with SBDH and master data.
 * @param {Document} doc - Parsed XML document
 * @param {StandardBusinessDocumentHeader|null} sbdh - Already-extracted SBDH
 * @returns {EPCISHeader|null}
 */
function extractHeader(doc, sbdh) {
  const headerEl = findByLocalName(doc.documentElement, 'EPCISHeader');
  if (!headerEl) return null;

  const masterData = extractMasterData(headerEl);

  return {
    standardBusinessDocumentHeader: sbdh,
    masterData,
  };
}

/**
 * Extract master data entries from EPCISHeader.
 * @param {Element} headerEl - EPCISHeader element
 * @returns {MasterDataEntry[]}
 */
function extractMasterData(headerEl) {
  const entries = [];
  const vocabularyElements = findAllByLocalName(headerEl, 'VocabularyElement');

  for (const vocabEl of vocabularyElements) {
    const id = vocabEl.getAttribute('id') || '';

    // Get vocabulary type from parent Vocabulary element
    let type = '';
    let parent = vocabEl.parentElement;
    while (parent) {
      if (parent.localName === 'Vocabulary') {
        type = parent.getAttribute('type') || '';
        break;
      }
      parent = parent.parentElement;
    }

    // Extract attributes
    const attributes = {};
    const attrElements = findDirectChildrenByLocalName(vocabEl, 'attribute');
    for (const attrEl of attrElements) {
      const attrId = attrEl.getAttribute('id') || '';
      const attrValue = (attrEl.textContent || '').trim();
      if (attrId) {
        attributes[attrId] = attrValue;
      }
    }

    entries.push({ id, type, attributes });
  }

  return entries;
}

/**
 * Extract all EPCIS events from the document.
 * @param {Document} doc - Parsed XML document
 * @returns {EPCISEvent[]}
 */
function extractEvents(doc) {
  const events = [];

  // Find EventList element
  const eventListEl = findByLocalName(doc.documentElement, 'EventList');
  if (!eventListEl) return events;

  // Track event index per type for xmlPath generation
  const typeCounters = {};

  for (const eventType of EVENT_TYPES) {
    const eventElements = findAllByLocalName(eventListEl, eventType);
    typeCounters[eventType] = 0;

    for (const eventEl of eventElements) {
      typeCounters[eventType]++;
      const index = typeCounters[eventType];
      const xmlPath = `EPCISBody/EventList/${eventType}[${index}]`;

      const event = parseEvent(eventEl, eventType, xmlPath);
      events.push(event);
    }
  }

  return events;
}

/**
 * Parse a single EPCIS event element into structured data.
 * @param {Element} eventEl - The event DOM element
 * @param {string} eventType - The event type name
 * @param {string} xmlPath - The generated xmlPath
 * @returns {EPCISEvent}
 */
function parseEvent(eventEl, eventType, xmlPath) {
  const event = {
    eventType,
    eventTime: getTextByLocalName(eventEl, 'eventTime') || '',
    eventTimeZoneOffset: getTextByLocalName(eventEl, 'eventTimeZoneOffset') || '',
    action: getTextByLocalName(eventEl, 'action') || '',
    bizStep: getTextByLocalName(eventEl, 'bizStep') || null,
    disposition: getTextByLocalName(eventEl, 'disposition') || null,
    readPoint: extractReadPoint(eventEl),
    bizLocation: extractBizLocation(eventEl),
    epcList: extractEPCList(eventEl),
    parentID: getTextByLocalName(eventEl, 'parentID') || null,
    childEPCs: extractChildEPCs(eventEl),
    quantityList: extractQuantityList(eventEl),
    sourceList: extractSourceList(eventEl),
    destinationList: extractDestinationList(eventEl),
    ilmd: extractILMD(eventEl),
    bizTransactionList: extractBizTransactionList(eventEl),
    eventID: getTextByLocalName(eventEl, 'eventID') || null,
    xmlPath,
  };

  // TransformationEvent special handling: inputEPCList and outputEPCList
  if (eventType === 'TransformationEvent') {
    const inputEPCs = extractInputEPCList(eventEl);
    const outputEPCs = extractOutputEPCList(eventEl);
    // Store input EPCs in epcList (as the primary list), output in childEPCs for accessibility
    event.epcList = inputEPCs;
    event.childEPCs = outputEPCs;
  }

  return event;
}

/**
 * Extract readPoint id from event.
 * @param {Element} eventEl - Event element
 * @returns {string|null}
 */
function extractReadPoint(eventEl) {
  const rpEl = findByLocalName(eventEl, 'readPoint');
  if (!rpEl) return null;
  const idEl = findByLocalName(rpEl, 'id');
  return idEl ? (idEl.textContent || '').trim() : null;
}

/**
 * Extract bizLocation id from event.
 * @param {Element} eventEl - Event element
 * @returns {string|null}
 */
function extractBizLocation(eventEl) {
  const blEl = findByLocalName(eventEl, 'bizLocation');
  if (!blEl) return null;
  const idEl = findByLocalName(blEl, 'id');
  return idEl ? (idEl.textContent || '').trim() : null;
}

/**
 * Extract EPC list from event (epcList/epc elements).
 * @param {Element} eventEl - Event element
 * @returns {string[]}
 */
function extractEPCList(eventEl) {
  const epcListEl = findByLocalName(eventEl, 'epcList');
  if (!epcListEl) return [];

  const epcs = [];
  const epcElements = findAllByLocalName(epcListEl, 'epc');
  for (const epcEl of epcElements) {
    const value = (epcEl.textContent || '').trim();
    if (value) epcs.push(value);
  }
  return epcs;
}

/**
 * Extract child EPCs from AggregationEvent (childEPCs/epc elements).
 * @param {Element} eventEl - Event element
 * @returns {string[]}
 */
function extractChildEPCs(eventEl) {
  const childEPCsEl = findByLocalName(eventEl, 'childEPCs');
  if (!childEPCsEl) return [];

  const epcs = [];
  const epcElements = findAllByLocalName(childEPCsEl, 'epc');
  for (const epcEl of epcElements) {
    const value = (epcEl.textContent || '').trim();
    if (value) epcs.push(value);
  }
  return epcs;
}

/**
 * Extract inputEPCList for TransformationEvent.
 * @param {Element} eventEl - Event element
 * @returns {string[]}
 */
function extractInputEPCList(eventEl) {
  const inputListEl = findByLocalName(eventEl, 'inputEPCList');
  if (!inputListEl) return [];

  const epcs = [];
  const epcElements = findAllByLocalName(inputListEl, 'epc');
  for (const epcEl of epcElements) {
    const value = (epcEl.textContent || '').trim();
    if (value) epcs.push(value);
  }
  return epcs;
}

/**
 * Extract outputEPCList for TransformationEvent.
 * @param {Element} eventEl - Event element
 * @returns {string[]}
 */
function extractOutputEPCList(eventEl) {
  const outputListEl = findByLocalName(eventEl, 'outputEPCList');
  if (!outputListEl) return [];

  const epcs = [];
  const epcElements = findAllByLocalName(outputListEl, 'epc');
  for (const epcEl of epcElements) {
    const value = (epcEl.textContent || '').trim();
    if (value) epcs.push(value);
  }
  return epcs;
}

/**
 * Extract quantity list from event.
 * Searches in both direct children and extension element.
 * @param {Element} eventEl - Event element
 * @returns {QuantityElement[]}
 */
function extractQuantityList(eventEl) {
  const quantities = [];

  // quantityList can be at event level or inside extension
  let quantityListEl = findByLocalName(eventEl, 'quantityList');
  if (!quantityListEl) return quantities;

  const quantityElements = findAllByLocalName(quantityListEl, 'quantityElement');
  for (const qEl of quantityElements) {
    const epcClass = getTextByLocalName(qEl, 'epcClass') || '';
    const quantityText = getTextByLocalName(qEl, 'quantity');
    const quantity = quantityText ? parseFloat(quantityText) : 0;
    const uom = getTextByLocalName(qEl, 'uom') || null;

    quantities.push({ epcClass, quantity, uom });
  }

  return quantities;
}

/**
 * Extract source list from event.
 * @param {Element} eventEl - Event element
 * @returns {SourceDest[]}
 */
function extractSourceList(eventEl) {
  const sources = [];
  const sourceListEl = findByLocalName(eventEl, 'sourceList');
  if (!sourceListEl) return sources;

  const sourceElements = findAllByLocalName(sourceListEl, 'source');
  for (const srcEl of sourceElements) {
    const type = srcEl.getAttribute('type') || '';
    const value = (srcEl.textContent || '').trim();
    sources.push({ type, value });
  }

  return sources;
}

/**
 * Extract destination list from event.
 * @param {Element} eventEl - Event element
 * @returns {SourceDest[]}
 */
function extractDestinationList(eventEl) {
  const destinations = [];
  const destListEl = findByLocalName(eventEl, 'destinationList');
  if (!destListEl) return destinations;

  const destElements = findAllByLocalName(destListEl, 'destination');
  for (const destEl of destElements) {
    const type = destEl.getAttribute('type') || '';
    const value = (destEl.textContent || '').trim();
    destinations.push({ type, value });
  }

  return destinations;
}

/**
 * Extract ILMD data from event.
 * Searches both direct ilmd element and ilmd inside extension element.
 * @param {Element} eventEl - Event element
 * @returns {ILMDData|null}
 */
function extractILMD(eventEl) {
  const ilmdEl = findByLocalName(eventEl, 'ilmd');
  if (!ilmdEl) return null;

  let lotNumber = null;
  let expirationDate = null;
  const additionalAttributes = {};

  // Iterate all child elements of ilmd
  const children = ilmdEl.getElementsByTagName('*');
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const name = child.localName;
    const value = (child.textContent || '').trim();

    if (isLotNumberField(name)) {
      lotNumber = value;
    } else if (isExpirationDateField(name)) {
      expirationDate = value;
    } else {
      // Only add leaf elements (no child elements)
      if (child.children.length === 0 && value) {
        additionalAttributes[name] = value;
      }
    }
  }

  return { lotNumber, expirationDate, additionalAttributes };
}

/**
 * Check if a field name represents a lot number.
 * @param {string} name - Element local name
 * @returns {boolean}
 */
function isLotNumberField(name) {
  const lotNames = ['lotnumber', 'lot', 'batchnumber', 'batch'];
  return lotNames.includes(name.toLowerCase());
}

/**
 * Check if a field name represents an expiration date.
 * @param {string} name - Element local name
 * @returns {boolean}
 */
function isExpirationDateField(name) {
  const expNames = [
    'itemexpirationdate',
    'expirationdate',
    'bestbeforedate',
    'usebydate',
    'expiry',
    'expiration',
  ];
  return expNames.includes(name.toLowerCase());
}

/**
 * Extract business transaction list from event.
 * @param {Element} eventEl - Event element
 * @returns {BizTransaction[]}
 */
function extractBizTransactionList(eventEl) {
  const transactions = [];
  const btListEl = findByLocalName(eventEl, 'bizTransactionList');
  if (!btListEl) return transactions;

  const btElements = findAllByLocalName(btListEl, 'bizTransaction');
  for (const btEl of btElements) {
    const type = btEl.getAttribute('type') || '';
    const value = (btEl.textContent || '').trim();
    transactions.push({ type, value });
  }

  return transactions;
}
