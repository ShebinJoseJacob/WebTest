const { query, transaction } = require('../config/db');
const moment = require('moment');

class Alert {
  constructor(alertData) {
    this.id = alertData.id;
    this.device_id = alertData.device_id;
    this.user_id = alertData.user_id;
    this.type = alertData.type;
    this.severity = alertData.severity;
    this.message = alertData.message;
    this.value = parseFloat(alertData.value);
    this.threshold = parseFloat(alertData.threshold);
    this.acknowledged = alertData.acknowledged;
    this.acknowledged_by = alertData.acknowledged_by;
    this.acknowledged_at = alertData.acknowledged_at;
    this.resolved = alertData.resolved;
    this.resolved_at = alertData.resolved_at;
    this.timestamp = alertData.timestamp;
    this.created_at = alertData.created_at;
  }

  // Create new alert
  static async create(alertData) {
    const {
      device_id,
      user_id,
      type,
      severity,
      message,
      value = null,
      threshold = null,
      timestamp = new Date()
    } = alertData;

    const result = await query(
      `INSERT INTO alerts (device_id, user_id, type, severity, message, value, threshold, timestamp, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
       RETURNING *`,
      [device_id, user_id, type, severity, message, value, threshold, timestamp]
    );

    return new Alert(result.rows[0]);
  }

  // Get alert by ID
  static async findById(id) {
    const result = await query(
      'SELECT * FROM alerts WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return new Alert(result.rows[0]);
  }

  // Get all alerts with user and device info
  static async getAll(filters = {}) {
    let queryText = `
      SELECT a.*, u.name as user_name, d.device_serial,
             ack_user.name as acknowledged_by_name
      FROM alerts a
      JOIN users u ON a.user_id = u.id
      JOIN devices d ON a.device_id = d.id
      LEFT JOIN users ack_user ON a.acknowledged_by = ack_user.id
      WHERE 1=1
    `;
    const queryParams = [];
    let paramCount = 0;

    if (filters.severity) {
      paramCount++;
      queryText += ` AND a.severity = $${paramCount}`;
      queryParams.push(filters.severity);
    }

    if (filters.type) {
      paramCount++;
      queryText += ` AND a.type = $${paramCount}`;
      queryParams.push(filters.type);
    }

    if (filters.acknowledged !== undefined) {
      paramCount++;
      queryText += ` AND a.acknowledged = $${paramCount}`;
      queryParams.push(filters.acknowledged);
    }

    if (filters.resolved !== undefined) {
      paramCount++;
      queryText += ` AND a.resolved = $${paramCount}`;
      queryParams.push(filters.resolved);
    }

    if (filters.user_id) {
      paramCount++;
      queryText += ` AND a.user_id = $${paramCount}`;
      queryParams.push(filters.user_id);
    }

    if (filters.device_id) {
      paramCount++;
      queryText += ` AND a.device_id = $${paramCount}`;
      queryParams.push(filters.device_id);
    }

    if (filters.time_range) {
      paramCount++;
      queryText += ` AND a.timestamp > NOW() - INTERVAL '${filters.time_range}'`;
    }

    queryText += ' ORDER BY a.timestamp DESC';

    if (filters.limit) {
      paramCount++;
      queryText += ` LIMIT $${paramCount}`;
      queryParams.push(filters.limit);
    }

    const result = await query(queryText, queryParams);

    return result.rows.map(row => ({
      ...new Alert(row),
      user_name: row.user_name,
      device_serial: row.device_serial,
      acknowledged_by_name: row.acknowledged_by_name
    }));
  }

  // Get unacknowledged alerts
  static async getUnacknowledged() {
    const result = await query(`
      SELECT a.*, u.name as user_name, d.device_serial
      FROM alerts a
      JOIN users u ON a.user_id = u.id
      JOIN devices d ON a.device_id = d.id
      WHERE a.acknowledged = false
      ORDER BY a.severity DESC, a.timestamp DESC
    `);

    return result.rows.map(row => ({
      ...new Alert(row),
      user_name: row.user_name,
      device_serial: row.device_serial
    }));
  }

  // Get critical alerts
  static async getCritical(timeRange = '24 hours') {
    const result = await query(`
      SELECT a.*, u.name as user_name, d.device_serial
      FROM alerts a
      JOIN users u ON a.user_id = u.id
      JOIN devices d ON a.device_id = d.id
      WHERE a.severity = 'critical'
      AND a.timestamp > NOW() - INTERVAL '${timeRange}'
      ORDER BY a.timestamp DESC
    `);

    return result.rows.map(row => ({
      ...new Alert(row),
      user_name: row.user_name,
      device_serial: row.device_serial
    }));
  }

  // Get alerts for specific user
  static async getByUser(userId, filters = {}) {
    let queryText = `
      SELECT a.*, d.device_serial
      FROM alerts a
      JOIN devices d ON a.device_id = d.id
      WHERE a.user_id = $1
    `;
    const queryParams = [userId];
    let paramCount = 1;

    if (filters.severity) {
      paramCount++;
      queryText += ` AND a.severity = $${paramCount}`;
      queryParams.push(filters.severity);
    }

    if (filters.type) {
      paramCount++;
      queryText += ` AND a.type = $${paramCount}`;
      queryParams.push(filters.type);
    }

    if (filters.time_range) {
      queryText += ` AND a.timestamp > NOW() - INTERVAL '${filters.time_range}'`;
    }

    queryText += ' ORDER BY a.timestamp DESC';

    if (filters.limit) {
      paramCount++;
      queryText += ` LIMIT $${paramCount}`;
      queryParams.push(filters.limit);
    }

    const result = await query(queryText, queryParams);

    return result.rows.map(row => ({
      ...new Alert(row),
      device_serial: row.device_serial
    }));
  }

  // Acknowledge alert
  static async acknowledge(alertId, acknowledgedBy) {
    const result = await query(
      `UPDATE alerts 
       SET acknowledged = true, acknowledged_by = $2, acknowledged_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [alertId, acknowledgedBy]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return new Alert(result.rows[0]);
  }

  // Resolve alert
  static async resolve(alertId) {
    const result = await query(
      `UPDATE alerts 
       SET resolved = true, resolved_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [alertId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return new Alert(result.rows[0]);
  }

  // Bulk acknowledge alerts
  static async bulkAcknowledge(alertIds, acknowledgedBy) {
    if (alertIds.length === 0) return [];

    const placeholders = alertIds.map((_, index) => `$${index + 2}`).join(',');
    const result = await query(
      `UPDATE alerts 
       SET acknowledged = true, acknowledged_by = $1, acknowledged_at = CURRENT_TIMESTAMP
       WHERE id IN (${placeholders})
       RETURNING *`,
      [acknowledgedBy, ...alertIds]
    );

    return result.rows.map(row => new Alert(row));
  }

  // Get alert statistics
  static async getStats(timeRange = '24 hours') {
    const result = await query(`
      SELECT 
        COUNT(*) as total_alerts,
        COUNT(CASE WHEN severity = 'critical' THEN 1 END) as critical_count,
        COUNT(CASE WHEN severity = 'high' THEN 1 END) as high_count,
        COUNT(CASE WHEN severity = 'medium' THEN 1 END) as medium_count,
        COUNT(CASE WHEN severity = 'low' THEN 1 END) as low_count,
        COUNT(CASE WHEN acknowledged = false THEN 1 END) as unacknowledged_count,
        COUNT(CASE WHEN resolved = false THEN 1 END) as unresolved_count,
        COUNT(CASE WHEN type = 'fall' THEN 1 END) as fall_alerts,
        COUNT(CASE WHEN type = 'heart_rate' THEN 1 END) as heart_rate_alerts,
        COUNT(CASE WHEN type = 'spo2' THEN 1 END) as spo2_alerts,
        COUNT(CASE WHEN type = 'temperature' THEN 1 END) as temperature_alerts,
        COUNT(CASE WHEN type = 'offline' THEN 1 END) as offline_alerts
      FROM alerts
      WHERE timestamp > NOW() - INTERVAL '${timeRange}'
    `);

    return result.rows[0];
  }

  // Get hourly alert counts
  static async getHourlyCounts(date) {
    const result = await query(`
      SELECT 
        EXTRACT(HOUR FROM timestamp) as hour,
        COUNT(*) as total_count,
        COUNT(CASE WHEN severity = 'critical' THEN 1 END) as critical_count
      FROM alerts
      WHERE DATE(timestamp) = $1
      GROUP BY EXTRACT(HOUR FROM timestamp)
      ORDER BY hour
    `, [date]);

    return result.rows;
  }

  // Get alert trends
  static async getTrends(days = 7) {
    const result = await query(`
      SELECT 
        DATE(timestamp) as date,
        COUNT(*) as total_alerts,
        COUNT(CASE WHEN severity = 'critical' THEN 1 END) as critical_alerts,
        COUNT(CASE WHEN type = 'fall' THEN 1 END) as fall_alerts,
        AVG(CASE WHEN acknowledged_at IS NOT NULL THEN 
          EXTRACT(EPOCH FROM (acknowledged_at - timestamp))/60 
        END) as avg_response_time_minutes
      FROM alerts
      WHERE timestamp > NOW() - INTERVAL '${days} days'
      GROUP BY DATE(timestamp)
      ORDER BY date DESC
    `);

    return result.rows;
  }

  // Create alert from vital reading
  static async createFromVital(vital, deviceUserId) {
    const alerts = [];
    
    if (vital.fall_detected) {
      alerts.push({
        device_id: vital.device_id,
        user_id: deviceUserId,
        type: 'fall',
        severity: 'critical',
        title: 'Fall Detected',
        message: 'Fall detected - immediate attention required',
        timestamp: vital.timestamp
      });
    }

    if (vital.heart_rate < 60) {
      alerts.push({
        device_id: vital.device_id,
        user_id: deviceUserId,
        type: 'heart_rate',
        severity: 'medium',
        title: 'Low Heart Rate',
        message: 'Low heart rate detected',
        value: vital.heart_rate,
        threshold: 60,
        timestamp: vital.timestamp
      });
    }

    if (vital.heart_rate > 100) {
      alerts.push({
        device_id: vital.device_id,
        user_id: deviceUserId,
        type: 'heart_rate',
        severity: 'high',
        title: 'High Heart Rate',
        message: 'High heart rate detected',
        value: vital.heart_rate,
        threshold: 100,
        timestamp: vital.timestamp
      });
    }

    if (vital.spo2 < 95) {
      alerts.push({
        device_id: vital.device_id,
        user_id: deviceUserId,
        type: 'spo2',
        severity: 'high',
        title: 'Low Oxygen Saturation',
        message: 'Low oxygen saturation detected',
        value: vital.spo2,
        threshold: 95,
        timestamp: vital.timestamp
      });
    }

    if (vital.temperature < 36.0) {
      alerts.push({
        device_id: vital.device_id,
        user_id: deviceUserId,
        type: 'temperature',
        severity: 'medium',
        title: 'Low Body Temperature',
        message: 'Low body temperature detected',
        value: vital.temperature,
        threshold: 36.0,
        timestamp: vital.timestamp
      });
    }

    if (vital.temperature > 37.5) {
      alerts.push({
        device_id: vital.device_id,
        user_id: deviceUserId,
        type: 'temperature',
        severity: 'medium',
        title: 'High Body Temperature',
        message: 'High body temperature detected',
        value: vital.temperature,
        threshold: 37.5,
        timestamp: vital.timestamp
      });
    }

    // Create all alerts
    const createdAlerts = [];
    for (const alertData of alerts) {
      const alert = await Alert.create(alertData);
      createdAlerts.push(alert);
    }

    return createdAlerts;
  }

  // Delete old alerts
  static async deleteOlderThan(days) {
    const result = await query(
      'DELETE FROM alerts WHERE created_at < NOW() - INTERVAL $1',
      [`${days} days`]
    );

    return result.rowCount;
  }

  // Get response time statistics
  static async getResponseTimeStats(timeRange = '7 days') {
    const result = await query(`
      SELECT 
        COUNT(*) as total_acknowledged,
        ROUND(AVG(EXTRACT(EPOCH FROM (acknowledged_at - timestamp))/60), 2) as avg_response_minutes,
        ROUND(MIN(EXTRACT(EPOCH FROM (acknowledged_at - timestamp))/60), 2) as min_response_minutes,
        ROUND(MAX(EXTRACT(EPOCH FROM (acknowledged_at - timestamp))/60), 2) as max_response_minutes,
        COUNT(CASE WHEN EXTRACT(EPOCH FROM (acknowledged_at - timestamp)) <= 300 THEN 1 END) as within_5_minutes,
        COUNT(CASE WHEN EXTRACT(EPOCH FROM (acknowledged_at - timestamp)) <= 900 THEN 1 END) as within_15_minutes
      FROM alerts
      WHERE acknowledged = true 
      AND acknowledged_at IS NOT NULL
      AND timestamp > NOW() - INTERVAL '${timeRange}'
    `);

    return result.rows[0];
  }

  // Get severity level
  getSeverityLevel() {
    const levels = { low: 1, medium: 2, high: 3, critical: 4 };
    return levels[this.severity] || 0;
  }

  // Check if alert needs immediate attention
  needsImmediateAttention() {
    return this.severity === 'critical' && !this.acknowledged;
  }

  // Get time since alert was created
  getTimeSinceCreated() {
    return moment().diff(moment(this.timestamp), 'minutes');
  }

  // Convert to JSON
  toJSON() {
    return {
      id: this.id,
      device_id: this.device_id,
      user_id: this.user_id,
      type: this.type,
      severity: this.severity,
      message: this.message,
      value: this.value,
      threshold: this.threshold,
      acknowledged: this.acknowledged,
      acknowledged_by: this.acknowledged_by,
      acknowledged_at: this.acknowledged_at,
      resolved: this.resolved,
      resolved_at: this.resolved_at,
      timestamp: this.timestamp,
      created_at: this.created_at,
      severity_level: this.getSeverityLevel(),
      needs_immediate_attention: this.needsImmediateAttention(),
      time_since_created: this.getTimeSinceCreated()
    };
  }
}

module.exports = Alert;