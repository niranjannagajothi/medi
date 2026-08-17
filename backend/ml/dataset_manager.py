import pandas as pd
import numpy as np
import os
import json
import uuid
import datetime

from backend import paths

class DatasetManager:
    def __init__(self):
        self.upload_dir = paths.UPLOADED_DATASETS_DIR
        self.registry_path = paths.DATASET_REGISTRY_PATH
        os.makedirs(self.upload_dir, exist_ok=True)
        
    def _load_registry(self):
        if not os.path.exists(self.registry_path):
            return {"datasets": []}
        try:
            with open(self.registry_path, "r") as f:
                return json.load(f)
        except Exception:
            return {"datasets": []}
            
    def _save_registry(self, registry):
        with open(self.registry_path, "w") as f:
            json.dump(registry, f, indent=2)

    def upload_dataset(self, file_name, file_content) -> dict:
        """
        Saves uploaded file content to disk and extracts statistics.
        file_content should be raw bytes.
        """
        dataset_id = f"DS_{uuid.uuid4().hex[:8].upper()}"
        file_ext = os.path.splitext(file_name)[1].lower()
        filepath = os.path.join(self.upload_dir, f"{dataset_id}{file_ext}")
        
        # Write file
        with open(filepath, "wb") as f:
            f.write(file_content)
            
        # Parse statistics
        try:
            if file_ext == ".csv":
                df = pd.read_csv(filepath)
            elif file_ext in [".xlsx", ".xls"]:
                df = pd.read_excel(filepath)
            elif file_ext == ".json":
                df = pd.read_json(filepath)
            elif file_ext == ".parquet":
                df = pd.read_parquet(filepath)
            else:
                # Cleanup if invalid type
                os.remove(filepath)
                return {"error": f"Unsupported file type: {file_ext}"}
        except Exception as e:
            if os.path.exists(filepath):
                os.remove(filepath)
            return {"error": f"Failed to parse file: {str(e)}"}
            
        rows, cols = df.shape
        missing_pct = float(df.isnull().sum().sum() / (rows * cols)) * 100 if rows > 0 and cols > 0 else 0.0
        dup_count = int(df.duplicated().sum())
        
        # Detect standard columns
        detected_device_id = self._detect_column(df.columns, ["device_id", "equipment_id", "machine_id", "serial_number", "id", "device", "equipment"])
        detected_timestamp = self._detect_column(df.columns, ["timestamp", "date", "time", "signal_date", "recorded_at", "datetime", "day"])
        detected_device_type = self._detect_column(df.columns, ["device_type", "machine_type", "type", "category"])
        
        device_count = 0
        if detected_device_id:
            device_count = int(df[detected_device_id].nunique())
            
        date_range = "N/A"
        if detected_timestamp:
            try:
                times = pd.to_datetime(df[detected_timestamp], errors='coerce')
                min_t = times.min()
                max_t = times.max()
                if not pd.isnull(min_t) and not pd.isnull(max_t):
                    date_range = f"{min_t.strftime('%Y-%m-%d')} to {max_t.strftime('%Y-%m-%d')}"
            except Exception:
                pass
                
        # Generate default column mapping
        default_mapping = {}
        for col in df.columns:
            col_lower = col.lower()
            if col == detected_device_id:
                default_mapping[col] = "Device_ID"
            elif col == detected_timestamp:
                default_mapping[col] = "Snapshot_Date"
            elif col == detected_device_type:
                default_mapping[col] = "Device_Type"
            elif "battery" in col_lower:
                default_mapping[col] = "Approx_Battery_Health"
            elif "error" in col_lower or "alarm" in col_lower:
                default_mapping[col] = "Errors_Last_30_Days"
            else:
                default_mapping[col] = "Ignore"
                
        # Register dataset
        metadata = {
            "dataset_id": dataset_id,
            "filename": file_name,
            "filepath": filepath,
            "filesize": os.path.getsize(filepath),
            "row_count": rows,
            "col_count": cols,
            "device_count": device_count,
            "date_range": date_range,
            "detected_device_id_col": detected_device_id or "Not Detected",
            "detected_timestamp_col": detected_timestamp or "Not Detected",
            "detected_device_type": detected_device_type or "Not Detected",
            "missing_percent": round(missing_pct, 2),
            "duplicate_count": dup_count,
            "column_mapping": default_mapping,
            "upload_date": datetime.datetime.now().strftime("%Y-%m-%dT%H:%M:%SZ"),
            "columns": list(df.columns)
        }
        
        registry = self._load_registry()
        registry["datasets"].append(metadata)
        self._save_registry(registry)
        
        return metadata

    def _detect_column(self, columns, targets) -> str:
        for col in columns:
            col_lower = str(col).lower()
            # Direct match
            if col_lower in targets:
                return col
            # Substring match
            for t in targets:
                if t in col_lower:
                    return col
        return ""

    def get_datasets(self) -> list:
        return self._load_registry()["datasets"]

    def delete_dataset(self, dataset_id: str) -> bool:
        registry = self._load_registry()
        target = None
        for ds in registry["datasets"]:
            if ds["dataset_id"] == dataset_id:
                target = ds
                break
                
        if target:
            if os.path.exists(target["filepath"]):
                try:
                    os.remove(target["filepath"])
                except Exception:
                    pass
            registry["datasets"].remove(target)
            self._save_registry(registry)
            return True
        return False

    def validate_dataset(self, dataset_id: str, custom_mapping: dict) -> dict:
        """
        Validates column mapping and checks compatibility with model features.
        """
        registry = self._load_registry()
        ds = next((d for d in registry["datasets"] if d["dataset_id"] == dataset_id), None)
        if not ds:
            return {"error": "Dataset not found"}
            
        # Update mapping in registry
        ds["column_mapping"] = custom_mapping
        self._save_registry(registry)
        
        # Load schema features
        schema_path = paths.FEATURE_SCHEMA_PATH
        with open(schema_path, "r") as sf:
            schema = json.load(sf)
        required_targets = ["Device_ID", "Snapshot_Date", "Device_Type"]
        optional_targets = schema["features"] # features expected by prediction pipeline
        
        mapped_targets = list(custom_mapping.values())
        
        # Checks
        missing_required = [req for req in required_targets if req not in mapped_targets]
        unsupported = [k for k, v in custom_mapping.items() if v not in required_targets + optional_targets and v != "Ignore"]
        
        # Calculate feature compatibility score
        # Base requirements: 50%
        # Optional requirements: 50% distributed among expected features
        score = 0
        if not missing_required:
            score += 50
            
        mapped_optional = [v for v in mapped_targets if v in optional_targets]
        if len(optional_targets) > 0:
            optional_score = (len(mapped_optional) / len(optional_targets)) * 50
            score += min(50, round(optional_score, 1))
            
        schema_compatibility = "COMPATIBLE"
        if missing_required:
            schema_compatibility = "INCOMPATIBLE"
        elif score < 70:
            schema_compatibility = "PARTIALLY_COMPATIBLE"
            
        return {
            "dataset_id": dataset_id,
            "schema_compatibility": schema_compatibility,
            "missing_required_columns": missing_required,
            "unsupported_columns": unsupported,
            "feature_compatibility_score": score,
            "mapped_optional_count": len(mapped_optional),
            "total_optional_expected": len(optional_targets)
        }
