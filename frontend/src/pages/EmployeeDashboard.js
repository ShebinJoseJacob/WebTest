import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import toast from 'react-hot-toast';
import {
  HeartIcon,
  ClockIcon,
  BellAlertIcon,
  MapPinIcon,
  ShieldCheckIcon,
  ExclamationTriangleIcon,
  CalendarDaysIcon,
  ChartBarIcon,
  UserIcon,
  SignalIcon,
} from '@heroicons/react/24/outline';
import {
  HeartIcon as HeartIconSolid,
  BellAlertIcon as BellAlertIconSolid,
  ExclamationTriangleIcon as ExclamationTriangleIconSolid,
} from '@heroicons/react/24/solid';

import { selectAuth, selectSocket } from '../store/selectors';
import { fetchUserVitals, fetchUserVitalsHistory } from '../store/slices/vitalsSlice';
import { fetchUserAlerts } from '../store/slices/alertsSlice';
import { fetchUserAttendance } from '../store/slices/attendanceSlice';

import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import RefreshButton from '../components/ui/RefreshButton';
// Import icons for charts
import { Heart, Activity, Thermometer } from 'lucide-react';
import PersonalAttendanceChart from '../components/charts/PersonalAttendanceChart';
import PersonalAlertsList from '../components/alerts/PersonalAlertsList';
import HealthStatusCard from '../components/dashboard/HealthStatusCard';
import AttendanceStatusCard from '../components/dashboard/AttendanceStatusCard';
import DeviceStatusCard from '../components/dashboard/DeviceStatusCard';
import PersonalStats from '../components/dashboard/PersonalStats';

const EmployeeDashboard = () => {
  const dispatch = useDispatch();
  const { user } = useSelector(selectAuth);
  const { isConnected } = useSelector(selectSocket);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedTimeRange, setSelectedTimeRange] = useState('24h');

  // Dashboard data states
  const [dashboardData, setDashboardData] = useState({
    vitals: {
      latest: null,
      history: [],
      isLoading: true,
      error: null,
    },
    alerts: {
      recent: [],
      unacknowledged: [],
      isLoading: true,
      error: null,
    },
    attendance: {
      today: null,
      recent: [],
      isLoading: true,
      error: null,
    },
    deviceStatus: {
      isOnline: false,
      lastSeen: null,
      batteryLevel: 0,
      signalStrength: 0,
    },
  });

  // Fetch dashboard data
  const fetchDashboardData = async (showLoading = true) => {
    try {
      if (showLoading) {
        setDashboardData(prev => ({
          ...prev,
          vitals: { ...prev.vitals, isLoading: true },
          alerts: { ...prev.alerts, isLoading: true },
          attendance: { ...prev.attendance, isLoading: true },
        }));
      }

      // Fetch all data in parallel
      const [vitalsResult, vitalsHistoryResult, alertsResult, attendanceResult] = 
        await Promise.allSettled([
          dispatch(fetchUserVitals(user.id)).unwrap(),
          dispatch(fetchUserVitalsHistory({ userId: user.id, timeRange: selectedTimeRange })).unwrap(),
          dispatch(fetchUserAlerts(user.id)).unwrap(),
          dispatch(fetchUserAttendance(user.id)).unwrap(),
        ]);

      // Update vitals data
      if (vitalsResult.status === 'fulfilled') {
        const vitalsData = vitalsResult.value;
        const historyData = vitalsHistoryResult.status === 'fulfilled' ? vitalsHistoryResult.value.vitals : [];
        
        setDashboardData(prev => ({
          ...prev,
          vitals: {
            latest: vitalsData.vitals?.[0] || null,
            history: historyData,
            isLoading: false,
            error: null,
          },
          deviceStatus: {
            ...prev.deviceStatus,
            isOnline: vitalsData.vitals?.[0] ? new Date() - new Date(vitalsData.vitals[0].timestamp) < 300000 : false, // 5 minutes
            lastSeen: vitalsData.vitals?.[0]?.timestamp || null,
          },
        }));
      } else {
        setDashboardData(prev => ({
          ...prev,
          vitals: {
            ...prev.vitals,
            isLoading: false,
            error: vitalsResult.reason?.message || 'Failed to fetch vitals',
          },
        }));
      }

      // Update alerts data
      if (alertsResult.status === 'fulfilled') {
        const alertsData = alertsResult.value.alerts || [];
        setDashboardData(prev => ({
          ...prev,
          alerts: {
            recent: alertsData.slice(0, 10),
            unacknowledged: alertsData.filter(alert => !alert.acknowledged),
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
            error: alertsResult.reason?.message || 'Failed to fetch alerts',
          },
        }));
      }

      // Update attendance data
      if (attendanceResult.status === 'fulfilled') {
        const attendanceData = attendanceResult.value.attendance || [];
        setDashboardData(prev => ({
          ...prev,
          attendance: {
            today: attendanceData.find(att => 
              new Date(att.date).toDateString() === new Date().toDateString()
            ) || null,
            recent: attendanceData.slice(0, 7),
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
            error: attendanceResult.reason?.message || 'Failed to fetch attendance',
          },
        }));
      }

      setLastRefresh(new Date());
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      toast.error('Failed to refresh dashboard data');
    }
  };

  // Initial data fetch
  useEffect(() => {
    fetchDashboardData();
  }, [selectedTimeRange]);

  // Auto refresh every 30 seconds
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchDashboardData(false);
    }, 30000);

    return () => clearInterval(interval);
  }, [autoRefresh, selectedTimeRange]);

  // Handle manual refresh
  const handleRefresh = () => {
    fetchDashboardData();
  };

  // Toggle auto refresh
  const toggleAutoRefresh = () => {
    setAutoRefresh(!autoRefresh);
    toast.success(`Auto refresh ${!autoRefresh ? 'enabled' : 'disabled'}`);
  };

  // Get health status from latest vitals
  const getHealthStatus = () => {
    if (!dashboardData.vitals.latest) {
      return { status: 'unknown', message: 'No data available', color: 'gray' };
    }

    const vitals = dashboardData.vitals.latest;
    const issues = [];

    if (vitals.heart_rate < 60 || vitals.heart_rate > 100) issues.push('Heart rate');
    if (vitals.spo2 < 95) issues.push('Oxygen saturation');
    if (vitals.temperature < 36.0 || vitals.temperature > 37.5) issues.push('Temperature');
    if (vitals.fall_detected) issues.push('Fall detected');

    if (issues.length === 0) {
      return { status: 'good', message: 'All vitals normal', color: 'green' };
    } else if (issues.some(issue => issue === 'Fall detected' || vitals.heart_rate < 50 || vitals.spo2 < 90)) {
      return { status: 'critical', message: `Critical: ${issues.join(', ')}`, color: 'red' };
    } else {
      return { status: 'warning', message: `Warning: ${issues.join(', ')}`, color: 'orange' };
    }
  };

  const healthStatus = getHealthStatus();

  // Get connection status
  const getConnectionStatus = () => {
    if (isConnected && dashboardData.deviceStatus.isOnline) {
      return { color: 'green', text: 'Connected', pulse: true };
    } else if (isConnected) {
      return { color: 'yellow', text: 'Device Offline', pulse: false };
    }
    return { color: 'red', text: 'Disconnected', pulse: false };
  };

  const connectionStatus = getConnectionStatus();

  return (
    <>
      <Helmet>
        <title>My Dashboard - IoT Monitoring</title>
        <meta name="description" content="Personal health and safety monitoring dashboard" />
      </Helmet>

      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Welcome, {user?.name}
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              Monitor your health and safety status
            </p>
          </div>
          
          <div className="mt-4 sm:mt-0 flex items-center space-x-4">
            {/* Connection Status */}
            <div className="flex items-center space-x-2">
              <div className={`h-3 w-3 rounded-full bg-${connectionStatus.color}-400 ${connectionStatus.pulse ? 'animate-pulse' : ''}`} />
              <span className="text-sm text-gray-600">{connectionStatus.text}</span>
            </div>
            
            {/* Last Refresh */}
            <span className="text-sm text-gray-500">
              Last updated: {lastRefresh.toLocaleTimeString()}
            </span>

            {/* Auto Refresh Toggle */}
            <Button
              variant={autoRefresh ? 'primary' : 'secondary'}
              size="small"
              onClick={toggleAutoRefresh}
              className="flex items-center space-x-1"
            >
              <SignalIcon className={`h-4 w-4 ${autoRefresh ? 'animate-pulse' : ''}`} />
              <span>{autoRefresh ? 'Auto' : 'Manual'}</span>
            </Button>

            {/* Manual Refresh */}
            <RefreshButton
              onRefresh={handleRefresh}
              isLoading={dashboardData.vitals.isLoading}
            />
          </div>
        </div>
      </div>

      {/* Alert Banner for Critical Issues */}
      {healthStatus.status === 'critical' && (
        <div className="mb-6 bg-red-50 border-l-4 border-red-400 p-4 rounded-lg">
          <div className="flex items-center">
            <ExclamationTriangleIconSolid className="h-5 w-5 text-red-400 mr-2" />
            <p className="text-sm text-red-700">
              <strong>Critical Health Alert:</strong> {healthStatus.message}
            </p>
            <Link 
              to="/dashboard/employee/alerts" 
              className="ml-auto text-sm text-red-700 hover:text-red-800 font-medium"
            >
              View Details →
            </Link>
          </div>
        </div>
      )}

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <HealthStatusCard
          vitals={dashboardData.vitals.latest}
          status={healthStatus}
          loading={dashboardData.vitals.isLoading}
        />
        <AttendanceStatusCard
          attendance={dashboardData.attendance.today}
          loading={dashboardData.attendance.isLoading}
        />
        <DeviceStatusCard
          deviceStatus={dashboardData.deviceStatus}
          isConnected={isConnected}
        />
      </div>

      {/* Personal Stats */}
      <div className="mb-8">
        <PersonalStats
          vitals={dashboardData.vitals.latest}
          attendance={dashboardData.attendance.recent}
          alerts={dashboardData.alerts.recent}
          loading={dashboardData.vitals.isLoading}
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Personal Vitals Chart */}
        <div className="lg:col-span-2">
          <Card>
            <Card.Header>
              <Card.Title className="flex items-center">
                <HeartIconSolid className="h-5 w-5 text-red-500 mr-2" />
                My Vital Signs
              </Card.Title>
              <div className="flex items-center space-x-2">
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
                <Badge variant={healthStatus.color === 'green' ? 'success' : healthStatus.color === 'red' ? 'danger' : 'warning'}>
                  {healthStatus.status.toUpperCase()}
                </Badge>
              </div>
            </Card.Header>
            <Card.Content>
              {dashboardData.vitals.isLoading ? (
                <div className="flex items-center justify-center h-64">
                  <LoadingSpinner size="large" />
                </div>
              ) : dashboardData.vitals.error ? (
                <div className="flex items-center justify-center h-64 text-gray-500">
                  <p>Error loading vitals data</p>
                </div>
              ) : (
                <PersonalVitalsChart 
                  data={dashboardData.vitals.history} 
                  timeRange={selectedTimeRange}
                  height={300}
                />
              )}
            </Card.Content>
          </Card>
        </div>
      </div>

      {/* Second Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Recent Alerts */}
        <Card>
          <Card.Header>
            <Card.Title className="flex items-center">
              <BellAlertIconSolid className="h-5 w-5 text-orange-500 mr-2" />
              Recent Alerts
              {dashboardData.alerts.unacknowledged.length > 0 && (
                <Badge variant="danger" className="ml-2">
                  {dashboardData.alerts.unacknowledged.length}
                </Badge>
              )}
            </Card.Title>
            <Link to="/dashboard/employee/alerts">
              <Button variant="ghost" size="small">
                View All
              </Button>
            </Link>
          </Card.Header>
          <Card.Content>
            {dashboardData.alerts.isLoading ? (
              <div className="flex items-center justify-center h-32">
                <LoadingSpinner />
              </div>
            ) : (
              <PersonalAlertsList 
                alerts={dashboardData.alerts.recent.slice(0, 5)} 
                onAcknowledge={(alertId) => {
                  toast.success('Alert acknowledged');
                }}
              />
            )}
          </Card.Content>
        </Card>

        {/* Attendance History */}
        <Card>
          <Card.Header>
            <Card.Title className="flex items-center">
              <CalendarDaysIcon className="h-5 w-5 text-blue-500 mr-2" />
              My Attendance
            </Card.Title>
            <Link to="/dashboard/employee/attendance">
              <Button variant="ghost" size="small">
                <ChartBarIcon className="h-4 w-4 mr-1" />
                View History
              </Button>
            </Link>
          </Card.Header>
          <Card.Content>
            {dashboardData.attendance.isLoading ? (
              <div className="flex items-center justify-center h-32">
                <LoadingSpinner />
              </div>
            ) : (
              <PersonalAttendanceChart 
                data={dashboardData.attendance.recent} 
                height={200}
              />
            )}
          </Card.Content>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Link to="/dashboard/employee/vitals" className="block">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer">
            <Card.Content className="flex items-center p-4">
              <HeartIcon className="h-8 w-8 text-red-500 mr-3" />
              <div>
                <h3 className="font-medium text-gray-900">View Vitals</h3>
                <p className="text-sm text-gray-500">Detailed health data</p>
              </div>
            </Card.Content>
          </Card>
        </Link>

        <Link to="/dashboard/employee/alerts" className="block">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer">
            <Card.Content className="flex items-center p-4">
              <BellAlertIcon className="h-8 w-8 text-orange-500 mr-3" />
              <div>
                <h3 className="font-medium text-gray-900">My Alerts</h3>
                <p className="text-sm text-gray-500">Safety notifications</p>
              </div>
            </Card.Content>
          </Card>
        </Link>

        <Link to="/dashboard/employee/attendance" className="block">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer">
            <Card.Content className="flex items-center p-4">
              <ClockIcon className="h-8 w-8 text-blue-500 mr-3" />
              <div>
                <h3 className="font-medium text-gray-900">Attendance</h3>
                <p className="text-sm text-gray-500">Time tracking</p>
              </div>
            </Card.Content>
          </Card>
        </Link>

        <Link to="/dashboard/employee/profile" className="block">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer">
            <Card.Content className="flex items-center p-4">
              <UserIcon className="h-8 w-8 text-purple-500 mr-3" />
              <div>
                <h3 className="font-medium text-gray-900">Profile</h3>
                <p className="text-sm text-gray-500">Personal settings</p>
              </div>
            </Card.Content>
          </Card>
        </Link>
      </div>

      {/* Safety Tips */}
      <Card>
        <Card.Header>
          <Card.Title className="flex items-center">
            <ShieldCheckIcon className="h-5 w-5 text-green-500 mr-2" />
            Daily Safety Reminder
          </Card.Title>
        </Card.Header>
        <Card.Content>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <ShieldCheckIcon className="h-5 w-5 text-blue-400" />
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-blue-800">
                  Stay Safe Today
                </h3>
                <div className="mt-2 text-sm text-blue-700">
                  <ul className="list-disc list-inside space-y-1">
                    <li>Keep your device charged and properly positioned</li>
                    <li>Stay hydrated and take regular breaks</li>
                    <li>Report any unusual symptoms immediately</li>
                    <li>Follow all safety protocols for your work area</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </Card.Content>
      </Card>
    </>
  );
};

// Vital Chart Component
function VitalChart({ title, data, dataKey, unit, color, icon: Icon, normalRange }) {
  const chartData = data || [];
  
  const latestValue = chartData[chartData.length - 1]?.[dataKey];
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipData, setTooltipData] = useState(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  
  const handleChartMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const validData = chartData.filter(point => point[dataKey] != null && !isNaN(point[dataKey]));
    
    if (validData.length === 0) return;
    
    const minValue = Math.min(...validData.map(d => d[dataKey]));
    const maxValue = Math.max(...validData.map(d => d[dataKey]));
    const valueRange = maxValue - minValue || 1;
    
    let closestIndex = 0;
    let closestDistance = Infinity;
    
    validData.forEach((point, index) => {
      const svgX = (index / (validData.length - 1)) * 100;
      const svgY = 100 - ((point[dataKey] - minValue) / valueRange * 100);
      
      const pointX = (svgX / 100) * rect.width;
      const pointY = (svgY / 100) * rect.height;
      
      const distance = Math.sqrt(Math.pow(x - pointX, 2) + Math.pow(y - pointY, 2));
      
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });
    
    const hoveredData = validData[closestIndex];
    
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
      
      <div 
        className="h-24 w-full bg-gray-50 rounded-lg mb-2 relative overflow-visible cursor-crosshair hover:bg-gray-100 transition-colors"
        onMouseMove={handleChartMouseMove}
        onMouseLeave={() => {
          setShowTooltip(false);
          setTooltipData(null);
        }}
      >
        {chartData.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400">
            <div className="text-center">
              <Icon className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <div className="text-sm">No data available</div>
            </div>
          </div>
        ) : (
          <svg className="w-full h-full pointer-events-none">
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
        
        {showTooltip && tooltipData && (
          <div 
            className="absolute z-[9999] pointer-events-none bg-gray-800 text-white px-2 py-1 rounded text-xs"
            style={{
              left: mousePosition.x + 10,
              top: mousePosition.y - 30,
            }}
          >
            {Math.round(tooltipData.value * 10) / 10} {unit}
          </div>
        )}
      </div>
      
      <div className="text-xs text-gray-500">
        Normal: {normalRange}
      </div>
    </div>
  );
}

// Personal Vitals Chart Component that combines all three charts
function PersonalVitalsChart({ data, timeRange, height }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <VitalChart
        title="Heart Rate"
        data={data}
        dataKey="heart_rate"
        unit="bpm"
        color="#ef4444"
        icon={Heart}
        normalRange="60-100"
      />
      <VitalChart
        title="SpO2"
        data={data}
        dataKey="spo2"
        unit="%"
        color="#3b82f6"
        icon={Activity}
        normalRange="95-100"
      />
      <VitalChart
        title="Temperature"
        data={data}
        dataKey="temperature"
        unit="°C"
        color="#f59e0b"
        icon={Thermometer}
        normalRange="36.1-37.2"
      />
    </div>
  );
}

export default EmployeeDashboard;