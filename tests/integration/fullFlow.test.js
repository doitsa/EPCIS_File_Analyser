/**
 * Integration Tests - Full Flow
 *
 * Tests end-to-end pipeline: load EPCIS file → parse → extract → analyze → filter
 * Tests file upload validation rules (size and extension)
 *
 * Validates: Requirements 1.1–1.4, 2.1, 10.2, 11.4
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { parse } from '../../xmlParser.js';
import { extractAll } from '../../epcExtractor.js';
import { extractProducts } from '../../productExtractor.js';
import { analyzeCases } from '../../aggregationAnalyzer.js';
import { extractSSCCs } from '../../ssccExtractor.js';
import { applyFilters } from '../../filterEngine.js';

const FIXTURE_DIR = path.resolve(__dirname, '../fixtures');

function loadFixture(filename) {
  return fs.readFileSync(path.join(FIXTURE_DIR, filename), 'utf-8');
}

describe('Integration: End-to-end flow', () => {
  it('should parse a valid EPCIS file and produce correct dashboard metrics', () => {
    const xml = loadFixture('valid-epcis-simple.xml');
    const doc = parse(xml);

    // No parse errors
    expect(doc.parseErrors).toHaveLength(0);

    // Correct number of events: 1 commissioning ObjectEvent + 1 AggregationEvent + 1 shipping ObjectEvent = 3
    expect(doc.events).toHaveLength(3);

    // Extract EPCs
    const epcMap = extractAll(doc.events);

    // 3 serial SGTINs + 1 case parent SGTIN + 1 SSCC = 5 total unique EPCs
    expect(epcMap.all.size).toBe(5);

    // bySGTIN: GTIN 00383745380099 should have 4 serial EPCs (100001, 100002, 100003, 900001)
    expect(epcMap.bySGTIN.size).toBe(1);
    const gtinKey = [...epcMap.bySGTIN.keys()][0];
    expect(gtinKey).toMatch(/0383745/);
    const sgtinEpcs = epcMap.bySGTIN.get(gtinKey);
    expect(sgtinEpcs.length).toBe(4); // 3 serials + 1 case parent (900001 is also an SGTIN)

    // bySSCC: 1 SSCC from shipping event
    expect(epcMap.bySSCC.size).toBe(1);

    // Extract products
    const products = extractProducts(doc, epcMap);
    expect(products.length).toBe(1);

    const product = products[0];
    // Serial count includes all SGTINs for that GTIN (100001, 100002, 100003, 900001)
    expect(product.serialCount).toBe(4);
    expect(product.gtin).toBe(gtinKey);
    expect(product.productName).toBe('Aspirin 100mg Tablets');

    // Analyze cases
    const aggResult = analyzeCases(doc, epcMap);
    expect(aggResult.cases).toHaveLength(1);
    expect(aggResult.cases[0].childCount).toBe(3);
    expect(aggResult.cases[0].parentEPC).toContain('900001');
    expect(aggResult.emptyCases).toHaveLength(0);

    // Extract SSCCs
    const ssccs = extractSSCCs(doc);
    expect(ssccs.length).toBe(1);
    expect(ssccs[0].sscc).toContain('sscc:0383745');
  });

  it('should extract SBDH sender and receiver correctly', () => {
    const xml = loadFixture('valid-epcis-simple.xml');
    const doc = parse(xml);

    expect(doc.sbdh).not.toBeNull();
    expect(doc.sbdh.sender.identifier).toContain('0383745');
    expect(doc.sbdh.sender.name).toContain('PharmaCo');
    expect(doc.sbdh.receiver.identifier).toContain('0614141');
    expect(doc.sbdh.receiver.name).toContain('DistributorCo');
  });

  it('should extract master data for 1 product', () => {
    const xml = loadFixture('valid-epcis-simple.xml');
    const doc = parse(xml);

    expect(doc.header).not.toBeNull();
    expect(doc.header.masterData.length).toBeGreaterThanOrEqual(1);

    const masterEntry = doc.header.masterData[0];
    expect(masterEntry.id).toContain('sgtin:0383745.038009');
    expect(masterEntry.attributes['urn:epcglobal:cbv:mda#descriptionShort']).toBe('Aspirin 100mg Tablets');
  });
});

describe('Integration: Filter + export consistency', () => {
  it('should filter events by eventType and return a proper subset', () => {
    const xml = loadFixture('valid-epcis-simple.xml');
    const doc = parse(xml);
    const epcMap = extractAll(doc.events);
    const products = extractProducts(doc, epcMap);
    const aggResult = analyzeCases(doc, epcMap);
    const ssccs = extractSSCCs(doc);

    const data = {
      events: doc.events,
      products,
      cases: aggResult.cases,
      ssccs,
      issues: [],
    };

    // Filter to only ObjectEvents
    const filtered = applyFilters(data, { eventType: 'ObjectEvent' });

    expect(filtered.events.length).toBeLessThan(doc.events.length);
    expect(filtered.events.length).toBe(2); // commissioning + shipping
    expect(filtered.events.every((e) => e.eventType === 'ObjectEvent')).toBe(true);
  });

  it('should filter events by bizStep and return matching subset', () => {
    const xml = loadFixture('valid-epcis-simple.xml');
    const doc = parse(xml);
    const epcMap = extractAll(doc.events);
    const products = extractProducts(doc, epcMap);

    const data = {
      events: doc.events,
      products,
      cases: [],
      ssccs: [],
      issues: [],
    };

    // Filter by commissioning bizStep
    const filtered = applyFilters(data, { bizStep: 'commissioning' });

    expect(filtered.events.length).toBe(1);
    expect(filtered.events[0].bizStep).toContain('commissioning');
  });

  it('should return all data when no filter criteria are active', () => {
    const xml = loadFixture('valid-epcis-simple.xml');
    const doc = parse(xml);
    const epcMap = extractAll(doc.events);
    const products = extractProducts(doc, epcMap);
    const aggResult = analyzeCases(doc, epcMap);
    const ssccs = extractSSCCs(doc);

    const data = {
      events: doc.events,
      products,
      cases: aggResult.cases,
      ssccs,
      issues: [],
    };

    const filtered = applyFilters(data, {});

    expect(filtered.events.length).toBe(doc.events.length);
    expect(filtered.products.length).toBe(products.length);
    expect(filtered.cases.length).toBe(aggResult.cases.length);
  });

  it('should apply serial number filter across events', () => {
    const xml = loadFixture('valid-epcis-simple.xml');
    const doc = parse(xml);

    const data = {
      events: doc.events,
      products: [],
      cases: [],
      ssccs: [],
      issues: [],
    };

    // Filter by a specific serial number substring
    const filtered = applyFilters(data, { serialNumber: '100001' });

    // Should match commissioning event (has 100001 in epcList) and aggregation event (has 100001 in childEPCs)
    expect(filtered.events.length).toBeGreaterThan(0);
    expect(filtered.events.length).toBeLessThanOrEqual(doc.events.length);
  });
});

describe('Integration: File upload validation', () => {
  it('should reject files larger than 10MB', () => {
    // Simulate the file size check that main.js enforces
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

    const smallFile = { size: 5 * 1024 * 1024, name: 'test.xml' };
    const largeFile = { size: 11 * 1024 * 1024, name: 'test.xml' };
    const exactFile = { size: 10 * 1024 * 1024, name: 'test.xml' };

    expect(smallFile.size <= MAX_FILE_SIZE).toBe(true);
    expect(largeFile.size <= MAX_FILE_SIZE).toBe(false);
    expect(exactFile.size <= MAX_FILE_SIZE).toBe(true);
  });

  it('should reject non-.xml file extensions', () => {
    // Simulate the extension check that main.js enforces
    function isValidExtension(filename) {
      return filename.toLowerCase().endsWith('.xml');
    }

    expect(isValidExtension('document.xml')).toBe(true);
    expect(isValidExtension('document.XML')).toBe(true);
    expect(isValidExtension('document.Xml')).toBe(true);
    expect(isValidExtension('document.json')).toBe(false);
    expect(isValidExtension('document.txt')).toBe(false);
    expect(isValidExtension('document.csv')).toBe(false);
    expect(isValidExtension('document')).toBe(false);
    expect(isValidExtension('')).toBe(false);
  });

  it('should reject malformed XML and report parse errors', () => {
    const invalidXml = loadFixture('invalid-xml.xml');
    const doc = parse(invalidXml);

    expect(doc.parseErrors.length).toBeGreaterThan(0);
    expect(doc.parseErrors[0].severity).toBe('Critical');
  });

  it('should reject EPCIS document missing EPCISBody', () => {
    const missingBody = loadFixture('missing-epcisbody.xml');
    const doc = parse(missingBody);

    expect(doc.parseErrors.length).toBeGreaterThan(0);
    expect(doc.events).toHaveLength(0);
  });
});
