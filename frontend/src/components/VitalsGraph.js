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
  HeartIcon,
  BeakerIcon,
  FireIcon,
  ExclamationTriangleIcon,
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

const VitalsGraph = ({ 
  data = [], 
  height = 400, 
  showControls = true, 
  selectedVitals = ['heart_rate', 'spo2', 'temperature'],
  onVitalToggle,
  timeRange = '24h',
  isLoading = false,
  error = null,
  showThresholds = true,
  showAnomalies = true,
  compact = false
}) => {
  const [activeVitals, setActiveVitals] = useState(selectedVitals);
  const [chartType, setChartType] = useState('line'); // 'line' or 'area'
  const [showGrid, setShowGrid] = useState(true);
  const [showPoints, setShowPoints] = useState(false);

  // Update active vitals when selectedVitals prop changes
  useEffect(() => {
    setActiveVitals(selectedVitals);
  }, [selectedVitals]);

  // Vital signs configuration
  const vitalsConfig = {
    heart_rate: {
      label: 'Heart Rate',
      unit: 'bpm',
      color: '#ef4444',
      icon: HeartIcon,
      thresholds: { min: 60, max: 100 },
      scale: { min: 50, max: 120 },
    },
    spo2: {
      label: 'SpO2',
      unit: '%',
      color: '#3b82f6',
      icon: BeakerIcon,
      thresholds: { min: 95, max: 100 },
      scale: { min: 85, max: 100 },
    },
    temperature: {
      label: 'Temperature',
      unit: '°C',
      color: '#f59e0b',
      icon: FireIcon,
      thresholds: { min: 36.0, max: 37.5 },
      scale: { min: 35, max: 39 },
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
        // Ensure all vitals are numbers
        heart_rate: item.heart_rate ? Number(item.heart_rate) : null,
        spo2: item.spo2 ? Number(item.spo2) : null,
        temperature: item.temperature ? Number(item.temperature) : null,
      }))
      .sort((a, b) => a.timestamp - b.timestamp);
  }, [data]);

  // Identify anomalies
  const anomalies = useMemo(() => {
    if (!showAnomalies || !processedData.length) return [];

    return processedData.filter(item => {
      return activeVitals.some(vital => {
        const value = item[vital];
        const config = vitalsConfig[vital];
        if (!value || !config) return false;
        
        return value < config.thresholds.min || value > config.thresholds.max;
      });
    });
  }, [processedData, activeVitals, showAnomalies]);

  // Toggle vital sign visibility
  const toggleVital = (vital) => {
    const newActiveVitals = activeVitals.includes(vital)
      ? activeVitals.filter(v => v !== vital)
      : [...activeVitals, vital];
    
    setActiveVitals(newActiveVitals);
    onVitalToggle && onVitalToggle(newActiveVitals);
  };

  // Chart data configuration
  const chartData = {
    datasets: activeVitals.map(vital => {
      const config = vitalsConfig[vital];
      const vitalData = processedData.map(item => ({
        x: item.timestamp,
        y: item[vital],
      })).filter(point => point.y !== null && point.y !== undefined);

      return {
        label: config.label,
        data: vitalData,
        borderColor: config.color,
        backgroundColor: chartType === 'area' ? `${config.color}20` : config.color,
        fill: chartType === 'area',
        tension: 0.4,
        pointRadius: showPoints ? 3 : 0,
        pointHoverRadius: 5,
        pointBackgroundColor: config.color,
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        borderWidth: 2,
        yAxisID: vital,
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
      title: {
        display: !compact,
        text: 'Vital Signs Over Time',
        font: {
          size: 16,
        },
      },
      legend: {
        display: !compact,
        position: 'top',
      },
      tooltip: {
        callbacks: {
          title: (context) => {
            if (context[0]?.parsed?.x) {
              return format(new Date(context[0].parsed.x), 'MMM dd, yyyy HH:mm');
            }
            return '';
          },
          label: (context) => {
            const vital = activeVitals[context.datasetIndex];
            const config = vitalsConfig[vital];
            const value = context.parsed.y;
            
            if (value === null || value === undefined) return null;
            
            const thresholds = config.thresholds;
            const isAbnormal = value < thresholds.min || value > thresholds.max;
            const status = isAbnormal ? ' ⚠️' : ' ✓';
            
            return `${config.label}: ${value.toFixed(1)}${config.unit}${status}`;
          },
        },
      },
    },
    scales: {
      x: {
        type: 'time',
        display: !compact,
        title: {
          display: !compact,
          text: 'Time',
        },
        grid: {
          display: showGrid,
        },
        time: {
          displayFormats: {
            hour: 'HH:mm',
            day: 'MMM dd',
          },
        },
      },
      // Create separate y-axes for each vital
      ...Object.fromEntries(
        activeVitals.map(vital => {
          const config = vitalsConfig[vital];
          return [
            vital,
            {
              type: 'linear',
              display: activeVitals.length === 1 || vital === activeVitals[0],
              position: vital === activeVitals[0] ? 'left' : 'right',
              title: {
                display: !compact && (activeVitals.length === 1 || vital === activeVitals[0]),
                text: `${config.label} (${config.unit})`,
              },
              min: config.scale.min,
              max: config.scale.max,
              grid: {
                display: showGrid && vital === activeVitals[0],
              },
              ticks: {
                callback: function(value) {
                  return `${value}${config.unit}`;
                },
              },
            },
          ];
        })
      ),
    },
    // Add threshold lines
    plugins: showThresholds
      ? [
          {
            afterDraw: (chart) => {
              const ctx = chart.ctx;
              activeVitals.forEach(vital => {
                const config = vitalsConfig[vital];
                const scale = chart.scales[vital];
                if (!scale) return;

                ctx.save();
                ctx.strokeStyle = config.color + '40';
                ctx.lineWidth = 1;
                ctx.setLineDash([5, 5]);

                // Draw threshold lines
                [config.thresholds.min, config.thresholds.max].forEach(threshold => {
                  const y = scale.getPixelForValue(threshold);
                  ctx.beginPath();
                  ctx.moveTo(chart.chartArea.left, y);
                  ctx.lineTo(chart.chartArea.right, y);
                  ctx.stroke();
                });

                ctx.restore();
              });
            },
          },
        ]
      : [],
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <LoadingSpinner size="large" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex items-center justify-center text-red-500" style={{ height }}>
        <ExclamationTriangleIcon className="h-8 w-8 mr-2" />
        <span>Error loading vitals data: {error}</span>
      </div>
    );
  }

  // No data state
  if (!processedData.length) {
    return (
      <div className="flex items-center justify-center text-gray-500" style={{ height }}>
        <div className="text-center">
          <HeartIcon className="h-12 w-12 mx-auto mb-4 text-gray-400" />
          <p>No vital signs data available</p>
          <p className="text-sm text-gray-400 mt-2">
            Check device connection and try again
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Controls */}
      {showControls && !compact && (
        <div className="mb-4 space-y-4">
          {/* Vital Signs Toggle */}
          <div className="flex flex-wrap gap-2">
            <span className="text-sm font-medium text-gray-700 mr-2">Show:</span>
            {Object.entries(vitalsConfig).map(([key, config]) => {
              const Icon = config.icon;
              const isActive = activeVitals.includes(key);
              return (
                <button
                  key={key}
                  onClick={() => toggleVital(key)}
                  className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-blue-100 text-blue-800 border border-blue-200'
                      : 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200'
                  }`}
                >
                  <Icon className="h-4 w-4 mr-1" />
                  {config.label}
                </button>
              );
            })}
          </div>

          {/* Chart Options */}
          <div className="flex items-center space-x-4 text-sm">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={showGrid}
                onChange={(e) => setShowGrid(e.target.checked)}
                className="h-4 w-4 text-blue-600 rounded"
              />
              <span>Grid</span>
            </label>
            
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={showPoints}
                onChange={(e) => setShowPoints(e.target.checked)}
                className="h-4 w-4 text-blue-600 rounded"
              />
              <span>Points</span>
            </label>
            
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={showThresholds}
                onChange={(e) => setShowThresholds(e.target.checked)}
                className="h-4 w-4 text-blue-600 rounded"
              />
              <span>Thresholds</span>
            </label>

            <select
              value={chartType}
              onChange={(e) => setChartType(e.target.value)}
              className="px-2 py-1 border border-gray-300 rounded text-sm"
            >
              <option value="line">Line</option>
              <option value="area">Area</option>
            </select>
          </div>
        </div>
      )}

      {/* Anomalies Alert */}
      {anomalies.length > 0 && !compact && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-center">
            <ExclamationTriangleIcon className="h-5 w-5 text-yellow-600 mr-2" />
            <span className="text-sm text-yellow-800">
              {anomalies.length} abnormal reading(s) detected in the current time range
            </span>
            <Badge variant="warning" className="ml-2">
              {anomalies.length}
            </Badge>
          </div>
        </div>
      )}

      {/* Chart */}
      <div style={{ height }}>
        <Line data={chartData} options={chartOptions} />
      </div>

      {/* Legend for compact mode */}
      {compact && (
        <div className="mt-2 flex justify-center space-x-4 text-xs">
          {activeVitals.map(vital => {
            const config = vitalsConfig[vital];
            return (
              <div key={vital} className="flex items-center space-x-1">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: config.color }}
                />
                <span className="text-gray-600">{config.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default VitalsGraph;