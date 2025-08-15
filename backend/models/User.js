const bcrypt = require('bcryptjs');
const { query, transaction } = require('../config/db');

class User {
  constructor(userData) {
    this.id = userData.id;
    this.name = userData.name;
    this.email = userData.email;
    this.role = userData.role;
    this.department = userData.department;
    this.created_at = userData.created_at;
    this.updated_at = userData.updated_at;
  }

  // Create a new user
  static async create(userData) {
    const { name, email, password, role, department = null } = userData;
    
    // Hash password
    const saltRounds = 12;
    const password_hash = await bcrypt.hash(password, saltRounds);
    
    const result = await query(
      `INSERT INTO users (name, email, password_hash, role, department, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING id, name, email, role, department, created_at, updated_at`,
      [name, email, password_hash, role, department]
    );
    
    return new User(result.rows[0]);
  }

  // Find user by ID
  static async findById(id) {
    const result = await query(
      'SELECT id, name, email, role, department, created_at, updated_at FROM users WHERE id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return new User(result.rows[0]);
  }

  // Find user by email
  static async findByEmail(email) {
    const result = await query(
      'SELECT id, name, email, password_hash, role, department, created_at, updated_at FROM users WHERE email = $1',
      [email]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return result.rows[0];
  }

  // Get all users (for supervisors)
  static async findAll(filters = {}) {
    let queryText = `
      SELECT u.id, u.name, u.email, u.role, u.department, u.created_at, u.updated_at,
             d.device_serial, d.last_seen, d.is_active, d.battery_level
      FROM users u
      LEFT JOIN devices d ON u.id = d.user_id
      WHERE 1=1
    `;
    const queryParams = [];
    let paramCount = 0;

    if (filters.role) {
      paramCount++;
      queryText += ` AND u.role = $${paramCount}`;
      queryParams.push(filters.role);
    }

    if (filters.department) {
      paramCount++;
      queryText += ` AND u.department = $${paramCount}`;
      queryParams.push(filters.department);
    }

    if (filters.active !== undefined) {
      paramCount++;
      queryText += ` AND d.is_active = $${paramCount}`;
      queryParams.push(filters.active);
    }

    queryText += ' ORDER BY u.name ASC';

    const result = await query(queryText, queryParams);
    
    return result.rows.map(row => ({
      ...new User(row),
      device: row.device_serial ? {
        serial: row.device_serial,
        last_seen: row.last_seen,
        is_active: row.is_active,
        battery_level: row.battery_level
      } : null
    }));
  }

  // Get users by role
  static async findByRole(role) {
    const result = await query(
      'SELECT id, name, email, role, department, created_at, updated_at FROM users WHERE role = $1 ORDER BY name ASC',
      [role]
    );
    
    return result.rows.map(row => new User(row));
  }

  // Update user
  static async update(id, userData) {
    const { name, email, role, department } = userData;
    
    const result = await query(
      `UPDATE users 
       SET name = $2, email = $3, role = $4, department = $5, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id, name, email, role, department, created_at, updated_at`,
      [id, name, email, role, department]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return new User(result.rows[0]);
  }

  // Update password
  static async updatePassword(id, newPassword) {
    const saltRounds = 12;
    const password_hash = await bcrypt.hash(newPassword, saltRounds);
    
    const result = await query(
      'UPDATE users SET password_hash = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [id, password_hash]
    );
    
    return result.rowCount > 0;
  }

  // Verify password
  static async verifyPassword(email, password) {
    const user = await User.findByEmail(email);
    if (!user) {
      return null;
    }
    
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return null;
    }
    
    return new User(user);
  }

  // Delete user
  static async delete(id) {
    return await transaction(async (client) => {
      // Delete related records first (cascade should handle this, but being explicit)
      await client.query('DELETE FROM attendance WHERE user_id = $1', [id]);
      await client.query('DELETE FROM alerts WHERE user_id = $1', [id]);
      await client.query('DELETE FROM devices WHERE user_id = $1', [id]);
      
      // Delete user
      const result = await client.query('DELETE FROM users WHERE id = $1', [id]);
      return result.rowCount > 0;
    });
  }

  // Check if email exists
  static async emailExists(email, excludeId = null) {
    let queryText = 'SELECT COUNT(*) FROM users WHERE email = $1';
    const params = [email];
    
    if (excludeId) {
      queryText += ' AND id != $2';
      params.push(excludeId);
    }
    
    const result = await query(queryText, params);
    return parseInt(result.rows[0].count) > 0;
  }

  // Get user statistics
  static async getStats() {
    const result = await query(`
      SELECT 
        COUNT(*) as total_users,
        COUNT(CASE WHEN role = 'employee' THEN 1 END) as employees,
        COUNT(CASE WHEN role = 'supervisor' THEN 1 END) as supervisors,
        COUNT(CASE WHEN d.is_active = true THEN 1 END) as active_devices,
        COUNT(CASE WHEN d.last_seen > NOW() - INTERVAL '1 hour' THEN 1 END) as online_users
      FROM users u
      LEFT JOIN devices d ON u.id = d.user_id
    `);
    
    return result.rows[0];
  }

  // Get user with device info
  static async findWithDevice(userId, deviceSerial = null) {
    let queryText, params;
    
    if (deviceSerial) {
      // Find user by device serial
      queryText = `
        SELECT u.id, u.name, u.email, u.role, u.department, u.created_at, u.updated_at,
               d.id as device_id, d.device_serial, d.last_seen, d.is_active, d.battery_level
        FROM users u
        JOIN devices d ON u.id = d.user_id
        WHERE d.device_serial = $1
      `;
      params = [deviceSerial];
    } else {
      // Find user by ID with device info
      queryText = `
        SELECT u.id, u.name, u.email, u.role, u.department, u.created_at, u.updated_at,
               d.id as device_id, d.device_serial, d.last_seen, d.is_active, d.battery_level
        FROM users u
        LEFT JOIN devices d ON u.id = d.user_id
        WHERE u.id = $1
      `;
      params = [userId];
    }
    
    const result = await query(queryText, params);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const row = result.rows[0];
    return {
      ...new User(row),
      device: row.device_id ? {
        id: row.device_id,
        serial: row.device_serial,
        last_seen: row.last_seen,
        is_active: row.is_active,
        battery_level: row.battery_level
      } : null
    };
  }

  // Search users
  static async search(searchTerm, role = null) {
    let queryText = `
      SELECT id, name, email, role, department, created_at, updated_at
      FROM users 
      WHERE (name ILIKE $1 OR email ILIKE $1)
    `;
    const params = [`%${searchTerm}%`];
    
    if (role) {
      queryText += ' AND role = $2';
      params.push(role);
    }
    
    queryText += ' ORDER BY name ASC LIMIT 50';
    
    const result = await query(queryText, params);
    return result.rows.map(row => new User(row));
  }

  // Convert to JSON (exclude sensitive data)
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      email: this.email,
      role: this.role,
      department: this.department,
      created_at: this.created_at,
      updated_at: this.updated_at
    };
  }
}

module.exports = User;