import pandas as pd
import numpy as np
import os
import time
import json
import pickle
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
import xgboost as xgb
import lightgbm as lgb

from backend import paths

def run_train_rul():
    processed_dir = paths.DATA_PROCESSED_DIR
    models_dir = paths.MODELS_DIR
    artifacts_dir = paths.ARTIFACTS_DIR
    
    os.makedirs(models_dir, exist_ok=True)
    os.makedirs(artifacts_dir, exist_ok=True)
    
    parquet_path = os.path.join(processed_dir, "device_feature_store.parquet")
    if not os.path.exists(parquet_path):
        print(f"Error: {parquet_path} does not exist. Run build_feature_store first.")
        return
        
    print("Loading feature store Parquet file...")
    df = pd.read_parquet(parquet_path)
    
    # Filter rows: only train RUL on instances where a failure *will* occur eventually
    # (i.e. Days_Until_Next_Failure < 9999.0)
    df = df[df["Days_Until_Next_Failure"] < 9999.0].reset_index(drop=True)
    if len(df) == 0:
        print("Warning: No instances with future failures found to train RUL. Training on all data.")
        df = pd.read_parquet(parquet_path)
        # Cap Days_Until_Next_Failure at e.g. 365 days
        df["Days_Until_Next_Failure"] = df["Days_Until_Next_Failure"].clip(upper=365.0)
        
    # Sort temporally
    df["Snapshot_Date"] = pd.to_datetime(df["Snapshot_Date"])
    df = df.sort_values("Snapshot_Date").reset_index(drop=True)
    
    target_col = "Days_Until_Next_Failure"
    
    # Exclude IDs, dates, and other targets
    exclude_cols = [
        "Device_ID", "Snapshot_Date", "Days_Until_Next_Failure",
        "Failure_Next_7_Days", "Failure_Next_14_Days", "Failure_Next_30_Days"
    ]
    
    # Load schema from classifier to use the exact same features
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
        # Fallback if train_classifier didn't run yet
        exclude_cols = ["Device_ID", "Snapshot_Date", "Days_Until_Next_Failure", "Failure_Next_7_Days", "Failure_Next_14_Days", "Failure_Next_30_Days"]
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
            
    # Split temporally (same split percentages as classifier)
    dates = df["Snapshot_Date"]
    min_date, max_date = dates.min(), dates.max()
    total_days = (max_date - min_date).days
    train_end_date = min_date + pd.Timedelta(days=int(total_days * 0.70))
    val_end_date = train_end_date + pd.Timedelta(days=int(total_days * 0.15))
    
    train_df = df[dates < train_end_date]
    val_df = df[(dates >= train_end_date) & (dates < val_end_date)]
    test_df = df[dates >= val_end_date]
    
    print(f"Train samples: {len(train_df)}")
    print(f"Val samples:   {len(val_df)}")
    print(f"Test samples:  {len(test_df)}")
    
    X_train, y_train = train_df[feature_cols], train_df[target_col]
    X_val, y_val = val_df[feature_cols], val_df[target_col]
    X_test, y_test = test_df[feature_cols], test_df[target_col]
    
    models = {
        "Random Forest Regressor": RandomForestRegressor(n_estimators=100, random_state=42, n_jobs=-1),
        "LightGBM Regressor": lgb.LGBMRegressor(random_state=42, verbose=-1, n_jobs=-1),
        "XGBoost Regressor": xgb.XGBRegressor(random_state=42, n_jobs=-1)
    }
    
    best_mae = float('inf')
    best_model_name = None
    best_model = None
    
    comparison = []
    
    for name, model in models.items():
        print(f"Training {name}...")
        t0 = time.time()
        model.fit(X_train, y_train)
        train_time = time.time() - t0
        
        preds_val = model.predict(X_val)
        
        mae = mean_absolute_error(y_val, preds_val)
        rmse = np.sqrt(mean_squared_error(y_val, preds_val))
        r2 = r2_score(y_val, preds_val)
        
        print(f"{name} Results - MAE: {mae:.2f} days, RMSE: {rmse:.2f} days, R2: {r2:.4f}")
        
        comparison.append({
            "Model": name,
            "MAE": round(mae, 4),
            "RMSE": round(rmse, 4),
            "R2": round(r2, 4),
            "Train_Time_Sec": round(train_time, 2)
        })
        
        if mae < best_mae:
            best_mae = mae
            best_model_name = name
            best_model = model
            
    # Save metrics
    df_comp = pd.DataFrame(comparison)
    df_comp.to_csv(os.path.join(artifacts_dir, "rul_model_comparison.csv"), index=False)
    print(f"Selected Best Regressor: {best_model_name}")
    
    # Save best model
    with open(os.path.join(models_dir, "rul_model.pkl"), "wb") as rf:
        pickle.dump(best_model, rf)
    print("RUL Regressor successfully saved to models/rul_model.pkl")

if __name__ == "__main__":
    run_train_rul()
