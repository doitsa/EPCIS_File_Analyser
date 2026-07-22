# Implementation Plan: Data Analysis Explorer

## Overview

Replace the existing "SSCC Analysis" flat table with a hierarchical tree-view explorer ("Data Analysis") that visualizes SSCC → Parent Case Serial → Child Serial relationships. The implementation adds a new `dataAnalysisExplorer.js` module with a pure `buildHierarchy` function and a DOM-rendering `renderDataAnalysis` function, integrates it into `main.js` replacing `renderSSCCTable`, and adds CSS for the tree view. All code is vanilla JavaScript with ES modules, consistent with the existing codebase.

## Tasks

- [x] 1. Create the `dataAnalysisExplorer.js` module with `buildHierarchy`
  - [x] 1.1 Implement `buildHierarchy` core logic
    - Create `dataAnalysisExplorer.js` in the project root
    - Implement the hierarchy construction algorithm: index cases by parentEPC, classify SSCC children as case-level or direct serial, build serial nodes (level 3), case nodes (level 2), SSCC nodes (level 1)
    - Implement fallback logic: cases as top-level when no SSCCs, loose serials when no cases, empty array when nothing exists
    - Sort nodes alphabetically by `id` at every level
    - Export `buildHierarchy` as a named export
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 1.2 Implement metadata resolution within `buildHierarchy`
    - Resolve GTIN for each node by parsing SGTIN URIs from `epcMap.all`
    - Resolve Product Name by looking up resolved GTIN in `products[]` array
    - Resolve Lot from `lotExpData.lotsByProduct[gtin]` and commissioning ILMD data
    - Compute `childrenCommissioned` using commissioning event timestamps vs aggregation timestamps
    - Compute `aggregatedSerials`: recursive count for SSCC, direct child count for case, 0 for serial
    - Join multiple GTINs/lots with ", " separator
    - Leave fields empty (empty string) when data cannot be resolved
    - _Requirements: 5.4, 5.5, 5.6, 5.7, 5.8, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 1.3 Implement validation status computation within `buildHierarchy`
    - Import `isValidSSCC` and `isValidGTIN` from `epcExtractor.js`
    - For SSCC nodes: check SSCC-18 check digit validity and non-empty children
    - For case nodes: check derived GTIN-14 check digit, non-empty children, and all childEPCs present in aggregation
    - For serial nodes: check derived GTIN-14 check digit validity
    - Set `validationStatus` to 'pass' or 'fail' and populate `validationReason`
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [ ]* 1.4 Write property tests for hierarchy structure (Properties 1–6)
    - Create `tests/property/dataAnalysisExplorer.property.test.js`
    - Implement test generators: `arbSSCC()`, `arbSGTIN()`, `arbAggregationTree()`
    - **Property 1: Hierarchy structure reflects aggregation relationships**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6**
    - **Property 2: Alphabetical sort invariant**
    - **Validates: Requirements 2.7**
    - **Property 3: Fallback to cases when no SSCCs present**
    - **Validates: Requirements 3.1**
    - **Property 4: Fallback to loose serials when no SSCCs and no cases**
    - **Validates: Requirements 3.2**
    - **Property 5: Direct serials under SSCC when no intermediate cases**
    - **Validates: Requirements 3.3**
    - **Property 6: Empty SSCCs are leaf nodes with zero aggregated serials**
    - **Validates: Requirements 3.5**

  - [ ]* 1.5 Write property tests for metadata and validation (Properties 9–15)
    - Implement generators: `arbMasterData()`, `arbCommissioningEvents()`
    - **Property 9: Aggregated serials count invariant**
    - **Validates: Requirements 5.4, 5.5, 5.6**
    - **Property 10: Multi-value metadata fields display all distinct values**
    - **Validates: Requirements 5.7, 6.5, 6.6**
    - **Property 11: GTIN resolution from SGTIN URIs**
    - **Validates: Requirements 6.1, 6.2**
    - **Property 12: Product name resolution via master data idpat lookup**
    - **Validates: Requirements 6.3**
    - **Property 13: Lot resolution from ILMD commissioning data**
    - **Validates: Requirements 6.4**
    - **Property 14: Children commissioned correctness**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5**
    - **Property 15: Validation status computation correctness**
    - **Validates: Requirements 8.1, 8.2, 8.4**

- [x] 2. Implement `renderDataAnalysis` and tree rendering
  - [x] 2.1 Implement `renderDataAnalysis` function
    - Add `renderDataAnalysis(analysisResults)` as a named export in `dataAnalysisExplorer.js`
    - Call `buildHierarchy` internally with destructured params from `analysisResults`
    - Render the section heading as "Data Analysis" (not "SSCC Analysis")
    - Render empty state message when `buildHierarchy` returns empty array
    - Return immediately with no DOM changes if `analysisResults` is null/undefined
    - HTML-escape all user-facing text using the existing `_escapeHtml` pattern
    - _Requirements: 1.1, 1.2, 1.3, 3.4, 9.1, 9.2, 9.3_

  - [x] 2.2 Implement tree row rendering with metadata columns
    - For each `HierarchyNode`, render a `div.hierarchy-row` with `data-level` and `data-id` attributes
    - Display columns in order: Product Name, Lot, GTIN, Children Commissioned, Aggregated Serials, Validation Status
    - Add toggle element (▶) for non-leaf nodes; omit for leaf nodes
    - Render validation icons with distinct shapes (✓ vs ✗) and colors (green/red) for accessibility
    - Add `aria-label` attributes on validation icons
    - Indent child rows with `padding-left` scaled by depth (20px per level)
    - Wrap child nodes in `div.hierarchy-children[hidden]` container
    - _Requirements: 4.4, 5.1, 5.2, 5.3, 5.8, 8.3, 9.1, 9.2, 9.3_

  - [x] 2.3 Implement expand/collapse interaction
    - Use event delegation on the tree container for toggle click handling
    - On click: toggle `aria-expanded`, toggle `hidden` on children container, rotate icon (▶ → ▼)
    - Start all nodes collapsed (`aria-expanded="false"`, children `hidden`)
    - Preserve internal child expanded/collapsed states on parent collapse/re-expand
    - _Requirements: 4.1, 4.2, 4.3, 4.5_

  - [ ]* 2.4 Write property tests for rendering behavior (Properties 7, 8, 16)
    - **Property 7: Toggle expand/collapse round-trip preserves child state**
    - **Validates: Requirements 4.2, 4.3, 4.5**
    - **Property 8: Leaf nodes have no toggle**
    - **Validates: Requirements 4.4**
    - **Property 16: No event information in rendered output**
    - **Validates: Requirements 5.2, 5.3, 9.1, 9.2, 9.3**

  - [ ]* 2.5 Write unit tests for rendering edge cases
    - Create `tests/unit/dataAnalysisExplorer.test.js`
    - Test section heading renders as "Data Analysis"
    - Test "SSCC Analysis" label does not appear anywhere in rendered output
    - Test empty state message renders when no data exists
    - Test leaf nodes have no toggle element
    - Test validation icons use distinct shapes (✓ vs ✗)
    - Test missing metadata fields render as empty columns
    - Test null/undefined `analysisResults` produces no DOM changes
    - _Requirements: 1.1, 1.3, 3.4, 4.4, 5.8, 8.3_

- [x] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Add CSS styles for the hierarchical tree view
  - [x] 4.1 Add tree view CSS to `styles.css`
    - Add styles for `.hierarchy-row`, `.hierarchy-children`, `.hierarchy-toggle`, `.hierarchy-id`, `.hierarchy-field`, `.hierarchy-validation`
    - Style indentation per depth level (padding-left increments)
    - Style validation pass (green ✓) and fail (red ✗) with both color and shape distinction
    - Style the `text-mono` class for EPC URI display
    - Add hover state for rows and pointer cursor on toggle
    - Ensure responsive layout for metadata columns
    - _Requirements: 4.4, 5.1, 8.3_

- [x] 5. Integrate with `main.js` and replace `renderSSCCTable`
  - [x] 5.1 Update `main.js` to use `renderDataAnalysis`
    - Import `renderDataAnalysis` from `./dataAnalysisExplorer.js`
    - Replace `renderSSCCTable(results.ssccs)` call in `renderAll` with `renderDataAnalysis(results)`
    - Update `renderFiltered` to call `renderDataAnalysis` with filtered context (or skip if filtering doesn't apply to hierarchy)
    - Ensure "Data Analysis" section appears in the same ordinal position as former "SSCC Analysis" section
    - _Requirements: 1.2_

  - [x] 5.2 Update `index.html` to replace the SSCC Analysis section markup
    - Replace the "SSCC Analysis" collapsible section HTML with a "Data Analysis" container element
    - Update the section ID used in `SECTIONS_TO_SHOW` if needed
    - Add the collapsible toggle button with `aria-controls` pointing to the new content area
    - _Requirements: 1.1, 1.2, 1.3_

- [x] 6. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document (16 properties total)
- Unit tests validate specific examples and edge cases
- The `buildHierarchy` function is pure (no DOM access) which makes it ideal for property-based testing
- All code uses vanilla JavaScript with ES modules, consistent with the existing codebase
- Testing uses vitest + fast-check (already configured in the project)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "4.1"] },
    { "id": 2, "tasks": ["1.3"] },
    { "id": 3, "tasks": ["1.4", "1.5", "2.1"] },
    { "id": 4, "tasks": ["2.2"] },
    { "id": 5, "tasks": ["2.3"] },
    { "id": 6, "tasks": ["2.4", "2.5", "5.1"] },
    { "id": 7, "tasks": ["5.2"] }
  ]
}
```
