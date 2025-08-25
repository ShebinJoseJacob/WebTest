import React, { useState, useEffect } from 'react';
import { 
  Heart, Activity, Thermometer, MapPin, AlertTriangle, 
  Users, Bell, Calendar, Shield, LogOut, CheckCircle, 
  Clock, Home, Map as MapIcon, Volume2, VolumeX,
  RefreshCw, Filter, Eye, EyeOff, Smartphone, Monitor,
  Zap, UserCheck, AlertCircle, FileCheck
} from 'lucide-react';

// VitalValue Component with hover tooltip
function VitalValue({ value, unit, label, icon: Icon, isNormal, showOriginal = true }) {
  const [showTooltip, setShowTooltip] = useState(false);
  
  if (!value && value !== 0) return <span className="text-gray-400">--</span>;
  
  const displayValue = unit === '°C' ? value.toFixed(1) : Math.round(value);
  
  return (
    <span 
      className={`relative cursor-help transition-all duration-200 hover:scale-105 ${
        isNormal ? 'text-gray-900' : 'text-red-600'
      }`}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
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

// Map Tab Component with Real GPS Integration
export function MapTab({ employees }) {
  
  useEffect(() => {
    // Initialize Leaflet map
    const loadMap = async () => {
      if (typeof window !== 'undefined') {
        const L = await import('leaflet');
        
        // Only create map if container exists and map hasn't been created
        const container = document.getElementById('map');
        if (container && !container._leaflet_id) {
          const map = L.map('map').setView([40.7128, -74.0060], 13);
          
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
          }).addTo(map);

          // Add employee markers
          employees.forEach(employee => {
            if (employee.latestVital?.latitude && employee.latestVital?.longitude) {
              const marker = L.marker([
                employee.latestVital.latitude, 
                employee.latestVital.longitude
              ]).addTo(map);
              
              const popupContent = `
                <div class="p-2">
                  <h3 class="font-semibold">${employee.name}</h3>
                  <p class="text-sm text-gray-600">${employee.department}</p>
                  <div class="mt-2 space-y-1">
                    <div class="flex justify-between">
                      <span>Heart Rate:</span>
                      <span class="${employee.latestVital.heart_rate > 100 ? 'text-red-600' : 'text-green-600'}" title="Original: ${employee.latestVital.heart_rate.toFixed(6)} bpm">${Math.round(employee.latestVital.heart_rate)} bpm</span>
                    </div>
                    <div class="flex justify-between">
                      <span>SpO2:</span>
                      <span class="${employee.latestVital.spo2 < 95 ? 'text-red-600' : 'text-green-600'}" title="Original: ${employee.latestVital.spo2.toFixed(6)}%">${Math.round(employee.latestVital.spo2)}%</span>
                    </div>
                    <div class="flex justify-between">
                      <span>Temperature:</span>
                      <span class="${employee.latestVital.temperature > 37.5 ? 'text-red-600' : 'text-green-600'}" title="Original: ${employee.latestVital.temperature.toFixed(6)}°C">${employee.latestVital.temperature.toFixed(1)}°C</span>
                    </div>
                    <div class="text-xs text-gray-500 mt-2">
                      Accuracy: ±${employee.latestVital.accuracy}m<br>
                      Last update: ${new Date(employee.latestVital.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              `;
              
              marker.bindPopup(popupContent);
              
              // Color marker based on status
              if (employee.status === 'critical') {
                marker.setIcon(L.divIcon({
                  className: 'custom-marker critical',
                  html: '<div class="w-4 h-4 bg-red-500 rounded-full border-2 border-white shadow-lg animate-pulse"></div>',
                  iconSize: [16, 16]
                }));
              } else if (employee.status === 'warning') {
                marker.setIcon(L.divIcon({
                  className: 'custom-marker warning',
                  html: '<div class="w-4 h-4 bg-orange-500 rounded-full border-2 border-white shadow-lg"></div>',
                  iconSize: [16, 16]
                }));
              } else {
                marker.setIcon(L.divIcon({
                  className: 'custom-marker online',
                  html: '<div class="w-4 h-4 bg-green-500 rounded-full border-2 border-white shadow-lg"></div>',
                  iconSize: [16, 16]
                }));
              }
            }
          });
        }
      }
    };
    
    loadMap();
  }, [employees]);

  return (
    <div className="space-y-6">
      {/* Map Container */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="p-6 border-b">
          <h2 className="text-lg font-semibold flex items-center">
            <MapIcon className="h-5 w-5 mr-2 text-blue-600" />
            Real-time Employee Locations
          </h2>
        </div>
        <div id="map" className="h-96 w-full"></div>
      </div>

      {/* Employee Location List */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h3 className="text-lg font-semibold mb-4">Location Summary</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {employees.map(employee => (
            <LocationCard key={employee.id} employee={employee} />
          ))}
        </div>
      </div>
    </div>
  );
}

// Location Card Component
function LocationCard({ employee }) {
  const vital = employee.latestVital;
  
  return (
    <div className="border rounded-lg p-4 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h4 className="font-semibold">{employee.name}</h4>
          <p className="text-sm text-gray-500">{employee.department}</p>
        </div>
        <div className={`h-3 w-3 rounded-full ${
          employee.status === 'critical' ? 'bg-red-500 animate-pulse' :
          employee.status === 'warning' ? 'bg-orange-500' : 'bg-green-500'
        }`} />
      </div>
      
      {vital?.latitude && vital?.longitude ? (
        <div className="space-y-2 text-sm">
          <div className="flex items-center text-gray-600">
            <MapPin className="h-4 w-4 mr-1" />
            {vital.latitude.toFixed(4)}, {vital.longitude.toFixed(4)}
          </div>
          <div className="text-xs text-gray-500">
            Accuracy: ±{vital.accuracy}m • {new Date(vital.timestamp).toLocaleTimeString()}
          </div>
        </div>
      ) : (
        <div className="text-sm text-gray-500">Location unavailable</div>
      )}
    </div>
  );
}

// Alerts Tab Component
export function AlertsTab({ alerts, onAcknowledgeAlert }) {
  const [filter, setFilter] = useState('all');
  
  const filteredAlerts = alerts
    .filter(alert => {
      if (filter === 'critical') return alert.severity === 'critical';
      if (filter === 'unacknowledged') return !alert.acknowledged;
      return true;
    })
    .sort((a, b) => {
      // Sort unacknowledged alerts first
      if (a.acknowledged !== b.acknowledged) {
        return a.acknowledged ? 1 : -1;
      }
      // Then sort by severity (critical > high > medium > low)
      const severityOrder = { 'critical': 4, 'high': 3, 'medium': 2, 'low': 1 };
      const severityDiff = (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0);
      if (severityDiff !== 0) return severityDiff;
      // Finally sort by timestamp (newest first)
      return new Date(b.timestamp) - new Date(a.timestamp);
    });

  return (
    <div className="space-y-6">
      {/* Alert Filters */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex flex-wrap gap-4">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              filter === 'all' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
            }`}
          >
            All Alerts ({alerts.length})
          </button>
          <button
            onClick={() => setFilter('critical')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              filter === 'critical' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
            }`}
          >
            Critical ({alerts.filter(a => a.severity === 'critical').length})
          </button>
          <button
            onClick={() => setFilter('unacknowledged')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              filter === 'unacknowledged' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'
            }`}
          >
            Need Attention ({alerts.filter(a => !a.acknowledged).length})
          </button>
        </div>
      </div>

      {/* Alerts List */}
      <div className="space-y-4">
        {filteredAlerts.map(alert => (
          <AlertCard key={alert.id} alert={alert} onAcknowledge={onAcknowledgeAlert} />
        ))}
        {filteredAlerts.length === 0 && (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center">
            <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No alerts found</h3>
            <p className="text-gray-500">All systems are operating normally</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Alert Card Component
function AlertCard({ alert, onAcknowledge }) {
  const getSeverityColor = () => {
    switch(alert.severity) {
      case 'critical': return 'bg-red-50 border-red-500 text-red-800';
      case 'high': return 'bg-orange-50 border-orange-500 text-orange-800';
      case 'medium': return 'bg-yellow-50 border-yellow-500 text-yellow-800';
      default: return 'bg-blue-50 border-blue-500 text-blue-800';
    }
  };

  const formatAlertValue = () => {
    if (alert.type === 'fall') {
      return 'Fall detected';
    }
    if (alert.value === null || alert.value === undefined) {
      return 'N/A';
    }
    
    const units = {
      'heart_rate': 'bpm',
      'spo2': '%',
      'temperature': '°C'
    };
    
    return `${alert.value}${units[alert.type] || ''}`;
  };

  const formatThreshold = () => {
    if (alert.type === 'fall' || alert.threshold === null || alert.threshold === undefined) {
      return null;
    }
    
    const units = {
      'heart_rate': 'bpm',
      'spo2': '%',
      'temperature': '°C'
    };
    
    const comparisonText = {
      'heart_rate': alert.value > alert.threshold ? 'above' : 'below',
      'spo2': alert.value < alert.threshold ? 'below' : 'above',
      'temperature': alert.value > alert.threshold ? 'above' : 'below'
    };
    
    return `${comparisonText[alert.type]} ${alert.threshold}${units[alert.type] || ''}`;
  };

  return (
    <div className={`bg-white rounded-xl shadow-sm border-l-4 ${getSeverityColor()} ${!alert.acknowledged ? 'ring-2 ring-blue-200' : ''}`}>
      <div className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center mb-2">
              <AlertTriangle className={`h-5 w-5 mr-2 ${alert.severity === 'critical' ? 'animate-pulse' : ''}`} />
              <h3 className="font-semibold text-lg">{alert.user_name}</h3>
              <span className={`ml-2 px-2 py-1 text-xs rounded-full font-medium ${
                alert.severity === 'critical' ? 'bg-red-100 text-red-800' :
                alert.severity === 'high' ? 'bg-orange-100 text-orange-800' :
                alert.severity === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                'bg-blue-100 text-blue-800'
              }`}>
                {alert.severity.toUpperCase()}
              </span>
              {!alert.acknowledged && (
                <span className="ml-2 px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800 font-medium animate-pulse">
                  NEEDS ATTENTION
                </span>
              )}
            </div>
            
            <h4 className="font-medium mb-2 text-gray-900">
              {alert.type.replace(/_/g, ' ').toUpperCase()} ALERT
            </h4>
            
            <div className="bg-gray-50 rounded-lg p-3 mb-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="font-medium text-gray-700">Current Value:</span>
                  <div className={`text-lg font-bold ${
                    alert.severity === 'critical' ? 'text-red-600' :
                    alert.severity === 'high' ? 'text-orange-600' :
                    'text-yellow-600'
                  }`}>
                    {formatAlertValue()}
                  </div>
                </div>
                {formatThreshold() && (
                  <div>
                    <span className="font-medium text-gray-700">Threshold:</span>
                    <div className="text-lg font-medium text-gray-900">
                      {formatThreshold()}
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            <p className="text-sm text-gray-700 mb-3 font-medium">{alert.message}</p>
            
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>Device: {alert.device_serial}</span>
              <span>{new Date(alert.timestamp).toLocaleString()}</span>
            </div>
          </div>
          
          <div className="flex items-center space-x-2 ml-4">
            {alert.acknowledged ? (
              <div className="flex flex-col items-center text-green-600">
                <div className="flex items-center mb-1">
                  <CheckCircle className="h-5 w-5 mr-1" />
                  <span className="text-sm font-medium">Acknowledged</span>
                </div>
                {alert.acknowledged_by_name && (
                  <span className="text-xs text-gray-500">
                    by {alert.acknowledged_by_name}
                  </span>
                )}
                {alert.acknowledged_at && (
                  <span className="text-xs text-gray-500">
                    {new Date(alert.acknowledged_at).toLocaleString()}
                  </span>
                )}
              </div>
            ) : (
              <button
                onClick={() => onAcknowledge(alert.id)}
                className={`px-4 py-2 text-white rounded-lg transition-colors font-medium ${
                  alert.severity === 'critical' 
                    ? 'bg-red-600 hover:bg-red-700 animate-pulse' 
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                Acknowledge
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Stat Card Component
export function StatCard({ title, value, icon: Icon, color, pulse = false }) {
  const colorClasses = {
    blue: 'text-blue-600 bg-blue-100',
    green: 'text-green-600 bg-green-100',
    orange: 'text-orange-600 bg-orange-100',
    red: 'text-red-600 bg-red-100'
  };

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600 mb-1">{title}</p>
          <p className={`text-3xl font-bold ${pulse ? 'animate-pulse' : ''}`} style={{ color: color === 'blue' ? '#2563eb' : color === 'green' ? '#16a34a' : color === 'orange' ? '#ea580c' : '#dc2626' }}>
            {value}
          </p>
        </div>
        <div className={`p-3 rounded-full ${colorClasses[color]} ${pulse ? 'animate-pulse' : ''}`}>
          <Icon className="h-6 w-6" />
        </div>
      </div>
    </div>
  );
}

// Filter Panel Component
export function FilterPanel({ filters, setFilters }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <h3 className="text-lg font-semibold mb-4 flex items-center">
        <Filter className="h-5 w-5 mr-2 text-gray-600" />
        Filters
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Department</label>
          <select
            value={filters.department}
            onChange={(e) => setFilters(prev => ({ ...prev, department: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Departments</option>
            <option value="Manufacturing">Manufacturing</option>
            <option value="Warehouse">Warehouse</option>
            <option value="Quality Control">Quality Control</option>
          </select>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
          <select
            value={filters.status}
            onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Status</option>
            <option value="online">Online</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
          </select>
        </div>
        
        <div className="flex items-end">
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={filters.alertsOnly}
              onChange={(e) => setFilters(prev => ({ ...prev, alertsOnly: e.target.checked }))}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">Alerts Only</span>
          </label>
        </div>
      </div>
    </div>
  );
}

// Employee Card Component
export function EmployeeCard({ employee, alerts = [] }) {
  const vital = employee.latestVital;
  const isOnline = vital?.timestamp && new Date() - new Date(vital.timestamp) < 60000;
  const unacknowledgedAlerts = alerts.filter(alert => !alert.acknowledged);
  const criticalAlerts = alerts.filter(alert => alert.severity === 'critical' && !alert.acknowledged);
  
  return (
    <div className="p-6 border-b last:border-b-0 hover:bg-gray-50 transition-colors">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-gray-900">{employee.name}</h3>
          <p className="text-sm text-gray-500">{employee.department} • {employee.position}</p>
        </div>
        <div className="flex items-center space-x-2">
          <div className={`px-2 py-1 text-xs rounded-full ${
            employee.status === 'critical' ? 'bg-red-100 text-red-800' :
            employee.status === 'warning' ? 'bg-orange-100 text-orange-800' :
            'bg-green-100 text-green-800'
          }`}>
            {employee.status.toUpperCase()}
          </div>
          <div className={`h-3 w-3 rounded-full ${
            isOnline ? 'bg-green-500 animate-pulse' : 'bg-gray-300'
          }`} />
        </div>
      </div>
      
      <div className="grid grid-cols-3 gap-4">
        <div className="text-center">
          <div className="flex items-center justify-center mb-1">
            <Heart className="h-4 w-4 text-red-500 mr-1" />
            <span className="font-semibold">
              <VitalValue 
                value={vital?.heart_rate}
                unit="bpm"
                label="Heart Rate"
                icon={Heart}
                isNormal={vital?.heart_rate <= 100}
              />
            </span>
          </div>
          <div className="text-xs text-gray-500">bpm</div>
        </div>
        
        <div className="text-center">
          <div className="flex items-center justify-center mb-1">
            <Activity className="h-4 w-4 text-blue-500 mr-1" />
            <span className="font-semibold">
              <VitalValue 
                value={vital?.spo2}
                unit="%"
                label="SpO2"
                icon={Activity}
                isNormal={vital?.spo2 >= 95}
              />
            </span>
          </div>
          <div className="text-xs text-gray-500">%</div>
        </div>
        
        <div className="text-center">
          <div className="flex items-center justify-center mb-1">
            <Thermometer className="h-4 w-4 text-yellow-500 mr-1" />
            <span className="font-semibold">
              <VitalValue 
                value={vital?.temperature}
                unit="°C"
                label="Temperature"
                icon={Thermometer}
                isNormal={vital?.temperature <= 37.5}
              />
            </span>
          </div>
          <div className="text-xs text-gray-500">°C</div>
        </div>
      </div>
      
      {vital?.timestamp && (
        <div className="mt-3 text-xs text-gray-500 text-center">
          Last update: {new Date(vital.timestamp).toLocaleTimeString()}
        </div>
      )}
      
      {/* Alert indicators */}
      {unacknowledgedAlerts.length > 0 && (
        <div className="mt-3 flex items-center justify-between">
          <div className={`flex items-center px-2 py-1 rounded-full text-xs font-medium ${
            criticalAlerts.length > 0 
              ? 'bg-red-100 text-red-800' 
              : 'bg-orange-100 text-orange-800'
          }`}>
            <AlertTriangle className="h-3 w-3 mr-1" />
            {unacknowledgedAlerts.length} Alert{unacknowledgedAlerts.length > 1 ? 's' : ''}
            {criticalAlerts.length > 0 && ' (Critical)'}
          </div>
          {criticalAlerts.length > 0 && (
            <div className="animate-pulse">
              <AlertCircle className="h-4 w-4 text-red-500" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Critical Alert Item Component
export function CriticalAlertItem({ alert, onAcknowledge }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
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
          className="ml-4 px-3 py-1 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 transition-colors animate-pulse"
        >
          Acknowledge
        </button>
      </div>
    </div>
  );
}

// Compliance Tab Component
export function ComplianceTab() {
  const [complianceData, setComplianceData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState({
    total_records: 0,
    compliant_count: 0,
    non_compliant_count: 0,
    pending_review_count: 0,
    critical_risk_count: 0,
    high_risk_count: 0,
    unreviewed_count: 0,
    compliance_rate: 0
  });
  const [filter, setFilter] = useState('all');

  // Fetch compliance data
  const fetchComplianceData = async () => {
    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('No authentication token');

      // Build query parameters
      const queryParams = new URLSearchParams();
      if (filter !== 'all') {
        if (filter === 'high_risk') {
          queryParams.set('risk_level', 'high');
        } else if (filter === 'critical_risk') {
          queryParams.set('risk_level', 'critical');
        } else if (filter === 'unreviewed') {
          queryParams.set('reviewed', 'false');
        } else {
          queryParams.set('status', filter);
        }
      }
      queryParams.set('limit', '50');

      const API_BASE = process.env.REACT_APP_API_URL || 'https://iot-monitoring-backend-sgba.onrender.com/api';

      const [dataResponse, statsResponse] = await Promise.all([
        fetch(`${API_BASE}/compliance?${queryParams}`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${API_BASE}/compliance/stats`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      if (!dataResponse.ok || !statsResponse.ok) {
        throw new Error('Failed to fetch compliance data');
      }

      const dataResult = await dataResponse.json();
      const statsResult = await statsResponse.json();

      setComplianceData(dataResult.compliance || []);
      setStats(statsResult.stats || stats);

    } catch (err) {
      console.error('Error fetching compliance data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchComplianceData();
  }, [filter]);

  // Handle compliance record review
  const handleReview = async (id, approved = false) => {
    try {
      const token = localStorage.getItem('token');
      const API_BASE = process.env.REACT_APP_API_URL || 'https://iot-monitoring-backend-sgba.onrender.com/api';
      const response = await fetch(`${API_BASE}/compliance/${id}/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ approved })
      });

      if (response.ok) {
        fetchComplianceData(); // Refresh data
      }
    } catch (error) {
      console.error('Error reviewing compliance record:', error);
    }
  };

  // Filter compliance records
  const filteredRecords = complianceData.filter(record => {
    if (filter === 'all') return true;
    if (filter === 'high_risk') return ['high', 'critical'].includes(record.risk_level);
    if (filter === 'critical_risk') return record.risk_level === 'critical';
    if (filter === 'unreviewed') return !record.reviewed;
    if (filter === 'non_compliant') return record.status === 'non_compliant';
    if (filter === 'pending_review') return record.status === 'pending_review';
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Shield className="h-8 w-8 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Compliance Rate</p>
              <p className="text-2xl font-semibold text-gray-900">{stats.compliance_rate}%</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <AlertTriangle className="h-8 w-8 text-red-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">High Risk</p>
              <p className="text-2xl font-semibold text-gray-900">
                {parseInt(stats.critical_risk_count) + parseInt(stats.high_risk_count)}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Clock className="h-8 w-8 text-yellow-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Pending Review</p>
              <p className="text-2xl font-semibold text-gray-900">{stats.unreviewed_count}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <FileCheck className="h-8 w-8 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Records</p>
              <p className="text-2xl font-semibold text-gray-900">{stats.total_records}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Compliance Filters */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex flex-wrap gap-4">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              filter === 'all' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
            }`}
          >
            All Records ({stats.total_records})
          </button>
          <button
            onClick={() => setFilter('critical_risk')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              filter === 'critical_risk' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
            }`}
          >
            Critical Risk ({stats.critical_risk_count})
          </button>
          <button
            onClick={() => setFilter('high_risk')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              filter === 'high_risk' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'
            }`}
          >
            High Risk ({parseInt(stats.critical_risk_count) + parseInt(stats.high_risk_count)})
          </button>
          <button
            onClick={() => setFilter('unreviewed')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              filter === 'unreviewed' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'
            }`}
          >
            Need Review ({stats.unreviewed_count})
          </button>
          <button
            onClick={() => setFilter('non_compliant')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              filter === 'non_compliant' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
            }`}
          >
            Non-Compliant ({stats.non_compliant_count})
          </button>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex">
            <AlertTriangle className="h-5 w-5 text-red-400" />
            <div className="ml-3">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Compliance Records */}
      <div className="space-y-4">
        {filteredRecords.map(record => (
          <ComplianceCard key={record.id} record={record} onReview={handleReview} />
        ))}
        {filteredRecords.length === 0 && (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center">
            <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No compliance issues found</h3>
            <p className="text-gray-500">All systems are meeting compliance standards</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Compliance Card Component
function ComplianceCard({ record, onReview }) {
  const getSeverityColor = () => {
    switch(record.risk_level) {
      case 'critical': return 'bg-red-50 border-red-500';
      case 'high': return 'bg-orange-50 border-orange-500';
      case 'medium': return 'bg-yellow-50 border-yellow-500';
      default: return 'bg-blue-50 border-blue-500';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'compliant':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'non_compliant':
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      case 'resolved':
        return <CheckCircle className="h-4 w-4 text-gray-600" />;
      default:
        return <Clock className="h-4 w-4 text-yellow-600" />;
    }
  };

  return (
    <div className={`bg-white rounded-xl shadow-sm border-l-4 p-6 ${getSeverityColor()}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center space-x-4 mb-3">
            <div className="flex items-center">
              <Users className="h-4 w-4 text-gray-400 mr-2" />
              <span className="font-medium text-gray-900">{record.user_name || 'Unknown User'}</span>
            </div>
            <div className="flex items-center">
              {getStatusIcon(record.status)}
              <span className="ml-1 text-sm capitalize">{record.status.replace('_', ' ')}</span>
            </div>
            <div className={`px-2 py-1 rounded-full text-xs font-medium ${
              record.risk_level === 'critical' ? 'bg-red-100 text-red-800' :
              record.risk_level === 'high' ? 'bg-orange-100 text-orange-800' :
              record.risk_level === 'medium' ? 'bg-yellow-100 text-yellow-800' :
              'bg-green-100 text-green-800'
            }`}>
              {record.risk_level.toUpperCase()}
            </div>
          </div>
          
          <h4 className="font-semibold text-gray-900 mb-2">{record.title}</h4>
          <p className="text-sm text-gray-600 mb-3">{record.description}</p>
          
          <div className="flex items-center space-x-6 text-sm text-gray-500">
            <div className="flex items-center">
              <Shield className="h-4 w-4 mr-1" />
              <span className="capitalize">{record.type}</span>
            </div>
            {record.regulation_standard && (
              <div className="flex items-center">
                <FileCheck className="h-4 w-4 mr-1" />
                <span>{record.regulation_standard}</span>
              </div>
            )}
            <div className="flex items-center">
              <Clock className="h-4 w-4 mr-1" />
              <span>{new Date(record.timestamp).toLocaleDateString()}</span>
            </div>
          </div>
          
          {record.corrective_action && (
            <div className="mt-3 p-3 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>Action Required:</strong> {record.corrective_action}
              </p>
            </div>
          )}
        </div>
        
        <div className="flex flex-col space-y-2 ml-6">
          {!record.reviewed && (
            <>
              <button
                onClick={() => onReview(record.id, true)}
                className="px-3 py-1 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 transition-colors"
                title="Approve"
              >
                Approve
              </button>
              <button
                onClick={() => onReview(record.id, false)}
                className="px-3 py-1 bg-yellow-600 text-white rounded-lg text-sm hover:bg-yellow-700 transition-colors"
                title="Review Only"
              >
                Review
              </button>
            </>
          )}
          {record.reviewed && (
            <div className="text-center">
              <div className="text-xs text-gray-500">
                {record.approved ? 'Approved' : 'Reviewed'}
              </div>
              <div className="text-xs text-gray-400">
                by {record.reviewed_by_name || 'Unknown'}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}