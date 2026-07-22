/**
 * Issue Detector Module
 * Classifies, normalizes, deduplicates, and sorts issues from all validators.
 */

const VALID_SEVERITIES = ['Critical', 'Warning', 'Info'];
const SEVERITY_ORDER = { Critical: 0, Warning: 1, Info: 2 };

const CRITICAL_TITLE_PATTERNS = [
  /malformed xml/i,
  /EPCISBody/,
  /EventList not found/,
];

/**
 * Classifies and aggregates raw issues from validators.
 * - Normalizes fields (truncation, defaults)
 * - Escalates severity based on category and title patterns
 * - Removes exact duplicates (same title + affectedItem + xmlPath)
 * - Sorts: Critical first, then Warning, then Info
 *
 * @param {Array} rawIssues - Array of raw issue objects from validators
 * @returns {Array} Cleaned, classified, sorted array of Issue objects
 */
export function classifyAndAggregate(rawIssues) {
  if (!Array.isArray(rawIssues)) {
    return [];
  }

  const normalized = rawIssues.map(normalizeIssue);
  const escalated = normalized.map(applySeverityEscalation);
  const deduplicated = removeDuplicates(escalated);
  const sorted = deduplicated.sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
  );

  return sorted;
}

/**
 * Normalizes a single issue's fields.
 */
function normalizeIssue(raw) {
  const severity = VALID_SEVERITIES.includes(raw.severity)
    ? raw.severity
    : 'Warning';

  const title = truncate(String(raw.title || ''), 120);
  const description = truncate(String(raw.description || ''), 500);
  const affectedItem =
    raw.affectedItem && String(raw.affectedItem).trim()
      ? String(raw.affectedItem)
      : 'N/A';
  const eventTime = raw.eventTime || null;
  const xmlPath = raw.xmlPath != null ? String(raw.xmlPath) : '';
  const suggestedCorrection =
    raw.suggestedCorrection != null ? String(raw.suggestedCorrection) : '';
  const category =
    raw.category && String(raw.category).trim()
      ? String(raw.category)
      : 'General';

  return {
    severity,
    title,
    description,
    affectedItem,
    eventTime,
    xmlPath,
    suggestedCorrection,
    category,
  };
}

/**
 * Applies severity escalation rules.
 * - DSCSA Compliance category → Critical
 * - Title matching critical patterns → Critical
 */
function applySeverityEscalation(issue) {
  let severity = issue.severity;

  // DSCSA Compliance category always escalates to Critical
  if (issue.category === 'DSCSA Compliance') {
    severity = 'Critical';
  }

  // Critical title patterns escalate to Critical
  for (const pattern of CRITICAL_TITLE_PATTERNS) {
    if (pattern.test(issue.title)) {
      severity = 'Critical';
      break;
    }
  }

  return { ...issue, severity };
}

/**
 * Removes exact duplicates based on title + affectedItem + xmlPath.
 */
function removeDuplicates(issues) {
  const seen = new Set();
  return issues.filter((issue) => {
    const key = `${issue.title}|${issue.affectedItem}|${issue.xmlPath}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

/**
 * Truncates a string to the specified max length.
 */
function truncate(str, maxLength) {
  if (str.length <= maxLength) {
    return str;
  }
  return str.slice(0, maxLength);
}
