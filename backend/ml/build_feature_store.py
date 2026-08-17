import pandas as pd
import numpy as np
import os
import time
import json

from backend import paths

def run_build_feature_store():
    data_dir = paths.DATA_RAW_DIR
    processed_dir = paths.DATA_PROCESSED_DIR
    artifacts_dir = paths.ARTIFACTS_DIR
    
    os.makedirs(processed_dir, exist_ok=True)
    os.makedirs(artifacts_dir, exist_ok=True)
    
    print("Loading raw datasets...")
    df_info = pd.read_csv(os.path.join(data_dir, "device_information_cleaned.csv"))
    df_env = pd.read_csv(os.path.join(data_dir, "environmental_factors_cleaned.csv"))
    df_err = pd.read_csv(os.path.join(data_dir, "error_operational_signals_cleaned.csv"))
    df_fail = pd.read_csv(os.path.join(data_dir, "failure_history_cleaned.csv"))
    df_maint = pd.read_csv(os.path.join(data_dir, "maintenance_history_cleaned.csv"))
    df_recall = pd.read_csv(os.path.join(data_dir, "safety_recall_information_cleaned.csv"))
    df_usage = pd.read_csv(os.path.join(data_dir, "usage_operating_factors_cleaned.csv"))
    df_mfr = pd.read_csv(os.path.join(data_dir, "manufacturer_factors_cleaned.csv"))

    # Convert date columns
    df_info["Installation_Date"] = pd.to_datetime(df_info["Installation_Date"])
    df_err["Signal_Date"] = pd.to_datetime(df_err["Signal_Date"])
    df_fail["Failure_Date"] = pd.to_datetime(df_fail["Failure_Date"])
    df_maint["Maintenance_Date"] = pd.to_datetime(df_maint["Maintenance_Date"])
    df_recall["Recall_Date"] = pd.to_datetime(df_recall["Recall_Date"])

    # Pre-group transactional tables for fast O(1) lookup
    print("Indexing datasets by Device_ID...")
    err_by_device = {k: v for k, v in df_err.groupby("Device_ID")}
    fail_by_device = {k: v for k, v in df_fail.groupby("Device_ID")}
    maint_by_device = {k: v for k, v in df_maint.groupby("Device_ID")}
    recall_by_device = {k: v for k, v in df_recall.groupby("Device_ID")}
    env_by_device = df_env.set_index("Device_ID").to_dict(orient="index")
    usage_by_device = df_usage.set_index("Device_ID").to_dict(orient="index")
    info_by_device = df_info.set_index("Device_ID").to_dict(orient="index")

    # Helper function to engineer features for a single snapshot (device_id, T)
    def build_features_for_snapshot(device_id, T):
        dev_row = info_by_device.get(device_id)
        if dev_row is None:
            return None
        env_row = env_by_device.get(device_id)
        usage_row = usage_by_device.get(device_id)
        
        install_date = dev_row["Installation_Date"]
        age_days = (T - install_date).days
        if age_days < 0:
            return None
            
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
        
        # Usage approximations at T
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
            
        # Error signal rollups
        err_df = err_by_device.get(device_id)
        if err_df is not None:
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
        else:
            for window in [7, 30, 90]:
                features[f"Errors_Last_{window}_Days"] = 0.0
                features[f"Alarms_Last_{window}_Days"] = 0.0
                features[f"Warnings_Last_{window}_Days"] = 0.0
                features[f"Abnormal_Sensors_Last_{window}_Days"] = 0.0
                features[f"Battery_Errors_Last_{window}_Days"] = 0.0
                features[f"Power_Errors_Last_{window}_Days"] = 0.0
                features[f"Sensor_Errors_Last_{window}_Days"] = 0.0
                features[f"System_Resets_Last_{window}_Days"] = 0.0
                
        # Maintenance events
        maint_df = maint_by_device.get(device_id)
        if maint_df is not None:
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
        else:
            features["Days_Since_Last_Maintenance"] = float(age_days)
            features["Last_Maintenance_Quality"] = 100.0
            features["Maintenance_Count_Last_90_Days"] = 0.0
            features["Maintenance_Count_Last_365_Days"] = 0.0
            
        # Failure history rollups
        fail_df = fail_by_device.get(device_id)
        if fail_df is not None:
            fail_subset = fail_df[fail_df["Failure_Date"] <= T]
            features["Previous_Failure_Count"] = float(len(fail_subset))
            if len(fail_subset) > 0:
                last_fail = fail_subset.sort_values("Failure_Date").iloc[-1]
                features["Days_Since_Last_Failure"] = float((T - last_fail["Failure_Date"]).days)
            else:
                features["Days_Since_Last_Failure"] = 9999.0
        else:
            features["Previous_Failure_Count"] = 0.0
            features["Days_Since_Last_Failure"] = 9999.0
            
        # Recall status
        recall_df = recall_by_device.get(device_id)
        if recall_df is not None:
            recall_subset = recall_df[recall_df["Recall_Date"] <= T]
            features["Recall_Active"] = 1.0 if len(recall_subset) > 0 else 0.0
        else:
            features["Recall_Active"] = 0.0
            
        return features

    # Generate the snapshot list using optimized sampling
    print("Generating snapshots...")
    snapshots_to_build = []
    
    # Max date in datasets to limit sampling
    max_dataset_date = pd.Timestamp("2026-08-13")
    
    for device_id in df_info["Device_ID"].unique():
        dev_row = info_by_device.get(device_id)
        if dev_row is None:
            continue
        install_date = dev_row["Installation_Date"]
        
        # 1. Positives: sample at most 1 positive snapshot per failed device
        fail_df = fail_by_device.get(device_id)
        fail_dates = []
        if fail_df is not None:
            fail_dates = fail_df["Failure_Date"].dropna().tolist()
            if len(fail_dates) > 0:
                # Sample pre-failure date for the first failure
                f_date = fail_dates[0]
                snap_date = f_date - pd.Timedelta(days=7)
                if snap_date > install_date + pd.Timedelta(days=10):
                    snapshots_to_build.append((device_id, snap_date))
                        
        # 2. Negatives: sample exactly 1 negative snapshot per device
        random_days = np.random.randint(10, max(15, (max_dataset_date - install_date).days))
        snap_date = install_date + pd.Timedelta(days=random_days)
        
        # Check safety (not within 30 days before any failure date)
        is_safe = True
        for f_date in fail_dates:
            if snap_date <= f_date and snap_date >= f_date - pd.Timedelta(days=30):
                is_safe = False
                break
        
        if is_safe and snap_date <= max_dataset_date:
            snapshots_to_build.append((device_id, snap_date))

    print(f"Sampling planned: {len(snapshots_to_build):,} snapshots.")
    
    # Build features
    print("Building features for all snapshots...")
    t0 = time.time()
    feature_rows = []
    checkpoint_t = time.time()
    for idx, (device_id, snap_date) in enumerate(snapshots_to_build):
        feat = build_features_for_snapshot(device_id, snap_date)
        if feat is not None:
            feature_rows.append(feat)
            
        if (idx + 1) % 5000 == 0:
            print(f"Processed {idx+1}/{len(snapshots_to_build)} rows in {time.time()-checkpoint_t:.2f}s...")
            checkpoint_t = time.time()
            
    print(f"Finished building feature table in {time.time()-t0:.2f}s.")
    
    df_store = pd.DataFrame(feature_rows)
    
    # Calculate target labels for horizons: 7 days, 14 days, 30 days
    print("Computing horizon labels...")
    t0 = time.time()
    
    targets_7 = []
    targets_14 = []
    targets_30 = []
    days_to_fail = []
    
    for idx, row in df_store.iterrows():
        d_id = row["Device_ID"]
        s_date = row["Snapshot_Date"]
        fail_df = fail_by_device.get(d_id)
        
        t7, t14, t30 = 0.0, 0.0, 0.0
        dt = 9999.0
        
        if fail_df is not None:
            subsequent = fail_df[fail_df["Failure_Date"] > s_date]
            if len(subsequent) > 0:
                next_fail_date = subsequent["Failure_Date"].min()
                diff_days = float((next_fail_date - s_date).days)
                dt = diff_days
                if diff_days <= 7:
                    t7 = 1.0
                if diff_days <= 14:
                    t14 = 1.0
                if diff_days <= 30:
                    t30 = 1.0
                    
        targets_7.append(t7)
        targets_14.append(t14)
        targets_30.append(t30)
        days_to_fail.append(dt)
        
    df_store["Failure_Next_7_Days"] = targets_7
    df_store["Failure_Next_14_Days"] = targets_14
    df_store["Failure_Next_30_Days"] = targets_30
    df_store["Days_Until_Next_Failure"] = days_to_fail
    
    print(f"Labels computed in {time.time()-t0:.2f}s.")
    print("Target 30-day class distribution:")
    print(df_store["Failure_Next_30_Days"].value_counts())
    
    # Save processed dataframe
    output_parquet = os.path.join(processed_dir, "device_feature_store.parquet")
    df_store.to_parquet(output_parquet, index=False)
    print(f"Feature store saved to: {output_parquet}")

    # Generate Feature Dictionary
    feature_dictionary = {
        "Device_ID": "Unique identifier of the medical device.",
        "Snapshot_Date": "The historical timestamp at which features are evaluated.",
        "Device_Type": "The category of medical device (e.g. Ventilator, Ultrasound).",
        "Device_Category": "High-level grouping (e.g. Life-Support Devices, Diagnostic Devices).",
        "Manufacturer": "Device manufacturer.",
        "Device_Age_Days": "Days elapsed since the device was installed in the hospital.",
        "Warranty_Status": "Warranty state (Active, Expired, Void).",
        "Device_Generation": "Hardware generation identifier.",
        "Approx_Operating_Hours": "Estimated cumulative operational hours up to the snapshot date.",
        "Approx_Battery_Cycles": "Estimated battery charge cycles up to the snapshot date.",
        "Approx_Battery_Health": "Estimated battery capacity percentage (decayed linearly over age).",
        "Sensor_Usage_Intensity": "Operational load of sensor components (static).",
        "Load_Stress_Gap": "Safety factor representing load stress headroom (static).",
        "Average_Load_Percent": "Average device operational load percentage (static).",
        "Peak_Load_Percent": "Peak operational load percentage recorded (static).",
        "Power_Supply_Type": "Power source configuration (AC Mains, Battery Backup, etc.).",
        "Environmental_Risk_Score": "Overall environmental hazard score (static).",
        "Average_Temperature_C": "Average operating environment temperature (static).",
        "Contamination_Level": "Level of ambient contamination recorded (static).",
        "Voltage_Fluctuation_Count": "Number of power fluctuations recorded in location (static).",
        "Average_Humidity_Percent": "Average relative humidity of location (static).",
        "Dust_Level": "Particulate dust levels in location (static).",
        "Operating_Location": "Hospital department/room where device is operating (static).",
        "Errors_Last_7_Days": "Cumulative count of error signals in the past 7 days.",
        "Alarms_Last_7_Days": "Cumulative count of operational alarms triggered in the past 7 days.",
        "Warnings_Last_7_Days": "Cumulative count of warnings in the past 7 days.",
        "Abnormal_Sensors_Last_7_Days": "Frequency of anomalous sensor events in the past 7 days.",
        "Battery_Errors_Last_7_Days": "Count of battery faults in the past 7 days.",
        "Power_Errors_Last_7_Days": "Count of power unit faults in the past 7 days.",
        "Sensor_Errors_Last_7_Days": "Count of sensor errors in the past 7 days.",
        "System_Resets_Last_7_Days": "Count of system resets in the past 7 days.",
        "Errors_Last_30_Days": "Cumulative count of error signals in the past 30 days.",
        "Alarms_Last_30_Days": "Cumulative count of operational alarms triggered in the past 30 days.",
        "Warnings_Last_30_Days": "Cumulative count of warnings in the past 30 days.",
        "Abnormal_Sensors_Last_30_Days": "Frequency of anomalous sensor events in the past 30 days.",
        "Battery_Errors_Last_30_Days": "Count of battery faults in the past 30 days.",
        "Power_Errors_Last_30_Days": "Count of power unit faults in the past 30 days.",
        "Sensor_Errors_Last_30_Days": "Count of sensor errors in the past 30 days.",
        "System_Resets_Last_30_Days": "Count of system resets in the past 30 days.",
        "Errors_Last_90_Days": "Cumulative count of error signals in the past 90 days.",
        "Alarms_Last_90_Days": "Cumulative count of operational alarms triggered in the past 90 days.",
        "Warnings_Last_90_Days": "Cumulative count of warnings in the past 90 days.",
        "Abnormal_Sensors_Last_90_Days": "Frequency of anomalous sensor events in the past 90 days.",
        "Battery_Errors_Last_90_Days": "Count of battery faults in the past 90 days.",
        "Power_Errors_Last_90_Days": "Count of power unit faults in the past 90 days.",
        "Sensor_Errors_Last_90_Days": "Count of sensor errors in the past 90 days.",
        "System_Resets_Last_90_Days": "Count of system resets in the past 90 days.",
        "Days_Since_Last_Maintenance": "Days since the most recent maintenance service.",
        "Last_Maintenance_Quality": "Quality score of the last completed maintenance service.",
        "Maintenance_Count_Last_90_Days": "Count of maintenance visits in the past 90 days.",
        "Maintenance_Count_Last_365_Days": "Count of maintenance visits in the past 365 days.",
        "Previous_Failure_Count": "Number of failures occurred prior to snapshot date.",
        "Days_Since_Last_Failure": "Days since the most recent failure event.",
        "Recall_Active": "Flag indicating if a recall notice was active for this device type/model.",
        "Failure_Next_7_Days": "Target label (1 if failed in next 7 days, else 0).",
        "Failure_Next_14_Days": "Target label (1 if failed in next 14 days, else 0).",
        "Failure_Next_30_Days": "Target label (1 if failed in next 30 days, else 0).",
        "Days_Until_Next_Failure": "Regression target representing RUL in days."
    }

    with open(os.path.join(artifacts_dir, "feature_dictionary.json"), "w") as fd_out:
        json.dump(feature_dictionary, fd_out, indent=2)
    print("Feature dictionary written to artifacts/feature_dictionary.json.")

if __name__ == "__main__":
    run_build_feature_store()
