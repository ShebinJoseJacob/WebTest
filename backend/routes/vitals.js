const express = require('express');
const Joi = require('joi');
const Vital = require('../models/Vital');
const User = require('../models/User');
const roleAuth = require('../middleware/roleAuth');
const moment = require('moment');

const router = express.Router();

// Validation schemas
const timeRangeSchema = Joi.object({
  startTime: Joi.date().iso().optional(),
  endTime: Joi.date().iso().optional(),
  hours: Joi.number().integer().min(1).max(168).optional(), // Max 7 days
  days: Joi.number().integer().min(1).max(30).optional()
});

const deviceVitalsSchema = Joi.object({
  deviceId: Joi.number().integer().required(),
  startTime: Joi.date().iso().optional(),
  endTime: Joi.date().iso().optional(),
  hours: Joi.number().integer().min(1).max(168).optional(),
  days: Joi.number().integer().min(1).max(30).optional()
});

const userVitalsSchema = Joi.object({
  userId: Joi.number().integer().optional(),
  startTime: Joi.date().iso().optional(),
  endTime: Joi.date().iso().optional(),
  hours: Joi.number().integer().min(1).max(168).optional(),
  days: Joi.number().integer().min(1).max(30).optional()
});

// Helper function to calculate time range
const calculateTimeRange = (query) => {
  let startTime, endTime;
  
  if (query.startTime && query.endTime) {
    startTime = new Date(query.startTime);
    endTime = new Date(query.endTime);
  } else if (query.hours) {
    endTime = new Date();
    startTime = moment().subtract(query.hours, 'hours').toDate();
  } else if (query.days) {
    endTime = new Date();
    startTime = moment().subtract(query.days, 'days').toDate();
  } else {
    // Default to last 24 hours
    endTime = new Date();
    startTime = moment().subtract(24, 'hours').toDate();
  }
  
  return { startTime, endTime };
};

// @route   GET /api/vitals/latest
// @desc    Get latest vitals for current user or all users (supervisor)
// @access  Private
router.get('/latest', async (req, res) => {
  try {
    const { role, id: userId } = req.user;

    let vitals;
    if (role === 'supervisor') {
      // Supervisors can see all latest vitals
      vitals = await Vital.getLatestForAllDevices();
    } else {
      // Employees can only see their own latest vitals
      const user = await User.findWithDevice(userId);
      if (!user || !user.device) {
        return res.status(404).json({
          error: 'No device found for user'
        });
      }
      
      const vital = await Vital.getLatestByDevice(user.device.id);
      vitals = vital ? [{ ...vital, user_name: user.name, user_id: userId, device_serial: user.device.serial }] : [];
    }

    res.json({
      vitals,
      count: vitals.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Get latest vitals error:', error);
    res.status(500).json({
      error: 'Internal server error while fetching latest vitals'
    });
  }
});

// @route   GET /api/vitals/history
// @desc    Get vitals history for current user or specified user (supervisor)
// @access  Private
router.get('/history', async (req, res) => {
  try {
    // Validate query parameters
    const { error, value } = userVitalsSchema.validate(req.query);
    if (error) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.details.map(detail => detail.message)
      });
    }

    const { role, id: currentUserId } = req.user;
    const { userId } = value;

    // Determine target user ID
    let targetUserId = currentUserId;
    if (role === 'supervisor' && userId) {
      targetUserId = userId;
    } else if (role === 'employee' && userId && userId !== currentUserId) {
      return res.status(403).json({
        error: 'Employees can only access their own vitals'
      });
    }

    // Calculate time range
    const { startTime, endTime } = calculateTimeRange(value);

    // Get vitals history
    const vitals = await Vital.getByUserAndTimeRange(targetUserId, startTime, endTime);

    res.json({
      vitals,
      count: vitals.length,
      timeRange: { startTime, endTime },
      userId: targetUserId
    });

  } catch (error) {
    console.error('Get vitals history error:', error);
    res.status(500).json({
      error: 'Internal server error while fetching vitals history'
    });
  }
});

// @route   GET /api/vitals/device/:deviceId
// @desc    Get vitals for specific device (supervisor only)
// @access  Private (Supervisor only)
router.get('/device/:deviceId', roleAuth(['supervisor']), async (req, res) => {
  try {
    const deviceId = parseInt(req.params.deviceId);
    
    // Validate query parameters
    const { error, value } = timeRangeSchema.validate(req.query);
    if (error) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.details.map(detail => detail.message)
      });
    }

    // Calculate time range
    const { startTime, endTime } = calculateTimeRange(value);

    // Get vitals for device
    const vitals = await Vital.getByDeviceAndTimeRange(deviceId, startTime, endTime);

    res.json({
      vitals,
      count: vitals.length,
      timeRange: { startTime, endTime },
      deviceId
    });

  } catch (error) {
    console.error('Get device vitals error:', error);
    res.status(500).json({
      error: 'Internal server error while fetching device vitals'
    });
  }
});

// @route   GET /api/vitals/abnormal
// @desc    Get abnormal vitals readings (supervisor only)
// @access  Private (Supervisor only)
router.get('/abnormal', roleAuth(['supervisor']), async (req, res) => {
  try {
    const { timeRange = '24 hours' } = req.query;
    
    // Validate time range
    const validRanges = ['1 hour', '6 hours', '24 hours', '7 days', '30 days'];
    if (!validRanges.includes(timeRange)) {
      return res.status(400).json({
        error: 'Invalid time range. Must be one of: ' + validRanges.join(', ')
      });
    }

    const abnormalReadings = await Vital.getAbnormalReadings(timeRange);

    res.json({
      abnormalReadings,
      count: abnormalReadings.length,
      timeRange
    });

  } catch (error) {
    console.error('Get abnormal vitals error:', error);
    res.status(500).json({
      error: 'Internal server error while fetching abnormal vitals'
    });
  }
});

// @route   GET /api/vitals/stats/daily/:userId?
// @desc    Get daily vitals statistics
// @access  Private
router.get('/stats/daily/:userId?', async (req, res) => {
  try {
    const { role, id: currentUserId } = req.user;
    const userIdParam = req.params.userId ? parseInt(req.params.userId) : null;
    const { date = moment().format('YYYY-MM-DD') } = req.query;

    // Determine target user ID
    let targetUserId = currentUserId;
    if (role === 'supervisor' && userIdParam) {
      targetUserId = userIdParam;
    } else if (role === 'employee' && userIdParam && userIdParam !== currentUserId) {
      return res.status(403).json({
        error: 'Employees can only access their own statistics'
      });
    }

    // Validate date format
    if (!moment(date, 'YYYY-MM-DD', true).isValid()) {
      return res.status(400).json({
        error: 'Invalid date format. Use YYYY-MM-DD'
      });
    }

    const stats = await Vital.getDailyStats(targetUserId, date);

    res.json({
      stats,
      date,
      userId: targetUserId
    });

  } catch (error) {
    console.error('Get daily stats error:', error);
    res.status(500).json({
      error: 'Internal server error while fetching daily statistics'
    });
  }
});

// @route   GET /api/vitals/stats/hourly/:userId?
// @desc    Get hourly averages for vitals
// @access  Private
router.get('/stats/hourly/:userId?', async (req, res) => {
  try {
    const { role, id: currentUserId } = req.user;
    const userIdParam = req.params.userId ? parseInt(req.params.userId) : null;
    const { date = moment().format('YYYY-MM-DD') } = req.query;

    // Determine target user ID and get their device
    let targetUserId = currentUserId;
    if (role === 'supervisor' && userIdParam) {
      targetUserId = userIdParam;
    } else if (role === 'employee' && userIdParam && userIdParam !== currentUserId) {
      return res.status(403).json({
        error: 'Employees can only access their own statistics'
      });
    }

    // Validate date format
    if (!moment(date, 'YYYY-MM-DD', true).isValid()) {
      return res.status(400).json({
        error: 'Invalid date format. Use YYYY-MM-DD'
      });
    }

    // Get user's device
    const user = await User.findWithDevice(targetUserId);
    if (!user || !user.device) {
      return res.status(404).json({
        error: 'No device found for user'
      });
    }

    const hourlyAverages = await Vital.getHourlyAverages(user.device.id, date);

    res.json({
      hourlyAverages,
      date,
      userId: targetUserId,
      deviceId: user.device.id
    });

  } catch (error) {
    console.error('Get hourly averages error:', error);
    res.status(500).json({
      error: 'Internal server error while fetching hourly averages'
    });
  }
});

// @route   GET /api/vitals/trends/:userId?
// @desc    Get vitals trends analysis
// @access  Private
router.get('/trends/:userId?', async (req, res) => {
  try {
    const { role, id: currentUserId } = req.user;
    const userIdParam = req.params.userId ? parseInt(req.params.userId) : null;
    const { days = 7 } = req.query;

    // Determine target user ID
    let targetUserId = currentUserId;
    if (role === 'supervisor' && userIdParam) {
      targetUserId = userIdParam;
    } else if (role === 'employee' && userIdParam && userIdParam !== currentUserId) {
      return res.status(403).json({
        error: 'Employees can only access their own trends'
      });
    }

    // Validate days parameter
    const daysInt = parseInt(days);
    if (isNaN(daysInt) || daysInt < 1 || daysInt > 30) {
      return res.status(400).json({
        error: 'Days parameter must be between 1 and 30'
      });
    }

    const trends = await Vital.getTrendAnalysis(targetUserId, daysInt);

    res.json({
      trends,
      days: daysInt,
      userId: targetUserId
    });

  } catch (error) {
    console.error('Get trends error:', error);
    res.status(500).json({
      error: 'Internal server error while fetching trends'
    });
  }
});

// @route   GET /api/vitals/locations
// @desc    Get current locations for all users (supervisor only)
// @access  Private (Supervisor only)
router.get('/locations', roleAuth(['supervisor']), async (req, res) => {
  try {
    const locations = await Vital.getCurrentLocationsForAll();

    res.json({
      locations,
      count: locations.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Get locations error:', error);
    res.status(500).json({
      error: 'Internal server error while fetching locations'
    });
  }
});

// @route   GET /api/vitals/location/history/:userId?
// @desc    Get location history for user
// @access  Private
router.get('/location/history/:userId?', async (req, res) => {
  try {
    const { role, id: currentUserId } = req.user;
    const userIdParam = req.params.userId ? parseInt(req.params.userId) : null;

    // Determine target user ID
    let targetUserId = currentUserId;
    if (role === 'supervisor' && userIdParam) {
      targetUserId = userIdParam;
    } else if (role === 'employee' && userIdParam && userIdParam !== currentUserId) {
      return res.status(403).json({
        error: 'Employees can only access their own location history'
      });
    }

    // Validate query parameters
    const { error, value } = timeRangeSchema.validate(req.query);
    if (error) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.details.map(detail => detail.message)
      });
    }

    // Calculate time range
    const { startTime, endTime } = calculateTimeRange(value);

    const locationHistory = await Vital.getLocationHistory(targetUserId, startTime, endTime);

    res.json({
      locationHistory,
      count: locationHistory.length,
      timeRange: { startTime, endTime },
      userId: targetUserId
    });

  } catch (error) {
    console.error('Get location history error:', error);
    res.status(500).json({
      error: 'Internal server error while fetching location history'
    });
  }
});

// @route   GET /api/vitals/summary
// @desc    Get vitals summary (supervisor only)
// @access  Private (Supervisor only)
router.get('/summary', roleAuth(['supervisor']), async (req, res) => {
  try {
    const { timeRange = '24 hours' } = req.query;
    
    // Get latest vitals for all devices
    const latestVitals = await Vital.getLatestForAllDevices();
    
    // Get abnormal readings
    const abnormalReadings = await Vital.getAbnormalReadings(timeRange);
    
    // Calculate summary statistics
    const totalDevices = latestVitals.length;
    const onlineDevices = latestVitals.filter(vital => 
      moment().diff(moment(vital.timestamp), 'minutes') <= 30
    ).length;
    
    const abnormalDevices = latestVitals.filter(vital => vital.isAbnormal()).length;
    
    const summary = {
      totalDevices,
      onlineDevices,
      offlineDevices: totalDevices - onlineDevices,
      abnormalDevices,
      abnormalReadingsCount: abnormalReadings.length,
      onlinePercentage: totalDevices > 0 ? Math.round((onlineDevices / totalDevices) * 100) : 0
    };

    res.json({
      summary,
      latestVitals,
      abnormalReadings: abnormalReadings.slice(0, 10), // Limit to recent 10
      timeRange
    });

  } catch (error) {
    console.error('Get vitals summary error:', error);
    res.status(500).json({
      error: 'Internal server error while fetching vitals summary'
    });
  }
});

// @route   DELETE /api/vitals/cleanup
// @desc    Delete old vital records (supervisor only)
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

    const deletedCount = await Vital.deleteOlderThan(daysInt);

    res.json({
      message: 'Cleanup completed successfully',
      deletedRecords: deletedCount,
      daysOlderThan: daysInt
    });

  } catch (error) {
    console.error('Vitals cleanup error:', error);
    res.status(500).json({
      error: 'Internal server error during cleanup'
    });
  }
});

// @route   DELETE /api/vitals/clear-all
// @desc    Delete all vital records (development/testing only)
// @access  Private (Supervisor only)
router.delete('/clear-all', roleAuth(['supervisor']), async (req, res) => {
  try {
    const deletedCount = await Vital.deleteAll();

    res.json({
      message: 'All vitals cleared successfully',
      deletedRecords: deletedCount
    });

  } catch (error) {
    console.error('Clear all vitals error:', error);
    res.status(500).json({
      error: 'Internal server error during vitals clearing'
    });
  }
});

module.exports = router;