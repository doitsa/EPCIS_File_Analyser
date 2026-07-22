# Requirements Document

## Introduction

This feature redesigns the existing "SSCC Analysis" section of the EPCIS File Analyzer into a hierarchical packaging explorer called "Data Analysis". Instead of displaying SSCC data in a flat table with event references, the new section presents a clean tree/hierarchy view focused on packaging relationships: SSCC → Parent Case Serial → Child Serial Numbers. The explorer removes all event-specific information (event times, aggregation events, object events, transaction events) and focuses purely on the packaging structure, product metadata, and validation status.

## Glossary

- **Explorer**: The hierarchical tree-view UI component that displays packaging relationships as expandable/collapsible nodes
- **Hierarchy_Node**: A single row in the explorer tree representing an SSCC, Parent Case Serial, or Child Serial Number
- **SSCC**: Serialized Shipping Container Code — the top-level packaging unit in the hierarchy
- **Parent_Case_Serial**: An EPC URI used as a parentID in an AggregationEvent that contains child serial numbers; represents an intermediate packaging level between SSCC and individual items
- **Child_Serial**: An individual serialized item (SGTIN) that is aggregated under a Parent Case Serial or directly under an SSCC
- **Validation_Status**: A visual indicator showing whether a hierarchy node passes structural validation checks (valid check digits, proper aggregation relationships)
- **Children_Commissioned**: A Yes/No flag indicating whether all child serials under a given parent were commissioned (ObjectEvent ADD with bizStep commissioning) prior to aggregation
- **Loose_Unit**: A commissioned serial that is not aggregated into any parent case or SSCC

## Requirements

### Requirement 1: Section Rename and Identity

**User Story:** As a user, I want the former "SSCC Analysis" section to be renamed "Data Analysis", so that the section title reflects its broader packaging hierarchy purpose.

#### Acceptance Criteria

1. THE Explorer SHALL display the section heading as "Data Analysis"
2. THE Explorer SHALL render the "Data Analysis" section as a collapsible sub-section within the Data Explorer, in the same ordinal position previously occupied by the "SSCC Analysis" section
3. THE Explorer SHALL NOT display the label "SSCC Analysis" anywhere in the user interface

### Requirement 2: Three-Level Hierarchy Structure

**User Story:** As a supply chain analyst, I want to see packaging data organized in a three-level expandable tree (SSCC → Parent Case Serial → Child Serial), so that I can navigate the full packaging structure from logistics unit down to individual items.

#### Acceptance Criteria

1. WHEN an EPCIS document contains SSCC identifiers, THE Explorer SHALL display each SSCC as a top-level node in the hierarchy
2. WHEN a user expands an SSCC node, THE Explorer SHALL display the Parent Case Serials aggregated under that SSCC as second-level child nodes
3. WHEN a user expands a Parent Case Serial node, THE Explorer SHALL display the Child Serial Numbers aggregated under that parent case as third-level child nodes
4. THE Explorer SHALL derive the SSCC-to-Parent-Case relationship from AggregationEvents where the SSCC is the parentID and child EPCs are SGTIN case-level identifiers used as parents in their own AggregationEvents
5. THE Explorer SHALL derive the Parent-Case-to-Child relationship from AggregationEvents where the parent case is the parentID and child EPCs are SGTIN serial-level identifiers
6. THE Explorer SHALL only consider AggregationEvents with action ADD when building the hierarchy; AggregationEvents with action DELETE or OBSERVE SHALL NOT contribute parent-child relationships
7. THE Explorer SHALL sort nodes at each level alphabetically by their EPC URI

### Requirement 3: Fallback Display Logic

**User Story:** As a user viewing documents without full packaging hierarchies, I want the explorer to gracefully degrade and show whatever packaging level is available, so that I always see relevant data regardless of document completeness.

#### Acceptance Criteria

1. WHEN an EPCIS document contains no SSCC identifiers but contains Parent Case Serials with aggregation relationships, THE Explorer SHALL display Parent Case Serials as top-level nodes
2. WHEN an EPCIS document contains no SSCC identifiers and no Parent Case Serials with aggregation relationships, THE Explorer SHALL display Child Serial Numbers (loose units) as top-level nodes
3. WHEN an EPCIS document contains SSCCs but a specific SSCC has no associated parent cases, THE Explorer SHALL display the child serials aggregated directly under that SSCC node as second-level child nodes
4. IF an EPCIS document contains no SSCC identifiers, no Parent Case Serials with aggregation relationships, and no Child Serial Numbers, THEN THE Explorer SHALL display an empty state message indicating no packaging hierarchy data was found
5. WHEN an EPCIS document contains SSCCs but a specific SSCC has neither associated parent cases nor direct child serials, THE Explorer SHALL display that SSCC as a leaf node with an aggregated serials count of zero

### Requirement 4: Default Collapsed State

**User Story:** As a user analyzing large documents with many packaging units, I want all hierarchy nodes collapsed by default, so that the view remains compact and I can selectively expand the nodes I am interested in.

#### Acceptance Criteria

1. WHEN an EPCIS document is parsed and the Explorer is rendered, THE Explorer SHALL display all hierarchy nodes in a collapsed state with their children hidden
2. WHEN a user clicks a collapsed hierarchy node toggle, THE Explorer SHALL expand that node to reveal its immediate children
3. WHEN a user clicks an expanded hierarchy node toggle, THE Explorer SHALL collapse that node to hide its children and all nested descendants
4. IF a Hierarchy_Node has no children (leaf node), THEN THE Explorer SHALL NOT display an expand/collapse toggle for that node; conversely, every node that has children SHALL always display a toggle
5. WHEN a user collapses a parent node and then re-expands it, THE Explorer SHALL display that node's immediate children in their previously expanded or collapsed states
6. THE Explorer MAY collapse nodes in response to system events or user actions beyond direct toggle clicks (such as filter changes or document reload)

### Requirement 5: Row Information Display

**User Story:** As a supply chain analyst, I want each hierarchy row to show key product and packaging metadata inline, so that I can quickly assess the contents without expanding deeper levels.

#### Acceptance Criteria

1. THE Explorer SHALL display the following fields for each Hierarchy_Node in this order: Product Name, Lot, GTIN, Children Commissioned status (Yes/No), Aggregated Serials count, and Validation Status
2. THE Explorer SHALL NOT display Event Time as a column or field in any hierarchy row
3. THE Explorer SHALL NOT display event-specific information such as Aggregation Events, Object Events, or Transaction Events in any hierarchy row
4. IF a Hierarchy_Node is an SSCC, THEN THE Explorer SHALL display the aggregated serials count as the total number of child EPCs (including nested children) under that SSCC
5. IF a Hierarchy_Node is a Parent Case Serial, THEN THE Explorer SHALL display the aggregated serials count as the number of direct child serial numbers under that case
6. IF a Hierarchy_Node is a Child Serial, THEN THE Explorer SHALL display the aggregated serials count as zero
7. IF a Hierarchy_Node has multiple distinct Lot numbers among its child EPCs, THEN THE Explorer SHALL display all distinct Lot numbers separated by commas
8. IF a metadata field (Product Name, Lot, or GTIN) cannot be resolved for a Hierarchy_Node, THEN THE Explorer SHALL display that field as an empty value rather than hiding the field column

### Requirement 6: Product Metadata Resolution

**User Story:** As a user, I want to see the product name, GTIN, and lot number associated with each node, so that I can identify the product contents at every level of the hierarchy.

#### Acceptance Criteria

1. WHEN a Hierarchy_Node has child EPCs that are SGTIN URIs, THE Explorer SHALL resolve the GTIN for that node by parsing the SGTIN URIs of its child EPCs and extracting the 14-digit GTIN
2. WHEN a Hierarchy_Node is a Child Serial (leaf node), THE Explorer SHALL resolve the GTIN by parsing its own SGTIN URI
3. THE Explorer SHALL resolve the Product Name from master data using the idpat pattern matching the resolved GTIN
4. THE Explorer SHALL resolve the Lot number from ILMD data in commissioning events (ObjectEvent ADD with bizStep commissioning) that reference the child EPCs
5. WHEN multiple GTINs exist under a single parent node, THE Explorer SHALL display all distinct GTINs separated by commas
6. WHEN multiple lot numbers exist under a single parent node, THE Explorer SHALL display all distinct lot numbers separated by commas
7. IF no master data product name is available for a resolved GTIN, THEN THE Explorer SHALL display the GTIN value alone without a product name
8. IF no commissioning events with ILMD lot data exist for the child EPCs of a node, or IF commissioning events exist but contain no ILMD lot data, THEN THE Explorer SHALL leave the Lot field empty

### Requirement 7: Children Commissioned Status

**User Story:** As a compliance officer, I want to see whether children under a parent were properly commissioned before aggregation, so that I can identify supply chain process violations.

#### Acceptance Criteria

1. IF all child EPCs under a Hierarchy_Node have a commissioning event (ObjectEvent ADD with bizStep commissioning) with an eventTime strictly earlier than the aggregation eventTime, THEN THE Explorer SHALL display "Yes" for Children_Commissioned on that node
2. IF one or more child EPCs under a Hierarchy_Node lack a commissioning event, or have a commissioning eventTime equal to or later than the aggregation eventTime, THEN THE Explorer SHALL display "No" for Children_Commissioned on that node
3. IF a Hierarchy_Node has zero child EPCs (empty parent case), THEN THE Explorer SHALL display "No" for Children_Commissioned on that node
4. WHEN a Hierarchy_Node is a Child Serial (leaf level), THE Explorer SHALL display "N/A" for the Children_Commissioned field, taking precedence over the zero-children rule in AC3
5. IF multiple AggregationEvent ADD events exist for the same parentID, THEN THE Explorer SHALL evaluate Children_Commissioned against the earliest aggregation eventTime among those events

### Requirement 8: Validation Status Indicator

**User Story:** As a user, I want to see a visual validation indicator for each hierarchy node, so that I can quickly spot packaging structure problems.

#### Acceptance Criteria

1. WHEN a Hierarchy_Node's identifier has a valid GS1 check digit (SSCC-18 for SSCC nodes, derived GTIN-14 for Parent Case Serial and Child Serial nodes) and the node has no aggregation structural failures, THE Explorer SHALL display a passing validation indicator for that node
2. WHEN a Hierarchy_Node's identifier has an invalid GS1 check digit, or the node is a parent with zero child EPCs (empty case), or one or more of its child EPCs are not present as children in any AggregationEvent (missing parent reference), THE Explorer SHALL display a failing validation indicator for that node
3. THE Explorer SHALL differentiate passing and failing validation states using both a distinct icon and a color difference so that the states remain distinguishable without relying on color alone; IF one indicator type is technically unavailable, THE Explorer MAY fall back to the other indicator type alone
4. WHEN a Hierarchy_Node is a Child Serial (leaf level) with no children of its own, THE Explorer SHALL determine its validation status based solely on the GS1 check digit validity of its derived GTIN-14

### Requirement 9: No Event Information Display

**User Story:** As a user, I want the Data Analysis section to focus purely on packaging hierarchy and product data without event details, so that I have a clean view separate from the Event Inspector.

#### Acceptance Criteria

1. THE Explorer SHALL NOT display event types (Aggregation Event, Object Event, Transaction Event, Transformation Event, Association Event) as rows, columns, expandable sections, or labels within the hierarchy view
2. THE Explorer SHALL NOT display event-level fields including event timestamps, bizStep values, disposition values, read point values, bizLocation values, action values, source/destination lists, business transaction lists, or event IDs as visible text, columns, or metadata within the hierarchy
3. THE Explorer SHALL NOT display event roles (parentID, childEPC, epcList) as visible metadata labels or field names in hierarchy rows
4. THE Explorer SHALL still display data that is derived from events (such as Children_Commissioned status, Validation_Status, Product Name, Lot, and GTIN) as defined in Requirements 5 through 8, provided the underlying event fields used to compute them are not themselves exposed in the UI
