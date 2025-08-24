import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheckIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  EyeIcon,
  UserIcon,
  CalendarIcon,
  FilterIcon,
  ChartBarIcon,
  DocumentCheckIcon
} from '@heroicons/react/24/outline';
import {
  ShieldCheckIcon as ShieldCheckIconSolid,
  ExclamationTriangleIcon as ExclamationTriangleIconSolid
} from '@heroicons/react/24/solid';

const ComplianceTab = ({ isActive }) => {
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
  const [filters, setFilters] = useState({
    type: 'all',
    status: 'all',
    risk_level: 'all',
    reviewed: 'all',
    limit: 20
  });
  const [showFilters, setShowFilters] = useState(false);

  // Get risk level styling
  const getRiskLevelStyle = (level) => {
    const styles = {
      low: 'bg-green-100 text-green-800 border-green-200',
      medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      high: 'bg-orange-100 text-orange-800 border-orange-200',
      critical: 'bg-red-100 text-red-800 border-red-200'
    };
    return styles[level] || styles.medium;
  };

  // Get status styling
  const getStatusStyle = (status) => {
    const styles = {
      compliant: 'bg-green-100 text-green-800',
      non_compliant: 'bg-red-100 text-red-800',
      pending_review: 'bg-yellow-100 text-yellow-800',
      in_remediation: 'bg-blue-100 text-blue-800',
      resolved: 'bg-gray-100 text-gray-800'
    };
    return styles[status] || styles.pending_review;
  };

  // Get status icon
  const getStatusIcon = (status) => {
    switch (status) {
      case 'compliant':
        return <CheckCircleIcon className="h-4 w-4" />;
      case 'non_compliant':
        return <XCircleIcon className="h-4 w-4" />;
      case 'resolved':
        return <DocumentCheckIcon className="h-4 w-4" />;
      default:
        return <ClockIcon className="h-4 w-4" />;
    }
  };

  // Get risk level icon
  const getRiskIcon = (level) => {
    switch (level) {
      case 'critical':
        return <ExclamationTriangleIconSolid className="h-4 w-4 text-red-600" />;
      case 'high':
        return <ExclamationTriangleIcon className="h-4 w-4 text-orange-600" />;
      default:
        return <ShieldCheckIcon className="h-4 w-4 text-blue-600" />;
    }
  };

  // Fetch compliance data
  const fetchComplianceData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('No authentication token');

      // Build query parameters
      const queryParams = new URLSearchParams();
      if (filters.type !== 'all') queryParams.set('type', filters.type);
      if (filters.status !== 'all') queryParams.set('status', filters.status);
      if (filters.risk_level !== 'all') queryParams.set('risk_level', filters.risk_level);
      if (filters.reviewed !== 'all') queryParams.set('reviewed', filters.reviewed);
      queryParams.set('limit', filters.limit.toString());

      const [dataResponse, statsResponse] = await Promise.all([
        fetch(`/api/compliance?${queryParams}`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch('/api/compliance/stats', {
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
  }, [filters]);

  // Initial load and periodic refresh
  useEffect(() => {
    if (isActive) {
      fetchComplianceData();
    }
  }, [isActive, fetchComplianceData]);

  // Handle filter changes
  const handleFilterChange = (key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }));
  };

  // Handle compliance record review
  const handleReview = async (id, approved = false) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/compliance/${id}/review`, {
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

  // Format date
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <ShieldCheckIconSolid className="h-8 w-8 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Compliance Rate</p>
              <p className="text-2xl font-semibold text-gray-900">{stats.compliance_rate}%</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <ExclamationTriangleIconSolid className="h-8 w-8 text-red-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">High Risk</p>
              <p className="text-2xl font-semibold text-gray-900">
                {parseInt(stats.critical_risk_count) + parseInt(stats.high_risk_count)}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <ClockIcon className="h-8 w-8 text-yellow-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Pending Review</p>
              <p className="text-2xl font-semibold text-gray-900">{stats.unreviewed_count}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <DocumentCheckIcon className="h-8 w-8 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Records</p>
              <p className="text-2xl font-semibold text-gray-900">{stats.total_records}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <h2 className="text-lg font-semibold text-gray-900">Compliance Records</h2>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            <FilterIcon className="h-4 w-4 mr-2" />
            Filters
          </button>
        </div>

        <button
          onClick={fetchComplianceData}
          className="flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
        >
          <ChartBarIcon className="h-4 w-4 mr-2" />
          Refresh
        </button>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="bg-gray-50 p-4 rounded-lg space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select
                value={filters.type}
                onChange={(e) => handleFilterChange('type', e.target.value)}
                className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              >
                <option value="all">All Types</option>
                <option value="safety">Safety</option>
                <option value="environmental">Environmental</option>
                <option value="health">Health</option>
                <option value="equipment">Equipment</option>
                <option value="training">Training</option>
                <option value="documentation">Documentation</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                value={filters.status}
                onChange={(e) => handleFilterChange('status', e.target.value)}
                className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              >
                <option value="all">All Status</option>
                <option value="compliant">Compliant</option>
                <option value="non_compliant">Non-Compliant</option>
                <option value="pending_review">Pending Review</option>
                <option value="in_remediation">In Remediation</option>
                <option value="resolved">Resolved</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Risk Level</label>
              <select
                value={filters.risk_level}
                onChange={(e) => handleFilterChange('risk_level', e.target.value)}
                className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              >
                <option value="all">All Risk Levels</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reviewed</label>
              <select
                value={filters.reviewed}
                onChange={(e) => handleFilterChange('reviewed', e.target.value)}
                className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              >
                <option value="all">All</option>
                <option value="true">Reviewed</option>
                <option value="false">Unreviewed</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <ExclamationTriangleIcon className="h-5 w-5 text-red-400" />
            <div className="ml-3">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Compliance Records */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Employee
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type & Title
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Risk Level
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {complianceData.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-4 text-center text-sm text-gray-500">
                    No compliance records found
                  </td>
                </tr>
              ) : (
                complianceData.map((record) => (
                  <tr key={record.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <UserIcon className="h-4 w-4 text-gray-400 mr-2" />
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {record.user_name || 'Unknown User'}
                          </div>
                          <div className="text-sm text-gray-500">{record.department}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{record.title}</div>
                        <div className="text-sm text-gray-500 capitalize">{record.type}</div>
                        {record.regulation_standard && (
                          <div className="text-xs text-blue-600">{record.regulation_standard}</div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusStyle(record.status)}`}>
                        {getStatusIcon(record.status)}
                        <span className="ml-1 capitalize">{record.status.replace('_', ' ')}</span>
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getRiskLevelStyle(record.risk_level)}`}>
                        {getRiskIcon(record.risk_level)}
                        <span className="ml-1 capitalize">{record.risk_level}</span>
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center text-sm text-gray-500">
                        <CalendarIcon className="h-4 w-4 mr-1" />
                        {formatDate(record.timestamp)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => {/* TODO: Open details modal */}}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          <EyeIcon className="h-4 w-4" />
                        </button>
                        {!record.reviewed && (
                          <>
                            <button
                              onClick={() => handleReview(record.id, true)}
                              className="text-green-600 hover:text-green-900"
                              title="Approve"
                            >
                              <CheckCircleIcon className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleReview(record.id, false)}
                              className="text-yellow-600 hover:text-yellow-900"
                              title="Review Only"
                            >
                              <EyeIcon className="h-4 w-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ComplianceTab;