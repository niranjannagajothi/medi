"""Central, OS-independent filesystem locations for the AURA platform.

Every path resolves relative to the repository root so the platform runs
unchanged on Linux, macOS and Windows. Individual locations can be overridden
with environment variables when data lives outside the checkout.
"""

import os

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
DATA_ROOT = os.getenv("AURA_DATA_ROOT", PROJECT_ROOT)

MODELS_DIR = os.getenv("AURA_MODELS_DIR", os.path.join(DATA_ROOT, "models"))
ARTIFACTS_DIR = os.getenv("AURA_ARTIFACTS_DIR", os.path.join(DATA_ROOT, "artifacts"))
DATA_RAW_DIR = os.getenv("AURA_DATA_RAW_DIR", os.path.join(DATA_ROOT, "data", "raw"))
DATA_PROCESSED_DIR = os.getenv("AURA_DATA_PROCESSED_DIR", os.path.join(DATA_ROOT, "data", "processed"))
KNOWLEDGE_BASE_DIR = os.getenv("AURA_KNOWLEDGE_BASE_DIR", os.path.join(DATA_ROOT, "data", "knowledge_base"))
UPLOADED_DATASETS_DIR = os.getenv("AURA_UPLOADED_DATASETS_DIR", os.path.join(DATA_ROOT, "data", "uploaded_datasets"))
ARCHIVE_DIR = os.getenv("AURA_ARCHIVE_DIR", os.path.join(DATA_RAW_DIR, "archive"))

DB_PATH = os.getenv("AURA_DB_PATH", os.path.join(MODELS_DIR, "aura_intelligence.db"))
DEVICE_CACHE_PATH = os.path.join(MODELS_DIR, "device_latest_cache.json")
MODEL_METADATA_PATH = os.path.join(MODELS_DIR, "model_metadata.json")
DATASET_REGISTRY_PATH = os.path.join(MODELS_DIR, "dataset_registry.json")
FEATURE_SCHEMA_PATH = os.path.join(MODELS_DIR, "feature_schema.json")
HOSPITAL_STATE_PATH = os.path.join(MODELS_DIR, "hospital_connection_state.json")


def ensure_runtime_dirs() -> None:
    for directory in (
        MODELS_DIR,
        ARTIFACTS_DIR,
        DATA_RAW_DIR,
        DATA_PROCESSED_DIR,
        KNOWLEDGE_BASE_DIR,
        UPLOADED_DATASETS_DIR,
    ):
        os.makedirs(directory, exist_ok=True)
