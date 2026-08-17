import pandas as pd
import numpy as np
import os
import json
import time
import pickle
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from backend.ml.component_health import calculate_component_health
from backend.ml.root_cause import analyze_root_cause
from backend.rag.maintenance_advisor import RAGMaintenanceAdvisor

from backend import paths

def precompute_all_device_cache():
    processed_dir = paths.DATA_PROCESSED_DIR
    models_dir = paths.MODELS_DIR
    
    parquet_path = os.path.join(processed_dir, "device_feature_store.parquet")
    if not os.path.exists(parquet_path):
        print("Feature store parquet not found.")
        return
        
    print("Loading feature store for batch cache computation...")
    df = pd.read_parquet(parquet_path)
    
    # Get latest snapshot for each device
    df_latest = df.sort_values("Snapshot_Date").groupby("Device_ID").last().reset_index()
    print(f"Total unique devices to cache: {len(df_latest)}")
    
    # Load models
    with open(os.path.join(models_dir, "classification_model.pkl"), "rb") as mf:
        clf_model = pickle.load(mf)
    with open(os.path.join(models_dir, "rul_model.pkl"), "rb") as rf:
        rul_model = pickle.load(rf)
    with open(os.path.join(models_dir, "anomaly_model.pkl"), "rb") as af:
        anomaly_model = pickle.load(af)
    with open(os.path.join(models_dir, "feature_schema.json"), "r") as sf:
        schema = json.load(sf)
        
    feature_cols = schema["features"]
    categorical_cols = schema["categorical_features"]
    category_mappings = schema["category_mappings"]
    
    # Encode categorical columns
    df_encoded = df_latest.copy()
    for col in categorical_cols:
        df_encoded[col] = df_encoded[col].astype(str).fillna("Unknown")
        mapping = category_mappings.get(col, {})
        df_encoded[col] = df_encoded[col].map(mapping).fillna(-1).astype(int)
        
    for col in feature_cols:
        if df_encoded[col].isnull().any():
            median_val = df_encoded[col].median()
            df_encoded[col] = df_encoded[col].fillna(median_val)
            
    X_batch = df_encoded[feature_cols]
    
    # Batch predictions
    print("Running batch failure probability predictions...")
    probs = clf_model.predict_proba(X_batch)[:, 1]
    
    print("Running batch RUL predictions...")
    ruls = rul_model.predict(X_batch)
    
    print("Running batch anomaly predictions...")
    with open(os.path.join(models_dir, "anomaly_metadata.json"), "r") as amf:
        anomaly_meta = json.load(amf)
    anomaly_features = anomaly_meta["anomaly_features"]
    X_anom_batch = df_encoded[anomaly_features]
    anom_decisions = anomaly_model.decision_function(X_anom_batch)
    anom_preds = anomaly_model.predict(X_anom_batch)
    
    # Load RAG advisor
    rag_advisor = RAGMaintenanceAdvisor()
    rag_advisor.build_index()
    
    # Load raw failures and maintenance to match component histories
    data_dir = paths.DATA_RAW_DIR
    df_fail = pd.read_csv(os.path.join(data_dir, "failure_history_cleaned.csv"))
    df_maint = pd.read_csv(os.path.join(data_dir, "maintenance_history_cleaned.csv"))
    
    df_fail["Failure_Date"] = pd.to_datetime(df_fail["Failure_Date"])
    df_maint["Maintenance_Date"] = pd.to_datetime(df_maint["Maintenance_Date"])
    
    fail_by_device = {k: v for k, v in df_fail.groupby("Device_ID")}
    maint_by_device = {k: v for k, v in df_maint.groupby("Device_ID")}
    
    # Local RAG cache dictionary to avoid redundant database searches
    rag_cache = {}
    cache = {}
    
    print("Building detail profiles for cache...")
    t0 = time.time()
    for i, row in df_latest.iterrows():
        device_id = row["Device_ID"]
        device_type = row["Device_Type"]
        prob = float(probs[i])
        rul = max(1.0, round(float(ruls[i]), 1))
        anomaly_score = float(anom_decisions[i])
        anom_score_norm = round(max(0.0, min(100.0, (0.5 - anomaly_score) * 100.0)), 1)
        anomaly_status = "Abnormal" if anom_preds[i] == -1 else "Normal"
        
        # Risk level
        if prob <= 0.30:
            risk_level = "LOW"
        elif prob <= 0.60:
            risk_level = "MEDIUM"
        elif prob <= 0.80:
            risk_level = "HIGH"
        else:
            risk_level = "CRITICAL"
            
        # Reconstruct static feature row for heuristics
        feat_row = row.to_dict()
        
        # Mock SHAP weights for fast heuristics inside cache
        mock_shaps = []
        if hasattr(clf_model, "coef_"):
            coefs = clf_model.coef_[0]
            for f_idx, col_name in enumerate(feature_cols):
                val = float(X_batch.iloc[i][col_name])
                shap_val = coefs[f_idx] * val
                mock_shaps.append({
                    "feature": col_name,
                    "shap_value": shap_val
                })
        else:
            mock_shaps = [{"feature": "Approx_Battery_Health", "shap_value": 5.0 if "battery" in device_type.lower() else 0.0}]
            
        # Component health
        health = calculate_component_health(
            device_type=device_type,
            feature_row=feat_row,
            shap_contributions=mock_shaps,
            failure_history=fail_by_device.get(device_id),
            maintenance_history=maint_by_device.get(device_id)
        )
        
        # Root cause
        rc = analyze_root_cause(feat_row, mock_shaps)
        
        # RAG action (with cache lookup optimization)
        rag_key = (device_type, rc["primary"])
        if rag_key not in rag_cache:
            rag_cache[rag_key] = rag_advisor.get_maintenance_advice(device_type, rc["primary"])
        rag = rag_cache[rag_key]
        
        cache[device_id] = {
            "device_id": device_id,
            "device_type": device_type,
            "device_category": feat_row["Device_Category"],
            "manufacturer": feat_row["Manufacturer"],
            "overall_health": health["overall_health"],
            "failure_probability": round(prob, 4),
            "risk_level": risk_level,
            "predicted_failure_time_days": rul,
            "components": health["components"],
            "component_details": health["details"],
            "root_cause": {
                "primary": rc["primary"],
                "confidence": rc["confidence"],
                "contributing_factors": rc["contributing_factors"],
                "evidence": rc["evidence"]
            },
            "anomaly": {
                "score": anom_score_norm,
                "status": anomaly_status
            },
            "maintenance": {
                "priority": risk_level,
                "recommended_action": rag["recommended_action"],
                "source": rag["source"],
                "evidence": rag["evidence"]
            },
            "explanation": sorted(mock_shaps, key=lambda x: abs(x["shap_value"]), reverse=True)[:5]
        }
        
        if (i+1) % 2000 == 0:
            print(f"Cached {i+1}/{len(df_latest)} devices...")
            
    print(f"Cache compiled in {time.time()-t0:.2f}s.")
    
    cache_path = os.path.join(models_dir, "device_latest_cache.json")
    with open(cache_path, "w") as cf:
        json.dump(cache, cf, indent=2)
    print(f"Successfully saved cache to {cache_path}")

if __name__ == "__main__":
    precompute_all_device_cache()
