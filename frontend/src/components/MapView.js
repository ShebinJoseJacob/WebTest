import React, { useState, useEffect, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import { useSelector, useDispatch } from 'react-redux';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { formatDistanceToNow, format } from 'date-fns';
import toast from 'react-hot-toast';
import {
  MapPinIcon,
  UserIcon,
  ExclamationTriangleIcon,
  EyeIcon,
  ArrowPathIcon,
  FunnelIcon,
  AdjustmentsHorizontalIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
import {
  ExclamationTriangleIcon as ExclamationTriangleIconSolid,
} from '@heroicons/react/24/solid';

import { selectAuth, selectSocket } from '../store/selectors';
import { fetchCurrentLocations } from '../store/slices/locationSlice';

import Button from './ui/Button';
import Badge from './ui/Badge';
import LoadingSpinner from './ui/LoadingSpinner';
import Card from './ui/Card';

// Fix leaflet default markers
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

// Custom marker icons for different statuses
const createCustomIcon = (status, hasAlert = false) => {
  const colors = {
    online: '#22c55e',
    warning: '#f59e0b', 
    critical: '#ef4444',
    offline: '#6b7280',
  };

  const color = colors[status] || colors.offline;
  const alertBadge = hasAlert ? '⚠️' : '';

  return L.divIcon({
    html: `
      <div style="
        width: 24px;
        height: 24px;
        background-color: ${color};
        border: 2px solid white;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        color: white;
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        position: relative;
      ">
        👤
        ${alertBadge ? `<div style="
          position: absolute;
          top: -5px;
          right: -5px;
          background: #ef4444;
          border-radius: 50%;
          width: 12px;
          height: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 8px;
        ">${alertBadge}</div>` : ''}
      </div>
    `,
    className: 'custom-marker',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
};

// Component to handle map updates
const MapUpdater = ({ center, zoom, locations }) => {
  const map = useMap();

  useEffect(() => {
    if (locations.length > 0) {
      const bounds = L.latLngBounds(locations.map(loc => [loc.latitude, loc.longitude]));
      map.fitBounds(bounds, { padding: [20, 20] });
    }
  }, [map, locations]);

  return null;
};

const MapView = ({
  height = 400,
  showControls = true,
  showFilters = true,
  showUserInfo = true,
  autoFocus = true,
  onLocationClick,
  onUserSelect,
  className = '',
}) => {
  const dispatch = useDispatch();
  const { user } = useSelector(selectAuth);
  const { isConnected } = useSelector(selectSocket);
  
  const [locations, setLocations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [filters, setFilters] = useState({
    status: 'all',
    department: 'all',
    alerts: 'all',
    accuracy: 100, // GPS accuracy threshold in meters
  });
  const [mapCenter, setMapCenter] = useState([37.7749, -122.4194]); // Default to San Francisco
  const [mapZoom, setMapZoom] = useState(13);
  const [showGeofences, setShowGeofences] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  const mapRef = useRef();

  // Fetch location data
  const fetchLocationData = async () => {
    try {
      setIsLoading(true);
      const result = await dispatch(fetchCurrentLocations()).unwrap();
      setLocations(result.locations || []);
      setLastUpdate(new Date());
      setError(null);
    } catch (err) {
      console.error('Error fetching locations:', err);
      setError(err.message || 'Failed to fetch locations');
      toast.error('Failed to update locations');
    } finally {
      setIsLoading(false);
    }
  };

  // Initial data fetch
  useEffect(() => {
    fetchLocationData();
  }, []);

  // Auto refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchLocationData();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  // Process and filter locations
  const processedLocations = useMemo(() => {
    return locations
      .filter(location => {
        // Filter by GPS accuracy
        if (location.gps_accuracy > filters.accuracy) return false;
        
        // Filter by status
        if (filters.status !== 'all') {
          const locationStatus = getLocationStatus(location);
          if (locationStatus !== filters.status) return false;
        }

        // Filter by alerts
        if (filters.alerts === 'withAlerts' && !hasActiveAlerts(location)) return false;
        if (filters.alerts === 'withoutAlerts' && hasActiveAlerts(location)) return false;

        return true;
      })
      .map(location => ({
        ...location,
        status: getLocationStatus(location),
        hasAlerts: hasActiveAlerts(location),
      }));
  }, [locations, filters]);

  // Determine location status based on vitals and timestamp
  const getLocationStatus = (location) => {
    const now = new Date();
    const locationTime = new Date(location.timestamp);
    const minutesAgo = (now - locationTime) / (1000 * 60);

    // Check if location is stale (older than 10 minutes)
    if (minutesAgo > 10) return 'offline';

    // Check vitals for critical conditions
    if (location.vitals) {
      const { heart_rate, spo2, temperature, fall_detected } = location.vitals;
      
      if (fall_detected) return 'critical';
      if (heart_rate < 50 || heart_rate > 120) return 'critical';
      if (spo2 < 90) return 'critical';
      if (temperature < 35 || temperature > 39) return 'critical';

      // Warning conditions
      if (heart_rate < 60 || heart_rate > 100) return 'warning';
      if (spo2 < 95) return 'warning';
      if (temperature < 36 || temperature > 37.5) return 'warning';
    }

    return 'online';
  };

  // Check if location has active alerts
  const hasActiveAlerts = (location) => {
    return location.vitals?.is_abnormal || location.status === 'critical';
  };

  // Handle marker click
  const handleMarkerClick = (location) => {
    setSelectedUser(location);
    onLocationClick && onLocationClick(location);
  };

  // Handle user selection from sidebar
  const handleUserSelect = (userId) => {
    const location = processedLocations.find(loc => loc.user_id === userId);
    if (location) {
      setMapCenter([location.latitude, location.longitude]);
      setMapZoom(16);
      setSelectedUser(location);
      onUserSelect && onUserSelect(location);
    }
  };

  // Get status color
  const getStatusColor = (status) => {
    const colors = {
      online: 'text-green-600 bg-green-50',
      warning: 'text-yellow-600 bg-yellow-50',
      critical: 'text-red-600 bg-red-50',
      offline: 'text-gray-600 bg-gray-50',
    };
    return colors[status] || colors.offline;
  };

  // Get status badge variant
  const getStatusBadge = (status) => {
    const variants = {
      online: 'success',
      warning: 'warning',
      critical: 'danger',
      offline: 'secondary',
    };
    return variants[status] || 'secondary';
  };

  // Handle refresh
  const handleRefresh = () => {
    fetchLocationData();
  };

  return (
    <div className={`bg-white rounded-lg border border-gray-200 ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <MapPinIcon className="h-5 w-5 text-gray-600" />
            <h3 className="text-lg font-medium text-gray-900">
              Live Location Tracking
            </h3>
            <Badge variant={isConnected ? 'success' : 'danger'}>
              {isConnected ? 'Live' : 'Offline'}
            </Badge>
          </div>
          
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-500">
              {processedLocations.length} workers tracked
            </span>
            <span className="text-xs text-gray-400">
              Updated: {lastUpdate.toLocaleTimeString()}
            </span>
            <Button
              variant="ghost"
              size="small"
              onClick={handleRefresh}
              disabled={isLoading}
              className="flex items-center space-x-1"
            >
              <ArrowPathIcon className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <select
              value={filters.status}
              onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
              className="text-sm border border-gray-300 rounded-md px-3 py-1"
            >
              <option value="all">All Status</option>
              <option value="online">Online</option>
              <option value="warning">Warning</option>
              <option value="critical">Critical</option>
              <option value="offline">Offline</option>
            </select>

            <select
              value={filters.alerts}
              onChange={(e) => setFilters(prev => ({ ...prev, alerts: e.target.value }))}
              className="text-sm border border-gray-300 rounded-md px-3 py-1"
            >
              <option value="all">All Workers</option>
              <option value="withAlerts">With Alerts</option>
              <option value="withoutAlerts">Without Alerts</option>
            </select>

            <div className="flex items-center space-x-2">
              <label className="text-sm text-gray-600">GPS Accuracy:</label>
              <select
                value={filters.accuracy}
                onChange={(e) => setFilters(prev => ({ ...prev, accuracy: parseInt(e.target.value) }))}
                className="text-sm border border-gray-300 rounded-md px-2 py-1"
              >
                <option value={10}>High (≤10m)</option>
                <option value={50}>Good (≤50m)</option>
                <option value={100}>Fair (≤100m)</option>
                <option value={1000}>Any</option>
              </select>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="show-geofences"
                checked={showGeofences}
                onChange={(e) => setShowGeofences(e.target.checked)}
                className="h-4 w-4 text-blue-600 rounded"
              />
              <label htmlFor="show-geofences" className="text-sm text-gray-600">
                Show Geofences
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex">
        {/* Map */}
        <div className="flex-1" style={{ height }}>
          {isLoading && locations.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <LoadingSpinner size="large" />
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full text-red-500">
              <ExclamationTriangleIcon className="h-8 w-8 mr-2" />
              <span>Error loading map: {error}</span>
            </div>
          ) : (
            <MapContainer
              ref={mapRef}
              center={mapCenter}
              zoom={mapZoom}
              style={{ height: '100%', width: '100%' }}
              className="rounded-bl-lg"
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              
              {autoFocus && <MapUpdater locations={processedLocations} />}

              {/* Location Markers */}
              {processedLocations.map((location) => (
                <Marker
                  key={location.user_id}
                  position={[location.latitude, location.longitude]}
                  icon={createCustomIcon(location.status, location.hasAlerts)}
                  eventHandlers={{
                    click: () => handleMarkerClick(location),
                  }}
                >
                  <Popup>
                    <div className="min-w-[250px] p-2">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-semibold text-gray-900">
                          {location.user_name}
                        </h4>
                        <Badge variant={getStatusBadge(location.status)}>
                          {location.status.toUpperCase()}
                        </Badge>
                      </div>
                      
                      {/* Vitals */}
                      {location.vitals && (
                        <div className="mb-3 text-sm">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <span className="text-gray-600">Heart Rate:</span>
                              <span className={`ml-1 font-medium ${
                                location.vitals.heart_rate < 60 || location.vitals.heart_rate > 100
                                  ? 'text-red-600' : 'text-gray-900'
                              }`}>
                                {location.vitals.heart_rate} bpm
                              </span>
                            </div>
                            <div>
                              <span className="text-gray-600">SpO2:</span>
                              <span className={`ml-1 font-medium ${
                                location.vitals.spo2 < 95 ? 'text-red-600' : 'text-gray-900'
                              }`}>
                                {location.vitals.spo2}%
                              </span>
                            </div>
                            <div>
                              <span className="text-gray-600">Temp:</span>
                              <span className={`ml-1 font-medium ${
                                location.vitals.temperature < 36 || location.vitals.temperature > 37.5
                                  ? 'text-red-600' : 'text-gray-900'
                              }`}>
                                {location.vitals.temperature}°C
                              </span>
                            </div>
                            {location.vitals.fall_detected && (
                              <div className="col-span-2">
                                <Badge variant="danger" className="text-xs">
                                  🚨 FALL DETECTED
                                </Badge>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Location Info */}
                      <div className="text-xs text-gray-600 space-y-1">
                        <div>
                          <strong>Location:</strong> {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
                        </div>
                        <div>
                          <strong>Accuracy:</strong> ±{location.gps_accuracy}m
                        </div>
                        <div>
                          <strong>Last Update:</strong> {formatDistanceToNow(new Date(location.timestamp), { addSuffix: true })}
                        </div>
                        <div>
                          <strong>Device:</strong> {location.device_serial}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="mt-3 flex space-x-2">
                        <Button
                          variant="secondary"
                          size="small"
                          onClick={() => handleUserSelect(location.user_id)}
                          className="flex items-center space-x-1"
                        >
                          <EyeIcon className="h-3 w-3" />
                          <span>Focus</span>
                        </Button>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              ))}

              {/* GPS Accuracy Circles */}
              {processedLocations.map((location) => (
                <Circle
                  key={`circle-${location.user_id}`}
                  center={[location.latitude, location.longitude]}
                  radius={location.gps_accuracy}
                  pathOptions={{
                    fillColor: location.status === 'critical' ? '#ef4444' : 
                               location.status === 'warning' ? '#f59e0b' : '#22c55e',
                    fillOpacity: 0.1,
                    color: location.status === 'critical' ? '#ef4444' : 
                           location.status === 'warning' ? '#f59e0b' : '#22c55e',
                    weight: 1,
                    opacity: 0.3,
                  }}
                />
              ))}
            </MapContainer>
          )}
        </div>

        {/* Sidebar */}
        {showUserInfo && (
          <div className="w-80 border-l border-gray-200 bg-gray-50">
            <div className="p-4">
              <h4 className="font-medium text-gray-900 mb-4">
                Workers ({processedLocations.length})
              </h4>
              
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {processedLocations.map((location) => (
                  <div
                    key={location.user_id}
                    className={`p-3 bg-white rounded-lg border cursor-pointer transition-colors hover:bg-gray-50 ${
                      selectedUser?.user_id === location.user_id ? 'ring-2 ring-blue-500' : ''
                    }`}
                    onClick={() => handleUserSelect(location.user_id)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-gray-900">
                        {location.user_name}
                      </span>
                      <div className="flex items-center space-x-1">
                        {location.hasAlerts && (
                          <ExclamationTriangleIconSolid className="h-4 w-4 text-red-500" />
                        )}
                        <Badge variant={getStatusBadge(location.status)} size="small">
                          {location.status}
                        </Badge>
                      </div>
                    </div>
                    
                    {location.vitals && (
                      <div className="text-xs text-gray-600 grid grid-cols-3 gap-1">
                        <div>♥ {location.vitals.heart_rate}</div>
                        <div>🫁 {location.vitals.spo2}%</div>
                        <div>🌡 {location.vitals.temperature}°C</div>
                      </div>
                    )}
                    
                    <div className="text-xs text-gray-500 mt-1">
                      {formatDistanceToNow(new Date(location.timestamp), { addSuffix: true })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Status Bar */}
      <div className="px-4 py-2 bg-gray-50 border-t border-gray-200 flex items-center justify-between text-xs text-gray-600">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-1">
            <div className="w-2 h-2 bg-green-400 rounded-full"></div>
            <span>Online ({processedLocations.filter(l => l.status === 'online').length})</span>
          </div>
          <div className="flex items-center space-x-1">
            <div className="w-2 h-2 bg-yellow-400 rounded-full"></div>
            <span>Warning ({processedLocations.filter(l => l.status === 'warning').length})</span>
          </div>
          <div className="flex items-center space-x-1">
            <div className="w-2 h-2 bg-red-400 rounded-full"></div>
            <span>Critical ({processedLocations.filter(l => l.status === 'critical').length})</span>
          </div>
          <div className="flex items-center space-x-1">
            <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
            <span>Offline ({processedLocations.filter(l => l.status === 'offline').length})</span>
          </div>
        </div>
        
        <div>
          Click on markers for detailed information
        </div>
      </div>
    </div>
  );
};

export default MapView;