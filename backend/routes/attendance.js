const express = require('express');
const Joi = require('joi');
const Attendance = require('../models/Attendance');
const User = require('../models/User');
const roleAuth = require('../middleware/roleAuth');
const moment = require('moment');

const router = express.Router();

// Validation schemas
const dateSchema = Joi.object({
  date: Joi.date().iso().optional()
});

const dateRangeSchema = Joi.object({
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().optional(),
  days: Joi.number().integer().min(1).max(90).optional(),
  limit: Joi.number().integer().min(1).max(1000).optional()
});

const attendanceStatusSchema = Joi.object({
  status: Joi.string().valid('present', 'absent', 'partial').required()
});

// Helper function to calculate date range
const calculateDateRange = (query) => {
  let startDate, endDate;
  
  if (query.startDate && query.endDate) {
    startDate = moment(query.startDate).format('YYYY-MM-DD');
    endDate = moment(query.endDate).format('YYYY-MM-DD');
  } else if (query.days) {
    endDate = moment().format('YYYY-MM-DD');
    startDate = moment().subtract(query.days, 'days').format('YYYY-MM-DD');
  } else {
    // Default to current month
    startDate = moment().startOf('month').format('YYYY-MM-DD');
    endDate = moment().endOf('month').format('YYYY-MM-DD');
  }
  
  return { startDate, endDate };
};

// @route   GET /api/attendance/today
// @desc    Get today's attendance status for all users (supervisor) or own status (employee)
// @access  Private
router.get('/today', async (req, res) => {
  try {
    const { role, id: currentUserId } = req.user;

    if (role === 'supervisor') {
      // Supervisors can see all users' today status
      const todayStatus = await Attendance.getTodayStatus();
      
      res.json({
        attendance: todayStatus,
        count: todayStatus.length,
        date: moment().format('YYYY-MM-DD')
      });
    } else {
      // Employees can only see their own today status
      const today = moment().format('YYYY-MM-DD');
      const attendance = await Attendance.getByUserAndDate(currentUserId, today);
      
      res.json({
        attendance: attendance ? [attendance] : [],
        count: attendance ? 1 : 0,
        date: today
      });
    }

  } catch (error) {
    console.error('Get today attendance error:', error);
    res.status(500).json({
      error: 'Internal server error while fetching today\'s attendance'
    });
  }
});

// @route   GET /api/attendance/history/:userId?
// @desc    Get attendance history for user
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
        error: 'Employees can only access their own attendance history'
      });
    }

    // Validate query parameters
    const { error, value } = dateRangeSchema.validate(req.query);
    if (error) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.details.map(detail => detail.message)
      });
    }

    // Calculate date range
    const { startDate, endDate } = calculateDateRange(value);

    // Get attendance history
    const attendance = await Attendance.getByUser(targetUserId, startDate, endDate, value.limit);

    res.json({
      attendance,
      count: attendance.length,
      dateRange: { startDate, endDate },
      userId: targetUserId
    });

  } catch (error) {
    console.error('Get attendance history error:', error);
    res.status(500).json({
      error: 'Internal server error while fetching attendance history'
    });
  }
});

// @route   GET /api/attendance/date/:date
// @desc    Get attendance for specific date (supervisor only)
// @access  Private (Supervisor only)
router.get('/date/:date', roleAuth(['supervisor']), async (req, res) => {
  try {
    const { date } = req.params;
    
    // Validate date format
    if (!moment(date, 'YYYY-MM-DD', true).isValid()) {
      return res.status(400).json({
        error: 'Invalid date format. Use YYYY-MM-DD'
      });
    }

    const attendance = await Attendance.getByDate(date);

    res.json({
      attendance,
      count: attendance.length,
      date
    });

  } catch (error) {
    console.error('Get attendance by date error:', error);
    res.status(500).json({
      error: 'Internal server error while fetching attendance for date'
    });
  }
});

// @route   GET /api/attendance/summary
// @desc    Get attendance summary for date range
// @access  Private
router.get('/summary', async (req, res) => {
  try {
    const { role, id: currentUserId } = req.user;

    // Validate query parameters
    const { error, value } = dateRangeSchema.validate(req.query);
    if (error) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.details.map(detail => detail.message)
      });
    }

    // Calculate date range
    const { startDate, endDate } = calculateDateRange(value);

    // Get summary based on role
    let summary;
    if (role === 'supervisor') {
      // Supervisors can see summary for all users or specific user
      const userId = req.query.userId ? parseInt(req.query.userId) : null;
      summary = await Attendance.getSummary(startDate, endDate, userId);
    } else {
      // Employees can only see their own summary
      summary = await Attendance.getSummary(startDate, endDate, currentUserId);
    }

    res.json({
      summary,
      dateRange: { startDate, endDate }
    });

  } catch (error) {
    console.error('Get attendance summary error:', error);
    res.status(500).json({
      error: 'Internal server error while fetching attendance summary'
    });
  }
});

// @route   GET /api/attendance/stats
// @desc    Get attendance statistics (supervisor only)
// @access  Private (Supervisor only)
router.get('/stats', roleAuth(['supervisor']), async (req, res) => {
  try {
    const { timeRange = '30 days' } = req.query;
    
    // Validate time range
    const validRanges = ['7 days', '30 days', '90 days'];
    if (!validRanges.includes(timeRange)) {
      return res.status(400).json({
        error: 'Invalid time range. Must be one of: ' + validRanges.join(', ')
      });
    }

    const stats = await Attendance.getStats(timeRange);

    res.json({
      stats,
      timeRange
    });

  } catch (error) {
    console.error('Get attendance stats error:', error);
    res.status(500).json({
      error: 'Internal server error while fetching attendance statistics'
    });
  }
});

// @route   GET /api/attendance/late-arrivals/:date
// @desc    Get late arrivals for specific date (supervisor only)
// @access  Private (Supervisor only)
router.get('/late-arrivals/:date', roleAuth(['supervisor']), async (req, res) => {
  try {
    const { date } = req.params;
    const { startTime = '09:00:00' } = req.query;
    
    // Validate date format
    if (!moment(date, 'YYYY-MM-DD', true).isValid()) {
      return res.status(400).json({
        error: 'Invalid date format. Use YYYY-MM-DD'
      });
    }

    // Validate time format
    if (!moment(startTime, 'HH:mm:ss', true).isValid()) {
      return res.status(400).json({
        error: 'Invalid time format. Use HH:mm:ss'
      });
    }

    const lateArrivals = await Attendance.getLateArrivals(date, startTime);

    res.json({
      lateArrivals,
      count: lateArrivals.length,
      date,
      standardStartTime: startTime
    });

  } catch (error) {
    console.error('Get late arrivals error:', error);
    res.status(500).json({
      error: 'Internal server error while fetching late arrivals'
    });
  }
});

// @route   GET /api/attendance/early-departures/:date
// @desc    Get early departures for specific date (supervisor only)
// @access  Private (Supervisor only)
router.get('/early-departures/:date', roleAuth(['supervisor']), async (req, res) => {
  try {
    const { date } = req.params;
    const { endTime = '17:00:00' } = req.query;
    
    // Validate date format
    if (!moment(date, 'YYYY-MM-DD', true).isValid()) {
      return res.status(400).json({
        error: 'Invalid date format. Use YYYY-MM-DD'
      });
    }

    // Validate time format
    if (!moment(endTime, 'HH:mm:ss', true).isValid()) {
      return res.status(400).json({
        error: 'Invalid time format. Use HH:mm:ss'
      });
    }

    const earlyDepartures = await Attendance.getEarlyDepartures(date, endTime);

    res.json({
      earlyDepartures,
      count: earlyDepartures.length,
      date,
      standardEndTime: endTime
    });

  } catch (error) {
    console.error('Get early departures error:', error);
    res.status(500).json({
      error: 'Internal server error while fetching early departures'
    });
  }
});

// @route   GET /api/attendance/overtime/:date
// @desc    Get overtime records for specific date (supervisor only)
// @access  Private (Supervisor only)
router.get('/overtime/:date', roleAuth(['supervisor']), async (req, res) => {
  try {
    const { date } = req.params;
    const { standardHours = 8 } = req.query;
    
    // Validate date format
    if (!moment(date, 'YYYY-MM-DD', true).isValid()) {
      return res.status(400).json({
        error: 'Invalid date format. Use YYYY-MM-DD'
      });
    }

    // Validate standard hours
    const standardHoursFloat = parseFloat(standardHours);
    if (isNaN(standardHoursFloat) || standardHoursFloat <= 0) {
      return res.status(400).json({
        error: 'Standard hours must be a positive number'
      });
    }

    const overtime = await Attendance.getOvertime(date, standardHoursFloat);

    res.json({
      overtime,
      count: overtime.length,
      date,
      standardHours: standardHoursFloat
    });

  } catch (error) {
    console.error('Get overtime error:', error);
    res.status(500).json({
      error: 'Internal server error while fetching overtime records'
    });
  }
});

// @route   GET /api/attendance/trends
// @desc    Get attendance trends (supervisor only)
// @access  Private (Supervisor only)
router.get('/trends', roleAuth(['supervisor']), async (req, res) => {
  try {
    const { days = 30 } = req.query;
    
    // Validate days parameter
    const daysInt = parseInt(days);
    if (isNaN(daysInt) || daysInt < 1 || daysInt > 90) {
      return res.status(400).json({
        error: 'Days parameter must be between 1 and 90'
      });
    }

    const trends = await Attendance.getTrends(daysInt);

    res.json({
      trends,
      days: daysInt
    });

  } catch (error) {
    console.error('Get attendance trends error:', error);
    res.status(500).json({
      error: 'Internal server error while fetching attendance trends'
    });
  }
});

// @route   PUT /api/attendance/:userId/:date/status
// @desc    Update attendance status for specific user and date (supervisor only)
// @access  Private (Supervisor only)
router.put('/:userId/:date/status', roleAuth(['supervisor']), async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const { date } = req.params;
    
    // Validate parameters
    if (isNaN(userId)) {
      return res.status(400).json({
        error: 'Invalid user ID'
      });
    }

    if (!moment(date, 'YYYY-MM-DD', true).isValid()) {
      return res.status(400).json({
        error: 'Invalid date format. Use YYYY-MM-DD'
      });
    }

    // Validate request body
    const { error, value } = attendanceStatusSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.details.map(detail => detail.message)
      });
    }

    const { status } = value;

    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }

    // Update attendance status
    let attendance = await Attendance.updateStatus(userId, date, status);
    
    // If no existing record and marking absent, create new record
    if (!attendance && status === 'absent') {
      attendance = await Attendance.markAbsent(userId, date);
    }

    if (!attendance) {
      return res.status(404).json({
        error: 'Attendance record not found'
      });
    }

    res.json({
      message: 'Attendance status updated successfully',
      attendance
    });

  } catch (error) {
    console.error('Update attendance status error:', error);
    res.status(500).json({
      error: 'Internal server error while updating attendance status'
    });
  }
});

// @route   POST /api/attendance/mark-absent/:date
// @desc    Mark all users without attendance as absent for specific date (supervisor only)
// @access  Private (Supervisor only)
router.post('/mark-absent/:date', roleAuth(['supervisor']), async (req, res) => {
  try {
    const { date } = req.params;
    
    // Validate date format
    if (!moment(date, 'YYYY-MM-DD', true).isValid()) {
      return res.status(400).json({
        error: 'Invalid date format. Use YYYY-MM-DD'
      });
    }

    const absentRecords = await Attendance.autoMarkAbsent(date);

    res.json({
      message: 'Absent marking completed successfully',
      absentRecords,
      count: absentRecords.length,
      date
    });

  } catch (error) {
    console.error('Mark absent error:', error);
    res.status(500).json({
      error: 'Internal server error while marking absent users'
    });
  }
});

// @route   GET /api/attendance/user/:userId/calendar
// @desc    Get attendance calendar data for user
// @access  Private
router.get('/user/:userId/calendar', async (req, res) => {
  try {
    const targetUserId = parseInt(req.params.userId);
    const { role, id: currentUserId } = req.user;

    // Validate user ID
    if (isNaN(targetUserId)) {
      return res.status(400).json({
        error: 'Invalid user ID'
      });
    }

    // Check permissions
    if (role === 'employee' && targetUserId !== currentUserId) {
      return res.status(403).json({
        error: 'Employees can only access their own attendance calendar'
      });
    }

    const { month, year } = req.query;
    
    // Default to current month/year if not specified
    const targetMonth = month ? parseInt(month) : moment().month() + 1;
    const targetYear = year ? parseInt(year) : moment().year();

    // Validate month and year
    if (targetMonth < 1 || targetMonth > 12) {
      return res.status(400).json({
        error: 'Month must be between 1 and 12'
      });
    }

    // Calculate date range for the month
    const startDate = moment({ year: targetYear, month: targetMonth - 1, day: 1 }).format('YYYY-MM-DD');
    const endDate = moment({ year: targetYear, month: targetMonth - 1 }).endOf('month').format('YYYY-MM-DD');

    // Get attendance for the month
    const attendance = await Attendance.getByUser(targetUserId, startDate, endDate);

    // Format for calendar
    const calendarData = attendance.map(record => ({
      date: record.date,
      status: record.status,
      check_in_time: record.check_in_time,
      check_out_time: record.check_out_time,
      total_hours: record.total_hours,
      is_complete: record.isComplete()
    }));

    res.json({
      calendarData,
      month: targetMonth,
      year: targetYear,
      userId: targetUserId,
      dateRange: { startDate, endDate }
    });

  } catch (error) {
    console.error('Get attendance calendar error:', error);
    res.status(500).json({
      error: 'Internal server error while fetching attendance calendar'
    });
  }
});

// @route   GET /api/attendance/export
// @desc    Export attendance data (supervisor only)
// @access  Private (Supervisor only)
router.get('/export', roleAuth(['supervisor']), async (req, res) => {
  try {
    // Validate query parameters
    const { error, value } = dateRangeSchema.validate(req.query);
    if (error) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.details.map(detail => detail.message)
      });
    }

    // Calculate date range
    const { startDate, endDate } = calculateDateRange(value);

    // Get attendance summary for export
    const summary = await Attendance.getSummary(startDate, endDate);

    // Format data for export (CSV-like structure)
    const exportData = {
      dateRange: { startDate, endDate },
      generatedAt: new Date().toISOString(),
      data: summary.map(record => ({
        user_id: record.user_id,
        user_name: record.user_name,
        department: record.department,
        total_days: record.total_days,
        present_days: record.present_days,
        absent_days: record.absent_days,
        partial_days: record.partial_days,
        attendance_rate: record.present_days > 0 ? Math.round((record.present_days / record.total_days) * 100) : 0,
        average_hours_per_day: record.avg_hours_per_day,
        total_hours_worked: record.total_hours
      }))
    };

    res.json({
      exportData,
      count: exportData.data.length
    });

  } catch (error) {
    console.error('Export attendance error:', error);
    res.status(500).json({
      error: 'Internal server error while exporting attendance data'
    });
  }
});

// @route   DELETE /api/attendance/clear-all
// @desc    Delete all attendance records (development/testing only)
// @access  Private (Supervisor only)
router.delete('/clear-all', roleAuth(['supervisor']), async (req, res) => {
  try {
    const deletedCount = await Attendance.deleteAll();

    res.json({
      message: 'All attendance records cleared successfully',
      deletedRecords: deletedCount
    });

  } catch (error) {
    console.error('Clear all attendance error:', error);
    res.status(500).json({
      error: 'Internal server error during attendance clearing'
    });
  }
});

module.exports = router;