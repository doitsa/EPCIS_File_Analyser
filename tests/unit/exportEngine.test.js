import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { exportReport } from '../../exportEngine.js';

/**
 * Helper to build minimal AnalysisResults
 */
function buildData({
  events = [],
  products = [],
  aggregation = { cases: [], emptyCases: [], orphanedSerials: [] },
  ssccs = [],
  issues = [],
  metrics = {
    totalUniqueSerials: 0,
    totalCases: 0,
    totalProducts: 0,
    totalSSCCs: 0,
    eventCountByType: {},
    eventCountByAction: {},
    uniqueBizSteps: [],
    uniqueDispositions: [],
    uniqueReadPoints: [],
    uniqueBizLocations: [],
    allGTINs: [],
    allNDCs: [],
    lotsByProduct: {},
    expirationsByProduct: {},
    caseSerials: [],
    ssccIdentifiers: [],
    sender: null,
    receiver: null,
  },
} = {}) {
  return {
    document: { header: null, sbdh: null, masterData: {}, events, parseErrors: [] },
    epcMap: { all: new Map(), bySGTIN: new Map(), bySSCC: new Map(), bySerial: new Map() },
    products,
    aggregation,
    ssccs,
    issues,
    metrics,
  };
}

describe('exportEngine', () => {
  let mockXLSX;
  let createdUrls = [];
  let removedChildren = [];
  let clickedLinks = [];

  beforeEach(() => {
    // Mock SheetJS globally
    mockXLSX = {
      utils: {
        json_to_sheet: vi.fn((data) => ({ data, type: 'sheet' })),
        book_new: vi.fn(() => ({ SheetNames: [], Sheets: {} })),
        book_append_sheet: vi.fn((wb, ws, name) => {
          wb.SheetNames.push(name);
          wb.Sheets[name] = ws;
        }),
      },
      writeFile: vi.fn(),
    };
    globalThis.XLSX = mockXLSX;

    // Mock URL.createObjectURL and URL.revokeObjectURL
    createdUrls = [];
    globalThis.URL.createObjectURL = vi.fn((blob) => {
      const url = `blob:mock-${createdUrls.length}`;
      createdUrls.push({ url, blob });
      return url;
    });
    globalThis.URL.revokeObjectURL = vi.fn();

    // Track link clicks and appended/removed children
    removedChildren = [];
    clickedLinks = [];

    // Mock document.body.appendChild and removeChild
    vi.spyOn(document.body, 'appendChild').mockImplementation((el) => {
      if (el.click) {
        clickedLinks.push(el);
      }
    });
    vi.spyOn(document.body, 'removeChild').mockImplementation((el) => {
      removedChildren.push(el);
    });
  });

  afterEach(() => {
    delete globalThis.XLSX;
    vi.restoreAllMocks();
  });

  describe('no-data error handling', () => {
    it('should throw an error when data is null', () => {
      expect(() => exportReport('full-analysis', null, 'test.xml'))
        .toThrow('No data loaded');
    });

    it('should throw an error when data is undefined', () => {
      expect(() => exportReport('full-analysis', undefined, 'test.xml'))
        .toThrow('No data loaded');
    });
  });

  describe('SheetJS unavailable', () => {
    beforeEach(() => {
      delete globalThis.XLSX;
    });

    it('should throw an error for Excel exports when SheetJS is unavailable', () => {
      const data = buildData();
      expect(() => exportReport('full-analysis', data, 'test.xml'))
        .toThrow('SheetJS (XLSX) library is not available');
    });

    it('should allow JSON export when SheetJS is unavailable', () => {
      const data = buildData();
      expect(() => exportReport('json-full', data, 'test.xml')).not.toThrow();
    });
  });

  describe('filename format', () => {
    it('should use format {type}_{filenameWithoutExtension}.xlsx for Excel exports', () => {
      const data = buildData();
      exportReport('full-analysis', data, 'sample-epcis.xml');
      expect(mockXLSX.writeFile).toHaveBeenCalledWith(
        expect.any(Object),
        'full-analysis_sample-epcis.xlsx'
      );
    });

    it('should use format {type}_{filenameWithoutExtension}.json for JSON exports', () => {
      const data = buildData();
      exportReport('json-full', data, 'my-file.xml');
      expect(clickedLinks[0].download).toBe('json-full_my-file.json');
    });

    it('should handle filename without extension', () => {
      const data = buildData();
      exportReport('issues-only', data, 'noext');
      expect(mockXLSX.writeFile).toHaveBeenCalledWith(
        expect.any(Object),
        'issues-only_noext.xlsx'
      );
    });

    it('should handle empty original filename', () => {
      const data = buildData();
      exportReport('product-summary', data, '');
      expect(mockXLSX.writeFile).toHaveBeenCalledWith(
        expect.any(Object),
        'product-summary_export.xlsx'
      );
    });
  });

  describe('full-analysis report', () => {
    it('should create a workbook with 6 worksheets', () => {
      const data = buildData();
      exportReport('full-analysis', data, 'test.xml');

      const wb = mockXLSX.writeFile.mock.calls[0][0];
      expect(wb.SheetNames).toHaveLength(6);
      expect(wb.SheetNames).toEqual(['Dashboard', 'Events', 'Products', 'Cases', 'SSCCs', 'Issues']);
    });
  });

  describe('issues-only report', () => {
    it('should create a workbook with 1 worksheet named Issues', () => {
      const data = buildData({
        issues: [
          { severity: 'Warning', title: 'Test issue', description: 'desc', affectedItem: 'EPC1', eventTime: '', xmlPath: '', suggestedCorrection: '', category: 'format' },
        ],
      });
      exportReport('issues-only', data, 'test.xml');

      const wb = mockXLSX.writeFile.mock.calls[0][0];
      expect(wb.SheetNames).toHaveLength(1);
      expect(wb.SheetNames[0]).toBe('Issues');
    });
  });

  describe('product-summary report', () => {
    it('should create a workbook with 1 worksheet named Product Summary', () => {
      const data = buildData({
        products: [
          { sgtinPattern: 'urn:epc:id:sgtin:0383745.038009.*', gtin: '00383745380093', ndc: null, productName: 'Test', serialCount: 5, lotNumbers: ['LOT-1'], expirationDates: ['2026-01-01'], caseCount: 1, ssccCount: 1 },
        ],
      });
      exportReport('product-summary', data, 'test.xml');

      const wb = mockXLSX.writeFile.mock.calls[0][0];
      expect(wb.SheetNames).toHaveLength(1);
      expect(wb.SheetNames[0]).toBe('Product Summary');
    });
  });

  describe('case-aggregation report', () => {
    it('should create a workbook with 1 worksheet named Case Aggregation', () => {
      const data = buildData({
        aggregation: {
          cases: [{ parentEPC: 'urn:epc:id:sscc:0383745.0000000001', childEPCs: ['epc1'], childCount: 1, associatedGTIN: '00383745380093', aggregationStatus: 'Valid', childrenCommissioned: 'Yes', eventTime: '2024-01-01T00:00:00Z' }],
          emptyCases: [],
          orphanedSerials: [],
        },
      });
      exportReport('case-aggregation', data, 'test.xml');

      const wb = mockXLSX.writeFile.mock.calls[0][0];
      expect(wb.SheetNames).toHaveLength(1);
      expect(wb.SheetNames[0]).toBe('Case Aggregation');
    });
  });

  describe('json-full report', () => {
    it('should create a downloadable JSON blob with full analysis results', () => {
      const data = buildData({ issues: [{ severity: 'Info', title: 'Test' }] });
      exportReport('json-full', data, 'test.xml');

      expect(createdUrls).toHaveLength(1);
      expect(createdUrls[0].blob.type).toBe('application/json');
      expect(clickedLinks[0].download).toBe('json-full_test.json');
    });
  });

  describe('unknown report type', () => {
    it('should throw for unknown report type', () => {
      const data = buildData();
      expect(() => exportReport('invalid-type', data, 'test.xml'))
        .toThrow('Unknown report type: invalid-type');
    });
  });
});
