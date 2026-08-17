import sqlite3
import os
import json
import hashlib
import datetime
import math

from backend import paths

DB_PATH = paths.DB_PATH

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def hash_password(password: str) -> str:
    salt = "aura_salt_2026"
    return hashlib.sha256((password + salt).encode('utf-8')).hexdigest()

def sanitize_str(val, default="Unknown") -> str:
    if val is None:
        return default
    if isinstance(val, float):
        if math.isnan(val) or math.isinf(val):
            return default
    s = str(val).strip()
    if s.lower() in ["nan", "null", "none", ""]:
        return default
    return s

USER_PROFILE_COLUMNS = {
    "full_name": "TEXT",
    "job_title": "TEXT",
    "email": "TEXT",
    "phone": "TEXT",
    "is_active": "INTEGER NOT NULL DEFAULT 1",
    "created_at": "TEXT",
    "last_login": "TEXT",
}

ALERT_WORKFLOW_COLUMNS = {
    "owner_username": "TEXT",
    "owner_name": "TEXT",
    "assigned_at": "TEXT",
    "due_by": "TEXT",
    "escalation_level": "INTEGER NOT NULL DEFAULT 0",
    "resolution_note": "TEXT",
    "downtime_minutes": "INTEGER",
    "closed_at": "TEXT",
}

def migrate_alert_columns(cursor):
    existing = {row["name"] for row in cursor.execute("PRAGMA table_info(alerts)").fetchall()}
    for column, definition in ALERT_WORKFLOW_COLUMNS.items():
        if column not in existing:
            cursor.execute(f"ALTER TABLE alerts ADD COLUMN {column} {definition}")

def migrate_user_columns(cursor):
    existing = {row["name"] for row in cursor.execute("PRAGMA table_info(users)").fetchall()}
    for column, definition in USER_PROFILE_COLUMNS.items():
        if column not in existing:
            cursor.execute(f"ALTER TABLE users ADD COLUMN {column} {definition}")

def init_db():
    print(f"Initializing SQLite Database at {DB_PATH}...")
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # 1. Hospitals Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS hospitals (
        hospital_id TEXT PRIMARY KEY,
        name TEXT NOT NULL
    );
    """)
    
    # 2. Users Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        user_id INTEGER PRIMARY KEY AUTOINCREMENT,
        hospital_id TEXT NOT NULL,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL,
        department TEXT,
        full_name TEXT,
        job_title TEXT,
        email TEXT,
        phone TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT,
        last_login TEXT,
        FOREIGN KEY (hospital_id) REFERENCES hospitals(hospital_id)
    );
    """)
    migrate_user_columns(cursor)
    
    # 3. Departments Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS departments (
        dept_id INTEGER PRIMARY KEY AUTOINCREMENT,
        hospital_id TEXT NOT NULL,
        name TEXT NOT NULL,
        FOREIGN KEY (hospital_id) REFERENCES hospitals(hospital_id)
    );
    """)
    
    # 4. Devices Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS devices (
        device_id TEXT PRIMARY KEY,
        hospital_id TEXT NOT NULL,
        department TEXT NOT NULL,
        device_type TEXT NOT NULL,
        manufacturer TEXT NOT NULL,
        model TEXT NOT NULL,
        status TEXT NOT NULL,
        FOREIGN KEY (hospital_id) REFERENCES hospitals(hospital_id)
    );
    """)
    
    # 5. Device Logs (Telemetry) Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS device_logs (
        log_id INTEGER PRIMARY KEY AUTOINCREMENT,
        hospital_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        payload TEXT NOT NULL,
        ingestion_timestamp TEXT NOT NULL,
        source TEXT NOT NULL,
        validation_status TEXT NOT NULL,
        anomaly_status TEXT,
        risk_level TEXT,
        FOREIGN KEY (hospital_id) REFERENCES hospitals(hospital_id),
        FOREIGN KEY (device_id) REFERENCES devices(device_id)
    );
    """)
    
    # 6. Predictions Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS predictions (
        pred_id INTEGER PRIMARY KEY AUTOINCREMENT,
        hospital_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        failure_probability REAL NOT NULL,
        risk_level TEXT NOT NULL,
        anomaly_score REAL,
        overall_health REAL NOT NULL,
        model_version TEXT NOT NULL,
        FOREIGN KEY (hospital_id) REFERENCES hospitals(hospital_id),
        FOREIGN KEY (device_id) REFERENCES devices(device_id)
    );
    """)
    
    # 7. Alerts Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS alerts (
        alert_id INTEGER PRIMARY KEY AUTOINCREMENT,
        hospital_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        department TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        risk_level TEXT NOT NULL,
        failure_probability REAL NOT NULL,
        anomaly_score REAL,
        root_cause TEXT,
        component TEXT,
        recommended_action TEXT,
        status TEXT NOT NULL, -- 'active' or 'acknowledged'
        FOREIGN KEY (hospital_id) REFERENCES hospitals(hospital_id),
        FOREIGN KEY (device_id) REFERENCES devices(device_id)
    );
    """)
    
    migrate_alert_columns(cursor)

    # 8. Maintenance Documents Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS maintenance_documents (
        document_id TEXT PRIMARY KEY,
        hospital_id TEXT NOT NULL,
        filename TEXT NOT NULL,
        filepath TEXT NOT NULL,
        device_type TEXT NOT NULL,
        manufacturer TEXT NOT NULL,
        model TEXT NOT NULL,
        document_version TEXT NOT NULL,
        uploaded_by TEXT NOT NULL,
        upload_timestamp TEXT NOT NULL,
        status TEXT NOT NULL,
        FOREIGN KEY (hospital_id) REFERENCES hospitals(hospital_id)
    );
    """)
    
    # 9. RAG chunks Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS rag_chunks (
        chunk_id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id TEXT NOT NULL,
        hospital_id TEXT NOT NULL,
        section TEXT,
        page INTEGER,
        text_content TEXT NOT NULL,
        FOREIGN KEY (document_id) REFERENCES maintenance_documents(document_id),
        FOREIGN KEY (hospital_id) REFERENCES hospitals(hospital_id)
    );
    """)
    
    # 10. Audit Logs Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS audit_logs (
        audit_id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        username TEXT,
        hospital_id TEXT,
        action TEXT NOT NULL,
        resource_type TEXT,
        resource_id TEXT,
        timestamp TEXT NOT NULL,
        ip_address TEXT,
        success INTEGER NOT NULL
    );
    """)
    
    conn.commit()
    seed_mock_data(conn)
    conn.close()
    print("Database initialized successfully.")

DEFAULT_SEED_PASSWORD = os.getenv("AURA_SEED_PASSWORD", "password123")

# Named staff accounts, one workspace per role. Passwords are demo credentials
# and can be overridden with AURA_SEED_PASSWORD.
SEED_USERS = [
    {
        "hospital_id": "demo-hospital",
        "username": "a.raman",
        "role": "HOSPITAL_ADMIN",
        "department": None,
        "full_name": "Dr. Anitha Raman",
        "job_title": "Director, Clinical Engineering",
        "email": "anitha.raman@demogeneral.health",
        "phone": "+91 98400 11223",
    },
    {
        "hospital_id": "demo-hospital",
        "username": "k.mehta",
        "role": "BIOMEDICAL_ENGINEER",
        "department": "Intensive Care Unit (ICU)",
        "full_name": "Karthik Mehta",
        "job_title": "Senior Biomedical Engineer",
        "email": "karthik.mehta@demogeneral.health",
        "phone": "+91 98400 11224",
    },
    {
        "hospital_id": "demo-hospital",
        "username": "s.iyer",
        "role": "BIOMEDICAL_ENGINEER",
        "department": "Radiology Department",
        "full_name": "Sneha Iyer",
        "job_title": "Biomedical Engineer, Imaging Systems",
        "email": "sneha.iyer@demogeneral.health",
        "phone": "+91 98400 11225",
    },
    {
        "hospital_id": "demo-hospital",
        "username": "r.thomas",
        "role": "DEPARTMENT_OPERATOR",
        "department": "Intensive Care Unit (ICU)",
        "full_name": "Reena Thomas",
        "job_title": "ICU Charge Nurse",
        "email": "reena.thomas@demogeneral.health",
        "phone": "+91 98400 11226",
    },
    {
        "hospital_id": "demo-hospital",
        "username": "m.abdullah",
        "role": "DEPARTMENT_OPERATOR",
        "department": "Clinical Laboratory",
        "full_name": "Mohammed Abdullah",
        "job_title": "Laboratory Operations Supervisor",
        "email": "mohammed.abdullah@demogeneral.health",
        "phone": "+91 98400 11227",
    },
    {
        "hospital_id": "demo-hospital",
        "username": "p.varghese",
        "role": "RELIABILITY_MANAGER",
        "department": None,
        "full_name": "Priya Varghese",
        "job_title": "Fleet Reliability Manager",
        "email": "priya.varghese@demogeneral.health",
        "phone": "+91 98400 11228",
    },
    {
        "hospital_id": "demo-hospital",
        "username": "d.fernandes",
        "role": "AUDITOR",
        "department": None,
        "full_name": "Daniel Fernandes",
        "job_title": "Compliance & Safety Auditor",
        "email": "daniel.fernandes@demogeneral.health",
        "phone": "+91 98400 11229",
    },
    {
        "hospital_id": "other-hospital",
        "username": "j.walker",
        "role": "HOSPITAL_ADMIN",
        "department": None,
        "full_name": "Julia Walker",
        "job_title": "Director of Biomedical Services",
        "email": "julia.walker@stjude.health",
        "phone": "+1 415 555 0142",
    },
    # Legacy generic logins kept for existing integrations and test fixtures.
    {
        "hospital_id": "demo-hospital",
        "username": "admin",
        "role": "HOSPITAL_ADMIN",
        "department": None,
        "full_name": "Demo Administrator",
        "job_title": "Hospital Administrator",
        "email": "admin@demogeneral.health",
        "phone": None,
    },
    {
        "hospital_id": "demo-hospital",
        "username": "biomed",
        "role": "BIOMEDICAL_ENGINEER",
        "department": None,
        "full_name": "Demo Biomedical Engineer",
        "job_title": "Biomedical Engineer",
        "email": "biomed@demogeneral.health",
        "phone": None,
    },
    {
        "hospital_id": "demo-hospital",
        "username": "operator",
        "role": "DEPARTMENT_OPERATOR",
        "department": "Intensive Care Unit (ICU)",
        "full_name": "Demo Department Operator",
        "job_title": "Department Operator",
        "email": "operator@demogeneral.health",
        "phone": None,
    },
    {
        "hospital_id": "demo-hospital",
        "username": "auditor",
        "role": "AUDITOR",
        "department": None,
        "full_name": "Demo Auditor",
        "job_title": "Compliance Auditor",
        "email": "auditor@demogeneral.health",
        "phone": None,
    },
    {
        "hospital_id": "other-hospital",
        "username": "admin2",
        "role": "HOSPITAL_ADMIN",
        "department": None,
        "full_name": "Demo Administrator (St. Jude)",
        "job_title": "Hospital Administrator",
        "email": "admin2@stjude.health",
        "phone": None,
    },
]

def seed_users(cursor):
    """Insert the named staff accounts, preserving users created at runtime."""
    now = datetime.datetime.now().strftime("%Y-%m-%dT%H:%M:%SZ")
    password_hash = hash_password(DEFAULT_SEED_PASSWORD)
    for user in SEED_USERS:
        cursor.execute("SELECT user_id FROM users WHERE username = ?", (user["username"],))
        if cursor.fetchone():
            cursor.execute("""
            UPDATE users SET hospital_id = ?, role = ?, department = ?, full_name = ?, job_title = ?, email = ?, phone = ?
            WHERE username = ?
            """, (user["hospital_id"], user["role"], user["department"], user["full_name"],
                  user["job_title"], user["email"], user["phone"], user["username"]))
            continue
        cursor.execute("""
        INSERT INTO users (hospital_id, username, password_hash, role, department, full_name, job_title, email, phone, is_active, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
        """, (user["hospital_id"], user["username"], password_hash, user["role"], user["department"],
              user["full_name"], user["job_title"], user["email"], user["phone"], now))

def seed_mock_data(conn):
    cursor = conn.cursor()
    
    # Clean old values to prevent unique/constraint issues on re-run
    cursor.execute("DELETE FROM predictions")
    cursor.execute("DELETE FROM alerts")
    cursor.execute("DELETE FROM devices")
    cursor.execute("DELETE FROM departments")
    cursor.execute("DELETE FROM hospitals")
    
    # Seed Hospitals
    print("Seeding mock hospitals...")
    cursor.execute("INSERT INTO hospitals (hospital_id, name) VALUES (?, ?)", ("demo-hospital", "Demo General Hospital"))
    cursor.execute("INSERT INTO hospitals (hospital_id, name) VALUES (?, ?)", ("other-hospital", "St. Jude Medical Center"))
        
    # Seed Users
    print("Seeding staff accounts...")
    seed_users(cursor)

    # Seed Departments
    cursor.execute("INSERT INTO departments (hospital_id, name) VALUES (?, ?)", ("demo-hospital", "Intensive Care Unit (ICU)"))
    cursor.execute("INSERT INTO departments (hospital_id, name) VALUES (?, ?)", ("demo-hospital", "Radiology Department"))
    cursor.execute("INSERT INTO departments (hospital_id, name) VALUES (?, ?)", ("demo-hospital", "Clinical Laboratory"))
    cursor.execute("INSERT INTO departments (hospital_id, name) VALUES (?, ?)", ("other-hospital", "Emergency Department"))

    # Seed Devices (from device_latest_cache.json)
    print("Seeding devices from cached registry...")
    cache_path = paths.DEVICE_CACHE_PATH
    if os.path.exists(cache_path):
        try:
            with open(cache_path, "r") as f:
                cache = json.load(f)
            
            # Seed all trained dataset devices from cache into demo-hospital
            count = 0
            for dev_id, dev_data in cache.items():
                
                dtype = sanitize_str(dev_data.get("device_type"), "Ventilator")
                manufacturer = sanitize_str(dev_data.get("manufacturer"), "MedStar")
                
                # Deduce department
                dept = "General Ward"
                if dtype in ["Ventilator", "Defibrillator", "Patient monitor", "Anesthesia machine"]:
                    dept = "Intensive Care Unit (ICU)"
                elif dtype in ["CT scanner", "MRI scanner", "Ultrasound machine", "X-ray machine"]:
                    dept = "Radiology Department"
                elif dtype in ["PCR machine", "Centrifuge", "Blood analyzer", "Hematology analyzer"]:
                    dept = "Clinical Laboratory"
                    
                cursor.execute("""
                INSERT INTO devices (device_id, hospital_id, department, device_type, manufacturer, model, status)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (dev_id, "demo-hospital", dept, dtype, manufacturer, "V-200", "Monitoring"))
                
                # Insert initial prediction
                cursor.execute("""
                INSERT INTO predictions (hospital_id, device_id, timestamp, failure_probability, risk_level, anomaly_score, overall_health, model_version)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    "demo-hospital",
                    dev_id,
                    datetime.datetime.now().strftime("%Y-%m-%dT%H:%M:%SZ"),
                    float(dev_data.get("failure_probability")) if dev_data.get("failure_probability") is not None else 0.05,
                    sanitize_str(dev_data.get("risk_level"), "LOW"),
                    float(dev_data.get("anomaly", {}).get("score")) if dev_data.get("anomaly", {}).get("score") is not None else 10.0,
                    float(dev_data.get("overall_health")) if dev_data.get("overall_health") is not None else 90.0,
                    "1.0"
                ))
                
                # Insert initial alerts if high/critical
                risk = sanitize_str(dev_data.get("risk_level"), "LOW")
                if risk in ["HIGH", "CRITICAL"]:
                    cursor.execute("""
                    INSERT INTO alerts (hospital_id, device_id, department, timestamp, risk_level, failure_probability, anomaly_score, root_cause, component, recommended_action, status)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        "demo-hospital",
                        dev_id,
                        dept,
                        datetime.datetime.now().strftime("%Y-%m-%dT%H:%M:%SZ"),
                        risk,
                        float(dev_data.get("failure_probability")) if dev_data.get("failure_probability") is not None else 0.75,
                        float(dev_data.get("anomaly", {}).get("score")) if dev_data.get("anomaly", {}).get("score") is not None else 70.0,
                        sanitize_str(dev_data.get("root_cause", {}).get("primary"), "General Wear") if dev_data.get("root_cause") else "General Wear",
                        list(dev_data.get("components", {}).keys())[0] if dev_data.get("components") else "Battery",
                        sanitize_str(dev_data.get("maintenance", {}).get("recommended_action"), "Check connectors"),
                        "active"
                    ))
                
                count += 1
        except Exception as e:
            print(f"Error seeding cached devices: {e}")
            raise e
    
    # Seed 5 devices into other-hospital to verify multi-tenant isolation
    for i in range(1, 6):
        dev_id = f"DEV_OTHER_0{i}"
        cursor.execute("""
        INSERT INTO devices (device_id, hospital_id, department, device_type, manufacturer, model, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (dev_id, "other-hospital", "Emergency Department", "Ventilator", "MedStar", "VM-50", "Monitoring"))
        
        cursor.execute("""
        INSERT INTO predictions (hospital_id, device_id, timestamp, failure_probability, risk_level, anomaly_score, overall_health, model_version)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            "other-hospital",
            dev_id,
            datetime.datetime.now().strftime("%Y-%m-%dT%H:%M:%SZ"),
            0.02,
            "LOW",
            5.0,
            98.0,
            "1.0"
        ))
        
    conn.commit()

def log_audit_event(user_id: str, username: str, hospital_id: str, action: str, resource_type: str, resource_id: str, success: bool, ip_address: str = "127.0.0.1"):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
        INSERT INTO audit_logs (user_id, username, hospital_id, action, resource_type, resource_id, timestamp, ip_address, success)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (user_id, username, hospital_id, action, resource_type, resource_id, 
              datetime.datetime.now().strftime("%Y-%m-%dT%H:%M:%SZ"), ip_address, 1 if success else 0))
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Failed to log audit event: {e}")

if __name__ == "__main__":
    init_db()
