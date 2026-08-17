import pandas as pd
import numpy as np
import os
import json

from backend import paths

def run_component_ontology():
    data_dir = paths.DATA_RAW_DIR
    models_dir = paths.MODELS_DIR
    
    os.makedirs(models_dir, exist_ok=True)
    
    info_path = os.path.join(data_dir, "device_information_cleaned.csv")
    fail_path = os.path.join(data_dir, "failure_history_cleaned.csv")
    maint_path = os.path.join(data_dir, "maintenance_history_cleaned.csv")
    
    if not (os.path.exists(info_path) and os.path.exists(fail_path) and os.path.exists(maint_path)):
        print("Error: Cleaned dataset files not found. Ensure they are placed in data/raw.")
        return
        
    print("Loading datasets to discover component ontology...")
    df_info = pd.read_csv(info_path)
    df_fail = pd.read_csv(fail_path)
    df_maint = pd.read_csv(maint_path)
    
    # Pre-group failures and maintenance by Device_ID for quick mapping
    fail_by_device = {k: list(v["Failed_Component"].dropna().unique()) for k, v in df_fail.groupby("Device_ID")}
    
    # Parse components replaced in maintenance
    maint_by_device = {}
    for device_id, group in df_maint.groupby("Device_ID"):
        comps = set()
        for record in group["Components_Replaced"].dropna():
            if str(record).lower() == "unknown" or str(record).lower() == "none":
                continue
            # Components are split by semicolon
            parts = [p.strip() for p in str(record).split(";")]
            comps.update(parts)
        maint_by_device[device_id] = list(comps)

    # Core device types
    device_types = df_info["Device_Type"].dropna().unique()
    ontology = {}
    
    # Generic fallback components
    default_components = ["Battery", "Power Supply", "Control Board", "Display Module", "Sensor"]
    
    print(f"Discovering component vocabulary for {len(device_types)} device types...")
    
    for dtype in device_types:
        devices_of_type = df_info[df_info["Device_Type"] == dtype]["Device_ID"].unique()
        type_components = set()
        
        for dev_id in devices_of_type:
            # Add failed components
            if dev_id in fail_by_device:
                type_components.update(fail_by_device[dev_id])
            # Add replaced components
            if dev_id in maint_by_device:
                type_components.update(maint_by_device[dev_id])
                
        # Clean component names
        cleaned_comps = set()
        for c in type_components:
            c_str = str(c).strip()
            if c_str.lower() not in ["", "unknown", "none", "nan", "other", "generic"]:
                cleaned_comps.add(c_str)
                
        # If no specific components found, assign defaults
        if len(cleaned_comps) == 0:
            cleaned_comps.update(default_components)
            
        ontology[dtype] = sorted(list(cleaned_comps))
        
    # Write to json file
    output_path = os.path.join(models_dir, "component_ontology.json")
    with open(output_path, "w") as jf:
        json.dump(ontology, jf, indent=2)
        
    print(f"Dynamic Component Ontology saved successfully to {output_path}")

if __name__ == "__main__":
    run_component_ontology()
