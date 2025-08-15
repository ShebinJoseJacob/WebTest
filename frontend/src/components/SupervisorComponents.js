import React, { useState, useEffect } from 'react';
import { 
  Heart, Activity, Thermometer, MapPin, AlertTriangle, 
  Users, Bell, Calendar, Shield, LogOut, CheckCircle, 
  Clock, Home, Map as MapIcon, Volume2, VolumeX,
  RefreshCw, Filter, Eye, EyeOff, Smartphone, Monitor,
  Zap, UserCheck, AlertCircle
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
  
  const filteredAlerts = alerts.filter(alert => {
    if (filter === 'critical') return alert.severity === 'critical';
    if (filter === 'unacknowledged') return !alert.acknowledged;
    return true;
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

  return (
    <div className={`bg-white rounded-xl shadow-sm border-l-4 ${getSeverityColor()}`}>
      <div className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center mb-2">
              <AlertTriangle className="h-5 w-5 mr-2" />
              <h3 className="font-semibold">{alert.user_name}</h3>
              <span className={`ml-2 px-2 py-1 text-xs rounded-full ${
                alert.severity === 'critical' ? 'bg-red-100 text-red-800' :
                alert.severity === 'high' ? 'bg-orange-100 text-orange-800' :
                'bg-yellow-100 text-yellow-800'
              }`}>
                {alert.severity.toUpperCase()}
              </span>
            </div>
            <h4 className="font-medium mb-1">{alert.type.replace(/_/g, ' ').toUpperCase()}</h4>
            <p className="text-sm mb-3">{alert.message}</p>
            <div className="text-xs text-gray-500">
              {new Date(alert.timestamp).toLocaleString()}
            </div>
          </div>
          
          <div className="flex items-center space-x-2 ml-4">
            {alert.acknowledged ? (
              <div className="flex items-center text-green-600">
                <CheckCircle className="h-5 w-5 mr-1" />
                <span className="text-sm">Acknowledged</span>
              </div>
            ) : (
              <button
                onClick={() => onAcknowledge(alert.id)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
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
export function EmployeeCard({ employee }) {
  const vital = employee.latestVital;
  const isOnline = vital?.timestamp && new Date() - new Date(vital.timestamp) < 60000;
  
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