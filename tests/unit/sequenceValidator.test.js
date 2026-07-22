import { describe, it, expect } from 'vitest';
import { validateSequences } from '../../sequenceValidator.js';

/**
 * Helper to create a minimal parsed document with events.
 */
function createDoc(events) {
  return { header: null, sbdh: null, masterData: {}, events, parseErrors: [] };
}

/**
 * Helper to create a minimal event.
 */
function createEvent(overrides = {}) {
  return {
    eventType: 'ObjectEvent',
    eventTime: '2024-01-15T08:00:00.000Z',
    eventTimeZoneOffset: '-05:00',
    action: 'ADD',
    bizStep: null,
    disposition: null,
    readPoint: null,
    bizLocation: null,
    epcList: [],
    parentID: null,
    childEPCs: [],
    quantityList: [],
    sourceList: [],
    destinationList: [],
    ilmd: null,
    bizTransactionList: [],
    eventID: null,
    xmlPath: 'EPCISBody/EventList/ObjectEvent[1]',
    ...overrides,
  };
}

describe('sequenceValidator', () => {
  describe('validateSequences', () => {
    it('returns empty array for null/empty document', () => {
      expect(validateSequences(null)).toEqual([]);
      expect(validateSequences({ events: [] })).toEqual([]);
      expect(validateSequences({ events: null })).toEqual([]);
    });

    it('returns empty array for valid sequence', () => {
      const doc = createDoc([
        createEvent({
          epcList: ['urn:epc:id:sgtin:0383745.038009.100001'],
          action: 'ADD',
          bizStep: 'urn:epcglobal:cbv:bizstep:commissioning',
          eventTime: '2024-01-15T08:00:00.000Z',
          xmlPath: 'EPCISBody/EventList/ObjectEvent[1]',
        }),
        createEvent({
          epcList: ['urn:epc:id:sgtin:0383745.038009.100001'],
          action: 'OBSERVE',
          bizStep: 'urn:epcglobal:cbv:bizstep:shipping',
          eventTime: '2024-01-15T10:00:00.000Z',
          xmlPath: 'EPCISBody/EventList/ObjectEvent[2]',
        }),
        createEvent({
          epcList: ['urn:epc:id:sgtin:0383745.038009.100001'],
          action: 'OBSERVE',
          bizStep: 'urn:epcglobal:cbv:bizstep:receiving',
          eventTime: '2024-01-15T12:00:00.000Z',
          xmlPath: 'EPCISBody/EventList/ObjectEvent[3]',
        }),
      ]);

      const issues = validateSequences(doc);
      expect(issues).toEqual([]);
    });

    it('detects business step sequence violation', () => {
      const doc = createDoc([
        createEvent({
          epcList: ['urn:epc:id:sgtin:0383745.038009.100001'],
          action: 'OBSERVE',
          bizStep: 'urn:epcglobal:cbv:bizstep:shipping',
          eventTime: '2024-01-15T08:00:00.000Z',
          xmlPath: 'EPCISBody/EventList/ObjectEvent[1]',
        }),
        createEvent({
          epcList: ['urn:epc:id:sgtin:0383745.038009.100001'],
          action: 'ADD',
          bizStep: 'urn:epcglobal:cbv:bizstep:commissioning',
          eventTime: '2024-01-15T10:00:00.000Z',
          xmlPath: 'EPCISBody/EventList/ObjectEvent[2]',
        }),
      ]);

      const issues = validateSequences(doc);
      expect(issues.length).toBeGreaterThan(0);
      const seqIssue = issues.find(i => i.title === 'Business step sequence violation');
      expect(seqIssue).toBeDefined();
      expect(seqIssue.severity).toBe('Warning');
      expect(seqIssue.category).toBe('Sequence');
      expect(seqIssue.affectedItem).toBe('urn:epc:id:sgtin:0383745.038009.100001');
    });

    it('detects DELETE without prior ADD/OBSERVE', () => {
      const doc = createDoc([
        createEvent({
          epcList: ['urn:epc:id:sgtin:0383745.038009.100001'],
          action: 'DELETE',
          bizStep: 'urn:epcglobal:cbv:bizstep:decommissioning',
          eventTime: '2024-01-15T08:00:00.000Z',
          xmlPath: 'EPCISBody/EventList/ObjectEvent[1]',
        }),
      ]);

      const issues = validateSequences(doc);
      const deleteIssue = issues.find(i => i.title === 'DELETE without prior ADD/OBSERVE');
      expect(deleteIssue).toBeDefined();
      expect(deleteIssue.severity).toBe('Warning');
      expect(deleteIssue.category).toBe('Sequence');
    });

    it('does not flag DELETE when preceded by ADD', () => {
      const doc = createDoc([
        createEvent({
          epcList: ['urn:epc:id:sgtin:0383745.038009.100001'],
          action: 'ADD',
          bizStep: 'urn:epcglobal:cbv:bizstep:commissioning',
          eventTime: '2024-01-15T08:00:00.000Z',
          xmlPath: 'EPCISBody/EventList/ObjectEvent[1]',
        }),
        createEvent({
          epcList: ['urn:epc:id:sgtin:0383745.038009.100001'],
          action: 'DELETE',
          bizStep: 'urn:epcglobal:cbv:bizstep:decommissioning',
          eventTime: '2024-01-15T10:00:00.000Z',
          xmlPath: 'EPCISBody/EventList/ObjectEvent[2]',
        }),
      ]);

      const issues = validateSequences(doc);
      const deleteIssue = issues.find(i => i.title === 'DELETE without prior ADD/OBSERVE');
      expect(deleteIssue).toBeUndefined();
    });

    it('detects shipping before commissioning', () => {
      const doc = createDoc([
        createEvent({
          epcList: ['urn:epc:id:sgtin:0383745.038009.100001'],
          action: 'OBSERVE',
          bizStep: 'urn:epcglobal:cbv:bizstep:shipping',
          eventTime: '2024-01-15T08:00:00.000Z',
          xmlPath: 'EPCISBody/EventList/ObjectEvent[1]',
        }),
        createEvent({
          epcList: ['urn:epc:id:sgtin:0383745.038009.100001'],
          action: 'ADD',
          bizStep: 'urn:epcglobal:cbv:bizstep:commissioning',
          eventTime: '2024-01-15T10:00:00.000Z',
          xmlPath: 'EPCISBody/EventList/ObjectEvent[2]',
        }),
      ]);

      const issues = validateSequences(doc);
      const shippingIssue = issues.find(i => i.title === 'Shipping before commissioning');
      expect(shippingIssue).toBeDefined();
      expect(shippingIssue.severity).toBe('Warning');
      expect(shippingIssue.category).toBe('Sequence');
    });

    it('detects receiving before shipping', () => {
      const doc = createDoc([
        createEvent({
          epcList: ['urn:epc:id:sgtin:0383745.038009.100001'],
          action: 'ADD',
          bizStep: 'urn:epcglobal:cbv:bizstep:commissioning',
          eventTime: '2024-01-15T08:00:00.000Z',
          xmlPath: 'EPCISBody/EventList/ObjectEvent[1]',
        }),
        createEvent({
          epcList: ['urn:epc:id:sgtin:0383745.038009.100001'],
          action: 'OBSERVE',
          bizStep: 'urn:epcglobal:cbv:bizstep:receiving',
          eventTime: '2024-01-15T10:00:00.000Z',
          xmlPath: 'EPCISBody/EventList/ObjectEvent[2]',
        }),
      ]);

      const issues = validateSequences(doc);
      const recvIssue = issues.find(i => i.title === 'Receiving before shipping');
      expect(recvIssue).toBeDefined();
      expect(recvIssue.severity).toBe('Warning');
      expect(recvIssue.category).toBe('Sequence');
    });

    it('does not flag receiving when shipping occurred first', () => {
      const doc = createDoc([
        createEvent({
          epcList: ['urn:epc:id:sgtin:0383745.038009.100001'],
          action: 'ADD',
          bizStep: 'urn:epcglobal:cbv:bizstep:commissioning',
          eventTime: '2024-01-15T08:00:00.000Z',
          xmlPath: 'EPCISBody/EventList/ObjectEvent[1]',
        }),
        createEvent({
          epcList: ['urn:epc:id:sgtin:0383745.038009.100001'],
          action: 'OBSERVE',
          bizStep: 'urn:epcglobal:cbv:bizstep:shipping',
          eventTime: '2024-01-15T10:00:00.000Z',
          xmlPath: 'EPCISBody/EventList/ObjectEvent[2]',
        }),
        createEvent({
          epcList: ['urn:epc:id:sgtin:0383745.038009.100001'],
          action: 'OBSERVE',
          bizStep: 'urn:epcglobal:cbv:bizstep:receiving',
          eventTime: '2024-01-15T12:00:00.000Z',
          xmlPath: 'EPCISBody/EventList/ObjectEvent[3]',
        }),
      ]);

      const issues = validateSequences(doc);
      const recvIssue = issues.find(i => i.title === 'Receiving before shipping');
      expect(recvIssue).toBeUndefined();
    });

    it('issue object has correct structure', () => {
      const doc = createDoc([
        createEvent({
          epcList: ['urn:epc:id:sgtin:0383745.038009.100001'],
          action: 'DELETE',
          eventTime: '2024-01-15T08:00:00.000Z',
          xmlPath: 'EPCISBody/EventList/ObjectEvent[1]',
        }),
      ]);

      const issues = validateSequences(doc);
      expect(issues.length).toBeGreaterThan(0);
      const issue = issues[0];
      expect(issue).toHaveProperty('severity');
      expect(issue).toHaveProperty('title');
      expect(issue).toHaveProperty('description');
      expect(issue).toHaveProperty('affectedItem');
      expect(issue).toHaveProperty('eventTime');
      expect(issue).toHaveProperty('xmlPath');
      expect(issue).toHaveProperty('suggestedCorrection');
      expect(issue).toHaveProperty('category');
      expect(issue.title.length).toBeLessThanOrEqual(120);
      expect(issue.description.length).toBeLessThanOrEqual(500);
    });

    it('handles EPCs from childEPCs and parentID', () => {
      const doc = createDoc([
        createEvent({
          eventType: 'AggregationEvent',
          parentID: 'urn:epc:id:sscc:0383745.0000000001',
          childEPCs: ['urn:epc:id:sgtin:0383745.038009.100001'],
          action: 'DELETE',
          eventTime: '2024-01-15T08:00:00.000Z',
          xmlPath: 'EPCISBody/EventList/AggregationEvent[1]',
        }),
      ]);

      const issues = validateSequences(doc);
      // Both the parent and child should trigger DELETE without ADD/OBSERVE
      const deleteIssues = issues.filter(i => i.title === 'DELETE without prior ADD/OBSERVE');
      expect(deleteIssues.length).toBe(2);
    });

    it('validates full lifecycle without issues', () => {
      const epc = 'urn:epc:id:sgtin:0383745.038009.100001';
      const doc = createDoc([
        createEvent({
          epcList: [epc],
          action: 'ADD',
          bizStep: 'urn:epcglobal:cbv:bizstep:commissioning',
          eventTime: '2024-01-15T08:00:00.000Z',
          xmlPath: 'EPCISBody/EventList/ObjectEvent[1]',
        }),
        createEvent({
          eventType: 'AggregationEvent',
          childEPCs: [epc],
          parentID: 'urn:epc:id:sscc:0383745.0000000001',
          action: 'ADD',
          bizStep: 'urn:epcglobal:cbv:bizstep:packing',
          eventTime: '2024-01-15T09:00:00.000Z',
          xmlPath: 'EPCISBody/EventList/AggregationEvent[1]',
        }),
        createEvent({
          epcList: [epc],
          action: 'OBSERVE',
          bizStep: 'urn:epcglobal:cbv:bizstep:shipping',
          eventTime: '2024-01-15T14:00:00.000Z',
          xmlPath: 'EPCISBody/EventList/ObjectEvent[2]',
        }),
        createEvent({
          epcList: [epc],
          action: 'OBSERVE',
          bizStep: 'urn:epcglobal:cbv:bizstep:receiving',
          eventTime: '2024-01-16T08:00:00.000Z',
          xmlPath: 'EPCISBody/EventList/ObjectEvent[3]',
        }),
        createEvent({
          epcList: [epc],
          action: 'DELETE',
          bizStep: 'urn:epcglobal:cbv:bizstep:decommissioning',
          eventTime: '2024-01-20T08:00:00.000Z',
          xmlPath: 'EPCISBody/EventList/ObjectEvent[4]',
        }),
      ]);

      const issues = validateSequences(doc);
      // Filter to only issues for this specific EPC
      const epcIssues = issues.filter(i => i.affectedItem === epc);
      expect(epcIssues).toEqual([]);
    });
  });
});
