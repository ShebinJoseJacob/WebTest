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

const locationFiltersSchema = Joi.object({
  startTime: Joi.date().iso().optional(),
  endTime: Joi.date().iso().optional(),
  hours: Joi.number().integer().min(1).max(168).optional(),
  days: Joi.number().integer().min(1).max(30).optional(),
  userId: Joi.number().integer().optional(),
  accuracy: Joi.number().min(0).max(1000).optional(), // GPS accuracy filter in meters
  limit: Joi.number().integer().min(1).max(1000).optional()
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
    // Default to last 1 hour for location data
    endTime = new Date();
    startTime = moment().subtract(1, 'hour').toDate();
  }
  
  return { startTime, endTime };
};

// Helper function to calculate distance between two points (Haversine formula)
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c * 1000; // Return distance in meters
};

// @route   GET /api/location/current
// @desc    Get current locations for all users (supervisor) or own location (employee)
// @access  Private
router.get('/current', async (req, res) => {
  try {
    const { role, id: currentUserId } = req.user;

    let locations;
    if (role === 'supervisor') {
      // Supervisors can see all current locations
      locations = await Vital.getCurrentLocationsForAll();
    } else {
      // Employees can only see their own current location
      const user = await User.findWithDevice(currentUserId);
      if (!user || !user.device) {
        return res.status(404).json({
          error: 'No device found for user'
        });
      }

      const latest = await Vital.getLatestByDevice(user.device.id);
      if (latest && latest.latitude && latest.longitude) {
        locations = [{
          user_id: currentUserId,
          user_name: user.name,
          device_serial: user.device.serial,
          latitude: latest.latitude,
          longitude: latest.longitude,
          gps_accuracy: latest.gps_accuracy,
          timestamp: latest.timestamp,
          vitals: {
            heart_rate: latest.heart_rate,
            spo2: latest.spo2,
            temperature: latest.temperature,
            fall_detected: latest.fall_detected
          }
        }];
      } else {
        locations = [];
      }
    }

    res.json({
      locations,
      count: locations.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Get current locations error:', error);
    res.status(500).json({
      error: 'Internal server error while fetching current locations'
    });
  }
});

// @route   GET /api/location/history/:userId?
// @desc    Get location history for user
// @access  Private
router.get('/history/:userId?', async (req, res) => {
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
    const { error, value } = locationFiltersSchema.validate(req.query);
    if (error) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.details.map(detail => detail.message)
      });
    }

    // Calculate time range
    const { startTime, endTime } = calculateTimeRange(value);

    // Get location history
    let locationHistory = await Vital.getLocationHistory(targetUserId, startTime, endTime);

    // Apply accuracy filter if specified
    if (value.accuracy) {
      locationHistory = locationHistory.filter(location => 
        location.gps_accuracy <= value.accuracy
      );
    }

    // Apply limit if specified
    if (value.limit) {
      locationHistory = locationHistory.slice(0, value.limit);
    }

    // Add additional metadata
    const enrichedHistory = locationHistory.map((location, index) => {
      const enriched = { ...location };
      
      // Calculate distance from previous location
      if (index > 0) {
        const prevLocation = locationHistory[index - 1];
        enriched.distance_from_previous = calculateDistance(
          location.latitude, location.longitude,
          prevLocation.latitude, prevLocation.longitude
        );
      }
      
      return enriched;
    });

    res.json({
      locationHistory: enrichedHistory,
      count: enrichedHistory.length,
      timeRange: { startTime, endTime },
      userId: targetUserId,
      filters: value
    });

  } catch (error) {
    console.error('Get location history error:', error);
    res.status(500).json({
      error: 'Internal server error while fetching location history'
    });
  }
});

// @route   GET /api/location/track/:userId
// @desc    Get real-time location tracking for specific user (supervisor only)
// @access  Private (Supervisor only)
router.get('/track/:userId', roleAuth(['supervisor']), async (req, res) => {
  try {
    const targetUserId = parseInt(req.params.userId);
    if (isNaN(targetUserId)) {
      return res.status(400).json({
        error: 'Invalid user ID'
      });
    }

    // Get user with device info
    const user = await User.findWithDevice(targetUserId);
    if (!user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }

    if (!user.device) {
      return res.status(404).json({
        error: 'No device found for user'
      });
    }

    // Get latest location with vitals
    const latest = await Vital.getLatestByDevice(user.device.id);
    
    if (!latest || !latest.latitude || !latest.longitude) {
      return res.status(404).json({
        error: 'No location data available for user'
      });
    }

    // Check if location is recent (within last hour)
    const isRecent = moment().diff(moment(latest.timestamp), 'minutes') <= 60;

    const trackingData = {
      user: {
        id: user.id,
        name: user.name,
        department: user.department
      },
      device: {
        serial: user.device.serial,
        is_active: user.device.is_active,
        last_seen: user.device.last_seen,
        battery_level: user.device.battery_level
      },
      location: {
        latitude: latest.latitude,
        longitude: latest.longitude,
        gps_accuracy: latest.gps_accuracy,
        timestamp: latest.timestamp,
        is_recent: isRecent,
        minutes_ago: moment().diff(moment(latest.timestamp), 'minutes')
      },
      vitals: {
        heart_rate: latest.heart_rate,
        spo2: latest.spo2,
        temperature: latest.temperature,
        fall_detected: latest.fall_detected,
        is_abnormal: latest.isAbnormal()
      }
    };

    res.json({
      tracking: trackingData,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Get user tracking error:', error);
    res.status(500).json({
      error: 'Internal server error while fetching user tracking data'
    });
  }
});

// @route   GET /api/location/zone/:userId
// @desc    Check if user is within defined zones or areas
// @access  Private (Supervisor only)
router.get('/zone/:userId', roleAuth(['supervisor']), async (req, res) => {
  try {
    const targetUserId = parseInt(req.params.userId);
    if (isNaN(targetUserId)) {
      return res.status(400).json({
        error: 'Invalid user ID'
      });
    }

    const { zones } = req.query; // Expected to be JSON string of zone definitions

    // Get user's current location
    const user = await User.findWithDevice(targetUserId);
    if (!user || !user.device) {
      return res.status(404).json({
        error: 'User or device not found'
      });
    }

    const latest = await Vital.getLatestByDevice(user.device.id);
    if (!latest || !latest.latitude || !latest.longitude) {
      return res.status(404).json({
        error: 'No location data available'
      });
    }

    // Parse zones if provided (simple circular zones for this example)
    let zoneStatus = [];
    if (zones) {
      try {
        const parsedZones = JSON.parse(zones);
        zoneStatus = parsedZones.map(zone => {
          const distance = calculateDistance(
            latest.latitude, latest.longitude,
            zone.latitude, zone.longitude
          );
          
          return {
            zone_id: zone.id,
            zone_name: zone.name,
            zone_type: zone.type,
            is_inside: distance <= zone.radius,
            distance_from_center: Math.round(distance),
            radius: zone.radius
          };
        });
      } catch (parseError) {
        return res.status(400).json({
          error: 'Invalid zones format. Must be valid JSON array.'
        });
      }
    }

    res.json({
      user_id: targetUserId,
      current_location: {
        latitude: latest.latitude,
        longitude: latest.longitude,
        gps_accuracy: latest.gps_accuracy,
        timestamp: latest.timestamp
      },
      zone_status: zoneStatus,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Get zone status error:', error);
    res.status(500).json({
      error: 'Internal server error while checking zone status'
    });
  }
});

// @route   GET /api/location/summary
// @desc    Get location summary for all users (supervisor only)
// @access  Private (Supervisor only)
router.get('/summary', roleAuth(['supervisor']), async (req, res) => {
  try {
    const locations = await Vital.getCurrentLocationsForAll();
    
    // Calculate summary statistics
    const totalUsers = locations.length;
    const recentLocations = locations.filter(loc => 
      moment().diff(moment(loc.timestamp), 'minutes') <= 30
    );
    const accurateLocations = locations.filter(loc => 
      loc.gps_accuracy && loc.gps_accuracy <= 10 // Within 10 meters accuracy
    );

    // Group by departments if available
    const departmentSummary = {};
    locations.forEach(loc => {
      // This would require joining with user data to get department info
      // For now, we'll skip this and just provide basic stats
    });

    const summary = {
      total_users: totalUsers,
      users_with_recent_location: recentLocations.length,
      users_with_accurate_location: accurateLocations.length,
      location_coverage_percentage: totalUsers > 0 ? Math.round((recentLocations.length / totalUsers) * 100) : 0,
      accuracy_percentage: locations.length > 0 ? Math.round((accurateLocations.length / locations.length) * 100) : 0
    };

    res.json({
      summary,
      locations: locations.slice(0, 20), // Limit to first 20 for performance
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Get location summary error:', error);
    res.status(500).json({
      error: 'Internal server error while fetching location summary'
    });
  }
});

// @route   GET /api/location/heatmap
// @desc    Get location heatmap data (supervisor only)
// @access  Private (Supervisor only)
router.get('/heatmap', roleAuth(['supervisor']), async (req, res) => {
  try {
    const { hours = 24, accuracy = 50 } = req.query;
    
    // Validate parameters
    const hoursInt = parseInt(hours);
    const accuracyInt = parseInt(accuracy);
    
    if (isNaN(hoursInt) || hoursInt < 1 || hoursInt > 168) {
      return res.status(400).json({
        error: 'Hours parameter must be between 1 and 168'
      });
    }

    if (isNaN(accuracyInt) || accuracyInt < 1 || accuracyInt > 1000) {
      return res.status(400).json({
        error: 'Accuracy parameter must be between 1 and 1000 meters'
      });
    }

    // Calculate time range
    const endTime = new Date();
    const startTime = moment().subtract(hoursInt, 'hours').toDate();

    // Get all location data within time range for all users
    const locations = await Vital.getCurrentLocationsForAll(); // This would need to be modified to accept time range

    // Filter by accuracy
    const accurateLocations = locations.filter(loc => 
      loc.gps_accuracy && loc.gps_accuracy <= accuracyInt
    );

    // Create heatmap data points
    const heatmapData = accurateLocations.map(loc => ({
      lat: loc.latitude,
      lng: loc.longitude,
      weight: 1, // Could be adjusted based on time spent at location or other factors
      timestamp: loc.timestamp,
      user_id: loc.user_id,
      accuracy: loc.gps_accuracy
    }));

    res.json({
      heatmapData,
      count: heatmapData.length,
      timeRange: { startTime, endTime },
      filters: { hours: hoursInt, accuracy: accuracyInt }
    });

  } catch (error) {
    console.error('Get location heatmap error:', error);
    res.status(500).json({
      error: 'Internal server error while generating heatmap data'
    });
  }
});

// @route   POST /api/location/geofence
// @desc    Check geofence violations (supervisor only)
// @access  Private (Supervisor only)
router.post('/geofence', roleAuth(['supervisor']), async (req, res) => {
  try {
    const { geofences, check_all_users = false, user_ids = [] } = req.body;

    if (!geofences || !Array.isArray(geofences)) {
      return res.status(400).json({
        error: 'Geofences array is required'
      });
    }

    let locations;
    if (check_all_users) {
      locations = await Vital.getCurrentLocationsForAll();
    } else if (user_ids.length > 0) {
      // Get locations for specific users
      locations = [];
      for (const userId of user_ids) {
        const user = await User.findWithDevice(userId);
        if (user && user.device) {
          const latest = await Vital.getLatestByDevice(user.device.id);
          if (latest && latest.latitude && latest.longitude) {
            locations.push({
              user_id: userId,
              user_name: user.name,
              device_serial: user.device.serial,
              latitude: latest.latitude,
              longitude: latest.longitude,
              gps_accuracy: latest.gps_accuracy,
              timestamp: latest.timestamp
            });
          }
        }
      }
    } else {
      return res.status(400).json({
        error: 'Either check_all_users must be true or user_ids must be provided'
      });
    }

    // Check geofence violations
    const violations = [];
    
    locations.forEach(location => {
      geofences.forEach(geofence => {
        const distance = calculateDistance(
          location.latitude, location.longitude,
          geofence.latitude, geofence.longitude
        );

        const isInside = distance <= geofence.radius;
        const isViolation = geofence.type === 'allowed' ? !isInside : isInside;

        if (isViolation) {
          violations.push({
            user_id: location.user_id,
            user_name: location.user_name,
            device_serial: location.device_serial,
            geofence_id: geofence.id,
            geofence_name: geofence.name,
            geofence_type: geofence.type,
            violation_type: geofence.type === 'allowed' ? 'outside_allowed_zone' : 'inside_restricted_zone',
            distance_from_center: Math.round(distance),
            location: {
              latitude: location.latitude,
              longitude: location.longitude,
              gps_accuracy: location.gps_accuracy,
              timestamp: location.timestamp
            }
          });
        }
      });
    });

    res.json({
      violations,
      violation_count: violations.length,
      total_users_checked: locations.length,
      geofences_checked: geofences.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Geofence check error:', error);
    res.status(500).json({
      error: 'Internal server error while checking geofences'
    });
  }
});

module.exports = router;