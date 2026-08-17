import pandas as pd
import numpy as np
import os
import time
import json
import pickle
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import roc_auc_score, average_precision_score, accuracy_score, precision_score, recall_score, f1_score, confusion_matrix
import xgboost as xgb
import lightgbm as lgb
from catboost import CatBoostClassifier

from backend import paths

def run_train_classifier():
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
    
    # Sort by date for temporal integrity
    df["Snapshot_Date"] = pd.to_datetime(df["Snapshot_Date"])
    df = df.sort_values("Snapshot_Date").reset_index(drop=True)
    
    # Define Target and features
    target_col = "Failure_Next_30_Days"
    
    # List of metadata and targets to exclude from features
    exclude_cols = [
        "Device_ID", "Snapshot_Date", "Days_Until_Next_Failure",
        "Failure_Next_7_Days", "Failure_Next_14_Days", "Failure_Next_30_Days"
    ]
    
    feature_cols = [c for c in df.columns if c not in exclude_cols]
    
    # Handle Categorical Columns
    categorical_cols = df[feature_cols].select_dtypes(include=["object"]).columns.tolist()
    print("Categorical features to encode:", categorical_cols)
    
    category_mappings = {}
    for col in categorical_cols:
        # Convert to string and fill NaNs
        df[col] = df[col].astype(str).fillna("Unknown")
        # Unique categories
        unique_cats = sorted(df[col].unique())
        mapping = {cat: idx for idx, cat in enumerate(unique_cats)}
        df[col] = df[col].map(mapping)
        category_mappings[col] = mapping
        
    # Save Feature Schema
    schema_info = {
        "features": feature_cols,
        "categorical_features": categorical_cols,
        "category_mappings": category_mappings,
        "target": target_col
    }
    with open(os.path.join(models_dir, "feature_schema.json"), "w") as sf:
        json.dump(schema_info, sf, indent=2)
    print("Feature schema saved to models/feature_schema.json.")
    
    # Fill remaining NaNs with column median
    for col in feature_cols:
        if df[col].isnull().any():
            median_val = df[col].median()
            df[col] = df[col].fillna(median_val)
            
    # Temporal splitting
    dates = df["Snapshot_Date"]
    min_date, max_date = dates.min(), dates.max()
    print(f"Dataset date range: {min_date.date()} to {max_date.date()}")
    
    # Dynamically split temporal range
    # 70% Train, 15% Val, 15% Test
    total_days = (max_date - min_date).days
    train_end_date = min_date + pd.Timedelta(days=int(total_days * 0.70))
    val_end_date = train_end_date + pd.Timedelta(days=int(total_days * 0.15))
    
    train_mask = dates < train_end_date
    val_mask = (dates >= train_end_date) & (dates < val_end_date)
    test_mask = dates >= val_end_date
    
    train_df = df[train_mask]
    val_df = df[val_mask]
    test_df = df[test_mask]
    
    print(f"Train samples: {len(train_df)} (up to {train_end_date.date()})")
    print(f"Val samples:   {len(val_df)} ({train_end_date.date()} to {val_end_date.date()})")
    print(f"Test samples:  {len(test_df)} (from {val_end_date.date()})")
    
    split_summary = {
        "train_range": [str(train_df["Snapshot_Date"].min()), str(train_df["Snapshot_Date"].max())],
        "val_range": [str(val_df["Snapshot_Date"].min()), str(val_df["Snapshot_Date"].max())],
        "test_range": [str(test_df["Snapshot_Date"].min()), str(test_df["Snapshot_Date"].max())],
        "train_count": len(train_df),
        "val_count": len(val_df),
        "test_count": len(test_df)
    }
    with open(os.path.join(artifacts_dir, "split_summary.json"), "w") as ss:
        json.dump(split_summary, ss, indent=2)
        
    X_train, y_train = train_df[feature_cols], train_df[target_col]
    X_val, y_val = val_df[feature_cols], val_df[target_col]
    X_test, y_test = test_df[feature_cols], test_df[target_col]
    
    # Balance weight calculation
    neg_count = (y_train == 0).sum()
    pos_count = (y_train == 1).sum()
    scale_pos = neg_count / pos_count if pos_count > 0 else 1.0
    print(f"Class distribution: {neg_count} negatives, {pos_count} positives. scale_pos_weight = {scale_pos:.2f}")

    # Benchmark Models dictionary
    models = {
        "Logistic Regression": LogisticRegression(max_iter=1000, class_weight='balanced', random_state=42),
        "Random Forest": RandomForestClassifier(n_estimators=100, class_weight='balanced', random_state=42, n_jobs=-1),
        "LightGBM": lgb.LGBMClassifier(scale_pos_weight=scale_pos, random_state=42, verbose=-1, n_jobs=-1),
        "XGBoost": xgb.XGBClassifier(scale_pos_weight=scale_pos, random_state=42, n_jobs=-1),
        "CatBoost": CatBoostClassifier(auto_class_weights='Balanced', random_state=42, verbose=0)
    }
    
    model_comparison = []
    trained_models = {}
    
    for name, model in models.items():
        print(f"Training {name}...")
        t0 = time.time()
        model.fit(X_train, y_train)
        train_time = time.time() - t0
        
        # Predictions
        preds_val = model.predict(X_val)
        probs_val = model.predict_proba(X_val)[:, 1] if hasattr(model, "predict_proba") else probs_val
        
        # Calculate Metrics
        roc_auc = roc_auc_score(y_val, probs_val)
        pr_auc = average_precision_score(y_val, probs_val)
        acc = accuracy_score(y_val, preds_val)
        prec = precision_score(y_val, preds_val, zero_division=0)
        rec = recall_score(y_val, preds_val, zero_division=0)
        f1 = f1_score(y_val, preds_val, zero_division=0)
        
        tn, fp, fn, tp = confusion_matrix(y_val, preds_val).ravel()
        
        # Calibration Score (brier score loss)
        from sklearn.metrics import brier_score_loss
        brier = brier_score_loss(y_val, probs_val)
        
        metrics = {
            "Model": name,
            "ROC-AUC": round(roc_auc, 4),
            "PR-AUC": round(pr_auc, 4),
            "Accuracy": round(acc, 4),
            "Precision": round(prec, 4),
            "Recall": round(rec, 4),
            "F1-Score": round(f1, 4),
            "Brier-Score": round(brier, 4),
            "TP": tp, "FP": fp, "FN": fn, "TN": tn,
            "Train_Time_Sec": round(train_time, 2)
        }
        model_comparison.append(metrics)
        trained_models[name] = model
        print(f"{name} Results - ROC-AUC: {roc_auc:.4f}, Recall: {rec:.4f}, PR-AUC: {pr_auc:.4f}")
        
    # Save comparison report
    df_comparison = pd.DataFrame(model_comparison)
    df_comparison.to_csv(os.path.join(artifacts_dir, "model_comparison.csv"), index=False)
    print("Model comparison metrics saved to artifacts/model_comparison.csv.")
    
    # Select best model based on PR-AUC & Recall product
    best_idx = df_comparison["PR-AUC"].idxmax()
    best_model_name = df_comparison.iloc[best_idx]["Model"]
    best_model = trained_models[best_model_name]
    print(f"\nSelected Best Model: {best_model_name}")
    
    # Save best model
    with open(os.path.join(models_dir, "classification_model.pkl"), "wb") as mf:
        pickle.dump(best_model, mf)
    print(f"Classification model successfully written to models/classification_model.pkl")
    
    # Save training metadata
    metadata = {
        "training_date": str(pd.Timestamp.now()),
        "dataset_version": "Cleaned v1",
        "selected_model": best_model_name,
        "features_list": feature_cols,
        "target_horizon": "30 Days",
        "metrics_summary": df_comparison.to_dict(orient="records")
    }
    with open(os.path.join(models_dir, "model_metadata.json"), "w") as meta_f:
        json.dump(metadata, meta_f, indent=2)
    print("Model metadata written to models/model_metadata.json.")

if __name__ == "__main__":
    run_train_classifier()
