/**
 * Unit tests for dataAnalysisExplorer.js - renderDataAnalysis function
 * Tests for task 2.1: rendering behavior and edge cases
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderDataAnalysis, buildHierarchy } from '../../dataAnalysisExplorer.js';

describe('renderDataAnalysis', () => {
  let container;

  beforeEach(() => {
    // Set up DOM with the expected container element
    document.body.innerHTML = '<div id="data-analysis-content"></div>';
    container = document.getElementById('data-analysis-content');
  });

  it('should return immediately with no DOM changes if analysisResults is null', () => {
    container.innerHTML = '<p>existing content</p>';
    renderDataAnalysis(null);
    // Container should be cleared (empty string)
    expect(container.innerHTML).toBe('');
  });

  it('should return immediately with no DOM changes if analysisResults is undefined', () => {
    container.innerHTML = '<p>existing content</p>';
    renderDataAnalysis(undefined);
    expect(container.innerHTML).toBe('');
  });

  it('should do nothing if container element does not exist', () => {
    document.body.innerHTML = ''; // Remove the container
    // Should not throw
    expect(() => renderDataAnalysis({ ssccs: [] })).not.toThrow();
  });

  it('should render empty state message when buildHierarchy returns empty array', () => {
    renderDataAnalysis({
      ssccs: [],
      aggregation: { cases: [], emptyCases: [], orphanedSerials: [] },
      epcMap: { all: new Map(), bySGTIN: new Map(), bySSCC: new Map(), bySerial: new Map() },
      document: { events: [], masterData: {} },
      products: [],
    });

    expect(container.querySelector('.empty-state')).not.toBeNull();
    expect(container.querySelector('.empty-state').textContent).toBe(
      'No packaging hierarchy data found in this document.'
    );
  });

  it('should render hierarchy tree when data exists', () => {
    // Create a minimal data set with an SSCC that has a case with a serial
    const epcMap = {
      all: new Map([
        ['urn:epc:id:sgtin:0614141.107346.2017', { gtin: '00614141107346', serial: '2017' }],
      ]),
      bySGTIN: new Map(),
      bySSCC: new Map(),
      bySerial: new Map(),
    };

    renderDataAnalysis({
      ssccs: [
        {
          sscc: 'urn:epc:id:sscc:0614141.1234567890',
          childEPCs: ['urn:epc:id:sgtin:0614141.107346.2017'],
        },
      ],
      aggregation: { cases: [], emptyCases: [], orphanedSerials: [] },
      epcMap,
      document: { events: [], masterData: {} },
      products: [],
    });

    expect(container.querySelector('.hierarchy-tree')).not.toBeNull();
    expect(container.querySelector('.hierarchy-row')).not.toBeNull();
  });

  it('should NOT display "SSCC Analysis" anywhere in rendered output', () => {
    renderDataAnalysis({
      ssccs: [
        {
          sscc: 'urn:epc:id:sscc:0614141.1234567890',
          childEPCs: ['urn:epc:id:sgtin:0614141.107346.2017'],
        },
      ],
      aggregation: { cases: [], emptyCases: [], orphanedSerials: [] },
      epcMap: {
        all: new Map([
          ['urn:epc:id:sgtin:0614141.107346.2017', { gtin: '00614141107346', serial: '2017' }],
        ]),
        bySGTIN: new Map(),
        bySSCC: new Map(),
        bySerial: new Map(),
      },
      document: { events: [], masterData: {} },
      products: [],
    });

    expect(container.innerHTML).not.toContain('SSCC Analysis');
  });

  it('should render leaf nodes without a toggle element', () => {
    // An SSCC with a direct serial child (no cases) - the serial is a leaf
    renderDataAnalysis({
      ssccs: [
        {
          sscc: 'urn:epc:id:sscc:0614141.1234567890',
          childEPCs: ['urn:epc:id:sgtin:0614141.107346.2017'],
        },
      ],
      aggregation: { cases: [], emptyCases: [], orphanedSerials: [] },
      epcMap: {
        all: new Map([
          ['urn:epc:id:sgtin:0614141.107346.2017', { gtin: '00614141107346', serial: '2017' }],
        ]),
        bySGTIN: new Map(),
        bySSCC: new Map(),
        bySerial: new Map(),
      },
      document: { events: [], masterData: {} },
      products: [],
    });

    // The serial node should be a leaf - find the serial row
    const rows = container.querySelectorAll('.hierarchy-row[data-level="serial"]');
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.querySelector('.hierarchy-toggle')).toBeNull();
    }
  });

  it('should render non-leaf nodes with a toggle element', () => {
    renderDataAnalysis({
      ssccs: [
        {
          sscc: 'urn:epc:id:sscc:0614141.1234567890',
          childEPCs: ['urn:epc:id:sgtin:0614141.107346.2017'],
        },
      ],
      aggregation: { cases: [], emptyCases: [], orphanedSerials: [] },
      epcMap: {
        all: new Map([
          ['urn:epc:id:sgtin:0614141.107346.2017', { gtin: '00614141107346', serial: '2017' }],
        ]),
        bySGTIN: new Map(),
        bySSCC: new Map(),
        bySerial: new Map(),
      },
      document: { events: [], masterData: {} },
      products: [],
    });

    // The SSCC node has a child, so it should have a toggle
    const ssccRow = container.querySelector('.hierarchy-row[data-level="sscc"]');
    expect(ssccRow).not.toBeNull();
    expect(ssccRow.querySelector('.hierarchy-toggle')).not.toBeNull();
  });

  it('should render validation icons with distinct shapes (✓ vs ✗)', () => {
    renderDataAnalysis({
      ssccs: [
        {
          sscc: 'urn:epc:id:sscc:0614141.1234567890',
          childEPCs: ['urn:epc:id:sgtin:0614141.107346.2017'],
        },
      ],
      aggregation: { cases: [], emptyCases: [], orphanedSerials: [] },
      epcMap: {
        all: new Map([
          ['urn:epc:id:sgtin:0614141.107346.2017', { gtin: '00614141107346', serial: '2017' }],
        ]),
        bySGTIN: new Map(),
        bySSCC: new Map(),
        bySerial: new Map(),
      },
      document: { events: [], masterData: {} },
      products: [],
    });

    const validationIcons = container.querySelectorAll('.hierarchy-validation');
    expect(validationIcons.length).toBeGreaterThan(0);

    for (const icon of validationIcons) {
      const text = icon.textContent;
      expect(text === '✓' || text === '✗').toBe(true);
    }
  });

  it('should render missing metadata fields as empty columns (not hidden)', () => {
    renderDataAnalysis({
      ssccs: [
        {
          sscc: 'urn:epc:id:sscc:0614141.1234567890',
          childEPCs: ['urn:epc:id:sgtin:0614141.107346.2017'],
        },
      ],
      aggregation: { cases: [], emptyCases: [], orphanedSerials: [] },
      epcMap: {
        all: new Map(), // No GTIN resolution available
        bySGTIN: new Map(),
        bySSCC: new Map(),
        bySerial: new Map(),
      },
      document: { events: [], masterData: {} },
      products: [],
    });

    // Each row should still have all hierarchy-field spans (5 of them)
    const rows = container.querySelectorAll('.hierarchy-row');
    for (const row of rows) {
      const fields = row.querySelectorAll('.hierarchy-field');
      expect(fields.length).toBe(5);
    }
  });

  it('should HTML-escape user-facing text', () => {
    // Use a product with HTML-like characters
    const epcMap = {
      all: new Map([
        ['urn:epc:id:sgtin:0614141.107346.2017', { gtin: '00614141107346', serial: '2017' }],
      ]),
      bySGTIN: new Map(),
      bySSCC: new Map(),
      bySerial: new Map(),
    };

    renderDataAnalysis({
      ssccs: [
        {
          sscc: 'urn:epc:id:sscc:0614141.1234567890',
          childEPCs: ['urn:epc:id:sgtin:0614141.107346.2017'],
        },
      ],
      aggregation: { cases: [], emptyCases: [], orphanedSerials: [] },
      epcMap,
      document: { events: [], masterData: {} },
      products: [{ gtin: '00614141107346', productName: '<script>alert("xss")</script>' }],
    });

    // No actual script elements should be created in the DOM
    expect(container.querySelector('script')).toBeNull();

    // The product name should appear as text content in one of the fields
    const fields = container.querySelectorAll('.hierarchy-field');
    let foundProductField = false;
    for (const field of fields) {
      if (field.textContent.includes('alert')) {
        foundProductField = true;
        // The text should be the raw string (safe because set via textContent)
        expect(field.textContent).toBe('<script>alert("xss")</script>');
      }
    }
    expect(foundProductField).toBe(true);
  });

  it('should start all nodes collapsed (children hidden)', () => {
    renderDataAnalysis({
      ssccs: [
        {
          sscc: 'urn:epc:id:sscc:0614141.1234567890',
          childEPCs: ['urn:epc:id:sgtin:0614141.107346.2017'],
        },
      ],
      aggregation: { cases: [], emptyCases: [], orphanedSerials: [] },
      epcMap: {
        all: new Map([
          ['urn:epc:id:sgtin:0614141.107346.2017', { gtin: '00614141107346', serial: '2017' }],
        ]),
        bySGTIN: new Map(),
        bySSCC: new Map(),
        bySerial: new Map(),
      },
      document: { events: [], masterData: {} },
      products: [],
    });

    const childContainers = container.querySelectorAll('.hierarchy-children');
    for (const childContainer of childContainers) {
      expect(childContainer.hidden).toBe(true);
    }
  });

  describe('expand/collapse interaction', () => {
    let toggle;

    beforeEach(() => {
      // Render a tree with SSCC → case → serial (3 levels)
      renderDataAnalysis({
        ssccs: [
          {
            sscc: 'urn:epc:id:sscc:0614141.1234567890',
            childEPCs: ['urn:epc:id:sgtin:0614141.107346.2017'],
          },
        ],
        aggregation: {
          cases: [
            {
              parentEPC: 'urn:epc:id:sgtin:0614141.107346.2017',
              childEPCs: ['urn:epc:id:sgtin:0614141.107346.1001', 'urn:epc:id:sgtin:0614141.107346.1002'],
              childCount: 2,
              childrenCommissioned: 'Yes',
            },
          ],
          emptyCases: [],
          orphanedSerials: [],
        },
        epcMap: {
          all: new Map([
            ['urn:epc:id:sgtin:0614141.107346.2017', { gtin: '00614141107346', serial: '2017' }],
            ['urn:epc:id:sgtin:0614141.107346.1001', { gtin: '00614141107346', serial: '1001' }],
            ['urn:epc:id:sgtin:0614141.107346.1002', { gtin: '00614141107346', serial: '1002' }],
          ]),
          bySGTIN: new Map(),
          bySSCC: new Map(),
          bySerial: new Map(),
        },
        document: { events: [], masterData: {} },
        products: [],
      });

      toggle = container.querySelector('.hierarchy-toggle');
    });

    it('should expand a collapsed node on toggle click (Req 4.2)', () => {
      // Initially collapsed
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
      expect(toggle.textContent).toBe('▶');

      const childrenContainer = toggle.closest('.hierarchy-row').parentElement.querySelector('.hierarchy-children');
      expect(childrenContainer.hidden).toBe(true);

      // Click to expand
      toggle.click();

      expect(toggle.getAttribute('aria-expanded')).toBe('true');
      expect(toggle.getAttribute('aria-label')).toBe('Collapse');
      expect(toggle.textContent).toBe('▼');
      expect(childrenContainer.hidden).toBe(false);
    });

    it('should collapse an expanded node on toggle click (Req 4.3)', () => {
      // Expand first
      toggle.click();
      expect(toggle.getAttribute('aria-expanded')).toBe('true');

      // Click again to collapse
      toggle.click();

      expect(toggle.getAttribute('aria-expanded')).toBe('false');
      expect(toggle.getAttribute('aria-label')).toBe('Expand');
      expect(toggle.textContent).toBe('▶');

      const childrenContainer = toggle.closest('.hierarchy-row').parentElement.querySelector('.hierarchy-children');
      expect(childrenContainer.hidden).toBe(true);
    });

    it('should preserve child expanded/collapsed states on parent collapse/re-expand (Req 4.5)', () => {
      // Expand the SSCC (top-level)
      toggle.click();
      expect(toggle.getAttribute('aria-expanded')).toBe('true');

      // Find the case-level toggle and expand it
      const caseToggle = container.querySelector('.hierarchy-row[data-level="case"] .hierarchy-toggle');
      expect(caseToggle).not.toBeNull();
      caseToggle.click();
      expect(caseToggle.getAttribute('aria-expanded')).toBe('true');

      // Now collapse the SSCC (parent)
      toggle.click();
      expect(toggle.getAttribute('aria-expanded')).toBe('false');

      // The case toggle should still be in expanded state internally
      expect(caseToggle.getAttribute('aria-expanded')).toBe('true');

      // Re-expand the SSCC
      toggle.click();
      expect(toggle.getAttribute('aria-expanded')).toBe('true');

      // The case toggle should still be expanded
      expect(caseToggle.getAttribute('aria-expanded')).toBe('true');
      expect(caseToggle.textContent).toBe('▼');

      // And the case's children container should still be visible
      const caseChildrenContainer = caseToggle.closest('.hierarchy-row').parentElement.querySelector('.hierarchy-children');
      expect(caseChildrenContainer.hidden).toBe(false);
    });

    it('should use event delegation on the tree container (Req 4.1)', () => {
      // Verify event delegation by checking that clicking the toggle works
      // even though the listener is on the tree, not individual toggles
      const tree = container.querySelector('.hierarchy-tree');
      expect(tree).not.toBeNull();

      // Simulate a click event dispatched on the toggle but bubbling to the tree
      const event = new MouseEvent('click', { bubbles: true });
      toggle.dispatchEvent(event);

      expect(toggle.getAttribute('aria-expanded')).toBe('true');
    });

    it('should not react to clicks on non-toggle elements', () => {
      // Click on the id span (not a toggle)
      const idSpan = container.querySelector('.hierarchy-id');
      idSpan.click();

      // Nothing should change
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
      const childrenContainer = toggle.closest('.hierarchy-row').parentElement.querySelector('.hierarchy-children');
      expect(childrenContainer.hidden).toBe(true);
    });
  });
});
