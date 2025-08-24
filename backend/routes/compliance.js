const express = require('express');
const Joi = require('joi');
const Compliance = require('../models/Compliance');
const { requireSupervisor, requireAuth } = require('../middleware/roleAuth');

const router = express.Router();

// Validation schemas
const complianceSchema = Joi.object({
  user_id: Joi.number().integer().positive().required(),
  device_id: Joi.number().integer().positive().optional(),
  type: Joi.string().valid('safety', 'environmental', 'health', 'equipment', 'training', 'documentation').required(),
  status: Joi.string().valid('compliant', 'non_compliant', 'pending_review', 'in_remediation', 'resolved').optional(),
  title: Joi.string().min(1).max(255).required(),
  description: Joi.string().min(1).required(),
  regulation_standard: Joi.string().max(100).optional(),
  threshold_value: Joi.number().optional(),
  measured_value: Joi.number().optional(),
  risk_level: Joi.string().valid('low', 'medium', 'high', 'critical').required(),
  location_lat: Joi.number().min(-90).max(90).optional(),
  location_lng: Joi.number().min(-180).max(180).optional(),
  corrective_action: Joi.string().optional(),
  remediation_deadline: Joi.date().iso().optional(),
  assigned_to: Joi.number().integer().positive().optional()
});

const updateComplianceSchema = Joi.object({
  status: Joi.string().valid('compliant', 'non_compliant', 'pending_review', 'in_remediation', 'resolved').optional(),
  corrective_action: Joi.string().optional(),
  remediation_deadline: Joi.date().iso().optional(),
  assigned_to: Joi.number().integer().positive().optional(),
  reviewed: Joi.boolean().optional(),
  approved: Joi.boolean().optional()
});

// @route   GET /api/compliance
// @desc    Get compliance records with filters
// @access  Private (Supervisors see all, employees see only theirs)
router.get('/', requireAuth, async (req, res) => {
  try {
    const {
      type,
      status,
      risk_level,
      reviewed,
      approved,
      assigned_to,
      department,
      date_from,
      date_to,
      limit = 50,
      offset = 0
    } = req.query;

    const filters = {
      limit: Math.min(parseInt(limit), 100), // Cap at 100
      offset: parseInt(offset) || 0
    };

    // Role-based filtering
    if (req.user.role === 'employee') {
      // Employees can only see their own compliance records
      filters.user_id = req.user.id;
    } else if (req.user.role === 'supervisor') {
      // Supervisors can see all records, with optional filters
      if (type) filters.type = type;
      if (status) filters.status = status;
      if (risk_level) filters.risk_level = risk_level;
      if (reviewed !== undefined) filters.reviewed = reviewed === 'true';
      if (approved !== undefined) filters.approved = approved === 'true';
      if (assigned_to) filters.assigned_to = parseInt(assigned_to);
      if (department) filters.department = department;
      if (date_from) filters.dateFrom = new Date(date_from);
      if (date_to) filters.dateTo = new Date(date_to);
    }

    const records = await Compliance.findAll(filters);

    res.json({
      success: true,
      compliance: records,
      total: records.length,
      filters: filters
    });

  } catch (error) {
    console.error('Error fetching compliance records:', error);
    res.status(500).json({
      error: 'Failed to fetch compliance records',
      message: error.message
    });
  }
});

// @route   GET /api/compliance/unreviewed
// @desc    Get unreviewed compliance records
// @access  Private (Supervisors only)
router.get('/unreviewed', requireSupervisor, async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const records = await Compliance.getUnreviewed(parseInt(limit));

    res.json({
      success: true,
      compliance: records,
      total: records.length
    });

  } catch (error) {
    console.error('Error fetching unreviewed compliance records:', error);
    res.status(500).json({
      error: 'Failed to fetch unreviewed compliance records',
      message: error.message
    });
  }
});

// @route   GET /api/compliance/high-risk
// @desc    Get high-risk compliance records
// @access  Private (Supervisors only)
router.get('/high-risk', requireSupervisor, async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const records = await Compliance.getHighRisk(parseInt(limit));

    res.json({
      success: true,
      compliance: records,
      total: records.length
    });

  } catch (error) {
    console.error('Error fetching high-risk compliance records:', error);
    res.status(500).json({
      error: 'Failed to fetch high-risk compliance records',
      message: error.message
    });
  }
});

// @route   GET /api/compliance/stats
// @desc    Get compliance statistics
// @access  Private (Supervisors only)
router.get('/stats', requireSupervisor, async (req, res) => {
  try {
    const { date_from, date_to } = req.query;
    
    const filters = {};
    if (date_from) filters.dateFrom = new Date(date_from);
    if (date_to) filters.dateTo = new Date(date_to);

    const stats = await Compliance.getStats(filters);

    // Calculate compliance rate
    const totalRecords = parseInt(stats.total_records);
    const compliantRecords = parseInt(stats.compliant_count) + parseInt(stats.resolved_count);
    const complianceRate = totalRecords > 0 ? Math.round((compliantRecords / totalRecords) * 100) : 0;

    res.json({
      success: true,
      stats: {
        ...stats,
        compliance_rate: complianceRate,
        total_compliant: compliantRecords
      }
    });

  } catch (error) {
    console.error('Error fetching compliance stats:', error);
    res.status(500).json({
      error: 'Failed to fetch compliance statistics',
      message: error.message
    });
  }
});

// @route   GET /api/compliance/trends
// @desc    Get compliance trends over time
// @access  Private (Supervisors only)
router.get('/trends', requireSupervisor, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const trends = await Compliance.getTrends(parseInt(days));

    res.json({
      success: true,
      trends: trends
    });

  } catch (error) {
    console.error('Error fetching compliance trends:', error);
    res.status(500).json({
      error: 'Failed to fetch compliance trends',
      message: error.message
    });
  }
});

// @route   GET /api/compliance/:id
// @desc    Get specific compliance record
// @access  Private
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const record = await Compliance.findById(parseInt(id));

    if (!record) {
      return res.status(404).json({
        error: 'Compliance record not found'
      });
    }

    // Check permissions
    if (req.user.role === 'employee' && record.user_id !== req.user.id) {
      return res.status(403).json({
        error: 'Access denied. You can only view your own compliance records'
      });
    }

    res.json({
      success: true,
      compliance: record
    });

  } catch (error) {
    console.error('Error fetching compliance record:', error);
    res.status(500).json({
      error: 'Failed to fetch compliance record',
      message: error.message
    });
  }
});

// @route   POST /api/compliance
// @desc    Create new compliance record
// @access  Private (Supervisors only)
router.post('/', requireSupervisor, async (req, res) => {
  try {
    // Validate request body
    const { error, value } = complianceSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.details.map(detail => detail.message)
      });
    }

    const record = await Compliance.create(value);

    res.status(201).json({
      success: true,
      message: 'Compliance record created successfully',
      compliance: record
    });

  } catch (error) {
    console.error('Error creating compliance record:', error);
    res.status(500).json({
      error: 'Failed to create compliance record',
      message: error.message
    });
  }
});

// @route   PUT /api/compliance/:id
// @desc    Update compliance record
// @access  Private (Supervisors only)
router.put('/:id', requireSupervisor, async (req, res) => {
  try {
    const { id } = req.params;

    // Validate request body
    const { error, value } = updateComplianceSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.details.map(detail => detail.message)
      });
    }

    // Add reviewer/approver info if needed
    if (value.reviewed === true) {
      value.reviewed_by = req.user.id;
    }
    if (value.approved === true) {
      value.approved_by = req.user.id;
    }

    const record = await Compliance.update(parseInt(id), value);

    if (!record) {
      return res.status(404).json({
        error: 'Compliance record not found'
      });
    }

    res.json({
      success: true,
      message: 'Compliance record updated successfully',
      compliance: record
    });

  } catch (error) {
    console.error('Error updating compliance record:', error);
    res.status(500).json({
      error: 'Failed to update compliance record',
      message: error.message
    });
  }
});

// @route   POST /api/compliance/:id/review
// @desc    Review compliance record
// @access  Private (Supervisors only)
router.post('/:id/review', requireSupervisor, async (req, res) => {
  try {
    const { id } = req.params;
    const { approved, corrective_action, remediation_deadline } = req.body;

    const updateData = {
      reviewed: true,
      reviewed_by: req.user.id,
      approved: approved || false
    };

    if (approved) {
      updateData.approved_by = req.user.id;
    }

    if (corrective_action) {
      updateData.corrective_action = corrective_action;
    }

    if (remediation_deadline) {
      updateData.remediation_deadline = new Date(remediation_deadline);
    }

    const record = await Compliance.update(parseInt(id), updateData);

    if (!record) {
      return res.status(404).json({
        error: 'Compliance record not found'
      });
    }

    res.json({
      success: true,
      message: `Compliance record ${approved ? 'approved' : 'reviewed'} successfully`,
      compliance: record
    });

  } catch (error) {
    console.error('Error reviewing compliance record:', error);
    res.status(500).json({
      error: 'Failed to review compliance record',
      message: error.message
    });
  }
});

// @route   POST /api/compliance/:id/assign
// @desc    Assign compliance record to user
// @access  Private (Supervisors only)
router.post('/:id/assign', requireSupervisor, async (req, res) => {
  try {
    const { id } = req.params;
    const { assigned_to } = req.body;

    if (!assigned_to) {
      return res.status(400).json({
        error: 'assigned_to is required'
      });
    }

    const record = await Compliance.update(parseInt(id), {
      assigned_to: parseInt(assigned_to)
    });

    if (!record) {
      return res.status(404).json({
        error: 'Compliance record not found'
      });
    }

    res.json({
      success: true,
      message: 'Compliance record assigned successfully',
      compliance: record
    });

  } catch (error) {
    console.error('Error assigning compliance record:', error);
    res.status(500).json({
      error: 'Failed to assign compliance record',
      message: error.message
    });
  }
});

// @route   DELETE /api/compliance/:id
// @desc    Delete compliance record
// @access  Private (Supervisors only)
router.delete('/:id', requireSupervisor, async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Compliance.delete(parseInt(id));

    if (!deleted) {
      return res.status(404).json({
        error: 'Compliance record not found'
      });
    }

    res.json({
      success: true,
      message: 'Compliance record deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting compliance record:', error);
    res.status(500).json({
      error: 'Failed to delete compliance record',
      message: error.message
    });
  }
});

module.exports = router;