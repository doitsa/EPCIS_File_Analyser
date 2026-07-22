/**
 * exportEngine.js - Excel & JSON Export Generation
 *
 * Generates downloadable reports from EPCIS analysis results.
 * Supports 5 report types: full-analysis, issues-only, product-summary,
 * case-aggregation, and json-full.
 *
 * Uses SheetJS (xlsx) for Excel generation (globally available as `XLSX`).
 * Falls back to JSON-only when SheetJS is unavailable.
 *
 * @module exportEngine
 */

/**
 * @typedef {'full-analysis'|'issues-only'|'product-summary'|'case-aggregation'|'json-full'} ReportType
 */

/**
 * Check if SheetJS (XLSX) is available globally.
 * @returns {boolean}
 */
function isSheetJSAvailable() {
  return typeof XLSX !== 'undefined' && XLSX !== null && typeof XLSX.utils !== 'undefined';
}

/**
 * Strip the file extension from a filename.
 * @param {string} filename - Original filename (e.g., "sample.xml")
 * @returns {string} Filename without extension (e.g., "sample")
 */
function stripExtension(filename) {
  if (!filename) return 'export';
  const lastDot = filename.lastIndexOf('.');
  if (lastDot <= 0) return filename;
  return filename.substring(0, lastDot);
}

/**
 * Trigger a browser file download for a Blob.
 * @param {Blob} blob - The file content as a Blob
 * @param {string} filename - The download filename
 */
function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  // Cleanup
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 100);
}

/**
 * Build dashboard worksheet data from metrics.
 * @param {object} metrics - DashboardMetrics object
 * @returns {object[]} Array of row objects for the worksheet
 */
function buildDashboardRows(metrics) {
  const rows = [];

  rows.push({ Metric: 'Total Unique Serials', Value: metrics.totalUniqueSerials });
  rows.push({ Metric: 'Total Cases', Value: metrics.totalCases });
  rows.push({ Metric: 'Total Products', Value: metrics.totalProducts });
  rows.push({ Metric: 'Total SSCCs', Value: metrics.totalSSCCs });

  // Event counts by type
  if (metrics.eventCountByType) {
    for (const [type, count] of Object.entries(metrics.eventCountByType)) {
      rows.push({ Metric: `Events - ${type}`, Value: count });
    }
  }

  // Event counts by action
  if (metrics.eventCountByAction) {
    for (const [action, count] of Object.entries(metrics.eventCountByAction)) {
      rows.push({ Metric: `Action - ${action}`, Value: count });
    }
  }

  // Business steps
  if (metrics.uniqueBizSteps && metrics.uniqueBizSteps.length > 0) {
    rows.push({ Metric: 'Business Steps', Value: metrics.uniqueBizSteps.join(', ') });
  }

  // Dispositions
  if (metrics.uniqueDispositions && metrics.uniqueDispositions.length > 0) {
    rows.push({ Metric: 'Dispositions', Value: metrics.uniqueDispositions.join(', ') });
  }

  // Read points
  if (metrics.uniqueReadPoints && metrics.uniqueReadPoints.length > 0) {
    rows.push({ Metric: 'Read Points', Value: metrics.uniqueReadPoints.join(', ') });
  }

  // Business locations
  if (metrics.uniqueBizLocations && metrics.uniqueBizLocations.length > 0) {
    rows.push({ Metric: 'Business Locations', Value: metrics.uniqueBizLocations.join(', ') });
  }

  // GTINs
  if (metrics.allGTINs && metrics.allGTINs.length > 0) {
    rows.push({ Metric: 'GTINs', Value: metrics.allGTINs.join(', ') });
  }

  // NDCs
  if (metrics.allNDCs && metrics.allNDCs.length > 0) {
    rows.push({ Metric: 'NDCs', Value: metrics.allNDCs.join(', ') });
  }

  // Sender/Receiver
  if (metrics.sender) {
    rows.push({ Metric: 'Sender', Value: `${metrics.sender.name} (${metrics.sender.identifier})` });
  }
  if (metrics.receiver) {
    rows.push({ Metric: 'Receiver', Value: `${metrics.receiver.name} (${metrics.receiver.identifier})` });
  }

  return rows;
}

/**
 * Build events worksheet data from document events.
 * @param {object[]} events - Array of parsed EPCIS events
 * @returns {object[]} Array of row objects for the worksheet
 */
function buildEventRows(events) {
  if (!events || events.length === 0) return [];

  return events.map((event) => ({
    'Event Type': event.eventType || '',
    'Event Time': event.eventTime || '',
    'Time Zone Offset': event.eventTimeZoneOffset || '',
    'Action': event.action || '',
    'Business Step': event.bizStep || '',
    'Disposition': event.disposition || '',
    'Read Point': event.readPoint || '',
    'Business Location': event.bizLocation || '',
    'Parent ID': event.parentID || '',
    'EPC List': (event.epcList || []).join('; '),
    'Child EPCs': (event.childEPCs || []).join('; '),
  }));
}

/**
 * Build products worksheet data.
 * @param {object[]} products - Array of ProductInfo objects
 * @returns {object[]} Array of row objects for the worksheet
 */
function buildProductRows(products) {
  if (!products || products.length === 0) return [];

  return products.map((p) => ({
    'SGTIN Pattern': p.sgtinPattern || '',
    'GTIN': p.gtin || '',
    'NDC': p.ndc || '',
    'Product Name': p.productName || '',
    'Serial Count': p.serialCount || 0,
    'Lot Numbers': (p.lotNumbers || []).join(', '),
    'Expiration Dates': (p.expirationDates || []).join(', '),
    'Case Count': p.caseCount || 0,
    'SSCC Count': p.ssccCount || 0,
  }));
}

/**
 * Build cases worksheet data.
 * @param {object} aggregation - AggregationResult object
 * @returns {object[]} Array of row objects for the worksheet
 */
function buildCaseRows(aggregation) {
  if (!aggregation || !aggregation.cases || aggregation.cases.length === 0) return [];

  return aggregation.cases.map((c) => ({
    'Parent EPC': c.parentEPC || '',
    'Child EPCs': (c.childEPCs || []).join('; '),
    'Child Count': c.childCount || 0,
    'Associated GTIN': c.associatedGTIN || '',
    'Aggregation Status': c.aggregationStatus || '',
    'Children Commissioned': c.childrenCommissioned || '',
    'Event Time': c.eventTime || '',
  }));
}

/**
 * Build SSCCs worksheet data.
 * @param {object[]} ssccs - Array of SSCCInfo objects
 * @returns {object[]} Array of row objects for the worksheet
 */
function buildSSCCRows(ssccs) {
  if (!ssccs || ssccs.length === 0) return [];

  return ssccs.map((s) => ({
    'SSCC': s.sscc || '',
    'Event Count': s.eventCount || 0,
    'Roles': (s.roles || []).join(', '),
    'Child EPCs': (s.childEPCs || []).join('; '),
    'Associated Products': (s.associatedProducts || []).join(', '),
  }));
}

/**
 * Build issues worksheet data.
 * @param {object[]} issues - Array of Issue objects
 * @returns {object[]} Array of row objects for the worksheet
 */
function buildIssueRows(issues) {
  if (!issues || issues.length === 0) return [];

  return issues.map((issue) => ({
    'Severity': issue.severity || '',
    'Title': issue.title || '',
    'Description': issue.description || '',
    'Affected Item': issue.affectedItem || 'N/A',
    'Event Time': issue.eventTime || '',
    'XML Path': issue.xmlPath || '',
    'Suggested Correction': issue.suggestedCorrection || '',
    'Category': issue.category || '',
  }));
}

/**
 * Generate a full-analysis Excel workbook with multiple worksheets.
 * @param {object} data - AnalysisResults
 */
function exportFullAnalysisExcel(data) {
  const wb = XLSX.utils.book_new();

  // Dashboard worksheet
  const dashboardRows = buildDashboardRows(data.metrics || {});
  const dashboardWs = XLSX.utils.json_to_sheet(dashboardRows.length > 0 ? dashboardRows : [{ Metric: 'No data', Value: '' }]);
  XLSX.utils.book_append_sheet(wb, dashboardWs, 'Dashboard');

  // Events worksheet
  const eventRows = buildEventRows(data.document ? data.document.events : []);
  const eventsWs = XLSX.utils.json_to_sheet(eventRows.length > 0 ? eventRows : [{ 'Event Type': 'No events' }]);
  XLSX.utils.book_append_sheet(wb, eventsWs, 'Events');

  // Products worksheet
  const productRows = buildProductRows(data.products);
  const productsWs = XLSX.utils.json_to_sheet(productRows.length > 0 ? productRows : [{ 'SGTIN Pattern': 'No products' }]);
  XLSX.utils.book_append_sheet(wb, productsWs, 'Products');

  // Cases worksheet
  const caseRows = buildCaseRows(data.aggregation);
  const casesWs = XLSX.utils.json_to_sheet(caseRows.length > 0 ? caseRows : [{ 'Parent EPC': 'No cases' }]);
  XLSX.utils.book_append_sheet(wb, casesWs, 'Cases');

  // SSCCs worksheet
  const ssccRows = buildSSCCRows(data.ssccs);
  const ssccsWs = XLSX.utils.json_to_sheet(ssccRows.length > 0 ? ssccRows : [{ 'SSCC': 'No SSCCs' }]);
  XLSX.utils.book_append_sheet(wb, ssccsWs, 'SSCCs');

  // Issues worksheet
  const issueRows = buildIssueRows(data.issues);
  const issuesWs = XLSX.utils.json_to_sheet(issueRows.length > 0 ? issueRows : [{ 'Severity': 'No issues' }]);
  XLSX.utils.book_append_sheet(wb, issuesWs, 'Issues');

  return wb;
}

/**
 * Generate an issues-only Excel workbook with a single worksheet.
 * @param {object} data - AnalysisResults
 */
function exportIssuesOnlyExcel(data) {
  const wb = XLSX.utils.book_new();

  const issueRows = buildIssueRows(data.issues);
  const ws = XLSX.utils.json_to_sheet(issueRows.length > 0 ? issueRows : [{ 'Severity': 'No issues found' }]);
  XLSX.utils.book_append_sheet(wb, ws, 'Issues');

  return wb;
}

/**
 * Generate a product-summary Excel workbook with per-product metrics.
 * @param {object} data - AnalysisResults
 */
function exportProductSummaryExcel(data) {
  const wb = XLSX.utils.book_new();

  const productRows = buildProductRows(data.products);
  const ws = XLSX.utils.json_to_sheet(productRows.length > 0 ? productRows : [{ 'SGTIN Pattern': 'No products found' }]);
  XLSX.utils.book_append_sheet(wb, ws, 'Product Summary');

  return wb;
}

/**
 * Generate a case/aggregation Excel workbook with parent-child relationships.
 * @param {object} data - AnalysisResults
 */
function exportCaseAggregationExcel(data) {
  const wb = XLSX.utils.book_new();

  const caseRows = buildCaseRows(data.aggregation);
  const ws = XLSX.utils.json_to_sheet(caseRows.length > 0 ? caseRows : [{ 'Parent EPC': 'No cases found' }]);
  XLSX.utils.book_append_sheet(wb, ws, 'Case Aggregation');

  return wb;
}

/**
 * Export analysis results to Excel or JSON.
 * @param {ReportType} type - Type of report to export
 * @param {AnalysisResults} data - The complete analysis results
 * @param {string} originalFilename - The original uploaded XML filename
 * @throws {Error} If no data loaded or SheetJS unavailable for Excel exports
 */
export function exportReport(type, data, originalFilename) {
  // Validate that data is loaded
  if (!data) {
    throw new Error('No data loaded. Please upload and parse an EPCIS file before exporting.');
  }

  const baseName = stripExtension(originalFilename);

  // JSON full export does not require SheetJS
  if (type === 'json-full') {
    const jsonContent = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const filename = `json-full_${baseName}.json`;
    triggerDownload(blob, filename);
    return;
  }

  // All other report types require SheetJS for Excel export
  if (!isSheetJSAvailable()) {
    throw new Error('SheetJS (XLSX) library is not available. Excel export is disabled. Please use JSON export instead.');
  }

  let wb;
  let filename;

  switch (type) {
    case 'full-analysis':
      wb = exportFullAnalysisExcel(data);
      filename = `full-analysis_${baseName}.xlsx`;
      break;

    case 'issues-only':
      wb = exportIssuesOnlyExcel(data);
      filename = `issues-only_${baseName}.xlsx`;
      break;

    case 'product-summary':
      wb = exportProductSummaryExcel(data);
      filename = `product-summary_${baseName}.xlsx`;
      break;

    case 'case-aggregation':
      wb = exportCaseAggregationExcel(data);
      filename = `case-aggregation_${baseName}.xlsx`;
      break;

    default:
      throw new Error(`Unknown report type: ${type}`);
  }

  // Write file using SheetJS - triggers browser download
  XLSX.writeFile(wb, filename);
}
