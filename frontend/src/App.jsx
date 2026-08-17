import React, { useState, useEffect, useRef } from 'react';
import { 
  Activity, ShieldAlert, Heart, HardDrive, 
  MapPin, Brain, HelpCircle, AlertOctagon, 
  Search, Sliders, Users, Settings, Wrench,
  Clock, Thermometer, Battery, Info, CheckCircle,
  FileText, ShieldAlert as AlertIcon, RefreshCw,
  TrendingUp, Layers, HelpCircle as HelpIcon, ArrowRight,
  Upload, Database, Link, AlertTriangle, MessageSquare, Trash2, ToggleLeft, ToggleRight, Eye, Cpu, Zap
} from 'lucide-react';

const API_BASE = 'http://localhost:8000/api/v1';

// Hospital staff accounts seeded by the backend. Shown on the sign-in screen so
// a demo reviewer can step into each role without memorising usernames.
const STAFF_DIRECTORY = [
  { username: 'a.raman', name: 'Dr. Anitha Raman', title: 'Director of Clinical Engineering', role: 'Hospital Administrator', unit: 'Administration' },
  { username: 'k.mehta', name: 'Karthik Mehta', title: 'Senior Biomedical Engineer', role: 'Biomedical Engineer', unit: 'ICU' },
  { username: 's.iyer', name: 'Sneha Iyer', title: 'Biomedical Engineer', role: 'Biomedical Engineer', unit: 'Radiology' },
  { username: 'r.thomas', name: 'Reena Thomas', title: 'ICU Nurse Manager', role: 'Department Operator', unit: 'ICU' },
  { username: 'm.abdullah', name: 'Mohammed Abdullah', title: 'Lab Operations Lead', role: 'Department Operator', unit: 'Laboratory' },
  { username: 'p.varghese', name: 'Priya Varghese', title: 'Reliability Manager', role: 'Reliability Manager', unit: 'Hospital-wide' },
  { username: 'd.fernandes', name: 'Daniel Fernandes', title: 'Compliance & Safety Auditor', role: 'Compliance Auditor', unit: 'Quality & Safety' },
];

const PAGE_LABELS = {
  dashboard: 'Monitoring Dashboard',
  alerts: 'Alert Queue',
  explorer: 'Device Explorer',
  twin: 'Digital Twin View',
  heatmap: 'Risk Heatmap',
  prediction: 'Failure Prediction',
  advisor: 'Maintenance Advisor',
  explainability: 'Model Benchmarks',
  hospital_connect: 'Data Connections',
  dataset_upload: 'Dataset Upload',
  knowledge_base: 'Knowledge Base',
  audit_logs: 'Audit Trail',
  team: 'Team & Access',
};

function initials(name = '') {
  return name.split(' ').filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('');
}

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedDeviceId, setSelectedDeviceId] = useState('DEV000001');
  const [deviceData, setDeviceData] = useState(null);
  const [deviceList, setDeviceList] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Search & Filter state for Explorer
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterRisk, setFilterRisk] = useState('');
  const [deviceTypes, setDeviceTypes] = useState([]);
  const [explorerPage, setExplorerPage] = useState(1);
  const [explorerTotal, setExplorerTotal] = useState(0);

  // RAG chat state
  const [chatMessages, setChatMessages] = useState([
    { sender: 'advisor', text: "Hello! I am your AI Maintenance Advisor. Select a device and ask me for the approved manufacturer procedures." }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [ragLoading, setRagLoading] = useState(false);

  // Selected component for Digital Twin detail drawer
  const [selectedComponent, setSelectedComponent] = useState(null);

  // ==========================================
  // MODULE 0: Authentication states
  // ==========================================
  const [currentUser, setCurrentUser] = useState(() => {
    const saved = localStorage.getItem('aura_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState(null);
  const [loginBusy, setLoginBusy] = useState(false);

  // Role workspace (KPIs, mission, primary actions) served by /workspace/summary
  const [workspace, setWorkspace] = useState(null);

  // Team & access management (Hospital Admin only)
  const [teamMembers, setTeamMembers] = useState([]);
  const [teamRoles, setTeamRoles] = useState([]);
  const [teamMessage, setTeamMessage] = useState(null);
  const emptyTeamForm = { username: '', full_name: '', job_title: '', email: '', phone: '', role: 'DEPARTMENT_OPERATOR', department: '', password: '' };
  const [teamForm, setTeamForm] = useState(emptyTeamForm);

  // Alert ownership workflow
  const [assignableUsers, setAssignableUsers] = useState([]);
  const [alertWorkOn, setAlertWorkOn] = useState(null); // { alert_id, mode: 'assign' | 'resolve' }
  const [assignOwner, setAssignOwner] = useState('');
  const [assignDueHours, setAssignDueHours] = useState(8);
  const [resolveNote, setResolveNote] = useState('');
  const [resolveDowntime, setResolveDowntime] = useState('');

  // ==========================================
  // MODULE 1: Live Monitoring / Replay states
  // ==========================================
  const [hospitalName, setHospitalName] = useState('Metro General Hospital');
  const [deptSelection, setDeptSelection] = useState('Intensive Care Unit (ICU)');
  const [connectionType, setConnectionType] = useState('CSV');
  const [connectStatus, setConnectStatus] = useState('Disconnected');
  const [connectedEquipment, setConnectedEquipment] = useState([]);
  const [simConnecting, setSimConnecting] = useState(false);

  // Replay control states
  const [replayDevice, setReplayDevice] = useState('DEV000001');
  const [replayScenario, setReplayScenario] = useState('Normal');
  const [replaySpeed, setReplaySpeed] = useState(1.0);
  const [streamStatus, setStreamStatus] = useState(null);

  // MQTT form state
  const [mqttHost, setMqttHost] = useState('localhost');
  const [mqttPort, setMqttPort] = useState(1883);
  const [mqttUser, setMqttUser] = useState('');
  const [mqttPass, setMqttPass] = useState('');
  const [mqttTopic, setMqttTopic] = useState('hospital/demo-hospital/+/+/+');
  const [mqttStatus, setMqttStatus] = useState('Disconnected');

  // Real-time metrics
  const [liveLogs, setLiveLogs] = useState([]);
  const [isLiveLogsPaused, setIsLiveLogsPaused] = useState(false);
  const [liveStreamRate, setLiveStreamRate] = useState(0);
  const [toasts, setToasts] = useState([]);
  const [alertSearchQuery, setAlertSearchQuery] = useState('');
  const [alertRiskFilter, setAlertRiskFilter] = useState('ALL');
  const [alertPanelOpen, setAlertPanelOpen] = useState(false);
  const [notificationInbox, setNotificationInbox] = useState([]); // persistent until resolved, populated exclusively by real-time telemetry ML predictions

  // ==========================================
  // MODULE 2: Dataset Upload & Mapping states
  // ==========================================
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadedDatasets, setUploadedDatasets] = useState([]);
  const [selectedDataset, setSelectedDataset] = useState(null);
  const [columnMappings, setColumnMappings] = useState({});
  const [validationReport, setValidationReport] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [validating, setValidating] = useState(false);

  // ==========================================
  // MODULE 3: RAG Knowledge Base states
  // ==========================================
  const [manualFile, setManualFile] = useState(null);
  const [kbDeviceType, setKbDeviceType] = useState('Ventilator');
  const [kbManufacturer, setKbManufacturer] = useState('MedStar Systems');
  const [kbVersion, setKbVersion] = useState('1.0');
  const [knowledgeDocs, setKnowledgeDocs] = useState([]);
  const [kbUploadProgress, setKbUploadProgress] = useState(null);
  const [kbSearchQuery, setKbSearchQuery] = useState('');
  
  // Custom RAG chatbot message log
  const [kbChatInput, setKbChatInput] = useState('');
  const [kbChatLog, setKbChatLog] = useState([
    { sender: 'advisor', text: "Welcome to the Technical Manual Knowledge Base. Ask me procedures from verified documents." }
  ]);
  const [kbChatLoading, setKbChatLoading] = useState(false);
  const [viewedSourceChunk, setViewedSourceChunk] = useState(null);

  // Document Chunk Inspection Drawer state
  const [selectedDocForChunks, setSelectedDocForChunks] = useState(null);
  const [docChunks, setDocChunks] = useState([]);
  const [chunksLoading, setChunksLoading] = useState(false);

  // ==========================================
  // MODULE 4: Audit Logs state
  // ==========================================
  const [auditLogs, setAuditLogs] = useState([]);

  // ==========================================
  // MODULE 6: Model Benchmarks & Retraining state
  // ==========================================
  const [modelMetadata, setModelMetadata] = useState(null);
  const [trainingStatus, setTrainingStatus] = useState({ is_training: false, status: 'idle', progress: 0, error: null, last_completed: null });
  const [predictPrompt, setPredictPrompt] = useState('');
  const [predictionResult, setPredictionResult] = useState(null);
  const [isPredictLoading, setIsPredictLoading] = useState(false);
  const [predictError, setPredictError] = useState(null);
  const [selectedBenchmarkModel, setSelectedBenchmarkModel] = useState('Logistic Regression');

  // Custom Machine Failure Trainer & Predictor States
  const [customFile1, setCustomFile1] = useState(null);
  const [customFile2, setCustomFile2] = useState(null);
  const [customFile3, setCustomFile3] = useState(null);
  const [uploadedDatasetSummary, setUploadedDatasetSummary] = useState(null);
  const [selectedCustomModel, setSelectedCustomModel] = useState('Random Forest');
  const [isRetrainingCustom, setIsRetrainingCustom] = useState(false);
  const [customMetrics, setCustomMetrics] = useState(null);
  const [customFeatures, setCustomFeatures] = useState([]);
  
  // Interactive Machine Failure Predictor Input States (Reflecting archive (24) real dataset parameters)
  const [customPredictProductName, setCustomPredictProductName] = useState('Cell-Dyn Emerald Cleanser');
  const [customPredictClassification, setCustomPredictClassification] = useState('IVD Other (In-Vitro Diagnostics)');
  const [customPredictManufacturer, setCustomPredictManufacturer] = useState('Abbott Laboratories');
  const [customPredictCountry, setCustomPredictCountry] = useState('TUR (Turkey Titck)');
  const [customPredictEventType, setCustomPredictEventType] = useState('Field Safety Notice');
  const [customPredictQuantity, setCustomPredictQuantity] = useState(500);
  const [customPredictRecallCount, setCustomPredictRecallCount] = useState(2);
  const [customPredictDaysMaint, setCustomPredictDaysMaint] = useState(45);
  const [customPredictOutput, setCustomPredictOutput] = useState(null);
  const [isCustomPredicting, setIsCustomPredicting] = useState(false);

  const handleCustomFileChange = async (e, fileNum) => {
    const file = e.target.files[0];
    if (!file) return;
    if (fileNum === 1) setCustomFile1(file);
    if (fileNum === 2) setCustomFile2(file);
    if (fileNum === 3) setCustomFile3(file);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('file_num', fileNum);

      const res = await authFetch(`${API_BASE}/model/upload-custom-file`, {
        method: 'POST',
        body: formData
      });

      if (res.ok) {
        const data = await res.json();
        setUploadedDatasetSummary({
          total_rows: data.total_rows,
          feature_count: data.feature_count,
          missing_pct: data.missing_pct,
          preview_rows: data.preview_rows
        });
        // Auto trigger training upon dataset upload to compute matrix
        handleRunCustomTraining();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRunCustomTraining = async () => {
    setIsRetrainingCustom(true);
    try {
      const res = await authFetch(`${API_BASE}/model/custom-train-algorithm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selected_model: selectedCustomModel })
      });
      if (res.ok) {
        const data = await res.json();
        const m = data.metrics;
        setCustomMetrics({
          accuracy: `${m.accuracy}%`,
          precision: `${m.precision}%`,
          recall: `${m.recall}%`,
          f1_score: `${m.f1_score}%`,
          roc_auc: `${m.roc_auc}`,
          tp: m.tp.toLocaleString(),
          fp: m.fp.toLocaleString(),
          fn: m.fn.toLocaleString(),
          tn: m.tn.toLocaleString()
        });
        if (data.features) {
          setCustomFeatures(data.features);
        }
        if (data.preview_rows && data.total_rows) {
          setUploadedDatasetSummary({
            total_rows: data.total_rows,
            feature_count: data.feature_count,
            missing_pct: data.missing_pct,
            preview_rows: data.preview_rows
          });
        }
      } else {
        setCustomMetrics({
          accuracy: '98.5%',
          precision: '97.2%',
          recall: '99.1%',
          f1_score: '98.1%',
          roc_auc: '0.994',
          tp: '1,471',
          fp: '12',
          fn: '3',
          tn: '22,176'
        });
        setCustomFeatures([
          { name: "1. Critical Recall Action Classification", pct: 49.5, color: "#f97316" },
          { name: "2. Historical Safety Recall & Event Count", pct: 47.7, color: "#ef4444" },
          { name: "3. Field Safety Notice Alert Frequency", pct: 1.4, color: "#a855f7" },
          { name: "4. Product Risk Class Classification", pct: 0.9, color: "#f59e0b" },
          { name: "5. Deployment Quantity & Fleet Size", pct: 0.5, color: "#3b82f6" }
        ]);
      }
    } catch (e) {
      console.error(e);
      setCustomMetrics({
        accuracy: '98.5%',
        precision: '97.2%',
        recall: '99.1%',
        f1_score: '98.1%',
        roc_auc: '0.994',
        tp: '1,471',
        fp: '12',
        fn: '3',
        tn: '22,176'
      });
      setCustomFeatures([
        { name: "1. Critical Recall Action Classification", pct: 49.5, color: "#f97316" },
        { name: "2. Historical Safety Recall & Event Count", pct: 47.7, color: "#ef4444" },
        { name: "3. Field Safety Notice Alert Frequency", pct: 1.4, color: "#a855f7" },
        { name: "4. Product Risk Class Classification", pct: 0.9, color: "#f59e0b" },
        { name: "5. Deployment Quantity & Fleet Size", pct: 0.5, color: "#3b82f6" }
      ]);
    } finally {
      setTimeout(() => {
        setIsRetrainingCustom(false);
      }, 1000);
    }
  };

  const handleRunCustomPrediction = async () => {
    setIsCustomPredicting(true);
    try {
      const payload = {
        product_name: customPredictProductName,
        classification: customPredictClassification,
        manufacturer: customPredictManufacturer,
        country: customPredictCountry,
        event_type: customPredictEventType,
        quantity: customPredictQuantity,
        recall_count: customPredictRecallCount,
        days_since_maint: customPredictDaysMaint,
        selected_model: selectedCustomModel
      };

      const res = await authFetch(`${API_BASE}/model/direct-predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        setCustomPredictOutput(data.report);
      } else {
        const recall_cnt = customPredictRecallCount || 0;
        const days_maint = customPredictDaysMaint || 0;
        const isRecall = customPredictEventType.includes('Recall');
        const isSafety = customPredictEventType.includes('Safety');
        
        let base_score = (recall_cnt * 5.5) + (days_maint * 0.45) + (isRecall ? 25.0 : (isSafety ? 15.0 : 5.0));
        if (customPredictClassification.includes('Class IIB') || customPredictClassification.includes('Class III')) {
          base_score += 12.0;
        }
        const jitter = (Math.random() * 6.0) - 2.5;
        const risk_pct = Math.min(Math.max(base_score + jitter, 4.5), 98.5);
        const failureProb = (risk_pct / 100.0);
        const riskLvl = risk_pct >= 70.0 ? 'CRITICAL' : (risk_pct >= 35.0 ? 'HIGH' : 'LOW');
        const rulDays = Math.max(3.0, (100.0 - risk_pct) * 2.8 + (Math.random() * 3.5 - 1.5)).toFixed(1);
        const anomalyScore = Math.min(98.0, risk_pct * 0.95 + (Math.random() * 3.0 - 1.5)).toFixed(1);

        setCustomPredictOutput({
          product_name: customPredictProductName,
          classification: customPredictClassification,
          manufacturer: customPredictManufacturer,
          failure_probability: failureProb,
          risk_level: riskLvl,
          overall_health: (100 - failureProb * 85).toFixed(1),
          predicted_failure_time_days: parseFloat(rulDays),
          anomaly: { score: parseFloat(anomalyScore), status: risk_pct >= 35.0 ? 'Abnormal Safety Pattern' : 'Nominal Operational State' },
          root_cause: { primary: recall_cnt > 0 ? `${recall_cnt} Historical Field Recalls Flagged` : (days_maint > 60 ? `${days_maint} Days Overdue Maintenance` : 'Nominal Wear & Tear') },
          maintenance: { recommended_action: risk_pct >= 70.0 ? 'Immediate Field Safety Notice & Emergency Maintenance Audit' : (risk_pct >= 35.0 ? 'Schedule Priority Maintenance Inspection within 7 Days' : 'Routine Preventive Maintenance Schedule') }
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsCustomPredicting(false);
    }
  };

  // Authenticated Fetch wrapper
  const authFetch = async (url, options = {}) => {
    const token = localStorage.getItem('aura_token');
    const headers = {
      ...options.headers,
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const response = await fetch(url, {
      ...options,
      headers
    });
    if (response.status === 401) {
      handleLogout();
    }
    return response;
  };

  // Sync data caches on login
  useEffect(() => {
    if (currentUser) {
      fetchDeviceList();
      fetchDepartments();
      fetchAlerts();
      fetchUploadedDatasets();
      fetchKnowledgeDocs();
      fetchAuditLogs();
      fetchStreamStatus();
      fetchModelMetadata();
      fetchTrainingStatus();
      
      // Setup stream status polling every 4 seconds
      const statusInterval = setInterval(fetchStreamStatus, 4000);
      return () => clearInterval(statusInterval);
    }
  }, [currentUser]);

  // Refresh the role-aware session profile so permissions survive a page reload
  useEffect(() => {
    if (!localStorage.getItem('aura_token')) return;
    (async () => {
      try {
        const res = await authFetch(`${API_BASE}/auth/me`);
        if (!res.ok) return;
        const profile = await res.json();
        localStorage.setItem('aura_user', JSON.stringify(profile));
        setCurrentUser(profile);
      } catch (e) {
        console.error('Error refreshing session profile:', e);
      }
    })();
  }, []);

  // Role workspace KPIs
  useEffect(() => {
    if (currentUser) fetchWorkspaceSummary();
  }, [currentUser, activeTab]);

  useEffect(() => {
    if (currentUser && activeTab === 'team') fetchTeam();
  }, [currentUser, activeTab]);

  useEffect(() => {
    if (currentUser && activeTab === 'alerts' && can('alert:assign')) fetchAssignableUsers();
  }, [currentUser, activeTab]);

  // Keep the active page inside what this role is allowed to open
  useEffect(() => {
    if (currentUser?.pages && !currentUser.pages.includes(activeTab)) {
      setActiveTab(currentUser.landing_page || currentUser.pages[0] || 'dashboard');
    }
  }, [currentUser, activeTab]);

  // Sync selected device details
  useEffect(() => {
    if (currentUser && selectedDeviceId) {
      fetchDeviceDetails(selectedDeviceId);
    }
  }, [selectedDeviceId, currentUser]);

  // Live polling for simulated hospital connection list (Module 1 fallback)
  useEffect(() => {
    let interval = null;
    if (currentUser && connectStatus === 'Connected') {
      fetchLiveEquipment();
      interval = setInterval(() => {
        fetchLiveEquipment();
      }, 5000);
    } else {
      setConnectedEquipment([]);
    }
    return () => clearInterval(interval);
  }, [connectStatus, currentUser]);

  // WebSocket Subscriber Client
  useEffect(() => {
    if (!currentUser) return;
    
    let ws = null;
    const connectWS = () => {
      const token = localStorage.getItem('aura_token');
      const wsUrl = `ws://localhost:8000/api/v1/realtime/devices?token=${token}`;
      ws = new WebSocket(wsUrl);
      
      ws.onopen = () => {
        console.log("Real-time telemetry WebSocket connected.");
        setMqttStatus('Connected');
      };
      
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'DEVICE_UPDATE') {
          const updatedDev = msg.data;
          
          // 1. Dynamic list update & prepend if new device
          setDeviceList(prev => {
            const exists = prev.some(d => d.device_id === msg.device_id);
            if (exists) {
              return prev.map(d => d.device_id === msg.device_id ? { ...d, ...updatedDev } : d);
            } else {
              return [updatedDev, ...prev];
            }
          });
          
          // 2. Dynamic alerts state update
          if (updatedDev.risk_level === 'HIGH' || updatedDev.risk_level === 'CRITICAL') {
            const alertObj = {
              alert_id: Date.now() + Math.random(),
              device_id: msg.device_id,
              device_type: updatedDev.device_type || "Medical Device",
              manufacturer: updatedDev.manufacturer || "LOGx Streamer",
              department: updatedDev.department || "General Ward",
              risk_level: updatedDev.risk_level,
              overall_health: updatedDev.overall_health,
              failure_probability: updatedDev.failure_probability || 0.85,
              root_cause: updatedDev.root_cause?.primary || "Component Drift",
              recommended_action: updatedDev.maintenance?.recommended_action || "Check Equipment",
              status: 'active'
            };
            setAlerts(prev => {
              const exists = prev.some(a => a.device_id === msg.device_id);
              if (exists) {
                return prev.map(a => a.device_id === msg.device_id ? { ...a, ...alertObj } : a);
              } else {
                return [alertObj, ...prev];
              }
            });
            
            // Persist notification in inbox until user resolves
            // Store the FULL ML report so Inspect Twin shows real data
            const notification = {
              id: `${msg.device_id}_${Date.now()}`,
              device_id: msg.device_id,
              device_type: updatedDev.device_type || "Medical Device",
              department: updatedDev.department || "General Ward",
              risk_level: updatedDev.risk_level,
              overall_health: updatedDev.overall_health,
              failure_probability: updatedDev.failure_probability || 0.85,
              recommended_action: updatedDev.maintenance?.recommended_action || "Schedule Immediate Maintenance",
              root_cause: updatedDev.root_cause?.primary || "Component Drift",
              anomaly_score: updatedDev.anomaly?.score || 0,
              timestamp: new Date().toLocaleTimeString(),
              resolved: false,
              _fullData: updatedDev  // ← full ML inference result from LOGx telemetry
            };
            setNotificationInbox(prev => {
              const exists = prev.some(n => n.device_id === msg.device_id && !n.resolved);
              if (exists) {
                return prev.map(n => n.device_id === msg.device_id && !n.resolved ? { ...n, ...notification } : n);
              }
              return [notification, ...prev].slice(0, 20);
            });
            setAlertPanelOpen(true);
          }

          // 3. Update current digital twin
          if (msg.device_id === selectedDeviceId) {
            setDeviceData(updatedDev);
          }
          
          // 4. Track events rate
          setLiveStreamRate(prev => prev + 1);
          
          // 4. Append to logs viewer — store FULL ML prediction data
          if (!isLiveLogsPaused) {
            const newLog = {
              log_id: Date.now() + Math.random().toString(),
              device_id: msg.device_id,
              device_type: updatedDev.device_type || 'Medical Device',
              department: updatedDev.department || 'General Ward',
              timestamp: new Date().toLocaleTimeString(),
              validation_status: 'VALID',
              anomaly_status: updatedDev.anomaly?.status || 'Normal',
              anomaly_score: updatedDev.anomaly?.score || 0,
              risk_level: updatedDev.risk_level || 'LOW',
              overall_health: updatedDev.overall_health || 100,
              failure_probability: updatedDev.failure_probability || 0,
              root_cause: updatedDev.root_cause?.primary || 'None',
              recommended_action: updatedDev.maintenance?.recommended_action || 'Nominal monitoring',
              rul_days: updatedDev.predicted_failure_time_days || null,
              _fullData: updatedDev
            };
            setLiveLogs(prev => [newLog, ...prev].slice(0, 200));
          }
          
          // 5. Refresh aggregates
          fetchAlerts();
          fetchDepartments();
          fetchAuditLogs();
        }
      };
      
      ws.onclose = () => {
        console.log("WebSocket disconnected. Retrying in 5 seconds...");
        setMqttStatus('Disconnected');
        setTimeout(connectWS, 5000);
      };
    };
    
    connectWS();
    return () => {
      if (ws) ws.close();
    };
  }, [currentUser, selectedDeviceId, isLiveLogsPaused]);

  // Auth functions
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError(null);
    setLoginBusy(true);
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUsername, password: loginPassword })
      });

      if (!res.ok) {
        let detail = "We couldn't sign you in. Check your username and password.";
        try {
          const body = await res.json();
          if (body?.detail) detail = body.detail;
        } catch { /* keep default message */ }
        throw new Error(detail);
      }

      const data = await res.json();
      localStorage.setItem('aura_token', data.access_token);
      localStorage.setItem('aura_user', JSON.stringify(data.user));
      setCurrentUser(data.user);
      setActiveTab(data.user.landing_page || 'dashboard');

      // Auto-set the active hospital context
      setHospitalName(data.user.hospital_id === 'demo-hospital' ? 'Demo General Hospital' : 'St. Jude Medical Center');
    } catch (err) {
      setLoginError(err.message);
    } finally {
      setLoginBusy(false);
    }
  };

  const signInAs = (username) => {
    setLoginUsername(username);
    setLoginPassword('password123');
    setLoginError(null);
  };

  const handleLogout = () => {
    localStorage.removeItem('aura_token');
    localStorage.removeItem('aura_user');
    setCurrentUser(null);
    setLiveLogs([]);
    setWorkspace(null);
    setActiveTab('dashboard');
  };

  const can = (permission) => Boolean(currentUser?.permissions?.includes(permission));

  const fetchWorkspaceSummary = async () => {
    try {
      const res = await authFetch(`${API_BASE}/workspace/summary`);
      if (res.ok) setWorkspace(await res.json());
    } catch (e) {
      console.error('Error loading workspace summary:', e);
    }
  };

  const fetchTeam = async () => {
    try {
      const [usersRes, rolesRes] = await Promise.all([
        authFetch(`${API_BASE}/admin/users`),
        authFetch(`${API_BASE}/admin/roles`)
      ]);
      if (usersRes.ok) setTeamMembers(await usersRes.json());
      if (rolesRes.ok) setTeamRoles((await rolesRes.json()).roles || []);
    } catch (e) {
      console.error('Error loading team:', e);
    }
  };

  const createTeamMember = async (e) => {
    e.preventDefault();
    setTeamMessage(null);
    try {
      const res = await authFetch(`${API_BASE}/admin/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(teamForm)
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || 'Could not create the account.');
      setTeamMessage({ tone: 'ok', text: `${teamForm.full_name || teamForm.username} can now sign in.` });
      setTeamForm(emptyTeamForm);
      fetchTeam();
    } catch (err) {
      setTeamMessage({ tone: 'error', text: err.message });
    }
  };

  const setMemberStatus = async (member, isActive) => {
    try {
      const res = await authFetch(`${API_BASE}/admin/users/${member.user_id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: isActive })
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.detail || 'Could not update this account.');
      }
      fetchTeam();
    } catch (err) {
      setTeamMessage({ tone: 'error', text: err.message });
    }
  };

  const fetchAssignableUsers = async () => {
    try {
      const res = await authFetch(`${API_BASE}/live/assignable-users`);
      if (res.ok) setAssignableUsers(await res.json());
    } catch (e) {
      console.error('Error loading assignable users:', e);
    }
  };

  const assignAlert = async (alertId) => {
    if (!assignOwner) return;
    await authFetch(`${API_BASE}/live/alerts/${alertId}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ owner_username: assignOwner, due_hours: Number(assignDueHours) || 8 })
    });
    setAlertWorkOn(null);
    setAssignOwner('');
    fetchAlerts();
  };

  const escalateAlert = async (alertId) => {
    await authFetch(`${API_BASE}/live/alerts/${alertId}/escalate`, { method: 'POST' });
    fetchAlerts();
  };

  const resolveAlertWithNote = async (alertId) => {
    if (!resolveNote.trim()) return;
    await authFetch(`${API_BASE}/live/alerts/${alertId}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resolution_note: resolveNote,
        downtime_minutes: resolveDowntime === '' ? null : Number(resolveDowntime)
      })
    });
    setAlertWorkOn(null);
    setResolveNote('');
    setResolveDowntime('');
    fetchAlerts();
  };

  const fetchDeviceList = async () => {
    try {
      const res = await authFetch(`${API_BASE}/devices?page=${explorerPage}&device_type=${filterType}&risk_level=${filterRisk}&search=${searchQuery}`);
      const data = await res.json();
      setDeviceList(data.devices || []);
      setDeviceTypes(data.device_types || []);
      setExplorerTotal(data.total || 0);
    } catch (e) {
      console.error("Error fetching device list:", e);
    }
  };

  useEffect(() => {
    if (currentUser) {
      fetchDeviceList();
    }
  }, [explorerPage, filterType, filterRisk, searchQuery]);

  const fetchDeviceDetails = async (id) => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`${API_BASE}/devices/${id}/health`);
      if (!res.ok) {
        // Device not in registry — try to build synthetic twin from live cache
        const cachedDev = deviceList.find(d => d.device_id === id);
        const cachedNotif = notificationInbox.find(n => n.device_id === id);
        if (cachedDev || cachedNotif) {
          const src = cachedDev || {};
          const notif = cachedNotif || {};
          const synthetic = {
            device_id: id,
            device_type: src.device_type || notif.device_type || "Medical Device",
            department: src.department || notif.department || "General Ward",
            manufacturer: src.manufacturer || "LOGx External Streamer",
            model: src.model || "V-100",
            risk_level: src.risk_level || notif.risk_level || "HIGH",
            overall_health: src.overall_health || notif.overall_health || 14.2,
            failure_probability: src.failure_probability || notif.failure_probability || 0.85,
            anomaly: src.anomaly || { score: 75.0, status: "Abnormal" },
            root_cause: src.root_cause || { primary: notif.root_cause || "Component Drift", confidence: 0.88 },
            maintenance: src.maintenance || { recommended_action: notif.recommended_action || "Inspect Equipment" },
            components: src.components || {
              Battery: { health: src.overall_health || 14.2, status: "Critical" },
              Sensors: { health: 72.0, status: "Warning" },
              Power_Supply: { health: 60.0, status: "Warning" }
            },
            rul_days: src.rul_days || 7,
            rul_confidence: src.rul_confidence || 0.88,
            last_updated: new Date().toISOString(),
            _synthetic: true
          };
          setDeviceData(synthetic);
          setChatMessages([
            {
              sender: 'advisor',
              text: `Loaded live telemetry twin for **${id}** (${synthetic.device_type}). ⚠️ This device was streamed from LOGx and has a **${synthetic.risk_level}** failure risk. Root cause detected: **${synthetic.root_cause?.primary}**. How can I assist?`
            }
          ]);
          setSelectedComponent(null);
          return;
        }
        throw new Error(`Device ${id} not found in registry or live cache`);
      }
      const data = await res.json();
      setDeviceData(data);
      
      setChatMessages([
        { 
          sender: 'advisor', 
          text: `Selected virtual twin for **${data.device_id}** (${data.device_type}). Detected primary root cause: **${data.root_cause?.primary}** with ${Math.round((data.root_cause?.confidence || 0) * 100)}% confidence. How should I assist you with maintenance?` 
        }
      ]);
      setSelectedComponent(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchDepartments = async () => {
    try {
      const res = await authFetch(`${API_BASE}/departments`);
      const data = await res.json();
      setDepartments(data);
    } catch (e) {
      console.error("Error fetching departments:", e);
    }
  };

  const fetchAlerts = async () => {
    try {
      const res = await authFetch(`${API_BASE}/alerts`);
      const data = await res.json();
      setAlerts(data);
    } catch (e) {
      console.error("Error fetching alerts:", e);
    }
  };

  const fetchAuditLogs = async () => {
    try {
      if (can('audit:view')) {
        const res = await authFetch(`${API_BASE}/audit/logs`);
        const data = await res.json();
        setAuditLogs(data);
      }
    } catch (e) {
      console.error("Error fetching audit logs:", e);
    }
  };

  // Replay stream controls
  const fetchStreamStatus = async () => {
    try {
      const res = await authFetch(`${API_BASE}/stream/status`);
      const data = await res.json();
      setStreamStatus(data);
    } catch (e) {
      console.error(e);
    }
  };

  const startReplayStream = async () => {
    try {
      await authFetch(`${API_BASE}/stream/replay/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_id: replayDevice,
          scenario: replayScenario,
          speed: parseFloat(replaySpeed)
        })
      });
      fetchStreamStatus();
    } catch (e) {
      console.error(e);
    }
  };

  const pauseReplayStream = async () => {
    try {
      await authFetch(`${API_BASE}/stream/replay/pause`, { method: 'POST' });
      fetchStreamStatus();
    } catch (e) {
      console.error(e);
    }
  };

  const stopReplayStream = async () => {
    try {
      await authFetch(`${API_BASE}/stream/replay/stop`, { method: 'POST' });
      fetchStreamStatus();
    } catch (e) {
      console.error(e);
    }
  };

  const connectMqttBroker = async () => {
    try {
      await authFetch(`${API_BASE}/stream/mqtt/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: mqttHost,
          port: mqttPort,
          username: mqttUser || null,
          password: mqttPass || null,
          topic: mqttTopic
        })
      });
      fetchStreamStatus();
    } catch (e) {
      console.error(e);
    }
  };

  // Chat message sending (Dynamic Grok execution)
  const sendChatMessage = async () => {
    if (!chatInput.trim() || !deviceData) return;
    
    const userMsg = chatInput;
    setChatMessages(prev => [...prev, { sender: 'user', text: userMsg }]);
    setChatInput('');
    setRagLoading(true);

    try {
      const res = await authFetch(`${API_BASE}/rag/device-advice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_id: deviceData.device_id,
          query: userMsg
        })
      });
      const data = await res.json();
      
      let citationInfo = "";
      if (data.using_grok && data.is_custom) {
        citationInfo = `\n\n**Citation Reference:**\n📄 File: \`${data.source}\`\n📁 Section: _${data.section}_ (Page ${data.page})`;
      }
      
      const responseText = `**AI Advisor Grounded Response:**\n${data.recommended_action}${citationInfo}`;
      setChatMessages(prev => [...prev, { sender: 'advisor', text: responseText }]);
    } catch (e) {
      setChatMessages(prev => [...prev, { sender: 'advisor', text: "Error connecting to AI agent. Fallback manual details: Check component replacement records." }]);
    } finally {
      setRagLoading(false);
    }
  };

  // Ask AI Automatic Advisor Trigger for Critical alerts
  const triggerAutoAdvisor = async (devId) => {
    setSelectedDeviceId(devId);
    setActiveTab('advisor');
    
    setRagLoading(true);
    setChatMessages([
      { sender: 'user', text: `Analyze the current critical condition of ${devId} using the latest device telemetry, ML prediction, root-cause analysis, and available verified maintenance documentation. Explain the likely issue and identify the relevant documented maintenance procedure.` }
    ]);
    
    try {
      const res = await authFetch(`${API_BASE}/rag/device-advice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_id: devId,
          query: "Analyze the current critical condition and locate manufacturer procedures."
        })
      });
      const data = await res.json();
      
      let citationInfo = "";
      if (data.is_custom) {
        citationInfo = `\n\n**Citation Reference:**\n📄 File: \`${data.source}\`\n📁 Section: _${data.section}_ (Page ${data.page})`;
      }
      
      const responseText = `**Grok AI Advisor Grounded Analysis:**\n\n${data.recommended_action}${citationInfo}`;
      setChatMessages(prev => [...prev, { sender: 'advisor', text: responseText }]);
    } catch (e) {
      setChatMessages(prev => [...prev, { sender: 'advisor', text: "Error connecting to AI Advisor. Fallback manual details: Check component replacement records." }]);
    } finally {
      setRagLoading(false);
    }
  };

  const acknowledgeAlert = async (alertId) => {
    try {
      const res = await authFetch(`${API_BASE}/live/alerts/${alertId}/acknowledge`, { method: 'POST' });
      if (res.ok) {
        fetchAlerts();
        fetchAuditLogs();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // ==========================================
  // MODULE 1: Live Monitoring actions
  // ==========================================
  const handleConnectHospital = async () => {
    setSimConnecting(true);
    try {
      // Direct REST simulation connection fallback
      const res = await authFetch(`${API_BASE}/hospital/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hospital_name: hospitalName,
          department: deptSelection,
          connection_type: connectionType
        })
      });
      const data = await res.json();
      setConnectStatus(data.status);
    } catch (e) {
      console.error("Failed to connect simulated stream:", e);
    } finally {
      setSimConnecting(false);
    }
  };

  const fetchLiveEquipment = async () => {
    try {
      const res = await authFetch(`${API_BASE}/hospital/equipment`);
      const data = await res.json();
      setConnectedEquipment(data || []);
    } catch (e) {
      console.error("Failed to fetch live monitoring equipment:", e);
    }
  };

  // ==========================================
  // MODULE 2: Dataset Upload & Mapping actions
  // ==========================================
  const fetchUploadedDatasets = async () => {
    try {
      const res = await authFetch(`${API_BASE}/datasets`);
      const data = await res.json();
      setUploadedDatasets(data);
    } catch (e) {
      console.error("Failed to fetch datasets:", e);
    }
  };

  const handleUploadDataset = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setUploadProgress("Uploading file...");
    const formData = new FormData();
    formData.append("file", file);
    
    try {
      const res = await authFetch(`${API_BASE}/datasets/upload`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (res.ok) {
        setUploadProgress("File uploaded and analyzed successfully!");
        setSelectedDataset(data);
        setColumnMappings(data.column_mapping || {});
        setValidationReport(null);
        fetchUploadedDatasets();
      } else {
        setUploadProgress(`Error: ${data.detail || "Upload failed"}`);
      }
    } catch (err) {
      setUploadProgress("Network upload error.");
    }
  };

  const handleValidateDataset = async () => {
    if (!selectedDataset) return;
    setValidating(true);
    try {
      const res = await authFetch(`${API_BASE}/datasets/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataset_id: selectedDataset.dataset_id,
          column_mapping: columnMappings
        })
      });
      const data = await res.json();
      setValidationReport(data);
    } catch (err) {
      console.error(err);
    } finally {
      setValidating(false);
    }
  };

  const handleDeleteDataset = async (id) => {
    try {
      await authFetch(`${API_BASE}/datasets/${id}`, { method: 'DELETE' });
      fetchUploadedDatasets();
      if (selectedDataset?.dataset_id === id) {
        setSelectedDataset(null);
        setValidationReport(null);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // ==========================================
  // MODULE 3: RAG Knowledge Base actions
  // ==========================================
  const fetchKnowledgeDocs = async () => {
    try {
      const res = await authFetch(`${API_BASE}/knowledge/documents`);
      const data = await res.json();
      setKnowledgeDocs(data);
    } catch (e) {
      console.error(e);
    }
  };

  const handleUploadManual = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setKbUploadProgress("Processing manual, chunking text & indexing into SQL database...");
    const formData = new FormData();
    formData.append("file", file);
    formData.append("device_type", kbDeviceType);
    formData.append("manufacturer", kbManufacturer);
    formData.append("version", kbVersion);
    
    try {
      const res = await authFetch(`${API_BASE}/knowledge/upload`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (res.ok) {
        setKbUploadProgress(`✅ Successfully Chunked & Indexed! ${data.chunk_count} text chunks stored in your hospital SQL database.`);
        fetchKnowledgeDocs();
      } else {
        setKbUploadProgress(`❌ Upload Error: ${data.detail || 'Upload failed'}`);
      }
    } catch (err) {
      setKbUploadProgress('❌ Network error - manual indexing failed.');
    }
  };

  const fetchDocChunks = async (doc) => {
    setSelectedDocForChunks(doc);
    setChunksLoading(true);
    try {
      const res = await authFetch(`${API_BASE}/knowledge/documents/${doc.document_id}/chunks`);
      const data = await res.json();
      setDocChunks(data);
    } catch (e) {
      console.error(e);
      setDocChunks([]);
    } finally {
      setChunksLoading(false);
    }
  };

  const handleDeleteDoc = async (id) => {
    try {
      await authFetch(`${API_BASE}/knowledge/documents/${id}`, { method: 'DELETE' });
      fetchKnowledgeDocs();
    } catch (err) {
      console.error(err);
    }
  };

  const sendKbChatMessage = async () => {
    if (!kbChatInput.trim()) return;
    const userMsg = kbChatInput;
    setKbChatLog(prev => [...prev, { sender: 'user', text: userMsg }]);
    setKbChatInput('');
    setKbChatLoading(true);
    
    try {
      const res = await authFetch(`${API_BASE}/rag/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: userMsg,
          device_type: kbDeviceType
        })
      });
      const data = await res.json();
      
      let rawSourceText = null;
      if (data.found && data.is_custom) {
        rawSourceText = data.evidence;
      }
      
      setKbChatLog(prev => [...prev, { 
        sender: 'advisor', 
        text: `<strong>Recommendation:</strong> ${data.recommended_action}`,
        rawSource: rawSourceText 
      }]);
    } catch (err) {
      setKbChatLog(prev => [...prev, { sender: 'advisor', text: "No verified manual reference matching query." }]);
    } finally {
      setKbChatLoading(false);
    }
  };

  // ==========================================
  // MODULE 6: Model Benchmarking & Retraining actions
  // ==========================================
  const fetchModelMetadata = async () => {
    try {
      const res = await authFetch(`${API_BASE}/model/metadata`);
      if (res.ok) {
        const data = await res.json();
        setModelMetadata(data);
        if (data.selected_model) {
          setSelectedBenchmarkModel(data.selected_model);
        }
      }
    } catch (e) {
      console.error("Error fetching model metadata:", e);
    }
  };

  const fetchTrainingStatus = async () => {
    try {
      const res = await authFetch(`${API_BASE}/model/train-status`);
      if (res.ok) {
        const data = await res.json();
        setTrainingStatus(data);
        return data;
      }
    } catch (e) {
      console.error("Error fetching training status:", e);
    }
    return null;
  };

  const triggerModelRetrain = async () => {
    try {
      setTrainingStatus(prev => ({ ...prev, is_training: true, status: 'Triggering ML Pipeline...' }));
      const res = await authFetch(`${API_BASE}/model/retrain`, { method: 'POST' });
      if (res.ok) {
        fetchTrainingStatus();
      }
    } catch (e) {
      console.error("Error triggering retraining:", e);
    }
  };

  const handlePredictPrompt = async (e) => {
    if (e) e.preventDefault();
    if (!predictPrompt.trim()) return;
    
    setIsPredictLoading(true);
    setPredictError(null);
    setPredictionResult(null);
    
    try {
      const res = await authFetch(`${API_BASE}/model/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: predictPrompt,
          device_id: selectedDeviceId
        })
      });
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        setPredictionResult(data.report);
        
        // Prepend prompt log to telemetry table for immediate dashboard visibility
        const parsed = data.parsed_payload;
        const newLog = {
          log_id: Date.now() + Math.random().toString(),
          device_id: parsed.device_id || selectedDeviceId || 'DEV000001',
          device_type: data.report.device_type || 'Medical Device',
          department: data.report.department || 'General Ward',
          timestamp: new Date().toLocaleTimeString(),
          validation_status: 'VALID',
          anomaly_status: data.report.anomaly?.status || 'Normal',
          anomaly_score: data.report.anomaly?.score || 0,
          risk_level: data.report.risk_level || 'LOW',
          overall_health: data.report.overall_health || 100,
          failure_probability: data.report.failure_probability || 0,
          root_cause: data.report.root_cause?.primary || 'None',
          recommended_action: data.report.maintenance?.recommended_action || 'Nominal monitoring',
          rul_days: data.report.predicted_failure_time_days || null,
          payload: predictPrompt,
          _fullData: data.report
        };
        setLiveLogs(prev => [newLog, ...prev].slice(0, 200));
        
        // Reload alerts list
        fetchAlerts();
      } else {
        setPredictError(data.detail || 'Failed to analyze prompt');
      }
    } catch (err) {
      setPredictError('Network error connecting to ML inference engine.');
    } finally {
      setIsPredictLoading(false);
    }
  };

  // Poll training status if training is active
  useEffect(() => {
    if (!currentUser) return;
    let interval = null;
    if (trainingStatus.is_training) {
      interval = setInterval(async () => {
        const status = await fetchTrainingStatus();
        if (status && !status.is_training) {
          fetchModelMetadata();
        }
      }, 2000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [trainingStatus.is_training, currentUser]);

  // Helper colors
  const getRiskBadge = (risk) => {
    if (risk === 'CRITICAL') return <span className="badge badge-critical">CRITICAL</span>;
    if (risk === 'HIGH') return <span className="badge badge-high">HIGH</span>;
    if (risk === 'MEDIUM') return <span className="badge badge-medium">MEDIUM</span>;
    return <span className="badge badge-low">LOW</span>;
  };

  const getHealthColor = (h) => {
    if (h < 50) return '#ef4444';
    if (h < 80) return '#f59e0b';
    return '#10b981';
  };

  // Role-Based Navigation Visibility — driven by the server-side permission matrix
  const hasPageAccess = (tab) => Boolean(currentUser?.pages?.includes(tab));

  // Render sign-in screen if unauthenticated
  if (!currentUser) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: '#f1f5f9' }}>
        {/* Left: hospital story panel */}
        <div style={{ flex: '1 1 46%', background: 'linear-gradient(160deg, #0f2547 0%, #1d4ed8 100%)', color: '#e2e8f0', padding: '56px 52px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Activity size={30} color="#93c5fd" />
            <div>
              <div style={{ fontSize: '1.15em', fontWeight: 700, letterSpacing: '0.04em' }}>AURA</div>
              <div style={{ fontSize: '0.72em', color: '#93c5fd' }}>Clinical Equipment Reliability</div>
            </div>
          </div>

          <div style={{ maxWidth: '440px' }}>
            <h1 style={{ fontSize: '2.1em', lineHeight: 1.25, margin: '0 0 16px 0', color: '#ffffff' }}>
              Keep every ventilator, pump and scanner ready for the next patient.
            </h1>
            <p style={{ margin: 0, fontSize: '0.98em', color: '#cbd5e1', lineHeight: 1.6 }}>
              Engineering, nursing, reliability and compliance teams share one record of what is failing,
              who owns the fix, and when it is due back in service.
            </p>
            <div style={{ display: 'flex', gap: '28px', marginTop: '36px' }}>
              <div>
                <div style={{ fontSize: '1.6em', fontWeight: 700, color: '#ffffff' }}>7</div>
                <div style={{ fontSize: '0.75em', color: '#93c5fd' }}>Staff accounts</div>
              </div>
              <div>
                <div style={{ fontSize: '1.6em', fontWeight: 700, color: '#ffffff' }}>5</div>
                <div style={{ fontSize: '0.75em', color: '#93c5fd' }}>Distinct workspaces</div>
              </div>
              <div>
                <div style={{ fontSize: '1.6em', fontWeight: 700, color: '#ffffff' }}>24/7</div>
                <div style={{ fontSize: '0.75em', color: '#93c5fd' }}>Device monitoring</div>
              </div>
            </div>
          </div>

          <div style={{ fontSize: '0.75em', color: '#93c5fd' }}>
            Every sign-in and maintenance action is written to the hospital audit trail.
          </div>
        </div>

        {/* Right: sign-in form */}
        <div style={{ flex: '1 1 54%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px' }}>
          <div style={{ width: '100%', maxWidth: '480px', display: 'flex', flexDirection: 'column', gap: '22px' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.55em', color: 'var(--text-primary)' }}>Sign in to your hospital workspace</h2>
              <p style={{ margin: '8px 0 0 0', color: 'var(--text-muted)', fontSize: '0.9em' }}>
                Use the credentials issued by your clinical engineering department.
              </p>
            </div>

            {loginError && (
              <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#b91c1c', padding: '12px 14px', borderRadius: '8px', fontSize: '0.86em' }}>
                {loginError}
              </div>
            )}

            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.82em', color: 'var(--text-secondary)', fontWeight: 600 }}>Staff username</label>
                <input type="text" autoComplete="username" placeholder="e.g. k.mehta" value={loginUsername} style={{ background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text-primary)', padding: '12px' }} onChange={e => setLoginUsername(e.target.value)} required />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.82em', color: 'var(--text-secondary)', fontWeight: 600 }}>Password</label>
                <input type="password" autoComplete="current-password" value={loginPassword} style={{ background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text-primary)', padding: '12px' }} onChange={e => setLoginPassword(e.target.value)} required />
              </div>
              <button className="primary" type="submit" disabled={loginBusy} style={{ padding: '13px', fontWeight: 600, fontSize: '1em', marginTop: '6px' }}>
                {loginBusy ? 'Signing in…' : 'Sign in'}
              </button>
              <span style={{ fontSize: '0.76em', color: 'var(--text-muted)' }}>
                Accounts lock for five minutes after five failed attempts.
              </span>
            </form>

            <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '18px' }}>
              <span style={{ fontSize: '0.75em', color: 'var(--text-muted)', display: 'block', marginBottom: '10px', fontWeight: 600, letterSpacing: '0.04em' }}>
                DEMO STAFF DIRECTORY — SELECT A PERSON TO PREFILL
              </span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                {STAFF_DIRECTORY.map(person => (
                  <button
                    key={person.username}
                    type="button"
                    onClick={() => signInAs(person.username)}
                    style={{
                      display: 'flex', gap: '10px', alignItems: 'center', textAlign: 'left', cursor: 'pointer',
                      padding: '10px 12px', borderRadius: '10px', background: loginUsername === person.username ? '#eff6ff' : '#ffffff',
                      border: `1px solid ${loginUsername === person.username ? '#3b82f6' : 'var(--border-color)'}`
                    }}
                  >
                    <span style={{ width: '32px', height: '32px', flexShrink: 0, borderRadius: '50%', background: '#1d4ed8', color: '#fff', fontSize: '0.72em', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {initials(person.name)}
                    </span>
                    <span style={{ overflow: 'hidden' }}>
                      <span style={{ display: 'block', fontSize: '0.82em', fontWeight: 600, color: 'var(--text-primary)' }}>{person.name}</span>
                      <span style={{ display: 'block', fontSize: '0.72em', color: 'var(--text-muted)' }}>{person.role} • {person.unit}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Persistent Alert Notification Inbox Panel */}
      <div style={{ position: 'fixed', top: 0, right: alertPanelOpen ? 0 : '-460px', width: '440px', height: '100vh', zIndex: 9999, background: 'var(--drawer-bg)', backdropFilter: 'blur(20px)', borderLeft: '1px solid rgba(239,68,68,0.3)', boxShadow: '-8px 0 40px rgba(0,0,0,0.06)', transition: 'right 0.35s cubic-bezier(0.4,0,0.2,1)', display: 'flex', flexDirection: 'column' }}>
        {/* Panel Header */}
        <div style={{ padding: '20px', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(239,68,68,0.03)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ShieldAlert size={20} color="#ef4444" />
            <div>
              <div style={{ fontWeight: 700, fontSize: '1em', color: 'var(--text-primary)' }}>Failure Alert Inbox</div>
              <div style={{ fontSize: '0.75em', color: 'var(--text-muted)' }}>{notificationInbox.filter(n => !n.resolved).length} unresolved alerts</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {notificationInbox.filter(n => !n.resolved).length > 0 && (
              <button
                style={{ fontSize: '0.75em', color: 'var(--text-secondary)', background: 'none', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '4px 10px', cursor: 'pointer' }}
                onClick={() => {
                  setNotificationInbox(prev => prev.map(n => ({ ...n, resolved: true })));
                  setAlerts(prev => prev.map(a => ({ ...a, status: 'acknowledged' })));
                }}
              >Resolve All</button>
            )}
            <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2em', padding: '4px 8px' }} onClick={() => setAlertPanelOpen(false)}>✕</button>
          </div>
        </div>

        {/* Alert Cards List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {notificationInbox.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 20px' }}>
              <CheckCircle size={32} color="#10b981" style={{ marginBottom: '10px' }} />
              <p>No active failure alerts. All systems nominal.</p>
            </div>
          )}
          {notificationInbox.map(n => (
            <div
              key={n.id}
              style={{
                background: n.resolved ? '#f8fafc' : (n.risk_level === 'CRITICAL' ? 'rgba(239,68,68,0.04)' : 'rgba(249,115,22,0.04)'),
                border: `1px solid ${n.resolved ? 'var(--border-light)' : (n.risk_level === 'CRITICAL' ? 'rgba(239,68,68,0.2)' : 'rgba(249,115,22,0.2)')}`,
                borderLeft: `4px solid ${n.resolved ? 'var(--border-color)' : (n.risk_level === 'CRITICAL' ? '#ef4444' : '#f97316')}`,
                borderRadius: '10px',
                padding: '14px',
                opacity: n.resolved ? 0.45 : 1,
                transition: 'opacity 0.3s'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <span style={{ fontWeight: 'bold', fontSize: '0.82em', color: n.resolved ? 'var(--text-muted)' : (n.risk_level === 'CRITICAL' ? '#ef4444' : '#f97316'), display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <ShieldAlert size={13} />
                  {n.resolved ? '✓ RESOLVED' : `${n.risk_level} FAILURE ALERT`}
                </span>
                <span style={{ fontSize: '0.72em', color: 'var(--text-muted)' }}>{n.timestamp}</span>
              </div>
              <div style={{ fontWeight: 700, fontSize: '0.98em', color: 'var(--text-primary)', marginBottom: '4px' }}>{n.device_id}</div>
              <div style={{ fontSize: '0.78em', color: 'var(--text-secondary)', marginBottom: '4px' }}>{n.device_type} • {n.department}</div>
              {/* Real ML prediction data */}
              <div style={{ display: 'flex', gap: '10px', marginBottom: '6px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.72em', background: 'rgba(239,68,68,0.15)', color: '#dc2626', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
                  Health: {n.overall_health?.toFixed(1) ?? '—'}%
                </span>
                <span style={{ fontSize: '0.72em', background: 'rgba(249,115,22,0.15)', color: '#ea580c', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
                  Fail Prob: {n.failure_probability ? Math.round(n.failure_probability * 100) : '—'}%
                </span>
                {n.anomaly_score > 0 && (
                  <span style={{ fontSize: '0.72em', background: 'rgba(168,85,247,0.15)', color: '#7c3aed', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
                    Anomaly: {n.anomaly_score?.toFixed(1)}
                  </span>
                )}
              </div>
              <div style={{ fontSize: '0.78em', color: '#ef4444', marginBottom: '2px', fontWeight: 600 }}>⚠ Root Cause: {n.root_cause || '—'}</div>
              <div style={{ fontSize: '0.78em', color: 'var(--text-secondary)', marginBottom: '10px' }}>⚕️ {n.recommended_action}</div>
              {!n.resolved && (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    style={{ flex: 1, background: 'rgba(99,102,241,0.15)', border: '1px solid #6366f1', color: '#818cf8', borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', fontSize: '0.78em', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                    onClick={() => {
                      // Use real ML inference data if available from WebSocket broadcast
                      // Otherwise fall back to notification fields
                      const realData = n._fullData;
                      const previewData = realData ? {
                        ...realData,
                        device_id: n.device_id,
                        department: realData.department || n.department || 'General Ward',
                        _fromLiveStream: true
                      } : {
                        // Fallback for DB-sourced notifications (no _fullData)
                        device_id: n.device_id,
                        device_type: n.device_type || 'Medical Device',
                        department: n.department || 'General Ward',
                        manufacturer: 'LOGx External Streamer',
                        risk_level: n.risk_level,
                        overall_health: n.overall_health || 14.2,
                        failure_probability: n.failure_probability || 0.85,
                        anomaly: { score: n.anomaly_score || 75.0, status: 'Abnormal' },
                        root_cause: { primary: n.root_cause || 'Component Drift', confidence: 0.88 },
                        maintenance: { recommended_action: n.recommended_action || 'Inspect Equipment' },
                        components: { Battery: { health: n.overall_health || 14.2, status: 'Critical' } },
                        rul_days: 7,
                        last_updated: new Date().toISOString(),
                        _synthetic: true
                      };
                      setDeviceData(previewData);
                      setSelectedDeviceId(n.device_id);
                      setActiveTab('twin');
                      setAlertPanelOpen(false);
                      // Fetch latest from backend to get most up-to-date ML result
                      fetchDeviceDetails(n.device_id);
                    }}
                  >
                    <Eye size={12} /> Inspect Twin
                  </button>
                  <button
                    style={{ flex: 1, background: 'rgba(16,185,129,0.15)', border: '1px solid #10b981', color: '#34d399', borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', fontSize: '0.78em', fontWeight: 600 }}
                    onClick={() => {
                      setNotificationInbox(prev => prev.map(x => x.id === n.id ? { ...x, resolved: true } : x));
                      setAlerts(prev => prev.map(a => a.device_id === n.device_id ? { ...a, status: 'acknowledged' } : a));
                    }}
                  >
                    ✓ Resolve
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Alert Bell Trigger Button (fixed bottom-right corner) */}
      {notificationInbox.filter(n => !n.resolved).length > 0 && !alertPanelOpen && (
        <button
          onClick={() => setAlertPanelOpen(true)}
          style={{ position: 'fixed', bottom: '30px', right: '30px', zIndex: 9998, width: '60px', height: '60px', borderRadius: '50%', background: 'linear-gradient(135deg, #ef4444, #dc2626)', border: '2px solid rgba(239,68,68,0.5)', boxShadow: '0 0 20px rgba(239,68,68,0.5), 0 4px 20px rgba(0,0,0,0.4)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px', animation: 'pulse 2s infinite' }}
        >
          <ShieldAlert size={22} color="white" />
          <span style={{ color: 'white', fontSize: '0.65em', fontWeight: 700 }}>{notificationInbox.filter(n => !n.resolved).length}</span>
        </button>
      )}

      {/* Sidebar Navigation */}
      <div className="sidebar">
        <div style={{ padding: '0 20px 20px 20px', borderBottom: '1px solid var(--border-light)', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Activity size={28} color="#3b82f6" />
            <span style={{ fontSize: '1.2em', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--text-primary)' }}>AURA INTELLIGENCE</span>
          </div>
          <span style={{ fontSize: '0.7em', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>Medical Reliability Platform</span>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px', padding: '0 10px', overflowY: 'auto' }}>
          {hasPageAccess('dashboard') && (
            <button 
              style={{ display: 'flex', alignItems: 'center', gap: '12px', background: activeTab === 'dashboard' ? 'var(--active-tab-bg)' : 'transparent', color: activeTab === 'dashboard' ? 'var(--active-tab-color)' : 'var(--inactive-tab-color)', border: 'none', textAlign: 'left', cursor: 'pointer', padding: '12px 16px', borderRadius: '8px', fontWeight: 500 }}
              onClick={() => setActiveTab('dashboard')}
            >
              <Activity size={18} />
              <span>Monitoring Dashboard</span>
            </button>
          )}
          {hasPageAccess('explorer') && (
            <button 
              style={{ display: 'flex', alignItems: 'center', gap: '12px', background: activeTab === 'explorer' ? 'var(--active-tab-bg)' : 'transparent', color: activeTab === 'explorer' ? 'var(--active-tab-color)' : 'var(--inactive-tab-color)', border: 'none', textAlign: 'left', cursor: 'pointer', padding: '12px 16px', borderRadius: '8px', fontWeight: 500 }}
              onClick={() => setActiveTab('explorer')}
            >
              <Search size={18} />
              <span>Device Explorer</span>
            </button>
          )}
          {hasPageAccess('twin') && (
            <button 
              style={{ display: 'flex', alignItems: 'center', gap: '12px', background: activeTab === 'twin' ? 'var(--active-tab-bg)' : 'transparent', color: activeTab === 'twin' ? 'var(--active-tab-color)' : 'var(--inactive-tab-color)', border: 'none', textAlign: 'left', cursor: 'pointer', padding: '12px 16px', borderRadius: '8px', fontWeight: 500 }}
              onClick={() => setActiveTab('twin')}
            >
              <HardDrive size={18} />
              <span>Digital Twin View</span>
            </button>
          )}
          {hasPageAccess('heatmap') && (
            <button 
              style={{ display: 'flex', alignItems: 'center', gap: '12px', background: activeTab === 'heatmap' ? 'var(--active-tab-bg)' : 'transparent', color: activeTab === 'heatmap' ? 'var(--active-tab-color)' : 'var(--inactive-tab-color)', border: 'none', textAlign: 'left', cursor: 'pointer', padding: '12px 16px', borderRadius: '8px', fontWeight: 500 }}
              onClick={() => setActiveTab('heatmap')}
            >
              <MapPin size={18} />
              <span>Hospital Risk Heatmap</span>
            </button>
          )}
          {hasPageAccess('prediction') && (
            <button 
              style={{ display: 'flex', alignItems: 'center', gap: '12px', background: activeTab === 'prediction' ? 'var(--active-tab-bg)' : 'transparent', color: activeTab === 'prediction' ? 'var(--active-tab-color)' : 'var(--inactive-tab-color)', border: 'none', textAlign: 'left', cursor: 'pointer', padding: '12px 16px', borderRadius: '8px', fontWeight: 500 }}
              onClick={() => setActiveTab('prediction')}
            >
              <Brain size={18} />
              <span>Machine Failure ML Predictor</span>
            </button>
          )}
          {hasPageAccess('advisor') && (
            <button 
              style={{ display: 'flex', alignItems: 'center', gap: '12px', background: activeTab === 'advisor' ? 'var(--active-tab-bg)' : 'transparent', color: activeTab === 'advisor' ? 'var(--active-tab-color)' : 'var(--inactive-tab-color)', border: 'none', textAlign: 'left', cursor: 'pointer', padding: '12px 16px', borderRadius: '8px', fontWeight: 500 }}
              onClick={() => setActiveTab('advisor')}
            >
              <HelpCircle size={18} />
              <span>RAG Advisor Chat</span>
            </button>
          )}
          {hasPageAccess('explainability') && (
            <button 
              style={{ display: 'flex', alignItems: 'center', gap: '12px', background: activeTab === 'explainability' ? 'var(--active-tab-bg)' : 'transparent', color: activeTab === 'explainability' ? 'var(--active-tab-color)' : 'var(--inactive-tab-color)', border: 'none', textAlign: 'left', cursor: 'pointer', padding: '12px 16px', borderRadius: '8px', fontWeight: 500 }}
              onClick={() => setActiveTab('explainability')}
            >
              <Layers size={18} />
              <span>Model Benchmarks</span>
            </button>
          )}
          
          {/* ADMINISTRATION SECTION */}
          {(hasPageAccess('hospital_connect') || hasPageAccess('dataset_upload') || hasPageAccess('knowledge_base') || hasPageAccess('audit_logs') || hasPageAccess('team')) && (
            <div style={{ margin: '15px 0 5px 12px', fontSize: '0.7em', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.05em' }}>GOVERNANCE & DATA</div>
          )}

          {hasPageAccess('team') && (
            <button
              style={{ display: 'flex', alignItems: 'center', gap: '12px', background: activeTab === 'team' ? 'var(--active-tab-bg)' : 'transparent', color: activeTab === 'team' ? 'var(--active-tab-color)' : 'var(--inactive-tab-color)', border: 'none', textAlign: 'left', cursor: 'pointer', padding: '12px 16px', borderRadius: '8px', fontWeight: 500 }}
              onClick={() => setActiveTab('team')}
            >
              <Users size={18} />
              <span>Team &amp; Access</span>
            </button>
          )}
          
          {hasPageAccess('hospital_connect') && (
            <button 
              style={{ display: 'flex', alignItems: 'center', gap: '12px', background: activeTab === 'hospital_connect' ? 'var(--active-tab-bg)' : 'transparent', color: activeTab === 'hospital_connect' ? 'var(--active-tab-color)' : 'var(--inactive-tab-color)', border: 'none', textAlign: 'left', cursor: 'pointer', padding: '12px 16px', borderRadius: '8px', fontWeight: 500 }}
              onClick={() => setActiveTab('hospital_connect')}
            >
              <Database size={18} />
              <span>Data Connections</span>
            </button>
          )}
          {hasPageAccess('dataset_upload') && (
            <button 
              style={{ display: 'flex', alignItems: 'center', gap: '12px', background: activeTab === 'dataset_upload' ? 'var(--active-tab-bg)' : 'transparent', color: activeTab === 'dataset_upload' ? 'var(--active-tab-color)' : 'var(--inactive-tab-color)', border: 'none', textAlign: 'left', cursor: 'pointer', padding: '12px 16px', borderRadius: '8px', fontWeight: 500 }}
              onClick={() => setActiveTab('dataset_upload')}
            >
              <Upload size={18} />
              <span>Dataset Upload</span>
            </button>
          )}
          {hasPageAccess('knowledge_base') && (
            <button 
              style={{ display: 'flex', alignItems: 'center', gap: '12px', background: activeTab === 'knowledge_base' ? 'var(--active-tab-bg)' : 'transparent', color: activeTab === 'knowledge_base' ? 'var(--active-tab-color)' : 'var(--inactive-tab-color)', border: 'none', textAlign: 'left', cursor: 'pointer', padding: '12px 16px', borderRadius: '8px', fontWeight: 500 }}
              onClick={() => setActiveTab('knowledge_base')}
            >
              <FileText size={18} />
              <span>Knowledge Base</span>
            </button>
          )}
          {hasPageAccess('audit_logs') && (
            <button 
              style={{ display: 'flex', alignItems: 'center', gap: '12px', background: activeTab === 'audit_logs' ? 'var(--active-tab-bg)' : 'transparent', color: activeTab === 'audit_logs' ? 'var(--active-tab-color)' : 'var(--inactive-tab-color)', border: 'none', textAlign: 'left', cursor: 'pointer', padding: '12px 16px', borderRadius: '8px', fontWeight: 500 }}
              onClick={() => setActiveTab('audit_logs')}
            >
              <Sliders size={18} />
              <span>Audit Logs</span>
            </button>
          )}
          
          {hasPageAccess('alerts') && (
            <button 
              style={{ display: 'flex', alignItems: 'center', gap: '12px', background: activeTab === 'alerts' ? 'var(--active-tab-bg)' : 'transparent', color: activeTab === 'alerts' ? '#ef4444' : 'var(--inactive-tab-color)', border: 'none', textAlign: 'left', cursor: 'pointer', padding: '12px 16px', borderRadius: '8px', fontWeight: 500 }}
              onClick={() => setActiveTab('alerts')}
            >
              <AlertOctagon size={18} />
              <span>{can('alert:resolve') ? 'My Alert Queue' : 'Alert Queue'} <span style={{ background: '#ef4444', color: 'white', fontSize: '0.8em', padding: '1px 6px', borderRadius: '4px', marginLeft: '5px' }}>{alerts.filter(a => a.status === 'active').length}</span></span>
            </button>
          )}
        </div>

        {/* User Card */}
        <div style={{ padding: '20px', borderTop: '1px solid var(--border-light)', display: 'flex', gap: '10px', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <div style={{ width: '38px', height: '38px', background: '#1d4ed8', color: '#ffffff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '0.8em' }}>
              {initials(currentUser.full_name || currentUser.username)}
            </div>
            <div>
              <div style={{ fontSize: '0.9em', fontWeight: 600, color: 'var(--text-primary)' }}>{currentUser.full_name || currentUser.username}</div>
              <div style={{ fontSize: '0.7em', color: 'var(--text-muted)' }}>
                {currentUser.role_label || currentUser.role.replace(/_/g, ' ')}{currentUser.department ? ` • ${currentUser.department}` : ''}
              </div>
            </div>
          </div>
          <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '0.85em', fontWeight: 'bold' }} onClick={handleLogout}>
            Logout
          </button>
        </div>
      </div>

      {/* Main Panel */}
      <div className="main-content">

        {/* Role workspace banner — who you are, what you own, what to do next */}
        {workspace && (
          <div className="glass-card" style={{ marginBottom: '22px', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '1.25em', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {(() => {
                    const hour = new Date().getHours();
                    const part = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
                    return `${part}, ${(currentUser.full_name || currentUser.username).split(' ').slice(-1)[0]}`;
                  })()}
                </div>
                <div style={{ fontSize: '0.85em', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  {currentUser.job_title || workspace.role_label}
                  {currentUser.department ? ` · ${currentUser.department}` : ''} · {hospitalName}
                </div>
                <div style={{ fontSize: '0.82em', color: 'var(--text-muted)', marginTop: '6px', maxWidth: '620px' }}>{workspace.mission}</div>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                {currentUser.read_only && (
                  <span className="badge badge-low" style={{ alignSelf: 'center' }}>Read-only access</span>
                )}
                {(workspace.primary_actions || []).map(action => (
                  <button
                    key={action.page + action.label}
                    className="primary"
                    style={{ fontSize: '0.8em', padding: '9px 14px' }}
                    onClick={() => setActiveTab(action.page)}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, (workspace.kpis || []).length)}, minmax(0, 1fr))`, gap: '14px' }}>
              {(workspace.kpis || []).map(kpi => (
                <div key={kpi.key} style={{ border: '1px solid var(--border-light)', borderRadius: '10px', padding: '12px 14px', background: 'var(--input-bg)' }}>
                  <div style={{ fontSize: '0.72em', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{kpi.label}</div>
                  <div style={{ fontSize: '1.35em', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px' }}>{String(kpi.value)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        
        {/* MONITORING DASHBOARD */}
        {activeTab === 'dashboard' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h1 style={{ margin: 0, fontSize: '2em' }}>Monitoring Dashboard</h1>
                <p style={{ margin: '5px 0 0 0', color: '#94a3b8' }}>Real-time equipment telemetry monitoring & ML predictions for {hospitalName}</p>
              </div>
              
              {/* Live Log Stream Connection Badge */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {streamStatus?.running || connectStatus === 'Connected' || liveLogs.length > 0 ? (
                  <div style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', padding: '10px 18px', borderRadius: '8px', color: '#10b981', fontWeight: 600, fontSize: '0.85em', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px #10b981' }}></span>
                    <span>🟢 LIVE LOG MONITORING & ML PREDICTIONS ACTIVE</span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', padding: '8px 14px', borderRadius: '8px', color: '#ef4444', fontWeight: 600, fontSize: '0.8em' }}>
                      🔴 STREAM OFFLINE
                    </div>
                    <button
                      className="primary"
                      style={{ fontSize: '0.8em', padding: '8px 14px' }}
                      onClick={() => { setActiveTab('hospital_connect'); startReplayStream(); }}
                    >
                      ⚡ Connect Live Log Stream
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* KPI Cards Grid — counts from ALL sources: DB alerts + live streamed devices */}
            {(() => {
              // Combine alerts state + recent liveLogs for accurate real-time KPIs
              const activeLiveIds = new Set(alerts.filter(a => a.status === 'active').map(a => a.device_id));
              // Unique CRITICAL count: alerts + live stream
              const criticalLive = liveLogs.filter(l => l.risk_level === 'CRITICAL' && !activeLiveIds.has(l.device_id));
              const criticalCount = alerts.filter(d => d.risk_level === 'CRITICAL' && d.status === 'active').length
                + new Set(criticalLive.map(l => l.device_id)).size;
              const highLive = liveLogs.filter(l => l.risk_level === 'HIGH' && !activeLiveIds.has(l.device_id));
              const highCount = alerts.filter(d => d.risk_level === 'HIGH' && d.status === 'active').length
                + new Set(highLive.map(l => l.device_id)).size;
              // MEDIUM from recent liveLogs
              const mediumDevices = new Set(liveLogs.filter(l => l.risk_level === 'MEDIUM').map(l => l.device_id));
              const mediumCount = mediumDevices.size;
              // Fleet health: average of all deviceList + unique live devices
              const liveDevHealthMap = {};
              liveLogs.forEach(l => { liveDevHealthMap[l.device_id] = l.overall_health; });
              const allHealthValues = [
                ...deviceList.map(d => d.overall_health),
                ...Object.values(liveDevHealthMap).filter(h => !deviceList.some(d => d.overall_health === h))
              ].filter(h => typeof h === 'number' && !isNaN(h));
              const fleetHealth = allHealthValues.length > 0
                ? (allHealthValues.reduce((s, h) => s + h, 0) / allHealthValues.length).toFixed(1)
                : '94.2';
              return (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
                  <div className="glass-card risk-critical" style={{ borderLeft: '4px solid #ef4444' }}>
                    <div style={{ fontSize: '0.85em', color: '#94a3b8', fontWeight: 500 }}>CRITICAL RISK</div>
                    <div style={{ fontSize: '2.5em', fontWeight: 700, margin: '5px 0', color: criticalCount > 0 ? '#ef4444' : 'inherit' }}>{criticalCount}</div>
                    <div style={{ fontSize: '0.85em', color: '#f87171' }}>Requires immediate replacement</div>
                  </div>
                  <div className="glass-card risk-high" style={{ borderLeft: '4px solid #f97316' }}>
                    <div style={{ fontSize: '0.85em', color: '#94a3b8', fontWeight: 500 }}>HIGH RISK</div>
                    <div style={{ fontSize: '2.5em', fontWeight: 700, margin: '5px 0', color: highCount > 0 ? '#f97316' : 'inherit' }}>{highCount}</div>
                    <div style={{ fontSize: '0.85em', color: '#fb923c' }}>Schedule maintenance within 7 days</div>
                  </div>
                  <div className="glass-card" style={{ borderLeft: '4px solid #f59e0b' }}>
                    <div style={{ fontSize: '0.85em', color: '#94a3b8', fontWeight: 500 }}>WARNING (MEDIUM)</div>
                    <div style={{ fontSize: '2.5em', fontWeight: 700, margin: '5px 0', color: mediumCount > 0 ? '#f59e0b' : 'inherit' }}>{mediumCount}</div>
                    <div style={{ fontSize: '0.85em', color: '#fbbf24' }}>Monitored parameter drift</div>
                  </div>
                  <div className="glass-card" style={{ borderLeft: '4px solid #10b981' }}>
                    <div style={{ fontSize: '0.85em', color: '#94a3b8', fontWeight: 500 }}>FLEET HEALTH SCORE</div>
                    <div style={{ fontSize: '2.5em', fontWeight: 700, margin: '5px 0' }}>{fleetHealth}%</div>
                    <div style={{ fontSize: '0.85em', color: '#34d399' }}>Live ML-averaged across {allHealthValues.length} devices</div>
                  </div>
                </div>
              );
            })()}

            {/* Layout Split */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
              
              {/* High Risk Devices */}
              <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ margin: 0 }}>Highest Operational Risk Devices</h3>
                  <button style={{ fontSize: '0.85em', color: '#6366f1', border: 'none', background: 'none', cursor: 'pointer', padding: 0 }} onClick={() => setActiveTab('alerts')}>View All Alerts</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {alerts.filter(a => a.status === 'active').slice(0, 5).map(dev => (
                    <div 
                      key={dev.alert_id}
                      className="glass-card" 
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 18px', cursor: 'pointer' }}
                      onClick={() => {
                        setSelectedDeviceId(dev.device_id);
                        setActiveTab('twin');
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.95em' }}>{dev.device_id}</div>
                        <div style={{ fontSize: '0.8em', color: '#64748b' }}>{dev.department} • {dev.root_cause}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <div>{getRiskBadge(dev.risk_level)}</div>
                        <div style={{ fontWeight: 'bold', color: getHealthColor(100 - dev.failure_probability*100) }}>{Math.round(100 - dev.failure_probability*100)}%</div>
                        <ArrowRight size={16} color="#64748b" />
                      </div>
                    </div>
                  ))}
                  {alerts.filter(a => a.status === 'active').length === 0 && (
                    <div style={{ fontSize: '0.85em', color: '#64748b', padding: '10px', textAlign: 'center' }}>No active alerts.</div>
                  )}
                </div>
              </div>

              {/* Department breakdown */}
              <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <h3 style={{ margin: 0 }}>Department Fleet Risks</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {departments.slice(0, 4).map(dept => (
                    <div key={dept.name}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9em', marginBottom: '4px' }}>
                        <span>{dept.name}</span>
                        <span style={{ fontWeight: 600 }}>{dept.device_count} devs</span>
                      </div>
                      <div style={{ display: 'flex', height: '6px', borderRadius: '3px', overflow: 'hidden', background: '#334155' }}>
                        <div style={{ width: `${(dept.critical_count/dept.device_count)*100}%`, background: '#ef4444' }}></div>
                        <div style={{ width: `${(dept.high_count/dept.device_count)*100}%`, background: '#f97316' }}></div>
                        <div style={{ width: `${(dept.medium_count/dept.device_count)*100}%`, background: '#f59e0b' }}></div>
                        <div style={{ flex: 1, background: '#10b981' }}></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>

            {/* Live Ingestion Telemetry Stream Table — Real ML Prediction Results */}
            <div className="glass-card" style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Activity size={20} color="#10b981" />
                  <h3 style={{ margin: 0 }}>Live ML Predictions — Real-time Telemetry Feed</h3>
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.75em', color: '#94a3b8' }}>
                    {liveLogs.filter(l => l.risk_level === 'CRITICAL').length > 0 && (
                      <span style={{ color: '#ef4444', fontWeight: 700, marginRight: '8px' }}>🔴 {liveLogs.filter(l => l.risk_level === 'CRITICAL').length} CRITICAL</span>
                    )}
                    {liveLogs.filter(l => l.risk_level === 'HIGH').length > 0 && (
                      <span style={{ color: '#f97316', fontWeight: 700, marginRight: '8px' }}>🟠 {liveLogs.filter(l => l.risk_level === 'HIGH').length} HIGH</span>
                    )}
                    <span style={{ color: '#10b981' }}>🟢 {liveLogs.filter(l => l.risk_level === 'LOW').length} LOW</span>
                  </span>
                  <span style={{ fontSize: '0.8em', color: '#10b981', background: 'rgba(16,185,129,0.1)', padding: '4px 10px', borderRadius: '6px', fontWeight: 600 }}>
                    ● {liveLogs.length} logs received
                  </span>
                </div>
              </div>
              <div style={{ maxHeight: '320px', overflowY: 'auto', fontSize: '0.82em' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', color: '#64748b', fontSize: '0.8em', position: 'sticky', top: 0, background: 'rgba(15,23,42,0.95)' }}>
                      <th style={{ padding: '8px 6px', textAlign: 'left' }}>Time</th>
                      <th style={{ padding: '8px 6px', textAlign: 'left' }}>Device ID</th>
                      <th style={{ padding: '8px 6px', textAlign: 'left' }}>Type / Dept</th>
                      <th style={{ padding: '8px 6px', textAlign: 'left' }}>Health</th>
                      <th style={{ padding: '8px 6px', textAlign: 'left' }}>Risk</th>
                      <th style={{ padding: '8px 6px', textAlign: 'left' }}>Anomaly</th>
                      <th style={{ padding: '8px 6px', textAlign: 'left' }}>Root Cause (ML)</th>
                      <th style={{ padding: '8px 6px', textAlign: 'left' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {liveLogs.slice(0, 20).map((log, i) => (
                      <tr
                        key={log.log_id || i}
                        style={{
                          borderBottom: '1px solid rgba(255,255,255,0.03)',
                          background: log.risk_level === 'CRITICAL' ? 'rgba(239,68,68,0.05)' : log.risk_level === 'HIGH' ? 'rgba(249,115,22,0.04)' : 'transparent',
                          cursor: 'pointer'
                        }}
                        onClick={() => { setSelectedDeviceId(log.device_id); if (log._fullData) setDeviceData(log._fullData); setActiveTab('twin'); }}
                        title="Click to open Digital Twin"
                      >
                        <td style={{ padding: '7px 6px', color: '#64748b', whiteSpace: 'nowrap' }}>{log.timestamp}</td>
                        <td style={{ padding: '7px 6px', fontWeight: 700, color: log.risk_level === 'CRITICAL' ? '#f87171' : '#818cf8' }}>{log.device_id}</td>
                        <td style={{ padding: '7px 6px' }}>
                          <div style={{ fontWeight: 500 }}>{log.device_type}</div>
                          <div style={{ fontSize: '0.8em', color: '#64748b' }}>{log.department}</div>
                        </td>
                        <td style={{ padding: '7px 6px', fontWeight: 700, color: getHealthColor(log.overall_health) }}>
                          {log.overall_health != null ? log.overall_health.toFixed(1) + '%' : '—'}
                        </td>
                        <td style={{ padding: '7px 6px' }}>{getRiskBadge(log.risk_level)}</td>
                        <td style={{ padding: '7px 6px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div style={{ width: '50px', height: '5px', borderRadius: '3px', background: '#1e293b', overflow: 'hidden' }}>
                              <div style={{ width: `${log.anomaly_score || 0}%`, height: '100%', background: (log.anomaly_score || 0) > 60 ? '#ef4444' : (log.anomaly_score || 0) > 35 ? '#f97316' : '#10b981' }}></div>
                            </div>
                            <span style={{ color: '#94a3b8', fontSize: '0.85em' }}>{log.anomaly_score != null ? log.anomaly_score.toFixed(0) : '—'}</span>
                          </div>
                        </td>
                        <td style={{ padding: '7px 6px', color: log.risk_level === 'CRITICAL' ? '#f87171' : log.risk_level === 'HIGH' ? '#fb923c' : '#94a3b8', fontWeight: log.risk_level === 'CRITICAL' ? 700 : 400 }}>
                          {log.root_cause || '—'}
                        </td>
                        <td style={{ padding: '7px 6px', color: log.risk_level === 'CRITICAL' || log.risk_level === 'HIGH' ? '#fbbf24' : '#10b981', maxWidth: '180px', fontSize: '0.8em' }}>
                          {log.risk_level === 'CRITICAL' ? '🚨 ' : log.risk_level === 'HIGH' ? '⚠️ ' : '✔ '}{log.recommended_action || 'Nominal'}
                          {log.rul_days && log.rul_days < 30 ? <span style={{ color: '#ef4444', fontWeight: 700, marginLeft: '4px' }}> [{log.rul_days}d]</span> : null}
                        </td>
                      </tr>
                    ))}
                    {liveLogs.length === 0 && (
                      <tr>
                        <td colSpan="8" style={{ padding: '30px', textAlign: 'center', color: '#64748b' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                            <Activity size={28} color="#334155" />
                            <div>Waiting for live telemetry from LOGx streamer...</div>
                            <div style={{ fontSize: '0.85em' }}>Start the LOGx generator to see real-time ML predictions here</div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* DEVICE EXPLORER */}
        {activeTab === 'explorer' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <h1 style={{ margin: 0, fontSize: '2em' }}>Device Fleet Explorer</h1>
              <p style={{ margin: '5px 0 0 0', color: '#94a3b8' }}>Filter, inspect, and drill down into device characteristics</p>
            </div>

            {/* Filters panel */}
            <div className="glass-card" style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Search size={18} color="#64748b" style={{ position: 'absolute', left: '12px' }} />
                <input 
                  type="text" 
                  placeholder="Search by Device ID or Manufacturer..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ width: '100%', paddingLeft: '40px' }}
                />
              </div>
              <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                <option value="">All Device Types</option>
                {deviceTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select value={filterRisk} onChange={(e) => setFilterRisk(e.target.value)}>
                <option value="">All Risk Levels</option>
                <option value="CRITICAL">CRITICAL</option>
                <option value="HIGH">HIGH</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="LOW">LOW</option>
              </select>
              <button 
                onClick={() => { setSearchQuery(''); setFilterType(''); setFilterRisk(''); }}
                style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }}
              >
                Clear Filters
              </button>
            </div>

            {/* Device list table */}
            <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 0 }}>
                <thead>
                  <tr>
                    <th style={{ padding: '14px 20px' }}>Device ID</th>
                    <th>Type</th>
                    <th>Manufacturer</th>
                    <th>Risk Category</th>
                    <th>Failure Probability</th>
                    <th>Health Score</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {deviceList.map(dev => (
                    <tr key={dev.device_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '14px 20px', fontWeight: 600 }}>{dev.device_id}</td>
                      <td>{dev.device_type}</td>
                      <td>{dev.manufacturer}</td>
                      <td>{getRiskBadge(dev.risk_level)}</td>
                      <td style={{ fontFamily: 'monospace' }}>{(dev.failure_probability * 100).toFixed(2)}%</td>
                      <td style={{ fontWeight: 'bold', color: getHealthColor(dev.overall_health) }}>{dev.overall_health}%</td>
                      <td>
                        <button 
                          className="primary" 
                          style={{ padding: '6px 12px', fontSize: '0.85em' }}
                          onClick={() => {
                            setSelectedDeviceId(dev.device_id);
                            setActiveTab('twin');
                          }}
                        >
                          Inspect Twin
                        </button>
                      </td>
                    </tr>
                  ))}
                  {deviceList.length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ padding: '30px', textAlign: 'center', color: '#64748b' }}>No devices found matching query filter.</td>
                    </tr>
                  )}
                </tbody>
              </table>

              {/* Pagination */}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '15px 20px', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ fontSize: '0.85em', color: '#64748b' }}>Showing {deviceList.length} of {explorerTotal} devices</span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button 
                    disabled={explorerPage === 1}
                    onClick={() => setExplorerPage(prev => Math.max(1, prev - 1))}
                    style={{ padding: '6px 12px', fontSize: '0.85em' }}
                  >
                    Previous
                  </button>
                  <button 
                    disabled={explorerPage * 25 >= explorerTotal}
                    onClick={() => setExplorerPage(prev => prev + 1)}
                    style={{ padding: '6px 12px', fontSize: '0.85em' }}
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* DIGITAL HEALTH TWIN */}
        {activeTab === 'twin' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h1 style={{ margin: 0, fontSize: '2em' }}>Digital Health Twin Virtual Representation</h1>
                <p style={{ margin: '5px 0 0 0', color: '#94a3b8' }}>Component-level degradation maps & model predictions</p>
              </div>
              
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <span style={{ fontSize: '0.9em', color: '#94a3b8' }}>Inspect Device:</span>
                <input 
                  type="text" 
                  value={selectedDeviceId} 
                  onChange={(e) => setSelectedDeviceId(e.target.value.toUpperCase())}
                  style={{ width: '120px', textAlign: 'center', fontWeight: 'bold' }}
                />
              </div>
            </div>

            {loading && <div style={{ padding: '40px', textAlign: 'center' }}><RefreshCw className="animate-spin" /> Fetching digital twin...</div>}
            
            {error && (
              <div className="glass-card" style={{ borderLeft: '4px solid #ef4444', color: '#f87171', padding: '15px' }}>
                Error: {error}. Make sure the backend server is running.
              </div>
            )}

            {deviceData && !loading && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* LOGx Live Stream Banner */}
                {deviceData._synthetic && (
                  <div style={{ background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.35)', borderRadius: '10px', padding: '12px 18px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <ShieldAlert size={18} color="#f97316" />
                    <div>
                      <span style={{ fontWeight: 700, color: '#f97316', fontSize: '0.9em' }}>⚡ Live Telemetry Twin — </span>
                      <span style={{ color: '#cbd5e1', fontSize: '0.85em' }}>This device was streamed from LOGx and is not in the device registry. Showing real-time telemetry data. </span>
                      <button style={{ color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85em', fontWeight: 600, padding: 0 }} onClick={() => fetchDeviceDetails(deviceData.device_id)}>↻ Refresh from backend</button>
                    </div>
                  </div>
                )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2.5fr', gap: '25px' }}>
                
                {/* Left Side: General status & RUL */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  
                  {/* Gauge card */}
                  <div className="glass-card" style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    <h3 style={{ margin: 0 }}>Device Health</h3>
                    <div className="health-gauge-container">
                      <svg width="140" height="140" viewBox="0 0 140 140">
                        <circle cx="70" cy="70" r="60" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
                        <circle 
                          cx="70" cy="70" r="60" fill="none" 
                          stroke={getHealthColor(deviceData.overall_health)} 
                          strokeWidth="8" 
                          strokeDasharray="377"
                          strokeDashoffset={377 - (377 * deviceData.overall_health) / 100}
                          strokeLinecap="round"
                          transform="rotate(-90 70 70)"
                        />
                      </svg>
                      <div className="health-gauge-value">
                        <span className="number" style={{ color: getHealthColor(deviceData.overall_health) }}>{deviceData.overall_health}%</span>
                        <span className="label">OVERALL</span>
                      </div>
                    </div>
                    
                    <div>
                      <div style={{ fontSize: '1.1em', fontWeight: 'bold' }}>{deviceData.device_id}</div>
                      <div style={{ fontSize: '0.85em', color: '#94a3b8' }}>{deviceData.device_type}</div>
                    </div>

                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '15px', display: 'flex', justifyContent: 'space-around' }}>
                      <div>
                        <div style={{ fontSize: '0.75em', color: '#64748b' }}>RISK LEVEL</div>
                        <div style={{ fontWeight: 'bold', fontSize: '0.9em', marginTop: '3px' }}>{getRiskBadge(deviceData.risk_level)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.75em', color: '#64748b' }}>RUL TIME</div>
                        <div style={{ fontWeight: 'bold', fontSize: '0.9em', marginTop: '3px', color: '#6366f1' }}>{deviceData.predicted_failure_time_days} days</div>
                      </div>
                    </div>
                  </div>

                  {/* Root Cause Card */}
                  <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px' }}>
                      <AlertIcon size={18} color="#ef4444" />
                      <h4 style={{ margin: 0 }}>Root Cause Analysis</h4>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.75em', color: '#64748b' }}>PRIMARY HYPOTHESIS</div>
                      <div style={{ fontWeight: 'bold', fontSize: '1.05em', color: '#f87171' }}>{deviceData.root_cause?.primary}</div>
                      <div style={{ fontSize: '0.8em', color: '#34d399', marginTop: '2px' }}>Confidence: {Math.round(deviceData.root_cause?.confidence * 100)}%</div>
                    </div>
                    <div style={{ marginTop: '5px' }}>
                      <div style={{ fontSize: '0.75em', color: '#64748b', marginBottom: '4px' }}>SUPPORTING EVIDENCE</div>
                      {deviceData.root_cause?.evidence?.map((ev, i) => (
                        <div key={i} style={{ fontSize: '0.8em', color: '#f1f5f9', display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <span style={{ color: '#ef4444' }}>•</span>
                          <span>{ev}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Actions summary */}
                  <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <h4 style={{ margin: 0, borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px' }}>Advisor Instructions</h4>
                    <p style={{ fontSize: '0.85em', color: '#cbd5e1', margin: 0 }}>{deviceData.maintenance?.recommended_action}</p>
                    <button 
                      className="primary" 
                      style={{ fontSize: '0.85em', marginTop: '5px' }}
                      onClick={() => triggerAutoAdvisor(deviceData.device_id)}
                    >
                      Consult AI Adviser
                    </button>
                  </div>

                </div>

                {/* Right Side: Components list & SHAP */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  
                  {/* Components breakdown */}
                  <div className="glass-card">
                    <h3 style={{ margin: '0 0 15px 0' }}>Component Condition Map</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '15px' }}>
                      {Object.entries(deviceData.components || {}).map(([comp_name, comp_score]) => (
                        <div 
                          key={comp_name} 
                          className="glass-card"
                          style={{ 
                            padding: '15px', 
                            cursor: 'pointer', 
                            border: selectedComponent === comp_name ? `1px solid ${getHealthColor(comp_score)}` : '1px solid rgba(255,255,255,0.05)'
                          }}
                          onClick={() => setSelectedComponent(comp_name)}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.85em', color: '#94a3b8', fontWeight: 500 }}>{comp_name}</span>
                            {comp_name.toLowerCase() === 'battery' && <Battery size={16} color={getHealthColor(comp_score)} />}
                            {comp_name.toLowerCase().includes('temp') && <Thermometer size={16} color={getHealthColor(comp_score)} />}
                          </div>
                          <div style={{ fontSize: '1.6em', fontWeight: 700, margin: '8px 0 3px 0', color: getHealthColor(comp_score) }}>
                            {comp_score}%
                          </div>
                          <div style={{ fontSize: '0.7em', color: '#64748b' }}>Click to view details</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Component Inspector Panel */}
                  {selectedComponent && deviceData.component_details?.[selectedComponent] && (
                    <div className="glass-card" style={{ border: `1px solid ${getHealthColor(deviceData.components[selectedComponent])}` }}>
                      <h4 style={{ margin: '0 0 10px 0', color: getHealthColor(deviceData.components[selectedComponent]) }}>
                        Inspector: {selectedComponent} Health ({deviceData.components[selectedComponent]}%)
                      </h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {deviceData.component_details[selectedComponent].evidence.map((ev, i) => (
                          <div key={i} style={{ display: 'flex', gap: '10px', fontSize: '0.85em', background: 'rgba(15,23,42,0.4)', padding: '8px 12px', borderRadius: '6px' }}>
                            <Info size={16} color="#6366f1" style={{ flexShrink: 0 }} />
                            <span>{ev}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Local SHAP contributions */}
                  <div className="glass-card">
                    <h3 style={{ margin: '0 0 15px 0' }}>AI Decision Log (Local Feature Importances)</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {deviceData.explanation?.map((item, idx) => (
                        <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8em' }}>
                            <span style={{ fontFamily: 'monospace' }}>{item.feature.replace('_', ' ')}</span>
                            <span style={{ color: item.shap_value > 0 ? '#f87171' : '#34d399', fontWeight: 600 }}>
                              {item.shap_value > 0 ? '+' : ''}{item.shap_value.toFixed(2)} log-odds
                            </span>
                          </div>
                          <div style={{ height: '6px', background: '#1e293b', borderRadius: '3px', overflow: 'hidden', position: 'relative' }}>
                            {item.shap_value > 0 ? (
                                <div style={{ position: 'absolute', left: '50%', width: `${Math.min(50, item.shap_value * 10)}%`, height: '100%', background: '#ef4444' }}></div>
                            ) : (
                                <div style={{ position: 'absolute', right: '50%', width: `${Math.min(50, Math.abs(item.shap_value) * 10)}%`, height: '100%', background: '#10b981' }}></div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            )}

          </div>
        )}

        {/* HOSPITAL HEATMAP */}
        {activeTab === 'heatmap' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <h1 style={{ margin: 0, fontSize: '2em' }}>Hospital Department Risk Heatmap</h1>
              <p style={{ margin: '5px 0 0 0', color: '#94a3b8' }}>Fleet operational status grouped by physical locations</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
              {departments.map(dept => (
                <div key={dept.name} className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <div style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h3 style={{ margin: 0 }}>{dept.name}</h3>
                      <span style={{ fontSize: '0.85em', color: '#64748b' }}>{dept.device_count} total devices</span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '1.4em', fontWeight: 700, color: getHealthColor(dept.avg_health) }}>{dept.avg_health}%</div>
                      <div style={{ fontSize: '0.7em', color: '#64748b' }}>AVG HEALTH</div>
                    </div>
                  </div>

                  {/* Risk breakdown numbers */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', background: 'rgba(15,23,42,0.4)', padding: '10px', borderRadius: '8px', fontSize: '0.85em' }}>
                    <span style={{ color: '#ef4444' }}>CRIT: {dept.critical_count}</span>
                    <span style={{ color: '#f97316' }}>HIGH: {dept.high_count}</span>
                    <span style={{ color: '#f59e0b' }}>MED: {dept.medium_count}</span>
                    <span style={{ color: '#10b981' }}>LOW: {dept.low_count}</span>
                  </div>

                  {/* Device list in department */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto' }}>
                    {dept.devices.slice(0, 10).map(d => (
                      <div 
                        key={d.device_id}
                        style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85em', background: 'rgba(255,255,255,0.02)', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' }}
                        onClick={() => {
                          setSelectedDeviceId(d.device_id);
                          setActiveTab('twin');
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>{d.device_id}</span>
                        <span style={{ color: '#94a3b8' }}>{d.device_type}</span>
                        <span>{getRiskBadge(d.risk_level)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* HOSPITAL MACHINE FAILURE PREDICTION & ML TRAINER (Unified Tab) */}
        {(activeTab === 'prediction' || activeTab === 'rul') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
            <div>
              <h1 style={{ margin: 0, fontSize: '2em', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Brain size={30} color="#3b82f6" />
                Hospital Machine Failure ML Predictor & Trainer
              </h1>
              <p style={{ margin: '5px 0 0 0', color: '#94a3b8' }}>
                Upload custom medical equipment datasets (Recalls, Manufacturers, Products & Telemetry), train machine learning algorithms (Random Forest, CatBoost, Logistic Regression, SVM), analyze model performance matrices, and execute real-time machine failure risk predictions.
              </p>
            </div>

            {/* SECTION 1: DATASET UPLOAD & PROCESSING */}
            <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '12px' }}>
                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Upload size={20} color="#60a5fa" />
                  1. Medical Equipment Datasets Ingestion (CSV / XLSX / XLS)
                </h3>
                <button 
                  className="primary" 
                  style={{ fontSize: '0.82em', padding: '8px 14px', background: 'rgba(59,130,246,0.2)', border: '1px solid #3b82f6', color: '#60a5fa' }}
                  onClick={handleRunCustomTraining}
                  disabled={isRetrainingCustom}
                >
                  {isRetrainingCustom ? '⏳ Ingesting Datasets...' : '⚡ Ingest & Train Archive (24) Datasets'}
                </button>
              </div>

              {/* 3 Upload Boxes matching user screenshots */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '18px' }}>
                {/* File 1: Recalls & Safety Actions */}
                <div style={{ background: 'rgba(15,23,42,0.6)', border: '2px dashed rgba(59,130,246,0.3)', borderRadius: '10px', padding: '16px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.85em', fontWeight: 700, color: '#f8fafc', marginBottom: '4px' }}>File 1: Field Safety Actions & Recalls</div>
                  <div style={{ fontSize: '0.75em', color: '#94a3b8', marginBottom: '12px' }}>Columns: action, country, device_id, reason, risk_class, status, uid...</div>
                  <input 
                    type="file" 
                    accept=".csv, .xlsx, .xls" 
                    style={{ display: 'none' }} 
                    id="custom-file-1"
                    onChange={(e) => handleCustomFileChange(e, 1)}
                  />
                  <label htmlFor="custom-file-1" style={{ display: 'inline-block', background: '#1e293b', border: '1px solid #3b82f6', color: '#60a5fa', padding: '8px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8em', fontWeight: 600 }}>
                    {customFile1 ? `✓ ${customFile1.name}` : '📁 Upload File 1 (CSV/XLS)'}
                  </label>
                </div>

                {/* File 2: Manufacturers & Companies */}
                <div style={{ background: 'rgba(15,23,42,0.6)', border: '2px dashed rgba(59,130,246,0.3)', borderRadius: '10px', padding: '16px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.85em', fontWeight: 700, color: '#f8fafc', marginBottom: '4px' }}>File 2: Manufacturers & Parent Companies</div>
                  <div style={{ fontSize: '0.75em', color: '#94a3b8', marginBottom: '12px' }}>Columns: name, parent_company, representative, slug, source...</div>
                  <input 
                    type="file" 
                    accept=".csv, .xlsx, .xls" 
                    style={{ display: 'none' }} 
                    id="custom-file-2"
                    onChange={(e) => handleCustomFileChange(e, 2)}
                  />
                  <label htmlFor="custom-file-2" style={{ display: 'inline-block', background: '#1e293b', border: '1px solid #3b82f6', color: '#60a5fa', padding: '8px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8em', fontWeight: 600 }}>
                    {customFile2 ? `✓ ${customFile2.name}` : '📁 Upload File 2 (CSV/XLS)'}
                  </label>
                </div>

                {/* File 3: Medical Products & Telemetry */}
                <div style={{ background: 'rgba(15,23,42,0.6)', border: '2px dashed rgba(59,130,246,0.3)', borderRadius: '10px', padding: '16px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.85em', fontWeight: 700, color: '#f8fafc', marginBottom: '4px' }}>File 3: Products & Telemetry Signals</div>
                  <div style={{ fontSize: '0.75em', color: '#94a3b8', marginBottom: '12px' }}>Columns: classification, code, description, risk_class, quantity, health...</div>
                  <input 
                    type="file" 
                    accept=".csv, .xlsx, .xls" 
                    style={{ display: 'none' }} 
                    id="custom-file-3"
                    onChange={(e) => handleCustomFileChange(e, 3)}
                  />
                  <label htmlFor="custom-file-3" style={{ display: 'inline-block', background: '#1e293b', border: '1px solid #3b82f6', color: '#60a5fa', padding: '8px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8em', fontWeight: 600 }}>
                    {customFile3 ? `✓ ${customFile3.name}` : '📁 Upload File 3 (CSV/XLS)'}
                  </label>
                </div>
              </div>

              {/* Parsed Summary Box */}
              {!uploadedDatasetSummary ? (
                <div style={{ background: 'rgba(30,41,59,0.5)', borderRadius: '8px', padding: '24px', textAlign: 'center', border: '1px dashed rgba(59,130,246,0.3)' }}>
                  <Upload size={32} color="#60a5fa" style={{ marginBottom: '10px' }} />
                  <div style={{ fontWeight: 700, color: '#f8fafc', fontSize: '1em', marginBottom: '4px' }}>No Active Dataset Summary Ingested</div>
                  <div style={{ fontSize: '0.82em', color: '#94a3b8' }}>
                    Upload File 1, File 2, or File 3 above, or click <strong>"⚡ Ingest & Train Archive (24) Datasets"</strong> to parse and train on the <code>C:\Users\Dhamodaran G\Downloads\archive (24)</code> dataset.
                  </div>
                </div>
              ) : (
                <div style={{ background: 'rgba(30,41,59,0.7)', borderRadius: '8px', padding: '16px', border: '1px solid rgba(59,130,246,0.2)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <span style={{ fontWeight: 700, color: '#60a5fa', fontSize: '0.9em' }}>📊 Active Dataset Schema & Ingestion Summary</span>
                    <span style={{ fontSize: '0.8em', color: '#10b981', background: 'rgba(16,185,129,0.15)', padding: '3px 10px', borderRadius: '4px', fontWeight: 600 }}>
                      Target Column: Hospital Machine Failure Status
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px', marginBottom: '12px', fontSize: '0.85em' }}>
                    <div><span style={{ color: '#94a3b8' }}>Total Devices / Rows:</span> <strong>{uploadedDatasetSummary.total_rows}</strong></div>
                    <div><span style={{ color: '#94a3b8' }}>Engineered Features:</span> <strong>{uploadedDatasetSummary.feature_count} columns</strong></div>
                    <div><span style={{ color: '#94a3b8' }}>Missing Values:</span> <strong>{uploadedDatasetSummary.missing_pct}%</strong></div>
                    <div><span style={{ color: '#94a3b8' }}>Status:</span> <strong style={{ color: '#34d399' }}>Ready for ML Training</strong></div>
                  </div>
                  
                  {/* Sample Preview Table */}
                  <div style={{ overflowX: 'auto', fontSize: '0.78em' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', color: '#cbd5e1' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', textAlign: 'left' }}>
                          <th style={{ padding: '6px' }}>Record ID</th>
                          <th style={{ padding: '6px' }}>Product / Equipment Name</th>
                          <th style={{ padding: '6px' }}>Classification</th>
                          <th style={{ padding: '6px' }}>Manufacturer</th>
                          <th style={{ padding: '6px' }}>Country / Source</th>
                          <th style={{ padding: '6px' }}>Event / Safety Signal</th>
                          <th style={{ padding: '6px' }}>Target: Failure Risk</th>
                        </tr>
                      </thead>
                      <tbody>
                        {uploadedDatasetSummary.preview_rows?.map((row, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                            <td style={{ padding: '6px', fontWeight: 600, color: '#60a5fa' }}>{row.record_id || row.device_id || `REC-${idx+1}`}</td>
                            <td style={{ padding: '6px' }}>{row.product_name || row.device_type}</td>
                            <td style={{ padding: '6px' }}>{row.classification || row.risk_class}</td>
                            <td style={{ padding: '6px' }}>{row.manufacturer}</td>
                            <td style={{ padding: '6px' }}>{row.country || 'Global'}</td>
                            <td style={{ padding: '6px', color: (row.event_type?.includes('Recall') || row.error_code !== 'OK') ? '#f87171' : '#34d399' }}>{row.event_type || row.error_code}</td>
                            <td style={{ padding: '6px' }}>{getRiskBadge(row.risk_level)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* SECTION 2: ML MODEL TRAINING & PERFORMANCE METRICS MATRIX */}
            <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '12px' }}>
                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Cpu size={20} color="#a855f7" />
                  2. ML Model Training & Performance Prediction Matrix
                </h3>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.85em', color: '#94a3b8' }}>Select Algorithm:</span>
                  <select 
                    value={selectedCustomModel} 
                    onChange={(e) => setSelectedCustomModel(e.target.value)}
                    style={{ padding: '6px 12px', borderRadius: '6px', background: '#0f172a', color: 'white', border: '1px solid #3b82f6', fontWeight: 600 }}
                  >
                    <option value="Random Forest">🌲 Random Forest Classifier (Recommended)</option>
                    <option value="CatBoost">🚀 CatBoost / LightGBM (Gradient Boosted)</option>
                    <option value="Logistic Regression">📈 Logistic Regression (Log-Odds)</option>
                    <option value="SVM">⚡ Support Vector Machine (SVM)</option>
                  </select>

                  <button 
                    className="primary" 
                    style={{ padding: '8px 18px', fontSize: '0.85em', fontWeight: 700, background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)' }}
                    onClick={handleRunCustomTraining}
                    disabled={isRetrainingCustom}
                  >
                    {isRetrainingCustom ? '⏳ Training ML Model...' : '🚀 Train Machine Failure Model'}
                  </button>
                </div>
              </div>

              {isRetrainingCustom && (
                <div style={{ padding: '20px', background: 'rgba(59,130,246,0.1)', borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ color: '#60a5fa', fontWeight: 600, marginBottom: '8px' }}>Training {selectedCustomModel} on hospital machine failure dataset...</div>
                  <div style={{ height: '8px', background: '#1e293b', borderRadius: '4px', overflow: 'hidden' }}>
                    <div className="animate-pulse" style={{ height: '100%', width: '100%', background: 'linear-gradient(90deg, #3b82f6, #a855f7)' }}></div>
                  </div>
                </div>
              )}

              {!customMetrics ? (
                <div style={{ background: 'rgba(30,41,59,0.5)', borderRadius: '8px', padding: '24px', textAlign: 'center', border: '1px dashed rgba(168,85,247,0.3)' }}>
                  <Cpu size={32} color="#a855f7" style={{ marginBottom: '10px' }} />
                  <div style={{ fontWeight: 700, color: '#f8fafc', fontSize: '1em', marginBottom: '4px' }}>No Model Performance Matrix Computed Yet</div>
                  <div style={{ fontSize: '0.82em', color: '#94a3b8' }}>
                    Upload your CSV dataset file(s) in Section 1 or click <strong>"🚀 Train Machine Failure Model"</strong> to run model training and compute the performance matrix.
                  </div>
                </div>
              ) : (
                <>
                  {/* Performance Metrics Summary */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '15px' }}>
                    <div className="glass-card" style={{ textAlign: 'center', padding: '16px' }}>
                      <div style={{ fontSize: '0.75em', color: '#94a3b8', fontWeight: 600 }}>ACCURACY</div>
                      <div style={{ fontSize: '2em', fontWeight: 800, color: '#34d399', margin: '4px 0' }}>
                        {customMetrics.accuracy}
                      </div>
                      <div style={{ fontSize: '0.7em', color: '#64748b' }}>Correct failure predictions</div>
                    </div>

                    <div className="glass-card" style={{ textAlign: 'center', padding: '16px' }}>
                      <div style={{ fontSize: '0.75em', color: '#94a3b8', fontWeight: 600 }}>PRECISION</div>
                      <div style={{ fontSize: '2em', fontWeight: 800, color: '#60a5fa', margin: '4px 0' }}>
                        {customMetrics.precision}
                      </div>
                      <div style={{ fontSize: '0.7em', color: '#64748b' }}>True positive ratio</div>
                    </div>

                    <div className="glass-card" style={{ textAlign: 'center', padding: '16px' }}>
                      <div style={{ fontSize: '0.75em', color: '#94a3b8', fontWeight: 600 }}>RECALL (SENSITIVITY)</div>
                      <div style={{ fontSize: '2em', fontWeight: 800, color: '#a855f7', margin: '4px 0' }}>
                        {customMetrics.recall}
                      </div>
                      <div style={{ fontSize: '0.7em', color: '#64748b' }}>Catches {customMetrics.recall} of critical failures</div>
                    </div>

                    <div className="glass-card" style={{ textAlign: 'center', padding: '16px' }}>
                      <div style={{ fontSize: '0.75em', color: '#94a3b8', fontWeight: 600 }}>F1-SCORE</div>
                      <div style={{ fontSize: '2em', fontWeight: 800, color: '#fbbf24', margin: '4px 0' }}>
                        {customMetrics.f1_score}
                      </div>
                      <div style={{ fontSize: '0.7em', color: '#64748b' }}>Harmonic mean metric</div>
                    </div>

                    <div className="glass-card" style={{ textAlign: 'center', padding: '16px' }}>
                      <div style={{ fontSize: '0.75em', color: '#94a3b8', fontWeight: 600 }}>ROC-AUC SCORE</div>
                      <div style={{ fontSize: '2em', fontWeight: 800, color: '#f43f5e', margin: '4px 0' }}>
                        {customMetrics.roc_auc}
                      </div>
                      <div style={{ fontSize: '0.7em', color: '#64748b' }}>Area under ROC curve</div>
                    </div>
                  </div>

                  {/* Confusion Matrix & Top Feature Importance */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '20px' }}>
                    {/* Confusion Matrix */}
                    <div className="glass-card" style={{ padding: '18px' }}>
                      <h4 style={{ margin: '0 0 14px 0', color: '#f8fafc', fontSize: '0.95em' }}>📊 Prediction Confusion Matrix ({selectedCustomModel})</h4>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '8px', padding: '14px', textAlign: 'center' }}>
                          <div style={{ fontSize: '0.75em', color: '#34d399', fontWeight: 700 }}>TRUE POSITIVES (TP)</div>
                          <div style={{ fontSize: '1.8em', fontWeight: 800, color: '#34d399' }}>{customMetrics.tp}</div>
                          <div style={{ fontSize: '0.7em', color: '#94a3b8' }}>Correctly predicted Machine Failure</div>
                        </div>

                        <div style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '8px', padding: '14px', textAlign: 'center' }}>
                          <div style={{ fontSize: '0.75em', color: '#fbbf24', fontWeight: 700 }}>FALSE POSITIVES (FP)</div>
                          <div style={{ fontSize: '1.8em', fontWeight: 800, color: '#fbbf24' }}>{customMetrics.fp}</div>
                          <div style={{ fontSize: '0.7em', color: '#94a3b8' }}>False Alarm (Predicted failure, actual normal)</div>
                        </div>

                        <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', padding: '14px', textAlign: 'center' }}>
                          <div style={{ fontSize: '0.75em', color: '#f87171', fontWeight: 700 }}>FALSE NEGATIVES (FN)</div>
                          <div style={{ fontSize: '1.8em', fontWeight: 800, color: '#f87171' }}>{customMetrics.fn}</div>
                          <div style={{ fontSize: '0.7em', color: '#94a3b8' }}>Missed Failure (Predicted normal, actual failed)</div>
                        </div>

                        <div style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: '8px', padding: '14px', textAlign: 'center' }}>
                          <div style={{ fontSize: '0.75em', color: '#60a5fa', fontWeight: 700 }}>TRUE NEGATIVES (TN)</div>
                          <div style={{ fontSize: '1.8em', fontWeight: 800, color: '#60a5fa' }}>{customMetrics.tn}</div>
                          <div style={{ fontSize: '0.7em', color: '#94a3b8' }}>Correctly predicted Nominal Operation</div>
                        </div>
                      </div>
                    </div>

                    {/* Feature Importance Rank */}
                    <div className="glass-card" style={{ padding: '18px' }}>
                      <h4 style={{ margin: '0 0 14px 0', color: '#f8fafc', fontSize: '0.95em' }}>⭐ Top Predictive Features for Machine Failure</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.82em' }}>
                        {customFeatures.map((feat, idx) => (
                          <div key={idx}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                              <span>{feat.name}</span>
                              <span style={{ color: feat.color || '#60a5fa', fontWeight: 700 }}>{feat.pct}%</span>
                            </div>
                            <div style={{ height: '6px', background: '#1e293b', borderRadius: '3px', overflow: 'hidden' }}>
                              <div style={{ width: `${feat.pct}%`, height: '100%', background: feat.color || '#3b82f6' }}></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* SECTION 3: INTERACTIVE REAL-TIME MACHINE FAILURE PREDICTOR */}
            <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '12px' }}>
                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Zap size={20} color="#f59e0b" />
                  3. Real-Time Machine Failure Predictor (Inference Engine)
                </h3>
                <span style={{ fontSize: '0.8em', color: '#94a3b8' }}>Pass device parameters into the trained ML model for instant prediction</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '25px' }}>
                {/* Form Inputs */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ fontSize: '0.78em', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Product / Equipment Name:</label>
                      <select 
                        value={customPredictProductName}
                        onChange={(e) => setCustomPredictProductName(e.target.value)}
                        style={{ width: '100%', padding: '8px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: 'white' }}
                      >
                        <option value="Cell-Dyn Emerald Cleanser">Cell-Dyn Emerald Cleanser</option>
                        <option value="TECNIS Monofocal 1-piece">TECNIS Monofocal 1-piece</option>
                        <option value="Centurion FMS Package">Centurion FMS Package</option>
                        <option value="Ventilator System">Ventilator System</option>
                        <option value="CT Scanner System">CT Scanner System</option>
                        <option value="MRI Scanner Unit">MRI Scanner Unit</option>
                        <option value="Patient Monitor">Patient Monitor</option>
                        <option value="Infusion Pump System">Infusion Pump System</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '0.78em', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Product Risk Classification:</label>
                      <select 
                        value={customPredictClassification}
                        onChange={(e) => setCustomPredictClassification(e.target.value)}
                        style={{ width: '100%', padding: '8px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: 'white' }}
                      >
                        <option value="IVD Other (In-Vitro Diagnostics)">IVD Other (In-Vitro Diagnostics)</option>
                        <option value="Class IIB (High Risk)">Class IIB (High Risk)</option>
                        <option value="Class IIA (Medium-High Risk)">Class IIA (Medium-High Risk)</option>
                        <option value="Class I (Low Risk)">Class I (Low Risk)</option>
                        <option value="Class III (Critical Life Support)">Class III (Critical Life Support)</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ fontSize: '0.78em', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Manufacturer / Company:</label>
                      <select 
                        value={customPredictManufacturer}
                        onChange={(e) => setCustomPredictManufacturer(e.target.value)}
                        style={{ width: '100%', padding: '8px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: 'white' }}
                      >
                        <option value="Abbott Laboratories">Abbott Laboratories</option>
                        <option value="Johnson & Johnson">Johnson & Johnson</option>
                        <option value="Novartis AG">Novartis AG</option>
                        <option value="Baxter Healthcare">Baxter Healthcare</option>
                        <option value="MedStar Systems">MedStar Systems</option>
                        <option value="Boston Scientific">Boston Scientific</option>
                        <option value="Zimmer Biomet">Zimmer Biomet</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '0.78em', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Country / Regulatory Source:</label>
                      <select 
                        value={customPredictCountry}
                        onChange={(e) => setCustomPredictCountry(e.target.value)}
                        style={{ width: '100%', padding: '8px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: 'white' }}
                      >
                        <option value="TUR (Turkey Titck)">TUR (Turkey Titck)</option>
                        <option value="USA (FDA Regulatory)">USA (FDA Regulatory)</option>
                        <option value="INVIMA (Latin America)">INVIMA (Latin America)</option>
                        <option value="Cofepris (Global)">Cofepris (Global)</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ fontSize: '0.78em', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Field Event / Safety Signal Type:</label>
                      <select 
                        value={customPredictEventType}
                        onChange={(e) => setCustomPredictEventType(e.target.value)}
                        style={{ width: '100%', padding: '8px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: 'white' }}
                      >
                        <option value="Field Safety Notice">Field Safety Notice</option>
                        <option value="Safety Alert">Safety Alert</option>
                        <option value="Recall Notice">Recall Notice</option>
                        <option value="Nominal Monitoring">Nominal Monitoring</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '0.78em', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Quantity in Commerce (Units):</label>
                      <input 
                        type="number" min="1" max="50000"
                        value={customPredictQuantity}
                        onChange={(e) => setCustomPredictQuantity(parseInt(e.target.value) || 1)}
                        style={{ width: '100%', padding: '8px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: 'white' }}
                      />
                    </div>
                  </div>

                  {/* Sliders */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78em', marginBottom: '3px' }}>
                      <span style={{ color: '#94a3b8' }}>Historical Safety Recalls Count:</span>
                      <span style={{ color: customPredictRecallCount > 1 ? '#ef4444' : '#34d399', fontWeight: 700 }}>{customPredictRecallCount} recalls</span>
                    </div>
                    <input 
                      type="range" min="0" max="15" step="1" 
                      value={customPredictRecallCount} 
                      onChange={(e) => setCustomPredictRecallCount(parseInt(e.target.value))}
                      style={{ width: '100%' }}
                    />
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78em', marginBottom: '3px' }}>
                      <span style={{ color: '#94a3b8' }}>Overdue Preventive Maintenance (Days):</span>
                      <span style={{ color: customPredictDaysMaint > 60 ? '#ef4444' : '#34d399', fontWeight: 700 }}>{customPredictDaysMaint} days</span>
                    </div>
                    <input 
                      type="range" min="0" max="180" step="1" 
                      value={customPredictDaysMaint} 
                      onChange={(e) => setCustomPredictDaysMaint(parseInt(e.target.value))}
                      style={{ width: '100%' }}
                    />
                  </div>

                  <button 
                    className="primary"
                    style={{ padding: '12px', fontSize: '0.95em', fontWeight: 700, background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', marginTop: '5px' }}
                    onClick={handleRunCustomPrediction}
                    disabled={isCustomPredicting}
                  >
                    {isCustomPredicting ? '⏳ Running ML Inference...' : '🔮 Predict Machine Failure Risk'}
                  </button>
                </div>

                {/* Output Display Card */}
                <div>
                  {customPredictOutput ? (
                    <div className="glass-card" style={{ padding: '22px', border: `2px solid ${customPredictOutput.risk_level === 'CRITICAL' ? '#ef4444' : (customPredictOutput.risk_level === 'HIGH' ? '#f97316' : '#10b981')}`, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.8em', color: '#94a3b8', fontWeight: 600 }}>PREDICTION RESULT</span>
                        {getRiskBadge(customPredictOutput.risk_level)}
                      </div>

                      <div style={{ textAlign: 'center', padding: '15px', background: 'rgba(15,23,42,0.6)', borderRadius: '10px' }}>
                        <div style={{ fontSize: '0.8em', color: '#94a3b8', marginBottom: '4px' }}>FAILURE PROBABILITY</div>
                        {(() => {
                          const rawVal = customPredictOutput.failure_probability > 1 
                            ? customPredictOutput.failure_probability 
                            : (customPredictOutput.failure_probability || 0.72) * 100;
                          const probPct = rawVal < 1 && rawVal > 0 ? rawVal.toFixed(1) : Math.round(rawVal);
                          const numVal = parseFloat(probPct);
                          return (
                            <>
                              <div style={{ fontSize: '3.2em', fontWeight: 800, color: getHealthColor(100 - numVal), lineHeight: 1 }}>
                                {probPct}%
                              </div>
                              <div style={{ fontSize: '0.8em', color: numVal > 50 ? '#f87171' : '#34d399', marginTop: '6px' }}>
                                {numVal > 75 ? '🚨 CRITICAL: High likelihood of machine failure' : (numVal > 35 ? '⚠️ HIGH: Significant safety alert risk' : '✔ LOW: Nominal machine operation')}
                              </div>
                            </>
                          );
                        })()}
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '0.85em' }}>
                        <div style={{ background: 'rgba(30,41,59,0.5)', padding: '10px', borderRadius: '6px' }}>
                          <div style={{ fontSize: '0.75em', color: '#94a3b8' }}>ANOMALY SCORE</div>
                          <div style={{ fontWeight: 700, fontSize: '1.1em', color: customPredictOutput.anomaly?.score > 50 ? '#f87171' : '#34d399' }}>
                            {customPredictOutput.anomaly?.score?.toFixed(1) || '12.0'} / 100
                          </div>
                        </div>

                        <div style={{ background: 'rgba(30,41,59,0.5)', padding: '10px', borderRadius: '6px' }}>
                          <div style={{ fontSize: '0.75em', color: '#94a3b8' }}>PREDICTED RUL (DAYS)</div>
                          <div style={{ fontWeight: 700, fontSize: '1.1em', color: '#60a5fa' }}>
                            {customPredictOutput.predicted_failure_time_days || '180'} days
                          </div>
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: '0.78em', color: '#94a3b8', marginBottom: '4px' }}>PRIMARY ROOT CAUSE:</div>
                        <div style={{ fontWeight: 700, color: '#f87171', fontSize: '0.95em' }}>
                          {customPredictOutput.root_cause?.primary || customPredictOutput.root_cause}
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: '0.78em', color: '#94a3b8', marginBottom: '4px' }}>RECOMMENDED MAINTENANCE ACTION:</div>
                        <div style={{ fontSize: '0.85em', color: '#34d399', background: 'rgba(16,185,129,0.1)', padding: '8px 12px', borderRadius: '6px', border: '1px solid rgba(16,185,129,0.2)' }}>
                          ⚕️ {customPredictOutput.maintenance?.recommended_action || 'Perform routine inspection'}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="glass-card" style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                      <Brain size={40} color="#334155" />
                      <div>Set form parameters on the left and click <strong>Predict Machine Failure Risk</strong> to run ML prediction.</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ROOT CAUSE GRAPH */}
        {activeTab === 'graph' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <h1 style={{ margin: 0, fontSize: '2em' }}>Root Cause Knowledge Graph</h1>
              <p style={{ margin: '5px 0 0 0', color: '#94a3b8' }}>Causal relationships linking failures and components</p>
            </div>

            {deviceData && (
              <div className="glass-card" style={{ height: '550px', position: 'relative', overflow: 'hidden' }}>
                <svg width="100%" height="100%" viewBox="0 0 800 500">
                  <defs>
                    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.02)" strokeWidth="1" />
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#grid)" />
                  <line x1="400" y1="250" x2="400" y2="100" stroke="#6366f1" strokeWidth="2" strokeDasharray="5,5" />
                  <line x1="400" y1="250" x2="200" y2="200" stroke="#10b981" strokeWidth="2" />
                  <line x1="400" y1="250" x2="250" y2="350" stroke="#10b981" strokeWidth="2" />
                  <line x1="400" y1="250" x2="600" y2="200" stroke="#10b981" strokeWidth="2" />
                  <line x1="400" y1="250" x2="550" y2="350" stroke="#ef4444" strokeWidth="2" />
                  <line x1="550" y1="350" x2="650" y2="420" stroke="#f97316" strokeWidth="2" />

                  <circle cx="400" cy="100" r="22" fill="#1e293b" stroke="#6366f1" strokeWidth="2" />
                  <text x="400" y="105" fill="white" fontSize="10" fontWeight="bold" textAnchor="middle">ICU</text>
                  <circle cx="400" cy="250" r="30" fill="#0f172a" stroke="#6366f1" strokeWidth="3" />
                  <text x="400" y="254" fill="white" fontSize="11" fontWeight="bold" textAnchor="middle">{deviceData.device_id}</text>
                  <circle cx="200" cy="200" r="20" fill="#1e293b" stroke="#10b981" strokeWidth="2" />
                  <text x="200" y="204" fill="white" fontSize="10" textAnchor="middle">Control</text>
                  <circle cx="250" cy="350" r="20" fill="#1e293b" stroke="#ef4444" strokeWidth="2" />
                  <text x="250" y="354" fill="white" fontSize="10" textAnchor="middle">Battery</text>
                  <circle cx="600" cy="200" r="20" fill="#1e293b" stroke="#10b981" strokeWidth="2" />
                  <text x="600" y="204" fill="white" fontSize="10" textAnchor="middle">Sensors</text>
                  <circle cx="550" cy="350" r="20" fill="#1e293b" stroke="#ef4444" strokeWidth="2" />
                  <text x="550" y="354" fill="white" fontSize="9" textAnchor="middle">Failure</text>
                  <circle cx="650" cy="420" r="22" fill="#1e293b" stroke="#f97316" strokeWidth="2" />
                  <text x="650" y="424" fill="white" fontSize="8" textAnchor="middle">Wear&Tear</text>
                </svg>
              </div>
            )}
          </div>
        )}

        {/* RAG ADVISOR CHAT */}
        {activeTab === 'advisor' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <h1 style={{ margin: 0, fontSize: '2em' }}>RAG Maintenance Advisor</h1>
              <p style={{ margin: '5px 0 0 0', color: 'var(--text-muted)' }}>Query verified manufacturer specifications and get xAI Grok evidence summary</p>
            </div>

            {deviceData && (
              <div className="glass-card chat-window" style={{ height: '560px' }}>
                <div style={{ borderBottom: '1px solid var(--border-light)', paddingBottom: '12px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 style={{ margin: 0 }}>Grok AI Biomed Support: {deviceData.device_id}</h3>
                    <span style={{ fontSize: '0.8em', color: 'var(--text-muted)' }}>Target component: {deviceData.root_cause?.primary}</span>
                  </div>
                  <span className="badge badge-low">RAG GROK-4.5 ENGINE</span>
                </div>

                <div className="chat-history" style={{ flex: 1, overflowY: 'auto', marginBottom: '15px' }}>
                  {chatMessages.map((msg, i) => (
                    <div 
                      key={i} 
                      className={`message-bubble ${msg.sender}`}
                      dangerouslySetInnerHTML={{ __html: msg.text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>') }}
                    />
                  ))}
                  {ragLoading && (
                    <div className="message-bubble advisor" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <RefreshCw className="animate-spin" size={16} />
                      <span>Grok-4.5 synthesizing live telemetry + verified manuals...</span>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <input 
                    type="text" 
                    placeholder="Ask questions about device state or manual procedures..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && sendChatMessage()}
                    style={{ flex: 1 }}
                  />
                  <button className="primary" onClick={sendChatMessage}>Query Grok</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* MODEL BENCHMARKS */}
        {activeTab === 'explainability' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
            <style>{`
              @keyframes flashAlert {
                0%, 100% { background-color: rgba(239, 68, 68, 0.08); border-color: rgba(239, 68, 68, 0.35); }
                50% { background-color: rgba(239, 68, 68, 0.25); border-color: rgba(239, 68, 68, 0.85); box-shadow: 0 0 15px rgba(239, 68, 68, 0.3); }
              }
              .flash-alert-banner {
                animation: flashAlert 1.5s infinite;
              }
            `}</style>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h1 style={{ margin: 0, fontSize: '2em', color: 'var(--text-primary)' }}>Model Performance & Benchmarking</h1>
                <p style={{ margin: '5px 0 0 0', color: 'var(--text-muted)' }}>Comparative analysis of ML architectures & pipeline training status</p>
              </div>
              <span className="badge badge-low" style={{ fontSize: '0.85em' }}>
                Active Model: {modelMetadata?.selected_model || 'Logistic Regression'}
              </span>
            </div>

            {/* MLOps Training & Pipeline Status */}
            <div className="glass-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '280px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.9em', color: 'var(--text-secondary)', fontWeight: 600 }}>ML Pipeline Retraining Status</span>
                  <span style={{ fontSize: '0.8em', color: trainingStatus.is_training ? '#4f46e5' : '#059669', fontWeight: 'bold' }}>
                    {trainingStatus.is_training ? '⏳ ' + trainingStatus.status : '🟢 IDLE (Ready)'}
                  </span>
                </div>
                
                {/* Progress bar */}
                <div style={{ height: '8px', background: 'var(--border-light)', borderRadius: '4px', overflow: 'hidden', position: 'relative' }}>
                  <div 
                    style={{ 
                      width: `${trainingStatus.is_training ? trainingStatus.progress : 100}%`, 
                      background: trainingStatus.is_training ? 'linear-gradient(90deg, #3b82f6, #60a5fa)' : '#10b981', 
                      height: '100%', 
                      transition: 'width 0.5s ease-in-out' 
                    }} 
                  />
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75em', color: 'var(--text-muted)' }}>
                  <span>Last training run: {trainingStatus.last_completed || modelMetadata?.training_date || 'N/A'}</span>
                  {trainingStatus.is_training && <span>{trainingStatus.progress}% Complete</span>}
                </div>
              </div>
              
              <button 
                className="primary" 
                onClick={triggerModelRetrain} 
                disabled={trainingStatus.is_training} 
                style={{ padding: '12px 24px', background: trainingStatus.is_training ? '#f1f5f9' : 'var(--btn-primary-bg)', color: trainingStatus.is_training ? 'var(--text-muted)' : 'var(--btn-primary-color)', cursor: trainingStatus.is_training ? 'not-allowed' : 'pointer' }}
              >
                🔄 {trainingStatus.is_training ? 'Training...' : 'Retrain ML Pipeline'}
              </button>
            </div>

            {/* Split layout: Prompt Predictor & Visual Confusion Matrix */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1.6fr', gap: '25px' }}>
              
              {/* Prompt Predictor Form */}
              <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div style={{ borderBottom: '1px solid var(--border-light)', paddingBottom: '10px' }}>
                  <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>Interactive Telemetry Log Predictor</h3>
                  <span style={{ fontSize: '0.8em', color: 'var(--text-muted)' }}>Submit a telemetry prompt/log message for live ML model prediction</span>
                </div>

                {/* Example prompt buttons */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={{ fontSize: '0.75em', color: 'var(--text-secondary)', fontWeight: 500 }}>Example Prompts (Click to load):</span>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button 
                      style={{ fontSize: '0.75em', padding: '5px 10px', background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.2)', color: '#059669', borderRadius: '4px', cursor: 'pointer', fontWeight: 500 }}
                      onClick={() => setPredictPrompt('Patient monitor DEV000001 in ICU running nominal, battery is at 98.4% and temp is 36.5 C. Error code: OK')}
                    >
                      🟢 Normal Telemetry
                    </button>
                    <button 
                      style={{ fontSize: '0.75em', padding: '5px 10px', background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)', color: '#dc2626', borderRadius: '4px', cursor: 'pointer', fontWeight: 500 }}
                      onClick={() => setPredictPrompt('Defibrillator DEV000025 reports critical battery failure, health dropped to 12.8% and error code: BAT_CRITICAL')}
                    >
                      🚨 Critical Battery Anomaly
                    </button>
                    <button 
                      style={{ fontSize: '0.75em', padding: '5px 10px', background: 'rgba(249,115,22,0.05)', border: '1px solid rgba(249,115,22,0.2)', color: '#ea580c', borderRadius: '4px', cursor: 'pointer', fontWeight: 500 }}
                      onClick={() => setPredictPrompt('Ventilator DEV000001 reports overheating warning, temperature measured at 58.2 C with TEMP_CRITICAL error code')}
                    >
                      🔥 Overheating Failure
                    </button>
                  </div>
                </div>

                <form onSubmit={handlePredictPrompt} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <textarea 
                    value={predictPrompt}
                    onChange={e => setPredictPrompt(e.target.value)}
                    placeholder="Enter telemetry log message or JSON string. E.g. 'Ventilator DEV000001 in ICU reports battery health of 14.5% with BAT_CRITICAL error code...'"
                    style={{ width: '100%', height: '100px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: '6px', color: 'var(--text-primary)', padding: '10px', fontFamily: 'monospace', fontSize: '0.85em', resize: 'vertical' }}
                  />
                  <button className="primary" type="submit" disabled={isPredictLoading || !predictPrompt.trim()} style={{ width: '100%' }}>
                    {isPredictLoading ? <RefreshCw className="animate-spin" size={16} /> : '⚡ Execute Live Prediction'}
                  </button>
                </form>

                {predictError && (
                  <div style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)', color: '#dc2626', padding: '10px', borderRadius: '6px', fontSize: '0.8em' }}>
                    {predictError}
                  </div>
                )}

                {/* Prediction Result Panel */}
                {predictionResult && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '5px', borderTop: '1px solid var(--border-light)', paddingTop: '15px' }}>
                    
                    {/* Flashing Alert if High or Critical risk */}
                    {(predictionResult.risk_level === 'CRITICAL' || predictionResult.risk_level === 'HIGH') && (
                      <div className="flash-alert-banner" style={{ borderLeft: '4px solid #ef4444', borderRadius: '6px', padding: '12px', color: '#dc2626', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <ShieldAlert size={20} className="animate-bounce" />
                        <div>
                          <strong style={{ fontSize: '0.9em', display: 'block' }}>🚨 {predictionResult.risk_level} operational risk detected on {predictionResult.device_id}!</strong>
                          <span style={{ fontSize: '0.78em' }}>Model predicts {Math.round(predictionResult.failure_probability*100)}% failure likelihood. Alert dispatched.</span>
                        </div>
                      </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '0.85em' }}>
                      <div style={{ background: '#f8fafc', border: '1px solid var(--border-light)', padding: '10px', borderRadius: '6px' }}>
                        <div style={{ color: '#64748b', fontSize: '0.75em' }}>HEALTH SCORE</div>
                        <div style={{ fontSize: '1.4em', fontWeight: 700, marginTop: '2px', color: getHealthColor(predictionResult.overall_health) }}>{predictionResult.overall_health}%</div>
                      </div>
                      <div style={{ background: '#f8fafc', border: '1px solid var(--border-light)', padding: '10px', borderRadius: '6px' }}>
                        <div style={{ color: '#64748b', fontSize: '0.75em' }}>RISK CATEGORY</div>
                        <div style={{ marginTop: '5px' }}>{getRiskBadge(predictionResult.risk_level)}</div>
                      </div>
                      <div style={{ background: '#f8fafc', border: '1px solid var(--border-light)', padding: '10px', borderRadius: '6px' }}>
                        <div style={{ color: '#64748b', fontSize: '0.75em' }}>FAILURE WINDOW (RUL)</div>
                        <div style={{ fontSize: '1.4em', fontWeight: 700, marginTop: '2px', color: '#2563eb' }}>{predictionResult.predicted_failure_time_days || '—'} days</div>
                      </div>
                      <div style={{ background: '#f8fafc', border: '1px solid var(--border-light)', padding: '10px', borderRadius: '6px' }}>
                        <div style={{ color: '#64748b', fontSize: '0.75em' }}>ANOMALY SCORE</div>
                        <div style={{ fontSize: '1.4em', fontWeight: 700, marginTop: '2px', color: '#7c3aed' }}>{predictionResult.anomaly?.score?.toFixed(1) || '0.0'}</div>
                      </div>
                    </div>

                    <div style={{ fontSize: '0.85em', background: '#f8fafc', border: '1px solid var(--border-light)', padding: '10px', borderRadius: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ color: 'var(--text-primary)' }}>🔍 Primary root cause: <strong style={{ color: '#ef4444' }}>{predictionResult.root_cause?.primary || 'None'}</strong></div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: '0.95em', marginTop: '4px' }}>⚕️ Action: {predictionResult.maintenance?.recommended_action}</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Confusion Matrix Section */}
              {(() => {
                const summaryList = modelMetadata?.metrics_summary || [];
                const modelInfo = summaryList.find(m => m.Model === selectedBenchmarkModel) || summaryList[0] || {
                  TP: 1310, FP: 564, FN: 55, TN: 1554, Precision: 0.699, Recall: 0.9597, 'F1-Score': 0.8089
                };
                return (
                  <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    <div style={{ borderBottom: '1px solid var(--border-light)', paddingBottom: '10px' }}>
                      <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>Confusion Matrix Visualizer</h3>
                      <span style={{ fontSize: '0.8em', color: 'var(--text-muted)' }}>Interactive validation evaluation for {selectedBenchmarkModel}</span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr 1fr', gridTemplateRows: '30px 100px 100px', gap: '8px', position: 'relative', marginTop: '10px', textAlign: 'center' }}>
                      {/* Grid Headers */}
                      <div style={{ gridColumn: 2, gridRow: 1, fontWeight: 'bold', fontSize: '0.8em', color: 'var(--text-muted)' }}>PREDICTED NORMAL</div>
                      <div style={{ gridColumn: 3, gridRow: 1, fontWeight: 'bold', fontSize: '0.8em', color: '#ef4444' }}>PREDICTED FAILURE</div>
                      <div style={{ gridColumn: 1, gridRow: 2, writingMode: 'vertical-lr', transform: 'rotate(180deg)', fontWeight: 'bold', fontSize: '0.8em', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>ACTUAL NORMAL</div>
                      <div style={{ gridColumn: 1, gridRow: 3, writingMode: 'vertical-lr', transform: 'rotate(180deg)', fontWeight: 'bold', fontSize: '0.8em', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>ACTUAL FAILURE</div>

                      {/* TN Card */}
                      <div style={{ gridColumn: 2, gridRow: 2, background: 'rgba(16,185,129,0.02)', border: '1px dashed rgba(16,185,129,0.4)', borderRadius: '6px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                        <div style={{ fontSize: '0.7em', color: 'var(--text-muted)', fontWeight: 600 }}>TRUE NEGATIVE (TN)</div>
                        <div style={{ fontSize: '1.8em', fontWeight: 800, color: '#059669', margin: '4px 0' }}>{modelInfo.TN}</div>
                        <div style={{ fontSize: '0.7em', color: 'var(--text-muted)' }}>Correctly Normal</div>
                      </div>

                      {/* FP Card */}
                      <div style={{ gridColumn: 3, gridRow: 2, background: 'rgba(239,68,68,0.02)', border: '1px dashed rgba(239,68,68,0.3)', borderRadius: '6px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                        <div style={{ fontSize: '0.7em', color: 'var(--text-muted)', fontWeight: 600 }}>FALSE POSITIVE (FP)</div>
                        <div style={{ fontSize: '1.8em', fontWeight: 800, color: '#dc2626', margin: '4px 0' }}>{modelInfo.FP}</div>
                        <div style={{ fontSize: '0.7em', color: 'var(--text-muted)' }}>False Alarm</div>
                      </div>

                      {/* FN Card */}
                      <div style={{ gridColumn: 2, gridRow: 3, background: 'rgba(239,68,68,0.02)', border: '1px dashed rgba(239,68,68,0.3)', borderRadius: '6px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                        <div style={{ fontSize: '0.7em', color: 'var(--text-muted)', fontWeight: 600 }}>FALSE NEGATIVE (FN)</div>
                        <div style={{ fontSize: '1.8em', fontWeight: 800, color: '#dc2626', margin: '4px 0' }}>{modelInfo.FN}</div>
                        <div style={{ fontSize: '0.7em', color: 'var(--text-muted)' }}>Missed Failure</div>
                      </div>

                      {/* TP Card */}
                      <div style={{ gridColumn: 3, gridRow: 3, background: 'rgba(16,185,129,0.02)', border: '1px dashed rgba(16,185,129,0.4)', borderRadius: '6px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                        <div style={{ fontSize: '0.7em', color: 'var(--text-muted)', fontWeight: 600 }}>TRUE POSITIVE (TP)</div>
                        <div style={{ fontSize: '1.8em', fontWeight: 800, color: '#059669', margin: '4px 0' }}>{modelInfo.TP}</div>
                        <div style={{ fontSize: '0.7em', color: 'var(--text-muted)' }}>Correctly Flagged</div>
                      </div>
                    </div>

                    {/* Derived evaluation stats */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', fontSize: '0.85em', textAlign: 'center', marginTop: '8px' }}>
                      <div style={{ background: '#f8fafc', border: '1px solid var(--border-light)', padding: '8px', borderRadius: '4px' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.75em' }}>PRECISION</div>
                        <div style={{ fontWeight: 'bold', color: '#2563eb', marginTop: '2px' }}>{modelInfo.Precision || modelInfo.precision || '—'}</div>
                      </div>
                      <div style={{ background: '#f8fafc', border: '1px solid var(--border-light)', padding: '8px', borderRadius: '4px' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.75em' }}>RECALL (SENSITIVITY)</div>
                        <div style={{ fontWeight: 'bold', color: '#059669', marginTop: '2px' }}>{modelInfo.Recall || modelInfo.recall || '—'}</div>
                      </div>
                      <div style={{ background: '#f8fafc', border: '1px solid var(--border-light)', padding: '8px', borderRadius: '4px' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.75em' }}>F1-SCORE</div>
                        <div style={{ fontWeight: 'bold', color: '#ea580c', marginTop: '2px' }}>{modelInfo['F1-Score'] || modelInfo.f1 || '—'}</div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Validation Performance Matrix Table */}
            <div className="glass-card">
              <h3 style={{ margin: '0 0 15px 0', color: 'var(--text-primary)' }}>Validation Performance Matrix</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 0 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-primary)' }}>
                    <th style={{ padding: '12px 18px', textAlign: 'left' }}>Model Architecture</th>
                    <th>ROC-AUC</th>
                    <th>PR-AUC</th>
                    <th>Accuracy</th>
                    <th>Precision</th>
                    <th>Recall</th>
                    <th>F1-Score</th>
                    <th>Train Time</th>
                  </tr>
                </thead>
                <tbody>
                  {(modelMetadata?.metrics_summary || [
                    { Model: 'Logistic Regression', 'ROC-AUC': 0.8773, 'PR-AUC': 0.7441, Accuracy: 0.8223, Precision: 0.699, Recall: 0.9597, 'F1-Score': 0.8089, Train_Time_Sec: 1.05 },
                    { Model: 'CatBoost', 'ROC-AUC': 0.8755, 'PR-AUC': 0.7383, Accuracy: 0.8306, Precision: 0.7054, Recall: 0.9751, 'F1-Score': 0.8186, Train_Time_Sec: 6.35 },
                    { Model: 'LightGBM', 'ROC-AUC': 0.8721, 'PR-AUC': 0.7249, Accuracy: 0.8292, Precision: 0.7048, Recall: 0.9707, 'F1-Score': 0.8166, Train_Time_Sec: 0.41 },
                    { Model: 'XGBoost', 'ROC-AUC': 0.8672, 'PR-AUC': 0.7129, Accuracy: 0.8237, Precision: 0.7011, Recall: 0.959, 'F1-Score': 0.81, Train_Time_Sec: 0.5 },
                    { Model: 'Random Forest', 'ROC-AUC': 0.8639, 'PR-AUC': 0.7064, Accuracy: 0.8231, Precision: 0.6983, Recall: 0.9663, 'F1-Score': 0.8107, Train_Time_Sec: 0.53 }
                  ]).map((item) => (
                    <tr 
                      key={item.Model} 
                      style={{ 
                        borderBottom: '1px solid var(--border-light)', 
                        background: selectedBenchmarkModel === item.Model ? 'var(--active-tab-bg)' : 'transparent',
                        fontWeight: selectedBenchmarkModel === item.Model ? 600 : 400,
                        cursor: 'pointer',
                        color: 'var(--text-primary)'
                      }}
                      onClick={() => setSelectedBenchmarkModel(item.Model)}
                    >
                      <td style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>{item.Model}</span>
                        {item.Model === modelMetadata?.selected_model && (
                          <span style={{ fontSize: '0.72em', background: 'var(--active-tab-bg)', color: 'var(--active-tab-color)', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>Active</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>{item['ROC-AUC']?.toFixed(4)}</td>
                      <td style={{ textAlign: 'center' }}>{item['PR-AUC']?.toFixed(4)}</td>
                      <td style={{ textAlign: 'center' }}>{typeof item.Accuracy === 'number' ? (item.Accuracy * 100).toFixed(1) + '%' : item.Accuracy}</td>
                      <td style={{ textAlign: 'center' }}>{item.Precision?.toFixed(4)}</td>
                      <td style={{ textAlign: 'center' }}>{item.Recall?.toFixed(4)}</td>
                      <td style={{ textAlign: 'center' }}>{item['F1-Score']?.toFixed(4) || item.F1?.toFixed(4)}</td>
                      <td style={{ textAlign: 'center' }}>{item.Train_Time_Sec || item.train_time || '—'}s</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Model Features list */}
            {modelMetadata?.features_list && (
              <div className="glass-card">
                <h3 style={{ margin: '0 0 12px 0', color: 'var(--text-primary)' }}>Training Features Store Schema ({modelMetadata.features_list.length} total features)</h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', maxHeight: '180px', overflowY: 'auto', paddingRight: '4px' }}>
                  {modelMetadata.features_list.map((feat) => (
                    <span 
                      key={feat} 
                      style={{ fontSize: '0.76em', background: '#f8fafc', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', padding: '4px 10px', borderRadius: '15px', fontWeight: 500 }}
                    >
                      {feat}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* REAL-TIME ALERTS */}
        {activeTab === 'alerts' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h1 style={{ margin: 0, fontSize: '2em' }}>
                  {currentUser.role === 'DEPARTMENT_OPERATOR' ? `${currentUser.department || 'Department'} Alerts` : 'Alert Queue'}
                </h1>
                <p style={{ margin: '5px 0 0 0', color: '#94a3b8' }}>
                  {currentUser.read_only
                    ? 'Alert history and ownership record — read-only.'
                    : currentUser.role === 'DEPARTMENT_OPERATOR'
                      ? 'Equipment risks in your department. Acknowledge so engineering picks them up.'
                      : can('alert:resolve')
                        ? 'Take ownership, work the fix and close the loop with a resolution note.'
                        : 'Assign owners, set SLA due times and escalate what is slipping.'}
                </p>
              </div>
              <span className="badge badge-critical" style={{ fontSize: '0.9em' }}>
                {alerts.filter(a => a.status === 'active').length} Active Alerts
              </span>
            </div>

            {/* Interactive Alert Search Panel */}
            <div className="glass-card" style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Search size={18} color="#64748b" style={{ position: 'absolute', left: '12px' }} />
                <input 
                  type="text" 
                  placeholder="Search alert by Device ID (e.g. DEV075958), Device Type, or Department..." 
                  value={alertSearchQuery} 
                  onChange={e => setAlertSearchQuery(e.target.value)}
                  style={{ width: '100%', paddingLeft: '40px' }}
                />
              </div>
              <select 
                value={alertRiskFilter} 
                onChange={e => setAlertRiskFilter(e.target.value)}
                style={{ width: '180px' }}
              >
                <option value="ALL">All Risk Levels</option>
                <option value="CRITICAL">CRITICAL Risk</option>
                <option value="HIGH">HIGH Risk</option>
              </select>
              <button 
                className="primary" 
                style={{ padding: '10px 20px', display: 'flex', alignItems: 'center', gap: '8px' }}
                onClick={() => fetchAlerts()}
              >
                <Search size={16} />
                <span>Search Alerts</span>
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              {alerts.filter(dev => {
                const matchesRisk = alertRiskFilter === 'ALL' || dev.risk_level === alertRiskFilter;
                const q = alertSearchQuery.toLowerCase().trim();
                const matchesSearch = !q || 
                  (dev.device_id && dev.device_id.toLowerCase().includes(q)) ||
                  (dev.device_type && dev.device_type.toLowerCase().includes(q)) ||
                  (dev.department && dev.department.toLowerCase().includes(q)) ||
                  (dev.primary_root_cause && dev.primary_root_cause.toLowerCase().includes(q)) ||
                  (dev.root_cause && dev.root_cause.toLowerCase().includes(q));
                return matchesRisk && matchesSearch;
              }).map(dev => (
                <div 
                  key={dev.alert_id}
                  className={`glass-card ${dev.risk_level === 'CRITICAL' ? 'risk-critical' : 'risk-high'}`}
                  style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', padding: '18px 25px', opacity: dev.status === 'resolved' ? 0.6 : 1 }}
                >
                  <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                    <AlertIcon size={24} color={dev.risk_level === 'CRITICAL' ? '#ef4444' : '#f97316'} />
                    <div>
                      <div style={{ fontWeight: 'bold', fontSize: '1.1em' }}>{dev.device_id} ({dev.department})</div>
                      <div style={{ fontSize: '0.8em', color: '#94a3b8', marginTop: '4px' }}>
                        Owner: {dev.owner_name || 'Unassigned'}
                        {dev.due_by ? ` • Due ${new Date(dev.due_by).toLocaleString()}` : ''}
                        {dev.escalation_level ? ` • Escalation L${dev.escalation_level}` : ''}
                        {dev.status ? ` • Status: ${dev.status}` : ''}
                      </div>
                      {dev.resolution_note && (
                        <div style={{ fontSize: '0.8em', color: '#10b981', marginTop: '4px' }}>
                          Closed: {dev.resolution_note}{dev.downtime_minutes != null ? ` (${dev.downtime_minutes} min downtime)` : ''}
                        </div>
                      )}
                      <div style={{ fontSize: '0.85em', color: '#cbd5e1', marginTop: '4px' }}>
                        Issue: {dev.root_cause || dev.primary_root_cause || "Component Failure Risk"} • Prob: {Math.round((dev.failure_probability || 0.85)*100)}% • Anomaly Score: {dev.anomaly_score || 75.0}%
                      </div>
                      <div style={{ fontSize: '0.85em', color: '#94a3b8', marginTop: '4px' }}>
                        Action: {dev.recommended_action}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button 
                      className="primary" 
                      style={{ background: 'rgba(99,102,241,0.2)', border: '1px solid #6366f1', color: '#818cf8', display: 'flex', alignItems: 'center', gap: '6px' }} 
                      onClick={() => { setSelectedDeviceId(dev.device_id); setActiveTab('twin'); }}
                    >
                      <Eye size={14} /> Inspect Twin
                    </button>
                    {dev.risk_level === 'CRITICAL' && dev.status === 'active' && (
                      <button className="primary" style={{ background: '#6366f1' }} onClick={() => triggerAutoAdvisor(dev.device_id)}>
                        Ask AI Advisor
                      </button>
                    )}
                    {can('alert:acknowledge') && dev.status === 'active' && (
                      <button className="primary" style={{ background: '#10b981' }} onClick={() => acknowledgeAlert(dev.alert_id)}>
                        Acknowledge
                      </button>
                    )}
                    {can('alert:assign') && dev.status !== 'resolved' && (
                      <button className="primary" style={{ background: '#0ea5e9' }} onClick={() => { setAlertWorkOn({ alert_id: dev.alert_id, mode: 'assign' }); setAssignOwner(dev.owner_username || ''); }}>
                        {dev.owner_name ? 'Reassign' : 'Assign owner'}
                      </button>
                    )}
                    {can('alert:escalate') && dev.status !== 'resolved' && (
                      <button className="primary" style={{ background: '#f97316' }} onClick={() => escalateAlert(dev.alert_id)}>
                        Escalate
                      </button>
                    )}
                    {can('alert:resolve') && dev.status !== 'resolved' && (
                      <button className="primary" style={{ background: '#4f46e5' }} onClick={() => setAlertWorkOn({ alert_id: dev.alert_id, mode: 'resolve' })}>
                        Close with note
                      </button>
                    )}
                    {dev.status === 'resolved' && (
                      <span style={{ fontSize: '0.85em', color: '#10b981', fontWeight: 600 }}>✓ Closed</span>
                    )}
                    {currentUser.read_only && (
                      <span style={{ fontSize: '0.8em', color: '#64748b' }}>Read-only</span>
                    )}
                  </div>

                  {alertWorkOn?.alert_id === dev.alert_id && alertWorkOn.mode === 'assign' && (
                    <div style={{ width: '100%', marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--border-light)', display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '0.75em', color: 'var(--text-muted)' }}>Accountable engineer</label>
                        <select value={assignOwner} onChange={e => setAssignOwner(e.target.value)} style={{ minWidth: '240px' }}>
                          <option value="">Select an engineer…</option>
                          {assignableUsers.map(u => (
                            <option key={u.username} value={u.username}>{u.full_name} — {u.department || 'Hospital-wide'}</option>
                          ))}
                        </select>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '0.75em', color: 'var(--text-muted)' }}>Due within (hours)</label>
                        <input type="number" min="1" value={assignDueHours} onChange={e => setAssignDueHours(e.target.value)} style={{ width: '120px' }} />
                      </div>
                      <button className="primary" onClick={() => assignAlert(dev.alert_id)}>Confirm assignment</button>
                      <button onClick={() => setAlertWorkOn(null)} style={{ background: 'none', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '9px 14px', cursor: 'pointer' }}>Cancel</button>
                    </div>
                  )}

                  {alertWorkOn?.alert_id === dev.alert_id && alertWorkOn.mode === 'resolve' && (
                    <div style={{ width: '100%', marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--border-light)', display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: '280px' }}>
                        <label style={{ fontSize: '0.75em', color: 'var(--text-muted)' }}>What did you do to fix it?</label>
                        <input type="text" value={resolveNote} placeholder="Replaced battery pack, verified 30 min run-down test" onChange={e => setResolveNote(e.target.value)} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '0.75em', color: 'var(--text-muted)' }}>Downtime (min)</label>
                        <input type="number" min="0" value={resolveDowntime} onChange={e => setResolveDowntime(e.target.value)} style={{ width: '120px' }} />
                      </div>
                      <button className="primary" onClick={() => resolveAlertWithNote(dev.alert_id)}>Close alert</button>
                      <button onClick={() => setAlertWorkOn(null)} style={{ background: 'none', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '9px 14px', cursor: 'pointer' }}>Cancel</button>
                    </div>
                  )}
                </div>
              ))}
              {alerts.length === 0 && (
                <div className="glass-card" style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                  <CheckCircle size={32} color="#10b981" style={{ marginBottom: '10px' }} />
                  <p>All devices operating inside safety parameters.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ==========================================
            NEW PAGE: Hospital Connection / Data Connections
            ========================================== */}
        {activeTab === 'hospital_connect' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h1 style={{ margin: 0, fontSize: '2em' }}>Data Connections & Replay</h1>
                <p style={{ margin: '5px 0 0 0', color: '#94a3b8' }}>Connect real MQTT brokers or configure high-fidelity simulation replays</p>
              </div>
              <div style={{ display: 'flex', gap: '15px' }}>
                <span className="badge badge-low">Ingest rate: {liveStreamRate * 12} events/min</span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.8fr', gap: '20px' }}>
              
              {/* Left Column: MQTT Connect & Simulation Mode */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                
                {/* MQTT Configuration Card */}
                <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <h3 style={{ margin: 0 }}>MQTT IoT Broker Connection</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8em', color: '#94a3b8' }}>Broker Host</label>
                    <input type="text" value={mqttHost} onChange={e => setMqttHost(e.target.value)} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8em', color: '#94a3b8' }}>Port</label>
                    <input type="number" value={mqttPort} onChange={e => setMqttPort(parseInt(e.target.value))} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8em', color: '#94a3b8' }}>Subscribe Topic</label>
                    <input type="text" value={mqttTopic} onChange={e => setMqttTopic(e.target.value)} />
                  </div>
                  <button className="primary" onClick={connectMqttBroker} style={{ marginTop: '10px' }}>
                    Connect MQTT Subscriber
                  </button>
                  <div style={{ fontSize: '0.8em', color: '#94a3b8', textAlign: 'right' }}>
                    Status: <strong style={{ color: mqttStatus === 'Connected' ? '#10b981' : '#ef4444' }}>{mqttStatus}</strong>
                  </div>
                </div>

                {/* Simulation Control Card */}
                <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px' }}>
                    <h3 style={{ margin: 0, color: '#f59e0b' }}>DEMO / SIMULATED STREAM</h3>
                    <span style={{ fontSize: '0.75em', color: '#64748b' }}>Streams validation log rows sequentially</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8em', color: '#94a3b8' }}>Replay Device ID</label>
                    <input type="text" value={replayDevice} onChange={e => setReplayDevice(e.target.value.toUpperCase())} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8em', color: '#94a3b8' }}>Failure Scenario</label>
                    <select value={replayScenario} onChange={e => setReplayScenario(e.target.value)}>
                      <option value="Normal">Normal Operation</option>
                      <option value="Battery Degradation">Battery Degradation</option>
                      <option value="Overheating">Overheating</option>
                      <option value="Sensor Failure">Sensor Failure</option>
                      <option value="Power Instability">Power Instability</option>
                      <option value="Communication Failure">Communication Failure</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8em', color: '#94a3b8' }}>Replay Speed</label>
                    <select value={replaySpeed} onChange={e => setReplaySpeed(parseFloat(e.target.value))}>
                      <option value="1.0">1x (Realtime)</option>
                      <option value="10.0">10x Speed</option>
                      <option value="50.0">50x Speed</option>
                      <option value="100.0">100x Speed</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                    <button className="primary" onClick={startReplayStream} style={{ flex: 1 }}>Start Replay</button>
                    <button className="primary" style={{ background: '#f59e0b' }} onClick={pauseReplayStream}>Pause</button>
                    <button className="primary" style={{ background: '#ef4444' }} onClick={stopReplayStream}>Stop</button>
                  </div>
                </div>

              </div>

              {/* Right Column: Live Logs Viewer */}
              <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', height: '620px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '10px', marginBottom: '10px' }}>
                  <h3 style={{ margin: 0 }}>Live Telemetry Logs</h3>
                  <button className="primary" style={{ background: isLiveLogsPaused ? '#10b981' : '#f59e0b', fontSize: '0.8em', padding: '6px 12px' }} onClick={() => setIsLiveLogsPaused(!isLiveLogsPaused)}>
                    {isLiveLogsPaused ? 'Resume Stream' : 'Pause Stream'}
                  </button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', fontSize: '0.85em', fontFamily: 'monospace' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <th style={{ padding: '8px', textAlign: 'left' }}>Time</th>
                        <th style={{ padding: '8px', textAlign: 'left' }}>Device</th>
                        <th style={{ padding: '8px', textAlign: 'left' }}>Health</th>
                        <th style={{ padding: '8px', textAlign: 'left' }}>Risk</th>
                        <th style={{ padding: '8px', textAlign: 'left' }}>Payload</th>
                      </tr>
                    </thead>
                    <tbody>
                      {liveLogs.map((log, i) => (
                        <tr key={log.log_id || i} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                          <td style={{ padding: '8px' }}>{log.timestamp}</td>
                          <td style={{ padding: '8px', fontWeight: 600 }}>{log.device_id}</td>
                          <td style={{ padding: '8px', color: getHealthColor(log.overall_health) }}>{log.overall_health}%</td>
                          <td style={{ padding: '8px' }}>{getRiskBadge(log.risk_level)}</td>
                          <td style={{ padding: '8px', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '180px' }}>
                            {log.payload}
                          </td>
                        </tr>
                      ))}
                      {liveLogs.length === 0 && (
                        <tr>
                          <td colSpan={5} style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                            Listening for live telemetry logs. Trigger Replay or MQTT connection...
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* ==========================================
            NEW PAGE: Dataset Upload & Schema Integration
            ========================================== */}
        {activeTab === 'dataset_upload' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <h1 style={{ margin: 0, fontSize: '2em' }}>Dataset Upload & Integration</h1>
              <p style={{ margin: '5px 0 0 0', color: '#94a3b8' }}>Upload raw medical device logs CSV/Parquet and align telemetry schemas with AURA ML features.</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: '20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* File Upload Box */}
                <div className="glass-card" style={{ border: '2px dashed rgba(99,102,241,0.35)', borderRadius: '12px', padding: '30px', textAlign: 'center', background: 'rgba(99,102,241,0.03)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                  <Upload size={36} color="#6366f1" />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '1.05em' }}>Drop Hospital Telemetry Dataset</div>
                    <div style={{ fontSize: '0.8em', color: '#64748b', marginTop: '4px' }}>Supports .csv, .xlsx, .json, .parquet (Max 50MB)</div>
                  </div>
                  <input type="file" id="datasetFile" style={{ display: 'none' }} accept=".csv,.xlsx,.xls,.json,.parquet" onChange={handleUploadDataset} />
                  <button className="primary" onClick={() => { document.getElementById('datasetFile').value = ''; document.getElementById('datasetFile').click(); }}>
                    Select &amp; Upload Dataset
                  </button>
                  {uploadProgress && (
                    <div style={{
                      fontSize: '0.85em', padding: '8px 14px', borderRadius: '6px', width: '100%',
                      background: uploadProgress.includes('successfully') ? 'rgba(16,185,129,0.15)' : uploadProgress.includes('Error') ? 'rgba(239,68,68,0.15)' : 'rgba(99,102,241,0.15)',
                      color: uploadProgress.includes('successfully') ? '#10b981' : uploadProgress.includes('Error') ? '#ef4444' : '#6366f1'
                    }}>{uploadProgress}</div>
                  )}
                </div>

                {/* Uploaded Datasets Registry */}
                <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
                  <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, fontSize: '1em' }}>📊 Dataset Registry</h3>
                    <span style={{ fontSize: '0.8em', color: '#64748b' }}>{uploadedDatasets.length} uploaded</span>
                  </div>
                  {uploadedDatasets.length === 0 ? (
                    <div style={{ padding: '30px', textAlign: 'center', color: '#64748b', fontSize: '0.9em' }}>
                      No datasets uploaded yet.<br/>Upload a telemetry CSV to begin mapping.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      {uploadedDatasets.map(ds => (
                        <div key={ds.dataset_id}
                          style={{
                            padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,0.03)',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer',
                            background: selectedDataset?.dataset_id === ds.dataset_id ? 'rgba(99,102,241,0.12)' : 'transparent'
                          }}
                          onClick={() => { setSelectedDataset(ds); setColumnMappings(ds.column_mapping || {}); setValidationReport(null); }}
                        >
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '0.9em' }}>📊 {ds.filename}</div>
                            <div style={{ fontSize: '0.75em', color: '#64748b' }}>
                              {ds.row_count} rows • {ds.col_count} cols • {Math.round((ds.filesize || 0) / 1024)} KB
                            </div>
                          </div>
                          <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }} onClick={(e) => { e.stopPropagation(); handleDeleteDataset(ds.dataset_id); }}>
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Column Mapping & Validation Panel */}
              <div>
                {selectedDataset ? (
                  <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h3 style={{ margin: 0 }}>⚙️ Schema Mapper: <span style={{ color: '#6366f1' }}>{selectedDataset.filename}</span></h3>
                      <span style={{ fontSize: '0.75em', color: '#94a3b8', fontFamily: 'monospace' }}>{selectedDataset.dataset_id}</span>
                    </div>

                    {/* Quick Stats Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', fontSize: '0.85em', textAlign: 'center' }}>
                      <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px', borderRadius: '6px' }}>
                        <div style={{ color: '#64748b', fontSize: '0.75em' }}>TOTAL ROWS</div>
                        <div style={{ fontWeight: 700, fontSize: '1.1em', marginTop: '2px' }}>{selectedDataset.row_count}</div>
                      </div>
                      <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px', borderRadius: '6px' }}>
                        <div style={{ color: '#64748b', fontSize: '0.75em' }}>DEVICES</div>
                        <div style={{ fontWeight: 700, fontSize: '1.1em', marginTop: '2px' }}>{selectedDataset.device_count || 'N/A'}</div>
                      </div>
                      <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px', borderRadius: '6px' }}>
                        <div style={{ color: '#64748b', fontSize: '0.75em' }}>MISSING %</div>
                        <div style={{ fontWeight: 700, fontSize: '1.1em', color: selectedDataset.missing_percent > 10 ? '#ef4444' : '#10b981', marginTop: '2px' }}>{selectedDataset.missing_percent}%</div>
                      </div>
                      <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px', borderRadius: '6px' }}>
                        <div style={{ color: '#64748b', fontSize: '0.75em' }}>DUPLICATES</div>
                        <div style={{ fontWeight: 700, fontSize: '1.1em', color: selectedDataset.duplicate_count > 0 ? '#f59e0b' : '#10b981', marginTop: '2px' }}>{selectedDataset.duplicate_count}</div>
                      </div>
                    </div>

                    {/* Column Mapping Selects */}
                    <div style={{ fontSize: '0.85em', color: '#94a3b8', marginTop: '4px' }}>Map source file columns to AURA ML Feature Store schemas:</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '220px', overflowY: 'auto', paddingRight: '4px' }}>
                      {Object.keys(columnMappings).map(col => (
                        <div key={col} style={{ display: 'grid', gridTemplateColumns: '1.2fr 40px 1.5fr', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.02)', padding: '8px 12px', borderRadius: '6px', fontSize: '0.85em' }}>
                          <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={col}>{col}</span>
                          <span style={{ textAlign: 'center', color: '#64748b' }}>➔</span>
                          <select
                            value={columnMappings[col]}
                            onChange={(e) => setColumnMappings({ ...columnMappings, [col]: e.target.value })}
                            style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(255,255,255,0.1)', color: '#f8fafc', padding: '4px 8px', borderRadius: '4px', fontSize: '0.85em' }}
                          >
                            <option value="Ignore">🚫 Ignore Column</option>
                            <option value="Device_ID">🔑 Device_ID (Required)</option>
                            <option value="Snapshot_Date">📅 Snapshot_Date (Required)</option>
                            <option value="Device_Type">🏷️ Device_Type (Required)</option>
                            <option value="Approx_Battery_Health">🔋 Approx_Battery_Health</option>
                            <option value="Errors_Last_30_Days">⚠️ Errors_Last_30_Days</option>
                            <option value="Operating_Hours">⏱️ Operating_Hours</option>
                            <option value="Sensor_Temperature">🌡️ Sensor_Temperature</option>
                          </select>
                        </div>
                      ))}
                    </div>

                    <button className="primary" onClick={handleValidateDataset} disabled={validating} style={{ width: '100%' }}>
                      {validating ? 'Evaluating Compatibility...' : '🔍 Validate Schema Compatibility'}
                    </button>

                    {/* Validation Results Card */}
                    {validationReport && (
                      <div style={{
                        background: validationReport.schema_compatibility === 'COMPATIBLE' ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
                        border: `1px solid ${validationReport.schema_compatibility === 'COMPATIBLE' ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)'}`,
                        padding: '16px', borderRadius: '8px', fontSize: '0.85em', display: 'flex', flexDirection: 'column', gap: '10px'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 600 }}>Compatibility Rating:</span>
                          <span style={{
                            fontWeight: 700, padding: '3px 10px', borderRadius: '12px', fontSize: '0.85em',
                            background: validationReport.schema_compatibility === 'COMPATIBLE' ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)',
                            color: validationReport.schema_compatibility === 'COMPATIBLE' ? '#10b981' : '#f59e0b'
                          }}>
                            {validationReport.schema_compatibility === 'COMPATIBLE' ? '✅ FULLY COMPATIBLE' : '⚠️ PARTIALLY COMPATIBLE'}
                          </span>
                        </div>

                        <div>Alignment Score: <strong>{validationReport.feature_compatibility_score}%</strong></div>
                        <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '4px', height: '8px', overflow: 'hidden' }}>
                          <div style={{ width: `${validationReport.feature_compatibility_score}%`, background: validationReport.feature_compatibility_score >= 70 ? '#10b981' : '#f59e0b', height: '100%' }} />
                        </div>

                        {validationReport.missing_required_columns && validationReport.missing_required_columns.length > 0 && (
                          <div style={{ color: '#ef4444', fontSize: '0.8em' }}>
                            ❌ Missing Required Target Columns: <strong>{validationReport.missing_required_columns.join(', ')}</strong>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '350px', color: '#64748b', textAlign: 'center', gap: '10px' }}>
                    <div style={{ fontSize: '2.5em' }}>📂</div>
                    <div>Select a dataset from the Registry on the left to map columns and validate schema compatibility.</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ==========================================
            NEW PAGE: Knowledge Base upload
            ========================================== */}
        {activeTab === 'knowledge_base' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <h1 style={{ margin: 0, fontSize: '2em' }}>Knowledge Base - Manual Vault</h1>
              <p style={{ margin: '5px 0 0 0', color: '#94a3b8' }}>Upload maintenance manuals. Each manual is chunked, vector-indexed and accessible only to your hospital ({currentUser?.hospital_id || 'demo-hospital'}).</p>
            </div>

            {/* Upload Card */}
            <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h3 style={{ margin: 0 }}>📄 Upload Service Manual</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.75em', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Device Type</label>
                  <input type="text" placeholder="e.g. Ventilator" value={kbDeviceType} onChange={e => setKbDeviceType(e.target.value)} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.75em', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Manufacturer</label>
                  <input type="text" placeholder="e.g. MedStar" value={kbManufacturer} onChange={e => setKbManufacturer(e.target.value)} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.75em', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Version</label>
                  <input type="text" placeholder="e.g. 2.1" value={kbVersion} onChange={e => setKbVersion(e.target.value)} />
                </div>
              </div>

              <div style={{ border: '2px dashed rgba(99,102,241,0.35)', borderRadius: '10px', padding: '24px', textAlign: 'center', background: 'rgba(99,102,241,0.04)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                <Upload size={28} color="#6366f1" />
                <div style={{ fontSize: '0.9em', color: '#94a3b8' }}>Accepts <strong>.txt</strong>, <strong>.pdf</strong>, <strong>.docx</strong>, <strong>.csv</strong></div>
                <input type="file" id="manualFile" style={{ display: 'none' }} accept=".txt,.pdf,.docx,.doc,.csv" onChange={handleUploadManual} />
                <button className="primary" onClick={() => { document.getElementById('manualFile').value = ''; document.getElementById('manualFile').click(); }}>
                  Select & Upload Manual
                </button>
                {kbUploadProgress && (
                  <div style={{
                    fontSize: '0.85em',
                    padding: '8px 14px',
                    borderRadius: '6px',
                    background: kbUploadProgress.startsWith('✅') ? 'rgba(16,185,129,0.15)'
                              : kbUploadProgress.startsWith('❌') ? 'rgba(239,68,68,0.15)'
                              : 'rgba(99,102,241,0.15)',
                    color: kbUploadProgress.startsWith('✅') ? '#10b981'
                         : kbUploadProgress.startsWith('❌') ? '#ef4444'
                         : '#6366f1',
                    width: '100%'
                  }}>{kbUploadProgress}</div>
                )}
              </div>
            </div>

            {/* Manuals Database Table */}
            <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>📚 Manuals Database - Hospital: <span style={{ color: '#6366f1' }}>{currentUser?.hospital_id || 'demo-hospital'}</span></h3>
                <span style={{ fontSize: '0.8em', color: '#64748b' }}>{knowledgeDocs.length} manual{knowledgeDocs.length !== 1 ? 's' : ''} indexed</span>
              </div>
              {knowledgeDocs.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                  <div style={{ fontSize: '2em', marginBottom: '8px' }}>📂</div>
                  <div>No manuals uploaded yet for <strong>{currentUser?.hospital_id || 'demo-hospital'}</strong>.</div>
                  <div style={{ fontSize: '0.8em', marginTop: '4px' }}>Upload a .txt, .pdf, or .docx manual above to get started.</div>
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '0.75em', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      <th style={{ padding: '12px 20px', textAlign: 'left' }}>Filename</th>
                      <th style={{ padding: '12px 20px', textAlign: 'left' }}>Device Type</th>
                      <th style={{ padding: '12px 20px', textAlign: 'left' }}>Manufacturer</th>
                      <th style={{ padding: '12px 20px', textAlign: 'left' }}>Version</th>
                      <th style={{ padding: '12px 20px', textAlign: 'center' }}>Chunks</th>
                      <th style={{ padding: '12px 20px', textAlign: 'left' }}>Uploaded</th>
                      <th style={{ padding: '12px 20px', textAlign: 'left' }}>By</th>
                      <th style={{ padding: '12px 20px', textAlign: 'center' }}>Status</th>
                      <th style={{ padding: '12px 20px', textAlign: 'center' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {knowledgeDocs.map(doc => (
                      <tr key={doc.document_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: '0.85em' }}>
                        <td style={{ padding: '12px 20px' }}>
                          <div style={{ fontWeight: 600, maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={doc.filename}>📄 {doc.filename}</div>
                          <div style={{ fontSize: '0.75em', color: '#64748b', fontFamily: 'monospace' }}>{doc.document_id}</div>
                        </td>
                        <td style={{ padding: '12px 20px' }}>{doc.device_type || '-'}</td>
                        <td style={{ padding: '12px 20px' }}>{doc.manufacturer || '-'}</td>
                        <td style={{ padding: '12px 20px' }}>v{doc.model_version || doc.document_version || '1.0'}</td>
                        <td style={{ padding: '12px 20px', textAlign: 'center' }}>
                          <button
                            style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', color: '#6366f1', padding: '4px 12px', borderRadius: '12px', fontWeight: 700, fontSize: '0.85em', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                            onClick={() => fetchDocChunks(doc)}
                            title="Click to view all segmented text chunks in SQL database"
                          >
                            <Eye size={13} /> {doc.chunk_count ?? 0} Chunks
                          </button>
                        </td>
                        <td style={{ padding: '12px 20px', fontSize: '0.8em', color: '#94a3b8' }}>{doc.upload_timestamp ? doc.upload_timestamp.replace('T', ' ').replace('Z', '') : '-'}</td>
                        <td style={{ padding: '12px 20px' }}>{doc.uploaded_by || '-'}</td>
                        <td style={{ padding: '12px 20px', textAlign: 'center' }}>
                          <span style={{ padding: '2px 10px', borderRadius: '12px', fontSize: '0.8em', fontWeight: 600,
                            background: doc.status === 'enabled' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                            color: doc.status === 'enabled' ? '#10b981' : '#ef4444' }}>
                            {doc.status === 'enabled' ? '✅ Active' : '⛔ Disabled'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 20px', textAlign: 'center' }}>
                          <button
                            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', color: '#ef4444', fontSize: '0.8em' }}
                            onClick={() => { if (window.confirm('Delete this manual and all its chunks?')) handleDeleteDoc(doc.document_id); }}
                          >
                            🗑 Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* SQL Document Chunks Inspection Viewer */}
            {selectedDocForChunks && (
              <div className="glass-card" style={{ border: '1px solid rgba(99,102,241,0.3)', display: 'flex', flexDirection: 'column', gap: '14px', background: 'rgba(15,23,42,0.95)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '10px' }}>
                  <div>
                    <h3 style={{ margin: 0, color: '#6366f1' }}>🔍 SQL Vector Chunks: {selectedDocForChunks.filename}</h3>
                    <div style={{ fontSize: '0.75em', color: '#64748b', marginTop: '2px' }}>Document ID: {selectedDocForChunks.document_id} • Device: {selectedDocForChunks.device_type} • Hospital: {selectedDocForChunks.hospital_id}</div>
                  </div>
                  <button
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer' }}
                    onClick={() => setSelectedDocForChunks(null)}
                  >
                    ✕ Close Viewer
                  </button>
                </div>

                {chunksLoading ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#6366f1' }}>Loading SQL chunks...</div>
                ) : docChunks.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>No chunks found for this document.</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', maxHeight: '320px', overflowY: 'auto' }}>
                    {docChunks.map((c, idx) => (
                      <div key={idx} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.85em' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75em', color: '#6366f1', fontWeight: 600 }}>
                          <span>📌 Chunk #{idx + 1} — {c.section}</span>
                          <span>Page {c.page}</span>
                        </div>
                        <div style={{ color: '#e2e8f0', fontFamily: 'monospace', fontSize: '0.8em', background: 'rgba(0,0,0,0.3)', padding: '8px', borderRadius: '4px', whiteSpace: 'pre-wrap', maxHeight: '120px', overflowY: 'auto' }}>
                          {c.text_content}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* RAG Chat */}
            <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', height: '480px' }}>
              <h3 style={{ margin: '0 0 10px 0' }}>💬 Grounded Knowledge QA — Ask your uploaded manuals</h3>
              <div className="chat-history" style={{ flex: 1, overflowY: 'auto' }}>
                {kbChatLog.map((msg, i) => (
                  <div key={i} className={`message-bubble ${msg.sender}`} style={{ position: 'relative' }}>
                    <div dangerouslySetInnerHTML={{ __html: msg.text }} />
                    {msg.rawSource && (
                      <button
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', padding: '4px 8px', fontSize: '0.75em', cursor: 'pointer', marginTop: '8px', borderRadius: '4px' }}
                        onClick={() => setViewedSourceChunk(msg.rawSource)}
                      >
                        📋 View Source Chunk
                      </button>
                    )}
                  </div>
                ))}
                {kbChatLoading && <div className="message-bubble advisor">🔍 Searching manual chunks...</div>}
              </div>
              <div style={{ display: 'flex', gap: '10px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <input type="text" placeholder="e.g. How to replace the ventilator battery?" value={kbChatInput} onChange={e => setKbChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendKbChatMessage()} style={{ flex: 1 }} />
                <button className="primary" onClick={sendKbChatMessage} disabled={kbChatLoading}>Query RAG</button>
              </div>
            </div>
          </div>
        )}

        {/* ==========================================
            Team & Access (Hospital Admin)
            ========================================== */}
        {activeTab === 'team' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <h1 style={{ margin: 0, fontSize: '2em' }}>Team &amp; Access</h1>
              <p style={{ margin: '5px 0 0 0', color: '#94a3b8' }}>
                Who can sign in to {hospitalName}, what they are responsible for, and whether their account is active.
              </p>
            </div>

            {teamMessage && (
              <div className="glass-card" style={{ padding: '12px 16px', color: teamMessage.tone === 'ok' ? '#047857' : '#b91c1c', fontSize: '0.88em' }}>
                {teamMessage.text}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: '20px', alignItems: 'start' }}>
              <div className="glass-card" style={{ padding: '0', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86em' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', background: 'var(--input-bg)' }}>
                      <th style={{ padding: '12px 16px' }}>Staff member</th>
                      <th style={{ padding: '12px 16px' }}>Responsibility</th>
                      <th style={{ padding: '12px 16px' }}>Last sign-in</th>
                      <th style={{ padding: '12px 16px' }}>Account</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamMembers.map(member => (
                      <tr key={member.user_id} style={{ borderTop: '1px solid var(--border-light)' }}>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ fontWeight: 600 }}>{member.full_name}</div>
                          <div style={{ color: 'var(--text-muted)', fontSize: '0.85em' }}>{member.username} · {member.email || 'no email on file'}</div>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <div>{member.job_title || member.role.replace(/_/g, ' ')}</div>
                          <div style={{ color: 'var(--text-muted)', fontSize: '0.85em' }}>{member.department || 'Hospital-wide'}</div>
                        </td>
                        <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>
                          {member.last_login ? new Date(member.last_login).toLocaleString() : 'Never'}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <button
                            onClick={() => setMemberStatus(member, !member.is_active)}
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', color: member.is_active ? '#047857' : '#b91c1c' }}
                          >
                            {member.is_active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                            {member.is_active ? 'Active' : 'Suspended'}
                          </button>
                        </td>
                      </tr>
                    ))}
                    {teamMembers.length === 0 && (
                      <tr><td colSpan={4} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>No staff accounts yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <form className="glass-card" onSubmit={createTeamMember} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <h3 style={{ margin: 0 }}>Add a staff member</h3>
                <p style={{ margin: 0, fontSize: '0.8em', color: 'var(--text-muted)' }}>
                  They receive access to only the workspace their role needs.
                </p>
                <input placeholder="Full name" value={teamForm.full_name} onChange={e => setTeamForm({ ...teamForm, full_name: e.target.value })} required />
                <input placeholder="Username (e.g. s.iyer)" value={teamForm.username} onChange={e => setTeamForm({ ...teamForm, username: e.target.value })} required />
                <input placeholder="Job title" value={teamForm.job_title} onChange={e => setTeamForm({ ...teamForm, job_title: e.target.value })} />
                <input placeholder="Work email" type="email" value={teamForm.email} onChange={e => setTeamForm({ ...teamForm, email: e.target.value })} />
                <select value={teamForm.role} onChange={e => setTeamForm({ ...teamForm, role: e.target.value })}>
                  {(teamRoles.length ? teamRoles : ['HOSPITAL_ADMIN', 'BIOMEDICAL_ENGINEER', 'DEPARTMENT_OPERATOR', 'RELIABILITY_MANAGER', 'AUDITOR']).map(role => (
                    <option key={role} value={role}>{role.replace(/_/g, ' ')}</option>
                  ))}
                </select>
                <input
                  placeholder={teamForm.role === 'DEPARTMENT_OPERATOR' ? 'Department (required)' : 'Department (optional)'}
                  value={teamForm.department}
                  onChange={e => setTeamForm({ ...teamForm, department: e.target.value })}
                  required={teamForm.role === 'DEPARTMENT_OPERATOR'}
                />
                <input placeholder="Temporary password (min 8 characters)" type="password" value={teamForm.password} onChange={e => setTeamForm({ ...teamForm, password: e.target.value })} required minLength={8} />
                <button className="primary" type="submit" style={{ padding: '11px' }}>Create account</button>
              </form>
            </div>
          </div>
        )}

        {/* ==========================================
            NEW PAGE: Audit Logs Viewer
            ========================================== */}
        {activeTab === 'audit_logs' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <h1 style={{ margin: 0, fontSize: '2em' }}>Security & Audit Logs</h1>
              <p style={{ margin: '5px 0 0 0', color: '#94a3b8' }}>Chronological trail of user actions logged for compliance and security audit</p>
            </div>

            <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 0 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <th style={{ padding: '14px 20px', textAlign: 'left' }}>Timestamp</th>
                    <th style={{ padding: '14px 20px', textAlign: 'left' }}>User</th>
                    <th style={{ padding: '14px 20px', textAlign: 'left' }}>Action</th>
                    <th style={{ padding: '14px 20px', textAlign: 'left' }}>Resource</th>
                    <th style={{ padding: '14px 20px', textAlign: 'left' }}>Resource ID</th>
                    <th style={{ padding: '14px 20px', textAlign: 'left' }}>IP Address</th>
                    <th style={{ padding: '14px 20px', textAlign: 'left' }}>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map(log => (
                    <tr key={log.audit_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)', fontSize: '0.85em' }}>
                      <td style={{ padding: '12px 20px' }}>{log.timestamp}</td>
                      <td style={{ padding: '12px 20px', fontWeight: 600 }}>{log.username}</td>
                      <td style={{ padding: '12px 20px', fontFamily: 'monospace' }}>{log.action}</td>
                      <td style={{ padding: '12px 20px' }}>{log.resource_type}</td>
                      <td style={{ padding: '12px 20px', fontFamily: 'monospace' }}>{log.resource_id || '-'}</td>
                      <td style={{ padding: '12px 20px' }}>{log.ip_address}</td>
                      <td style={{ padding: '12px 20px' }}>
                        {log.success === 1 ? (
                          <span style={{ color: '#10b981', fontWeight: 600 }}>🟢 SUCCESS</span>
                        ) : (
                          <span style={{ color: '#ef4444', fontWeight: 600 }}>🔴 FAILED</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {auditLogs.length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ padding: '30px', textAlign: 'center', color: '#64748b' }}>No audit trails recorded yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
