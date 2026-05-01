# Saar Assurance Pipeline

Saar optimizes for:

```text
Expectation Match x Visual Quality x Revision Speed x Cost Efficiency
```

The system does not try to guarantee a perfect first generation. It reduces mismatch by validating production instructions before final rendering.

## 7 Layers

1. Desire extraction
2. Expectation alignment
3. Visual preview validation
4. Controlled generation
5. Quality verification
6. Revision precision
7. Learning memory

## Desire Extraction

Endpoint:

```text
POST /api/assurance/intake
```

Creates an `assurance_plans` row with:

- structured intake
- expectation summary
- three concept options
- confidence/risk score

## Expectation Alignment

Endpoint:

```text
POST /api/assurance/{plan_id}/confirm
```

The user confirms or edits what the system understood. Jobs created from an assurance plan are blocked until the plan is confirmed.

## Controlled Generation

Endpoint:

```text
POST /api/assurance/{plan_id}/jobs
```

The confirmed plan is merged into the generation packet:

- platform
- audience
- style
- location
- lighting
- camera motion
- subject lock
- duration

## Quality Verification

Endpoint:

```text
POST /api/jobs/{job_id}/quality-report
```

Creates a `quality_reports` row with technical and commercial checks.

## Revision Precision

Endpoint:

```text
POST /api/revisions
```

Revision requests are structured by:

- frame/time
- region
- motion
- style
- colour
- subject
- background

## Learning Memory

Endpoint:

```text
POST /api/feedback
```

Approved patterns become style memory. Rejected patterns become failure memory.

This closes the loop:

```text
desire -> confirmed plan -> generated output -> QA -> revision/feedback -> memory
```

