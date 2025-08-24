import React from 'react';
import {
  ExclamationTriangleIcon,
  CloudIcon,
  FireIcon,
} from '@heroicons/react/24/outline';

// Environmental Parameter Card Component
function EnvironmentalCard({ title, data, dataKey, unit, color, icon: Icon, normalRange, threshold }) {
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
            {latestValue ? `${latestValue.toFixed(1)} ${unit}` : 'No Data'}
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
                points={chartData
                  .filter(point => point[dataKey] != null)
                  .map((point, index, filteredData) => {
                    const value = point[dataKey];
                    const x = (index / Math.max(filteredData.length - 1, 1)) * 100;
                    const maxVal = Math.max(...filteredData.map(p => p[dataKey]));
                    const minVal = Math.min(...filteredData.map(p => p[dataKey]));
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

// Environmental Cards Container
export default function EnvironmentalCards({ data, isLoading, error }) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-white rounded-lg shadow p-6">
            <div className="animate-pulse">
              <div className="flex items-center mb-4">
                <div className="h-6 w-6 bg-gray-300 rounded mr-2"></div>
                <div className="h-4 bg-gray-300 rounded w-24"></div>
              </div>
              <div className="h-8 bg-gray-300 rounded w-16 mx-auto mb-4"></div>
              <div className="h-16 bg-gray-300 rounded"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-700">Error loading environmental data: {error}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <EnvironmentalCard
        title="Carbon Monoxide"
        data={data}
        dataKey="co"
        unit="ppm"
        color="#dc2626"
        icon={ExclamationTriangleIcon}
        normalRange="0-35 ppm"
        threshold={35}
      />
      <EnvironmentalCard
        title="Hydrogen Sulfide"
        data={data}
        dataKey="h2s"
        unit="ppm"
        color="#059669"
        icon={CloudIcon}
        normalRange="0-10 ppm"
        threshold={10}
      />
      <EnvironmentalCard
        title="Methane"
        data={data}
        dataKey="ch4"
        unit="%LEL"
        color="#ea580c"
        icon={FireIcon}
        normalRange="0-10 %LEL"
        threshold={10}
      />
    </div>
  );
}

export { EnvironmentalCard };