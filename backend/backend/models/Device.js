const { query, transaction } = require('../config/db');

class Device {
  constructor(deviceData) {
    this.id = deviceData.id;
    this.user_id = deviceData.user_id;
    this.device_serial = deviceData.device_serial;
    this.device_model = deviceData.device_model;
    this.firmware_version = deviceData.firmware_version;
    this.battery_level = deviceData.battery_level;
    this.last_seen = deviceData.last_seen;
    this.is_active = deviceData.is_active;
    this.registration_date = deviceData.registration_date;
    this.last_maintenance = deviceData.last_maintenance;
    this.created_at = deviceData.created_at;
    this.updated_at = deviceData.updated_at;
  }

  // Create a new device
  static async create(deviceData) {
    const {
      user_id,
      device_serial,
      device_model,
      firmware_version,
      battery_level = 100
    } = deviceData;

    const result = await query(
      `INSERT INTO devices (user_id, device_serial, device_model, firmware_version, battery_level, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING *`,
      [user_id, device_serial, device_model, firmware_version, battery_level]
    );

    return new Device(result.rows[0]);
  }

  // Find device by ID
  static async findById(id) {
    const result = await query('SELECT * FROM devices WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return new Device(result.rows[0]);
  }

  // Find device by serial number
  static async findBySerial(serial) {
    const result = await query('SELECT * FROM devices WHERE device_serial = $1', [serial]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return new Device(result.rows[0]);
  }

  // Update device last seen
  static async updateLastSeen(deviceId) {
    const result = await query(
      'UPDATE devices SET last_seen = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *',
      [deviceId]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return new Device(result.rows[0]);
  }

  // Update battery level
  static async updateBattery(deviceId, batteryLevel) {
    const result = await query(
      'UPDATE devices SET battery_level = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *',
      [deviceId, batteryLevel]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return new Device(result.rows[0]);
  }

  // Get all devices
  static async findAll() {
    const result = await query(`
      SELECT d.*, u.name as user_name, u.email as user_email
      FROM devices d
      LEFT JOIN users u ON d.user_id = u.id
      ORDER BY d.created_at DESC
    `);
    
    return result.rows.map(row => ({
      ...new Device(row),
      user_name: row.user_name,
      user_email: row.user_email
    }));
  }

  // Convert to JSON
  toJSON() {
    return {
      id: this.id,
      user_id: this.user_id,
      device_serial: this.device_serial,
      device_model: this.device_model,
      firmware_version: this.firmware_version,
      battery_level: this.battery_level,
      last_seen: this.last_seen,
      is_active: this.is_active,
      registration_date: this.registration_date,
      last_maintenance: this.last_maintenance,
      created_at: this.created_at,
      updated_at: this.updated_at
    };
  }
}

module.exports = Device;