/**
 * EPCIS File Analyzer - UI Renderer Module
 * 
 * Renders dashboard metrics, data tables, pagination, sorting,
 * filtering UI, and event inspector panels.
 */

const PAGE_SIZE = 50;
const DEBOUNCE_MS = 500;

// Internal state for pagination and sorting
const _state = {
  currentPages: {},
  sortDirections: {},
  debounceTimers: {},
  tableData: {},
  onFilterChange: null,
  analysisData: null
};

// ─── DASHBOARD ─────────────────────────────────────────────────────────────────

/**
 * Renders the summary dashboard with all DashboardMetrics.
 * @param {object} data - AnalysisResults containing metrics, aggregation, etc.
 */
export function renderDashboard(data) {
  _state.analysisData = data;
  const metrics = data.metrics;
  if (!metrics) return;

  // Show dashboard section
  const section = document.getElementById('dashboard-section');
  if (section) section.hidden = false;

  // Render primary metric cards
  const cardsContainer = document.getElementById('dashboard-cards');
  if (cardsContainer) {
    cardsContainer.innerHTML = _buildDashboardCards(metrics);
  }

  // Render SBDH sender/receiver info
  _renderSBDH(metrics);

  // Render detailed metrics in the collapsible section
  _renderDetailedMetrics(metrics);

  // Initialize collapsible toggles
  _initCollapsibles();
}

function _buildDashboardCards(metrics) {
  const cards = [
    { label: 'Unique Serials', value: metrics.totalUniqueSerials },
    { label: 'Total Cases', value: metrics.totalCases },
    { label: 'Total Products', value: metrics.totalProducts },
    { label: 'Total SSCCs', value: metrics.totalSSCCs }
  ];

  let html = cards.map(c =>
    `<div class="dashboard-card">
      <span class="card-value">${c.value}</span>
      <span class="card-label">${c.label}</span>
    </div>`
  ).join('');

  // Event counts by type
  if (metrics.eventCountByType) {
    const types = Object.entries(metrics.eventCountByType);
    if (types.length > 0) {
      html += `<div class="dashboard-card card-wide">
        <span class="card-label">Events by Type</span>
        <div class="card-list">${types.map(([t, c]) =>
          `<span class="card-list-item">${_escapeHtml(t)}: ${c}</span>`
        ).join('')}</div>
      </div>`;
    }
  }

  // Event counts by action
  if (metrics.eventCountByAction) {
    const actions = Object.entries(metrics.eventCountByAction);
    if (actions.length > 0) {
      html += `<div class="dashboard-card card-wide">
        <span class="card-label">Events by Action</span>
        <div class="card-list">${actions.map(([a, c]) =>
          `<span class="card-list-item">${_escapeHtml(a)}: ${c}</span>`
        ).join('')}</div>
      </div>`;
    }
  }

  return html;
}

function _renderSBDH(metrics) {
  const sbdhInfo = document.getElementById('sbdh-info');
  if (!sbdhInfo) return;

  if (metrics.sender || metrics.receiver) {
    sbdhInfo.hidden = false;
    if (metrics.sender) {
      const senderName = document.getElementById('sender-name');
      const senderId = document.getElementById('sender-id');
      if (senderName) senderName.textContent = metrics.sender.name || '';
      if (senderId) senderId.textContent = metrics.sender.identifier || '';
    }
    if (metrics.receiver) {
      const receiverName = document.getElementById('receiver-name');
      const receiverId = document.getElementById('receiver-id');
      if (receiverName) receiverName.textContent = metrics.receiver.name || '';
      if (receiverId) receiverId.textContent = metrics.receiver.identifier || '';
    }
  } else {
    sbdhInfo.hidden = true;
  }
}

function _renderDetailedMetrics(metrics) {
  const grid = document.getElementById('dashboard-details-grid');
  if (!grid) return;

  let html = '';

  // GTINs
  if (metrics.allGTINs && metrics.allGTINs.length > 0) {
    html += _detailCard('GTINs', metrics.allGTINs);
  }
  // NDCs
  if (metrics.allNDCs && metrics.allNDCs.length > 0) {
    html += _detailCard('NDCs', metrics.allNDCs);
  }
  // Business Steps
  if (metrics.uniqueBizSteps && metrics.uniqueBizSteps.length > 0) {
    html += _detailCard('Business Steps', metrics.uniqueBizSteps);
  }
  // Dispositions
  if (metrics.uniqueDispositions && metrics.uniqueDispositions.length > 0) {
    html += _detailCard('Dispositions', metrics.uniqueDispositions);
  }
  // Read Points
  if (metrics.uniqueReadPoints && metrics.uniqueReadPoints.length > 0) {
    html += _detailCard('Read Points', metrics.uniqueReadPoints);
  }
  // Biz Locations
  if (metrics.uniqueBizLocations && metrics.uniqueBizLocations.length > 0) {
    html += _detailCard('Business Locations', metrics.uniqueBizLocations);
  }

  // Lots by product
  if (metrics.lotsByProduct) {
    const lots = Object.entries(metrics.lotsByProduct);
    if (lots.length > 0) {
      html += `<div class="detail-card">
        <h4>Lots by Product</h4>
        <ul>${lots.map(([gtin, lotList]) =>
          `<li><strong>${_escapeHtml(gtin)}</strong>: ${lotList.map(l => _escapeHtml(l)).join(', ')}</li>`
        ).join('')}</ul>
      </div>`;
    }
  }

  // Expirations by product
  if (metrics.expirationsByProduct) {
    const exps = Object.entries(metrics.expirationsByProduct);
    if (exps.length > 0) {
      html += `<div class="detail-card">
        <h4>Expirations by Product</h4>
        <ul>${exps.map(([gtin, expList]) =>
          `<li><strong>${_escapeHtml(gtin)}</strong>: ${expList.map(e => _escapeHtml(e)).join(', ')}</li>`
        ).join('')}</ul>
      </div>`;
    }
  }

  // Case Serials (collapsible)
  if (metrics.caseSerials && metrics.caseSerials.length > 0) {
    html += `<div class="detail-card collapsible">
      <button class="collapsible-toggle" type="button" aria-expanded="false" aria-controls="detail-case-serials">
        <span class="collapsible-title">Case Serials (${metrics.caseSerials.length})</span>
        <span class="collapsible-icon" aria-hidden="true">&#9654;</span>
      </button>
      <div id="detail-case-serials" class="collapsible-content" hidden>
        <ul>${metrics.caseSerials.map(s => `<li>${_escapeHtml(s)}</li>`).join('')}</ul>
      </div>
    </div>`;
  }

  // SSCC Identifiers (collapsible)
  if (metrics.ssccIdentifiers && metrics.ssccIdentifiers.length > 0) {
    html += `<div class="detail-card collapsible">
      <button class="collapsible-toggle" type="button" aria-expanded="false" aria-controls="detail-sscc-ids">
        <span class="collapsible-title">SSCC Identifiers (${metrics.ssccIdentifiers.length})</span>
        <span class="collapsible-icon" aria-hidden="true">&#9654;</span>
      </button>
      <div id="detail-sscc-ids" class="collapsible-content" hidden>
        <ul>${metrics.ssccIdentifiers.map(s => `<li>${_escapeHtml(s)}</li>`).join('')}</ul>
      </div>
    </div>`;
  }

  grid.innerHTML = html;
}

function _detailCard(title, items) {
  return `<div class="detail-card">
    <h4>${_escapeHtml(title)}</h4>
    <ul>${items.map(i => `<li>${_escapeHtml(i)}</li>`).join('')}</ul>
  </div>`;
}

// ─── EVENT INSPECTOR ───────────────────────────────────────────────────────────

/**
 * Renders event inspector with collapsible panels grouped by event type.
 * @param {Array} events - Array of EPCISEvent objects
 */
export function renderEventInspector(events) {
  const section = document.getElementById('event-inspector-section');
  if (section) section.hidden = false;

  const container = document.getElementById('event-groups');
  if (!container) return;

  if (!events || events.length === 0) {
    container.innerHTML = '<p class="empty-message">No events to display.</p>';
    return;
  }

  // Group events by type
  const groups = {};
  events.forEach(evt => {
    const type = evt.eventType || 'Unknown';
    if (!groups[type]) groups[type] = [];
    groups[type].push(evt);
  });

  let html = '';
  for (const [type, typeEvents] of Object.entries(groups)) {
    html += `<div class="event-group">
      <div class="collapsible">
        <button class="collapsible-toggle" type="button" aria-expanded="false" aria-controls="event-group-${_slugify(type)}">
          <span class="collapsible-title">${_escapeHtml(type)} (${typeEvents.length})</span>
          <span class="collapsible-icon" aria-hidden="true">&#9654;</span>
        </button>
        <div id="event-group-${_slugify(type)}" class="collapsible-content" hidden>
          ${typeEvents.map((evt, idx) => _renderEventPanel(evt, type, idx)).join('')}
        </div>
      </div>
    </div>`;
  }

  container.innerHTML = html;
  _initCollapsibles();
}

function _renderEventPanel(evt, type, idx) {
  const id = `event-panel-${_slugify(type)}-${idx}`;
  let fields = '';

  const addField = (label, value) => {
    if (value !== null && value !== undefined && value !== '') {
      fields += `<div class="event-field">
        <span class="event-field-label">${_escapeHtml(label)}:</span>
        <span class="event-field-value">${_escapeHtml(String(value))}</span>
      </div>`;
    }
  };

  addField('Event Time', evt.eventTime);
  addField('Time Zone', evt.eventTimeZoneOffset);
  addField('Action', evt.action);
  addField('Business Step', evt.bizStep);
  addField('Disposition', evt.disposition);
  addField('Read Point', evt.readPoint);
  addField('Business Location', evt.bizLocation);
  addField('Event ID', evt.eventID);
  addField('Parent ID', evt.parentID);

  if (evt.epcList && evt.epcList.length > 0) {
    fields += `<div class="event-field">
      <span class="event-field-label">EPCs:</span>
      <span class="event-field-value">${evt.epcList.map(e => _escapeHtml(e)).join(', ')}</span>
    </div>`;
  }

  if (evt.childEPCs && evt.childEPCs.length > 0) {
    fields += `<div class="event-field">
      <span class="event-field-label">Child EPCs:</span>
      <span class="event-field-value">${evt.childEPCs.map(e => _escapeHtml(e)).join(', ')}</span>
    </div>`;
  }

  if (evt.bizTransactionList && evt.bizTransactionList.length > 0) {
    fields += `<div class="event-field">
      <span class="event-field-label">Biz Transactions:</span>
      <span class="event-field-value">${evt.bizTransactionList.map(bt =>
        `${_escapeHtml(bt.type)}: ${_escapeHtml(bt.value)}`
      ).join('; ')}</span>
    </div>`;
  }

  if (evt.ilmd) {
    addField('Lot Number', evt.ilmd.lotNumber);
    addField('Expiration Date', evt.ilmd.expirationDate);
  }

  return `<div class="collapsible event-panel">
    <button class="collapsible-toggle" type="button" aria-expanded="false" aria-controls="${id}">
      <span class="collapsible-title">${_escapeHtml(evt.eventTime || 'Unknown time')} — ${_escapeHtml(evt.action || '')}</span>
      <span class="collapsible-icon" aria-hidden="true">&#9654;</span>
    </button>
    <div id="${id}" class="collapsible-content" hidden>
      <div class="event-fields">${fields}</div>
    </div>
  </div>`;
}

// ─── PRODUCT TABLE ─────────────────────────────────────────────────────────────

/**
 * Renders the product analysis table with sortable columns.
 * @param {Array} products - Array of ProductInfo objects
 */
export function renderProductTable(products) {
  const section = document.getElementById('product-section');
  if (section) section.hidden = false;

  _state.tableData['product-table'] = products || [];
  _state.currentPages['product-table'] = 1;

  _renderTablePage('product-table', 'product-table-body', products, _productRowRenderer);
  _setupPagination('product-table', 'product-pagination', products);
  _setupSortableHeaders('product-table');
  _initCollapsibles();
}

function _productRowRenderer(product) {
  return `<tr>
    <td>${_escapeHtml(product.sgtinPattern || '')}</td>
    <td>${_escapeHtml(product.gtin || '')}</td>
    <td>${_escapeHtml(product.ndc || '')}</td>
    <td>${_escapeHtml(product.productName || '')}</td>
    <td>${product.serialCount || 0}</td>
    <td>${(product.lotNumbers || []).map(l => _escapeHtml(l)).join(', ')}</td>
    <td>${(product.expirationDates || []).map(e => _escapeHtml(e)).join(', ')}</td>
    <td>${product.caseCount || 0}</td>
    <td>${product.ssccCount || 0}</td>
  </tr>`;
}

// ─── CASE TABLE ────────────────────────────────────────────────────────────────

/**
 * Renders the case/aggregation table with parent/child relationships.
 * @param {object} aggregationResult - AggregationResult { cases, emptyCases, orphanedSerials }
 */
export function renderCaseTable(aggregationResult) {
  const section = document.getElementById('case-section');
  if (section) section.hidden = false;

  const cases = aggregationResult.cases || [];
  const orphanedSerials = aggregationResult.orphanedSerials || [];

  _state.tableData['case-table'] = cases;
  _state.currentPages['case-table'] = 1;

  _renderTablePage('case-table', 'case-table-body', cases, _caseRowRenderer);
  _setupPagination('case-table', 'case-pagination', cases);
  _setupSortableHeaders('case-table');

  // Render orphaned serials
  const orphanedList = document.getElementById('orphaned-serials-list');
  if (orphanedList) {
    if (orphanedSerials.length > 0) {
      orphanedList.innerHTML = orphanedSerials.map(s =>
        `<li>${_escapeHtml(s)}</li>`
      ).join('');
    } else {
      orphanedList.innerHTML = '<li>No orphaned serials detected.</li>';
    }
  }

  _initCollapsibles();
}

function _caseRowRenderer(caseInfo) {
  return `<tr>
    <td>${_escapeHtml(caseInfo.parentEPC || '')}</td>
    <td>${caseInfo.childCount || 0}</td>
    <td>${_escapeHtml(caseInfo.associatedGTIN || '')}</td>
    <td>${_escapeHtml(caseInfo.aggregationStatus || '')}</td>
    <td>${_escapeHtml(caseInfo.childrenCommissioned || '')}</td>
    <td>${_escapeHtml(caseInfo.eventTime || '')}</td>
  </tr>`;
}

// ─── SSCC TABLE ────────────────────────────────────────────────────────────────

/**
 * Renders the SSCC analysis table. Clicking an SSCC row shows related events.
 * @param {Array} ssccs - Array of SSCCInfo objects
 */
export function renderSSCCTable(ssccs) {
  const section = document.getElementById('sscc-section');
  if (section) section.hidden = false;

  _state.tableData['sscc-table'] = ssccs || [];
  _state.currentPages['sscc-table'] = 1;

  _renderTablePage('sscc-table', 'sscc-table-body', ssccs, _ssccRowRenderer);
  _setupPagination('sscc-table', 'sscc-pagination', ssccs);
  _setupSortableHeaders('sscc-table');

  // Wire SSCC row click to show detail panel
  const tbody = document.getElementById('sscc-table-body');
  if (tbody) {
    tbody.addEventListener('click', (e) => {
      const row = e.target.closest('tr');
      if (!row) return;
      const ssccUri = row.dataset.sscc;
      if (!ssccUri) return;
      const ssccInfo = (ssccs || []).find(s => s.sscc === ssccUri);
      if (ssccInfo) _showSSCCDetail(ssccInfo);
    });
  }

  _initCollapsibles();
}

function _ssccRowRenderer(sscc) {
  return `<tr data-sscc="${_escapeAttr(sscc.sscc || '')}" class="clickable-row">
    <td>${_escapeHtml(sscc.sscc || '')}</td>
    <td>${sscc.eventCount || 0}</td>
    <td>${(sscc.roles || []).map(r => _escapeHtml(r)).join(', ')}</td>
    <td>${(sscc.associatedProducts || []).map(p => _escapeHtml(p)).join(', ')}</td>
  </tr>`;
}

function _showSSCCDetail(ssccInfo) {
  const panel = document.getElementById('sscc-detail-panel');
  const content = document.getElementById('sscc-detail-content');
  const title = document.getElementById('sscc-detail-title');
  if (!panel || !content) return;

  panel.hidden = false;
  if (title) title.textContent = `Events for ${ssccInfo.sscc}`;

  let html = '';
  if (ssccInfo.events && ssccInfo.events.length > 0) {
    html = `<table class="data-table">
      <thead><tr>
        <th>Event Type</th><th>Event Time</th><th>Biz Step</th>
        <th>Disposition</th><th>Action</th><th>Role</th>
      </tr></thead><tbody>`;
    ssccInfo.events.forEach(evt => {
      html += `<tr>
        <td>${_escapeHtml(evt.eventType || '')}</td>
        <td>${_escapeHtml(evt.eventTime || '')}</td>
        <td>${_escapeHtml(evt.bizStep || '')}</td>
        <td>${_escapeHtml(evt.disposition || '')}</td>
        <td>${_escapeHtml(evt.action || '')}</td>
        <td>${_escapeHtml(evt.role || '')}</td>
      </tr>`;
    });
    html += '</tbody></table>';
  } else {
    html = '<p>No event details available.</p>';
  }
  content.innerHTML = html;
}

// ─── ISSUES TABLE ──────────────────────────────────────────────────────────────

/**
 * Renders the issues table with severity color-coding.
 * @param {Array} issues - Array of Issue objects
 */
export function renderIssuesTable(issues) {
  const section = document.getElementById('issues-section');
  if (section) section.hidden = false;

  _state.tableData['issues-table'] = issues || [];
  _state.currentPages['issues-table'] = 1;

  _renderTablePage('issues-table', 'issues-table-body', issues, _issueRowRenderer);
  _setupPagination('issues-table', 'issues-pagination', issues);
  _setupSortableHeaders('issues-table');
  _initCollapsibles();
}

function _issueRowRenderer(issue) {
  const severity = (issue.severity || 'Info').toLowerCase();
  return `<tr>
    <td><span class="severity-badge ${severity}">${_escapeHtml(issue.severity || 'Info')}</span></td>
    <td>${_escapeHtml(issue.title || '')}</td>
    <td>${_escapeHtml(issue.category || '')}</td>
    <td>${_escapeHtml(issue.affectedItem || '')}</td>
    <td>${_escapeHtml(issue.eventTime || '')}</td>
    <td>${_escapeHtml(issue.suggestedCorrection || '')}</td>
  </tr>`;
}

// ─── FILTERS ───────────────────────────────────────────────────────────────────

/**
 * Populates filter dropdowns from available values in the analysis data.
 * Wires filter change events to filterEngine.applyFilters() and re-renders.
 * @param {object} data - AnalysisResults
 */
export function renderFilters(data) {
  const section = document.getElementById('filter-section');
  if (section) section.hidden = false;

  _state.analysisData = data;
  const metrics = data.metrics;
  if (!metrics) return;

  // Populate product filter
  _populateSelect('filter-product', (metrics.allGTINs || []).map(g => ({ value: g, label: g })));

  // Populate lot filter
  const allLots = _flattenValues(metrics.lotsByProduct);
  _populateSelect('filter-lot', allLots.map(l => ({ value: l, label: l })));

  // Populate expiration filter
  const allExps = _flattenValues(metrics.expirationsByProduct);
  _populateSelect('filter-expiration', allExps.map(e => ({ value: e, label: e })));

  // Populate event type filter
  const eventTypes = Object.keys(metrics.eventCountByType || {});
  _populateSelect('filter-event-type', eventTypes.map(t => ({ value: t, label: t })));

  // Populate biz step filter
  _populateSelect('filter-biz-step', (metrics.uniqueBizSteps || []).map(b => ({ value: b, label: b })));

  // Populate disposition filter
  _populateSelect('filter-disposition', (metrics.uniqueDispositions || []).map(d => ({ value: d, label: d })));

  // Populate issue type filter
  const issueTypes = [...new Set((data.issues || []).map(i => i.category).filter(Boolean))];
  _populateSelect('filter-issue-type', issueTypes.map(t => ({ value: t, label: t })));

  // Wire filter change events
  _wireFilterListeners(data);

  _initCollapsibles();
}

function _populateSelect(selectId, options) {
  const select = document.getElementById(selectId);
  if (!select) return;

  // Keep the first "All..." option
  const firstOption = select.options[0];
  select.innerHTML = '';
  select.appendChild(firstOption);

  options.forEach(opt => {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.label;
    select.appendChild(option);
  });
}

function _flattenValues(obj) {
  if (!obj) return [];
  const set = new Set();
  Object.values(obj).forEach(arr => {
    if (Array.isArray(arr)) arr.forEach(v => set.add(v));
  });
  return [...set];
}

function _wireFilterListeners(data) {
  const filterIds = [
    'filter-product', 'filter-lot', 'filter-expiration',
    'filter-event-type', 'filter-biz-step', 'filter-disposition',
    'filter-severity', 'filter-issue-type'
  ];

  filterIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', () => _triggerFilter(data));
    }
  });

  // Text-based filters with debounce
  const textFilterIds = ['filter-serial', 'filter-case-serial', 'filter-sscc'];
  textFilterIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', () => {
        _debounce(`filter-${id}`, () => _triggerFilter(data), DEBOUNCE_MS);
      });
    }
  });

  // Clear all filters button
  const clearBtn = document.getElementById('clear-filters-btn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      filterIds.forEach(fid => {
        const el = document.getElementById(fid);
        if (el) el.value = '';
      });
      textFilterIds.forEach(fid => {
        const el = document.getElementById(fid);
        if (el) el.value = '';
      });
      _triggerFilter(data);
    });
  }
}

function _triggerFilter(data) {
  const criteria = _gatherFilterCriteria();

  // Try to use filterEngine if available
  if (_state.onFilterChange) {
    _state.onFilterChange(criteria);
    return;
  }

  // Dynamically import filterEngine if available
  import('./filterEngine.js').then(filterEngine => {
    if (filterEngine && filterEngine.applyFilters) {
      const filtered = filterEngine.applyFilters(data, criteria);
      _rerenderWithFiltered(filtered, data);
    }
  }).catch(() => {
    // filterEngine not yet available — skip filtering
  });
}

function _gatherFilterCriteria() {
  const val = (id) => {
    const el = document.getElementById(id);
    return el && el.value ? el.value : null;
  };

  return {
    product: val('filter-product'),
    lotNumber: val('filter-lot'),
    expirationDate: val('filter-expiration'),
    eventType: val('filter-event-type'),
    bizStep: val('filter-biz-step'),
    disposition: val('filter-disposition'),
    serialNumber: val('filter-serial'),
    caseSerial: val('filter-case-serial'),
    sscc: val('filter-sscc'),
    issueSeverity: val('filter-severity'),
    issueType: val('filter-issue-type')
  };
}

function _rerenderWithFiltered(filtered, originalData) {
  if (filtered.events) {
    renderEventInspector(filtered.events);
  }
  if (filtered.products) {
    _state.tableData['product-table'] = filtered.products;
    _state.currentPages['product-table'] = 1;
    _renderTablePage('product-table', 'product-table-body', filtered.products, _productRowRenderer);
    _setupPagination('product-table', 'product-pagination', filtered.products);
  }
  if (filtered.cases) {
    const aggResult = { cases: filtered.cases, orphanedSerials: originalData.aggregation ? originalData.aggregation.orphanedSerials : [] };
    _state.tableData['case-table'] = filtered.cases;
    _state.currentPages['case-table'] = 1;
    _renderTablePage('case-table', 'case-table-body', filtered.cases, _caseRowRenderer);
    _setupPagination('case-table', 'case-pagination', filtered.cases);
  }
  if (filtered.ssccs) {
    _state.tableData['sscc-table'] = filtered.ssccs;
    _state.currentPages['sscc-table'] = 1;
    _renderTablePage('sscc-table', 'sscc-table-body', filtered.ssccs, _ssccRowRenderer);
    _setupPagination('sscc-table', 'sscc-pagination', filtered.ssccs);
  }
  if (filtered.issues) {
    _state.tableData['issues-table'] = filtered.issues;
    _state.currentPages['issues-table'] = 1;
    _renderTablePage('issues-table', 'issues-table-body', filtered.issues, _issueRowRenderer);
    _setupPagination('issues-table', 'issues-pagination', filtered.issues);
  }

  // Update filter status
  const statusEl = document.getElementById('filter-status');
  const statusText = document.getElementById('filter-status-text');
  if (statusEl && statusText) {
    const hasFilter = Object.values(_gatherFilterCriteria()).some(v => v !== null);
    statusEl.hidden = !hasFilter;
    if (hasFilter) {
      statusText.textContent = `Showing filtered results`;
    }
  }
}

/**
 * Allows external code (main.js) to set a filter change callback.
 * @param {function} callback - function(criteria) that applies filters
 */
export function setFilterChangeHandler(callback) {
  _state.onFilterChange = callback;
}

// ─── PAGINATION ────────────────────────────────────────────────────────────────

/**
 * Renders pagination controls for a table container.
 * Only shows pagination when total rows > PAGE_SIZE (50).
 * @param {HTMLElement|string} container - Element or ID of pagination container
 * @param {number} totalRows - Total number of rows
 * @param {number} pageSize - Page size (default 50)
 * @param {number} currentPage - Current page (1-indexed)
 * @param {function} [onPageChange] - Optional callback(newPage)
 */
export function renderPagination(container, totalRows, pageSize = PAGE_SIZE, currentPage = 1, onPageChange) {
  const el = typeof container === 'string' ? document.getElementById(container) : container;
  if (!el) return;

  if (totalRows <= pageSize) {
    el.innerHTML = '';
    return;
  }

  const totalPages = Math.ceil(totalRows / pageSize);
  const clampedPage = Math.max(1, Math.min(currentPage, totalPages));

  let html = '<nav class="pagination" aria-label="Table pagination">';
  html += `<button class="pagination-btn pagination-prev" ${clampedPage <= 1 ? 'disabled' : ''} data-page="${clampedPage - 1}">Previous</button>`;

  // Page numbers
  const pages = _getPageNumbers(clampedPage, totalPages);
  pages.forEach(p => {
    if (p === '...') {
      html += '<span class="pagination-ellipsis">…</span>';
    } else {
      html += `<button class="pagination-btn pagination-num ${p === clampedPage ? 'active' : ''}" data-page="${p}">${p}</button>`;
    }
  });

  html += `<button class="pagination-btn pagination-next" ${clampedPage >= totalPages ? 'disabled' : ''} data-page="${clampedPage + 1}">Next</button>`;
  html += '</nav>';

  el.innerHTML = html;

  // Wire click events
  el.querySelectorAll('.pagination-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const page = parseInt(btn.dataset.page, 10);
      if (!isNaN(page) && page >= 1 && page <= totalPages) {
        if (onPageChange) {
          onPageChange(page);
        }
      }
    });
  });
}

function _getPageNumbers(current, total) {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages = [];
  pages.push(1);
  if (current > 3) pages.push('...');
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) {
    pages.push(i);
  }
  if (current < total - 2) pages.push('...');
  pages.push(total);
  return pages;
}

// ─── SORTING ───────────────────────────────────────────────────────────────────

/**
 * Sorts a table's body rows by the specified column.
 * @param {string} tableId - ID of the table element
 * @param {string} column - Column data attribute name
 * @param {string} direction - 'asc' or 'desc'
 */
export function sortTable(tableId, column, direction = 'asc') {
  const data = _state.tableData[tableId];
  if (!data || data.length === 0) return;

  const sorted = [...data].sort((a, b) => {
    let valA = a[column];
    let valB = b[column];

    // Handle arrays - sort by joined string
    if (Array.isArray(valA)) valA = valA.join(', ');
    if (Array.isArray(valB)) valB = valB.join(', ');

    // Handle numbers
    if (typeof valA === 'number' && typeof valB === 'number') {
      return direction === 'asc' ? valA - valB : valB - valA;
    }

    // Handle strings
    const strA = String(valA || '').toLowerCase();
    const strB = String(valB || '').toLowerCase();
    if (direction === 'asc') {
      return strA.localeCompare(strB);
    }
    return strB.localeCompare(strA);
  });

  _state.tableData[tableId] = sorted;
  _state.currentPages[tableId] = 1;

  // Re-render the table with sorted data
  const rowRenderer = _getRowRenderer(tableId);
  const tbodyId = _getTbodyId(tableId);
  const paginationId = _getPaginationId(tableId);
  if (rowRenderer && tbodyId) {
    _renderTablePage(tableId, tbodyId, sorted, rowRenderer);
    _setupPagination(tableId, paginationId, sorted);
  }

  // Update sort indicator classes on headers
  _updateSortIndicators(tableId, column, direction);
}

function _setupSortableHeaders(tableId) {
  const table = document.getElementById(tableId);
  if (!table) return;

  const headers = table.querySelectorAll('.sortable-header');
  headers.forEach(header => {
    header.style.cursor = 'pointer';
    header.addEventListener('click', () => {
      const column = header.dataset.column;
      if (!column) return;

      // Determine direction: default asc, toggle on repeated click
      const key = `${tableId}-${column}`;
      let direction = 'asc';
      if (_state.sortDirections[key] === 'asc') {
        direction = 'desc';
      }
      _state.sortDirections[key] = direction;

      sortTable(tableId, column, direction);
    });
  });
}

function _updateSortIndicators(tableId, column, direction) {
  const table = document.getElementById(tableId);
  if (!table) return;

  const headers = table.querySelectorAll('.sortable-header');
  headers.forEach(header => {
    header.classList.remove('sort-asc', 'sort-desc');
    if (header.dataset.column === column) {
      header.classList.add(direction === 'asc' ? 'sort-asc' : 'sort-desc');
    }
  });
}

// ─── TABLE RENDERING HELPERS ───────────────────────────────────────────────────

function _renderTablePage(tableId, tbodyId, data, rowRenderer) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;

  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="99" class="empty-cell">No data available.</td></tr>';
    return;
  }

  const page = _state.currentPages[tableId] || 1;
  const start = (page - 1) * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, data.length);
  const pageData = data.slice(start, end);

  tbody.innerHTML = pageData.map(rowRenderer).join('');
}

function _setupPagination(tableId, paginationId, data) {
  if (!data || data.length <= PAGE_SIZE) {
    const container = document.getElementById(paginationId);
    if (container) container.innerHTML = '';
    return;
  }

  const onPageChange = (newPage) => {
    _state.currentPages[tableId] = newPage;
    const rowRenderer = _getRowRenderer(tableId);
    const tbodyId = _getTbodyId(tableId);
    _renderTablePage(tableId, tbodyId, _state.tableData[tableId], rowRenderer);
    renderPagination(paginationId, data.length, PAGE_SIZE, newPage, onPageChange);
  };

  renderPagination(paginationId, data.length, PAGE_SIZE, _state.currentPages[tableId] || 1, onPageChange);
}

function _getRowRenderer(tableId) {
  switch (tableId) {
    case 'product-table': return _productRowRenderer;
    case 'case-table': return _caseRowRenderer;
    case 'sscc-table': return _ssccRowRenderer;
    case 'issues-table': return _issueRowRenderer;
    default: return () => '';
  }
}

function _getTbodyId(tableId) {
  switch (tableId) {
    case 'product-table': return 'product-table-body';
    case 'case-table': return 'case-table-body';
    case 'sscc-table': return 'sscc-table-body';
    case 'issues-table': return 'issues-table-body';
    default: return null;
  }
}

function _getPaginationId(tableId) {
  switch (tableId) {
    case 'product-table': return 'product-pagination';
    case 'case-table': return 'case-pagination';
    case 'sscc-table': return 'sscc-pagination';
    case 'issues-table': return 'issues-pagination';
    default: return null;
  }
}

// ─── IN-TABLE SEARCH ───────────────────────────────────────────────────────────

/**
 * Sets up in-table search fields with 500ms debounce.
 * Must be called after all tables are rendered.
 */
export function setupTableSearch() {
  const searchConfigs = [
    { inputId: 'product-search-input', tableId: 'product-table', renderer: _productRowRenderer },
    { inputId: 'case-search-input', tableId: 'case-table', renderer: _caseRowRenderer },
    { inputId: 'sscc-search-input', tableId: 'sscc-table', renderer: _ssccRowRenderer },
    { inputId: 'issues-search-input', tableId: 'issues-table', renderer: _issueRowRenderer },
    { inputId: 'event-search-input', tableId: null, isEventSearch: true }
  ];

  searchConfigs.forEach(config => {
    const input = document.getElementById(config.inputId);
    if (!input) return;

    input.addEventListener('input', () => {
      _debounce(config.inputId, () => {
        const query = input.value.trim().toLowerCase();
        if (config.isEventSearch) {
          _filterEventInspector(query);
        } else {
          _filterTable(config.tableId, query, config.renderer);
        }
      }, DEBOUNCE_MS);
    });
  });
}

function _filterTable(tableId, query, rowRenderer) {
  const allData = _state.tableData[tableId];
  if (!allData) return;

  if (!query) {
    // Reset to full data
    _state.currentPages[tableId] = 1;
    _renderTablePage(tableId, _getTbodyId(tableId), allData, rowRenderer);
    _setupPagination(tableId, _getPaginationId(tableId), allData);
    return;
  }

  // Filter data by searching all string fields
  const filtered = allData.filter(item => {
    return Object.values(item).some(val => {
      if (val === null || val === undefined) return false;
      if (Array.isArray(val)) {
        return val.some(v => String(v).toLowerCase().includes(query));
      }
      return String(val).toLowerCase().includes(query);
    });
  });

  _state.currentPages[tableId] = 1;
  _renderTablePage(tableId, _getTbodyId(tableId), filtered, rowRenderer);
  _setupPagination(tableId, _getPaginationId(tableId), filtered);
}

function _filterEventInspector(query) {
  const container = document.getElementById('event-groups');
  if (!container) return;

  const panels = container.querySelectorAll('.event-panel');
  panels.forEach(panel => {
    if (!query) {
      panel.style.display = '';
      return;
    }
    const text = panel.textContent.toLowerCase();
    panel.style.display = text.includes(query) ? '' : 'none';
  });
}

// ─── COLLAPSIBLE SECTIONS ──────────────────────────────────────────────────────

function _initCollapsibles() {
  document.querySelectorAll('.collapsible-toggle').forEach(toggle => {
    // Avoid double-binding
    if (toggle.dataset.bound) return;
    toggle.dataset.bound = 'true';

    toggle.addEventListener('click', () => {
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      const contentId = toggle.getAttribute('aria-controls');
      const content = contentId ? document.getElementById(contentId) : toggle.nextElementSibling;

      if (expanded) {
        toggle.setAttribute('aria-expanded', 'false');
        if (content) content.hidden = true;
      } else {
        toggle.setAttribute('aria-expanded', 'true');
        if (content) content.hidden = false;
      }

      // Rotate the icon
      const icon = toggle.querySelector('.collapsible-icon');
      if (icon) {
        icon.style.transform = expanded ? '' : 'rotate(90deg)';
      }
    });
  });
}

// ─── UTILITY HELPERS ───────────────────────────────────────────────────────────

function _escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function _escapeAttr(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function _slugify(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function _debounce(key, fn, delay) {
  if (_state.debounceTimers[key]) {
    clearTimeout(_state.debounceTimers[key]);
  }
  _state.debounceTimers[key] = setTimeout(fn, delay);
}

// ─── SECTION VISIBILITY ────────────────────────────────────────────────────────

/**
 * Shows the export section.
 */
export function showExportSection() {
  const section = document.getElementById('export-section');
  if (section) section.hidden = false;
  _initCollapsibles();
}

/**
 * Hides all analysis sections (for reset/new file).
 */
export function hideAllSections() {
  const sectionIds = [
    'dashboard-section', 'filter-section', 'event-inspector-section',
    'product-section', 'case-section', 'sscc-section',
    'issues-section', 'export-section'
  ];
  sectionIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.hidden = true;
  });
}
