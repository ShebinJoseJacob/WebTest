import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import toast from 'react-hot-toast';
import {
  ExclamationTriangleIcon,
  UserGroupIcon,
  MapPinIcon,
  ClockIcon,
  HeartIcon,
  SignalIcon,
  BellAlertIcon,
  EyeIcon,
  ArrowPathIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline';
import {
  ExclamationTriangleIcon as ExclamationTriangleIconSolid,
  BellAlertIcon as BellAlertIconSolid,
} from '@heroicons/react/24/solid';

import { selectAuth, selectSocket } from '../store/selectors';
import { fetchLatestVitals, fetchVitalsSummary } from '../store/slices/vitalsSlice';
import { fetchUnacknowledgedAlerts, fetchCriticalAlerts } from '../store/slices/alertsSlice';
import { fetchTodayAttendance } from '../store/slices/attendanceSlice';

import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import RefreshButton from '../components/ui/RefreshButton';
import AlertSound from '../components/AlertSound';
import VitalsChart from '../components/charts/VitalsChart';
import AttendanceChart from '../components/charts/AttendanceChart';
import AlertsList from '../components/alerts/AlertsList';
import LocationMap from '../components/map/LocationMap';
import StatCard from '../components/dashboard/StatCard';
import QuickActions from '../components/dashboard/QuickActions';
import RecentActivity from '../components/dashboard/RecentActivity';

const SupervisorDashboard = () => {
  const dispatch = useDispatch();
  const { user } = useSelector(selectAuth);
  const { isConnected } = useSelector(selectSocket);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [showCriticalOnly, setShowCriticalOnly] = useState(false);

  // Dashboard data states
  const [dashboardData, setDashboardData] = useState({
    vitals: {
      data: [],
      summary: null,
      isLoading: true,
      error: null,
    },
    alerts: {
      unacknowledged: [],
      critical: [],
      isLoading: true,
      error: null,
    },
    attendance: {
      today: [],
      isLoading: true,
      error: null,
    },
    stats: {
      totalEmployees: 0,
      onlineDevices: 0,
      activeAlerts: 0,
      attendanceRate: 0,
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
      const [vitalsResult, summaryResult, alertsResult, criticalResult, attendanceResult] = 
        await Promise.allSettled([
          dispatch(fetchLatestVitals()).unwrap(),
          dispatch(fetchVitalsSummary()).unwrap(),
          dispatch(fetchUnacknowledgedAlerts()).unwrap(),
          dispatch(fetchCriticalAlerts()).unwrap(),
          dispatch(fetchTodayAttendance()).unwrap(),
        ]);

      // Update vitals data
      if (vitalsResult.status === 'fulfilled') {
        setDashboardData(prev => ({
          ...prev,
          vitals: {
            data: vitalsResult.value.vitals || [],
            summary: summaryResult.status === 'fulfilled' ? summaryResult.value.summary : null,
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
            error: vitalsResult.reason?.message || 'Failed to fetch vitals',
          },
        }));
      }

      // Update alerts data
      if (alertsResult.status === 'fulfilled') {
        setDashboardData(prev => ({
          ...prev,
          alerts: {
            unacknowledged: alertsResult.value.alerts || [],
            critical: criticalResult.status === 'fulfilled' ? criticalResult.value.criticalAlerts || [] : [],
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
        const totalEmployees = attendanceData.length;
        const presentCount = attendanceData.filter(emp => emp.status === 'present').length;
        const attendanceRate = totalEmployees > 0 ? Math.round((presentCount / totalEmployees) * 100) : 0;

        setDashboardData(prev => ({
          ...prev,
          attendance: {
            today: attendanceData,
            isLoading: false,
            error: null,
          },
          stats: {
            ...prev.stats,
            totalEmployees,
            attendanceRate,
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

      // Update stats from vitals summary
      if (summaryResult.status === 'fulfilled') {
        const summary = summaryResult.value.summary;
        setDashboardData(prev => ({
          ...prev,
          stats: {
            ...prev.stats,
            onlineDevices: summary?.onlineDevices || 0,
            activeAlerts: summary?.abnormalDevices || 0,
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
  }, []);

  // Auto refresh every 30 seconds
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchDashboardData(false);
    }, 30000);

    return () => clearInterval(interval);
  }, [autoRefresh]);

  // Handle manual refresh
  const handleRefresh = () => {
    fetchDashboardData();
  };

  // Toggle auto refresh
  const toggleAutoRefresh = () => {
    setAutoRefresh(!autoRefresh);
    toast.success(`Auto refresh ${!autoRefresh ? 'enabled' : 'disabled'}`);
  };

  // Get critical alerts for display
  const criticalAlerts = showCriticalOnly 
    ? dashboardData.alerts.critical 
    : dashboardData.alerts.unacknowledged;

  // Get connection status indicator
  const getConnectionStatus = () => {
    if (isConnected) {
      return { color: 'green', text: 'Connected', pulse: true };
    }
    return { color: 'red', text: 'Disconnected', pulse: false };
  };

  const connectionStatus = getConnectionStatus();

  return (
    <>
      <Helmet>
        <title>Supervisor Dashboard - IoT Monitoring</title>
        <meta name="description" content="Real-time supervisor dashboard for worker monitoring" />
      </Helmet>

      {/* Alert Sound Component */}
      <AlertSound 
        alerts={dashboardData.alerts.critical} 
        isEnabled={true}
      />

      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Welcome back, {user?.name}
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              Monitor your team's health and safety in real-time
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
              <ArrowPathIcon className={`h-4 w-4 ${autoRefresh ? 'animate-spin' : ''}`} />
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

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          title="Total Employees"
          value={dashboardData.stats.totalEmployees}
          icon={UserGroupIcon}
          color="blue"
          loading={dashboardData.attendance.isLoading}
        />
        <StatCard
          title="Online Devices"
          value={`${dashboardData.stats.onlineDevices}/${dashboardData.stats.totalEmployees}`}
          icon={SignalIcon}
          color="green"
          loading={dashboardData.vitals.isLoading}
        />
        <StatCard
          title="Active Alerts"
          value={dashboardData.stats.activeAlerts}
          icon={ExclamationTriangleIcon}
          color="red"
          loading={dashboardData.alerts.isLoading}
          clickable
          onClick={() => setShowCriticalOnly(!showCriticalOnly)}
        />
        <StatCard
          title="Attendance Rate"
          value={`${dashboardData.stats.attendanceRate}%`}
          icon={ClockIcon}
          color="purple"
          loading={dashboardData.attendance.isLoading}
        />
      </div>

      {/* Critical Alerts Banner */}
      {dashboardData.alerts.critical.length > 0 && (
        <div className="mb-6 bg-red-50 border-l-4 border-red-400 p-4 rounded-lg">
          <div className="flex items-center">
            <ExclamationTriangleIconSolid className="h-5 w-5 text-red-400 mr-2" />
            <p className="text-sm text-red-700">
              <strong>{dashboardData.alerts.critical.length} critical alert(s)</strong> require immediate attention
            </p>
            <Link 
              to="/dashboard/supervisor/alerts" 
              className="ml-auto text-sm text-red-700 hover:text-red-800 font-medium"
            >
              View All →
            </Link>
          </div>
        </div>
      )}

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Live Vitals Chart */}
        <div className="lg:col-span-2">
          <Card>
            <Card.Header>
              <Card.Title className="flex items-center">
                <HeartIcon className="h-5 w-5 text-red-500 mr-2" />
                Live Vital Signs
              </Card.Title>
              <Badge variant={isConnected ? 'success' : 'danger'}>
                {isConnected ? 'Live' : 'Offline'}
              </Badge>
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
                <VitalsChart 
                  data={dashboardData.vitals.data} 
                  height={300}
                  showControls={true}
                />
              )}
            </Card.Content>
          </Card>
        </div>

        {/* Quick Actions */}
        <div>
          <Card>
            <Card.Header>
              <Card.Title>Quick Actions</Card.Title>
            </Card.Header>
            <Card.Content>
              <QuickActions />
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
              <Badge variant="secondary" className="ml-2">
                {criticalAlerts.length}
              </Badge>
            </Card.Title>
            <div className="flex items-center space-x-2">
              <Button
                variant={showCriticalOnly ? 'primary' : 'secondary'}
                size="small"
                onClick={() => setShowCriticalOnly(!showCriticalOnly)}
              >
                {showCriticalOnly ? 'Critical Only' : 'All Alerts'}
              </Button>
              <Link to="/dashboard/supervisor/alerts">
                <Button variant="ghost" size="small">
                  <EyeIcon className="h-4 w-4 mr-1" />
                  View All
                </Button>
              </Link>
            </div>
          </Card.Header>
          <Card.Content>
            {dashboardData.alerts.isLoading ? (
              <div className="flex items-center justify-center h-32">
                <LoadingSpinner />
              </div>
            ) : (
              <AlertsList 
                alerts={criticalAlerts.slice(0, 5)} 
                compact={true}
                onAcknowledge={(alertId) => {
                  // Handle alert acknowledgment
                  toast.success('Alert acknowledged');
                }}
              />
            )}
          </Card.Content>
        </Card>

        {/* Today's Attendance */}
        <Card>
          <Card.Header>
            <Card.Title className="flex items-center">
              <ClockIcon className="h-5 w-5 text-blue-500 mr-2" />
              Today's Attendance
            </Card.Title>
            <Link to="/dashboard/supervisor/reports">
              <Button variant="ghost" size="small">
                <ChartBarIcon className="h-4 w-4 mr-1" />
                View Reports
              </Button>
            </Link>
          </Card.Header>
          <Card.Content>
            {dashboardData.attendance.isLoading ? (
              <div className="flex items-center justify-center h-32">
                <LoadingSpinner />
              </div>
            ) : (
              <AttendanceChart 
                data={dashboardData.attendance.today} 
                height={200}
              />
            )}
          </Card.Content>
        </Card>
      </div>

      {/* Location Map */}
      <div className="mb-8">
        <Card>
          <Card.Header>
            <Card.Title className="flex items-center">
              <MapPinIcon className="h-5 w-5 text-green-500 mr-2" />
              Live Location Tracking
            </Card.Title>
            <Link to="/dashboard/supervisor/map">
              <Button variant="ghost" size="small">
                <EyeIcon className="h-4 w-4 mr-1" />
                Full Map
              </Button>
            </Link>
          </Card.Header>
          <Card.Content>
            <div className="h-64">
              <LocationMap 
                height={250}
                showControls={false}
                compact={true}
              />
            </div>
          </Card.Content>
        </Card>
      </div>

      {/* Recent Activity */}
      <div>
        <Card>
          <Card.Header>
            <Card.Title>Recent Activity</Card.Title>
          </Card.Header>
          <Card.Content>
            <RecentActivity />
          </Card.Content>
        </Card>
      </div>
    </>
  );
};

export default SupervisorDashboard;