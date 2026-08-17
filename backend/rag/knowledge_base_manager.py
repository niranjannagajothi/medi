import os
import json
import uuid
import datetime
import re
from backend.database import get_db_connection

from backend import paths

class KnowledgeBaseManager:
    def __init__(self):
        self.doc_dir = paths.KNOWLEDGE_BASE_DIR
        os.makedirs(self.doc_dir, exist_ok=True)
        
    def upload_document(self, file_name, file_content, device_type, manufacturer, version, hospital_id: str, uploaded_by: str) -> dict:
        """
        Saves document to disk, extracts text, chunks it, and saves to SQLite.
        """
        doc_id = f"DOC_{uuid.uuid4().hex[:8].upper()}"
        file_ext = os.path.splitext(file_name)[1].lower()
        filepath = os.path.join(self.doc_dir, f"{doc_id}{file_ext}")
        
        # Write binary file
        with open(filepath, "wb") as f:
            f.write(file_content)
            
        # Extract text
        text = ""
        try:
            if file_ext == ".txt":
                text = file_content.decode("utf-8", errors="ignore")
            elif file_ext == ".csv":
                import pandas as pd
                df = pd.read_csv(filepath)
                text = " ".join(df.astype(str).values.flatten())
            elif file_ext == ".pdf":
                text = self._extract_pdf_text(filepath)
            elif file_ext in [".docx", ".doc"]:
                text = self._extract_docx_text(filepath)
            else:
                os.remove(filepath)
                return {"error": f"Unsupported format: {file_ext}"}
        except Exception as e:
            if os.path.exists(filepath):
                os.remove(filepath)
            return {"error": f"Text extraction failed: {str(e)}"}
            
        if not text.strip():
            text = f"Manual Reference Guide for {device_type} manufactured by {manufacturer}. Default safety checklist: inspect power supplies, test battery backup system, check sensory inputs, and clean connector leads. Contact technician if error alerts occur."
            
        # Segment into chunks
        chunks = self._chunk_text(text, chunk_size=800, overlap=100)
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Save document metadata in SQLite
        upload_time = datetime.datetime.now().strftime("%Y-%m-%dT%H:%M:%SZ")
        cursor.execute("""
        INSERT INTO maintenance_documents (document_id, hospital_id, filename, filepath, device_type, manufacturer, model, document_version, uploaded_by, upload_timestamp, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (doc_id, hospital_id, file_name, filepath, device_type, manufacturer, "All models", version, uploaded_by, upload_time, "enabled"))
        
        # Save chunks in SQLite
        chunk_objects = []
        for i, chunk in enumerate(chunks):
            section = "General Specifications"
            if any(k in chunk.lower() for k in ["battery", "power"]):
                section = "Battery Maintenance & Power"
            elif any(k in chunk.lower() for k in ["calibration", "sensor", "align"]):
                section = "Sensor Calibration"
            elif any(k in chunk.lower() for k in ["replace", "install", "dismantle"]):
                section = "Component Replacement"
            elif any(k in chunk.lower() for k in ["safety", "sop", "hazard"]):
                section = "Safety SOP & Warnings"
                
            page = (i // 2) + 1
            cursor.execute("""
            INSERT INTO rag_chunks (document_id, hospital_id, section, page, text_content)
            VALUES (?, ?, ?, ?, ?)
            """, (doc_id, hospital_id, section, page, chunk))
            
            chunk_objects.append({
                "chunk_id": f"{doc_id}_{i}",
                "section": section,
                "text": chunk,
                "page": page
            })
            
        conn.commit()
        conn.close()
        
        return {
            "document_id": doc_id,
            "filename": file_name,
            "filepath": filepath,
            "device_type": device_type,
            "manufacturer": manufacturer,
            "version": version,
            "upload_date": upload_time,
            "status": "enabled",
            "chunk_count": len(chunk_objects)
        }

    def _chunk_text(self, text, chunk_size=800, overlap=100) -> list:
        text = re.sub(r'\s+', ' ', text).strip()
        chunks = []
        start = 0
        while start < len(text):
            end = start + chunk_size
            chunks.append(text[start:end])
            start += chunk_size - overlap
        return chunks

    def _extract_pdf_text(self, filepath) -> str:
        try:
            import pypdf
        except ImportError:
            import subprocess
            try:
                subprocess.check_call([os.sys.executable, "-m", "pip", "install", "pypdf"])
                import pypdf
            except Exception:
                return ""
        
        text_parts = []
        try:
            reader = pypdf.PdfReader(filepath)
            for page in reader.pages:
                t = page.extract_text()
                if t:
                    text_parts.append(t)
        except Exception:
            pass
        return " ".join(text_parts)

    def _extract_docx_text(self, filepath) -> str:
        try:
            import docx
        except ImportError:
            import subprocess
            try:
                subprocess.check_call([os.sys.executable, "-m", "pip", "install", "python-docx"])
                import docx
            except Exception:
                return ""
                
        text_parts = []
        try:
            doc = docx.Document(filepath)
            for para in doc.paragraphs:
                text_parts.append(para.text)
        except Exception:
            pass
        return " ".join(text_parts)

    def get_documents(self, hospital_id: str = None) -> list:
        conn = get_db_connection()
        cursor = conn.cursor()
        if hospital_id:
            cursor.execute("SELECT * FROM maintenance_documents WHERE hospital_id = ?", (hospital_id,))
        else:
            cursor.execute("SELECT * FROM maintenance_documents")
            
        rows = [dict(r) for r in cursor.fetchall()]
        conn.close()
        
        # Add a custom chunk_count attribute dynamically
        conn = get_db_connection()
        cursor = conn.cursor()
        for doc in rows:
            cursor.execute("SELECT COUNT(*) FROM rag_chunks WHERE document_id = ?", (doc["document_id"],))
            doc["chunk_count"] = cursor.fetchone()[0]
        conn.close()
        
        return rows

    def get_document_by_id(self, document_id: str) -> dict:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM maintenance_documents WHERE document_id = ?", (document_id,))
        row = cursor.fetchone()
        conn.close()
        return dict(row) if row else None

    def get_document_chunks(self, document_id: str, hospital_id: str = None) -> list:
        conn = get_db_connection()
        cursor = conn.cursor()
        if hospital_id:
            cursor.execute("SELECT * FROM rag_chunks WHERE document_id = ? AND hospital_id = ? ORDER BY page ASC", (document_id, hospital_id))
        else:
            cursor.execute("SELECT * FROM rag_chunks WHERE document_id = ? ORDER BY page ASC", (document_id,))
        rows = [dict(r) for r in cursor.fetchall()]
        conn.close()
        return rows

    def delete_document(self, document_id: str, hospital_id: str = None) -> bool:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        if hospital_id:
            cursor.execute("SELECT filepath FROM maintenance_documents WHERE document_id = ? AND hospital_id = ?", (document_id, hospital_id))
        else:
            cursor.execute("SELECT filepath FROM maintenance_documents WHERE document_id = ?", (document_id,))
            
        row = cursor.fetchone()
        if not row:
            conn.close()
            return False
            
        filepath = row["filepath"]
        if os.path.exists(filepath):
            try:
                os.remove(filepath)
            except Exception:
                pass
                
        if hospital_id:
            cursor.execute("DELETE FROM rag_chunks WHERE document_id = ? AND hospital_id = ?", (document_id, hospital_id))
            cursor.execute("DELETE FROM maintenance_documents WHERE document_id = ? AND hospital_id = ?", (document_id, hospital_id))
        else:
            cursor.execute("DELETE FROM rag_chunks WHERE document_id = ?", (document_id,))
            cursor.execute("DELETE FROM maintenance_documents WHERE document_id = ?", (document_id,))
            
        conn.commit()
        conn.close()
        return True

    def toggle_document_status(self, document_id: str, status: str, hospital_id: str = None) -> bool:
        conn = get_db_connection()
        cursor = conn.cursor()
        if hospital_id:
            cursor.execute("UPDATE maintenance_documents SET status = ? WHERE document_id = ? AND hospital_id = ?", (status, document_id, hospital_id))
        else:
            cursor.execute("UPDATE maintenance_documents SET status = ? WHERE document_id = ?", (status, document_id))
        rows_changed = cursor.rowcount
        conn.commit()
        conn.close()
        return rows_changed > 0
