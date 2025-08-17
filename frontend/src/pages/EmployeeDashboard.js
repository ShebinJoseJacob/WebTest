import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import { 
  Heart, Activity, Thermometer, MapPin, AlertTriangle, 
  Bell, Calendar, Shield, LogOut, RefreshCw
} from 'lucide-react';

// API Configuration
const API_URL = process.env.REACT_APP_API_URL || 'https://iot-monitoring-backend-sgba.onrender.com/api';

class ApiService {
  constructor() {
    this.token = localStorage.getItem('token');
  }

  setToken(token) {
    this.token = token;
    localStorage.setItem('token', token);
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
      const error = await response.json();
      throw new Error(JSON.stringify(error));
    }

    return response.json();
  }

  async getMyVitalsHistory(timeRange = '24h') {
    const hoursMap = { '1h': 1, '6h': 6, '24h': 24, '7d': 168 };
    const hours = hoursMap[timeRange] || 24;
    return this.request(`/vitals/history?hours=${hours}`);
  }

  async getMyAlerts() {
    return this.request('/alerts');
  }

  async getMyAttendance() {
    return this.request('/attendance/today');
  }
}

const api = new ApiService();

// WebSocket Manager for real-time updates
class SocketManager {
  constructor() {
    this.socket = null;
    this.connected = false;
  }

  connect(token) {
    const socketUrl = process.env.REACT_APP_WS_URL || 'https://iot-monitoring-backend-sgba.onrender.com';
    
    this.socket = io(socketUrl, {
      auth: { token },
      transports: ['websocket', 'polling']
    });

    this.socket.on('connect', () => {
      this.connected = true;
      console.log('Employee Dashboard WebSocket connected');
    });

    this.socket.on('disconnect', () => {
      this.connected = false;
      console.log('Employee Dashboard WebSocket disconnected');
    });

    this.socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
    });
  }

  on(event, callback) {
    if (this.socket) {
      this.socket.on(event, callback);
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.connected = false;
    }
  }
}

const EmployeeDashboard = () => {
  const [dashboardData, setDashboardData] = useState({
    vitals: {
      history: [],
      isLoading: true,
      error: null,
    },
    alerts: {
      recent: [],
      isLoading: true,
      error: null,
    },
    attendance: {
      today: null,
      isLoading: true,
      error: null,
    },
  });

  const [selectedTimeRange, setSelectedTimeRange] = useState('24h');
  const socketRef = useRef(null);

  // Fetch dashboard data
  const fetchDashboardData = async () => {
    try {
      setDashboardData(prev => ({
        ...prev,
        vitals: { ...prev.vitals, isLoading: true },
        alerts: { ...prev.alerts, isLoading: true },
        attendance: { ...prev.attendance, isLoading: true },
      }));

      // Fetch all data in parallel
      const [vitalsResponse, alertsResponse, attendanceResponse] = await Promise.allSettled([
        api.getMyVitalsHistory(selectedTimeRange),
        api.getMyAlerts(),
        api.getMyAttendance(),
      ]);

      // Update vitals data
      if (vitalsResponse.status === 'fulfilled') {
        setDashboardData(prev => ({
          ...prev,
          vitals: {
            history: vitalsResponse.value.vitals || [],
            isLoading: false,
            error: null,
          },
        }));
      } else {
        setDashboardData(prev => ({
          ...prev,
          vitals: {
            ...prev.vitals,
            isLoading: false,
            error: 'Failed to fetch vitals',
          },
        }));
      }

      // Update alerts data
      if (alertsResponse.status === 'fulfilled') {
        setDashboardData(prev => ({
          ...prev,
          alerts: {
            recent: alertsResponse.value.alerts || [],
            isLoading: false,
            error: null,
          },
        }));
      } else {
        setDashboardData(prev => ({
          ...prev,
          alerts: {
            ...prev.alerts,
            isLoading: false,
            error: 'Failed to fetch alerts',
          },
        }));
      }

      // Update attendance data
      if (attendanceResponse.status === 'fulfilled') {
        setDashboardData(prev => ({
          ...prev,
          attendance: {
            today: attendanceResponse.value.attendance || null,
            isLoading: false,
            error: null,
          },
        }));
      } else {
        setDashboardData(prev => ({
          ...prev,
          attendance: {
            ...prev.attendance,
            isLoading: false,
            error: 'Failed to fetch attendance',
          },
        }));
      }

    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    }
  };

  // Initialize WebSocket for real-time updates
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      socketRef.current = new SocketManager();
      socketRef.current.connect(token);

      // Listen for real-time vital updates
      socketRef.current.on('vital_update', (data) => {
        console.log('Received vital update:', data);
        // Add new vital to the history
        setDashboardData(prev => ({
          ...prev,
          vitals: {
            ...prev.vitals,
            history: [...prev.vitals.history, data.vital].slice(-100) // Keep last 100 points
          }
        }));
      });

      // Listen for new alerts
      socketRef.current.on('new_alert', (data) => {
        console.log('Received new alert:', data);
        setDashboardData(prev => ({
          ...prev,
          alerts: {
            ...prev.alerts,
            recent: [data.alert, ...prev.alerts.recent].slice(0, 10) // Keep last 10 alerts
          }
        }));
      });

      // Cleanup on unmount
      return () => {
        if (socketRef.current) {
          socketRef.current.disconnect();
        }
      };
    }
  }, []);

  // Initial data fetch
  useEffect(() => {
    fetchDashboardData();
  }, [selectedTimeRange]);

  // Handle manual refresh
  const handleRefresh = () => {
    fetchDashboardData();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center">
              <Shield className="h-8 w-8 text-blue-600 mr-3" />
              <div>
                <h1 className="text-xl font-semibold text-gray-900">Employee Dashboard</h1>
                <p className="text-sm text-gray-600">Monitor your health and safety status</p>
                <div className="flex items-center mt-1">
                  <div className={`h-2 w-2 rounded-full mr-2 ${socketRef.current?.connected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
                  <span className="text-xs text-gray-500">
                    {socketRef.current?.connected ? 'Real-time connected' : 'Offline'}
                  </span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              {/* Time Range Selector */}
              <select
                value={selectedTimeRange}
                onChange={(e) => setSelectedTimeRange(e.target.value)}
                className="text-sm border border-gray-300 rounded-md px-3 py-1"
              >
                <option value="1h">Last Hour</option>
                <option value="6h">Last 6 Hours</option>
                <option value="24h">Last 24 Hours</option>
                <option value="7d">Last 7 Days</option>
              </select>

              {/* Refresh Button */}
              <button
                onClick={handleRefresh}
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                disabled={dashboardData.vitals.isLoading}
              >
                <RefreshCw className={`h-5 w-5 ${dashboardData.vitals.isLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Vital Signs Charts */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">My Vital Signs (Real-time)</h2>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <VitalChart
              title="Heart Rate"
              data={dashboardData.vitals.history}
              dataKey="heart_rate"
              unit="bpm"
              color="#ef4444"
              icon={Heart}
              normalRange="60-100"
              isLoading={dashboardData.vitals.isLoading}
            />
            <VitalChart
              title="SpO2"
              data={dashboardData.vitals.history}
              dataKey="spo2"
              unit="%"
              color="#3b82f6"
              icon={Activity}
              normalRange="95-100"
              isLoading={dashboardData.vitals.isLoading}
            />
            <VitalChart
              title="Temperature"
              data={dashboardData.vitals.history}
              dataKey="temperature"
              unit="°C"
              color="#f59e0b"
              icon={Thermometer}
              normalRange="36.1-37.2"
              isLoading={dashboardData.vitals.isLoading}
            />
          </div>
        </div>

        {/* Data Info */}
        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="text-sm text-blue-800">
            <strong>Data Points:</strong> {dashboardData.vitals.history.length} vitals recorded
            {dashboardData.vitals.history.length > 0 && (
              <span className="ml-4">
                <strong>Latest:</strong> {new Date(dashboardData.vitals.history[dashboardData.vitals.history.length - 1]?.timestamp).toLocaleString()}
              </span>
            )}
          </div>
        </div>

        {/* Alerts Section */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Alerts</h2>
          <div className="bg-white rounded-lg shadow-sm border p-6">
            {dashboardData.alerts.isLoading ? (
              <div className="text-center py-4">
                <RefreshCw className="h-6 w-6 animate-spin mx-auto text-gray-400" />
              </div>
            ) : dashboardData.alerts.recent.length === 0 ? (
              <p className="text-gray-500 text-center py-4">No recent alerts</p>
            ) : (
              <div className="space-y-3">
                {dashboardData.alerts.recent.slice(0, 5).map((alert, index) => (
                  <div key={index} className="flex items-center p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                    <AlertTriangle className="h-5 w-5 text-yellow-600 mr-3" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">{alert.alert_type}</p>
                      <p className="text-xs text-gray-600">{new Date(alert.timestamp).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Vital Chart Component
function VitalChart({ title, data, dataKey, unit, color, icon: Icon, normalRange, isLoading }) {
  const chartData = data || [];
  const latestValue = chartData[chartData.length - 1]?.[dataKey];
  
  return (
    <div className="bg-white rounded-xl shadow-sm p-6 border">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center">
          <Icon className="h-5 w-5 mr-2" style={{ color }} />
          <h3 className="font-semibold">{title}</h3>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold" style={{ color }}>
            {isLoading ? '--' : latestValue ? Math.round(latestValue * 10) / 10 : '--'}
          </div>
          <div className="text-sm text-gray-500">{unit}</div>
        </div>
      </div>
      
      <div className="h-24 w-full bg-gray-50 rounded-lg mb-2 relative">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400">
            <div className="text-center">
              <Icon className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <div className="text-sm">No data available</div>
            </div>
          </div>
        ) : (
          <svg className="w-full h-full">
            {chartData.length > 1 && (
              <polyline
                fill="none"
                stroke={color}
                strokeWidth="2"
                points={chartData
                  .filter(point => point[dataKey] != null && !isNaN(point[dataKey]))
                  .map((point, i, validData) => {
                    const minValue = Math.min(...validData.map(d => d[dataKey]));
                    const maxValue = Math.max(...validData.map(d => d[dataKey]));
                    const range = maxValue - minValue || 1;
                    return `${(i / (validData.length - 1)) * 100},${100 - ((point[dataKey] - minValue) / range) * 100}`;
                  })
                  .join(' ')}
              />
            )}
          </svg>
        )}
      </div>
      
      <div className="text-xs text-gray-500">
        Normal: {normalRange} | Points: {chartData.length}
      </div>
    </div>
  );
}

export default EmployeeDashboard;