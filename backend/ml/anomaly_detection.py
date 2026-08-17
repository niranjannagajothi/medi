import pandas as pd
import numpy as np
import os
import json
import pickle
from sklearn.ensemble import IsolationForest

from backend import paths

def run_anomaly_detection():
    processed_dir = paths.DATA_PROCESSED_DIR
    models_dir = paths.MODELS_DIR
    
    os.makedirs(models_dir, exist_ok=True)
    
    parquet_path = os.path.join(processed_dir, "device_feature_store.parquet")
    if not os.path.exists(parquet_path):
        print(f"Error: {parquet_path} does not exist. Run build_feature_store first.")
        return
        
    print("Loading feature store Parquet file...")
    df = pd.read_parquet(parquet_path)
    
    # Exclude IDs, dates, and target labels
    exclude_cols = [
        "Device_ID", "Snapshot_Date", "Days_Until_Next_Failure",
        "Failure_Next_7_Days", "Failure_Next_14_Days", "Failure_Next_30_Days"
    ]
    
    # Load schema to align feature lists
    schema_path = os.path.join(models_dir, "feature_schema.json")
    if os.path.exists(schema_path):
        with open(schema_path, "r") as sf:
            schema_info = json.load(sf)
        feature_cols = schema_info["features"]
        categorical_cols = schema_info["categorical_features"]
        category_mappings = schema_info["category_mappings"]
        
        # Apply encoding
        for col in categorical_cols:
            df[col] = df[col].astype(str).fillna("Unknown")
            mapping = category_mappings.get(col, {})
            df[col] = df[col].map(mapping).fillna(-1).astype(int)
    else:
        feature_cols = [c for c in df.columns if c not in exclude_cols]
        categorical_cols = df[feature_cols].select_dtypes(include=["object"]).columns.tolist()
        category_mappings = {}
        for col in categorical_cols:
            df[col] = df[col].astype(str).fillna("Unknown")
            unique_cats = sorted(df[col].unique())
            mapping = {cat: idx for idx, cat in enumerate(unique_cats)}
            df[col] = df[col].map(mapping)
            category_mappings[col] = mapping
            
    # Fill NaNs
    for col in feature_cols:
        if df[col].isnull().any():
            median_val = df[col].median()
            df[col] = df[col].fillna(median_val)
            
    # Select numeric operational signals for Isolation Forest
    # These represent sensor fluctuations, errors, alarms, warning frequencies
    op_signals = [
        "Errors_Last_30_Days", "Alarms_Last_30_Days", "Warnings_Last_30_Days",
        "Abnormal_Sensors_Last_30_Days", "Battery_Errors_Last_30_Days",
        "Power_Errors_Last_30_Days", "Sensor_Errors_Last_30_Days", "System_Resets_Last_30_Days",
        "Average_Load_Percent", "Peak_Load_Percent", "Voltage_Fluctuation_Count"
    ]
    
    # Ensure they are present in features
    op_signals = [col for col in op_signals if col in df.columns]
    
    print(f"Training Isolation Forest on {len(op_signals)} operational signals...")
    X = df[op_signals]
    
    # Fit Isolation Forest (5% contamination threshold)
    model = IsolationForest(contamination=0.05, random_state=42, n_jobs=-1)
    model.fit(X)
    
    # Save model
    with open(os.path.join(models_dir, "anomaly_model.pkl"), "wb") as af:
        pickle.dump(model, af)
        
    # Save anomaly columns mapping so we know what features to pass during inference
    anomaly_metadata = {
        "anomaly_features": op_signals,
        "contamination": 0.05
    }
    with open(os.path.join(models_dir, "anomaly_metadata.json"), "w") as amf:
        json.dump(anomaly_metadata, amf, indent=2)
        
    print("Anomaly detector successfully saved to models/anomaly_model.pkl")

if __name__ == "__main__":
    run_anomaly_detection()
