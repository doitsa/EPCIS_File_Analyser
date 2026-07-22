---
inclusion: auto
---

# EPCIS Analyzer Validation Guardrails

## Mandatory Reference Documents

The following documents are the authoritative sources for all validation rules in the EPCIS File Analyzer. They must be consulted before determining whether something is valid, invalid, missing, inconsistent, or informational:

1. **#[[file:Applying-GS1-System-of-Standards-for-DSCSA-and-Serialized-Interoperable-Traceability-R13.pdf]]** — Latest DSCSA interoperability guidance
2. **#[[file:EPCIS_Guideline.pdf]]** — GS1 EPCIS implementation standard
3. **#[[file:Guideline-Implementation-Guideline-Applying-GS1-Standards-for-DSCSA-and-Traceability-R12.pdf]]** — DSCSA traceability implementation guide

## Core Validation Principles

- Do NOT create validation rules based only on assumptions or generic XML behavior
- ALL validations must be supported by the uploaded guidance documents
- Always identify which document and rule supports a validation finding
- Do NOT flag an item as an error when the guidance explicitly allows it
- Distinguish between: required fields, conditional fields, recommended fields, and optional fields
- Consider EPCIS version, event type, action, business step, disposition, identifier type, packaging level, and business context before generating an issue
- When no clear rule exists in the reference documents, mark as "Review Recommended" and explain the gap

## Identifier-Specific Rules

### SSCCs (Serial Shipping Container Codes)
- SSCCs are logistics identifiers, NOT product serial numbers
- Do NOT count SSCCs as serial numbers or include in Unique Serials count
- Do NOT expect lot numbers, expiration dates, or ILMD for SSCCs
- Do NOT generate missing ILMD/lot/expiration validation findings for SSCCs
- Do NOT apply product-level rules to SSCCs
- Shipping via ObjectEvent for SSCC-only events is normal practice

### GLNs / SGLNs
- Do NOT apply product-level rules to location identifiers
- Display as readable GLN format (not full URN) with tooltip for full value

### NDC (National Drug Code)
- Do NOT treat repeated NDCs as errors when they relate to different GTINs or packaging levels
- An NDC may appear in more than one vocabulary entry for different packaging levels (unit, case, shipper)
- Only flag when: same NDC + same GTIN (exact duplicate), or same GTIN with conflicting data

## Aggregation Rules

- Units in cases = children of AggregationEvents where parent is SGTIN (indicator 1-8)
- Loose in SSCC = children of AggregationEvents where parent is SSCC but NOT also in a case
- Completely unaggregated = not in any AggregationEvent at all
- A case-level GTIN (indicator 1-8) can be the smallest sellable unit — flag as Warning, not Error

## Null/Empty Value Handling

- Treat "null", "NULL", empty strings, or placeholder values as missing or incorrect information
- Mark as Attention/Warning level, not Critical
- This applies even when XML structure is technically valid

## Event Sequence Rules

- Events of the same type should appear in chronological order in the document
- The valid lifecycle sequence is: commissioning → packing → shipping → receiving → decommissioning
- Document-level ordering violations are flagged as Warning

## Custom Project Rules (Preserve Always)

All custom validation rules and business logic defined throughout this project complement the GS1 standards:
- Do not remove, weaken, or ignore any explicitly requested validation rule unless it directly conflicts with GS1/DSCSA guidance
- When both official guidance and custom rules can coexist, apply both
- If a conflict is detected, clearly identify and explain it rather than silently changing behavior
- New validations must not inadvertently disable or regress existing custom rules

## Issue Reporting Requirements

For every reported issue, include:
1. A clear, readable description in plain business language
2. The affected serial, GTIN, case, SSCC, product, event, sender, receiver, or location
3. Why the information is considered incorrect
4. The applicable GS1 or DSCSA guidance reference
5. The suggested correction
6. The exact XML location when available
7. Severity: Critical, Warning, or Info (with "Review Recommended" when guidance is unclear)

## Conflict Resolution

- When documents provide different guidance, use the newest applicable version
- Mention the conflict in validation details
- GS1 documents = authoritative reference for compliance
- Custom rules = additional guardrails and best-practice validations
