/**
 * EPCIS File Analyzer - Main Entry Point & Event Bus
 *
 * Orchestrates file upload, parsing, extraction, validation, filtering,
 * rendering, and export. Uses an event bus for decoupled module communication.
 *
 * @module main
 */

import { parse } from './xmlParser.js';
import { extractAll } from './epcExtractor.js';
import { extractProducts } from './productExtractor.js';
import { extractLotExpiration } from './lotExpirationExtractor.js';
import { analyzeCases } from './aggregationAnalyzer.js';
import { extractSSCCs } from './ssccExtractor.js';
import { validateSequences } from './sequenceValidator.js';
import { validateGS1 } from './gs1Validator.js';
import { validateDSCSA } from './dscsaValidator.js';
import { classifyAndAggregate } from './issueDetector.js';
import { applyFilters, clearFilters } from './filterEngine.js';
import { exportReport } from './exportEngine.js';
import {
  renderDashboard,
  renderEventInspector,
  renderProductTable,
  renderCaseTable,
  renderSSCCTable,
  renderIssuesTable,
  renderFilters,
  renderPagination,
  sortTable,
} from './uiRenderer.js';

// ─── Event Bus ───────────────────────────────────────────────────────────────

/**
 * Simple event bus for decoupled module communication.
 */
const EventBus = {
  _listeners: {},

  /**
   * Subscribe to an event.
   * @param {string} event - Event name
   * @param {Function} handler - Callback function
   */
  on(event, handler) {
    if (!this._listeners[event]) {
      this._listeners[event] = [];
    }
    this._listeners[event].push(handler);
  },

  /**
   * Unsubscribe from an event.
   * @param {string} event - Event name
   * @param {Function} handler - Callback to remove
   */
  off(event, handler) {
    if (!this._listeners[event]) return;
    this._listeners[event] = this._listeners[event].filter((h) => h !== handler);
  },

  /**
   * Emit an event to all subscribers.
   * @param {string} event - Event name
   * @param {*} data - Data payload
   */
  emit(event, data) {
    if (!this._listeners[event]) return;
    for (const handler of this._listeners[event]) {
      try {
        handler(data);
      } catch (err) {
        console.error(`EventBus error in "${event}" handler:`, err);
      }
    }
  },
};

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const SECTIONS_TO_SHOW = [
  'dashboard-section',
  'filter-section',
  'event-inspector-section',
  'product-section',
  'case-section',
  'sscc-section',
  'issues-section',
  'export-section',
];

// ─── Global State ────────────────────────────────────────────────────────────

let analysisResults = null;
let parsedDoc = null;

// ─── Utility ─────────────────────────────────────────────────────────────────

/**
 * Count items in an array by a given key.
 * @param {object[]} arr - Array of objects
 * @param {string} key - Property name to group by
 * @returns {Record<string, number>} Counts by key value
 */
function countBy(arr, key) {
  const counts = {};
  for (const item of arr) {
    const value = item[key] || 'Unknown';
    counts[value] = (counts[value] || 0) + 1;
  }
  return counts;
}

/**
 * Show an error message in the upload error area.
 * @param {string} message - Error text to display
 */
function showError(message) {
  const errorEl = document.getElementById('upload-error');
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.hidden = false;
  }
}

/**
 * Hide the upload error message.
 */
function hideError() {
  const errorEl = document.getElementById('upload-error');
  if (errorEl) {
    errorEl.textContent = '';
    errorEl.hidden = true;
  }
}

/**
 * Show file info section with the given filename.
 * @param {string} name - File name to display
 */
function showFileInfo(name) {
  const fileInfoEl = document.getElementById('file-info');
  const fileNameEl = document.getElementById('file-name');
  if (fileInfoEl) fileInfoEl.hidden = false;
  if (fileNameEl) fileNameEl.textContent = name;
}

/**
 * Hide file info section.
 */
function hideFileInfo() {
  const fileInfoEl = document.getElementById('file-info');
  const fileNameEl = document.getElementById('file-name');
  if (fileInfoEl) fileInfoEl.hidden = true;
  if (fileNameEl) fileNameEl.textContent = '';
}

/**
 * Show all analysis sections.
 */
function showSections() {
  for (const id of SECTIONS_TO_SHOW) {
    const el = document.getElementById(id);
    if (el) el.hidden = false;
  }
}

/**
 * Hide all analysis sections.
 */
function hideSections() {
  for (const id of SECTIONS_TO_SHOW) {
    const el = document.getElementById(id);
    if (el) el.hidden = true;
  }
}

// ─── Browser Compatibility Check ────────────────────────────────────────────

/**
 * Check that required browser APIs are available.
 * @returns {boolean} True if supported
 */
function checkBrowserSupport() {
  const required = [
    typeof DOMParser !== 'undefined',
    typeof FileReader !== 'undefined',
    typeof Blob !== 'undefined',
    typeof Map !== 'undefined',
    typeof Set !== 'undefined',
  ];
  return required.every(Boolean);
}

// ─── File Validation ─────────────────────────────────────────────────────────

/**
 * Validate file extension is .xml
 * @param {File} file - The file to validate
 * @returns {boolean} True if valid
 */
function validateFileExtension(file) {
  const name = file.name || '';
  return name.toLowerCase().endsWith('.xml');
}

/**
 * Validate file size is within limits.
 * @param {File} file - The file to validate
 * @returns {boolean} True if valid
 */
function validateFileSize(file) {
  return file.size <= MAX_FILE_SIZE;
}

// ─── File Processing Pipeline ────────────────────────────────────────────────

/**
 * Process an uploaded file: validate, read, parse, analyze, render.
 * @param {File} file - The uploaded file
 */
function processFile(file) {
  hideError();

  // Validate extension
  if (!validateFileExtension(file)) {
    showError('Please select an XML file (.xml extension required).');
    return;
  }

  // Validate size
  if (!validateFileSize(file)) {
    showError('File too large. Maximum allowed size is 10MB.');
    return;
  }

  // Show file name
  showFileInfo(file.name);

  // Read file
  const reader = new FileReader();
  reader.onload = function (e) {
    const text = e.target.result;
    try {
      analyzeFile(text, file.name);
    } catch (err) {
      showError(`Analysis error: ${err.message}`);
    }
  };
  reader.onerror = function () {
    showError('Failed to read file.');
  };
  reader.readAsText(file);
}

/**
 * Run the full analysis pipeline on parsed text.
 * @param {string} text - XML file content
 * @param {string} fileName - Original file name
 */
function analyzeFile(text, fileName) {
  // Step 1: Parse XML
  const doc = parse(text);
  parsedDoc = doc;

  // Check for critical parse errors
  const criticalErrors = (doc.parseErrors || []).filter(
    (e) => e.severity === 'Critical'
  );
  if (criticalErrors.length > 0) {
    showError(criticalErrors[0].message);
    return;
  }

  // Step 2: Extract EPCs
  const epcMap = extractAll(doc.events);

  // Step 3: Extract products
  const products = extractProducts(doc, epcMap);

  // Step 4: Extract lot/expiration data
  const lotExpData = extractLotExpiration(doc, epcMap);

  // Step 5: Analyze aggregation/cases
  const aggregation = analyzeCases(doc, epcMap);

  // Step 6: Extract SSCCs
  const ssccs = extractSSCCs(doc);

  // Step 7: Validate
  const issues1 = validateSequences(doc);
  const issues2 = validateGS1(doc, epcMap);
  const issues3 = validateDSCSA(doc);

  // Step 8: Classify and aggregate all issues
  const allRawIssues = [
    ...issues1,
    ...issues2,
    ...issues3,
    ...(doc.parseErrors || []).map((pe) => ({
      severity: pe.severity || 'Warning',
      title: pe.message,
      description: pe.message,
      affectedItem: 'N/A',
      eventTime: null,
      xmlPath: pe.line ? `Line ${pe.line}` : '',
      suggestedCorrection: '',
      category: 'Parse Error',
    })),
  ];
  const issues = classifyAndAggregate(allRawIssues);

  // Step 9: Compute dashboard metrics
  const metrics = {
    totalUniqueSerials: epcMap.all.size - (epcMap.bySSCC ? epcMap.bySSCC.size : 0),
    totalCases: aggregation.cases ? aggregation.cases.length : 0,
    totalProducts: products.length,
    totalSSCCs: ssccs.length,
    eventCountByType: countBy(doc.events, 'eventType'),
    eventCountByAction: countBy(doc.events, 'action'),
    uniqueBizSteps: [...new Set(doc.events.map((e) => e.bizStep).filter(Boolean))],
    uniqueDispositions: [...new Set(doc.events.map((e) => e.disposition).filter(Boolean))],
    uniqueReadPoints: [...new Set(doc.events.map((e) => e.readPoint).filter(Boolean))],
    uniqueBizLocations: [...new Set(doc.events.map((e) => e.bizLocation).filter(Boolean))],
    allGTINs: epcMap.bySGTIN ? [...epcMap.bySGTIN.keys()] : [],
    allNDCs: products.map((p) => p.ndc).filter(Boolean),
    lotsByProduct: lotExpData.lotsByProduct,
    expirationsByProduct: lotExpData.expirationsByProduct,
    caseSerials: aggregation.cases ? aggregation.cases.map((c) => c.parentEPC) : [],
    ssccIdentifiers: ssccs.map((s) => s.sscc),
    sender: doc.sbdh?.sender || null,
    receiver: doc.sbdh?.receiver || null,
  };

  // Step 10: Store global results
  analysisResults = {
    metrics,
    doc,
    epcMap,
    products,
    lotExpData,
    aggregation,
    ssccs,
    issues,
    events: doc.events,
    fileName,
  };

  // Emit analysis complete event
  EventBus.emit('analysisComplete', analysisResults);

  // Step 11: Render all sections
  renderAll(analysisResults);
}

/**
 * Render all sections with analysis results.
 * @param {object} results - The full analysis results object
 */
function renderAll(results) {
  showSections();

  renderDashboard(results);
  renderEventInspector(results.events);
  renderProductTable(results.products);
  renderCaseTable(results.aggregation);
  renderSSCCTable(results.ssccs);
  renderIssuesTable(results.issues);
  renderFilters(results);

  EventBus.emit('renderComplete', results);
}

/**
 * Re-render tables after filtering.
 * @param {object} filtered - FilteredResults from filterEngine
 */
function renderFiltered(filtered) {
  renderEventInspector(filtered.events);
  renderProductTable(filtered.products);
  renderCaseTable({ cases: filtered.cases });
  renderSSCCTable(filtered.ssccs);
  renderIssuesTable(filtered.issues);
}

// ─── Filter Wiring ──────────────────────────────────────────────────────────

/**
 * Gather current filter criteria from DOM filter controls.
 * @returns {object} FilterCriteria object
 */
function gatherFilterCriteria() {
  const getVal = (id) => {
    const el = document.getElementById(id);
    return el ? el.value || null : null;
  };

  return {
    product: getVal('filter-product'),
    lotNumber: getVal('filter-lot'),
    expirationDate: getVal('filter-expiration'),
    eventType: getVal('filter-event-type'),
    bizStep: getVal('filter-biz-step'),
    disposition: getVal('filter-disposition'),
    serialNumber: getVal('filter-serial'),
    caseSerial: getVal('filter-case-serial'),
    sscc: getVal('filter-sscc'),
    issueSeverity: getVal('filter-severity'),
    issueType: getVal('filter-issue-type'),
    searchQuery: null,
  };
}

/**
 * Handle filter changes: gather criteria, apply, re-render.
 */
function handleFilterChange() {
  if (!analysisResults) return;

  const criteria = gatherFilterCriteria();
  const filtered = applyFilters(
    {
      events: analysisResults.events,
      products: analysisResults.products,
      cases: analysisResults.aggregation.cases || [],
      ssccs: analysisResults.ssccs,
      issues: analysisResults.issues,
    },
    criteria
  );

  renderFiltered(filtered);
  EventBus.emit('filterApplied', { criteria, filtered });
}

/**
 * Handle clear filters button.
 */
function handleClearFilters() {
  clearFilters();

  // Reset DOM filter controls
  const filterIds = [
    'filter-product',
    'filter-lot',
    'filter-expiration',
    'filter-event-type',
    'filter-biz-step',
    'filter-disposition',
    'filter-serial',
    'filter-case-serial',
    'filter-sscc',
    'filter-severity',
    'filter-issue-type',
  ];

  for (const id of filterIds) {
    const el = document.getElementById(id);
    if (el) el.value = '';
  }

  // Re-render with unfiltered data
  if (analysisResults) {
    renderFiltered({
      events: analysisResults.events,
      products: analysisResults.products,
      cases: analysisResults.aggregation.cases || [],
      ssccs: analysisResults.ssccs,
      issues: analysisResults.issues,
    });
  }

  EventBus.emit('filtersCleared');
}

// ─── Export Wiring ───────────────────────────────────────────────────────────

/**
 * Wire export button click handlers.
 */
function wireExportButtons() {
  const exportMappings = [
    { id: 'export-full-btn', type: 'full-analysis' },
    { id: 'export-issues-btn', type: 'issues-only' },
    { id: 'export-products-btn', type: 'product-summary' },
    { id: 'export-cases-btn', type: 'case-aggregation' },
    { id: 'export-json-btn', type: 'json-report' },
  ];

  for (const mapping of exportMappings) {
    const btn = document.getElementById(mapping.id);
    if (btn) {
      btn.addEventListener('click', () => {
        if (!analysisResults) {
          showExportError('No data loaded. Please upload an EPCIS file first.');
          return;
        }
        try {
          exportReport(mapping.type, analysisResults);
          EventBus.emit('exportGenerated', { type: mapping.type });
        } catch (err) {
          showExportError(`Export failed: ${err.message}`);
        }
      });
    }
  }
}

/**
 * Show export error message.
 * @param {string} message - Error text
 */
function showExportError(message) {
  const el = document.getElementById('export-error');
  if (el) {
    el.textContent = message;
    el.hidden = false;
    setTimeout(() => {
      el.hidden = true;
    }, 5000);
  }
}

// ─── SSCC Selection Wiring ───────────────────────────────────────────────────

/**
 * Handle SSCC row selection to show related events.
 * @param {string} sscc - Selected SSCC identifier
 */
function handleSSCCSelection(sscc) {
  if (!analysisResults || !analysisResults.events) return;

  const relatedEvents = analysisResults.events.filter((event) => {
    // Check parentID
    if (event.parentID && event.parentID.includes(sscc)) return true;
    // Check epcList
    if (event.epcList && event.epcList.some((epc) => epc.includes(sscc))) return true;
    // Check childEPCs
    if (event.childEPCs && event.childEPCs.some((epc) => epc.includes(sscc))) return true;
    return false;
  });

  const detailPanel = document.getElementById('sscc-detail-panel');
  const detailTitle = document.getElementById('sscc-detail-title');
  const detailContent = document.getElementById('sscc-detail-content');

  if (detailPanel && detailTitle && detailContent) {
    detailPanel.hidden = false;
    detailTitle.textContent = `Events for SSCC: ${sscc}`;

    if (relatedEvents.length === 0) {
      detailContent.innerHTML = '<p>No events found for this SSCC.</p>';
    } else {
      detailContent.innerHTML = relatedEvents
        .map(
          (evt) =>
            `<div class="sscc-event-item">
              <strong>${evt.eventType}</strong> &mdash; ${evt.eventTime || 'N/A'}
              <br>Action: ${evt.action || 'N/A'}
              ${evt.bizStep ? `<br>Biz Step: ${evt.bizStep}` : ''}
              ${evt.disposition ? `<br>Disposition: ${evt.disposition}` : ''}
            </div>`
        )
        .join('');
    }
  }

  EventBus.emit('ssccSelected', { sscc, relatedEvents });
}

// ─── Clear / Reset ───────────────────────────────────────────────────────────

/**
 * Reset the application to its initial state.
 */
function resetState() {
  analysisResults = null;
  parsedDoc = null;
  hideError();
  hideFileInfo();
  hideSections();
  clearFilters();

  // Reset file input
  const fileInput = document.getElementById('file-input');
  if (fileInput) fileInput.value = '';

  // Hide SSCC detail panel
  const ssccPanel = document.getElementById('sscc-detail-panel');
  if (ssccPanel) ssccPanel.hidden = true;

  EventBus.emit('stateReset');
}

// ─── Drag & Drop Wiring ─────────────────────────────────────────────────────

/**
 * Set up drag-and-drop event listeners on the drop zone.
 */
function wireDropZone() {
  const dropZone = document.getElementById('drop-zone');
  if (!dropZone) return;

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.add('drop-zone--active');
  });

  dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('drop-zone--active');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('drop-zone--active');

    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  });
}

/**
 * Set up file input change listener.
 */
function wireFileInput() {
  const fileInput = document.getElementById('file-input');
  if (!fileInput) return;

  fileInput.addEventListener('change', (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  });
}

/**
 * Set up clear file button listener.
 */
function wireClearButton() {
  const clearBtn = document.getElementById('clear-file-btn');
  if (!clearBtn) return;

  clearBtn.addEventListener('click', resetState);
}

// ─── Filter Control Wiring ───────────────────────────────────────────────────

/**
 * Wire filter dropdown and input change listeners.
 */
function wireFilterControls() {
  const selectFilterIds = [
    'filter-product',
    'filter-lot',
    'filter-expiration',
    'filter-event-type',
    'filter-biz-step',
    'filter-disposition',
    'filter-severity',
    'filter-issue-type',
  ];

  for (const id of selectFilterIds) {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', handleFilterChange);
    }
  }

  // Text inputs with debounce
  const textFilterIds = ['filter-serial', 'filter-case-serial', 'filter-sscc'];
  for (const id of textFilterIds) {
    const el = document.getElementById(id);
    if (el) {
      let debounceTimer;
      el.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(handleFilterChange, 300);
      });
    }
  }

  // Clear filters button
  const clearFiltersBtn = document.getElementById('clear-filters-btn');
  if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener('click', handleClearFilters);
  }
}

// ─── SSCC Table Selection Wiring ─────────────────────────────────────────────

/**
 * Wire SSCC table row click events using event delegation.
 */
function wireSSCCTableSelection() {
  const ssccTableBody = document.getElementById('sscc-table-body');
  if (!ssccTableBody) return;

  ssccTableBody.addEventListener('click', (e) => {
    const row = e.target.closest('tr[data-sscc]');
    if (row) {
      const sscc = row.getAttribute('data-sscc');
      if (sscc) {
        handleSSCCSelection(sscc);
      }
    }
  });
}

// ─── Collapsible Sections ────────────────────────────────────────────────────

/**
 * Wire collapsible toggle buttons for expand/collapse behavior.
 */
function wireCollapsibles() {
  const toggles = document.querySelectorAll('.collapsible-toggle');
  for (const toggle of toggles) {
    toggle.addEventListener('click', () => {
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      const contentId = toggle.getAttribute('aria-controls');
      const content = document.getElementById(contentId);
      const icon = toggle.querySelector('.collapsible-icon');

      toggle.setAttribute('aria-expanded', String(!expanded));
      if (content) content.hidden = expanded;
      if (icon) icon.textContent = expanded ? '\u25B6' : '\u25BC';
    });
  }
}

// ─── Initialization ──────────────────────────────────────────────────────────

/**
 * Initialize the application on DOM ready.
 */
function init() {
  // Browser compatibility check
  if (!checkBrowserSupport()) {
    document.body.innerHTML = `
      <div class="unsupported-browser" role="alert">
        <h1>Unsupported Browser</h1>
        <p>Your browser does not support the required APIs for this application.</p>
        <p>Please use a recent version of Chrome, Firefox, Safari, or Edge.</p>
      </div>
    `;
    return;
  }

  // Wire up UI interactions
  wireDropZone();
  wireFileInput();
  wireClearButton();
  wireFilterControls();
  wireExportButtons();
  wireSSCCTableSelection();
  wireCollapsibles();

  // Expose event bus and SSCC selection handler for use by other modules
  window.__epcisEventBus = EventBus;
  window.__epcisHandleSSCCSelection = handleSSCCSelection;

  EventBus.emit('appReady');
}

// Start on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Export for testing
export { EventBus, processFile, analyzeFile, resetState, handleFilterChange, handleClearFilters, countBy };
