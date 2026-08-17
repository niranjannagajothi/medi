import pandas as pd
import numpy as np
import os
import json

from backend import paths

def get_component_weights(device_type):
    critical = ["battery", "power supply", "power unit", "control board", "drive motor", "oxygen system", "compressor", "pump"]
    sensors = ["sensor", "temperature sensor", "pressure sensor", "flow sensor", "lead cable", "electrode set", "ecg sensor"]
    
    weights = {}
    models_dir = paths.MODELS_DIR
    ontology_path = os.path.join(models_dir, "component_ontology.json")
    
    components = []
    if os.path.exists(ontology_path):
        with open(ontology_path, "r") as jf:
            ontology = json.load(jf)
        components = ontology.get(device_type, ["Battery", "Power Supply", "Control Board", "Display Module", "Sensor"])
    else:
        components = ["Battery", "Power Supply", "Control Board", "Display Module", "Sensor"]
        
    for comp in components:
        comp_lower = comp.lower()
        if any(c in comp_lower for c in critical):
            weights[comp] = 3.0
        elif any(s in comp_lower for s in sensors):
            weights[comp] = 2.0
        else:
            weights[comp] = 1.0
            
    return weights

def calculate_component_health(device_type, feature_row, shap_contributions, failure_history=None, maintenance_history=None):
    """
    Computes component health scores (0-100) and overall device health score.
    Optimized to run at C-speed using list comprehensions and dictionaries.
    """
    models_dir = paths.MODELS_DIR
    ontology_path = os.path.join(models_dir, "component_ontology.json")
    
    components = []
    if os.path.exists(ontology_path):
        with open(ontology_path, "r") as jf:
            ontology = json.load(jf)
        components = ontology.get(device_type, ["Battery", "Power Supply", "Control Board", "Display Module", "Sensor"])
    else:
        components = ["Battery", "Power Supply", "Control Board", "Display Module", "Sensor"]
        
    component_scores = {}
    component_evidence = {}
    
    snapshot_date = pd.Timestamp(feature_row.get("Snapshot_Date", pd.Timestamp.now()))
    
    # Pre-convert dataframes to list of dicts once per device to avoid slow iterrows/pandas index lookups
    fail_records = []
    if failure_history is not None and len(failure_history) > 0:
        if isinstance(failure_history, pd.DataFrame):
            fail_records = failure_history.to_dict(orient="records")
        else:
            fail_records = failure_history # assume already list of dicts
            
    maint_records = []
    if maintenance_history is not None and len(maintenance_history) > 0:
        if isinstance(maintenance_history, pd.DataFrame):
            maint_records = maintenance_history.to_dict(orient="records")
        else:
            maint_records = maintenance_history # assume already list of dicts
            
    for comp in components:
        comp_lower = comp.lower()
        
        # 1. Condition Penalty
        cond_penalty = 0.0
        evidence = []
        
        if "battery" in comp_lower:
            bat_health = feature_row.get("Approx_Battery_Health", feature_row.get("Battery_Health_Percent", 100.0))
            if bat_health < 100.0:
                cond_penalty = 100.0 - bat_health
                evidence.append(f"Battery degradation: health is {bat_health:.1f}%")
                
        # 2. Error Penalty
        err_penalty = 0.0
        err_count_30 = 0.0
        if "battery" in comp_lower:
            err_count_30 = feature_row.get("Battery_Errors_Last_30_Days", 0.0)
        elif "power" in comp_lower:
            err_count_30 = feature_row.get("Power_Errors_Last_30_Days", 0.0)
        elif "sensor" in comp_lower:
            err_count_30 = feature_row.get("Sensor_Errors_Last_30_Days", 0.0)
        else:
            err_count_30 = feature_row.get("Errors_Last_30_Days", 0.0) / len(components)
            
        if err_count_30 > 0:
            err_penalty = min(40.0, 5.0 * err_count_30)
            evidence.append(f"Active alarms: {int(err_count_30)} error signals in the past 30 days")
            
        # 3. Historical Failure Penalty
        fail_penalty = 0.0
        if len(fail_records) > 0:
            comp_fails = [r for r in fail_records if str(r.get("Failed_Component")).lower() == comp_lower]
            if len(comp_fails) > 0:
                # Get max date
                last_fail_date = max(pd.to_datetime(f["Failure_Date"]) for f in comp_fails)
                days_since_fail = (snapshot_date - last_fail_date).days
                if days_since_fail >= 0:
                    fail_penalty = max(0.0, 30.0 - 0.1 * days_since_fail)
                    evidence.append(f"Historical failure: component failed {days_since_fail} days ago")
                    
        # 4. SHAP Risk Contribution Penalty
        shap_penalty = 0.0
        if shap_contributions is not None:
            pos_shap = sum(c["shap_value"] for c in shap_contributions if comp_lower in c["feature"].lower() and c["shap_value"] > 0)
            if pos_shap > 0:
                shap_penalty = min(30.0, 50.0 * pos_shap)
                evidence.append(f"AI Risk Factor: elevated feature anomaly score (SHAP impact)")
                
        # 5. Replacement Reward
        replacement_reward = 0.0
        if len(maint_records) > 0:
            replaced_dates = []
            for r in maint_records:
                replaced_str = str(r.get("Components_Replaced", "")).lower()
                if comp_lower in replaced_str:
                    replaced_dates.append(pd.to_datetime(r["Maintenance_Date"]))
            if len(replaced_dates) > 0:
                last_replace_date = max(replaced_dates)
                days_since_replace = (snapshot_date - last_replace_date).days
                if days_since_replace >= 0:
                    replacement_reward = max(0.0, 40.0 - 0.1 * days_since_replace)
                    evidence.append(f"Service reset: component replaced {days_since_replace} days ago (Health recovery)")
                    
        # Calculate raw score
        penalty = cond_penalty + err_penalty + fail_penalty + shap_penalty - replacement_reward
        score = max(0.0, min(100.0, 100.0 - penalty))
        
        if len(evidence) == 0:
            evidence.append("Component operating within normal design tolerances.")
            
        component_scores[comp] = round(score, 1)
        component_evidence[comp] = {
            "score": round(score, 1),
            "evidence": evidence
        }

    # Compute Overall Device Health Score (Weighted)
    weights = get_component_weights(device_type)
    total_weight = 0.0
    weighted_sum = 0.0
    for comp, score in component_scores.items():
        w = weights.get(comp, 1.0)
        weighted_sum += score * w
        total_weight += w
        
    overall_health = round(weighted_sum / total_weight, 1) if total_weight > 0 else 100.0
    
    return {
        "overall_health": overall_health,
        "components": component_scores,
        "details": component_evidence
    }
