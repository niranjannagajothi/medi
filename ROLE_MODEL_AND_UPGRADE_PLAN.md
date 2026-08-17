# AURA Intelligence — Role Model & Upgrade Plan

This document records the role model now implemented in the platform and the
remaining roadmap to turn AURA from a monitoring dashboard into a hospital
reliability operations system.

## 1. Why every user felt the same before

- The client granted access to every page for every signed-in user, so the
  navigation, landing page and actions were identical across roles.
- Roles existed in the database but were only checked on a handful of
  endpoints; there was no single permission model.
- Accounts were generic (`admin`, `biomed`, `operator`, `auditor`) with no
  person behind them, so the product read as a demo, not as a hospital tool.
- Alerts could be acknowledged but had no owner, due time or closure record,
  so nothing was accountable to a named member of staff.

## 2. Role model (implemented)

| Role | Mission | Landing page | Key permissions |
|---|---|---|---|
| Hospital Admin | Run the hospital programme: staff, connectors, policy | Monitoring dashboard | `user:manage`, `connector:manage`, `dataset:manage`, `audit:view`, `replay:control` |
| Biomedical Engineer | Own critical alerts, diagnose root cause, close maintenance | Alert queue | `alert:assign`, `alert:acknowledge`, `alert:resolve`, `device:diagnose`, `model:retrain`, `model:explain` |
| Department Operator | Watch the department's devices and raise issues | Monitoring dashboard | `alert:acknowledge`, department-scoped `fleet:view` / `device:view` |
| Reliability Manager | Cross-department risk, SLA breaches, escalations | Risk heatmap | `alert:assign`, `alert:escalate`, `report:view`, `audit:view` |
| Auditor | Read-only compliance oversight | Audit trail | view-only permissions; every write returns 403 |

The matrix lives in `backend/services/permissions.py` and is the single source
of truth for both server-side enforcement (`PermissionChecker` dependency) and
the client (pages, KPIs and primary actions are returned by
`/api/v1/auth/me` and `/api/v1/workspace/summary`).

## 3. Named staff accounts

Seeded in `backend/database.py`; the password comes from `AURA_SEED_PASSWORD`
(defaults to the local demo value, never a committed production secret).

| Username | Name | Role | Department |
|---|---|---|---|
| `a.raman` | Dr. Anitha Raman | Hospital Admin | — |
| `k.mehta` | Karthik Mehta | Biomedical Engineer | ICU |
| `s.iyer` | Sneha Iyer | Biomedical Engineer | Radiology |
| `r.thomas` | Reena Thomas | Department Operator | ICU |
| `m.abdullah` | Mohammed Abdullah | Department Operator | Clinical Laboratory |
| `p.varghese` | Priya Varghese | Reliability Manager | Hospital-wide |
| `d.fernandes` | Daniel Fernandes | Auditor | Quality & Safety |
| `j.walker` | Julia Walker | Hospital Admin | St. Jude (tenant isolation demo) |

Legacy generic logins are kept so existing integrations and tests continue to
work. Admins can create, suspend and reactivate staff from **Team & Access**.

## 4. Alert accountability (implemented)

Alerts now carry `owner_username`, `owner_name`, `assigned_at`, `due_by`,
`escalation_level`, `resolution_note`, `downtime_minutes` and `closed_at`,
served by:

- `POST /api/v1/live/alerts/{id}/assign` — owner + SLA due time
- `POST /api/v1/live/alerts/{id}/escalate`
- `POST /api/v1/live/alerts/{id}/resolve` — resolution note + downtime
- `GET /api/v1/live/assignable-users`

## 5. Security and portability hardening

- CORS origins configurable through `AURA_ALLOWED_ORIGINS`.
- Ingest key configurable through `AURA_INGEST_API_KEY`.
- Login throttling and inactive-account rejection.
- Windows-only absolute paths replaced with `backend/paths.py`, overridable per
  location through `AURA_*` environment variables; the Windows-only rolldown
  binding was removed from the frontend dependencies so the UI builds on Linux
  and macOS as well.

## 6. Remaining roadmap

1. Complete the eight-state alert lifecycle (New → Acknowledged → Assigned →
   In Progress → Mitigated → Verified → Closed → Reopened) plus `priority`,
   `parts_used`, `verification_by`.
2. Model card page: training window, features, metrics, limitations, bias notes.
3. Prediction trust panel: top three risk factors, confidence band,
   recommended action and rationale.
4. Drift monitoring: feature drift, calibration and false-positive trends.
5. Human feedback after maintenance feeding retraining metadata.
6. Executive reliability cockpit: fleet health score, critical devices,
   predicted failures in 7 days, avoided downtime, riskiest departments, open
   SLA breaches.
7. Governance: audit hash chain, refresh tokens, rotating ingest secrets,
   encrypted configuration values.
