import pandas as pd
import numpy as np
import os
import json
import pickle
import shap

from backend import paths

def run_shap_explainer():
    processed_dir = paths.DATA_PROCESSED_DIR
    models_dir = paths.MODELS_DIR
    
    os.makedirs(models_dir, exist_ok=True)
    
    model_path = os.path.join(models_dir, "classification_model.pkl")
    if not os.path.exists(model_path):
        print(f"Error: {model_path} does not exist. Train classification model first.")
        return
        
    parquet_path = os.path.join(processed_dir, "device_feature_store.parquet")
    if not os.path.exists(parquet_path):
        print(f"Error: {parquet_path} does not exist. Run build_feature_store first.")
        return
        
    print("Loading model and dataset for SHAP explainer...")
    with open(model_path, "rb") as mf:
        model = pickle.load(mf)
        
    df = pd.read_parquet(parquet_path)
    
    # Load schema
    schema_path = os.path.join(models_dir, "feature_schema.json")
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
        
    for col in feature_cols:
        if df[col].isnull().any():
            median_val = df[col].median()
            df[col] = df[col].fillna(median_val)
            
    # Sample a background dataset of 100 observations to represent reference value
    background_df = df[feature_cols].sample(n=min(100, len(df)), random_state=42)
    
    background_path = os.path.join(models_dir, "shap_background.pkl")
    with open(background_path, "wb") as bf:
        pickle.dump(background_df, bf)
    print("SHAP background data saved to models/shap_background.pkl.")
    
    # Test explainer creation
    try:
        print("Testing SHAP Explainer construction...")
        if hasattr(model, "coef_"):
            explainer = shap.LinearExplainer(model, background_df)
        else:
            explainer = shap.TreeExplainer(model)
            
        # Verify it can explain a single instance
        sample_inst = df[feature_cols].head(1)
        shap_values = explainer.shap_values(sample_inst)
        print("SHAP Explainer successfully initialized. SHAP test passed.")
        
        # Save explainer object directly
        with open(os.path.join(models_dir, "shap_explainer.pkl"), "wb") as ef:
            pickle.dump(explainer, ef)
        print("SHAP Explainer serialized to models/shap_explainer.pkl.")
    except Exception as e:
        print(f"SHAP Explainer serialization warning: {e}. Fallback to dynamic creation will be used.")

# Helper to explain an instance at inference time
def explain_prediction(model, instance_features, background_data):
    try:
        if hasattr(model, "coef_"):
            explainer = shap.LinearExplainer(model, background_data)
        else:
            explainer = shap.TreeExplainer(model)
    except:
        # Fallback without background data if tree model
        explainer = shap.TreeExplainer(model)
        
    shap_values = explainer.shap_values(instance_features)
    
    # Format SHAP values
    if isinstance(shap_values, list) and len(shap_values) == 2:
        shap_val = shap_values[1][0]
    elif len(shap_values.shape) == 3: # multi-class
        shap_val = shap_values[0, :, 1]
    else:
        # single array representation of positive log-odds/probability contribution
        shap_val = shap_values[0] if len(shap_values.shape) == 2 else shap_values
        
    feature_names = instance_features.columns.tolist()
    contributions = []
    
    for name, val in zip(feature_names, shap_val):
        direction = "increases_failure_risk" if val > 0 else "decreases_failure_risk"
        impact = "low"
        val_abs = abs(val)
        if val_abs > 0.5:
            impact = "high"
        elif val_abs > 0.15:
            impact = "moderate"
            
        contributions.append({
            "feature": name,
            "shap_value": float(val),
            "impact": impact,
            "direction": direction
        })
        
    contributions = sorted(contributions, key=lambda x: abs(x["shap_value"]), reverse=True)
    return contributions

if __name__ == "__main__":
    run_shap_explainer()
