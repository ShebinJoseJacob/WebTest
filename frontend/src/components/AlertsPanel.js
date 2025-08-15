import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { formatDistanceToNow, format } from 'date-fns';
import toast from 'react-hot-toast';
import {
  BellAlertIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XMarkIcon,
  FunnelIcon,
  ArrowPathIcon,
  EyeIcon,
  SpeakerWaveIcon,
  SpeakerXMarkIcon,
} from '@heroicons/react/24/outline';
import {
  ExclamationTriangleIcon as ExclamationTriangleIconSolid,
  BellAlertIcon as BellAlertIconSolid,
} from '@heroicons/react/24/solid';

import { selectAuth, selectSocket } from '../store/selectors';
import { acknowledgeAlert, acknowledgeMultipleAlerts } from '../store/slices/alertsSlice';

import Card from './ui/Card';
import Button from './ui/Button';
import Badge from './ui/Badge';
import LoadingSpinner from './ui/LoadingSpinner';
import Checkbox from './ui/Checkbox';
import AlertSound from './AlertSound';

const AlertsPanel = ({
  alerts = [],
  isLoading = false,
  error = null,
  showFilters = true,
  allowAcknowledge = true,
  allowBulkActions = true,
  maxHeight = '600px',
  compact = false,
  onRefresh,
  onAlertClick,
  className = '',
}) => {
  const dispatch = useDispatch();
  const { user } = useSelector(selectAuth);
  const { isConnected } = useSelector(selectSocket);

  const [selectedAlerts, setSelectedAlerts] = useState(new Set());
  const [filters, setFilters] = useState({
    severity: 'all',
    type: 'all',
    acknowledged: 'all',
    timeRange: 'all',
  });
  const [sortBy, setSortBy] = useState('timestamp');
  const [sortOrder, setSortOrder] = useState('desc');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [acknowledging, setAcknowledging] = useState(new Set());

  // Filter and sort alerts
  const filteredAlerts = React.useMemo(() => {
    let filtered = [...alerts];

    // Apply filters
    if (filters.severity !== 'all') {
      filtered = filtered.filter(alert => alert.severity === filters.severity);
    }

    if (filters.type !== 'all') {
      filtered = filtered.filter(alert => alert.type === filters.type);
    }

    if (filters.acknowledged !== 'all') {
      const isAcknowledged = filters.acknowledged === 'acknowledged';
      filtered = filtered.filter(alert => alert.acknowledged === isAcknowledged);
    }

    if (filters.timeRange !== 'all') {
      const now = new Date();
      const hours = parseInt(filters.timeRange);
      const cutoff = new Date(now.getTime() - hours * 60 * 60 * 1000);
      filtered = filtered.filter(alert => new Date(alert.timestamp) >= cutoff);
    }

    // Sort alerts
    filtered.sort((a, b) => {
      let aVal, bVal;

      switch (sortBy) {
        case 'severity':
          const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
          aVal = severityOrder[a.severity] || 0;
          bVal = severityOrder[b.severity] || 0;
          break;
        case 'type':
          aVal = a.type;
          bVal = b.type;
          break;
        case 'user':
          aVal = a.user_name || '';
          bVal = b.user_name || '';
          break;
        default:
          aVal = new Date(a.timestamp).getTime();
          bVal = new Date(b.timestamp).getTime();
      }

      if (sortOrder === 'desc') {
        return bVal > aVal ? 1 : -1;
      }
      return aVal > bVal ? 1 : -1;
    });

    return filtered;
  }, [alerts, filters, sortBy, sortOrder]);

  // Get critical alerts for sound notification
  const criticalAlerts = alerts.filter(alert => 
    alert.severity === 'critical' && !alert.acknowledged
  );

  // Reset selected alerts when alerts change
  useEffect(() => {
    setSelectedAlerts(new Set());
  }, [alerts]);

  // Handle single alert selection
  const toggleAlertSelection = (alertId) => {
    const newSelected = new Set(selectedAlerts);
    if (newSelected.has(alertId)) {
      newSelected.delete(alertId);
    } else {
      newSelected.add(alertId);
    }
    setSelectedAlerts(newSelected);
  };

  // Handle select all
  const toggleSelectAll = () => {
    if (selectedAlerts.size === filteredAlerts.length) {
      setSelectedAlerts(new Set());
    } else {
      setSelectedAlerts(new Set(filteredAlerts.map(alert => alert.id)));
    }
  };

  // Handle single alert acknowledgment
  const handleAcknowledgeAlert = async (alertId) => {
    if (!allowAcknowledge) return;

    setAcknowledging(prev => new Set(prev).add(alertId));

    try {
      await dispatch(acknowledgeAlert(alertId)).unwrap();
      toast.success('Alert acknowledged');
    } catch (error) {
      console.error('Error acknowledging alert:', error);
      toast.error('Failed to acknowledge alert');
    } finally {
      setAcknowledging(prev => {
        const newSet = new Set(prev);
        newSet.delete(alertId);
        return newSet;
      });
    }
  };

  // Handle bulk acknowledgment
  const handleBulkAcknowledge = async () => {
    if (!allowBulkActions || selectedAlerts.size === 0) return;

    const alertIds = Array.from(selectedAlerts);
    
    try {
      await dispatch(acknowledgeMultipleAlerts(alertIds)).unwrap();
      toast.success(`${alertIds.length} alert(s) acknowledged`);
      setSelectedAlerts(new Set());
    } catch (error) {
      console.error('Error acknowledging alerts:', error);
      toast.error('Failed to acknowledge alerts');
    }
  };

  // Get alert icon based on severity and type
  const getAlertIcon = (alert) => {
    if (alert.severity === 'critical') {
      return ExclamationTriangleIconSolid;
    }
    if (alert.type === 'fall') {
      return ExclamationTriangleIconSolid;
    }
    return BellAlertIconSolid;
  };

  // Get alert color based on severity
  const getAlertColor = (severity) => {
    const colors = {
      critical: 'text-red-600 bg-red-50 border-red-200',
      high: 'text-orange-600 bg-orange-50 border-orange-200',
      medium: 'text-yellow-600 bg-yellow-50 border-yellow-200',
      low: 'text-blue-600 bg-blue-50 border-blue-200',
    };
    return colors[severity] || colors.low;
  };

  // Get badge variant for severity
  const getSeverityBadge = (severity) => {
    const variants = {
      critical: 'danger',
      high: 'warning',
      medium: 'info',
      low: 'secondary',
    };
    return variants[severity] || 'secondary';
  };

  return (
    <div className={`bg-white rounded-lg border border-gray-200 ${className}`}>
      {/* Alert Sound */}
      <AlertSound 
        alerts={criticalAlerts} 
        isEnabled={soundEnabled}
      />

      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <BellAlertIcon className="h-5 w-5 text-gray-600" />
            <h3 className="text-lg font-medium text-gray-900">
              Alerts {compact ? '' : 'Management'}
            </h3>
            {criticalAlerts.length > 0 && (
              <Badge variant="danger" className="animate-pulse">
                {criticalAlerts.length} Critical
              </Badge>
            )}
          </div>
          
          <div className="flex items-center space-x-2">
            {/* Sound Toggle */}
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`p-1 rounded ${
                soundEnabled 
                  ? 'text-blue-600 hover:bg-blue-50' 
                  : 'text-gray-400 hover:bg-gray-50'
              }`}
              title={soundEnabled ? 'Disable sound' : 'Enable sound'}
            >
              {soundEnabled ? (
                <SpeakerWaveIcon className="h-4 w-4" />
              ) : (
                <SpeakerXMarkIcon className="h-4 w-4" />
              )}
            </button>

            {/* Connection Status */}
            <div className={`h-2 w-2 rounded-full ${
              isConnected ? 'bg-green-400 animate-pulse' : 'bg-red-400'
            }`} title={isConnected ? 'Connected' : 'Disconnected'} />

            {/* Refresh Button */}
            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={isLoading}
                className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-50"
                title="Refresh alerts"
              >
                <ArrowPathIcon className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        {showFilters && !compact && (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <select
              value={filters.severity}
              onChange={(e) => setFilters(prev => ({ ...prev, severity: e.target.value }))}
              className="text-sm border border-gray-300 rounded-md px-3 py-1"
            >
              <option value="all">All Severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>

            <select
              value={filters.type}
              onChange={(e) => setFilters(prev => ({ ...prev, type: e.target.value }))}
              className="text-sm border border-gray-300 rounded-md px-3 py-1"
            >
              <option value="all">All Types</option>
              <option value="fall">Fall Detection</option>
              <option value="heart_rate">Heart Rate</option>
              <option value="spo2">SpO2</option>
              <option value="temperature">Temperature</option>
              <option value="offline">Device Offline</option>
            </select>

            <select
              value={filters.acknowledged}
              onChange={(e) => setFilters(prev => ({ ...prev, acknowledged: e.target.value }))}
              className="text-sm border border-gray-300 rounded-md px-3 py-1"
            >
              <option value="all">All Status</option>
              <option value="unacknowledged">Unacknowledged</option>
              <option value="acknowledged">Acknowledged</option>
            </select>

            <select
              value={filters.timeRange}
              onChange={(e) => setFilters(prev => ({ ...prev, timeRange: e.target.value }))}
              className="text-sm border border-gray-300 rounded-md px-3 py-1"
            >
              <option value="all">All Time</option>
              <option value="1">Last Hour</option>
              <option value="6">Last 6 Hours</option>
              <option value="24">Last 24 Hours</option>
              <option value="168">Last Week</option>
            </select>
          </div>
        )}

        {/* Bulk Actions */}
        {allowBulkActions && selectedAlerts.size > 0 && (
          <div className="mt-4 flex items-center justify-between p-3 bg-blue-50 rounded-lg">
            <span className="text-sm text-blue-700">
              {selectedAlerts.size} alert(s) selected
            </span>
            <Button
              variant="primary"
              size="small"
              onClick={handleBulkAcknowledge}
              className="flex items-center space-x-1"
            >
              <CheckCircleIcon className="h-4 w-4" />
              <span>Acknowledge Selected</span>
            </Button>
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ maxHeight }} className="overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <LoadingSpinner size="large" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center p-8 text-red-500">
            <ExclamationTriangleIcon className="h-8 w-8 mr-2" />
            <span>Error loading alerts: {error}</span>
          </div>
        ) : filteredAlerts.length === 0 ? (
          <div className="flex items-center justify-center p-8 text-gray-500">
            <div className="text-center">
              <BellAlertIcon className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <p>No alerts found</p>
              <p className="text-sm text-gray-400 mt-2">
                {alerts.length === 0 ? 'All clear!' : 'Try adjusting your filters'}
              </p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {/* Select All Header */}
            {allowBulkActions && !compact && (
              <div className="p-3 bg-gray-50 flex items-center space-x-3">
                <Checkbox
                  checked={selectedAlerts.size === filteredAlerts.length && filteredAlerts.length > 0}
                  indeterminate={selectedAlerts.size > 0 && selectedAlerts.size < filteredAlerts.length}
                  onChange={toggleSelectAll}
                />
                <span className="text-sm font-medium text-gray-700">
                  Select All ({filteredAlerts.length})
                </span>
                <div className="flex-1" />
                <select
                  value={`${sortBy}-${sortOrder}`}
                  onChange={(e) => {
                    const [field, order] = e.target.value.split('-');
                    setSortBy(field);
                    setSortOrder(order);
                  }}
                  className="text-xs border border-gray-300 rounded px-2 py-1"
                >
                  <option value="timestamp-desc">Newest First</option>
                  <option value="timestamp-asc">Oldest First</option>
                  <option value="severity-desc">Severity High-Low</option>
                  <option value="severity-asc">Severity Low-High</option>
                  <option value="type-asc">Type A-Z</option>
                  <option value="user-asc">User A-Z</option>
                </select>
              </div>
            )}

            {/* Alerts List */}
            {filteredAlerts.map((alert) => {
              const AlertIcon = getAlertIcon(alert);
              const isSelected = selectedAlerts.has(alert.id);
              const isAcknowledging = acknowledging.has(alert.id);

              return (
                <div
                  key={alert.id}
                  className={`p-4 hover:bg-gray-50 transition-colors ${
                    alert.acknowledged ? 'opacity-60' : ''
                  } ${
                    alert.severity === 'critical' && !alert.acknowledged
                      ? 'bg-red-50 border-l-4 border-l-red-500'
                      : ''
                  }`}
                >
                  <div className="flex items-start space-x-3">
                    {/* Selection Checkbox */}
                    {allowBulkActions && (
                      <Checkbox
                        checked={isSelected}
                        onChange={() => toggleAlertSelection(alert.id)}
                        className="mt-1"
                      />
                    )}

                    {/* Alert Icon */}
                    <div className={`flex-shrink-0 p-1 rounded-full ${getAlertColor(alert.severity)}`}>
                      <AlertIcon className="h-5 w-5" />
                    </div>

                    {/* Alert Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-2">
                          <Badge variant={getSeverityBadge(alert.severity)}>
                            {alert.severity.toUpperCase()}
                          </Badge>
                          <Badge variant="secondary">
                            {alert.type.replace('_', ' ').toUpperCase()}
                          </Badge>
                          {alert.user_name && (
                            <span className="text-sm text-gray-600">
                              {alert.user_name}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-gray-500">
                          {formatDistanceToNow(new Date(alert.timestamp), { addSuffix: true })}
                        </span>
                      </div>

                      <p className="text-sm text-gray-900 mb-2">
                        {alert.message}
                      </p>

                      {/* Alert Details */}
                      {(alert.value || alert.threshold) && (
                        <div className="text-xs text-gray-600 mb-2">
                          {alert.value && (
                            <span>Value: {alert.value}</span>
                          )}
                          {alert.threshold && alert.value && <span className="mx-2">•</span>}
                          {alert.threshold && (
                            <span>Threshold: {alert.threshold}</span>
                          )}
                        </div>
                      )}

                      {/* Acknowledgment Info */}
                      {alert.acknowledged && (
                        <div className="text-xs text-green-600 mb-2">
                          ✓ Acknowledged by {alert.acknowledged_by_name || 'System'} 
                          {alert.acknowledged_at && (
                            <span className="ml-1">
                              on {format(new Date(alert.acknowledged_at), 'MMM dd, HH:mm')}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex items-center space-x-2">
                        {allowAcknowledge && !alert.acknowledged && (
                          <Button
                            variant="secondary"
                            size="small"
                            onClick={() => handleAcknowledgeAlert(alert.id)}
                            disabled={isAcknowledging}
                            className="flex items-center space-x-1"
                          >
                            {isAcknowledging ? (
                              <LoadingSpinner size="small" />
                            ) : (
                              <CheckCircleIcon className="h-4 w-4" />
                            )}
                            <span>Acknowledge</span>
                          </Button>
                        )}
                        
                        {onAlertClick && (
                          <Button
                            variant="ghost"
                            size="small"
                            onClick={() => onAlertClick(alert)}
                            className="flex items-center space-x-1"
                          >
                            <EyeIcon className="h-4 w-4" />
                            <span>Details</span>
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      {!compact && filteredAlerts.length > 0 && (
        <div className="p-3 bg-gray-50 border-t border-gray-200 text-xs text-gray-600 flex justify-between">
          <span>
            Showing {filteredAlerts.length} of {alerts.length} alerts
          </span>
          <span>
            {criticalAlerts.length > 0 && (
              <span className="text-red-600 font-medium">
                {criticalAlerts.length} critical unacknowledged
              </span>
            )}
          </span>
        </div>
      )}
    </div>
  );
};

export default AlertsPanel;