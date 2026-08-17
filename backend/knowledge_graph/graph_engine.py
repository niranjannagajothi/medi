import pandas as pd
import numpy as np
import os
import networkx as nx
import json

from backend import paths

class MedicalDeviceGraphEngine:
    def __init__(self):
        self.data_dir = paths.DATA_RAW_DIR
        self.models_dir = paths.MODELS_DIR
        
        self.df_info = None
        self.df_fail = None
        self.df_err = None
        self.df_maint = None
        self.df_recall = None
        self.ontology = {}
        
    def _lazy_load(self):
        if self.df_info is None:
            print("Loading knowledge graph raw data...")
            self.df_info = pd.read_csv(os.path.join(self.data_dir, "device_information_cleaned.csv"))
            self.df_fail = pd.read_csv(os.path.join(self.data_dir, "failure_history_cleaned.csv"))
            self.df_err = pd.read_csv(os.path.join(self.data_dir, "error_operational_signals_cleaned.csv"))
            self.df_maint = pd.read_csv(os.path.join(self.data_dir, "maintenance_history_cleaned.csv"))
            self.df_recall = pd.read_csv(os.path.join(self.data_dir, "safety_recall_information_cleaned.csv"))
            
            # Load ontology mapping
            ont_path = os.path.join(self.models_dir, "component_ontology.json")
            if os.path.exists(ont_path):
                with open(ont_path, "r") as jf:
                    self.ontology = json.load(jf)
                    
    def get_device_subgraph(self, device_id):
        self._lazy_load()
        
        # Initialize NetworkX graph
        G = nx.DiGraph()
        
        # 1. Add Device Node
        dev_rows = self.df_info[self.df_info["Device_ID"] == device_id]
        if len(dev_rows) == 0:
            return {"nodes": [], "edges": []}
            
        dev = dev_rows.iloc[0]
        dtype = str(dev["Device_Type"])
        
        G.add_node(device_id, label=device_id, type="Device", category=str(dev["Device_Category"]), device_type=dtype)
        
        # Add Department Location node
        dept = str(dev.get("Region", "ICU"))  # Map to Region or Operating_Location
        # Let's check environment for operating location
        env_rows = self.df_recall[self.df_recall["Device_ID"] == device_id] # Wait, recall has no operating location. Environmental factors does.
        env_path = os.path.join(self.data_dir, "environmental_factors_cleaned.csv")
        if os.path.exists(env_path):
            try:
                df_env = pd.read_csv(env_path)
                env_row = df_env[df_env["Device_ID"] == device_id]
                if len(env_row) > 0:
                    dept = str(env_row.iloc[0]["Operating_Location"])
            except:
                pass
                
        dept_id = f"DEPT_{dept.replace(' ', '_')}"
        G.add_node(dept_id, label=dept, type="Department")
        G.add_edge(device_id, dept_id, relationship="OPERATES_IN")
        
        # Add Manufacturer node
        mfr = str(dev["Manufacturer"])
        mfr_id = f"MFR_{mfr.replace(' ', '_')}"
        G.add_node(mfr_id, label=mfr, type="Manufacturer")
        G.add_edge(device_id, mfr_id, relationship="MANUFACTURED_BY")
        
        # 2. Add Component Nodes (from Ontology)
        comps = self.ontology.get(dtype, ["Battery", "Power Supply", "Control Board", "Display Module", "Sensor"])
        for comp in comps:
            comp_id = f"{device_id}_{comp.replace(' ', '_')}"
            G.add_node(comp_id, label=comp, type="Component")
            G.add_edge(device_id, comp_id, relationship="HAS_COMPONENT")
            
        # 3. Add Failure History Nodes
        fails = self.df_fail[self.df_fail["Device_ID"] == device_id]
        for idx, f in fails.iterrows():
            f_id = str(f["Failure_ID"])
            f_type = str(f["Failure_Type"])
            f_cause = str(f["Failure_Cause"])
            failed_comp = str(f["Failed_Component"])
            
            # Failure Node
            G.add_node(f_id, label=f"Failure: {f_type}", type="Failure", failure_type=f_type, severity=str(f["Failure_Severity"]))
            G.add_edge(device_id, f_id, relationship="EXPERIENCED_FAILURE")
            
            # Cause Node
            cause_id = f"CAUSE_{f_cause.replace(' ', '_').replace('/', '_')}"
            G.add_node(cause_id, label=f_cause, type="FailureCause")
            G.add_edge(f_id, cause_id, relationship="CAUSED_BY")
            
            # Link Failure to Component if matched
            if failed_comp in comps:
                comp_id = f"{device_id}_{failed_comp.replace(' ', '_')}"
                G.add_edge(f_id, comp_id, relationship="AFFECTED_COMPONENT")
                
        # 4. Add Active Recall Node
        recalls = self.df_recall[self.df_recall["Device_ID"] == device_id]
        for idx, r in recalls.iterrows():
            if r.get("Has_Recall") == 1:
                r_id = str(r["Safety_Record_ID"])
                r_reason = str(r["Recall_Reason"])
                G.add_node(r_id, label="Safety Recall", type="Recall", reason=r_reason)
                G.add_edge(device_id, r_id, relationship="AFFECTED_BY_RECALL")
                
        # 5. Add Recent Errors Codes
        errors = self.df_err[self.df_err["Device_ID"] == device_id].sort_values("Signal_Date", ascending=False).head(5)
        for idx, err in errors.iterrows():
            err_code = str(err["Error_Code"])
            err_id = f"{device_id}_{err_code}"
            G.add_node(err_id, label=err_code, type="ErrorCode")
            G.add_edge(device_id, err_id, relationship="TRIGGERED_ERROR")
            
            # If the error code mentions component keywords, link to component
            for comp in comps:
                comp_short = comp.lower().split(" ")[0]
                if comp_short in err_code.lower():
                    comp_id = f"{device_id}_{comp.replace(' ', '_')}"
                    G.add_edge(err_id, comp_id, relationship="INDICATES_FAULT")
                    
        # Format graph data for frontend d3/react-flow/cytoscape visualization
        nodes = []
        for n, data in G.nodes(data=True):
            node_data = {"id": n}
            node_data.update(data)
            nodes.append(node_data)
            
        edges = []
        for u, v, data in G.edges(data=True):
            edges.append({
                "source": u,
                "target": v,
                "relationship": data.get("relationship", "LINKS_TO")
            })
            
        return {"nodes": nodes, "edges": edges}
