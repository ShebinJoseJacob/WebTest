import React, { useState, useEffect, useContext, createContext, useCallback, useMemo, useRef } from 'react';
import { 
  Heart, Activity, Thermometer, MapPin, AlertTriangle, 
  Users, Bell, Calendar, Shield, LogOut, CheckCircle, 
  Clock, Home, Map as MapIcon, Volume2, VolumeX,
  RefreshCw, Filter, Eye, EyeOff, Smartphone, Monitor,
  Zap, UserCheck, AlertCircle
} from 'lucide-react';
import { 
  MapTab, AlertsTab, StatCard, FilterPanel, EmployeeCard, CriticalAlertItem 
} from './components/SupervisorComponents';

// API Configuration
const API_URL = process.env.REACT_APP_API_URL || 'https://iot-monitoring-backend-sgba.onrender.com/api';

// Auth Context
const AuthContext = createContext(null);

// Enhanced API Service with RBAC
class ApiService {
  constructor() {
    this.token = localStorage.getItem('token');
  }

  setToken(token) {
    this.token = token;
    localStorage.setItem('token', token);
  }

  clearToken() {
    this.token = null;
    localStorage.removeItem('token');
  }

  async request(endpoint, options = {}) {
    const url = `${API_URL}${endpoint}`;
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...(this.token && { Authorization: `Bearer ${this.token}` }),
        ...options.headers,
      },
      ...options,
    };

    const response = await fetch(url, config);
    
    if (!response.ok) {
      if (response.status === 401) {
        this.clearToken();
        window.location.reload();
      }
      const error = await response.text();
      throw new Error(error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  async login(email, password) {
    const data = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    this.setToken(data.token);
    return data;
  }

  // Employee-specific endpoints (only own data)
  async getMyVitals() {
    return this.request('/vitals/my');
  }

  async getMyAlerts() {
    return this.request('/alerts/my');
  }

  async getMyAttendance() {
    return this.request('/attendance/my');
  }

  // Supervisor-specific endpoints (all data)
  async getAllEmployees() {
    return this.request('/employees');
  }

  async getAllVitals() {
    return this.request('/vitals/latest');
  }

  async getAllAlerts() {
    return this.request('/alerts');
  }

  async getAllAttendance() {
    return this.request('/attendance/all');
  }

  async acknowledgeAlert(alertId) {
    return this.request(`/alerts/${alertId}/acknowledge`, {
      method: 'POST',
    });
  }
}

const api = new ApiService();

// Enhanced Socket Manager with Alert Audio
class AlertSocketManager {
  constructor() {
    this.listeners = {};
    this.connected = false;
    this.audioContext = null;
    this.alertSound = null;
    this.setupAudio();
  }

  setupAudio() {
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.createAlertSound();
    } catch (e) {
      console.warn('Audio context not available');
    }
  }

  createAlertSound() {
    if (!this.audioContext) return;
    
    // Create a simple alert beep
    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);
    
    oscillator.frequency.setValueAtTime(800, this.audioContext.currentTime);
    gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
    
    this.alertSound = { oscillator, gainNode };
  }

  playAlertSound() {
    if (!this.audioContext || this.audioContext.state === 'suspended') {
      this.audioContext?.resume();
    }
    
    try {
      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);
      
      oscillator.frequency.setValueAtTime(800, this.audioContext.currentTime);
      oscillator.frequency.setValueAtTime(1000, this.audioContext.currentTime + 0.1);
      oscillator.frequency.setValueAtTime(800, this.audioContext.currentTime + 0.2);
      
      gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.3, this.audioContext.currentTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.3);
      
      oscillator.start(this.audioContext.currentTime);
      oscillator.stop(this.audioContext.currentTime + 0.3);
    } catch (e) {
      console.warn('Could not play alert sound:', e);
    }
  }

  connect(token) {
    this.connected = true;
    console.log('Mock WebSocket connected');
    this.startSimulation();
  }

  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }

  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => callback(data));
    }
  }

  startSimulation() {
    // Simulate real-time vital updates
    setInterval(() => {
      if (this.connected) {
        this.emit('vital-update', {
          userId: Math.ceil(Math.random() * 3).toString(),
          heart_rate: 60 + Math.round(Math.random() * 40),
          spo2: 94 + Math.round(Math.random() * 4),
          temperature: 36.5 + (Math.random() * 1.5),
          latitude: 40.7128 + (Math.random() - 0.5) * 0.01,
          longitude: -74.0060 + (Math.random() - 0.5) * 0.01,
          timestamp: new Date().toISOString()
        });
      }
    }, 5000);

    // Simulate critical alerts with audio
    setInterval(() => {
      if (this.connected && Math.random() > 0.8) {
        const alert = {
          id: Math.random().toString(36),
          user_id: Math.ceil(Math.random() * 3).toString(),
          type: ['fall_detected', 'heart_rate_critical', 'spo2_critical'][Math.floor(Math.random() * 3)],
          severity: ['high', 'critical'][Math.floor(Math.random() * 2)],
          message: 'Critical alert detected - immediate attention required',
          acknowledged: false,
          timestamp: new Date().toISOString()
        };
        
        if (alert.severity === 'critical') {
          this.playAlertSound();
        }
        
        this.emit('alert', alert);
      }
    }, 20000);
  }

  disconnect() {
    this.connected = false;
  }
}

// Auth Provider Component
function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      // For demo, decode the token to get user info
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setUser({
          id: payload.id,
          email: payload.email,
          role: payload.role,
          name: payload.role === 'supervisor' ? 'John Supervisor' : 'Jane Employee'
        });
      } catch (e) {
        api.clearToken();
      }
      setLoading(false);
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email, password) => {
    const data = await api.login(email, password);
    setUser(data.user);
    return data;
  };

  const logout = () => {
    api.clearToken();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

// Login Component (unchanged but enhanced)
function Login() {
  const [email, setEmail] = useState('supervisor@company.com');
  const [password, setPassword] = useState('AdminPass123!');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useContext(AuthContext);

  const handleSubmit = async () => {
    setError('');
    setLoading(true);

    try {
      await login(email, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900 p-4">
      <div className="bg-white/10 backdrop-blur-lg p-8 rounded-2xl shadow-2xl w-full max-w-md border border-white/20">
        <div className="flex items-center justify-center mb-8">
          <Shield className="h-12 w-12 text-blue-300" />
        </div>
        <h2 className="text-2xl font-bold text-white text-center mb-6">
          IoT Worker Monitoring
        </h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-blue-100 mb-2">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all"
              placeholder="user@example.com"
              onKeyPress={(e) => e.key === 'Enter' && handleSubmit()}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-blue-100 mb-2">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all"
              placeholder="••••••••"
              onKeyPress={(e) => e.key === 'Enter' && handleSubmit()}
            />
          </div>
          {error && (
            <div className="bg-red-500/20 border border-red-400 text-red-100 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <div className="flex items-center justify-center">
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Signing in...
              </div>
            ) : (
              'Sign In'
            )}
          </button>
        </div>
        <div className="mt-6 text-center text-blue-200 text-sm space-y-1">
          <div className="font-medium">Demo Accounts:</div>
          <div>👨‍💼 Supervisor: supervisor@company.com</div>
          <div>👷‍♀️ Employee: employee@company.com</div>
          <div className="text-blue-300">Password: AdminPass123!</div>
        </div>
      </div>
    </div>
  );
}

// EMPLOYEE DASHBOARD - STRICTLY LIMITED VIEW
function EmployeeDashboard() {
  const { user, logout } = useContext(AuthContext);
  const [vitals, setVitals] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [attendance, setAttendance] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadEmployeeData();
  }, []);

  const loadEmployeeData = async () => {
    setLoading(true);
    try {
      // Mock employee's own data only
      const mockVitals = Array.from({ length: 24 }, (_, i) => ({
        time: new Date(Date.now() - (23 - i) * 60 * 60 * 1000),
        heart_rate: 70 + Math.sin(i / 4) * 10 + Math.random() * 10,
        spo2: 97 + Math.random() * 2,
        temperature: 36.5 + Math.random() * 0.8
      }));

      const mockAlerts = [
        {
          id: '1',
          type: 'heart_rate_high',
          severity: 'medium',
          message: 'Heart rate elevated above 100 bpm for 5 minutes',
          timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
          acknowledged: true
        }
      ];

      const mockAttendance = {
        check_in_time: new Date().setHours(8, 30, 0, 0),
        status: 'present',
        date: new Date().toDateString()
      };

      setVitals(mockVitals);
      setAlerts(mockAlerts);
      setAttendance(mockAttendance);
    } catch (error) {
      console.error('Failed to load employee data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center">
              <Shield className="h-8 w-8 text-blue-600 mr-3" />
              <div>
                <h1 className="text-xl font-bold text-gray-900">My Dashboard</h1>
                <p className="text-sm text-gray-500">Personal Health Monitor</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-right">
                <div className="text-sm font-medium text-gray-900">{user?.name}</div>
                <div className="text-xs text-gray-500">Employee</div>
              </div>
              <button
                onClick={logout}
                className="flex items-center px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Today's Attendance */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center">
            <Clock className="h-5 w-5 mr-2 text-blue-600" />
            Today's Attendance
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-green-50 p-4 rounded-lg">
              <div className="text-sm text-green-600 font-medium">Check In</div>
              <div className="text-2xl font-bold text-green-800">
                {attendance?.check_in_time ? new Date(attendance.check_in_time).toLocaleTimeString() : '--:--'}
              </div>
            </div>
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="text-sm text-blue-600 font-medium">Status</div>
              <div className="text-2xl font-bold text-blue-800">
                {attendance?.status === 'present' ? 'Present' : 'Active'}
              </div>
            </div>
            <div className="bg-purple-50 p-4 rounded-lg">
              <div className="text-sm text-purple-600 font-medium">Hours Today</div>
              <div className="text-2xl font-bold text-purple-800">
                {attendance?.check_in_time ? 
                  Math.round((Date.now() - attendance.check_in_time) / (1000 * 60 * 60) * 10) / 10 : 0}h
              </div>
            </div>
          </div>
        </div>

        {/* Vital Signs Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <VitalChart
            title="Heart Rate"
            data={vitals}
            dataKey="heart_rate"
            unit="bpm"
            color="#ef4444"
            icon={Heart}
            normalRange="60-100"
          />
          <VitalChart
            title="SpO2"
            data={vitals}
            dataKey="spo2"
            unit="%"
            color="#3b82f6"
            icon={Activity}
            normalRange="95-100"
          />
          <VitalChart
            title="Temperature"
            data={vitals}
            dataKey="temperature"
            unit="°C"
            color="#f59e0b"
            icon={Thermometer}
            normalRange="36.1-37.2"
          />
        </div>

        {/* Personal Alerts */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center">
            <AlertTriangle className="h-5 w-5 mr-2 text-orange-600" />
            My Alerts & Incidents
          </h2>
          <div className="space-y-3">
            {alerts.length > 0 ? alerts.map(alert => (
              <div key={alert.id} className={`p-4 rounded-lg border-l-4 ${
                alert.severity === 'critical' ? 'bg-red-50 border-red-500 text-red-800' :
                alert.severity === 'high' ? 'bg-orange-50 border-orange-500 text-orange-800' :
                'bg-yellow-50 border-yellow-500 text-yellow-800'
              }`}>
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-semibold">{alert.type.replace(/_/g, ' ').toUpperCase()}</h4>
                    <p className="text-sm mt-1">{alert.message}</p>
                    <p className="text-xs mt-2 opacity-75">
                      {new Date(alert.timestamp).toLocaleString()}
                    </p>
                  </div>
                  {alert.acknowledged && (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  )}
                </div>
              </div>
            )) : (
              <div className="text-center py-8 text-gray-500">
                <CheckCircle className="h-12 w-12 mx-auto mb-2 text-green-500" />
                <p>No alerts today - keep up the good work!</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

// Vital Chart Component for Employee Dashboard
function VitalChart({ title, data, dataKey, unit, color, icon: Icon, normalRange }) {
  // Use real data, fallback to sample data if no data available
  const chartData = data.length === 0 ? [
    { heart_rate: 72.5, spo2: 98.2, temperature: 36.8, timestamp: new Date(Date.now() - 120000) },
    { heart_rate: 75.1, spo2: 97.9, temperature: 36.9, timestamp: new Date(Date.now() - 60000) },
    { heart_rate: 74.0, spo2: 98.6, temperature: 36.8, timestamp: new Date() }
  ] : data;
  
  const latestValue = chartData[chartData.length - 1]?.[dataKey];
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipData, setTooltipData] = useState(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  
  // Handle mouse move over chart to get hover point data
  const handleChartMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    if (chartData.length === 0) return;
    
    // Find the closest data point to the mouse position
    const minValue = Math.min(...chartData.map(d => d[dataKey]));
    const maxValue = Math.max(...chartData.map(d => d[dataKey]));
    const valueRange = maxValue - minValue;
    
    let closestIndex = 0;
    let closestDistance = Infinity;
    
    chartData.forEach((point, index) => {
      // Calculate the exact screen position using the same formula as the SVG polyline
      const svgX = (index / (chartData.length - 1)) * 100; // SVG percentage (0-100)
      const svgY = 100 - ((point[dataKey] - minValue) / valueRange * 100); // SVG percentage (0-100, flipped)
      
      // Convert SVG percentages to actual pixel coordinates
      const pointX = (svgX / 100) * rect.width;
      const pointY = (svgY / 100) * rect.height;
      
      // Calculate distance from mouse to this point
      const distance = Math.sqrt(Math.pow(x - pointX, 2) + Math.pow(y - pointY, 2));
      
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });
    
    const hoveredData = chartData[closestIndex];
    
    if (hoveredData) {
      setTooltipData({
        value: hoveredData[dataKey],
        timestamp: hoveredData.timestamp,
        index: closestIndex
      });
      setMousePosition({ x, y });
      setShowTooltip(true);
    }
  };
  
  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center">
          <Icon className="h-5 w-5 mr-2" style={{ color }} />
          <h3 className="font-semibold">{title}</h3>
        </div>
        <div className="text-right">
          <div 
            className="text-2xl font-bold" 
            style={{ color }}
          >
            {latestValue ? Math.round(latestValue * 10) / 10 : '--'}
          </div>
          <div className="text-sm text-gray-500">{unit}</div>
        </div>
      </div>
      
      {/* Interactive SVG Chart */}
      <div 
        className="h-24 w-full bg-gray-50 rounded-lg mb-2 relative overflow-visible cursor-crosshair hover:bg-gray-100 transition-colors"
        onMouseMove={handleChartMouseMove}
        onMouseLeave={() => {
          setShowTooltip(false);
          setTooltipData(null);
        }}
      >
        <svg className="w-full h-full pointer-events-none">
          {chartData.length > 1 && (
            <polyline
              fill="none"
              stroke={color}
              strokeWidth="2"
              points={chartData.map((point, i) => 
                `${(i / (chartData.length - 1)) * 100},${100 - ((point[dataKey] - Math.min(...chartData.map(d => d[dataKey]))) / 
                (Math.max(...chartData.map(d => d[dataKey])) - Math.min(...chartData.map(d => d[dataKey])))) * 100}`
              ).join(' ')}
            />
          )}
        </svg>
        
        {/* Interactive Tooltip */}
        {showTooltip && tooltipData && (
          <div 
            className="absolute z-[9999] pointer-events-none"
            style={{
              left: `${mousePosition.x}px`,
              top: `${mousePosition.y - 80}px`,
              transform: 'translateX(-50%)'
            }}
          >
            <div className="bg-gray-800 text-white text-sm rounded-lg py-2 px-3 shadow-lg border border-gray-600 whitespace-nowrap">
              <div className="font-semibold text-center text-blue-300">{title}</div>
              <div className="text-center text-yellow-200">{tooltipData.value.toFixed(3)} {unit}</div>
              <div className="text-gray-300 text-center text-xs">Display: {Math.round(tooltipData.value * 10) / 10} {unit}</div>
              {tooltipData.timestamp && (
                <div className="text-gray-400 text-center text-xs mt-1 border-t border-gray-600 pt-1">
                  {new Date(tooltipData.timestamp).toLocaleTimeString()}
                </div>
              )}
              {/* Arrow pointing down */}
              <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-800"></div>
            </div>
          </div>
        )}
      </div>
      
      <div className="text-xs text-gray-500">
        Normal: {normalRange} {unit}
      </div>
    </div>
  );
}

// SUPERVISOR DASHBOARD - COMPREHENSIVE VIEW
function SupervisorDashboard() {
  const { user, logout } = useContext(AuthContext);
  const [activeTab, setActiveTab] = useState('overview');
  const [employees, setEmployees] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(12);
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'table'
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [filters, setFilters] = useState({
    department: 'all',
    status: 'all',
    alertsOnly: false
  });
  const socketRef = useRef(null);

  useEffect(() => {
    loadSupervisorData();
    initializeSocket();
    
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  const initializeSocket = () => {
    socketRef.current = new AlertSocketManager();
    socketRef.current.connect(localStorage.getItem('token'));
    
    socketRef.current.on('vital-update', (data) => {
      setEmployees(prev => prev.map(emp => 
        emp.id === data.userId 
          ? { ...emp, latestVital: { ...emp.latestVital, ...data } }
          : emp
      ));
    });

    socketRef.current.on('alert', (alert) => {
      setAlerts(prev => [alert, ...prev]);
      if (alert.severity === 'critical' && soundEnabled) {
        // Audio handled by socket manager
      }
    });
  };

  const loadSupervisorData = async () => {
    setLoading(true);
    try {
      // Fetch real data from API
      const [vitalsData, alertsData, attendanceData] = await Promise.all([
        api.getAllVitals(),
        api.getAllAlerts(), 
        api.getAllAttendance()
      ]);

      console.log('Loaded real alerts:', alertsData);

      // Transform vitals data into employee format
      const employeesMap = new Map();
      
      // Process vitals data
      if (vitalsData.vitals) {
        vitalsData.vitals.forEach(vital => {
          if (!employeesMap.has(vital.user_id)) {
            employeesMap.set(vital.user_id, {
              id: vital.user_id.toString(),
              name: vital.user_name || `Employee ${vital.user_id}`,
              department: vital.department || 'Operations',
              position: 'Worker',
              deviceId: vital.device_serial || `DEV${vital.device_id}`,
              shift: 'Morning',
              employeeId: `EMP${String(vital.user_id).padStart(4, '0')}`,
              latestVital: {
                heart_rate: vital.heart_rate,
                spo2: vital.spo2,
                temperature: vital.temperature,
                latitude: vital.latitude,
                longitude: vital.longitude,
                timestamp: new Date(vital.timestamp),
                accuracy: vital.gps_accuracy || 5
              },
              status: 'online',
              lastSeen: new Date(vital.timestamp)
            });
          }
        });
      }

      // Determine employee status based on vitals and alerts
      const employeesArray = Array.from(employeesMap.values());
      const criticalUserIds = new Set();
      const warningUserIds = new Set();

      if (alertsData.alerts) {
        alertsData.alerts.forEach(alert => {
          if (!alert.acknowledged) {
            if (alert.severity === 'critical') {
              criticalUserIds.add(alert.user_id);
            } else if (alert.severity === 'high' || alert.severity === 'medium') {
              warningUserIds.add(alert.user_id);
            }
          }
        });
      }

      // Update employee status based on alerts
      employeesArray.forEach(emp => {
        const empId = parseInt(emp.id);
        if (criticalUserIds.has(empId)) {
          emp.status = 'critical';
        } else if (warningUserIds.has(empId)) {
          emp.status = 'warning';
        } else {
          emp.status = 'online';
        }
      });

      setEmployees(employeesArray);
      setAlerts(alertsData.alerts || []);
    } catch (error) {
      console.error('Failed to load supervisor data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAcknowledgeAlert = async (alertId) => {
    try {
      setAlerts(prev => prev.map(alert => 
        alert.id === alertId ? { ...alert, acknowledged: true } : alert
      ));
    } catch (error) {
      console.error('Failed to acknowledge alert:', error);
    }
  };

  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => {
      // Search filter
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        const matchesSearch = 
          emp.name.toLowerCase().includes(search) ||
          emp.department.toLowerCase().includes(search) ||
          emp.position.toLowerCase().includes(search) ||
          emp.employeeId.toLowerCase().includes(search);
        if (!matchesSearch) return false;
      }
      
      // Department filter
      if (filters.department !== 'all' && emp.department !== filters.department) return false;
      
      // Status filter
      if (filters.status !== 'all' && emp.status !== filters.status) return false;
      
      // Alerts only filter
      if (filters.alertsOnly && emp.status === 'online') return false;
      
      return true;
    });
  }, [employees, filters, searchTerm]);

  // Pagination
  const totalPages = Math.ceil(filteredEmployees.length / itemsPerPage);
  const paginatedEmployees = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredEmployees.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredEmployees, currentPage, itemsPerPage]);

  const stats = useMemo(() => ({
    totalEmployees: employees.length,
    onlineEmployees: employees.filter(e => e.status === 'online').length,
    criticalAlerts: alerts.filter(a => a.severity === 'critical' && !a.acknowledged).length,
    warningEmployees: employees.filter(e => e.status === 'warning').length
  }), [employees, alerts]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center py-4 space-y-2 sm:space-y-0">
            <div className="flex items-center">
              <Shield className="h-8 w-8 text-blue-600 mr-3" />
              <div>
                <h1 className="text-xl font-bold text-gray-900">Supervisor Dashboard</h1>
                <p className="text-sm text-gray-600">Real-time Employee Monitoring</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setSoundEnabled(!soundEnabled)}
                className={`p-2 rounded-lg transition-colors ${
                  soundEnabled ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-gray-100 text-gray-600 border border-gray-200'
                }`}
              >
                {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              </button>
              <div className="text-right">
                <div className="text-sm font-medium text-gray-900">{user?.name}</div>
                <div className="text-xs text-gray-500">Supervisor</div>
              </div>
              <button
                onClick={logout}
                className="flex items-center px-3 py-2 bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-8 overflow-x-auto">
            {[
              { id: 'overview', label: 'Employees', icon: Users },
              { id: 'map', label: 'Live Map', icon: MapIcon },
              { id: 'attendance', label: 'Attendance', icon: Calendar },
              { id: 'alerts', label: 'Alerts', icon: Bell, badge: alerts.filter(a => !a.acknowledged).length }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap flex items-center transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <tab.icon className="h-4 w-4 mr-2" />
                {tab.label}
                {tab.badge > 0 && (
                  <span className="ml-2 px-2 py-1 text-xs bg-red-500 text-white rounded-full animate-pulse">
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        ) : (
          <>
            {/* Overview Tab */}
            {activeTab === 'overview' && (
              <ModernOverviewTab 
                stats={stats} 
                employees={paginatedEmployees}
                allEmployees={filteredEmployees}
                alerts={alerts}
                filters={filters}
                setFilters={setFilters}
                searchTerm={searchTerm}
                setSearchTerm={setSearchTerm}
                currentPage={currentPage}
                setCurrentPage={setCurrentPage}
                totalPages={totalPages}
                viewMode={viewMode}
                setViewMode={setViewMode}
                onAcknowledgeAlert={handleAcknowledgeAlert}
                onEmployeeClick={setSelectedEmployee}
                setActiveTab={setActiveTab}
              />
            )}

            {/* Map Tab */}
            {activeTab === 'map' && (
              <MapTab employees={employees} />
            )}

            {/* Attendance Tab */}
            {activeTab === 'attendance' && (
              <AttendanceTab employees={employees} />
            )}

            {/* Alerts Tab */}
            {activeTab === 'alerts' && (
              <AlertsTab alerts={alerts} onAcknowledgeAlert={handleAcknowledgeAlert} />
            )}
          </>
        )}
      </main>

      {/* Employee Detail Modal */}
      {selectedEmployee && (
        <EmployeeDetailModal 
          employee={selectedEmployee}
          onClose={() => setSelectedEmployee(null)}
        />
      )}
    </div>
  );
}

// Modern Overview Tab Component for Large Scale
function ModernOverviewTab({ 
  stats, employees, allEmployees, alerts, filters, setFilters, 
  searchTerm, setSearchTerm, currentPage, setCurrentPage, totalPages,
  viewMode, setViewMode, onAcknowledgeAlert, onEmployeeClick, setActiveTab 
}) {
  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <ModernStatCard
          title="Total Employees"
          value={stats.totalEmployees}
          icon={Users}
          color="blue"
          subtitle={`${allEmployees.length} filtered`}
        />
        <ModernStatCard
          title="Online Now"
          value={stats.onlineEmployees}
          icon={Zap}
          color="green"
          pulse={true}
          subtitle="Active monitoring"
        />
        <ModernStatCard
          title="Need Attention"
          value={stats.warningEmployees}
          icon={AlertCircle}
          color="orange"
          subtitle="Warning status"
        />
        <ModernStatCard
          title="Critical Alerts"
          value={stats.criticalAlerts}
          icon={AlertTriangle}
          color="red"
          pulse={stats.criticalAlerts > 0}
          subtitle="Immediate action"
          onClick={() => setActiveTab('alerts')}
          clickable={true}
        />
      </div>

      {/* Employee Display with Integrated Search */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Employee Directory ({allEmployees.length} of {stats.totalEmployees})
            </h2>
            <div className="text-sm text-gray-500">
              Page {currentPage} of {totalPages}
            </div>
          </div>
          
          {/* Integrated Search and Controls */}
          <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
            {/* Search Bar */}
            <div className="flex-1 max-w-md">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search employees, departments, IDs..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                />
                <Eye className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              </div>
            </div>

            {/* Filters and View Controls */}
            <div className="flex flex-wrap gap-3 items-center">
              <ModernFilterDropdown
                label="Department"
                value={filters.department}
                onChange={(value) => setFilters(prev => ({ ...prev, department: value }))}
                options={[
                  { value: 'all', label: 'All Departments' },
                  { value: 'Manufacturing', label: 'Manufacturing' },
                  { value: 'Warehouse', label: 'Warehouse' },
                  { value: 'Quality Control', label: 'Quality Control' },
                  { value: 'Logistics', label: 'Logistics' },
                  { value: 'Maintenance', label: 'Maintenance' },
                  { value: 'Security', label: 'Security' }
                ]}
              />
              
              <ModernFilterDropdown
                label="Status"
                value={filters.status}
                onChange={(value) => setFilters(prev => ({ ...prev, status: value }))}
                options={[
                  { value: 'all', label: 'All Status' },
                  { value: 'online', label: 'Online' },
                  { value: 'warning', label: 'Warning' },
                  { value: 'critical', label: 'Critical' }
                ]}
              />

              <button
                onClick={() => setFilters(prev => ({ ...prev, alertsOnly: !prev.alertsOnly }))}
                className={`px-4 py-2 rounded-lg border transition-colors text-sm font-medium ${
                  filters.alertsOnly 
                    ? 'bg-orange-100 text-orange-800 border-orange-200' 
                    : 'bg-gray-50 text-gray-700 border-gray-300 hover:bg-gray-100'
                }`}
              >
                Alerts Only
              </button>

              {/* View Mode Toggle */}
              <div className="flex bg-gray-50 rounded-lg border border-gray-300 overflow-hidden">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`px-3 py-2 transition-colors ${viewMode === 'grid' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                >
                  <Monitor className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setViewMode('table')}
                  className={`px-3 py-2 transition-colors ${viewMode === 'table' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                >
                  <Filter className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 p-2">
            {employees.map(employee => (
              <ModernEmployeeCard 
                key={employee.id} 
                employee={employee} 
                onClick={onEmployeeClick}
              />
            ))}
          </div>
        ) : (
          <ModernEmployeeTable employees={employees} onEmployeeClick={onEmployeeClick} />
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <ModernPagination 
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
        />
      )}

      {/* Critical Alerts Summary - Only show if there are critical alerts */}
      {alerts.filter(a => a.severity === 'critical' && !a.acknowledged).length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-red-900 flex items-center">
              <AlertTriangle className="h-5 w-5 mr-2 animate-pulse" />
              {alerts.filter(a => a.severity === 'critical' && !a.acknowledged).length} Critical Alert{alerts.filter(a => a.severity === 'critical' && !a.acknowledged).length > 1 ? 's' : ''} Require Immediate Attention
            </h3>
            <button
              onClick={() => setActiveTab('alerts')}
              className="text-sm bg-red-600 text-white px-3 py-1 rounded-lg hover:bg-red-700 transition-colors"
            >
              View All
            </button>
          </div>
          <div className="text-sm text-red-800">
            {alerts.filter(a => a.severity === 'critical' && !a.acknowledged).slice(0, 2).map(alert => (
              <div key={alert.id} className="mb-1">
                • {alert.user_name}: {alert.message}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Original Overview Tab Component (keeping for reference)
function OverviewTab({ stats, employees, alerts, filters, setFilters, onAcknowledgeAlert }) {
  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Employees"
          value={stats.totalEmployees}
          icon={Users}
          color="blue"
        />
        <StatCard
          title="Online Now"
          value={stats.onlineEmployees}
          icon={Zap}
          color="green"
          pulse={true}
        />
        <StatCard
          title="Need Attention"
          value={stats.warningEmployees}
          icon={AlertCircle}
          color="orange"
        />
        <StatCard
          title="Critical Alerts"
          value={stats.criticalAlerts}
          icon={AlertTriangle}
          color="red"
          pulse={stats.criticalAlerts > 0}
        />
      </div>

      {/* Filters */}
      <FilterPanel filters={filters} setFilters={setFilters} />

      {/* Employee Grid */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="p-6 border-b">
          <h2 className="text-lg font-semibold">Live Employee Monitoring</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-1">
          {employees.map(employee => (
            <EmployeeCard key={employee.id} employee={employee} />
          ))}
        </div>
      </div>

      {/* Recent Critical Alerts */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-lg font-semibold mb-4">Critical Alerts Requiring Attention</h2>
        <div className="space-y-3">
          {alerts.filter(a => a.severity === 'critical' && !a.acknowledged).slice(0, 3).map(alert => (
            <CriticalAlertItem key={alert.id} alert={alert} onAcknowledge={onAcknowledgeAlert} />
          ))}
        </div>
      </div>
    </div>
  );
}


// Modern Component Variants

// Modern Stat Card with Clean Design
function ModernStatCard({ title, value, icon: Icon, color, pulse = false, subtitle, onClick, clickable = false }) {
  const colorClasses = {
    blue: 'text-blue-600 bg-blue-50 border-blue-200',
    green: 'text-green-600 bg-green-50 border-green-200',
    orange: 'text-orange-600 bg-orange-50 border-orange-200',
    red: 'text-red-600 bg-red-50 border-red-200'
  };

  const baseClasses = "bg-white rounded-xl shadow-sm border border-gray-200 p-6 transition-all";
  const interactiveClasses = clickable ? "hover:shadow-md hover:border-blue-300 cursor-pointer transform hover:scale-105" : "hover:shadow-md";

  return (
    <div 
      className={`${baseClasses} ${interactiveClasses}`}
      onClick={clickable ? onClick : undefined}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600 mb-1">{title}</p>
          <p className={`text-3xl font-bold text-gray-900 ${pulse ? 'animate-pulse' : ''}`}>
            {value}
          </p>
          {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
        </div>
        <div className={`p-3 rounded-xl border ${colorClasses[color]} ${pulse ? 'animate-pulse' : ''}`}>
          <Icon className="h-6 w-6" />
        </div>
      </div>
    </div>
  );
}

// Modern Filter Dropdown
function ModernFilterDropdown({ label, value, onChange, options }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none px-4 py-2 pr-10 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all shadow-sm cursor-pointer min-w-[140px]"
      >
        {options.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {/* Custom dropdown arrow */}
      <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </div>
  );
}

// Vital Value Component with Hover Tooltip
function VitalValue({ value, unit, label, icon: Icon, isNormal, showOriginal = true }) {
  const [showTooltip, setShowTooltip] = useState(false);
  
  if (!value && value !== 0) return <span className="text-gray-400">--</span>;
  
  const displayValue = unit === '°C' ? value.toFixed(1) : Math.round(value);
  
  return (
    <span 
      className={`relative cursor-help transition-all duration-200 hover:scale-105 ${
        isNormal ? 'text-gray-900' : 'text-red-600'
      }`}
      onMouseEnter={() => {
        console.log('VitalValue mouse entered for:', label, value);
        setShowTooltip(true);
      }}
      onMouseLeave={() => {
        console.log('VitalValue mouse left for:', label);
        setShowTooltip(false);
      }}
      title={showOriginal ? `Original: ${value.toFixed(6)} ${unit}` : undefined}
    >
      {displayValue}
      
      {/* Tooltip */}
      {showTooltip && showOriginal && (
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 z-50">
          <div className="bg-gray-900 text-white text-xs rounded-lg py-2 px-3 whitespace-nowrap shadow-xl border border-gray-700">
            <div className="font-semibold text-center">{label}</div>
            <div className="text-yellow-300 text-center">{value.toFixed(6)} {unit}</div>
            <div className="text-gray-300 text-center mt-1">Rounded: {displayValue} {unit}</div>
            {/* Arrow */}
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
          </div>
        </div>
      )}
    </span>
  );
}

// Modern Employee Card
function ModernEmployeeCard({ employee, onClick }) {
  const vital = employee.latestVital;
  const isOnline = vital?.timestamp && new Date() - new Date(vital.timestamp) < 300000; // 5 minutes
  
  return (
    <div 
      onClick={() => onClick(employee)}
      className="m-2 p-4 bg-white rounded-lg border border-gray-300 shadow-sm hover:shadow-md hover:border-blue-300 transition-all cursor-pointer"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 truncate">{employee.name}</h3>
          <p className="text-sm text-gray-600 truncate">{employee.department} • {employee.position}</p>
          <p className="text-xs text-gray-500">{employee.employeeId} • {employee.shift} Shift</p>
        </div>
        <div className="flex items-center space-x-2 ml-3">
          <div className={`px-2 py-1 text-xs rounded-full font-medium ${
            employee.status === 'critical' ? 'bg-red-100 text-red-800 border border-red-300' :
            employee.status === 'warning' ? 'bg-orange-100 text-orange-800 border border-orange-300' :
            'bg-green-100 text-green-800 border border-green-300'
          }`}>
            {employee.status.toUpperCase()}
          </div>
          <div className={`h-3 w-3 rounded-full border-2 border-white shadow-sm ${
            isOnline ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
          }`} />
        </div>
      </div>
      
      <div className="grid grid-cols-3 gap-3">
        <div className="text-center bg-gray-50 rounded-lg p-2">
          <div className="flex items-center justify-center mb-1">
            <Heart className="h-3 w-3 text-red-500 mr-1" />
            <span className="text-sm font-semibold">
              <VitalValue 
                value={vital?.heart_rate} 
                unit="bpm" 
                label="Heart Rate"
                isNormal={vital?.heart_rate <= 100}
              />
            </span>
          </div>
          <div className="text-xs text-gray-500">bpm</div>
        </div>
        
        <div className="text-center bg-gray-50 rounded-lg p-2">
          <div className="flex items-center justify-center mb-1">
            <Activity className="h-3 w-3 text-blue-500 mr-1" />
            <span className="text-sm font-semibold">
              <VitalValue 
                value={vital?.spo2} 
                unit="%" 
                label="SpO2"
                isNormal={vital?.spo2 >= 95}
              />
            </span>
          </div>
          <div className="text-xs text-gray-500">%</div>
        </div>
        
        <div className="text-center bg-gray-50 rounded-lg p-2">
          <div className="flex items-center justify-center mb-1">
            <Thermometer className="h-3 w-3 text-orange-500 mr-1" />
            <span className="text-sm font-semibold">
              <VitalValue 
                value={vital?.temperature} 
                unit="°C" 
                label="Temperature"
                isNormal={vital?.temperature <= 37.5}
              />
            </span>
          </div>
          <div className="text-xs text-gray-500">°C</div>
        </div>
      </div>
      
      {vital?.timestamp && (
        <div className="mt-3 text-xs text-gray-500 text-center bg-blue-50 rounded px-2 py-1">
          Last: {new Date(vital.timestamp).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}

// Modern Employee Table
function ModernEmployeeTable({ employees, onEmployeeClick }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Employee</th>
            <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Department</th>
            <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
            <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vitals</th>
            <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Seen</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {employees.map(employee => {
            const vital = employee.latestVital;
            const isOnline = vital?.timestamp && new Date() - new Date(vital.timestamp) < 300000;
            
            return (
              <tr 
                key={employee.id} 
                onClick={() => onEmployeeClick(employee)}
                className="hover:bg-blue-50 transition-colors cursor-pointer"
              >
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className={`h-3 w-3 rounded-full mr-3 ${
                      isOnline ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
                    }`} />
                    <div>
                      <div className="text-sm font-medium text-gray-900">{employee.name}</div>
                      <div className="text-sm text-gray-500">{employee.employeeId}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">{employee.department}</div>
                  <div className="text-sm text-gray-500">{employee.position}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 text-xs rounded-full font-medium ${
                    employee.status === 'critical' ? 'bg-red-100 text-red-800 border border-red-200' :
                    employee.status === 'warning' ? 'bg-orange-100 text-orange-800 border border-orange-200' :
                    'bg-green-100 text-green-800 border border-green-200'
                  }`}>
                    {employee.status.toUpperCase()}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex space-x-4 text-sm">
                    <span className={`flex items-center ${vital?.heart_rate > 100 ? 'text-red-600' : 'text-gray-900'}`}>
                      <Heart className="h-3 w-3 mr-1" /> {vital?.heart_rate || '--'}
                    </span>
                    <span className={`flex items-center ${vital?.spo2 < 95 ? 'text-red-600' : 'text-gray-900'}`}>
                      <Activity className="h-3 w-3 mr-1" /> {vital?.spo2 || '--'}%
                    </span>
                    <span className={`flex items-center ${vital?.temperature > 37.5 ? 'text-red-600' : 'text-gray-900'}`}>
                      <Thermometer className="h-3 w-3 mr-1" /> {vital?.temperature ? vital.temperature.toFixed(1) : '--'}°C
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {vital?.timestamp ? new Date(vital.timestamp).toLocaleTimeString() : 'Never'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Modern Pagination
function ModernPagination({ currentPage, totalPages, onPageChange }) {
  const pages = [];
  const showPages = 5;
  let startPage = Math.max(1, currentPage - Math.floor(showPages / 2));
  let endPage = Math.min(totalPages, startPage + showPages - 1);
  
  if (endPage - startPage + 1 < showPages) {
    startPage = Math.max(1, endPage - showPages + 1);
  }
  
  for (let i = startPage; i <= endPage; i++) {
    pages.push(i);
  }

  return (
    <div className="flex items-center justify-center space-x-2">
      <button
        onClick={() => onPageChange(Math.max(1, currentPage - 1))}
        disabled={currentPage === 1}
        className="px-3 py-2 rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
      >
        ←
      </button>
      
      {startPage > 1 && (
        <>
          <button
            onClick={() => onPageChange(1)}
            className="px-3 py-2 rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
          >
            1
          </button>
          {startPage > 2 && <span className="text-gray-500">...</span>}
        </>
      )}
      
      {pages.map(page => (
        <button
          key={page}
          onClick={() => onPageChange(page)}
          className={`px-3 py-2 rounded-lg border transition-colors shadow-sm ${
            currentPage === page
              ? 'bg-blue-600 border-blue-600 text-white'
              : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
          }`}
        >
          {page}
        </button>
      ))}
      
      {endPage < totalPages && (
        <>
          {endPage < totalPages - 1 && <span className="text-gray-500">...</span>}
          <button
            onClick={() => onPageChange(totalPages)}
            className="px-3 py-2 rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
          >
            {totalPages}
          </button>
        </>
      )}
      
      <button
        onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
        disabled={currentPage === totalPages}
        className="px-3 py-2 rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
      >
        →
      </button>
    </div>
  );
}

// Modern Critical Alert
function ModernCriticalAlert({ alert, onAcknowledge }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-start">
          <AlertTriangle className="h-5 w-5 text-red-600 mr-3 flex-shrink-0 mt-0.5 animate-pulse" />
          <div>
            <h4 className="font-semibold text-red-900">{alert.user_name}</h4>
            <p className="text-sm text-red-800 mt-1">{alert.message}</p>
            <p className="text-xs text-red-600 mt-2">
              {new Date(alert.timestamp).toLocaleString()}
            </p>
          </div>
        </div>
        <button
          onClick={() => onAcknowledge(alert.id)}
          className="ml-4 px-3 py-1 bg-red-600 text-white border border-red-600 rounded-lg text-sm hover:bg-red-700 transition-colors animate-pulse shadow-sm"
        >
          Acknowledge
        </button>
      </div>
    </div>
  );
}

// Attendance Tab Component
function AttendanceTab({ employees }) {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [attendanceData, setAttendanceData] = useState({});
  const [bulkAction, setBulkAction] = useState('');

  // Generate automatic attendance data based on vitals
  useEffect(() => {
    const mockData = {};
    employees.forEach(employee => {
      const vital = employee.latestVital;
      const hasVitalData = vital && vital.timestamp;
      
      // Calculate check-in time (first vital of the day - simulated)
      const checkInTime = hasVitalData ? 
        new Date(vital.timestamp).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }) : null;
      
      // Calculate check-out time (if no recent vitals, assume checked out)
      const lastVitalTime = hasVitalData ? new Date(vital.timestamp) : null;
      const isRecentVital = lastVitalTime && (Date.now() - lastVitalTime.getTime()) < 300000; // 5 minutes
      const checkOutTime = hasVitalData && !isRecentVital ? 
        new Date(lastVitalTime.getTime() + 300000).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }) : null;
      
      mockData[employee.id] = {
        checkIn: checkInTime,
        checkOut: checkOutTime,
        status: hasVitalData && isRecentVital ? 'present' : hasVitalData ? 'checked_out' : 'absent',
        shift: employee.shift || 'Morning',
        department: employee.department,
        lastVitalTime: lastVitalTime
      };
    });
    setAttendanceData(mockData);
  }, [employees, selectedDate]);

  // Automatic attendance tracking - no manual intervention needed
  const getStatusDisplay = (status) => {
    switch(status) {
      case 'present': return { text: 'Present', color: 'green' };
      case 'checked_out': return { text: 'Checked Out', color: 'blue' };
      case 'absent': return { text: 'Absent', color: 'red' };
      default: return { text: 'Unknown', color: 'gray' };
    }
  };

  const presentCount = Object.values(attendanceData).filter(data => data.status === 'present').length;
  const checkedOutCount = Object.values(attendanceData).filter(data => data.status === 'checked_out').length;
  const absentCount = Object.values(attendanceData).filter(data => data.status === 'absent').length;
  const onTimeCount = Object.values(attendanceData).filter(data => 
    (data.status === 'present' || data.status === 'checked_out') && data.checkIn && data.checkIn <= '09:00'
  ).length;

  return (
    <div className="space-y-6">
      {/* Attendance Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Present Today</p>
              <p className="text-3xl font-bold text-green-600">{presentCount}</p>
              <p className="text-xs text-gray-500 mt-1">Active employees</p>
            </div>
            <div className="p-3 rounded-xl bg-green-50 border border-green-200">
              <UserCheck className="h-6 w-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Checked Out</p>
              <p className="text-3xl font-bold text-blue-600">{checkedOutCount}</p>
              <p className="text-xs text-gray-500 mt-1">Completed shifts</p>
            </div>
            <div className="p-3 rounded-xl bg-blue-50 border border-blue-200">
              <Clock className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Absent Today</p>
              <p className="text-3xl font-bold text-red-600">{absentCount}</p>
              <p className="text-xs text-gray-500 mt-1">No vitals received</p>
            </div>
            <div className="p-3 rounded-xl bg-red-50 border border-red-200">
              <AlertCircle className="h-6 w-6 text-red-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">On Time</p>
              <p className="text-3xl font-bold text-blue-600">{onTimeCount}</p>
              <p className="text-xs text-gray-500 mt-1">Checked in by 9:00 AM</p>
            </div>
            <div className="p-3 rounded-xl bg-blue-50 border border-blue-200">
              <Clock className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Attendance Rate</p>
              <p className="text-3xl font-bold text-purple-600">{((presentCount / employees.length) * 100).toFixed(0)}%</p>
              <p className="text-xs text-gray-500 mt-1">Overall rate</p>
            </div>
            <div className="p-3 rounded-xl bg-purple-50 border border-purple-200">
              <Calendar className="h-6 w-6 text-purple-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Attendance Information */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Automatic Attendance Tracking</h2>
            <p className="text-sm text-gray-600 mt-1">Attendance is automatically tracked based on vital signs data reception</p>
          </div>
          
          <div className="flex flex-wrap gap-3 items-center">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="bg-gray-50 px-3 py-2 rounded-lg text-sm text-gray-600">
              Real-time tracking via IoT devices
            </div>
          </div>
        </div>
      </div>

      {/* Attendance Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Employee</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Check In</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Check Out</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Shift</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Vital</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {employees.map(employee => {
                const attendance = attendanceData[employee.id] || {};
                
                return (
                  <tr key={employee.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className={`h-3 w-3 rounded-full mr-3 ${
                          attendance.status === 'present' ? 'bg-green-500' : 
                          attendance.status === 'checked_out' ? 'bg-blue-500' : 'bg-red-500'
                        }`} />
                        <div>
                          <div className="text-sm font-medium text-gray-900">{employee.name}</div>
                          <div className="text-sm text-gray-500">{employee.department}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs rounded-full font-medium ${
                        attendance.status === 'present' ? 'bg-green-100 text-green-800 border border-green-200' :
                        attendance.status === 'checked_out' ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                        'bg-red-100 text-red-800 border border-red-200'
                      }`}>
                        {getStatusDisplay(attendance.status).text}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {attendance.checkIn || '--:--'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {attendance.checkOut || '--:--'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {attendance.shift}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {attendance.lastVitalTime ? (
                        <div className="text-xs">
                          <div>{attendance.lastVitalTime.toLocaleTimeString()}</div>
                          <div className="text-gray-400">
                            {Math.round((Date.now() - attendance.lastVitalTime.getTime()) / 60000)}m ago
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-400">No data</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// Employee Detail Modal
function EmployeeDetailModal({ employee, onClose }) {
  const [activeTab, setActiveTab] = useState('overview');
  const vital = employee.latestVital;
  const isOnline = vital?.timestamp && new Date() - new Date(vital.timestamp) < 300000;

  // Generate mock historical data for the employee
  const historicalVitals = useMemo(() => {
    return Array.from({ length: 24 }, (_, i) => ({
      time: new Date(Date.now() - (23 - i) * 60 * 60 * 1000),
      heart_rate: vital?.heart_rate ? vital.heart_rate + Math.sin(i / 4) * 5 + (Math.random() - 0.5) * 10 : 70 + Math.sin(i / 4) * 5,
      spo2: vital?.spo2 ? vital.spo2 + (Math.random() - 0.5) * 2 : 97 + (Math.random() - 0.5) * 2,
      temperature: vital?.temperature ? vital.temperature + (Math.random() - 0.5) * 0.5 : 36.5 + (Math.random() - 0.5) * 0.8
    }));
  }, [employee.id, vital]);

  const mockAttendance = {
    check_in_time: new Date().setHours(8, 30, 0, 0),
    status: 'present',
    date: new Date().toDateString()
  };

  const mockAlerts = [
    {
      id: '1',
      type: 'heart_rate_elevated',
      severity: 'medium',
      message: `Heart rate ${vital?.heart_rate || 85} bpm elevated above normal range`,
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
      acknowledged: true
    }
  ];

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center">
            <div className={`h-4 w-4 rounded-full mr-3 ${
              isOnline ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
            }`} />
            <div>
              <h2 className="text-xl font-bold text-gray-900">{employee.name}</h2>
              <p className="text-sm text-gray-600">{employee.department} • {employee.position}</p>
              <p className="text-xs text-gray-500">{employee.employeeId} • {employee.shift} Shift</p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <div className={`px-3 py-1 text-sm rounded-full font-medium ${
              employee.status === 'critical' ? 'bg-red-100 text-red-800 border border-red-200' :
              employee.status === 'warning' ? 'bg-orange-100 text-orange-800 border border-orange-200' :
              'bg-green-100 text-green-800 border border-green-200'
            }`}>
              {employee.status.toUpperCase()}
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <EyeOff className="h-5 w-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="border-b border-gray-200 bg-white">
          <nav className="flex space-x-8 px-6">
            {[
              { id: 'overview', label: 'Overview', icon: Home },
              { id: 'vitals', label: 'Vital Signs', icon: Heart },
              { id: 'location', label: 'Live Location', icon: MapPin },
              { id: 'alerts', label: 'Alerts', icon: AlertTriangle }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap flex items-center transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <tab.icon className="h-4 w-4 mr-2" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[60vh] p-6">
          {activeTab === 'overview' && (
            <EmployeeOverviewTab 
              employee={employee}
              vital={vital}
              attendance={mockAttendance}
              alerts={mockAlerts}
            />
          )}
          
          {activeTab === 'vitals' && (
            <EmployeeVitalsTab 
              employee={employee}
              vitals={historicalVitals}
              currentVital={vital}
            />
          )}
          
          {activeTab === 'location' && (
            <EmployeeLocationTab 
              employee={employee}
              vital={vital}
            />
          )}
          
          {activeTab === 'alerts' && (
            <EmployeeAlertsTab 
              employee={employee}
              alerts={mockAlerts}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// Employee Overview Tab
function EmployeeOverviewTab({ employee, vital, attendance, alerts }) {
  return (
    <div className="space-y-6">
      {/* Current Status */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gray-50 rounded-xl p-4">
          <h3 className="font-semibold text-gray-900 mb-3">Current Vitals</h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-600">Heart Rate:</span>
              <span className={`font-semibold ${vital?.heart_rate > 100 ? 'text-red-600' : 'text-green-600'}`}>
                {vital?.heart_rate || '--'} bpm
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">SpO2:</span>
              <span className={`font-semibold ${vital?.spo2 < 95 ? 'text-red-600' : 'text-green-600'}`}>
                {vital?.spo2 || '--'}%
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Temperature:</span>
              <span className={`font-semibold ${vital?.temperature > 37.5 ? 'text-red-600' : 'text-green-600'}`}>
                {vital?.temperature ? vital.temperature.toFixed(1) : '--'}°C
              </span>
            </div>
          </div>
        </div>

        <div className="bg-gray-50 rounded-xl p-4">
          <h3 className="font-semibold text-gray-900 mb-3">Today's Attendance</h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-600">Check In:</span>
              <span className="font-semibold text-green-600">
                {attendance?.check_in_time ? new Date(attendance.check_in_time).toLocaleTimeString() : '--:--'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Status:</span>
              <span className="font-semibold text-blue-600">
                {attendance?.status === 'present' ? 'Present' : 'Active'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Hours Today:</span>
              <span className="font-semibold text-purple-600">
                {attendance?.check_in_time ? 
                  Math.round((Date.now() - attendance.check_in_time) / (1000 * 60 * 60) * 10) / 10 : 0}h
              </span>
            </div>
          </div>
        </div>

        <div className="bg-gray-50 rounded-xl p-4">
          <h3 className="font-semibold text-gray-900 mb-3">Recent Activity</h3>
          <div className="space-y-2">
            <div className="text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Last Update:</span>
                <span className="font-semibold">
                  {vital?.timestamp ? new Date(vital.timestamp).toLocaleTimeString() : 'Never'}
                </span>
              </div>
            </div>
            <div className="text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">GPS Accuracy:</span>
                <span className="font-semibold">±{vital?.accuracy || 0}m</span>
              </div>
            </div>
            <div className="text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Active Alerts:</span>
                <span className={`font-semibold ${alerts.filter(a => !a.acknowledged).length > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {alerts.filter(a => !a.acknowledged).length}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Alerts */}
      <div className="bg-gray-50 rounded-xl p-4">
        <h3 className="font-semibold text-gray-900 mb-3">Recent Alerts</h3>
        {alerts.length > 0 ? alerts.map(alert => (
          <div key={alert.id} className={`p-3 rounded-lg border-l-4 mb-2 ${
            alert.severity === 'critical' ? 'bg-red-50 border-red-500' :
            alert.severity === 'high' ? 'bg-orange-50 border-orange-500' :
            'bg-yellow-50 border-yellow-500'
          }`}>
            <div className="flex justify-between items-start">
              <div>
                <h4 className="font-medium text-gray-900">{alert.type.replace(/_/g, ' ').toUpperCase()}</h4>
                <p className="text-sm text-gray-600 mt-1">{alert.message}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {new Date(alert.timestamp).toLocaleString()}
                </p>
              </div>
              {alert.acknowledged && (
                <CheckCircle className="h-5 w-5 text-green-600" />
              )}
            </div>
          </div>
        )) : (
          <div className="text-center py-4 text-gray-500">
            <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
            <p>No recent alerts</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Employee Vitals Tab
function EmployeeVitalsTab({ employee, vitals, currentVital }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <VitalChart
          title="Heart Rate"
          data={vitals}
          dataKey="heart_rate"
          unit="bpm"
          color="#ef4444"
          icon={Heart}
          normalRange="60-100"
          currentValue={currentVital?.heart_rate}
        />
        <VitalChart
          title="SpO2"
          data={vitals}
          dataKey="spo2"
          unit="%"
          color="#3b82f6"
          icon={Activity}
          normalRange="95-100"
          currentValue={currentVital?.spo2}
        />
        <VitalChart
          title="Temperature"
          data={vitals}
          dataKey="temperature"
          unit="°C"
          color="#f59e0b"
          icon={Thermometer}
          normalRange="36.1-37.2"
          currentValue={currentVital?.temperature}
        />
      </div>
    </div>
  );
}

// Employee Location Tab
function EmployeeLocationTab({ employee, vital }) {
  useEffect(() => {
    if (vital?.latitude && vital?.longitude) {
      const loadMap = async () => {
        if (typeof window !== 'undefined') {
          const L = await import('leaflet');
          
          const container = document.getElementById('employee-map');
          if (container && !container._leaflet_id) {
            const map = L.map('employee-map').setView([vital.latitude, vital.longitude], 15);
            
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
              attribution: '© OpenStreetMap contributors'
            }).addTo(map);

            // Add employee marker
            const marker = L.marker([vital.latitude, vital.longitude]).addTo(map);
            
            const popupContent = `
              <div class="p-2">
                <h3 class="font-semibold">${employee.name}</h3>
                <p class="text-sm text-gray-600">${employee.department}</p>
                <div class="mt-2 space-y-1 text-sm">
                  <div>Heart Rate: <span class="${vital.heart_rate > 100 ? 'text-red-600' : 'text-green-600'}">${vital.heart_rate} bpm</span></div>
                  <div>SpO2: <span class="${vital.spo2 < 95 ? 'text-red-600' : 'text-green-600'}">${vital.spo2}%</span></div>
                  <div>Temperature: <span class="${vital.temperature > 37.5 ? 'text-red-600' : 'text-green-600'}">${vital.temperature.toFixed(1)}°C</span></div>
                  <div class="text-xs text-gray-500 mt-2">
                    Accuracy: ±${vital.accuracy}m<br>
                    Last update: ${new Date(vital.timestamp).toLocaleString()}
                  </div>
                </div>
              </div>
            `;
            
            marker.bindPopup(popupContent).openPopup();
            
            // Color marker based on status
            const iconColor = employee.status === 'critical' ? 'red' : 
                            employee.status === 'warning' ? 'orange' : 'green';
            
            marker.setIcon(L.divIcon({
              className: 'custom-marker',
              html: `<div class="w-6 h-6 bg-${iconColor}-500 rounded-full border-4 border-white shadow-lg animate-pulse"></div>`,
              iconSize: [24, 24]
            }));
          }
        }
      };
      
      loadMap();
    }
  }, [employee, vital]);

  return (
    <div className="space-y-6">
      {/* Location Info */}
      <div className="bg-gray-50 rounded-xl p-4">
        <h3 className="font-semibold text-gray-900 mb-3">Current Location</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-gray-600">Coordinates:</span>
            <div className="font-mono text-sm">
              {vital?.latitude ? `${vital.latitude.toFixed(6)}, ${vital.longitude.toFixed(6)}` : 'No location data'}
            </div>
          </div>
          <div>
            <span className="text-gray-600">Accuracy:</span>
            <div className="font-semibold">±{vital?.accuracy || 0}m</div>
          </div>
        </div>
      </div>

      {/* Map Container */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">Live Location Map</h3>
        </div>
        <div id="employee-map" className="h-96 w-full"></div>
      </div>
    </div>
  );
}

// Employee Alerts Tab
function EmployeeAlertsTab({ employee, alerts }) {
  return (
    <div className="space-y-4">
      {alerts.length > 0 ? alerts.map(alert => (
        <div key={alert.id} className={`p-4 rounded-xl border-l-4 ${
          alert.severity === 'critical' ? 'bg-red-50 border-red-500' :
          alert.severity === 'high' ? 'bg-orange-50 border-orange-500' :
          'bg-yellow-50 border-yellow-500'
        }`}>
          <div className="flex items-start justify-between">
            <div className="flex items-start">
              <AlertTriangle className={`h-5 w-5 mr-3 flex-shrink-0 mt-0.5 ${
                alert.severity === 'critical' ? 'text-red-600' :
                alert.severity === 'high' ? 'text-orange-600' :
                'text-yellow-600'
              }`} />
              <div>
                <h4 className="font-semibold text-gray-900">{alert.type.replace(/_/g, ' ').toUpperCase()}</h4>
                <p className="text-sm text-gray-700 mt-1">{alert.message}</p>
                <p className="text-xs text-gray-500 mt-2">
                  {new Date(alert.timestamp).toLocaleString()}
                </p>
              </div>
            </div>
            {alert.acknowledged ? (
              <div className="flex items-center text-green-600">
                <CheckCircle className="h-5 w-5 mr-1" />
                <span className="text-sm">Acknowledged</span>
              </div>
            ) : (
              <span className="px-3 py-1 bg-red-100 text-red-800 text-xs rounded-full">
                Needs Attention
              </span>
            )}
          </div>
        </div>
      )) : (
        <div className="text-center py-8 text-gray-500">
          <CheckCircle className="h-12 w-12 mx-auto mb-2 text-green-500" />
          <p>No alerts for this employee</p>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    setTimeout(() => setAuthLoading(false), 1000);
  }, []);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Initializing IoT Monitoring System...</p>
        </div>
      </div>
    );
  }

  return (
    <AuthProvider>
      <AuthContext.Consumer>
        {({ user, loading }) => {
          if (loading) {
            return (
              <div className="min-h-screen flex items-center justify-center bg-gray-100">
                <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
              </div>
            );
          }
          
          if (!user) return <Login />;
          
          return user.role === 'supervisor' ? <SupervisorDashboard /> : <EmployeeDashboard />;
        }}
      </AuthContext.Consumer>
    </AuthProvider>
  );
}
