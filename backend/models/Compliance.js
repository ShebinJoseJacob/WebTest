const { query, transaction } = require('../config/db');

class Compliance {
  constructor(complianceData) {
    this.id = complianceData.id;
    this.user_id = complianceData.user_id;
    this.device_id = complianceData.device_id;
    this.type = complianceData.type;
    this.status = complianceData.status;
    this.title = complianceData.title;
    this.description = complianceData.description;
    this.regulation_standard = complianceData.regulation_standard;
    this.threshold_value = complianceData.threshold_value;
    this.measured_value = complianceData.measured_value;
    this.deviation_percentage = complianceData.deviation_percentage;
    this.risk_level = complianceData.risk_level;
    this.location_lat = complianceData.location_lat;
    this.location_lng = complianceData.location_lng;
    this.corrective_action = complianceData.corrective_action;
    this.remediation_deadline = complianceData.remediation_deadline;
    this.assigned_to = complianceData.assigned_to;
    this.reviewed = complianceData.reviewed;
    this.reviewed_by = complianceData.reviewed_by;
    this.reviewed_at = complianceData.reviewed_at;
    this.approved = complianceData.approved;
    this.approved_by = complianceData.approved_by;
    this.approved_at = complianceData.approved_at;
    this.timestamp = complianceData.timestamp;
    this.created_at = complianceData.created_at;
    this.updated_at = complianceData.updated_at;
  }

  // Create a new compliance record
  static async create(complianceData) {
    const {
      user_id,
      device_id,
      type,
      status,
      title,
      description,
      regulation_standard,
      threshold_value,
      measured_value,
      risk_level,
      location_lat = null,
      location_lng = null,
      corrective_action = null,
      remediation_deadline = null,
      assigned_to = null
    } = complianceData;

    // Calculate deviation percentage if both values are provided
    let deviation_percentage = null;
    if (threshold_value && measured_value) {
      deviation_percentage = Math.abs((measured_value - threshold_value) / threshold_value) * 100;
    }

    const result = await query(
      `INSERT INTO compliance_records (
        user_id, device_id, type, status, title, description, 
        regulation_standard, threshold_value, measured_value, 
        deviation_percentage, risk_level, location_lat, location_lng,
        corrective_action, remediation_deadline, assigned_to,
        timestamp, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING *`,
      [
        user_id, device_id, type, status, title, description,
        regulation_standard, threshold_value, measured_value,
        deviation_percentage, risk_level, location_lat, location_lng,
        corrective_action, remediation_deadline, assigned_to
      ]
    );

    return new Compliance(result.rows[0]);
  }

  // Find compliance record by ID
  static async findById(id) {
    const result = await query(
      'SELECT * FROM compliance_records WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return new Compliance(result.rows[0]);
  }

  // Get compliance records with filters
  static async findAll(filters = {}) {
    let queryText = `
      SELECT c.*, u.name as user_name, u.department,
             d.device_serial, d.device_model,
             assigned_user.name as assigned_to_name,
             reviewer.name as reviewed_by_name,
             approver.name as approved_by_name
      FROM compliance_records c
      LEFT JOIN users u ON c.user_id = u.id
      LEFT JOIN devices d ON c.device_id = d.id
      LEFT JOIN users assigned_user ON c.assigned_to = assigned_user.id
      LEFT JOIN users reviewer ON c.reviewed_by = reviewer.id
      LEFT JOIN users approver ON c.approved_by = approver.id
      WHERE 1=1
    `;
    const queryParams = [];
    let paramCount = 0;

    if (filters.user_id) {
      paramCount++;
      queryText += ` AND c.user_id = $${paramCount}`;
      queryParams.push(filters.user_id);
    }

    if (filters.type) {
      paramCount++;
      queryText += ` AND c.type = $${paramCount}`;
      queryParams.push(filters.type);
    }

    if (filters.status) {
      paramCount++;
      queryText += ` AND c.status = $${paramCount}`;
      queryParams.push(filters.status);
    }

    if (filters.risk_level) {
      paramCount++;
      queryText += ` AND c.risk_level = $${paramCount}`;
      queryParams.push(filters.risk_level);
    }

    if (filters.reviewed !== undefined) {
      paramCount++;
      queryText += ` AND c.reviewed = $${paramCount}`;
      queryParams.push(filters.reviewed);
    }

    if (filters.approved !== undefined) {
      paramCount++;
      queryText += ` AND c.approved = $${paramCount}`;
      queryParams.push(filters.approved);
    }

    if (filters.assigned_to) {
      paramCount++;
      queryText += ` AND c.assigned_to = $${paramCount}`;
      queryParams.push(filters.assigned_to);
    }

    if (filters.department) {
      paramCount++;
      queryText += ` AND u.department = $${paramCount}`;
      queryParams.push(filters.department);
    }

    if (filters.dateFrom) {
      paramCount++;
      queryText += ` AND c.timestamp >= $${paramCount}`;
      queryParams.push(filters.dateFrom);
    }

    if (filters.dateTo) {
      paramCount++;
      queryText += ` AND c.timestamp <= $${paramCount}`;
      queryParams.push(filters.dateTo);
    }

    const limit = filters.limit || 50;
    const offset = filters.offset || 0;

    queryText += ` ORDER BY c.timestamp DESC LIMIT ${limit} OFFSET ${offset}`;

    const result = await query(queryText, queryParams);

    return result.rows.map(row => ({
      ...new Compliance(row),
      user_name: row.user_name,
      department: row.department,
      device_serial: row.device_serial,
      device_model: row.device_model,
      assigned_to_name: row.assigned_to_name,
      reviewed_by_name: row.reviewed_by_name,
      approved_by_name: row.approved_by_name
    }));
  }

  // Get recent unreviewed compliance records
  static async getUnreviewed(limit = 20) {
    const result = await query(
      `SELECT c.*, u.name as user_name, u.department,
              d.device_serial, d.device_model,
              assigned_user.name as assigned_to_name
       FROM compliance_records c
       LEFT JOIN users u ON c.user_id = u.id
       LEFT JOIN devices d ON c.device_id = d.id
       LEFT JOIN users assigned_user ON c.assigned_to = assigned_user.id
       WHERE c.reviewed = false
       ORDER BY c.timestamp DESC
       LIMIT $1`,
      [limit]
    );

    return result.rows.map(row => ({
      ...new Compliance(row),
      user_name: row.user_name,
      department: row.department,
      device_serial: row.device_serial,
      device_model: row.device_model,
      assigned_to_name: row.assigned_to_name
    }));
  }

  // Get high-risk compliance records
  static async getHighRisk(limit = 20) {
    const result = await query(
      `SELECT c.*, u.name as user_name, u.department,
              d.device_serial, d.device_model,
              assigned_user.name as assigned_to_name
       FROM compliance_records c
       LEFT JOIN users u ON c.user_id = u.id
       LEFT JOIN devices d ON c.device_id = d.id
       LEFT JOIN users assigned_user ON c.assigned_to = assigned_user.id
       WHERE c.risk_level IN ('high', 'critical')
       AND c.status != 'resolved'
       ORDER BY 
         CASE c.risk_level 
           WHEN 'critical' THEN 1 
           WHEN 'high' THEN 2 
           ELSE 3 
         END,
         c.timestamp DESC
       LIMIT $1`,
      [limit]
    );

    return result.rows.map(row => ({
      ...new Compliance(row),
      user_name: row.user_name,
      department: row.department,
      device_serial: row.device_serial,
      device_model: row.device_model,
      assigned_to_name: row.assigned_to_name
    }));
  }

  // Update compliance record
  static async update(id, updateData) {
    const {
      status,
      corrective_action,
      remediation_deadline,
      assigned_to,
      reviewed,
      reviewed_by,
      approved,
      approved_by
    } = updateData;

    const result = await query(
      `UPDATE compliance_records 
       SET status = COALESCE($2, status),
           corrective_action = COALESCE($3, corrective_action),
           remediation_deadline = COALESCE($4, remediation_deadline),
           assigned_to = COALESCE($5, assigned_to),
           reviewed = COALESCE($6, reviewed),
           reviewed_by = CASE WHEN $6 = true THEN $7 ELSE reviewed_by END,
           reviewed_at = CASE WHEN $6 = true THEN CURRENT_TIMESTAMP ELSE reviewed_at END,
           approved = COALESCE($8, approved),
           approved_by = CASE WHEN $8 = true THEN $9 ELSE approved_by END,
           approved_at = CASE WHEN $8 = true THEN CURRENT_TIMESTAMP ELSE approved_at END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [
        id, status, corrective_action, remediation_deadline, assigned_to,
        reviewed, reviewed_by, approved, approved_by
      ]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return new Compliance(result.rows[0]);
  }

  // Get compliance statistics
  static async getStats(filters = {}) {
    let whereClause = 'WHERE 1=1';
    const queryParams = [];
    let paramCount = 0;

    if (filters.dateFrom) {
      paramCount++;
      whereClause += ` AND timestamp >= $${paramCount}`;
      queryParams.push(filters.dateFrom);
    }

    if (filters.dateTo) {
      paramCount++;
      whereClause += ` AND timestamp <= $${paramCount}`;
      queryParams.push(filters.dateTo);
    }

    const result = await query(`
      SELECT 
        COUNT(*) as total_records,
        COUNT(CASE WHEN status = 'non_compliant' THEN 1 END) as non_compliant_count,
        COUNT(CASE WHEN status = 'compliant' THEN 1 END) as compliant_count,
        COUNT(CASE WHEN status = 'pending_review' THEN 1 END) as pending_review_count,
        COUNT(CASE WHEN status = 'resolved' THEN 1 END) as resolved_count,
        COUNT(CASE WHEN risk_level = 'critical' THEN 1 END) as critical_risk_count,
        COUNT(CASE WHEN risk_level = 'high' THEN 1 END) as high_risk_count,
        COUNT(CASE WHEN risk_level = 'medium' THEN 1 END) as medium_risk_count,
        COUNT(CASE WHEN risk_level = 'low' THEN 1 END) as low_risk_count,
        COUNT(CASE WHEN reviewed = false THEN 1 END) as unreviewed_count,
        COUNT(CASE WHEN approved = false AND reviewed = true THEN 1 END) as pending_approval_count,
        ROUND(AVG(deviation_percentage), 2) as avg_deviation_percentage
      FROM compliance_records
      ${whereClause}
    `, queryParams);

    return result.rows[0];
  }

  // Delete compliance record
  static async delete(id) {
    const result = await query(
      'DELETE FROM compliance_records WHERE id = $1',
      [id]
    );

    return result.rowCount > 0;
  }

  // Get compliance trends
  static async getTrends(days = 30) {
    const result = await query(`
      SELECT 
        DATE_TRUNC('day', timestamp) as date,
        COUNT(*) as total_count,
        COUNT(CASE WHEN status = 'non_compliant' THEN 1 END) as non_compliant_count,
        COUNT(CASE WHEN risk_level IN ('critical', 'high') THEN 1 END) as high_risk_count,
        AVG(deviation_percentage) as avg_deviation
      FROM compliance_records
      WHERE timestamp >= CURRENT_TIMESTAMP - INTERVAL '${days} days'
      GROUP BY DATE_TRUNC('day', timestamp)
      ORDER BY date DESC
    `);

    return result.rows;
  }

  // Convert to JSON (exclude sensitive data if needed)
  toJSON() {
    return {
      id: this.id,
      user_id: this.user_id,
      device_id: this.device_id,
      type: this.type,
      status: this.status,
      title: this.title,
      description: this.description,
      regulation_standard: this.regulation_standard,
      threshold_value: this.threshold_value,
      measured_value: this.measured_value,
      deviation_percentage: this.deviation_percentage,
      risk_level: this.risk_level,
      location_lat: this.location_lat,
      location_lng: this.location_lng,
      corrective_action: this.corrective_action,
      remediation_deadline: this.remediation_deadline,
      assigned_to: this.assigned_to,
      reviewed: this.reviewed,
      reviewed_by: this.reviewed_by,
      reviewed_at: this.reviewed_at,
      approved: this.approved,
      approved_by: this.approved_by,
      approved_at: this.approved_at,
      timestamp: this.timestamp,
      created_at: this.created_at,
      updated_at: this.updated_at
    };
  }
}

module.exports = Compliance;