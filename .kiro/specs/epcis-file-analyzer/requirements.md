# Requirements Document

## Introduction

The EPCIS File Analyzer is an HTML-based, browser-only tool for uploading, parsing, and analyzing EPCIS XML files according to GS1 EPCIS standards and DSCSA traceability requirements. The tool provides a comprehensive dashboard with summary statistics, detailed event inspection, product analysis, case/aggregation analysis, SSCC analysis, validation/error detection, filtering, and export capabilities. It requires no backend server and operates entirely in the browser using JavaScript-based XML parsing.

## Glossary

- **Analyzer**: The EPCIS File Analyzer web application running in the browser
- **XML_Parser**: The browser-based XML parsing module responsible for reading and interpreting EPCIS XML files
- **Dashboard**: The main summary view displaying aggregated statistics and counts from the parsed EPCIS file
- **Event_Inspector**: The detailed reading area that displays EPCIS events in a human-readable collapsible format
- **Product_Analyzer**: The module responsible for extracting and correlating product information across events
- **Aggregation_Analyzer**: The module responsible for analyzing case/aggregation relationships between parent and child EPCs
- **SSCC_Analyzer**: The module responsible for tracking and analyzing SSCC usage across events
- **Validator**: The module responsible for detecting errors, inconsistencies, and GS1 standard violations in the EPCIS data
- **Filter_Engine**: The module responsible for applying user-selected filters to narrow displayed data
- **Export_Engine**: The module responsible for generating Excel and JSON export files
- **UI_Renderer**: The module responsible for rendering cards, tables, expandable sections, and color-coded elements
- **EPCIS_Document**: A valid GS1 EPCIS XML document containing an EPCISHeader and EPCISBody with an EventList
- **EPC**: Electronic Product Code, a unique identifier for physical objects in the supply chain
- **SGTIN**: Serialized Global Trade Item Number, an EPC scheme for identifying individual trade items
- **SSCC**: Serial Shipping Container Code, an EPC scheme for identifying logistics units
- **GTIN**: Global Trade Item Number, a 14-digit product identifier
- **NDC**: National Drug Code, an FDA product identifier for pharmaceutical products
- **ILMD**: Instance/Lot Master Data, event-level data describing lot and expiration information
- **Business_Step**: A CBV vocabulary element describing the business context of an event (e.g., commissioning, shipping, receiving)
- **Disposition**: A CBV vocabulary element describing the business state of objects after an event (e.g., active, in_transit)
- **Read_Point**: The physical location where an event took place
- **Business_Location**: The business-relevant location associated with an event
- **Aggregation_Event**: An EPCIS event describing the packing or unpacking of items into containers
- **Object_Event**: An EPCIS event describing observation, creation, or destruction of objects
- **Transaction_Event**: An EPCIS event linking objects to business transactions
- **Transformation_Event**: An EPCIS event describing input items being transformed into output items
- **DSCSA**: Drug Supply Chain Security Act, a US federal law requiring product tracing at the package level in the pharmaceutical supply chain
- **Transaction_Information**: DSCSA-required data elements (TI) including product identifiers, transaction date, quantity, and parties
- **Transaction_History**: DSCSA-required chain of prior transaction documentation (TH) for traceability
- **Transaction_Statement**: DSCSA-required attestation (TS) that a transaction is legitimate
- **CBV**: Core Business Vocabulary, the GS1 standard defining business step and disposition values

## Requirements

### Requirement 1: File Upload and XML Parsing

**User Story:** As a supply chain analyst, I want to upload an EPCIS XML file and have it fully parsed, so that I can analyze its contents.

#### Acceptance Criteria

1. THE Analyzer SHALL provide a drag-and-drop file upload area that accepts files with the .xml extension
2. THE Analyzer SHALL provide a file selection button as an alternative to drag-and-drop
3. WHEN an XML file is uploaded, THE XML_Parser SHALL parse the complete XML structure including namespaces within 5 seconds for files up to 10MB
4. IF an uploaded file exceeds 10MB, THEN THE Analyzer SHALL reject the file and display an error message indicating the maximum allowed file size
5. WHEN an uploaded file is not valid XML, THE XML_Parser SHALL display an error message identifying the syntax issue by line number
6. WHEN an uploaded file does not conform to the EPCIS document schema, THE XML_Parser SHALL display an error indicating the missing or invalid EPCIS structure
7. WHEN the XML is successfully parsed, THE XML_Parser SHALL extract all events from the EPCISBody EventList including ObjectEvent, AggregationEvent, TransactionEvent, TransformationEvent, and AssociationEvent types
8. WHEN the XML is successfully parsed, THE XML_Parser SHALL extract all master data from the EPCISHeader when present
9. WHEN the XML is successfully parsed, THE XML_Parser SHALL extract StandardBusinessDocumentHeader sender and receiver information when present

### Requirement 2: Main Summary Dashboard

**User Story:** As a supply chain analyst, I want to see an overview dashboard with key metrics from the EPCIS file, so that I can quickly assess the shipment contents.

#### Acceptance Criteria

1. WHEN an EPCIS file is parsed, THE Dashboard SHALL display the total number of unique serial numbers (distinct EPC URIs) found across all events
2. WHEN an EPCIS file is parsed, THE Dashboard SHALL display the total number of cases identified (EPCs used as parent IDs in AggregationEvents)
3. WHEN an EPCIS file is parsed, THE Dashboard SHALL display the case serial numbers in a section that is collapsed by default and expands to show the full list when the user activates the expand control
4. WHEN an EPCIS file is parsed, THE Dashboard SHALL display the total number of distinct products identified by unique GTIN
5. WHEN an EPCIS file is parsed, THE Dashboard SHALL display a list of all products found with their product names from master data; IF master data does not contain a product name for a given GTIN, THEN THE Dashboard SHALL display the GTIN as the product identifier
6. WHEN an EPCIS file is parsed, THE Dashboard SHALL display all GTIN and NDC identifiers found in the EPCIS document
7. WHEN an EPCIS file is parsed, THE Dashboard SHALL display all lot numbers found, grouped by product
8. WHEN an EPCIS file is parsed, THE Dashboard SHALL display all expiration dates found, grouped by product
9. WHEN an EPCIS file is parsed, THE Dashboard SHALL display the total number of unique SSCCs found
10. WHEN an EPCIS file is parsed, THE Dashboard SHALL display the SSCCs in a section that is collapsed by default and expands to show the full list when the user activates the expand control
11. WHEN an EPCIS file is parsed, THE Dashboard SHALL display event counts grouped by event type (ObjectEvent, AggregationEvent, TransactionEvent, TransformationEvent)
12. WHEN an EPCIS file is parsed, THE Dashboard SHALL display event counts grouped by action (ADD, OBSERVE, DELETE)
13. WHEN an EPCIS file is parsed, THE Dashboard SHALL display all unique business steps found across events
14. WHEN an EPCIS file is parsed, THE Dashboard SHALL display all unique dispositions found across events
15. WHEN an EPCIS file is parsed, THE Dashboard SHALL display all unique read points and business locations found
16. WHEN StandardBusinessDocumentHeader is present in the parsed EPCIS file, THE Dashboard SHALL display sender and receiver names and identifiers
17. IF a parsed EPCIS file contains zero events, THEN THE Dashboard SHALL display a count of zero for all numeric metrics and empty state indicators for all list sections
18. IF StandardBusinessDocumentHeader is not present in the parsed EPCIS file, THEN THE Dashboard SHALL omit the sender and receiver section from the display

### Requirement 3: Detailed Event Inspector

**User Story:** As a supply chain analyst, I want to inspect each EPCIS event in a readable, structured format, so that I can understand the full event details.

#### Acceptance Criteria

1. THE Event_Inspector SHALL display each event in a collapsible panel showing event type, event time (in ISO 8601 format including time zone offset), and action as the panel header
2. WHEN an event panel is expanded, THE Event_Inspector SHALL display: event type, event time (in ISO 8601 format), event time zone offset, action, business step, and disposition; IF any of these fields is absent from the event data, THEN THE Event_Inspector SHALL omit that field's label and value from the display
3. WHEN an event contains an EPC list, THE Event_Inspector SHALL display all EPCs in the list, each as its full URI string
4. WHEN an event contains a parent ID, THE Event_Inspector SHALL display the parent ID as its full URI string
5. WHEN an event contains child EPCs, THE Event_Inspector SHALL display all child EPCs, each as its full URI string
6. WHEN an event contains a quantity list, THE Event_Inspector SHALL display each quantity element with EPC class, quantity (numeric value), and unit of measure; IF a quantity element has no unit of measure, THEN THE Event_Inspector SHALL display the quantity value without a unit label
7. WHEN an event contains source and destination lists, THE Event_Inspector SHALL display each source and destination with its type and identifier
8. WHEN an event contains a read point or business location, THE Event_Inspector SHALL display the read point and/or business location as their respective URI identifiers
9. WHEN an event contains ILMD data, THE Event_Inspector SHALL display lot number, expiration date, and all additional ILMD attributes as key-value pairs using each attribute's local element name as the key
10. THE Event_Inspector SHALL display events grouped by event type (ObjectEvent, AggregationEvent, TransactionEvent, TransformationEvent) with a numeric event count shown next to each group heading

### Requirement 4: Product Analysis

**User Story:** As a supply chain analyst, I want a product-focused analysis table, so that I can see all details aggregated per product.

#### Acceptance Criteria

1. THE Product_Analyzer SHALL display a table with one row per unique product, where uniqueness is determined by distinct GTIN extracted from SGTIN URIs in the EPCIS document
2. THE Product_Analyzer SHALL display for each product row: the SGTIN company prefix and item reference pattern, the 14-digit GTIN, the NDC identifier when present in master data, and the product name when present in master data
3. THE Product_Analyzer SHALL display the count of unique serial numbers per product, where serial numbers are the serial component of SGTIN URIs sharing the same GTIN
4. THE Product_Analyzer SHALL display all lot numbers associated with each product, extracted from ILMD data in ObjectEvents with action ADD and bizStep commissioning that reference EPCs of that product's GTIN
5. THE Product_Analyzer SHALL display all expiration dates associated with each product, extracted from ILMD data in ObjectEvents with action ADD and bizStep commissioning that reference EPCs of that product's GTIN
6. THE Product_Analyzer SHALL display the count of cases associated with each product, where a case is an EPC used as a parentID in an AggregationEvent whose child EPCs share that product's GTIN
7. THE Product_Analyzer SHALL display the count of SSCCs associated with each product, where an SSCC is associated with a product if any AggregationEvent with that SSCC as parentID contains child EPCs or nested cases with items of that product's GTIN
8. IF the EPCIS document contains no identifiable products (no valid SGTIN URIs), THEN THE Product_Analyzer SHALL display an informational message indicating no product data was found

### Requirement 5: Case and Aggregation Analysis

**User Story:** As a supply chain analyst, I want to analyze the case/aggregation hierarchy, so that I can verify proper packing structure.

#### Acceptance Criteria

1. THE Aggregation_Analyzer SHALL display a table listing all cases (parent IDs from AggregationEvents with action ADD)
2. THE Aggregation_Analyzer SHALL display the parent case serial number for each case as its full EPC URI
3. THE Aggregation_Analyzer SHALL display all child serial numbers contained within each case, listed as full EPC URIs extracted from the childEPCs element of the AggregationEvent
4. THE Aggregation_Analyzer SHALL display the quantity of child units per case, calculated as the count of child EPCs in the AggregationEvent with action ADD for that parent ID
5. THE Aggregation_Analyzer SHALL display the associated product for each case, determined by the GTIN extracted from the child EPC SGTIN URIs within that case
6. THE Aggregation_Analyzer SHALL indicate whether each case has a valid AggregationEvent with action ADD by displaying a status of "Valid" when such an event exists and "Missing" when no ADD aggregation event references that parent ID
7. THE Aggregation_Analyzer SHALL indicate whether child units have been properly commissioned before aggregation by comparing the eventTime of each child EPC's commissioning ObjectEvent against the eventTime of the AggregationEvent, displaying "Yes" when all children have a prior commissioning event and "No" when any child lacks one
8. THE Aggregation_Analyzer SHALL identify and list cases that contain zero children (parent IDs in AggregationEvents with action ADD that have an empty or absent childEPCs element)
9. THE Aggregation_Analyzer SHALL identify and list unit-level serial numbers (EPCs from ObjectEvents with action ADD and bizStep commissioning) that do not appear as children in any AggregationEvent with action ADD

### Requirement 6: SSCC Analysis

**User Story:** As a supply chain analyst, I want to track how each SSCC is used throughout the EPCIS document, so that I can verify shipment logistics.

#### Acceptance Criteria

1. THE SSCC_Analyzer SHALL display a table listing all unique SSCCs found in the document, showing for each SSCC its identifier, the total number of events referencing it, and the roles in which it appears (parentID, childEPC, epcList entry, source, destination, or shipment identifier)
2. THE SSCC_Analyzer SHALL identify where each SSCC appears by scanning parentID fields, childEPCs lists, epcList entries, source lists, destination lists, and shipment identifier fields across all event types in the document
3. WHEN a user selects an SSCC, THE SSCC_Analyzer SHALL display all events that reference that SSCC, showing for each event the event type, event time, business step, disposition, action, and the role the SSCC plays in that event
4. THE SSCC_Analyzer SHALL display the products and cases associated with each SSCC by listing the child EPCs from AggregationEvent elements where that SSCC is the parentID
5. IF the document contains no SSCCs, THEN THE SSCC_Analyzer SHALL display a message indicating that no SSCCs were found in the document

### Requirement 7: Error Analytics and Validation

**User Story:** As a supply chain analyst, I want the tool to detect errors and violations of GS1 EPCIS standards, so that I can identify data quality issues before sharing or processing the file.

#### Acceptance Criteria

1. THE Validator SHALL detect and report XML syntax issues found during parsing
2. THE Validator SHALL detect events missing required fields: eventTime, eventTimeZoneOffset, action
3. THE Validator SHALL detect invalid EPCIS document structure (missing EPCISBody, missing EventList)
4. THE Validator SHALL detect invalid or missing eventTime format (must be ISO 8601 with format YYYY-MM-DDTHH:MM:SS.sssZ or YYYY-MM-DDTHH:MM:SS.sss+HH:MM)
5. THE Validator SHALL detect invalid eventTimeZoneOffset format (must match the regex pattern ^[+-]\d{2}:\d{2}$)
6. THE Validator SHALL detect non-sequential timestamps for the same EPC identifier where a logically later event (by business step sequence) has an earlier eventTime than a preceding event for that same EPC
7. THE Validator SHALL detect events that violate the logical business step sequence for the same EPC, where the valid sequence is: commissioning → packing/aggregation → shipping → receiving → decommissioning/destroying
8. THE Validator SHALL detect invalid GTIN format (must be exactly 14 digits with valid GS1 check digit calculated using the modulo-10 algorithm)
9. THE Validator SHALL detect invalid SSCC format (must be exactly 18 digits with valid GS1 check digit calculated using the modulo-10 algorithm)
10. THE Validator SHALL detect invalid SGTIN URI format (must conform to urn:epc:id:sgtin:<CompanyPrefix>.<ItemRef>.<SerialNumber> where CompanyPrefix and ItemRef together total 13 digits)
11. THE Validator SHALL detect missing ILMD data in ObjectEvent with action ADD and bizStep commissioning
12. THE Validator SHALL detect missing lot number in ILMD data when ILMD is present
13. THE Validator SHALL detect missing expiration date in ILMD data when ILMD is present
14. THE Validator SHALL detect missing aggregation for commissioned units that do not appear as children in any AggregationEvent
15. THE Validator SHALL detect cases (parent IDs) without any child EPCs
16. THE Validator SHALL detect child EPCs in AggregationEvents where the child EPC does not have a prior commissioning ObjectEvent
17. THE Validator SHALL detect duplicate serial numbers across the document (same serial appearing in multiple commissioning events)
18. THE Validator SHALL detect duplicate event IDs when eventID fields are present
19. THE Validator SHALL detect the same serial number appearing in conflicting events (e.g., active in one event and destroyed in another without a DELETE action between them)
20. THE Validator SHALL detect a DELETE action event without a preceding ADD or OBSERVE action for the same EPCs
21. THE Validator SHALL detect shipping events occurring before commissioning or aggregation events for the same items
22. THE Validator SHALL detect receiving events occurring before shipping events for the same items
23. THE Validator SHALL detect invalid business step URIs that do not conform to the CBV standard vocabulary (urn:epcglobal:cbv:bizstep:*)
24. THE Validator SHALL detect invalid disposition URIs that do not conform to the CBV standard vocabulary (urn:epcglobal:cbv:disp:*)
25. THE Validator SHALL detect invalid source or destination format (must include type and valid identifier)
26. THE Validator SHALL detect missing readPoint in ObjectEvents and AggregationEvents with bizStep of commissioning, shipping, or receiving; and detect missing bizLocation in ObjectEvents with bizStep of commissioning
27. THE Validator SHALL detect inconsistent GTIN, lot number, or expiration date for the same serial number across events
28. THE Validator SHALL detect product master data inconsistencies (conflicting product names or attributes for same GTIN)
29. THE Validator SHALL detect unit of measure inconsistencies in quantity elements for the same product (e.g., EACH vs CASE for same GTIN)
30. IF the XML file cannot be parsed at all, THEN THE Validator SHALL report a single Critical-severity issue and prevent further validation from executing

### Requirement 8: DSCSA Compliance Validation

**User Story:** As a pharmaceutical supply chain compliance officer, I want the tool to validate DSCSA-specific traceability requirements, so that I can verify regulatory compliance before sharing transaction data.

#### Acceptance Criteria

1. THE Validator SHALL detect missing Transaction Information (TI) elements in TransactionEvents that have a business step of shipping (urn:epcglobal:cbv:bizstep:shipping) or receiving (urn:epcglobal:cbv:bizstep:receiving), where the required TI elements are: purchase order number, transaction date, product identifiers (GTIN and serial number), and quantity
2. THE Validator SHALL detect missing Transaction History (TH) elements in TransactionEvents where the event represents a subsequent change of ownership (i.e., the event references a source and destination that are different trading partners), requiring at least one prior transaction reference linking to the previous owner's transaction data
3. THE Validator SHALL detect missing Transaction Statement (TS) indicators in shipping and receiving TransactionEvents, where TS is represented by a business transaction element of type "urn:epcglobal:cbv:btt:desadv" or "urn:epcglobal:cbv:btt:recadv" confirming the transaction is authorized and legitimate
4. THE Validator SHALL detect TransactionEvents where any of the following DSCSA verification data elements are absent from the event or its referenced ILMD: product identifier (GTIN), serial number, lot number, and expiration date
5. THE Validator SHALL detect events with a disposition of urn:epcglobal:cbv:disp:recalled or urn:epcglobal:cbv:disp:suspended that lack a corresponding business step indicating the investigation or quarantine action (urn:epcglobal:cbv:bizstep:holding or urn:epcglobal:cbv:bizstep:destroying)
6. THE Validator SHALL detect events with a business step of urn:epcglobal:cbv:bizstep:void_shipping that are missing required notification data: disposition, source party identifier (the entity reporting), and destination party identifier (the entity being notified)
7. THE Validator SHALL classify all DSCSA compliance issues detected by criteria 1 through 6 as Critical severity

### Requirement 9: Issue Severity Classification

**User Story:** As a supply chain analyst, I want issues classified by severity, so that I can prioritize which problems to fix first.

#### Acceptance Criteria

1. THE Validator SHALL classify each detected issue into exactly one of three severity levels: Critical, Warning, or Info
2. THE Validator SHALL classify issues as Critical when the document contains malformed XML, missing required EPCIS root elements, or structural errors that prevent extraction of one or more events
3. THE Validator SHALL classify issues as Warning when a field value violates a GS1 standard format rule, a required field is missing from an otherwise parseable event, or a cross-reference between events is inconsistent
4. THE Validator SHALL classify issues as Info when the issue relates to a recommended but not required field being absent, a deprecated usage pattern, or a formatting suggestion that does not affect data processing
5. THE Validator SHALL provide for each issue: severity level, a title of no more than 120 characters, a description of no more than 500 characters, the affected item identifier (or "N/A" if the issue is document-level and no specific item is implicated), the event time if the issue is associated with a specific EPCIS event, the XML element path referencing the location of the issue, and a suggested correction describing how to resolve the issue
6. IF a single issue matches classification criteria for more than one severity level, THEN THE Validator SHALL assign the highest applicable severity level (Critical > Warning > Info)

### Requirement 10: Filtering

**User Story:** As a supply chain analyst, I want to filter the displayed data by multiple criteria, so that I can focus on specific products, lots, or issue types.

#### Acceptance Criteria

1. THE Filter_Engine SHALL provide filter controls for: product, lot number, expiration date, event type, business step, disposition, serial number, case serial number, SSCC, issue severity, and issue type
2. WHEN a filter is applied, THE Filter_Engine SHALL update all displayed tables, event lists, and dashboard cards to show only matching data within 2 seconds of filter selection
3. WHEN multiple filters are applied simultaneously, THE Filter_Engine SHALL apply them as an AND condition (all filters must match)
4. THE Filter_Engine SHALL provide a clear-all-filters action that resets all filter selections and returns the view to the complete unfiltered dataset
5. THE Filter_Engine SHALL provide a search field that performs case-insensitive substring matching against serial numbers, case serial numbers, and SSCC identifiers, accepting input up to 100 characters in length
6. IF the applied filters result in zero matching records, THEN THE Filter_Engine SHALL display a message indicating no data matches the current filter criteria and continue to display the active filter selections
7. WHEN the clear-all-filters action is triggered, THE Filter_Engine SHALL remove all active filter selections and restore the unfiltered dataset within 2 seconds

### Requirement 11: Export

**User Story:** As a supply chain analyst, I want to export analysis results in Excel and JSON formats, so that I can share findings and integrate with other systems.

#### Acceptance Criteria

1. THE Export_Engine SHALL provide export in Excel (.xlsx) format for the following report types: full analysis, issues only, product summary, and case/aggregation report
2. THE Export_Engine SHALL provide export in JSON format for the full analysis report
3. THE Export_Engine SHALL support exporting five report types: full analysis, issues only, product summary, case/aggregation report, and JSON report (full analysis in JSON format)
4. WHEN the full analysis export is selected, THE Export_Engine SHALL include all dashboard data, events, products, cases, SSCCs, and issues, organized into separate worksheets per data category in Excel format
5. WHEN the issues-only export is selected, THE Export_Engine SHALL include all detected issues with their full details (severity, title, description, affected item, event time, XML location, suggested correction)
6. WHEN the product summary export is selected, THE Export_Engine SHALL include the product analysis table with per-product metrics: product identifier (SGTIN pattern), GTIN, NDC, unique serial number count, lot numbers, expiration dates, case count, and SSCC count
7. WHEN the case/aggregation report export is selected, THE Export_Engine SHALL include all case details, parent-child relationships, child quantity per case, and aggregation status
8. THE Export_Engine SHALL NOT generate CSV format exports
9. IF an export is initiated and no EPCIS file has been parsed, THEN THE Export_Engine SHALL display an error message indicating that data must be loaded before exporting
10. WHEN an export is generated, THE Export_Engine SHALL trigger a browser file download with a filename that includes the report type and the original uploaded filename

### Requirement 12: User Interface Design

**User Story:** As a supply chain analyst, I want a clear, responsive, and well-organized interface, so that I can efficiently navigate large amounts of EPCIS data.

#### Acceptance Criteria

1. THE UI_Renderer SHALL display summary metrics in dashboard cards separated by visible borders or spacing of at least 8px, each card containing a metric label and its corresponding value
2. THE UI_Renderer SHALL use expandable/collapsible sections for detailed data areas, with sections rendered in collapsed state by default
3. THE UI_Renderer SHALL provide search fields within tables that filter displayed rows to those containing the search term within 500ms of the last keystroke
4. THE UI_Renderer SHALL render all tables with sortable column headers, defaulting to ascending order on first click and toggling between ascending and descending on subsequent clicks
5. THE UI_Renderer SHALL color-code issue severity: red for Critical, orange for Warning, blue for Info
6. THE UI_Renderer SHALL provide a visible text heading for each section and a text label for each input or data field
7. THE UI_Renderer SHALL render a responsive layout on screen widths from 768px to 1920px such that all content remains accessible without horizontal scrolling and no UI elements overlap
8. IF a table contains more than 50 rows, THEN THE UI_Renderer SHALL paginate the table displaying up to 50 rows per page with controls to navigate between pages

### Requirement 13: Technical Architecture

**User Story:** As a developer, I want the tool built as a frontend-only application with modular JavaScript, so that it can run in any browser without server dependencies.

#### Acceptance Criteria

1. THE Analyzer SHALL operate entirely in the browser without requiring a backend server, performing all XML parsing, validation, and export generation client-side using only browser-native APIs and local JavaScript execution
2. THE Analyzer SHALL use the browser-native DOMParser API for XML parsing without relying on any external XML parsing libraries
3. THE Analyzer SHALL be structured with separate JavaScript modules for: XML parsing, EPC extraction, product extraction, lot/expiration extraction, case/aggregation analysis, SSCC extraction, event sequence validation, GS1 syntax validation, issue detection, export generation, and UI rendering, where each module exposes a defined interface and can be modified independently without changes to other modules
4. THE Analyzer SHALL consist of a single HTML file, CSS file(s), and JavaScript file(s) that can be opened directly in a browser via a file:// URL or served from any static file host without requiring a build step, bundler, or package manager
5. THE Analyzer SHALL function in the two most recent major stable versions of Chrome, Firefox, Safari, and Edge browsers at the time of release
6. IF the browser does not support a required API used by the Analyzer, THEN THE Analyzer SHALL display an error message indicating the unsupported browser and listing the minimum supported browser versions
7. THE Analyzer SHALL load all modules and render the initial UI within 3 seconds on a standard desktop browser with no cached assets, for the application code alone (excluding user-provided XML file processing time)
