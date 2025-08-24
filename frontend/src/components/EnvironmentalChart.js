import React, { useState, useEffect, useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale,
} from 'chart.js';
import 'chartjs-adapter-date-fns';
import { format, parseISO, isValid } from 'date-fns';
import {
  CloudIcon,
  ExclamationTriangleIcon,
  FireIcon,
} from '@heroicons/react/24/outline';

import LoadingSpinner from './ui/LoadingSpinner';
import Button from './ui/Button';
import Badge from './ui/Badge';

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale
);

const EnvironmentalChart = ({ 
  data = [], 
  height = 400, 
  showControls = true, 
  selectedParams = ['co', 'h2s', 'ch4'],
  onParamToggle,
  timeRange = '24h',
  isLoading = false,
  error = null,
  showThresholds = true,
  showAnomalies = true,
  compact = false
}) => {
  const [activeParams, setActiveParams] = useState(selectedParams);
  const [chartType, setChartType] = useState('line'); // 'line' or 'area'
  const [showGrid, setShowGrid] = useState(true);
  const [showPoints, setShowPoints] = useState(false);

  // Update active parameters when selectedParams prop changes
  useEffect(() => {
    setActiveParams(selectedParams);
  }, [selectedParams]);

  // Environmental parameters configuration
  const environmentalConfig = {
    co: {
      label: 'Carbon Monoxide (CO)',
      shortLabel: 'CO',
      unit: 'ppm',
      color: '#dc2626',
      icon: ExclamationTriangleIcon,
      thresholds: { min: 0, max: 35 }, // OSHA 8-hour TWA: 50 ppm, STEL: 400 ppm
      criticalLevel: 35,
      scale: { min: 0, max: 100 },
    },
    h2s: {
      label: 'Hydrogen Sulfide (H₂S)',
      shortLabel: 'H₂S',
      unit: 'ppm',
      color: '#059669',
      icon: CloudIcon,
      thresholds: { min: 0, max: 10 }, // OSHA 8-hour TWA: 20 ppm, STEL: 50 ppm
      criticalLevel: 10,
      scale: { min: 0, max: 50 },
    },
    ch4: {
      label: 'Methane (CH₄)',
      shortLabel: 'CH₄',
      unit: '%LEL',
      color: '#ea580c',
      icon: FireIcon,
      thresholds: { min: 0, max: 10 }, // 10% LEL is typical alarm level
      criticalLevel: 10,
      scale: { min: 0, max: 25 },
    },
  };

  // Process and filter data
  const processedData = useMemo(() => {
    if (!data || data.length === 0) return [];

    return data
      .filter(item => item.timestamp && isValid(parseISO(item.timestamp)))
      .map(item => ({
        ...item,
        timestamp: parseISO(item.timestamp),
        // Ensure all environmental readings are numbers
        co: item.co ? Number(item.co) : null,
        h2s: item.h2s ? Number(item.h2s) : null,
        ch4: item.ch4 ? Number(item.ch4) : null,
      }))
      .sort((a, b) => a.timestamp - b.timestamp);
  }, [data]);

  // Identify anomalies
  const anomalies = useMemo(() => {
    if (!showAnomalies || !processedData.length) return [];

    return processedData.filter(item => {
      return activeParams.some(param => {
        const value = item[param];
        const config = environmentalConfig[param];
        if (!value || !config) return false;
        
        return value > config.thresholds.max;
      });
    });
  }, [processedData, activeParams, showAnomalies]);

  // Toggle parameter visibility
  const toggleParam = (param) => {
    const newActiveParams = activeParams.includes(param)
      ? activeParams.filter(p => p !== param)
      : [...activeParams, param];
    
    setActiveParams(newActiveParams);
    onParamToggle && onParamToggle(newActiveParams);
  };

  // Chart data configuration
  const chartData = {
    datasets: activeParams.map(param => {
      const config = environmentalConfig[param];
      const paramData = processedData.map(item => ({
        x: item.timestamp,
        y: item[param],
      })).filter(point => point.y !== null && point.y !== undefined);

      return {
        label: config.label,
        data: paramData,
        borderColor: config.color,
        backgroundColor: chartType === 'area' ? `${config.color}20` : config.color,
        fill: chartType === 'area',
        tension: 0.4,
        pointRadius: showPoints ? 3 : 0,
        pointHoverRadius: 5,
        borderWidth: 2,
        yAxisID: param, // Each parameter gets its own y-axis
      };
    }),
  };

  // Chart options
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: {
        position: compact ? 'bottom' : 'top',
        labels: {
          usePointStyle: true,
          padding: 15,
          font: {
            size: compact ? 10 : 12,
          },
        },
      },
      title: {
        display: !compact,
        text: 'Environmental Monitoring',
        font: {
          size: 16,
          weight: 'bold',
        },
        padding: 20,
      },
      tooltip: {
        callbacks: {
          title: (context) => {
            return format(context[0].parsed.x, 'MMM dd, HH:mm:ss');
          },
          label: (context) => {
            const config = environmentalConfig[context.dataset.yAxisID];
            const value = context.parsed.y;
            const status = value > config.thresholds.max ? ' ⚠️' : 
                          value > config.criticalLevel ? ' ⚡' : ' ✓';
            return `${config.label}: ${value} ${config.unit}${status}`;
          },
        },
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleColor: 'white',
        bodyColor: 'white',
        borderColor: 'rgba(255, 255, 255, 0.2)',
        borderWidth: 1,
        cornerRadius: 8,
        displayColors: true,
      },
    },
    scales: {
      x: {
        type: 'time',
        time: {
          displayFormats: {
            hour: 'HH:mm',
            day: 'MMM dd',
          },
        },
        grid: {
          display: showGrid,
          color: 'rgba(0, 0, 0, 0.1)',
        },
        title: {
          display: !compact,
          text: 'Time',
          color: '#666',
        },
      },
      // Dynamic y-axes for each parameter
      ...Object.fromEntries(
        activeParams.map(param => {
          const config = environmentalConfig[param];
          return [param, {
            type: 'linear',
            display: activeParams.indexOf(param) === 0, // Only show first axis
            position: activeParams.indexOf(param) === 0 ? 'left' : 'right',
            grid: {
              display: showGrid && activeParams.indexOf(param) === 0,
              color: 'rgba(0, 0, 0, 0.1)',
            },
            min: config.scale.min,
            max: config.scale.max,
            title: {
              display: !compact && activeParams.indexOf(param) === 0,
              text: `Concentration`,
              color: '#666',
            },
            ticks: {
              callback: (value) => `${value} ${config.unit}`,
              color: config.color,
            },
          }];
        })
      ),
    },
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <LoadingSpinner size="large" />
        <span className="ml-2 text-gray-600">Loading environmental data...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <div className="text-center">
          <ExclamationTriangleIcon className="h-12 w-12 text-red-500 mx-auto mb-2" />
          <p className="text-red-600 font-medium">Failed to load environmental data</p>
          <p className="text-gray-500 text-sm mt-1">{error}</p>
        </div>
      </div>
    );
  }

  if (!processedData.length) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <div className="text-center">
          <CloudIcon className="h-12 w-12 text-gray-400 mx-auto mb-2" />
          <p className="text-gray-600 font-medium">No environmental data available</p>
          <p className="text-gray-500 text-sm mt-1">Environmental sensors may be offline</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`w-full ${compact ? 'space-y-2' : 'space-y-4'}`}>
      {/* Controls */}
      {showControls && !compact && (
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-gray-50 rounded-lg">
          {/* Parameter Toggles */}
          <div className="flex flex-wrap gap-2">
            <span className="text-sm font-medium text-gray-700 mr-2">Parameters:</span>
            {Object.entries(environmentalConfig).map(([param, config]) => {
              const Icon = config.icon;
              const isActive = activeParams.includes(param);
              return (
                <button
                  key={param}
                  onClick={() => toggleParam(param)}
                  className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-blue-100 text-blue-800 border border-blue-200'
                      : 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200'
                  }`}
                >
                  <Icon className="h-4 w-4 mr-1" style={{ color: config.color }} />
                  {config.shortLabel}
                </button>
              );
            })}
          </div>

          {/* Chart Controls */}
          <div className="flex items-center gap-2">
            <Button
              variant={chartType === 'line' ? 'primary' : 'secondary'}
              size="small"
              onClick={() => setChartType('line')}
            >
              Line
            </Button>
            <Button
              variant={chartType === 'area' ? 'primary' : 'secondary'}
              size="small"
              onClick={() => setChartType('area')}
            >
              Area
            </Button>
            <Button
              variant={showPoints ? 'primary' : 'secondary'}
              size="small"
              onClick={() => setShowPoints(!showPoints)}
            >
              Points
            </Button>
            <Button
              variant={showGrid ? 'primary' : 'secondary'}
              size="small"
              onClick={() => setShowGrid(!showGrid)}
            >
              Grid
            </Button>
          </div>
        </div>
      )}

      {/* Anomalies Alert */}
      {showAnomalies && anomalies.length > 0 && (
        <div className="bg-red-50 border-l-4 border-red-400 p-3 rounded">
          <div className="flex items-center">
            <ExclamationTriangleIcon className="h-5 w-5 text-red-400 mr-2" />
            <p className="text-sm text-red-700">
              <strong>{anomalies.length} environmental anomal{anomalies.length === 1 ? 'y' : 'ies'}</strong> detected in the current time range
            </p>
          </div>
        </div>
      )}

      {/* Chart */}
      <div className="relative bg-white rounded-lg border p-4" style={{ height }}>
        <Line data={chartData} options={chartOptions} />
      </div>

      {/* Current Values */}
      {!compact && processedData.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {activeParams.map(param => {
            const config = environmentalConfig[param];
            const latestData = processedData[processedData.length - 1];
            const value = latestData?.[param];
            const Icon = config.icon;

            if (value === null || value === undefined) return null;

            const isHigh = value > config.thresholds.max;
            const isCritical = value > config.criticalLevel;
            const status = isHigh ? 'critical' : isCritical ? 'warning' : 'normal';

            return (
              <div key={param} className={`p-4 rounded-lg border ${
                status === 'critical' ? 'bg-red-50 border-red-200' :
                status === 'warning' ? 'bg-yellow-50 border-yellow-200' :
                'bg-green-50 border-green-200'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <Icon className="h-5 w-5 mr-2" style={{ color: config.color }} />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{config.shortLabel}</p>
                      <p className="text-xs text-gray-500">{config.label}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold" style={{ color: config.color }}>
                      {value.toFixed(1)} {config.unit}
                    </p>
                    <Badge
                      variant={
                        status === 'critical' ? 'danger' :
                        status === 'warning' ? 'warning' : 'success'
                      }
                      size="small"
                    >
                      {status === 'critical' ? 'HIGH' :
                       status === 'warning' ? 'ELEVATED' : 'NORMAL'}
                    </Badge>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default EnvironmentalChart;