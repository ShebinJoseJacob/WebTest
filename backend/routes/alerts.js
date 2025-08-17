const express = require('express');
const Joi = require('joi');
const Alert = require('../models/Alert');
const User = require('../models/User');
const roleAuth = require('../middleware/roleAuth');
const moment = require('moment');

const router = express.Router();

// Validation schemas
const alertFiltersSchema = Joi.object({
  severity: Joi.string().valid('low', 'medium', 'high', 'critical').optional(),
  type: Joi.string().valid('fall', 'heart_rate', 'spo2', 'temperature', 'offline').optional(),
  acknowledged: Joi.boolean().optional(),
  resolved: Joi.boolean().optional(),
  userId: Joi.number().integer().optional(),
  deviceId: Joi.number().integer().optional(),
  timeRange: Joi.string().valid('1 hour', '6 hours', '24 hours', '7 days', '30 days').optional(),
  limit: Joi.number().integer().min(1).max(1000).optional()
});

const acknowledgeSchema = Joi.object({
  alertIds: Joi.array().items(Joi.number().integer()).min(1).required()
});

// @route   GET /api/alerts
// @desc    Get alerts based on user role and filters
// @access  Private
router.get('/', async (req, res) => {
  try {
    // Validate query parameters
    const { error, value } = alertFiltersSchema.validate(req.query);
    if (error) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.details.map(detail => detail.message)
      });
    }

    const { role, id: currentUserId } = req.user;
    const filters = { ...value };

    // Apply role-based filtering
    if (role === 'employee') {
      // Employees can only see their own alerts
      filters.user_id = currentUserId;
      delete filters.userId; // Remove userId filter for employees
    } else if (role === 'supervisor' && filters.userId) {
      // Supervisors can filter by specific user
      filters.user_id = filters.userId;
      delete filters.userId;
    }

    const alerts = await Alert.getAll(filters);

    res.json({
      alerts,
      count: alerts.length,
      filters: filters
    });

  } catch (error) {
    console.error('Get alerts error:', error);
    res.status(500).json({
      error: 'Internal server error while fetching alerts'
    });
  }
});

// @route   GET /api/alerts/unacknowledged
// @desc    Get unacknowledged alerts
// @access  Private
router.get('/unacknowledged', async (req, res) => {
  try {
    const { role, id: currentUserId } = req.user;

    let alerts;
    if (role === 'supervisor') {
      // Supervisors can see all unacknowledged alerts
      alerts = await Alert.getUnacknowledged();
    } else {
      // Employees can only see their own unacknowledged alerts
      alerts = await Alert.getByUser(currentUserId, { acknowledged: false });
    }

    res.json({
      alerts,
      count: alerts.length
    });

  } catch (error) {
    console.error('Get unacknowledged alerts error:', error);
    res.status(500).json({
      error: 'Internal server error while fetching unacknowledged alerts'
    });
  }
});

// @route   GET /api/alerts/critical
// @desc    Get critical alerts (supervisor only)
// @access  Private (Supervisor only)
router.get('/critical', roleAuth(['supervisor']), async (req, res) => {
  try {
    const { timeRange = '24 hours' } = req.query;
    
    // Validate time range
    const validRanges = ['1 hour', '6 hours', '24 hours', '7 days', '30 days'];
    if (!validRanges.includes(timeRange)) {
      return res.status(400).json({
        error: 'Invalid time range. Must be one of: ' + validRanges.join(', ')
      });
    }

    const criticalAlerts = await Alert.getCritical(timeRange);

    res.json({
      criticalAlerts,
      count: criticalAlerts.length,
      timeRange
    });

  } catch (error) {
    console.error('Get critical alerts error:', error);
    res.status(500).json({
      error: 'Internal server error while fetching critical alerts'
    });
  }
});

// @route   GET /api/alerts/stats
// @desc    Get alert statistics (supervisor only)
// @access  Private (Supervisor only)
router.get('/stats', roleAuth(['supervisor']), async (req, res) => {
  try {
    const { timeRange = '24 hours' } = req.query;
    
    // Validate time range
    const validRanges = ['1 hour', '6 hours', '24 hours', '7 days', '30 days'];
    if (!validRanges.includes(timeRange)) {
      return res.status(400).json({
        error: 'Invalid time range. Must be one of: ' + validRanges.join(', ')
      });
    }

    const stats = await Alert.getStats(timeRange);
    const responseTimeStats = await Alert.getResponseTimeStats(timeRange);

    res.json({
      stats,
      responseTimeStats,
      timeRange
    });

  } catch (error) {
    console.error('Get alert stats error:', error);
    res.status(500).json({
      error: 'Internal server error while fetching alert statistics'
    });
  }
});

// @route   GET /api/alerts/trends
// @desc    Get alert trends (supervisor only)
// @access  Private (Supervisor only)
router.get('/trends', roleAuth(['supervisor']), async (req, res) => {
  try {
    const { days = 7 } = req.query;
    
    // Validate days parameter
    const daysInt = parseInt(days);
    if (isNaN(daysInt) || daysInt < 1 || daysInt > 30) {
      return res.status(400).json({
        error: 'Days parameter must be between 1 and 30'
      });
    }

    const trends = await Alert.getTrends(daysInt);

    res.json({
      trends,
      days: daysInt
    });

  } catch (error) {
    console.error('Get alert trends error:', error);
    res.status(500).json({
      error: 'Internal server error while fetching alert trends'
    });
  }
});

// @route   GET /api/alerts/hourly/:date
// @desc    Get hourly alert counts for specific date (supervisor only)
// @access  Private (Supervisor only)
router.get('/hourly/:date', roleAuth(['supervisor']), async (req, res) => {
  try {
    const { date } = req.params;
    
    // Validate date format
    if (!moment(date, 'YYYY-MM-DD', true).isValid()) {
      return res.status(400).json({
        error: 'Invalid date format. Use YYYY-MM-DD'
      });
    }

    const hourlyCounts = await Alert.getHourlyCounts(date);

    // Fill in missing hours with zero counts
    const fullHourlyData = [];
    for (let hour = 0; hour < 24; hour++) {
      const existing = hourlyCounts.find(item => parseInt(item.hour) === hour);
      fullHourlyData.push({
        hour,
        total_count: existing ? parseInt(existing.total_count) : 0,
        critical_count: existing ? parseInt(existing.critical_count) : 0
      });
    }

    res.json({
      hourlyCounts: fullHourlyData,
      date
    });

  } catch (error) {
    console.error('Get hourly alerts error:', error);
    res.status(500).json({
      error: 'Internal server error while fetching hourly alerts'
    });
  }
});

// @route   GET /api/alerts/:id
// @desc    Get specific alert by ID
// @access  Private
router.get('/:id', async (req, res) => {
  try {
    const alertId = parseInt(req.params.id);
    if (isNaN(alertId)) {
      return res.status(400).json({
        error: 'Invalid alert ID'
      });
    }

    const alert = await Alert.findById(alertId);
    if (!alert) {
      return res.status(404).json({
        error: 'Alert not found'
      });
    }

    const { role, id: currentUserId } = req.user;

    // Check if user has permission to view this alert
    if (role === 'employee' && alert.user_id !== currentUserId) {
      return res.status(403).json({
        error: 'Access denied. You can only view your own alerts'
      });
    }

    res.json({
      alert
    });

  } catch (error) {
    console.error('Get alert by ID error:', error);
    res.status(500).json({
      error: 'Internal server error while fetching alert'
    });
  }
});

// @route   POST /api/alerts/acknowledge
// @desc    Acknowledge one or more alerts
// @access  Private
router.post('/acknowledge', async (req, res) => {
  try {
    // Validate request body
    const { error, value } = acknowledgeSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.details.map(detail => detail.message)
      });
    }

    const { alertIds } = value;
    const { role, id: currentUserId } = req.user;

    // For employees, verify they own all alerts they're trying to acknowledge
    if (role === 'employee') {
      for (const alertId of alertIds) {
        const alert = await Alert.findById(alertId);
        if (!alert) {
          return res.status(404).json({
            error: `Alert ${alertId} not found`
          });
        }
        if (alert.user_id !== currentUserId) {
          return res.status(403).json({
            error: `Access denied. You can only acknowledge your own alerts`
          });
        }
      }
    }

    // Acknowledge alerts
    const acknowledgedAlerts = await Alert.bulkAcknowledge(alertIds, currentUserId);

    // Emit socket event for real-time updates
    const io = req.app.get('io');
    if (io) {
      // Notify supervisors about acknowledgment
      io.to('supervisors').emit('alerts_acknowledged', {
        alertIds,
        acknowledgedBy: currentUserId,
        timestamp: new Date().toISOString(),
        count: acknowledgedAlerts.length
      });

      // Notify the acknowledging user
      io.to(`user_${currentUserId}`).emit('alerts_acknowledged', {
        alertIds,
        timestamp: new Date().toISOString(),
        count: acknowledgedAlerts.length
      });
    }

    res.json({
      message: 'Alerts acknowledged successfully',
      acknowledgedAlerts,
      count: acknowledgedAlerts.length
    });

  } catch (error) {
    console.error('Acknowledge alerts error:', error);
    res.status(500).json({
      error: 'Internal server error while acknowledging alerts'
    });
  }
});

// @route   PUT /api/alerts/:id/acknowledge
// @desc    Acknowledge single alert
// @access  Private
router.put('/:id/acknowledge', async (req, res) => {
  try {
    const alertId = parseInt(req.params.id);
    if (isNaN(alertId)) {
      return res.status(400).json({
        error: 'Invalid alert ID'
      });
    }

    // Check if alert exists
    const existingAlert = await Alert.findById(alertId);
    if (!existingAlert) {
      return res.status(404).json({
        error: 'Alert not found'
      });
    }

    const { role, id: currentUserId } = req.user;

    // Check permissions for employees
    if (role === 'employee' && existingAlert.user_id !== currentUserId) {
      return res.status(403).json({
        error: 'Access denied. You can only acknowledge your own alerts'
      });
    }

    // Check if already acknowledged
    if (existingAlert.acknowledged) {
      return res.status(400).json({
        error: 'Alert is already acknowledged'
      });
    }

    // Acknowledge the alert
    const acknowledgedAlert = await Alert.acknowledge(alertId, currentUserId);

    // Emit socket event for real-time updates
    const io = req.app.get('io');
    if (io) {
      // Notify supervisors about acknowledgment
      io.to('supervisors').emit('alert_acknowledged', {
        alertId,
        alert: acknowledgedAlert,
        acknowledgedBy: currentUserId,
        timestamp: new Date().toISOString()
      });

      // Notify the acknowledging user
      io.to(`user_${currentUserId}`).emit('alert_acknowledged', {
        alertId,
        alert: acknowledgedAlert,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      message: 'Alert acknowledged successfully',
      alert: acknowledgedAlert
    });

  } catch (error) {
    console.error('Acknowledge alert error:', error);
    res.status(500).json({
      error: 'Internal server error while acknowledging alert'
    });
  }
});

// @route   PUT /api/alerts/:id/resolve
// @desc    Resolve alert (supervisor only)
// @access  Private (Supervisor only)
router.put('/:id/resolve', roleAuth(['supervisor']), async (req, res) => {
  try {
    const alertId = parseInt(req.params.id);
    if (isNaN(alertId)) {
      return res.status(400).json({
        error: 'Invalid alert ID'
      });
    }

    // Check if alert exists
    const existingAlert = await Alert.findById(alertId);
    if (!existingAlert) {
      return res.status(404).json({
        error: 'Alert not found'
      });
    }

    // Check if already resolved
    if (existingAlert.resolved) {
      return res.status(400).json({
        error: 'Alert is already resolved'
      });
    }

    // Resolve the alert
    const resolvedAlert = await Alert.resolve(alertId);

    // Emit socket event for real-time updates
    const io = req.app.get('io');
    if (io) {
      io.to('supervisors').emit('alert_resolved', {
        alertId,
        alert: resolvedAlert,
        resolvedBy: req.user.id,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      message: 'Alert resolved successfully',
      alert: resolvedAlert
    });

  } catch (error) {
    console.error('Resolve alert error:', error);
    res.status(500).json({
      error: 'Internal server error while resolving alert'
    });
  }
});

// @route   GET /api/alerts/user/:userId
// @desc    Get alerts for specific user (supervisor only or own alerts)
// @access  Private
router.get('/user/:userId', async (req, res) => {
  try {
    const targetUserId = parseInt(req.params.userId);
    if (isNaN(targetUserId)) {
      return res.status(400).json({
        error: 'Invalid user ID'
      });
    }

    const { role, id: currentUserId } = req.user;

    // Check permissions
    if (role === 'employee' && targetUserId !== currentUserId) {
      return res.status(403).json({
        error: 'Access denied. You can only view your own alerts'
      });
    }

    // Validate query parameters
    const { error, value } = alertFiltersSchema.validate(req.query);
    if (error) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.details.map(detail => detail.message)
      });
    }

    const alerts = await Alert.getByUser(targetUserId, value);

    res.json({
      alerts,
      count: alerts.length,
      userId: targetUserId,
      filters: value
    });

  } catch (error) {
    console.error('Get user alerts error:', error);
    res.status(500).json({
      error: 'Internal server error while fetching user alerts'
    });
  }
});

// @route   DELETE /api/alerts/cleanup
// @desc    Delete old resolved alerts (supervisor only)
// @access  Private (Supervisor only)
router.delete('/cleanup', roleAuth(['supervisor']), async (req, res) => {
  try {
    const { days = 90 } = req.query;
    
    // Validate days parameter
    const daysInt = parseInt(days);
    if (isNaN(daysInt) || daysInt < 30) {
      return res.status(400).json({
        error: 'Days parameter must be at least 30'
      });
    }

    const deletedCount = await Alert.deleteOlderThan(daysInt);

    res.json({
      message: 'Alert cleanup completed successfully',
      deletedRecords: deletedCount,
      daysOlderThan: daysInt
    });

  } catch (error) {
    console.error('Alert cleanup error:', error);
    res.status(500).json({
      error: 'Internal server error during alert cleanup'
    });
  }
});

// @route   DELETE /api/alerts/clear-all
// @desc    Delete all alerts (development/testing only)
// @access  Private (Supervisor only)
router.delete('/clear-all', roleAuth(['supervisor']), async (req, res) => {
  try {
    const deletedCount = await Alert.deleteAll();

    res.json({
      message: 'All alerts cleared successfully',
      deletedRecords: deletedCount
    });

  } catch (error) {
    console.error('Clear all alerts error:', error);
    res.status(500).json({
      error: 'Internal server error during alert clearing'
    });
  }
});

module.exports = router;