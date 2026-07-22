# Implementation Plan: EPCIS File Analyzer

## Overview

A browser-only, single-page EPCIS XML file analyzer built with vanilla HTML/CSS/JavaScript (ES Modules). The implementation follows a bottom-up approach: foundational parsing and extraction modules first, then validators that depend on them, then UI rendering and interaction, then export, and finally integration wiring.

## Tasks

- [x] 1. Project setup and foundational infrastructure
  - [x] 1.1 Create project structure, index.html, and styles.css
    - Create `index.html` with file upload area (drag-and-drop + button), dashboard section, event inspector section, product table, case/aggregation table, SSCC table, issues table, filter controls, and export buttons
    - Include `<script type="module" src="main.js">` entry point
    - Include SheetJS CDN link with local fallback for xlsx export
    - Create `styles.css` with responsive layout (768px–1920px), dashboard card styles (8px+ spacing/borders), severity color-coding (red Critical, orange Warning, blue Info), collapsible section styles, table styles with sortable headers, and pagination controls
    - _Requirements: 12.1, 12.2, 12.5, 12.6, 12.7, 13.4_

  - [x] 1.2 Set up test infrastructure with Vitest and fast-check
    - Create `package.json` with vitest and fast-check as dev dependencies
    - Create `vitest.config.js` with jsdom environment
    - Create `tests/` directory structure: `tests/property/`, `tests/unit/`, `tests/integration/`, `tests/fixtures/`
    - Create test fixture XML files: `valid-epcis-simple.xml`, `valid-epcis-complex.xml`, `invalid-xml.xml`, `missing-epcisbody.xml`, `dscsa-violations.xml`
    - _Requirements: 13.3_

- [x] 2. XML Parsing Module
  - [x] 2.1 Implement xmlParser.js
    - Implement `parse(xmlString)` function using browser-native `DOMParser`
    - Extract EPCISHeader, StandardBusinessDocumentHeader (sender/receiver), master data entries
    - Extract all events from EPCISBody/EventList (ObjectEvent, AggregationEvent, TransactionEvent, TransformationEvent, AssociationEvent)
    - Parse each event's fields: eventType, eventTime, eventTimeZoneOffset, action, bizStep, disposition, readPoint, bizLocation, epcList, parentID, childEPCs, quantityList, sourceList, destinationList, ilmd, bizTransactionList, eventID
    - Handle namespace resolution and generate xmlPath for each event
    - Return ParsedDocument with parseErrors for malformed XML
    - _Requirements: 1.3, 1.5, 1.6, 1.7, 1.8, 1.9_

  - [x]* 2.2 Write property tests for xmlParser.js
    - **Property 1: XML Parsing Round-Trip (Event Extraction Completeness)**
    - **Property 2: Invalid XML Detection**
    - **Validates: Requirements 1.5, 1.7**

  - [x]* 2.3 Write unit tests for xmlParser.js
    - Test parsing valid EPCIS documents with all event types
    - Test master data extraction
    - Test SBDH sender/receiver extraction
    - Test empty EventList produces zero events
    - Test malformed XML returns parseErrors with line info
    - _Requirements: 1.5, 1.6, 1.7, 1.8, 1.9_

- [x] 3. EPC Extraction Module
  - [x] 3.1 Implement epcExtractor.js
    - Implement `extractAll(events)` returning EPCMap with all, bySGTIN, bySSCC, bySerial maps
    - Implement `parseSGTIN(uri)` parsing `urn:epc:id:sgtin:<CP>.<IR>.<Serial>` format
    - Implement `parseSSCC(uri)` parsing `urn:epc:id:sscc:<CP>.<Serial>` format
    - Implement `computeGTIN(companyPrefix, itemReference)` with check digit calculation
    - Implement GS1 check digit calculation using modulo-10 algorithm
    - Derive NDC from GTIN where applicable
    - _Requirements: 7.8, 7.9, 7.10_

  - [x]* 3.2 Write property tests for epcExtractor.js
    - **Property 3: GTIN Check Digit Round-Trip**
    - **Property 4: SSCC Check Digit Round-Trip**
    - **Property 5: SGTIN URI Parsing Round-Trip**
    - **Validates: Requirements 7.8, 7.9, 7.10**

  - [x]* 3.3 Write unit tests for epcExtractor.js
    - Test SGTIN parsing with various company prefix lengths
    - Test SSCC parsing and validation
    - Test GTIN computation from prefix + item reference
    - Test invalid URIs return null
    - _Requirements: 7.8, 7.9, 7.10_

- [x] 4. Checkpoint - Core parsing and extraction
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Product and Lot Extraction Modules
  - [x] 5.1 Implement productExtractor.js
    - Implement `extractProducts(doc, epcMap)` returning ProductInfo[] with one entry per distinct GTIN
    - Compute serialCount, lotNumbers, expirationDates, caseCount, ssccCount per product
    - Extract product names from master data when available
    - Derive NDC from GTIN master data
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

  - [x] 5.2 Implement lotExpirationExtractor.js
    - Implement extraction of lot numbers and expiration dates from ILMD data
    - Group lots and expirations by GTIN
    - Handle missing ILMD, missing lot, missing expiration gracefully
    - _Requirements: 2.7, 2.8, 4.4, 4.5_

  - [x]* 5.3 Write property test for productExtractor.js
    - **Property 16: Product Extraction Completeness**
    - **Validates: Requirements 4.1, 4.3**

- [x] 6. Aggregation and SSCC Modules
  - [x] 6.1 Implement aggregationAnalyzer.js
    - Implement `analyzeCases(doc, epcMap)` returning AggregationResult
    - Build cases[] from AggregationEvents with action ADD, tracking parentEPC, childEPCs, childCount, associatedGTIN
    - Determine aggregationStatus (Valid/Missing) and childrenCommissioned (Yes/No)
    - Detect emptyCases (parent with zero children)
    - Detect orphanedSerials (commissioned but not aggregated)
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9_

  - [x] 6.2 Implement ssccExtractor.js
    - Implement `extractSSCCs(doc)` returning SSCCInfo[]
    - Scan all event fields for SSCC URIs: parentID, childEPCs, epcList, source, destination, shipment identifier
    - Track roles, event count, child EPCs, and associated products per SSCC
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [x]* 6.3 Write unit tests for aggregationAnalyzer.js and ssccExtractor.js
    - Test case detection with valid aggregations
    - Test orphaned serial detection
    - Test empty case detection
    - Test SSCC role identification across event types
    - _Requirements: 5.1–5.9, 6.1–6.4_

- [x] 7. Validation Modules
  - [x] 7.1 Implement sequenceValidator.js
    - Implement `validateSequences(doc)` returning Issue[]
    - Validate timestamp ordering per EPC
    - Validate business step sequence: commissioning → packing → shipping → receiving → decommissioning
    - Detect DELETE without prior ADD/OBSERVE
    - Detect shipping before commissioning/aggregation
    - Detect receiving before shipping
    - _Requirements: 7.6, 7.7, 7.19, 7.20, 7.21, 7.22_

  - [x] 7.2 Implement gs1Validator.js
    - Implement `validateGS1(doc, epcMap)` returning Issue[]
    - Validate GTIN format (14 digits + check digit), SSCC format (18 digits + check digit), SGTIN URI format
    - Validate business step URIs against CBV vocabulary
    - Validate disposition URIs against CBV vocabulary
    - Validate eventTime ISO 8601 format and eventTimeZoneOffset format
    - Detect missing required fields (eventTime, eventTimeZoneOffset, action)
    - Detect missing ILMD in commissioning events, missing lot/expiration in ILMD
    - Detect duplicate serial numbers and event IDs
    - Detect cross-event inconsistencies (same serial, different GTIN/lot/exp)
    - Detect UOM inconsistencies per GTIN
    - Detect missing readPoint/bizLocation in required contexts
    - Detect invalid source/destination format
    - _Requirements: 7.1–7.5, 7.8–7.18, 7.23–7.29_

  - [x] 7.3 Implement dscsaValidator.js
    - Implement `validateDSCSA(doc)` returning Issue[]
    - Detect missing TI elements in shipping/receiving TransactionEvents
    - Detect missing TH in change-of-ownership TransactionEvents
    - Detect missing TS indicators in TransactionEvents
    - Detect missing verification data (GTIN, serial, lot, exp)
    - Detect recalled/suspended disposition without holding/destroying bizStep
    - Detect void_shipping missing notification data
    - All DSCSA issues classified as Critical severity
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

  - [x] 7.4 Implement issueDetector.js
    - Implement `classifyAndAggregate(rawIssues)` returning Issue[]
    - Apply severity classification rules: Critical for malformed XML/missing structure/DSCSA violations, Warning for format violations/missing fields/inconsistencies, Info for optional fields/deprecated patterns
    - Ensure each issue gets exactly one severity; when multiple apply, assign highest
    - Ensure issue fields: severity, title (≤120 chars), description (≤500 chars), affectedItem, eventTime, xmlPath, suggestedCorrection, category
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [x]* 7.5 Write property tests for validation modules
    - **Property 6: Business Step Sequence Violation Detection**
    - **Property 7: Missing Required Fields Detection**
    - **Property 8: CBV Vocabulary Validation**
    - **Property 9: Commission-Aggregation Relationship Integrity**
    - **Property 10: Duplicate Detection**
    - **Property 11: Cross-Event Data Consistency**
    - **Property 12: DSCSA Compliance Detection**
    - **Property 13: Severity Classification Determinism**
    - **Validates: Requirements 7.2, 7.7, 7.8, 7.9, 7.14, 7.16, 7.17, 7.18, 7.21, 7.22, 7.23, 7.24, 7.27, 7.28, 7.29, 8.1, 8.2, 8.3, 8.7, 9.1, 9.6**

- [x] 8. Checkpoint - All extraction and validation modules
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Filter Engine
  - [x] 9.1 Implement filterEngine.js
    - Implement `applyFilters(data, criteria)` returning FilteredResults
    - Support 11 filter dimensions: product, lotNumber, expirationDate, eventType, bizStep, disposition, serialNumber, caseSerial, sscc, issueSeverity, issueType
    - Implement AND logic across all active filters
    - Implement case-insensitive substring search across serial numbers, case serials, and SSCCs (up to 100 chars)
    - Implement `clearFilters()` to reset all criteria
    - Ensure filtered results are subsets of unfiltered data
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_

  - [x]* 9.2 Write property tests for filterEngine.js
    - **Property 14: Filter AND Semantics**
    - **Validates: Requirements 10.2, 10.3, 10.4, 10.7**

- [x] 10. UI Renderer
  - [x] 10.1 Implement uiRenderer.js - Dashboard and tables
    - Implement `renderDashboard(data)` displaying all DashboardMetrics: unique serials, cases, products, SSCCs, event counts by type/action, bizSteps, dispositions, readPoints, bizLocations, GTINs, NDCs, lots/expirations by product, sender/receiver
    - Implement collapsible sections (collapsed by default) for case serials, SSCCs, and detailed lists
    - Implement `renderProductTable(products)` with sortable columns
    - Implement `renderCaseTable(cases)` with parent/child relationships
    - Implement `renderSSCCTable(ssccs)` with SSCC selection showing related events
    - Implement `renderIssuesTable(issues)` with severity color-coding
    - Implement `renderEventInspector(events)` with collapsible event panels grouped by type
    - _Requirements: 2.1–2.18, 3.1–3.10, 4.1–4.8, 5.1–5.9, 6.1–6.5, 12.1, 12.2, 12.5, 12.6_

  - [x] 10.2 Implement uiRenderer.js - Pagination, sorting, and filtering UI
    - Implement `renderPagination(container, totalRows, pageSize, currentPage)` for tables with >50 rows
    - Implement `sortTable(tableId, column, direction)` with ascending default, toggle on click
    - Implement `renderFilters(data)` populating filter dropdowns from available values
    - Implement in-table search fields with 500ms debounce
    - Wire filter changes to `filterEngine.applyFilters()` and re-render within 2 seconds
    - _Requirements: 10.1, 10.2, 10.6, 12.3, 12.4, 12.8_

  - [x]* 10.3 Write unit tests for uiRenderer.js
    - Test pagination triggers at 51 rows, not at 50
    - Test collapsible sections render collapsed by default
    - Test severity color-coding applied correctly
    - Test event inspector field omission when absent
    - _Requirements: 12.2, 12.5, 12.8_

- [x] 11. Export Engine
  - [x] 11.1 Implement exportEngine.js
    - Implement `exportReport(type, data, originalFilename)` supporting 5 report types
    - Full analysis: multi-worksheet Excel with dashboard, events, products, cases, SSCCs, issues
    - Issues only: single worksheet with all issue fields
    - Product summary: per-product metrics worksheet
    - Case/aggregation: case details with parent-child relationships
    - JSON full: complete AnalysisResults as JSON file
    - Use SheetJS (xlsx) for Excel generation with CDN + local fallback
    - Trigger browser download with filename `{reportType}_{originalFilename}.xlsx` or `.json`
    - Handle no-data-loaded error case
    - Handle SheetJS unavailable: disable Excel, allow JSON
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 11.9, 11.10_

  - [x]* 11.2 Write unit tests for exportEngine.js
    - Test export filename format
    - Test no-data error message
    - Test SheetJS unavailable fallback
    - Test all report types produce correct structure
    - _Requirements: 11.9, 11.10_

- [x] 12. Main module and integration wiring
  - [x] 12.1 Implement main.js - Entry point and event bus
    - Implement event bus for decoupled module communication
    - Wire file upload (drag-and-drop + button) with 10MB validation and .xml extension check
    - On file load: read file → call xmlParser.parse() → call all extractors → call all validators → call issueDetector.classifyAndAggregate() → compute DashboardMetrics → call uiRenderer to render all sections
    - Wire filter interactions to filterEngine and re-render
    - Wire export buttons to exportEngine
    - Wire SSCC selection to show related events
    - Handle error states: file too large, invalid extension, parse failures
    - Display unsupported browser error when required APIs missing
    - _Requirements: 1.1, 1.2, 1.4, 13.1, 13.2, 13.3, 13.5, 13.6, 13.7_

  - [x]* 12.2 Write property test for dashboard metrics
    - **Property 15: Dashboard Metric Accuracy**
    - **Validates: Requirements 2.1, 2.2, 2.4, 2.9**

  - [x]* 12.3 Write integration tests
    - Test end-to-end flow: load sample EPCIS file → verify dashboard metrics
    - Test filter + export: apply filters then export, verify exported data matches filtered view
    - Test file upload error handling (>10MB, non-XML)
    - _Requirements: 1.1–1.4, 2.1, 10.2, 11.4_

- [x] 13. Final checkpoint - Full integration
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The tool ships as raw HTML/CSS/JS with no build step required; the test infrastructure (Vitest/fast-check) is for development only
- SheetJS (xlsx library) is the only external runtime dependency, loaded via CDN with local fallback

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "3.1"] },
    { "id": 3, "tasks": ["3.2", "3.3", "5.1", "5.2"] },
    { "id": 4, "tasks": ["5.3", "6.1", "6.2"] },
    { "id": 5, "tasks": ["6.3", "7.1", "7.2", "7.3"] },
    { "id": 6, "tasks": ["7.4"] },
    { "id": 7, "tasks": ["7.5", "9.1"] },
    { "id": 8, "tasks": ["9.2", "10.1"] },
    { "id": 9, "tasks": ["10.2", "10.3", "11.1"] },
    { "id": 10, "tasks": ["11.2", "12.1"] },
    { "id": 11, "tasks": ["12.2", "12.3"] }
  ]
}
```
