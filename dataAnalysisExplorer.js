/**
 * dataAnalysisExplorer.js - Data Analysis Hierarchical Explorer
 *
 * Builds a hierarchical tree of packaging relationships:
 * SSCC → Parent Case Serial → Child Serial Number
 *
 * Derives data from ssccExtractor, aggregationAnalyzer, epcExtractor,
 * productExtractor, and lotExpirationExtractor outputs.
 *
 * @module dataAnalysisExplorer
 */

import { isValidSSCC, isValidGTIN, parseSSCC } from './epcExtractor.js';

/**
 * Collect all leaf serial EPC IDs from a node recursively.
 *
 * @param {object} node - HierarchyNode
 * @returns {string[]} Array of leaf serial EPC URIs
 */
function collectLeafSerials(node) {
  if (node.level === 'serial' && node.children.length === 0) {
    return [node.id];
  }
  const serials = [];
  for (const child of node.children) {
    serials.push(...collectLeafSerials(child));
  }
  return serials;
}

/**
 * Resolve distinct GTINs for a node by looking up its leaf serial EPCs in epcMap.
 *
 * @param {object} node - HierarchyNode
 * @param {object} epcMap - EPCMap from epcExtractor
 * @returns {string[]} Array of distinct GTINs
 */
function resolveGTINs(node, epcMap) {
  if (!epcMap || !epcMap.all) return [];

  if (node.level === 'serial' && node.children.length === 0) {
    // Leaf serial: resolve from own URI
    const parsed = epcMap.all.get(node.id);
    if (parsed && parsed.gtin) {
      return [parsed.gtin];
    }
    return [];
  }

  // For case/SSCC: collect GTINs from all leaf serial descendants
  const leafSerials = collectLeafSerials(node);
  const gtinSet = new Set();
  for (const serialUri of leafSerials) {
    const parsed = epcMap.all.get(serialUri);
    if (parsed && parsed.gtin) {
      gtinSet.add(parsed.gtin);
    }
  }
  return [...gtinSet];
}

/**
 * Resolve product name(s) for given GTINs by looking up in products array.
 *
 * @param {string[]} gtins - Array of GTINs to look up
 * @param {object[]} products - ProductInfo[] from productExtractor
 * @returns {string} Comma-separated product names, empty if not found
 */
function resolveProductNames(gtins, products) {
  if (!products || products.length === 0 || gtins.length === 0) return '';

  const names = [];
  for (const gtin of gtins) {
    const product = products.find((p) => p.gtin === gtin);
    if (product && product.productName) {
      names.push(product.productName);
    }
  }
  return [...new Set(names)].join(', ');
}

/**
 * Resolve lot number(s) for given GTINs from commissioning event ILMD data.
 *
 * @param {string[]} gtins - Array of GTINs
 * @param {object} doc - ParsedDocument
 * @param {object} epcMap - EPCMap
 * @returns {string} Comma-separated lot numbers, empty if not found
 */
function resolveLots(gtins, doc, epcMap) {
  if (!doc || !doc.events || gtins.length === 0) return '';
  if (!epcMap || !epcMap.all) return '';

  const lotSet = new Set();

  for (const event of doc.events) {
    // Only commissioning events with ILMD lot data
    if (
      event.eventType !== 'ObjectEvent' ||
      event.action !== 'ADD' ||
      !event.bizStep ||
      !event.bizStep.toLowerCase().includes('commissioning') ||
      !event.ilmd ||
      !event.ilmd.lotNumber
    ) {
      continue;
    }

    // Check if any EPC in this event belongs to one of our target GTINs
    const eventEpcs = event.epcList || [];
    for (const epcUri of eventEpcs) {
      const parsed = epcMap.all.get(epcUri);
      if (parsed && parsed.gtin && gtins.includes(parsed.gtin)) {
        lotSet.add(event.ilmd.lotNumber);
        break;
      }
    }
  }

  return [...lotSet].join(', ');
}

/**
 * Resolve childrenCommissioned for a node.
 * - Serial nodes: 'N/A'
 * - Case nodes: use caseInfo.childrenCommissioned from casesMap
 * - SSCC nodes: 'Yes' if ALL case children have 'Yes', 'No' if any is 'No'
 *   For SSCCs with only direct serials (no cases), check casesMap or default to 'N/A'
 *
 * @param {object} node - HierarchyNode
 * @param {Map<string, object>} casesMap - Map of parentEPC → CaseInfo
 * @returns {string} 'Yes' | 'No' | 'N/A'
 */
function resolveChildrenCommissioned(node, casesMap) {
  if (node.level === 'serial') {
    return 'N/A';
  }

  if (node.level === 'case') {
    const caseInfo = casesMap.get(node.id);
    if (caseInfo) {
      return caseInfo.childrenCommissioned || 'No';
    }
    return 'No';
  }

  // SSCC level: check all case children
  const caseChildren = node.children.filter((c) => c.level === 'case');

  if (caseChildren.length === 0) {
    // SSCC with only direct serials or no children
    // If there are direct serial children, there's no case-level commission data
    // Return 'N/A' since there are no case-level children to evaluate
    return 'N/A';
  }

  // Check if ALL case children have 'Yes'
  const allYes = caseChildren.every((c) => c.childrenCommissioned === 'Yes');
  return allYes ? 'Yes' : 'No';
}

/**
 * Resolve validation status for a hierarchy node.
 * Checks GS1 check digit validity and structural integrity.
 *
 * - SSCC nodes: validate SSCC-18 check digit and non-empty children
 * - Case nodes: validate derived GTIN-14 check digit, non-empty children,
 *   and all childEPCs present in aggregation
 * - Serial nodes: validate derived GTIN-14 check digit
 *
 * @param {object} node - HierarchyNode to validate
 * @param {object} epcMap - EPCMap from epcExtractor
 * @param {Map<string, object>} casesMap - Map of parentEPC → CaseInfo
 */
function resolveValidationStatus(node, epcMap, casesMap) {
  if (node.level === 'sscc') {
    // Parse the SSCC URI to get the 18-digit SSCC
    const parsed = parseSSCC(node.id);
    if (parsed && parsed.sscc) {
      if (!isValidSSCC(parsed.sscc)) {
        node.validationStatus = 'fail';
        node.validationReason = 'Invalid SSCC check digit';
        return;
      }
    }
    // Check for empty SSCC (no aggregated content)
    if (node.children.length === 0) {
      node.validationStatus = 'fail';
      node.validationReason = 'Empty SSCC (no aggregated content)';
      return;
    }
    // All checks passed
    node.validationStatus = 'pass';
    node.validationReason = '';
    return;
  }

  if (node.level === 'case') {
    // Validate GTIN check digit - parse the first GTIN from the resolved comma-separated string
    const gtin = node.gtin ? node.gtin.split(',')[0].trim() : '';
    if (gtin && !isValidGTIN(gtin)) {
      node.validationStatus = 'fail';
      node.validationReason = 'Invalid GTIN check digit';
      return;
    }
    // Check for empty case (no child serials)
    if (node.children.length === 0) {
      node.validationStatus = 'fail';
      node.validationReason = 'Empty case (no child serials)';
      return;
    }
    // Check that all childEPCs are present in aggregation
    const caseInfo = casesMap.get(node.id);
    if (caseInfo && caseInfo.childEPCs) {
      for (const childEPC of caseInfo.childEPCs) {
        const childNode = node.children.find((c) => c.id === childEPC);
        if (!childNode) {
          node.validationStatus = 'fail';
          node.validationReason = 'Missing aggregation reference';
          return;
        }
      }
    }
    // All checks passed
    node.validationStatus = 'pass';
    node.validationReason = '';
    return;
  }

  if (node.level === 'serial') {
    // Validate GTIN check digit
    const gtin = node.gtin ? node.gtin.split(',')[0].trim() : '';
    if (gtin && !isValidGTIN(gtin)) {
      node.validationStatus = 'fail';
      node.validationReason = 'Invalid GTIN check digit';
      return;
    }
    // All checks passed
    node.validationStatus = 'pass';
    node.validationReason = '';
    return;
  }
}

/**
 * Recursively resolve metadata for a node and all its children.
 * Fills in: gtin, productName, lot, childrenCommissioned.
 *
 * @param {object} node - HierarchyNode to resolve
 * @param {object} epcMap - EPCMap from epcExtractor
 * @param {object[]} products - ProductInfo[] from productExtractor
 * @param {object} doc - ParsedDocument from xmlParser
 * @param {Map<string, object>} casesMap - Map of parentEPC → CaseInfo
 */
function resolveNodeMetadata(node, epcMap, products, doc, casesMap) {
  // First resolve children (bottom-up for childrenCommissioned)
  for (const child of node.children) {
    resolveNodeMetadata(child, epcMap, products, doc, casesMap);
  }

  // Resolve GTIN
  const gtins = resolveGTINs(node, epcMap);
  node.gtin = gtins.join(', ');

  // Resolve Product Name
  node.productName = resolveProductNames(gtins, products);

  // Resolve Lot
  node.lot = resolveLots(gtins, doc, epcMap);

  // Resolve Children Commissioned
  node.childrenCommissioned = resolveChildrenCommissioned(node, casesMap);

  // Resolve Validation Status (after metadata so node.gtin is available)
  resolveValidationStatus(node, epcMap, casesMap);
}

/**
 * Build the packaging hierarchy from analysis results.
 * Pure function, no DOM access.
 *
 * @param {object} params
 * @param {object[]} params.ssccs - SSCCInfo[] from ssccExtractor
 * @param {object} params.aggregation - AggregationResult from aggregationAnalyzer
 * @param {object} params.epcMap - EPCMap from epcExtractor
 * @param {object} params.doc - ParsedDocument from xmlParser
 * @param {object[]} params.products - ProductInfo[] from productExtractor
 * @returns {object[]} Array of HierarchyNode objects
 */
export function buildHierarchy({ ssccs, aggregation, epcMap, doc, products }) {
  // Normalize inputs
  const ssccList = ssccs || [];
  const cases = (aggregation && aggregation.cases) || [];
  const orphanedSerials = (aggregation && aggregation.orphanedSerials) || [];

  // Step 1: Index cases by parentEPC
  // Each case has { parentEPC, childEPCs, childCount, ... }
  const casesMap = new Map();
  for (const caseInfo of cases) {
    if (caseInfo.parentEPC) {
      casesMap.set(caseInfo.parentEPC, caseInfo);
    }
  }

  // Step 6: Fallback logic
  if (ssccList.length === 0) {
    const fallbackNodes = buildFallbackHierarchy(casesMap, orphanedSerials, epcMap, doc);
    // Resolve metadata for fallback nodes
    for (const node of fallbackNodes) {
      resolveNodeMetadata(node, epcMap, products, doc, casesMap);
    }
    return fallbackNodes;
  }

  // Step 2–5: Build SSCC-rooted hierarchy
  const ssccNodes = [];

  for (const sscc of ssccList) {
    const ssccUri = sscc.sscc;
    const childEPCs = sscc.childEPCs || [];

    // Classify children: case-level vs direct serial
    const caseChildren = [];
    const directSerialChildren = [];

    for (const childEPC of childEPCs) {
      if (casesMap.has(childEPC)) {
        // This child is itself a parent in another AggregationEvent → case level
        caseChildren.push(childEPC);
      } else {
        // Direct serial under SSCC (fallback per Req 3.3)
        directSerialChildren.push(childEPC);
      }
    }

    // Step 3 & 4: Build case nodes with their serial children
    const caseNodes = [];
    for (const caseEPC of caseChildren) {
      const caseInfo = casesMap.get(caseEPC);
      const serialEPCs = caseInfo.childEPCs || [];

      // Build serial nodes (level 3)
      const serialNodes = serialEPCs.map((serialEPC) => ({
        id: serialEPC,
        level: 'serial',
        productName: '',
        gtin: '',
        lot: '',
        childrenCommissioned: 'N/A',
        aggregatedSerials: 0,
        validationStatus: 'pass',
        validationReason: '',
        children: [],
      }));

      // Sort serial nodes alphabetically by id
      serialNodes.sort((a, b) => a.id.localeCompare(b.id));

      // Build case node (level 2)
      caseNodes.push({
        id: caseEPC,
        level: 'case',
        productName: '',
        gtin: '',
        lot: '',
        childrenCommissioned: 'N/A',
        aggregatedSerials: serialNodes.length,
        validationStatus: 'pass',
        validationReason: '',
        children: serialNodes,
      });
    }

    // Build direct serial nodes under SSCC (level 2 fallback per Req 3.3)
    const directSerialNodes = directSerialChildren.map((serialEPC) => ({
      id: serialEPC,
      level: 'serial',
      productName: '',
      gtin: '',
      lot: '',
      childrenCommissioned: 'N/A',
      aggregatedSerials: 0,
      validationStatus: 'pass',
      validationReason: '',
      children: [],
    }));

    // Combine case nodes and direct serial nodes, sort alphabetically
    const allChildren = [...caseNodes, ...directSerialNodes];
    allChildren.sort((a, b) => a.id.localeCompare(b.id));

    // Step 5: Compute aggregatedSerials for SSCC = total leaf serials (recursive)
    const totalLeafSerials = computeRecursiveSerialCount(allChildren);

    // Build SSCC node (level 1)
    ssccNodes.push({
      id: ssccUri,
      level: 'sscc',
      productName: '',
      gtin: '',
      lot: '',
      childrenCommissioned: 'N/A',
      aggregatedSerials: totalLeafSerials,
      validationStatus: 'pass',
      validationReason: '',
      children: allChildren,
    });
  }

  // Step 7: Sort top-level SSCC nodes alphabetically by id
  ssccNodes.sort((a, b) => a.id.localeCompare(b.id));

  // Resolve metadata for all nodes
  for (const node of ssccNodes) {
    resolveNodeMetadata(node, epcMap, products, doc, casesMap);
  }

  return ssccNodes;
}

/**
 * Compute the recursive count of leaf serial nodes under a list of children.
 * For case nodes: count their children (serial nodes).
 * For serial nodes: count 1 each (they are themselves leaves).
 *
 * @param {object[]} children - Array of HierarchyNode children
 * @returns {number} Total leaf serial count
 */
function computeRecursiveSerialCount(children) {
  let count = 0;
  for (const child of children) {
    if (child.level === 'serial') {
      count += 1;
    } else if (child.level === 'case') {
      // Case's aggregatedSerials is its direct child count
      count += child.aggregatedSerials;
    } else {
      // Nested SSCC (unlikely but handle recursively)
      count += child.aggregatedSerials;
    }
  }
  return count;
}

/**
 * Build fallback hierarchy when no SSCCs are present.
 *
 * @param {Map<string, object>} casesMap - Map of parentEPC → CaseInfo
 * @param {string[]} orphanedSerials - Orphaned serial EPCs
 * @param {object} epcMap - EPCMap
 * @param {object} doc - ParsedDocument
 * @returns {object[]} Array of HierarchyNode objects
 */
function buildFallbackHierarchy(casesMap, orphanedSerials, epcMap, doc) {
  // Fallback 1: If cases exist, promote them to top-level
  if (casesMap.size > 0) {
    const caseNodes = [];

    for (const [caseEPC, caseInfo] of casesMap) {
      const serialEPCs = caseInfo.childEPCs || [];

      // Build serial children
      const serialNodes = serialEPCs.map((serialEPC) => ({
        id: serialEPC,
        level: 'serial',
        productName: '',
        gtin: '',
        lot: '',
        childrenCommissioned: 'N/A',
        aggregatedSerials: 0,
        validationStatus: 'pass',
        validationReason: '',
        children: [],
      }));

      serialNodes.sort((a, b) => a.id.localeCompare(b.id));

      caseNodes.push({
        id: caseEPC,
        level: 'case',
        productName: '',
        gtin: '',
        lot: '',
        childrenCommissioned: 'N/A',
        aggregatedSerials: serialNodes.length,
        validationStatus: 'pass',
        validationReason: '',
        children: serialNodes,
      });
    }

    caseNodes.sort((a, b) => a.id.localeCompare(b.id));
    return caseNodes;
  }

  // Fallback 2: If orphaned serials exist, list them as loose units
  if (orphanedSerials.length > 0) {
    const serialNodes = orphanedSerials.map((serialEPC) => ({
      id: serialEPC,
      level: 'serial',
      productName: '',
      gtin: '',
      lot: '',
      childrenCommissioned: 'N/A',
      aggregatedSerials: 0,
      validationStatus: 'pass',
      validationReason: '',
      children: [],
    }));

    serialNodes.sort((a, b) => a.id.localeCompare(b.id));
    return serialNodes;
  }

  // Fallback 3: Also check for commissioned EPCs in the document
  const commissionedEPCs = getCommissionedEPCsList(doc);
  if (commissionedEPCs.length > 0) {
    const serialNodes = commissionedEPCs.map((serialEPC) => ({
      id: serialEPC,
      level: 'serial',
      productName: '',
      gtin: '',
      lot: '',
      childrenCommissioned: 'N/A',
      aggregatedSerials: 0,
      validationStatus: 'pass',
      validationReason: '',
      children: [],
    }));

    serialNodes.sort((a, b) => a.id.localeCompare(b.id));
    return serialNodes;
  }

  // Nothing exists → empty array
  return [];
}

/**
 * Get commissioned EPCs from document events as a fallback source.
 *
 * @param {object} doc - ParsedDocument
 * @returns {string[]} Array of commissioned EPC URIs
 */
function getCommissionedEPCsList(doc) {
  if (!doc || !doc.events) return [];

  const commissioned = new Set();
  for (const event of doc.events) {
    if (
      event.eventType === 'ObjectEvent' &&
      event.action === 'ADD' &&
      event.bizStep &&
      event.bizStep.toLowerCase().includes('commissioning')
    ) {
      const epcList = event.epcList || [];
      for (const epc of epcList) {
        commissioned.add(epc);
      }
    }
  }

  return [...commissioned];
}

// ─── RENDERING ─────────────────────────────────────────────────────────────────

/**
 * HTML-escape a string to prevent XSS.
 * @param {string} str - String to escape
 * @returns {string} Escaped string safe for HTML content
 */
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Truncate an EPC URI for display, showing the last meaningful segments.
 * @param {string} uri - Full EPC URI
 * @returns {string} Truncated URI for display
 */
function truncateUri(uri) {
  if (!uri) return '';
  // Show last meaningful segment
  const parts = uri.split(':');
  if (parts.length >= 4) {
    return parts.slice(-2).join(':');
  }
  return uri.length > 40 ? '...' + uri.slice(-37) : uri;
}

/**
 * Render a single hierarchy node and its children recursively.
 * @param {object} node - HierarchyNode to render
 * @returns {HTMLElement} DOM element representing the node
 */
function renderNode(node) {
  const wrapper = document.createElement('div');

  // Row
  const row = document.createElement('div');
  row.className = 'hierarchy-row';
  row.setAttribute('data-level', node.level);
  row.setAttribute('data-id', node.id);

  // Toggle (only for non-leaf nodes)
  if (node.children.length > 0) {
    const toggle = document.createElement('span');
    toggle.className = 'hierarchy-toggle';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Expand');
    toggle.textContent = '▶';
    row.appendChild(toggle);
  }

  // ID display (truncated)
  const idSpan = document.createElement('span');
  idSpan.className = 'hierarchy-id text-mono';
  idSpan.textContent = truncateUri(node.id);
  idSpan.title = node.id; // Full URI on hover
  row.appendChild(idSpan);

  // Metadata fields in order: Product Name, Lot, GTIN, Children Commissioned, Aggregated Serials, Validation Status
  const fields = [
    { value: node.productName, label: 'Product' },
    { value: node.lot, label: 'Lot' },
    { value: node.gtin, label: 'GTIN' },
    { value: node.childrenCommissioned, label: 'Commissioned' },
    { value: node.level === 'serial' ? '' : String(node.aggregatedSerials), label: 'Serials' },
  ];

  for (const field of fields) {
    const span = document.createElement('span');
    span.className = 'hierarchy-field';
    span.textContent = field.value || '';
    span.title = field.label + ': ' + (field.value || '\u2014');
    row.appendChild(span);
  }

  // Validation status icon
  const validIcon = document.createElement('span');
  validIcon.className = `hierarchy-validation ${node.validationStatus}`;
  validIcon.setAttribute(
    'aria-label',
    `Validation: ${node.validationStatus === 'pass' ? 'Passed' : 'Failed - ' + node.validationReason}`
  );
  validIcon.textContent = node.validationStatus === 'pass' ? '✓' : '✗';
  validIcon.title =
    node.validationStatus === 'pass' ? 'Valid' : node.validationReason;
  row.appendChild(validIcon);

  wrapper.appendChild(row);

  // Children container (hidden by default)
  if (node.children.length > 0) {
    const childrenContainer = document.createElement('div');
    childrenContainer.className = 'hierarchy-children';
    childrenContainer.hidden = true;

    for (const child of node.children) {
      childrenContainer.appendChild(renderNode(child));
    }

    wrapper.appendChild(childrenContainer);
  }

  return wrapper;
}

/**
 * Render the Data Analysis explorer into the DOM.
 * Calls buildHierarchy internally and produces the tree UI.
 *
 * @param {object|null|undefined} analysisResults - The full analysis results object
 */
export function renderDataAnalysis(analysisResults) {
  // Find the container element (the "Data Analysis" section content area)
  const container = document.getElementById('data-analysis-content');
  if (!container) return;

  // Return immediately if no data
  if (!analysisResults) {
    container.innerHTML = '';
    return;
  }

  // Build hierarchy from analysis results
  const hierarchy = buildHierarchy({
    ssccs: analysisResults.ssccs || [],
    aggregation: analysisResults.aggregation || {
      cases: [],
      emptyCases: [],
      orphanedSerials: [],
    },
    epcMap: analysisResults.epcMap || {
      all: new Map(),
      bySGTIN: new Map(),
      bySSCC: new Map(),
      bySerial: new Map(),
    },
    doc: analysisResults.document || { events: [], masterData: {} },
    products: analysisResults.products || [],
  });

  // Clear container
  container.innerHTML = '';

  // Empty state
  if (hierarchy.length === 0) {
    container.innerHTML =
      '<div class="empty-state">No packaging hierarchy data found in this document.</div>';
    return;
  }

  // Render tree
  const tree = document.createElement('div');
  tree.className = 'hierarchy-tree';

  // Render nodes
  for (const node of hierarchy) {
    tree.appendChild(renderNode(node));
  }

  // Add event delegation for expand/collapse
  tree.addEventListener('click', (e) => {
    const toggle = e.target.closest('.hierarchy-toggle');
    if (!toggle) return;

    const row = toggle.closest('.hierarchy-row');
    if (!row) return;

    // The DOM structure is: wrapper > row + childrenContainer
    // So navigate to the wrapper (row's parent) and find .hierarchy-children
    const wrapper = row.parentElement;
    if (!wrapper) return;

    const childrenContainer = wrapper.querySelector('.hierarchy-children');
    if (!childrenContainer) return;

    const isExpanded = toggle.getAttribute('aria-expanded') === 'true';

    if (isExpanded) {
      // Collapse: hide children but preserve their internal expanded/collapsed states
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Expand');
      toggle.textContent = '▶';
      childrenContainer.hidden = true;
    } else {
      // Expand: show children (their internal states are preserved since we only toggle hidden)
      toggle.setAttribute('aria-expanded', 'true');
      toggle.setAttribute('aria-label', 'Collapse');
      toggle.textContent = '▼';
      childrenContainer.hidden = false;
    }
  });

  container.appendChild(tree);
}
