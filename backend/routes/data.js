const express = require('express');
const Joi = require('joi');
const Vital = require('../models/Vital');
const Alert = require('../models/Alert');
const User = require('../models/User');
const Attendance = require('../models/Attendance');

const router = express.Router();

// Validation schema for IoT device data
const deviceDataSchema = Joi.object({
  device_serial: Joi.string().required(),
  heart_rate: Joi.number().integer().min(30).max(200).optional(),
  spo2: Joi.number().integer().min(0).max(100).optional(),
  temperature: Joi.number().min(30).max(45).optional(),
  latitude: Joi.number().min(-90).max(90).optional(),
  longitude: Joi.number().min(-180).max(180).optional(),
  gps_accuracy: Joi.number().min(0).optional(),
  fall_detected: Joi.boolean().optional(),
  timestamp: Joi.date().iso().optional(),
});

// @route   POST /api/data
// @desc    Ingest data from IoT devices
// @access  Public (devices don't have user auth, use device serial)
router.post('/', async (req, res) => {
  try {
    // Validate request body
    const { error, value } = deviceDataSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.details.map(detail => detail.message)
      });
    }

    const { 
      device_serial, 
      heart_rate, 
      spo2, 
      temperature, 
      latitude, 
      longitude, 
      gps_accuracy,
      fall_detected = false,
      timestamp = new Date()
    } = value;

    // Find device by serial
    const device = await User.findWithDevice(null, device_serial);
    if (!device) {
      return res.status(404).json({
        error: 'Device not found'
      });
    }

    // Create vital record
    const vital = await Vital.create({
      device_id: device.device.id,
      heart_rate,
      spo2,
      temperature,
      latitude,
      longitude,
      gps_accuracy,
      fall_detected,
      timestamp
    });

    // Process attendance (first signal of the day)
    if (heart_rate || spo2 || temperature) {
      await Attendance.processFirstSignal(device.id, timestamp);
    }

    // Check for alerts
    if (vital.isAbnormal()) {
      const alerts = await Alert.createFromVital(vital, device.id);
      
      // Emit real-time alerts
      const io = req.app.get('io');
      if (io && alerts.length > 0) {
        for (const alert of alerts) {
          io.broadcastVitalAlert(alert, vital);
        }
      }
    }

    // Emit real-time vital update
    const io = req.app.get('io');
    if (io) {
      io.broadcastVitalUpdate(vital, device.id);
    }

    res.status(201).json({
      message: 'Data ingested successfully',
      vital_id: vital.id,
      alerts_created: vital.isAbnormal() ? vital.getAbnormalityDetails().length : 0,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Data ingestion error:', error);
    res.status(500).json({
      error: 'Internal server error during data ingestion'
    });
  }
});

// @route   GET /api/data/devices
// @desc    Get list of active devices (for testing)
// @access  Private
router.get('/devices', async (req, res) => {
  try {
    const devices = await User.findAll({ active: true });
    
    res.json({
      devices: devices.map(user => ({
        device_serial: user.device?.serial,
        user_name: user.name,
        user_id: user.id,
        last_seen: user.device?.last_seen,
        is_active: user.device?.is_active
      })).filter(d => d.device_serial)
    });

  } catch (error) {
    console.error('Get devices error:', error);
    res.status(500).json({
      error: 'Internal server error while fetching devices'
    });
  }
});

// @route   GET /api/data/employees
// @desc    Get all employees with devices and latest vitals
// @access  Private  
router.get('/employees', async (req, res) => {
  try {
    const employees = await User.findAll({ active: true });
    
    res.json({
      employees: employees.map(user => ({
        id: user.id,
        name: user.name,
        email: user.email,
        department: user.department,
        phone: user.phone,
        emergency_contact_name: user.emergency_contact_name,
        emergency_contact_phone: user.emergency_contact_phone,
        device: user.device ? {
          id: user.device.id,
          serial: user.device.serial,
          model: user.device.device_model,
          firmware_version: user.device.firmware_version,
          battery_level: user.device.battery_level,
          last_seen: user.device.last_seen,
          is_active: user.device.is_active
        } : null
      }))
    });

  } catch (error) {
    console.error('Get employees error:', error);
    res.status(500).json({
      error: 'Internal server error while fetching employees'
    });
  }
});

module.exports = router;