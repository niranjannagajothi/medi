"""Role model, permission matrix and role-specific workspace definitions.

A single source of truth shared by the API (server-side enforcement) and the
React client (navigation, landing page and call-to-action rendering, served
through `/api/v1/auth/me`).
"""

from typing import Dict, List

from fastapi import Depends, HTTPException

from backend.services.auth import get_current_user

HOSPITAL_ADMIN = "HOSPITAL_ADMIN"
BIOMEDICAL_ENGINEER = "BIOMEDICAL_ENGINEER"
DEPARTMENT_OPERATOR = "DEPARTMENT_OPERATOR"
RELIABILITY_MANAGER = "RELIABILITY_MANAGER"
AUDITOR = "AUDITOR"

ALL_ROLES = [
    HOSPITAL_ADMIN,
    BIOMEDICAL_ENGINEER,
    DEPARTMENT_OPERATOR,
    RELIABILITY_MANAGER,
    AUDITOR,
]

# Permission keys used by both the API dependencies and the client navigation.
ROLE_PERMISSIONS: Dict[str, List[str]] = {
    HOSPITAL_ADMIN: [
        "fleet:view",
        "alert:view",
        "device:view",
        "model:view",
        "knowledge:view",
        "knowledge:manage",
        "dataset:view",
        "dataset:manage",
        "connector:manage",
        "user:manage",
        "audit:view",
        "report:view",
        "replay:control",
    ],
    BIOMEDICAL_ENGINEER: [
        "fleet:view",
        "alert:view",
        "alert:assign",
        "alert:acknowledge",
        "alert:resolve",
        "device:view",
        "device:diagnose",
        "model:view",
        "model:retrain",
        "model:explain",
        "knowledge:view",
        "knowledge:manage",
        "dataset:view",
        "dataset:manage",
        "replay:control",
    ],
    DEPARTMENT_OPERATOR: [
        "fleet:view",
        "alert:view",
        "alert:acknowledge",
        "device:view",
        "knowledge:view",
    ],
    RELIABILITY_MANAGER: [
        "fleet:view",
        "alert:view",
        "alert:assign",
        "alert:escalate",
        "device:view",
        "model:view",
        "model:explain",
        "knowledge:view",
        "audit:view",
        "report:view",
    ],
    AUDITOR: [
        "fleet:view",
        "alert:view",
        "device:view",
        "model:view",
        "knowledge:view",
        "audit:view",
        "report:view",
    ],
}

# Client pages and the permission required to see them.
PAGE_PERMISSIONS: Dict[str, str] = {
    "dashboard": "fleet:view",
    "alerts": "alert:view",
    "explorer": "device:view",
    "twin": "device:view",
    "heatmap": "fleet:view",
    "prediction": "model:view",
    "advisor": "knowledge:view",
    "explainability": "model:explain",
    "hospital_connect": "connector:manage",
    "dataset_upload": "dataset:manage",
    "knowledge_base": "knowledge:view",
    "audit_logs": "audit:view",
    "team": "user:manage",
}

# Where each role lands after login and how their workspace is framed.
ROLE_WORKSPACE = {
    HOSPITAL_ADMIN: {
        "label": "Hospital Administrator",
        "landing_page": "team",
        "mission": "Govern access, connectors and hospital-wide reliability posture.",
        "kpis": ["fleet_health", "active_users", "connector_status", "audit_events_today"],
        "primary_actions": [
            {"label": "Invite a team member", "page": "team"},
            {"label": "Review audit trail", "page": "audit_logs"},
            {"label": "Check data connectors", "page": "hospital_connect"},
        ],
    },
    BIOMEDICAL_ENGINEER: {
        "label": "Biomedical Engineer",
        "landing_page": "alerts",
        "mission": "Own critical alerts, diagnose root cause and close maintenance.",
        "kpis": ["my_open_alerts", "critical_devices", "devices_due_maintenance", "model_version"],
        "primary_actions": [
            {"label": "Work the alert queue", "page": "alerts"},
            {"label": "Open digital twin", "page": "twin"},
            {"label": "Ask the maintenance advisor", "page": "advisor"},
        ],
    },
    DEPARTMENT_OPERATOR: {
        "label": "Department Operator",
        "landing_page": "dashboard",
        "mission": "Keep your department's equipment safe and report issues early.",
        "kpis": ["department_devices", "department_open_alerts", "department_health", "last_alert_at"],
        "primary_actions": [
            {"label": "Review department alerts", "page": "alerts"},
            {"label": "Look up a device", "page": "explorer"},
        ],
    },
    RELIABILITY_MANAGER: {
        "label": "Reliability Manager",
        "landing_page": "dashboard",
        "mission": "Cross-department risk ownership, SLA breaches and recurring failures.",
        "kpis": ["fleet_health", "predicted_failures_7d", "sla_breaches", "top_risk_department"],
        "primary_actions": [
            {"label": "Review risk heatmap", "page": "heatmap"},
            {"label": "Escalate open alerts", "page": "alerts"},
            {"label": "Inspect model behaviour", "page": "explainability"},
        ],
    },
    AUDITOR: {
        "label": "Compliance Auditor",
        "landing_page": "audit_logs",
        "mission": "Read-only verification of actions, model versions and alert history.",
        "kpis": ["audit_events_today", "acknowledged_alerts", "model_version", "fleet_health"],
        "primary_actions": [
            {"label": "Export audit trail", "page": "audit_logs"},
            {"label": "Review alert history", "page": "alerts"},
        ],
    },
}

READ_ONLY_ROLES = [AUDITOR]


def permissions_for(role: str) -> List[str]:
    return list(ROLE_PERMISSIONS.get(role, []))


def pages_for(role: str) -> List[str]:
    granted = set(permissions_for(role))
    return [page for page, permission in PAGE_PERMISSIONS.items() if permission in granted]


def workspace_for(role: str) -> dict:
    workspace = ROLE_WORKSPACE.get(role)
    if workspace is None:
        return {
            "label": role.replace("_", " ").title(),
            "landing_page": "dashboard",
            "mission": "",
            "kpis": [],
            "primary_actions": [],
        }
    return workspace


def session_profile(user: dict) -> dict:
    """Role-aware session payload consumed by the client on login/refresh."""
    role = user["role"]
    workspace = workspace_for(role)
    return {
        **user,
        "role_label": workspace["label"],
        "mission": workspace["mission"],
        "permissions": permissions_for(role),
        "pages": pages_for(role),
        "landing_page": workspace["landing_page"],
        "kpis": workspace["kpis"],
        "primary_actions": workspace["primary_actions"],
        "read_only": role in READ_ONLY_ROLES,
    }


def has_permission(user: dict, permission: str) -> bool:
    return permission in ROLE_PERMISSIONS.get(user.get("role", ""), [])


class PermissionChecker:
    """FastAPI dependency enforcing a single permission from the matrix."""

    def __init__(self, permission: str):
        self.permission = permission

    def __call__(self, user: dict = Depends(get_current_user)) -> dict:
        if not has_permission(user, self.permission):
            raise HTTPException(
                status_code=403,
                detail=f"Your role ({user.get('role')}) does not grant '{self.permission}'.",
            )
        return user
