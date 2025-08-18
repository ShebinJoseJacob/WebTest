const { query, transaction } = require('../config/db');
const moment = require('moment');

class Attendance {
  constructor(attendanceData) {
    this.id = attendanceData.id;
    this.user_id = attendanceData.user_id;
    this.date = attendanceData.date;
    this.check_in_time = attendanceData.check_in_time;
    this.check_out_time = attendanceData.check_out_time;
    this.total_hours = parseFloat(attendanceData.total_hours) || 0;
    this.status = attendanceData.status;
    this.created_at = attendanceData.created_at;
    this.updated_at = attendanceData.updated_at;
  }

  // Create or update attendance record
  static async createOrUpdate(userId, date, timestamp) {
    return await transaction(async (client) => {
      // Check if attendance record exists for this user and date
      const existingResult = await client.query(
        'SELECT * FROM attendance WHERE user_id = $1 AND date = $2',
        [userId, date]
      );

      if (existingResult.rows.length === 0) {
        // Create new attendance record with check-in
        const result = await client.query(
          `INSERT INTO attendance (user_id, date, check_in_time, status, created_at, updated_at)
           VALUES ($1, $2, $3, 'present', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           RETURNING *`,
          [userId, date, timestamp]
        );
        return new Attendance(result.rows[0]);
      } else {
        // Update existing record
        const existing = existingResult.rows[0];
        
        // If no check-in time, set it
        if (!existing.check_in_time) {
          const result = await client.query(
            `UPDATE attendance 
             SET check_in_time = $3, status = 'present', updated_at = CURRENT_TIMESTAMP
             WHERE user_id = $1 AND date = $2
             RETURNING *`,
            [userId, date, timestamp]
          );
          return new Attendance(result.rows[0]);
        }
        
        // Update check-out time and calculate total hours
        const checkInTime = moment(existing.check_in_time);
        const checkOutTime = moment(timestamp);
        const totalHours = checkOutTime.diff(checkInTime, 'hours', true);
        
        const result = await client.query(
          `UPDATE attendance 
           SET check_out_time = $3, total_hours = $4, updated_at = CURRENT_TIMESTAMP
           WHERE user_id = $1 AND date = $2
           RETURNING *`,
          [userId, date, timestamp, totalHours]
        );
        return new Attendance(result.rows[0]);
      }
    });
  }

  // Get attendance by user and date
  static async getByUserAndDate(userId, date) {
    const result = await query(
      'SELECT * FROM attendance WHERE user_id = $1 AND date = $2',
      [userId, date]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return new Attendance(result.rows[0]);
  }

  // Get attendance history for a user
  static async getByUser(userId, startDate, endDate, limit = 30) {
    let queryText = `
      SELECT a.*, u.name as user_name
      FROM attendance a
      JOIN users u ON a.user_id = u.id
      WHERE a.user_id = $1
    `;
    const params = [userId];
    let paramCount = 1;

    if (startDate) {
      paramCount++;
      queryText += ` AND a.date >= $${paramCount}`;
      params.push(startDate);
    }

    if (endDate) {
      paramCount++;
      queryText += ` AND a.date <= $${paramCount}`;
      params.push(endDate);
    }

    queryText += ` ORDER BY a.date DESC LIMIT $${paramCount + 1}`;
    params.push(limit);

    const result = await query(queryText, params);

    return result.rows.map(row => ({
      ...new Attendance(row),
      user_name: row.user_name
    }));
  }

  // Get all attendance for a specific date (for supervisors)
  static async getByDate(date) {
    const result = await query(`
      SELECT a.*, u.name as user_name, u.department
      FROM attendance a
      JOIN users u ON a.user_id = u.id
      WHERE a.date = $1
      ORDER BY u.name ASC
    `, [date]);

    return result.rows.map(row => ({
      ...new Attendance(row),
      user_name: row.user_name,
      department: row.department
    }));
  }

  // Get attendance summary for date range
  static async getSummary(startDate, endDate, userId = null) {
    let queryText = `
      SELECT 
        u.id as user_id,
        u.name as user_name,
        u.department,
        COUNT(*) as total_days,
        COUNT(CASE WHEN a.status = 'present' THEN 1 END) as present_days,
        COUNT(CASE WHEN a.status = 'absent' THEN 1 END) as absent_days,
        COUNT(CASE WHEN a.status = 'partial' THEN 1 END) as partial_days,
        ROUND(AVG(a.total_hours), 2) as avg_hours_per_day,
        SUM(a.total_hours) as total_hours
      FROM attendance a
      JOIN users u ON a.user_id = u.id
      WHERE a.date BETWEEN $1 AND $2
    `;
    const params = [startDate, endDate];

    if (userId) {
      queryText += ' AND a.user_id = $3';
      params.push(userId);
    }

    queryText += ' GROUP BY u.id, u.name, u.department ORDER BY u.name ASC';

    const result = await query(queryText, params);
    return result.rows;
  }

  // Get today's attendance status for all users
  static async getTodayStatus() {
    const today = moment().format('YYYY-MM-DD');
    
    const result = await query(`
      SELECT 
        u.id as user_id,
        u.name as user_name,
        u.department,
        a.check_in_time,
        a.check_out_time,
        a.total_hours,
        a.status,
        CASE 
          WHEN a.check_in_time IS NULL THEN 'not_checked_in'
          WHEN a.check_out_time IS NULL THEN 'checked_in'
          ELSE 'checked_out'
        END as current_status,
        d.last_seen,
        d.is_active as device_active
      FROM users u
      LEFT JOIN attendance a ON u.id = a.user_id AND a.date = $1
      LEFT JOIN devices d ON u.id = d.user_id
      WHERE u.role = 'employee'
      ORDER BY u.name ASC
    `, [today]);

    return result.rows;
  }

  // Mark user as absent
  static async markAbsent(userId, date) {
    const result = await query(
      `INSERT INTO attendance (user_id, date, status, created_at, updated_at)
       VALUES ($1, $2, 'absent', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id, date)
       DO UPDATE SET status = 'absent', updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [userId, date]
    );

    return new Attendance(result.rows[0]);
  }

  // Update attendance status
  static async updateStatus(userId, date, status) {
    const result = await query(
      `UPDATE attendance 
       SET status = $3, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND date = $2
       RETURNING *`,
      [userId, date, status]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return new Attendance(result.rows[0]);
  }

  // Get attendance statistics
  static async getStats(timeRange = '30 days') {
    const result = await query(`
      SELECT 
        COUNT(DISTINCT user_id) as total_employees,
        COUNT(*) as total_attendance_records,
        COUNT(CASE WHEN status = 'present' THEN 1 END) as present_count,
        COUNT(CASE WHEN status = 'absent' THEN 1 END) as absent_count,
        COUNT(CASE WHEN status = 'partial' THEN 1 END) as partial_count,
        ROUND(AVG(total_hours), 2) as avg_daily_hours,
        ROUND(
          COUNT(CASE WHEN status = 'present' THEN 1 END) * 100.0 / COUNT(*), 2
        ) as attendance_percentage
      FROM attendance
      WHERE date > CURRENT_DATE - INTERVAL '${timeRange}'
    `);

    return result.rows[0];
  }

  // Get late arrivals (assuming 9 AM is standard start time)
  static async getLateArrivals(date, standardStartTime = '09:00:00') {
    const result = await query(`
      SELECT a.*, u.name as user_name, u.department
      FROM attendance a
      JOIN users u ON a.user_id = u.id
      WHERE a.date = $1 
      AND a.check_in_time IS NOT NULL
      AND TIME(a.check_in_time) > $2
      ORDER BY a.check_in_time DESC
    `, [date, standardStartTime]);

    return result.rows.map(row => ({
      ...new Attendance(row),
      user_name: row.user_name,
      department: row.department,
      minutes_late: this.calculateMinutesLate(row.check_in_time, standardStartTime)
    }));
  }

  // Get early departures (assuming 5 PM is standard end time)
  static async getEarlyDepartures(date, standardEndTime = '17:00:00') {
    const result = await query(`
      SELECT a.*, u.name as user_name, u.department
      FROM attendance a
      JOIN users u ON a.user_id = u.id
      WHERE a.date = $1 
      AND a.check_out_time IS NOT NULL
      AND TIME(a.check_out_time) < $2
      ORDER BY a.check_out_time ASC
    `, [date, standardEndTime]);

    return result.rows.map(row => ({
      ...new Attendance(row),
      user_name: row.user_name,
      department: row.department,
      minutes_early: this.calculateMinutesEarly(row.check_out_time, standardEndTime)
    }));
  }

  // Get overtime records
  static async getOvertime(date, standardHours = 8) {
    const result = await query(`
      SELECT a.*, u.name as user_name, u.department
      FROM attendance a
      JOIN users u ON a.user_id = u.id
      WHERE a.date = $1 
      AND a.total_hours > $2
      ORDER BY a.total_hours DESC
    `, [date, standardHours]);

    return result.rows.map(row => ({
      ...new Attendance(row),
      user_name: row.user_name,
      department: row.department,
      overtime_hours: parseFloat(row.total_hours) - standardHours
    }));
  }

  // Get attendance trends
  static async getTrends(days = 30) {
    const result = await query(`
      SELECT 
        date,
        COUNT(*) as total_records,
        COUNT(CASE WHEN status = 'present' THEN 1 END) as present_count,
        COUNT(CASE WHEN status = 'absent' THEN 1 END) as absent_count,
        ROUND(AVG(total_hours), 2) as avg_hours,
        ROUND(
          COUNT(CASE WHEN status = 'present' THEN 1 END) * 100.0 / COUNT(*), 2
        ) as attendance_rate
      FROM attendance
      WHERE date > CURRENT_DATE - INTERVAL '${days} days'
      GROUP BY date
      ORDER BY date DESC
    `);

    return result.rows;
  }

  // Calculate minutes late
  static calculateMinutesLate(checkInTime, standardStartTime) {
    const checkIn = moment(checkInTime);
    const standardStart = moment(`${checkIn.format('YYYY-MM-DD')} ${standardStartTime}`);
    return Math.max(0, checkIn.diff(standardStart, 'minutes'));
  }

  // Calculate minutes early departure
  static calculateMinutesEarly(checkOutTime, standardEndTime) {
    const checkOut = moment(checkOutTime);
    const standardEnd = moment(`${checkOut.format('YYYY-MM-DD')} ${standardEndTime}`);
    return Math.max(0, standardEnd.diff(checkOut, 'minutes'));
  }

  // Process first signal of the day (for automatic check-in)
  static async processFirstSignal(userId, timestamp) {
    const date = moment(timestamp).format('YYYY-MM-DD');
    
    // Check if user already has attendance record for today
    const existing = await Attendance.getByUserAndDate(userId, date);
    
    if (!existing || !existing.check_in_time) {
      return await Attendance.createOrUpdate(userId, date, timestamp);
    }
    
    return existing;
  }

  // Auto mark absent users (to be run daily)
  static async autoMarkAbsent(date) {
    const result = await query(`
      INSERT INTO attendance (user_id, date, status, created_at, updated_at)
      SELECT u.id, $1, 'absent', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      FROM users u
      WHERE u.role = 'employee'
      AND u.id NOT IN (
        SELECT user_id FROM attendance WHERE date = $1
      )
      RETURNING *
    `, [date]);

    return result.rows.map(row => new Attendance(row));
  }

  // Get work hours summary
  getWorkHoursSummary() {
    if (!this.check_in_time || !this.check_out_time) {
      return {
        total_hours: this.total_hours,
        work_duration: 'incomplete',
        status: this.status
      };
    }

    const checkIn = moment(this.check_in_time);
    const checkOut = moment(this.check_out_time);
    
    return {
      check_in: checkIn.format('HH:mm'),
      check_out: checkOut.format('HH:mm'),
      total_hours: this.total_hours,
      work_duration: `${Math.floor(this.total_hours)}h ${Math.round((this.total_hours % 1) * 60)}m`,
      status: this.status
    };
  }

  // Check if attendance is complete
  isComplete() {
    return this.check_in_time && this.check_out_time;
  }

  // Delete all attendance records (for development/testing)
  static async deleteAll() {
    const result = await query('DELETE FROM attendance');
    return result.rowCount;
  }

  // Convert to JSON
  toJSON() {
    return {
      id: this.id,
      user_id: this.user_id,
      date: this.date,
      check_in_time: this.check_in_time,
      check_out_time: this.check_out_time,
      total_hours: this.total_hours,
      status: this.status,
      created_at: this.created_at,
      updated_at: this.updated_at,
      work_summary: this.getWorkHoursSummary(),
      is_complete: this.isComplete()
    };
  }
}

module.exports = Attendance;