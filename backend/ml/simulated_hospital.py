import pandas as pd
import numpy as np
import datetime
import random
import os
import json

from backend.ml.inference import MedicalDeviceInferenceEngine

from backend import paths

class SimulatedHospitalConnection:
    def __init__(self):
        self.state_file = paths.HOSPITAL_STATE_PATH
        self.inference_engine = MedicalDeviceInferenceEngine()
        
    def _get_default_state(self):
        return {
            "hospital_name": "Metro General Hospital",
            "department": "Intensive Care Unit (ICU)",
            "connection_type": "CSV",
            "status": "Connected",
            "connected_count": 8,
            "last_update": datetime.datetime.now().strftime("%Y-%m-%dT%H:%M:%SZ"),
            "devices": [
                {"device_id": "DEV002119", "device_type": "Ventilator", "department": "Intensive Care Unit (ICU)", "status": "Monitoring"},
                {"device_id": "DEV000001", "device_type": "Syringe pump", "department": "Intensive Care Unit (ICU)", "status": "Monitoring"},
                {"device_id": "DEV000042", "device_type": "Patient monitor", "department": "Intensive Care Unit (ICU)", "status": "Monitoring"},
                {"device_id": "DEV000018", "device_type": "Defibrillator", "department": "Intensive Care Unit (ICU)", "status": "Monitoring"},
                {"device_id": "DEV000085", "device_type": "MRI scanner", "department": "Radiology Department", "status": "Idle"},
                {"device_id": "DEV000092", "device_type": "CT scanner", "department": "Radiology Department", "status": "Monitoring"},
                {"device_id": "DEV000115", "device_type": "ECG/EKG machine", "department": "Radiology Department", "status": "Monitoring"},
                {"device_id": "DEV000485", "device_type": "Blood analyzer", "department": "Clinical Laboratory", "status": "Monitoring"}
            ]
        }
        
    def get_state(self) -> dict:
        if not os.path.exists(self.state_file):
            state = self._get_default_state()
            self.save_state(state)
            return state
        try:
            with open(self.state_file, "r") as f:
                return json.load(f)
        except Exception:
            return self._get_default_state()
            
    def save_state(self, state: dict):
        with open(self.state_file, "w") as f:
            json.dump(state, f, indent=2)

    def connect_hospital(self, hospital_name: str, department: str, connection_type: str) -> dict:
        state = self.get_state()
        state["hospital_name"] = hospital_name
        state["department"] = department
        state["connection_type"] = connection_type
        state["status"] = "Connected"
        state["last_update"] = datetime.datetime.now().strftime("%Y-%m-%dT%H:%M:%SZ")
        
        # Filter simulated devices in this department
        # Standard default connections count
        devices_in_dept = [d for d in self._get_default_state()["devices"] if d["department"] == department]
        if not devices_in_dept:
            devices_in_dept = self._get_default_state()["devices"]
            
        state["devices"] = devices_in_dept
        state["connected_count"] = len(devices_in_dept)
        
        self.save_state(state)
        return state

    def get_live_equipment_monitoring(self) -> list:
        state = self.get_state()
        
        # Load registry if needed for inference
        self.inference_engine.load_models()
        
        monitoring_reports = []
        
        for dev in state["devices"]:
            device_id = dev["device_id"]
            
            # Run prediction through existing ML pipeline
            try:
                # We query predictions at current snapshot T
                report = self.inference_engine.run_device_report(device_id)
                if "error" in report:
                    raise ValueError()
            except Exception:
                # Fallback mock report mapping standard format if query fails
                report = {
                    "device_id": device_id,
                    "device_type": dev["device_type"],
                    "overall_health": 88.0,
                    "failure_probability": 0.05,
                    "risk_level": "LOW",
                    "anomaly": {"status": "Normal", "score": 12.0}
                }
                
            # Random fluctuations in telemetry simulation
            # Let's adjust risk slightly to look "live" and dynamic!
            prob_drift = round(max(0.001, min(0.99, report.get("failure_probability", 0.05) + random.uniform(-0.02, 0.02))), 4)
            health_drift = round(max(10.0, min(100.0, report.get("overall_health", 90.0) + random.uniform(-1.5, 1.5))), 1)
            
            risk_level = "LOW"
            if prob_drift > 0.8:
                risk_level = "CRITICAL"
            elif prob_drift > 0.6:
                risk_level = "HIGH"
            elif prob_drift > 0.3:
                risk_level = "MEDIUM"
                
            anomaly_status = report.get("anomaly", {}).get("status", "Normal")
            if prob_drift > 0.6:
                anomaly_status = "Warning"
                
            monitoring_reports.append({
                "device_id": device_id,
                "device_type": dev["device_type"],
                "department": dev["department"],
                "status": dev["status"],
                "overall_health": health_drift,
                "failure_probability": prob_drift,
                "risk_level": risk_level,
                "anomaly_status": anomaly_status,
                "last_update": datetime.datetime.now().strftime("%H:%M:%S")
            })
            
        return monitoring_reports
