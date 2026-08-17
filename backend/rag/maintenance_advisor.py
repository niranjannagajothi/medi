import pandas as pd
import numpy as np
import os
import re
import json
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from backend.database import get_db_connection

from backend import paths

class RAGMaintenanceAdvisor:
    def __init__(self):
        self.data_dir = paths.DATA_RAW_DIR
        self.vectorizer = TfidfVectorizer(stop_words='english')
        
        # We will index on demand per hospital_id to enforce multi-tenant isolation
        self.docs = []
        self.metadata = []
        self.current_hospital_id = None
        self.tfidf_matrix = None
        
    def build_index(self, hospital_id: str = None, force: bool = False):
        # Only skip re-indexing if not forced and hospital tenant context hasn't changed
        if not force and self.tfidf_matrix is not None and self.current_hospital_id == hospital_id:
            return
            
        print(f"Indexing safety recalls and tenant-isolated manuals for hospital_id={hospital_id} (force={force})...")
        
        self.docs = []
        self.metadata = []
        self.current_hospital_id = hospital_id
        
        recall_path = os.path.join(self.data_dir, "safety_recall_information_cleaned.csv")
        events_path = os.path.join(self.data_dir, "events-1681209680.csv")
        device_path = os.path.join(self.data_dir, "device_information_cleaned.csv")
        
        # Load registry to match device types
        device_types = {}
        if os.path.exists(device_path):
            try:
                df_dev = pd.read_csv(device_path)
                device_types = df_dev.set_index("Device_ID")["Device_Type"].to_dict()
            except Exception:
                pass
            
        # 1. Load Safety Recall info (Global context)
        if os.path.exists(recall_path):
            try:
                df_rec = pd.read_csv(recall_path)
                for idx, row in df_rec.iterrows():
                    d_id = row.get("Device_ID")
                    d_type = device_types.get(d_id, "Medical Device")
                    reason = str(row.get("Recall_Reason", ""))
                    action = str(row.get("Corrective_Action", ""))
                    classification = str(row.get("Recall_Classification", "Class II"))
                    
                    if len(reason) > 5 or len(action) > 5:
                        doc_text = f"Device Type: {d_type}. Classification: {classification}. Recall Reason: {reason}. Corrective Action: {action}."
                        self.docs.append(doc_text)
                        self.metadata.append({
                            "source": "Safety Recall Database",
                            "device_type": d_type,
                            "classification": classification,
                            "action": action,
                            "reason": reason,
                            "is_custom": False
                        })
            except Exception as e:
                print(f"Warning loading safety recall info: {e}")
                    
        # 2. Load Raw ICIJ events (Global context, limit to 1000 rows)
        if os.path.exists(events_path):
            try:
                df_ev = pd.read_csv(events_path, nrows=1000)
                for idx, row in df_ev.iterrows():
                    reason = str(row.get("reason", ""))
                    cause = str(row.get("determined_cause", ""))
                    summary = str(row.get("action_summary", ""))
                    slug = str(row.get("slug", ""))
                    
                    device_name = slug.replace("tur-", "").replace("-", " ").title()
                    
                    if len(reason) > 10 or len(summary) > 10:
                        doc_text = f"Device Name: {device_name}. Reason: {reason}. Cause: {cause}. Action Summary: {summary}."
                        self.docs.append(doc_text)
                        self.metadata.append({
                            "source": "ICIJ Events Registry",
                            "device_type": device_name,
                            "classification": "Safety Alert",
                            "action": summary,
                            "reason": reason,
                            "is_custom": False
                        })
            except Exception as e:
                print(f"Warning loading ICIJ events: {e}")

        # 3. Load Tenant-Isolated Custom Uploaded Document Manuals from SQLite
        if hospital_id:
            try:
                conn = get_db_connection()
                cursor = conn.cursor()
                cursor.execute("""
                SELECT c.text_content, c.section, c.page, d.filename, d.device_type, d.manufacturer
                FROM rag_chunks c
                JOIN maintenance_documents d ON c.document_id = d.document_id
                WHERE c.hospital_id = ? AND d.status = 'enabled'
                """, (hospital_id,))
                
                rows = cursor.fetchall()
                for row in rows:
                    filename = row["filename"]
                    dev_type = row["device_type"]
                    mfr = row["manufacturer"]
                    section = row["section"]
                    chunk_text = row["text_content"]
                    page = row["page"]
                    
                    doc_text = f"Manual Document: {filename}. Device Type: {dev_type}. Manufacturer: {mfr}. Section: {section}. Content: {chunk_text}"
                    self.docs.append(doc_text)
                    self.metadata.append({
                        "source": filename,
                        "device_type": dev_type,
                        "manufacturer": mfr,
                        "classification": "Verified Maintenance Manual",
                        "action": chunk_text,
                        "reason": f"{dev_type} component troubleshooting",
                        "section": section,
                        "page": page,
                        "is_custom": True
                    })
                conn.close()
            except Exception as e:
                print(f"Warning loading custom knowledge manuals from SQLite: {e}")
                
        # 4. Handle Empty Document Store Fallback
        if len(self.docs) == 0:
            print("No documents found. Loading default template knowledge base.")
            self._load_fallback_docs()
            
        # Fit TF-IDF matrix
        self.tfidf_matrix = self.vectorizer.fit_transform(self.docs)
        print(f"Indexed {len(self.docs)} safety and manual documents for tenant {hospital_id}.")
        
    def _load_fallback_docs(self):
        fallback_data = [
            ("Ventilator", "Battery Degradation", "Inspect battery backup modules. Replace degraded battery pack with approved manufacturer replacement cell. Calibrate power sensors.", "Class I Recall"),
            ("Ventilator", "Oxygen System Flow Sensor", "Inspect oxygen intake valves. Calibrate O2 flow sensors. Perform circuit leak test before returning to service.", "Field Safety Notice"),
            ("CT scanner", "Cooling System Leak", "Inspect gantry heat exchanger lines for blockages. Flush coolant system. Replace sealing rings and torque fittings.", "Class II Recall"),
            ("Infusion pump", "Software Fault / Occlusion Alert", "Update firmware to current revision. Re-verify occlusion pressure thresholds. Run self-diagnostic routine.", "Software Alert"),
            ("ECG/EKG machine", "Lead Cable / Electrode Noise", "Replace worn lead cables. Clean patient connections. Run validation tests against external wave simulator.", "Maintenance Alert")
        ]
        for dtype, cause, action, classification in fallback_data:
            doc_text = f"Device Type: {dtype}. Failure Cause: {cause}. Recommended Action: {action}. Alert Type: {classification}."
            self.docs.append(doc_text)
            self.metadata.append({
                "source": "Approved Maintenance Manual",
                "device_type": dtype,
                "classification": classification,
                "action": action,
                "reason": cause,
                "is_custom": False
            })
            
    def get_maintenance_advice(self, device_type, root_cause, hospital_id: str = None):
        # Build or check index
        self.build_index(hospital_id)
        
        # Search query matching device type and root cause
        query = f"{device_type} {root_cause}"
        query_vec = self.vectorizer.transform([query])
        
        # Compute similarities
        similarities = cosine_similarity(query_vec, self.tfidf_matrix).flatten()
        
        # 1. Filter custom documents by matching device_type first
        target_dev = str(device_type).strip().lower()
        matched_custom_indices = []
        
        for idx, m in enumerate(self.metadata):
            if m.get("is_custom"):
                m_dev = str(m.get("device_type", "")).strip().lower()
                # Check if device_type matches or overlaps
                if target_dev in m_dev or m_dev in target_dev or not target_dev or target_dev == "medical device":
                    matched_custom_indices.append(idx)
                    
        # Fallback to all custom docs if no device_type filter match
        if not matched_custom_indices:
            matched_custom_indices = [idx for idx, m in enumerate(self.metadata) if m.get("is_custom")]
            
        if matched_custom_indices:
            custom_similarities = [(idx, similarities[idx]) for idx in matched_custom_indices]
            top_custom_idx, max_custom_score = max(custom_similarities, key=lambda x: x[1])
            
            # If similarity meets baseline threshold, return matched manual chunk
            if max_custom_score >= 0.05:
                match = self.metadata[top_custom_idx]
                evidence = self.docs[top_custom_idx]
                
                # Synthesize via Groq LLM if key is configured
                recommendation = match["action"]
                try:
                    from backend.services.grok_service import query_grok
                    prompt = f"System Context: You are an expert Biomedical Engineering Maintenance Advisor.\n\n" \
                             f"Device: {match['device_type']} ({match.get('manufacturer', 'Approved')})\n" \
                             f"Issue / Query: {root_cause}\n" \
                             f"Manual Source: {match['source']} (Section: {match.get('section', 'General')})\n" \
                             f"Manual Excerpt: {match['action']}\n\n" \
                             f"Provide a clear, step-by-step technical maintenance instruction grounded strictly on the manual excerpt above. Keep it concise (2-4 bullet points)."
                    llm_reply = query_grok([{"role": "user", "content": prompt}], max_tokens=250)
                    if llm_reply and len(llm_reply) > 20:
                        recommendation = llm_reply.strip()
                except Exception as e:
                    print(f"Groq LLM synthesis note: {e}")

                return {
                    "recommended_action": recommendation,
                    "source": match["source"],
                    "evidence": evidence,
                    "confidence": "High" if max_custom_score > 0.3 else "Medium",
                    "relevance_score": round(float(max_custom_score), 4),
                    "section": match.get("section", "Troubleshooting"),
                    "page": match.get("page", 1),
                    "is_custom": True,
                    "found": True
                }
        
        # General Fallback across all documents
        top_idx = int(np.argmax(similarities))
        max_score = similarities[top_idx]
        
        # Grounding check
        if max_score < 0.1:
            return {
                "recommended_action": f"Inspect and replace degraded sub-components related to {root_cause} according to standard manufacturer guidelines for {device_type}.",
                "source": "Approved Maintenance Manual",
                "evidence": f"Relevance score ({max_score:.4f}) is below verification confidence thresholds.",
                "confidence": "Low",
                "relevance_score": round(float(max_score), 4),
                "found": False
            }
            
        match = self.metadata[top_idx]
        return {
            "recommended_action": match["action"],
            "source": match["source"],
            "evidence": self.docs[top_idx],
            "confidence": "High" if max_score > 0.4 else "Medium",
            "relevance_score": round(float(max_score), 4),
            "section": match.get("section", "Recall Notice"),
            "page": match.get("page", 1),
            "is_custom": match.get("is_custom", False),
            "found": True
        }
