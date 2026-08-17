import pandas as pd
import numpy as np
import os
import json
import pickle

# Import sub-modules
from backend.ml.component_health import calculate_component_health
from backend.ml.root_cause import analyze_root_cause
from backend.ml.shap_explainer import explain_prediction
from backend.knowledge_graph.graph_engine import MedicalDeviceGraphEngine
from backend.rag.maintenance_advisor import RAGMaintenanceAdvisor

from backend import paths

class MedicalDeviceInferenceEngine:
    def __init__(self):
        self.data_dir = paths.DATA_RAW_DIR
        self.models_dir = paths.MODELS_DIR
        
        self.clf_model = None
        self.rul_model = None
        self.anomaly_model = None
        self.schema = None
        self.background_df = None
        
        self.df_info = None
        self.df_env = None
        self.df_err = None
        self.df_fail = None
        self.df_maint = None
        self.df_recall = None
        self.df_usage = None
        
        self.graph_engine = MedicalDeviceGraphEngine()
        self.rag_advisor = RAGMaintenanceAdvisor()
        
    def load_models(self):
        if self.clf_model is not None:
            return
            
        print("Loading trained machine learning models for inference...")
        with open(os.path.join(self.models_dir, "classification_model.pkl"), "rb") as mf:
            self.clf_model = pickle.load(mf)
        with open(os.path.join(self.models_dir, "rul_model.pkl"), "rb") as rf:
            self.rul_model = pickle.load(rf)
        with open(os.path.join(self.models_dir, "anomaly_model.pkl"), "rb") as af:
            self.anomaly_model = pickle.load(af)
            
        with open(os.path.join(self.models_dir, "feature_schema.json"), "r") as sf:
            self.schema = json.load(sf)
            
        with open(os.path.join(self.models_dir, "shap_background.pkl"), "rb") as bf:
            self.background_df = pickle.load(bf)
            
        # Load raw data for telemetry queries
        self.df_info = pd.read_csv(os.path.join(self.data_dir, "device_information_cleaned.csv"))
        self.df_env = pd.read_csv(os.path.join(self.data_dir, "environmental_factors_cleaned.csv"))
        self.df_err = pd.read_csv(os.path.join(self.data_dir, "error_operational_signals_cleaned.csv"))
        self.df_fail = pd.read_csv(os.path.join(self.data_dir, "failure_history_cleaned.csv"))
        self.df_maint = pd.read_csv(os.path.join(self.data_dir, "maintenance_history_cleaned.csv"))
        self.df_recall = pd.read_csv(os.path.join(self.data_dir, "safety_recall_information_cleaned.csv"))
        self.df_usage = pd.read_csv(os.path.join(self.data_dir, "usage_operating_factors_cleaned.csv"))

        # Convert dates
        self.df_info["Installation_Date"] = pd.to_datetime(self.df_info["Installation_Date"])
        self.df_err["Signal_Date"] = pd.to_datetime(self.df_err["Signal_Date"])
        self.df_fail["Failure_Date"] = pd.to_datetime(self.df_fail["Failure_Date"])
        self.df_maint["Maintenance_Date"] = pd.to_datetime(self.df_maint["Maintenance_Date"])
        self.df_recall["Recall_Date"] = pd.to_datetime(self.df_recall["Recall_Date"])
        
    def _build_live_feature_row(self, device_id, T):
        dev_rows = self.df_info[self.df_info["Device_ID"] == device_id]
        if len(dev_rows) == 0:
            return None
        dev_row = dev_rows.iloc[0]
        env_rows = self.df_env[self.df_env["Device_ID"] == device_id]
        env_row = env_rows.iloc[0] if len(env_rows) > 0 else None
        usage_rows = self.df_usage[self.df_usage["Device_ID"] == device_id]
        usage_row = usage_rows.iloc[0] if len(usage_rows) > 0 else None
        
        install_date = pd.to_datetime(dev_row["Installation_Date"])
        age_days = (T - install_date).days
        if age_days < 0:
            age_days = 0
            
        features = {
            "Device_ID": device_id,
            "Snapshot_Date": T,
            "Device_Type": dev_row["Device_Type"],
            "Device_Category": dev_row["Device_Category"],
            "Manufacturer": dev_row["Manufacturer"],
            "Device_Age_Days": age_days,
            "Warranty_Status": dev_row["Warranty_Status"],
            "Device_Generation": dev_row["Device_Generation"]
        }
        
        # Usage approximations at time T
        if usage_row is not None:
            total_op_hours = usage_row["Total_Operating_Hours"]
            avg_daily_usage = usage_row["Average_Daily_Usage_Hours"]
            device_age_years = dev_row["Device_Age_Years"]
            
            approx_op_hours = min(total_op_hours, avg_daily_usage * age_days) if age_days > 0 else 0
            features["Approx_Operating_Hours"] = approx_op_hours
            
            total_cycles = usage_row["Battery_Cycles"]
            approx_cycles = total_cycles * (age_days / (device_age_years * 365.25)) if device_age_years > 0 and age_days > 0 else 0
            features["Approx_Battery_Cycles"] = min(total_cycles, approx_cycles)
            
            battery_health = usage_row["Battery_Health_Percent"]
            approx_bat_health = 100 - (100 - battery_health) * (age_days / (device_age_years * 365.25)) if device_age_years > 0 and age_days > 0 else 100
            features["Approx_Battery_Health"] = max(battery_health, approx_bat_health)
            
            features["Sensor_Usage_Intensity"] = usage_row["Sensor_Usage_Intensity"]
            features["Load_Stress_Gap"] = usage_row["Load_Stress_Gap"]
            features["Average_Load_Percent"] = usage_row["Average_Load_Percent"]
            features["Peak_Load_Percent"] = usage_row["Peak_Load_Percent"]
            features["Power_Supply_Type"] = usage_row["Power_Supply_Type"]
            
        # Environmental factors
        if env_row is not None:
            features["Environmental_Risk_Score"] = env_row["Environmental_Risk_Score"]
            features["Average_Temperature_C"] = env_row["Average_Temperature_C"]
            features["Contamination_Level"] = env_row["Contamination_Level"]
            features["Voltage_Fluctuation_Count"] = env_row["Voltage_Fluctuation_Count"]
            features["Average_Humidity_Percent"] = env_row["Average_Humidity_Percent"]
            features["Dust_Level"] = env_row["Dust_Level"]
            features["Operating_Location"] = env_row["Operating_Location"]
            
        # Errors past 7, 30, 90 days
        err_df = self.df_err[self.df_err["Device_ID"] == device_id]
        err_subset = err_df[err_df["Signal_Date"] <= T]
        for window in [7, 30, 90]:
            t_start = T - pd.Timedelta(days=window)
            w_errs = err_subset[err_subset["Signal_Date"] >= t_start]
            features[f"Errors_Last_{window}_Days"] = float(w_errs["Total_Error_Count"].sum())
            features[f"Alarms_Last_{window}_Days"] = float(w_errs["Alarm_Frequency"].sum())
            features[f"Warnings_Last_{window}_Days"] = float(w_errs["Warning_Frequency"].sum())
            features[f"Abnormal_Sensors_Last_{window}_Days"] = float(w_errs["Abnormal_Sensor_Readings"].sum())
            features[f"Battery_Errors_Last_{window}_Days"] = float(w_errs["Battery_Error_Count"].sum())
            features[f"Power_Errors_Last_{window}_Days"] = float(w_errs["Power_Error_Count"].sum())
            features[f"Sensor_Errors_Last_{window}_Days"] = float(w_errs["Sensor_Error_Count"].sum())
            features[f"System_Resets_Last_{window}_Days"] = float(w_errs["System_Reset_Count"].sum())
            
        # Maintenance past 90, 365
        maint_df = self.df_maint[self.df_maint["Device_ID"] == device_id]
        maint_subset = maint_df[maint_df["Maintenance_Date"] <= T]
        if len(maint_subset) > 0:
            last_maint = maint_subset.sort_values("Maintenance_Date").iloc[-1]
            features["Days_Since_Last_Maintenance"] = float((T - last_maint["Maintenance_Date"]).days)
            features["Last_Maintenance_Quality"] = float(last_maint["Maintenance_Quality_Score"])
        else:
            features["Days_Since_Last_Maintenance"] = float(age_days)
            features["Last_Maintenance_Quality"] = 100.0
            
        features["Maintenance_Count_Last_90_Days"] = float(len(maint_subset[maint_subset["Maintenance_Date"] >= (T - pd.Timedelta(days=90))]))
        features["Maintenance_Count_Last_365_Days"] = float(len(maint_subset[maint_subset["Maintenance_Date"] >= (T - pd.Timedelta(days=365))]))
        
        # Failure history
        fail_df = self.df_fail[self.df_fail["Device_ID"] == device_id]
        fail_subset = fail_df[fail_df["Failure_Date"] <= T]
        features["Previous_Failure_Count"] = float(len(fail_subset))
        if len(fail_subset) > 0:
            last_fail = fail_subset.sort_values("Failure_Date").iloc[-1]
            features["Days_Since_Last_Failure"] = float((T - last_fail["Failure_Date"]).days)
        else:
            features["Days_Since_Last_Failure"] = 9999.0
            
        # Recall Status
        recall_df = self.df_recall[self.df_recall["Device_ID"] == device_id]
        recall_subset = recall_df[recall_df["Recall_Date"] <= T]
        features["Recall_Active"] = 1.0 if len(recall_subset) > 0 else 0.0
        
        return features

    def run_device_report(self, device_id, T=None, live_payload=None):
        self.load_models()
        
        if T is None:
            # default to latest date in the datasets
            T = pd.Timestamp("2026-08-13")
        else:
            T = pd.to_datetime(T)
            
        # Build features
        features_dict = self._build_live_feature_row(device_id, T)
        if features_dict is None:
            return {"error": f"Device {device_id} not found in the registry."}
            
        if live_payload:
            from backend.services.inference_worker import update_features_with_telemetry
            features_dict = update_features_with_telemetry(features_dict, live_payload)
            
        # Format feature row matching training columns
        feature_cols = self.schema["features"]
        categorical_cols = self.schema["categorical_features"]
        category_mappings = self.schema["category_mappings"]
        
        df_inst = pd.DataFrame([features_dict])
        
        # Map categoricals
        for col in categorical_cols:
            df_inst[col] = df_inst[col].astype(str).fillna("Unknown")
            mapping = category_mappings.get(col, {})
            df_inst[col] = df_inst[col].map(mapping).fillna(-1).astype(int)
            
        # Handle missing columns if any
        for col in feature_cols:
            if col not in df_inst.columns:
                df_inst[col] = 0.0
                
        X_inst = df_inst[feature_cols]
        
        # Predict failure probability
        prob = float(self.clf_model.predict_proba(X_inst)[0, 1])
        
        # Calculate Risk Level
        if prob <= 0.30:
            risk_level = "LOW"
        elif prob <= 0.60:
            risk_level = "MEDIUM"
        elif prob <= 0.80:
            risk_level = "HIGH"
        else:
            risk_level = "CRITICAL"
            
        # Predict RUL (Days until failure)
        predicted_rul = float(self.rul_model.predict(X_inst)[0])
        # clip RUL at positive numbers
        predicted_rul = max(1.0, round(predicted_rul, 1))
        
        # Unsupervised Anomaly Score
        # operational signals list used during training
        with open(os.path.join(self.models_dir, "anomaly_metadata.json"), "r") as amf:
            anomaly_meta = json.load(amf)
        anomaly_features = anomaly_meta["anomaly_features"]
        X_anomaly = df_inst[anomaly_features]
        
        anomaly_pred = self.anomaly_model.predict(X_anomaly)[0]
        # Isolation Forest returns -1 for anomalies, 1 for normal
        anomaly_score = float(self.anomaly_model.decision_function(X_anomaly)[0])
        # Normalize decision function to a 0-100 anomaly scale
        # decision function values range roughly between -0.5 and 0.5
        anom_score_norm = round(max(0.0, min(100.0, (0.5 - anomaly_score) * 100.0)), 1)
        anomaly_status = "Abnormal" if anomaly_pred == -1 else "Normal"
        
        # Compute SHAP explanation
        shap_contribs = explain_prediction(self.clf_model, X_inst, self.background_df)
        
        # Filter failures and maintenance history for this device
        fails = self.df_fail[self.df_fail["Device_ID"] == device_id]
        maint = self.df_maint[self.df_maint["Device_ID"] == device_id]
        
        # Compute Component-level health
        device_type = features_dict["Device_Type"]
        health_results = calculate_component_health(
            device_type=device_type,
            feature_row=features_dict,
            shap_contributions=shap_contribs,
            failure_history=fails,
            maintenance_history=maint
        )
        
        # Identify Root Cause
        root_cause_results = analyze_root_cause(features_dict, shap_contribs)
        
        # Get RAG Advisor recommendations
        rag_results = self.rag_advisor.get_maintenance_advice(device_type, root_cause_results["primary"])
        
        # Assemble overall response matching GET /api/v1/devices/{device_id}/health
        # Maintainence Priority defaults to Risk Level
        maintenance_priority = risk_level
        
        return {
            "device_id": device_id,
            "device_type": device_type,
            "device_category": features_dict["Device_Category"],
            "manufacturer": features_dict["Manufacturer"],
            "overall_health": health_results["overall_health"],
            "failure_probability": round(prob, 4),
            "risk_level": risk_level,
            "predicted_failure_time_days": predicted_rul,
            "components": health_results["components"],
            "component_details": health_results["details"],
            "root_cause": {
                "primary": root_cause_results["primary"],
                "confidence": root_cause_results["confidence"],
                "contributing_factors": root_cause_results["contributing_factors"],
                "evidence": root_cause_results["evidence"]
            },
            "anomaly": {
                "score": anom_score_norm,
                "status": anomaly_status
            },
            "maintenance": {
                "priority": maintenance_priority,
                "recommended_action": rag_results["recommended_action"],
                "source": rag_results["source"],
                "evidence": rag_results["evidence"]
            },
            "explanation": shap_contribs[:5] # Return top 5 SHAP factors
        }
