import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Helmet } from 'react-helmet-async';
import {
  ExclamationTriangleIcon,
  HeartIcon,
  CloudIcon,
  FireIcon,
} from '@heroicons/react/24/outline';

import { selectAuth, selectSocket } from '../store/selectors';
import { fetchLatestVitals, fetchVitalsSummary } from '../store/slices/vitalsSlice';
import EnvironmentalChart from '../components/EnvironmentalChart';

// Environmental Chart Component (individual charts like vitals)
function EnvironmentalParameterChart({ title, data, dataKey, unit, color, icon: Icon, normalRange, threshold }) {
  const chartData = data || [];
  const latestValue = chartData[chartData.length - 1]?.[dataKey];
  
  // Status based on threshold
  const isAbnormal = latestValue && threshold && latestValue > threshold;
  
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center">
          <Icon className="h-6 w-6 mr-2" style={{ color }} />
          <div>
            <h3 className="font-semibold">{title}</h3>
            <p className="text-xs text-gray-500">Normal: {normalRange}</p>
          </div>
        </div>
        <div className={`px-2 py-1 rounded-full text-xs font-medium ${
          isAbnormal 
            ? 'bg-red-100 text-red-800' 
            : 'bg-green-100 text-green-800'
        }`}>
          {isAbnormal ? 'HIGH' : 'NORMAL'}
        </div>
      </div>
      
      <div className="space-y-4">
        {/* Current Value */}
        <div className="text-center">
          <div className="text-2xl font-bold" style={{ color }}>
            {latestValue ? `${latestValue.toFixed(1)} ${unit}` : '--'}
          </div>
        </div>
        
        {/* Simple chart representation */}
        {chartData.length > 0 && (
          <div className="relative h-16 bg-gray-50 rounded">
            <svg className="w-full h-full">
              <polyline
                fill="none"
                stroke={color}
                strokeWidth="2"
                points={chartData.map((point, index) => {
                  const value = point[dataKey];
                  if (!value) return '';
                  const x = (index / (chartData.length - 1)) * 100;
                  const maxVal = Math.max(...chartData.map(p => p[dataKey] || 0));
                  const minVal = Math.min(...chartData.map(p => p[dataKey] || 0));
                  const range = maxVal - minVal || 1;
                  const y = 100 - ((value - minVal) / range * 80 + 10);
                  return `${x},${y}`;
                }).join(' ')}
              />
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}

const SupervisorDashboard = () => {
  const dispatch = useDispatch();
  const { user } = useSelector(selectAuth);
  const { isConnected } = useSelector(selectSocket);
  const [dashboardData, setDashboardData] = useState({
    vitals: { data: [], isLoading: true, error: null },
    environmental: { data: [], isLoading: true, error: null },
  });

  // Fetch dashboard data
  const fetchDashboardData = async () => {
    try {
      setDashboardData(prev => ({
        ...prev,
        vitals: { ...prev.vitals, isLoading: true },
        environmental: { ...prev.environmental, isLoading: true },
      }));

      const vitalsResult = await dispatch(fetchLatestVitals()).unwrap();
      const vitalsData = vitalsResult.vitals || [];
      
      setDashboardData(prev => ({
        ...prev,
        vitals: {
          data: vitalsData,
          isLoading: false,
          error: null,
        },
        environmental: {
          data: vitalsData, // Same data source, environmental charts will filter for CO, H2S, CH4
          isLoading: false,
          error: null,
        },
      }));
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
      setDashboardData(prev => ({
        ...prev,
        vitals: { ...prev.vitals, isLoading: false, error: error.message },
        environmental: { ...prev.environmental, isLoading: false, error: error.message },
      }));
    }
  };

  // Initial load and setup auto-refresh
  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, [dispatch]);

  return (
    <>
      <Helmet>
        <title>Supervisor Dashboard - Ozon3</title>
        <meta name="description" content="Real-time supervisor dashboard for worker monitoring" />
      </Helmet>

      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Supervisor Dashboard</h1>
                <p className="text-gray-600">Welcome back, {user?.name}</p>
              </div>
              <div className="flex items-center space-x-4">
                <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                  isConnected 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-red-100 text-red-800'
                }`}>
                  {isConnected ? '🟢 Live' : '🔴 Offline'}
                </div>
                <button
                  onClick={fetchDashboardData}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Refresh
                </button>
              </div>
            </div>
          </div>

          {/* Vitals Section */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
              <HeartIcon className="h-6 w-6 text-red-500 mr-2" />
              Vital Signs Monitoring
            </h2>
            {dashboardData.vitals.isLoading ? (
              <div className="flex items-center justify-center h-32 bg-white rounded-lg shadow">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                  <p className="text-gray-600">Loading vitals data...</p>
                </div>
              </div>
            ) : dashboardData.vitals.error ? (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-700">Error loading vitals data: {dashboardData.vitals.error}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <EnvironmentalParameterChart
                  title="Heart Rate"
                  data={dashboardData.vitals.data}
                  dataKey="heart_rate"
                  unit="bpm"
                  color="#ef4444"
                  icon={HeartIcon}
                  normalRange="60-100"
                  threshold={100}
                />
                <EnvironmentalParameterChart
                  title="SpO2"
                  data={dashboardData.vitals.data}
                  dataKey="spo2"
                  unit="%"
                  color="#3b82f6"
                  icon={HeartIcon}
                  normalRange="95-100"
                  threshold={95}
                />
                <EnvironmentalParameterChart
                  title="Temperature"
                  data={dashboardData.vitals.data}
                  dataKey="temperature"
                  unit="°C"
                  color="#f59e0b"
                  icon={HeartIcon}
                  normalRange="36.0-37.5"
                  threshold={37.5}
                />
              </div>
            )}
          </div>

          {/* Environmental Section */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
              <ExclamationTriangleIcon className="h-6 w-6 text-orange-500 mr-2" />
              Environmental Monitoring
            </h2>
            {dashboardData.environmental.isLoading ? (
              <div className="flex items-center justify-center h-32 bg-white rounded-lg shadow">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600 mx-auto mb-2"></div>
                  <p className="text-gray-600">Loading environmental data...</p>
                </div>
              </div>
            ) : dashboardData.environmental.error ? (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-700">Error loading environmental data: {dashboardData.environmental.error}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <EnvironmentalParameterChart
                  title="Carbon Monoxide (CO)"
                  data={dashboardData.environmental.data}
                  dataKey="co"
                  unit="ppm"
                  color="#dc2626"
                  icon={ExclamationTriangleIcon}
                  normalRange="0-35"
                  threshold={35}
                />
                <EnvironmentalParameterChart
                  title="Hydrogen Sulfide (H₂S)"
                  data={dashboardData.environmental.data}
                  dataKey="h2s"
                  unit="ppm"
                  color="#059669"
                  icon={CloudIcon}
                  normalRange="0-10"
                  threshold={10}
                />
                <EnvironmentalParameterChart
                  title="Methane (CH₄)"
                  data={dashboardData.environmental.data}
                  dataKey="ch4"
                  unit="%LEL"
                  color="#ea580c"
                  icon={FireIcon}
                  normalRange="0-10"
                  threshold={10}
                />
              </div>
            )}
          </div>

          {/* Advanced Environmental Chart */}
          <div className="mb-8">
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <ExclamationTriangleIcon className="h-5 w-5 text-orange-500 mr-2" />
                Advanced Environmental Analysis
              </h3>
              <EnvironmentalChart 
                data={dashboardData.environmental.data} 
                height={400}
                showControls={true}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default SupervisorDashboard;