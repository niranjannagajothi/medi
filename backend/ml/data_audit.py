import pandas as pd
import numpy as np
import json
import os

from backend import paths

def run_data_audit():
    data_dir = paths.DATA_RAW_DIR
    artifacts_dir = paths.ARTIFACTS_DIR
    
    os.makedirs(artifacts_dir, exist_ok=True)
    
    output_json = os.path.join(artifacts_dir, "data_audit_report.json")
    output_html = os.path.join(artifacts_dir, "data_audit_report.html")

    datasets = {
        "device_information": "device_information_cleaned.csv",
        "environmental_factors": "environmental_factors_cleaned.csv",
        "error_operational_signals": "error_operational_signals_cleaned.csv",
        "failure_history": "failure_history_cleaned.csv",
        "maintenance_history": "maintenance_history_cleaned.csv",
        "manufacturer_factors": "manufacturer_factors_cleaned.csv",
        "safety_recall_information": "safety_recall_information_cleaned.csv",
        "usage_operating_factors": "usage_operating_factors_cleaned.csv"
    }

    audit_results = {}

    for key, filename in datasets.items():
        path = os.path.join(data_dir, filename)
        if not os.path.exists(path):
            print(f"Warning: File {filename} not found.")
            continue
            
        print(f"Auditing {filename}...")
        df = pd.read_csv(path)
        
        num_rows, num_cols = df.shape
        missing_pct = df.isnull().mean().to_dict()
        dup_pct = float(df.duplicated().mean()) * 100
        
        cardinality = {}
        dtypes = {}
        for col in df.columns:
            cardinality[col] = int(df[col].nunique())
            dtypes[col] = str(df[col].dtype)
            
        unique_devices = int(df["Device_ID"].nunique()) if "Device_ID" in df.columns else 0
        
        date_cols = [c for c in df.columns if "date" in c.lower() or "year" in c.lower() or "month" in c.lower()]
        date_ranges = {}
        for col in date_cols:
            try:
                if "year" in col.lower() or "month" in col.lower():
                    val_min = df[col].min()
                    val_max = df[col].max()
                    date_ranges[col] = [str(val_min), str(val_max)]
                else:
                    converted = pd.to_datetime(df[col], errors='coerce')
                    if not converted.isnull().all():
                        date_ranges[col] = [str(converted.min()), str(converted.max())]
            except:
                pass
                
        audit_results[key] = {
            "rows": num_rows,
            "columns": num_cols,
            "unique_devices": unique_devices,
            "missing_pct": missing_pct,
            "duplicate_pct": dup_pct,
            "cardinality": cardinality,
            "dtypes": dtypes,
            "date_ranges": date_ranges,
            "column_names": list(df.columns)
        }

    # Additional cross-dataset metrics
    device_info_path = os.path.join(data_dir, datasets["device_information"])
    if os.path.exists(device_info_path):
        df_info = pd.read_csv(device_info_path)
        unique_device_types = list(df_info["Device_Type"].dropna().unique())
        audit_results["meta"] = {
            "total_devices_in_registry": int(df_info["Device_ID"].nunique()),
            "unique_device_types_count": len(unique_device_types),
            "unique_device_types": unique_device_types,
            "device_type_distribution": df_info["Device_Type"].value_counts().to_dict(),
            "device_category_distribution": df_info["Device_Category"].value_counts().to_dict()
        }
        
        coverage = {}
        registry_devices = set(df_info["Device_ID"].unique())
        for key, filename in datasets.items():
            if key == "device_information":
                continue
            path = os.path.join(data_dir, filename)
            if os.path.exists(path):
                df_temp = pd.read_csv(path)
                if "Device_ID" in df_temp.columns:
                    temp_devices = set(df_temp["Device_ID"].unique())
                    covered = len(registry_devices.intersection(temp_devices))
                    coverage[key] = {
                        "unique_devices_in_file": len(temp_devices),
                        "coverage_in_registry_pct": (covered / len(registry_devices)) * 100 if len(registry_devices) > 0 else 0
                    }
        audit_results["device_coverage"] = coverage

    failure_path = os.path.join(data_dir, datasets["failure_history"])
    if os.path.exists(failure_path):
        df_fail = pd.read_csv(failure_path)
        audit_results["failure_stats"] = {
            "total_failures": len(df_fail),
            "failures_per_device": df_fail.groupby("Device_ID").size().describe().to_dict(),
            "failure_types": df_fail["Failure_Type"].value_counts().to_dict(),
            "failed_components": df_fail["Failed_Component"].value_counts().to_dict(),
            "failure_severities": df_fail["Failure_Severity"].value_counts().to_dict()
        }

    # Save JSON
    with open(output_json, "w") as out:
        json.dump(audit_results, out, indent=2)

    # Generate HTML
    html_content = f"""<!DOCTYPE html>
<html>
<head>
    <title>Dataset Feasibility & Audit Report</title>
    <style>
        body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 30px; background-color: #f4f6f9; color: #333; }}
        h1, h2, h3 {{ color: #1e293b; font-weight: 600; }}
        .container {{ max-width: 1200px; margin: 0 auto; }}
        .card {{ background: white; padding: 25px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); margin-bottom: 25px; border: 1px solid #e2e8f0; }}
        table {{ width: 100%; border-collapse: collapse; margin-top: 15px; }}
        th, td {{ border: 1px solid #cbd5e1; padding: 12px; text-align: left; }}
        th {{ background-color: #0f172a; color: white; font-weight: 500; }}
        tr:nth-child(even) {{ background-color: #f8fafc; }}
        .header {{ border-bottom: 2px solid #cbd5e1; padding-bottom: 15px; margin-bottom: 25px; }}
        .lead {{ font-size: 1.1em; color: #64748b; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Dataset Feasibility & Audit Report</h1>
            <p class="lead">AI-Powered Medical Device Reliability Intelligence Platform</p>
        </div>
        
        <div class="card">
            <h2>Dataset Summary</h2>
            <p>Overview of row counts, columns, device counts, and data integrity metrics:</p>
            <table>
                <thead>
                    <tr>
                        <th>Dataset Name</th>
                        <th>Rows</th>
                        <th>Columns</th>
                        <th>Unique Devices</th>
                        <th>Duplicate %</th>
                    </tr>
                </thead>
                <tbody>
    """
    for key, val in audit_results.items():
        if key in ["meta", "device_coverage", "failure_stats"]:
            continue
        html_content += f"""
                    <tr>
                        <td><strong>{key}</strong></td>
                        <td>{val['rows']:,}</td>
                        <td>{val['columns']}</td>
                        <td>{val['unique_devices']:,}</td>
                        <td>{val['duplicate_pct']:.2f}%</td>
                    </tr>
        """
    html_content += """
                </tbody>
            </table>
        </div>
    """
    
    if "device_coverage" in audit_results:
        html_content += """
        <div class="card">
            <h2>Device coverage in Transactional Files</h2>
            <p>Out of 10,000 devices listed in the Device Information registry:</p>
            <table>
                <thead>
                    <tr>
                        <th>Transactional Dataset</th>
                        <th>Unique Devices Represented</th>
                        <th>Coverage %</th>
                    </tr>
                </thead>
                <tbody>
        """
        for key, val in audit_results["device_coverage"].items():
            html_content += f"""
                    <tr>
                        <td>{key}</td>
                        <td>{val['unique_devices_in_file']:,}</td>
                        <td>{val['coverage_in_registry_pct']:.2f}%</td>
                    </tr>
            """
        html_content += """
                </tbody>
            </table>
        </div>
        """
        
    if "failure_stats" in audit_results:
        f_stats = audit_results["failure_stats"]
        html_content += f"""
        <div class="card">
            <h2>Failure History Distribution</h2>
            <p>Total Failure Events: <strong>{f_stats['total_failures']:,}</strong></p>
            <h3>Failures per Device Statistics:</h3>
            <ul>
                <li>Mean: {f_stats['failures_per_device']['mean']:.2f} failures</li>
                <li>Median: {f_stats['failures_per_device']['50%']:.0f} failures</li>
                <li>Max: {f_stats['failures_per_device']['max']:.0f} failures</li>
            </ul>
        </div>
        """
        
    html_content += """
    </div>
</body>
</html>
    """
    
    with open(output_html, "w") as out:
        out.write(html_content)
    print("Audit generated successfully.")

if __name__ == "__main__":
    run_data_audit()
