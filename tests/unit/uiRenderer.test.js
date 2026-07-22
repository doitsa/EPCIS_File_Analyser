/**
 * Unit tests for uiRenderer.js
 * 
 * Tests pagination triggers, collapsible sections, severity color-coding,
 * and event inspector field omission behaviors.
 * 
 * Validates: Requirements 12.2, 12.5, 12.8
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  renderPagination,
  renderIssuesTable,
  renderEventInspector,
  renderDashboard
} from '../../uiRenderer.js';

describe('uiRenderer', () => {
  beforeEach(() => {
    // Reset DOM for each test
    document.body.innerHTML = '';
  });

  // ─── PAGINATION (Requirement 12.8) ──────────────────────────────────────────
  describe('renderPagination', () => {
    it('should NOT render pagination controls when totalRows is 50 (exactly PAGE_SIZE)', () => {
      const container = document.createElement('div');
      container.id = 'test-pagination';
      document.body.appendChild(container);

      renderPagination(container, 50, 50, 1);

      expect(container.innerHTML).toBe('');
      expect(container.querySelector('.pagination')).toBeNull();
    });

    it('should render pagination controls when totalRows is 51 (exceeds PAGE_SIZE)', () => {
      const container = document.createElement('div');
      container.id = 'test-pagination';
      document.body.appendChild(container);

      renderPagination(container, 51, 50, 1);

      expect(container.querySelector('.pagination')).not.toBeNull();
      expect(container.querySelectorAll('.pagination-btn').length).toBeGreaterThan(0);
    });

    it('should render Previous and Next buttons when paginated', () => {
      const container = document.createElement('div');
      document.body.appendChild(container);

      renderPagination(container, 120, 50, 1);

      const prevBtn = container.querySelector('.pagination-prev');
      const nextBtn = container.querySelector('.pagination-next');
      expect(prevBtn).not.toBeNull();
      expect(nextBtn).not.toBeNull();
    });

    it('should disable Previous button on first page', () => {
      const container = document.createElement('div');
      document.body.appendChild(container);

      renderPagination(container, 120, 50, 1);

      const prevBtn = container.querySelector('.pagination-prev');
      expect(prevBtn.disabled).toBe(true);
    });

    it('should disable Next button on last page', () => {
      const container = document.createElement('div');
      document.body.appendChild(container);

      renderPagination(container, 120, 50, 3); // 3 pages total, on page 3

      const nextBtn = container.querySelector('.pagination-next');
      expect(nextBtn.disabled).toBe(true);
    });

    it('should accept container by string ID', () => {
      const container = document.createElement('div');
      container.id = 'my-pagination';
      document.body.appendChild(container);

      renderPagination('my-pagination', 100, 50, 1);

      expect(container.querySelector('.pagination')).not.toBeNull();
    });

    it('should clear pagination when totalRows drops to PAGE_SIZE or below', () => {
      const container = document.createElement('div');
      document.body.appendChild(container);

      // First render with pagination
      renderPagination(container, 100, 50, 1);
      expect(container.querySelector('.pagination')).not.toBeNull();

      // Re-render with fewer rows - should clear
      renderPagination(container, 50, 50, 1);
      expect(container.innerHTML).toBe('');
    });
  });

  // ─── COLLAPSIBLE SECTIONS (Requirement 12.2) ────────────────────────────────
  describe('collapsible sections', () => {
    it('should render collapsible sections in collapsed state by default', () => {
      // Set up the DOM structure that renderDashboard expects
      document.body.innerHTML = `
        <div id="dashboard-section" hidden>
          <div id="dashboard-cards"></div>
          <div id="sbdh-info" hidden>
            <span id="sender-name"></span>
            <span id="sender-id"></span>
            <span id="receiver-name"></span>
            <span id="receiver-id"></span>
          </div>
          <div id="dashboard-details-grid"></div>
        </div>
      `;

      const data = {
        metrics: {
          totalUniqueSerials: 10,
          totalCases: 5,
          totalProducts: 2,
          totalSSCCs: 3,
          caseSerials: ['SER001', 'SER002', 'SER003'],
          ssccIdentifiers: ['SSCC001', 'SSCC002']
        }
      };

      renderDashboard(data);

      // Collapsible sections should be rendered with aria-expanded="false" and content hidden
      const toggles = document.querySelectorAll('.collapsible-toggle');
      toggles.forEach(toggle => {
        expect(toggle.getAttribute('aria-expanded')).toBe('false');
      });

      const collapsibleContents = document.querySelectorAll('.collapsible-content');
      collapsibleContents.forEach(content => {
        expect(content.hidden).toBe(true);
      });
    });

    it('should render event inspector groups collapsed by default', () => {
      document.body.innerHTML = `
        <div id="event-inspector-section" hidden>
          <div id="event-groups"></div>
        </div>
      `;

      const events = [
        { eventType: 'ObjectEvent', eventTime: '2024-01-01T00:00:00Z', action: 'ADD' },
        { eventType: 'AggregationEvent', eventTime: '2024-01-02T00:00:00Z', action: 'ADD' }
      ];

      renderEventInspector(events);

      // All event group toggles should be collapsed
      const toggles = document.querySelectorAll('.collapsible-toggle');
      expect(toggles.length).toBeGreaterThan(0);
      toggles.forEach(toggle => {
        expect(toggle.getAttribute('aria-expanded')).toBe('false');
      });

      // All collapsible content sections should be hidden
      const contents = document.querySelectorAll('.collapsible-content');
      contents.forEach(content => {
        expect(content.hidden).toBe(true);
      });
    });
  });

  // ─── SEVERITY COLOR-CODING (Requirement 12.5) ──────────────────────────────
  describe('severity color-coding', () => {
    beforeEach(() => {
      document.body.innerHTML = `
        <div id="issues-section" hidden>
          <table id="issues-table">
            <thead><tr>
              <th>Severity</th><th>Title</th><th>Category</th>
              <th>Affected Item</th><th>Event Time</th><th>Suggestion</th>
            </tr></thead>
            <tbody id="issues-table-body"></tbody>
          </table>
          <div id="issues-pagination"></div>
        </div>
      `;
    });

    it('should apply "critical" CSS class for Critical severity issues', () => {
      const issues = [
        { severity: 'Critical', title: 'Missing EPCIS Body', category: 'Structure', affectedItem: 'Document', eventTime: '', suggestedCorrection: 'Add EPCISBody' }
      ];

      renderIssuesTable(issues);

      const badge = document.querySelector('.severity-badge.critical');
      expect(badge).not.toBeNull();
      expect(badge.textContent).toBe('Critical');
    });

    it('should apply "warning" CSS class for Warning severity issues', () => {
      const issues = [
        { severity: 'Warning', title: 'Missing lot number', category: 'Validation', affectedItem: 'Event 1', eventTime: '2024-01-01', suggestedCorrection: 'Add lot' }
      ];

      renderIssuesTable(issues);

      const badge = document.querySelector('.severity-badge.warning');
      expect(badge).not.toBeNull();
      expect(badge.textContent).toBe('Warning');
    });

    it('should apply "info" CSS class for Info severity issues', () => {
      const issues = [
        { severity: 'Info', title: 'Optional field missing', category: 'Info', affectedItem: 'Event 2', eventTime: '2024-01-02', suggestedCorrection: '' }
      ];

      renderIssuesTable(issues);

      const badge = document.querySelector('.severity-badge.info');
      expect(badge).not.toBeNull();
      expect(badge.textContent).toBe('Info');
    });

    it('should apply correct severity classes for mixed issues', () => {
      const issues = [
        { severity: 'Critical', title: 'Issue 1', category: 'A', affectedItem: '', eventTime: '', suggestedCorrection: '' },
        { severity: 'Warning', title: 'Issue 2', category: 'B', affectedItem: '', eventTime: '', suggestedCorrection: '' },
        { severity: 'Info', title: 'Issue 3', category: 'C', affectedItem: '', eventTime: '', suggestedCorrection: '' }
      ];

      renderIssuesTable(issues);

      expect(document.querySelector('.severity-badge.critical')).not.toBeNull();
      expect(document.querySelector('.severity-badge.warning')).not.toBeNull();
      expect(document.querySelector('.severity-badge.info')).not.toBeNull();
    });
  });

  // ─── EVENT INSPECTOR FIELD OMISSION (Requirement 12.2) ─────────────────────
  describe('event inspector field omission', () => {
    beforeEach(() => {
      document.body.innerHTML = `
        <div id="event-inspector-section" hidden>
          <div id="event-groups"></div>
        </div>
      `;
    });

    it('should omit fields that are null or undefined from event panel', () => {
      const events = [
        {
          eventType: 'ObjectEvent',
          eventTime: '2024-01-01T10:00:00Z',
          action: 'ADD',
          bizStep: null,
          disposition: undefined,
          readPoint: '',
          bizLocation: null,
          eventID: null,
          parentID: undefined
        }
      ];

      renderEventInspector(events);

      const fields = document.querySelectorAll('.event-field');
      const labels = Array.from(fields).map(f =>
        f.querySelector('.event-field-label').textContent
      );

      // Should include fields that have values
      expect(labels).toContain('Event Time:');
      expect(labels).toContain('Action:');

      // Should NOT include fields that are null/undefined/empty
      expect(labels).not.toContain('Business Step:');
      expect(labels).not.toContain('Disposition:');
      expect(labels).not.toContain('Read Point:');
      expect(labels).not.toContain('Business Location:');
      expect(labels).not.toContain('Event ID:');
      expect(labels).not.toContain('Parent ID:');
    });

    it('should include fields when they have values', () => {
      const events = [
        {
          eventType: 'ObjectEvent',
          eventTime: '2024-06-15T08:30:00Z',
          eventTimeZoneOffset: '-05:00',
          action: 'OBSERVE',
          bizStep: 'urn:epcglobal:cbv:bizstep:shipping',
          disposition: 'urn:epcglobal:cbv:disp:in_transit',
          readPoint: 'urn:epc:id:sgln:0614141.12345.0',
          bizLocation: 'urn:epc:id:sgln:0614141.12345.1',
          eventID: 'evt-001',
          parentID: 'urn:epc:id:sscc:0614141.0000000001'
        }
      ];

      renderEventInspector(events);

      const fields = document.querySelectorAll('.event-field');
      const labels = Array.from(fields).map(f =>
        f.querySelector('.event-field-label').textContent
      );

      expect(labels).toContain('Event Time:');
      expect(labels).toContain('Time Zone:');
      expect(labels).toContain('Action:');
      expect(labels).toContain('Business Step:');
      expect(labels).toContain('Disposition:');
      expect(labels).toContain('Read Point:');
      expect(labels).toContain('Business Location:');
      expect(labels).toContain('Event ID:');
      expect(labels).toContain('Parent ID:');
    });

    it('should omit EPC list when event has no epcList', () => {
      const events = [
        {
          eventType: 'ObjectEvent',
          eventTime: '2024-01-01T00:00:00Z',
          action: 'ADD',
          epcList: null
        }
      ];

      renderEventInspector(events);

      const fields = document.querySelectorAll('.event-field');
      const labels = Array.from(fields).map(f =>
        f.querySelector('.event-field-label').textContent
      );

      expect(labels).not.toContain('EPCs:');
    });

    it('should show EPC list when event has non-empty epcList', () => {
      const events = [
        {
          eventType: 'ObjectEvent',
          eventTime: '2024-01-01T00:00:00Z',
          action: 'ADD',
          epcList: ['urn:epc:id:sgtin:0614141.012345.001']
        }
      ];

      renderEventInspector(events);

      const fields = document.querySelectorAll('.event-field');
      const labels = Array.from(fields).map(f =>
        f.querySelector('.event-field-label').textContent
      );

      expect(labels).toContain('EPCs:');
    });
  });
});
