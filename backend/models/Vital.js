const { query, transaction } = require('../config/db');
const moment = require('moment');

class Vital {
  constructor(vitalData) {
    this.id = vitalData.id;
    this.device_id = vitalData.device_id;
    this.heart_rate = vitalData.heart_rate;
    this.spo2 = vitalData.spo2;
    this.temperature = parseFloat(vitalData.temperature);
    this.latitude = parseFloat(vitalData.latitude);
    this.longitude = parseFloat(vitalData.longitude);
    this.gps_accuracy = parseFloat(vitalData.gps_accuracy);
    this.fall_detected = vitalData.fall_detected;
    // Environmental parameters
    this.co = vitalData.co ? parseFloat(vitalData.co) : null;
    this.h2s = vitalData.h2s ? parseFloat(vitalData.h2s) : null;
    this.ch4 = vitalData.ch4 ? parseFloat(vitalData.ch4) : null;
    this.timestamp = vitalData.timestamp;
    this.created_at = vitalData.created_at;
  }

  // Create new vital reading
  static async create(vitalData) {
    const {
      device_id,
      heart_rate,
      spo2,
      temperature,
      latitude,
      longitude,
      gps_accuracy,
      fall_detected = false,
      co,
      h2s,
      ch4,
      timestamp = new Date()
    } = vitalData;

    const result = await query(
      `INSERT INTO vitals (device_id, heart_rate, spo2, temperature, latitude, longitude, gps_accuracy, fall_detected, co, h2s, ch4, timestamp, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP)
       RETURNING *`,
      [device_id, heart_rate, spo2, temperature, latitude, longitude, gps_accuracy, fall_detected, co, h2s, ch4, timestamp]
    );

    return new Vital(result.rows[0]);
  }

  // Get latest vital for a device
  static async getLatestByDevice(deviceId) {
    const result = await query(
      'SELECT * FROM vitals WHERE device_id = $1 ORDER BY timestamp DESC LIMIT 1',
      [deviceId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return new Vital(result.rows[0]);
  }

  // Get vitals for a device within time range
  static async getByDeviceAndTimeRange(deviceId, startTime, endTime) {
    const result = await query(
      'SELECT * FROM vitals WHERE device_id = $1 AND timestamp BETWEEN $2 AND $3 ORDER BY timestamp DESC',
      [deviceId, startTime, endTime]
    );

    return result.rows.map(row => new Vital(row));
  }

  // Get vitals for a user within time range
  static async getByUserAndTimeRange(userId, startTime, endTime) {
    const result = await query(
      `SELECT v.* FROM vitals v
       JOIN devices d ON v.device_id = d.id
       WHERE d.user_id = $1 AND v.timestamp BETWEEN $2 AND $3
       ORDER BY v.timestamp DESC`,
      [userId, startTime, endTime]
    );

    return result.rows.map(row => new Vital(row));
  }

  // Get latest vitals for all devices (for supervisor dashboard)
  static async getLatestForAllDevices() {
    const result = await query(`
      WITH latest_vitals AS (
        SELECT DISTINCT ON (device_id) *
        FROM vitals
        ORDER BY device_id, timestamp DESC
      )
      SELECT lv.*, u.name as user_name, u.id as user_id, d.device_serial
      FROM latest_vitals lv
      JOIN devices d ON lv.device_id = d.id
      JOIN users u ON d.user_id = u.id
      WHERE d.is_active = true
      ORDER BY lv.timestamp DESC
    `);

    return result.rows.map(row => ({
      ...new Vital(row),
      user_name: row.user_name,
      user_id: row.user_id,
      device_serial: row.device_serial
    }));
  }

  // Get vitals with abnormal readings
  static async getAbnormalReadings(timeRange = '24 hours') {
    const result = await query(`
      SELECT v.*, u.name as user_name, u.id as user_id, d.device_serial
      FROM vitals v
      JOIN devices d ON v.device_id = d.id
      JOIN users u ON d.user_id = u.id
      WHERE v.timestamp > NOW() - INTERVAL '${timeRange}'
      AND (
        v.heart_rate < 60 OR v.heart_rate > 100 OR
        v.spo2 < 95 OR
        v.temperature < 36.0 OR v.temperature > 37.5 OR
        v.fall_detected = true
      )
      ORDER BY v.timestamp DESC
    `);

    return result.rows.map(row => ({
      ...new Vital(row),
      user_name: row.user_name,
      user_id: row.user_id,
      device_serial: row.device_serial
    }));
  }

  // Get hourly averages for a device
  static async getHourlyAverages(deviceId, date) {
    const result = await query(`
      SELECT 
        DATE_TRUNC('hour', timestamp) as hour,
        ROUND(AVG(heart_rate)) as avg_heart_rate,
        ROUND(AVG(spo2)) as avg_spo2,
        ROUND(AVG(temperature), 1) as avg_temperature,
        COUNT(*) as reading_count
      FROM vitals
      WHERE device_id = $1 
      AND DATE(timestamp) = $2
      AND heart_rate IS NOT NULL
      GROUP BY DATE_TRUNC('hour', timestamp)
      ORDER BY hour
    `, [deviceId, date]);

    return result.rows;
  }

  // Get daily statistics for a user
  static async getDailyStats(userId, date) {
    const result = await query(`
      SELECT 
        COUNT(*) as total_readings,
        ROUND(AVG(heart_rate)) as avg_heart_rate,
        MIN(heart_rate) as min_heart_rate,
        MAX(heart_rate) as max_heart_rate,
        ROUND(AVG(spo2)) as avg_spo2,
        MIN(spo2) as min_spo2,
        MAX(spo2) as max_spo2,
        ROUND(AVG(temperature), 1) as avg_temperature,
        ROUND(MIN(temperature), 1) as min_temperature,
        ROUND(MAX(temperature), 1) as max_temperature,
        COUNT(CASE WHEN fall_detected = true THEN 1 END) as fall_incidents
      FROM vitals v
      JOIN devices d ON v.device_id = d.id
      WHERE d.user_id = $1 
      AND DATE(v.timestamp) = $2
      AND v.heart_rate IS NOT NULL
    `, [userId, date]);

    return result.rows[0];
  }

  // Get location history for a user
  static async getLocationHistory(userId, startTime, endTime) {
    const result = await query(`
      SELECT latitude, longitude, gps_accuracy, timestamp
      FROM vitals v
      JOIN devices d ON v.device_id = d.id
      WHERE d.user_id = $1 
      AND v.timestamp BETWEEN $2 AND $3
      AND latitude IS NOT NULL 
      AND longitude IS NOT NULL
      ORDER BY v.timestamp DESC
    `, [userId, startTime, endTime]);

    return result.rows;
  }

  // Get current location for all users (for map view)
  static async getCurrentLocationsForAll() {
    const result = await query(`
      WITH latest_locations AS (
        SELECT DISTINCT ON (device_id) 
          device_id, latitude, longitude, gps_accuracy, timestamp
        FROM vitals
        WHERE latitude IS NOT NULL AND longitude IS NOT NULL
        ORDER BY device_id, timestamp DESC
      )
      SELECT ll.*, u.name as user_name, u.id as user_id, d.device_serial,
             v.heart_rate, v.spo2, v.temperature, v.fall_detected
      FROM latest_locations ll
      JOIN devices d ON ll.device_id = d.id
      JOIN users u ON d.user_id = u.id
      JOIN vitals v ON ll.device_id = v.device_id AND ll.timestamp = v.timestamp
      WHERE d.is_active = true
      AND ll.timestamp > NOW() - INTERVAL '1 hour'
    `);

    return result.rows.map(row => ({
      user_id: row.user_id,
      user_name: row.user_name,
      device_serial: row.device_serial,
      latitude: parseFloat(row.latitude),
      longitude: parseFloat(row.longitude),
      gps_accuracy: parseFloat(row.gps_accuracy),
      timestamp: row.timestamp,
      vitals: {
        heart_rate: row.heart_rate,
        spo2: row.spo2,
        temperature: parseFloat(row.temperature),
        fall_detected: row.fall_detected
      }
    }));
  }

  // Delete old vitals (for cleanup)
  static async deleteOlderThan(days) {
    const result = await query(
      'DELETE FROM vitals WHERE created_at < NOW() - INTERVAL $1',
      [`${days} days`]
    );

    return result.rowCount;
  }

  // Delete all vitals (for development/testing)
  static async deleteAll() {
    const result = await query('DELETE FROM vitals');
    return result.rowCount;
  }

  // Get vitals trend analysis
  static async getTrendAnalysis(userId, days = 7) {
    const result = await query(`
      SELECT 
        DATE(v.timestamp) as date,
        ROUND(AVG(v.heart_rate)) as avg_heart_rate,
        ROUND(AVG(v.spo2)) as avg_spo2,
        ROUND(AVG(v.temperature), 1) as avg_temperature,
        COUNT(*) as reading_count,
        COUNT(CASE WHEN v.fall_detected = true THEN 1 END) as fall_count
      FROM vitals v
      JOIN devices d ON v.device_id = d.id
      WHERE d.user_id = $1 
      AND v.timestamp > NOW() - INTERVAL '${days} days'
      AND v.heart_rate IS NOT NULL
      GROUP BY DATE(v.timestamp)
      ORDER BY date DESC
    `, [userId]);

    return result.rows;
  }

  // Batch insert vitals (for bulk operations)
  static async batchCreate(vitalsArray) {
    if (vitalsArray.length === 0) return [];

    const values = vitalsArray.map((vital, index) => {
      const baseIndex = index * 9;
      return `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4}, $${baseIndex + 5}, $${baseIndex + 6}, $${baseIndex + 7}, $${baseIndex + 8}, $${baseIndex + 9})`;
    }).join(',');

    const params = vitalsArray.flatMap(vital => [
      vital.device_id,
      vital.heart_rate,
      vital.spo2,
      vital.temperature,
      vital.latitude,
      vital.longitude,
      vital.gps_accuracy,
      vital.fall_detected || false,
      vital.timestamp || new Date()
    ]);

    const result = await query(
      `INSERT INTO vitals (device_id, heart_rate, spo2, temperature, latitude, longitude, gps_accuracy, fall_detected, timestamp)
       VALUES ${values}
       RETURNING *`,
      params
    );

    return result.rows.map(row => new Vital(row));
  }

  // Check if vital reading is abnormal
  isAbnormal() {
    return (
      this.heart_rate < 60 || this.heart_rate > 100 ||
      this.spo2 < 95 ||
      this.temperature < 36.0 || this.temperature > 37.5 ||
      this.fall_detected ||
      (this.co && this.co > 35) ||  // OSHA 8-hour TWA threshold
      (this.h2s && this.h2s > 10) ||  // OSHA STEL threshold
      (this.ch4 && this.ch4 > 10)   // 10% LEL threshold
    );
  }

  // Get abnormality details
  getAbnormalityDetails() {
    const issues = [];

    if (this.heart_rate < 60) issues.push({ type: 'heart_rate', message: 'Low heart rate', value: this.heart_rate, severity: 'medium' });
    if (this.heart_rate > 100) issues.push({ type: 'heart_rate', message: 'High heart rate', value: this.heart_rate, severity: 'high' });
    if (this.spo2 < 95) issues.push({ type: 'spo2', message: 'Low oxygen saturation', value: this.spo2, severity: 'high' });
    if (this.temperature < 36.0) issues.push({ type: 'temperature', message: 'Low body temperature', value: this.temperature, severity: 'medium' });
    if (this.temperature > 37.5) issues.push({ type: 'temperature', message: 'High body temperature', value: this.temperature, severity: 'medium' });
    if (this.fall_detected) issues.push({ type: 'fall', message: 'Fall detected', severity: 'critical' });
    
    // Environmental hazard detection
    if (this.co && this.co > 35) issues.push({ 
      type: 'co', 
      message: 'Dangerous carbon monoxide level', 
      value: this.co, 
      unit: 'ppm',
      severity: this.co > 200 ? 'critical' : 'high' 
    });
    if (this.h2s && this.h2s > 10) issues.push({ 
      type: 'h2s', 
      message: 'High hydrogen sulfide level', 
      value: this.h2s, 
      unit: 'ppm',
      severity: this.h2s > 50 ? 'critical' : 'high' 
    });
    if (this.ch4 && this.ch4 > 10) issues.push({ 
      type: 'ch4', 
      message: 'Dangerous methane concentration', 
      value: this.ch4, 
      unit: '%LEL',
      severity: this.ch4 > 25 ? 'critical' : 'high' 
    });

    return issues;
  }

  // Convert to JSON
  toJSON() {
    return {
      id: this.id,
      device_id: this.device_id,
      heart_rate: this.heart_rate,
      spo2: this.spo2,
      temperature: this.temperature,
      latitude: this.latitude,
      longitude: this.longitude,
      gps_accuracy: this.gps_accuracy,
      fall_detected: this.fall_detected,
      timestamp: this.timestamp,
      created_at: this.created_at,
      is_abnormal: this.isAbnormal(),
      abnormalities: this.isAbnormal() ? this.getAbnormalityDetails() : []
    };
  }
}

module.exports = Vital;