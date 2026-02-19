---
name: foodlens-observability-otel-sentry
description: Use when implementing observability in FoodLens with request tracing, metrics, and error reporting via OpenTelemetry and Sentry for backend and mobile paths.
---

# FoodLens Observability OTel Sentry

Use this skill for runtime visibility and incident triage.

## Scope
- `request_id` trace continuity.
- Error capture, latency metrics, and alert labels.

## Workflow
1. Review Phase 4 logging requirements.
2. Instrument critical routes with trace/span and latency tags.
3. Normalize error taxonomy and Sentry context fields.
4. Validate dashboards/alerts with failure rehearsal.

## DoD
- Key flows are traceable end-to-end.
- Errors include actionable context for triage.
