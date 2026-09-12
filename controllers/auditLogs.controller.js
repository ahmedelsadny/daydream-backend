const express = require('express');
const { AuditLog, User, Branch } = require('../models');
const auth = require('../middleware/auth');
const { allowRoles, ROLES } = require('../middleware/roles');
const { Op } = require('sequelize');

const router = express.Router();

// All audit log endpoints are restricted to Admin
router.use(auth, allowRoles(ROLES.ADMIN));

// List audit logs with comprehensive filtering and pagination
router.get('/', async (req, res) => {
  try {
    const {
      action,
      entityType,
      entityId,
      userId,
      branchId,
      startDate,
      endDate,
      page = 1,
      limit = 50
    } = req.query;

    const whereClause = {};

    if (action) {
      whereClause.action = action;
    }

    if (entityType) {
      whereClause.entityType = entityType;
    }

    if (entityId) {
      whereClause.entityId = entityId;
    }

    if (userId) {
      whereClause.userId = userId;
    }

    if (branchId) {
      whereClause.branchId = branchId;
    }

    if (startDate || endDate) {
      whereClause.createdAt = {};
      if (startDate) {
        whereClause.createdAt[Op.gte] = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        whereClause.createdAt[Op.lte] = end;
      }
    }

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, parseInt(limit) || 50);
    const offset = (pageNum - 1) * limitNum;

    const { count, rows: logs } = await AuditLog.findAndCountAll({
      where: whereClause,
      include: [
        { model: User, as: 'user', attributes: ['id', 'name', 'email', 'role'] },
        { model: User, as: 'supervisor', attributes: ['id', 'name', 'email', 'role'] },
        { model: Branch, attributes: ['id', 'name'] }
      ],
      order: [['createdAt', 'DESC']],
      limit: limitNum,
      offset: offset
    });

    return res.json({
      count,
      page: pageNum,
      totalPages: Math.ceil(count / limitNum),
      logs
    });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// List distinct action types for filter dropdowns
router.get('/actions', async (req, res) => {
  try {
    const actions = await AuditLog.findAll({
      attributes: [[AuditLog.sequelize.fn('DISTINCT', AuditLog.sequelize.col('action')), 'action']],
      raw: true
    });

    return res.json({
      actions: actions.map(a => a.action).filter(Boolean)
    });
  } catch (error) {
    console.error('Error fetching audit actions:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// Get a single audit log entry by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const log = await AuditLog.findByPk(id, {
      include: [
        { model: User, as: 'user', attributes: ['id', 'name', 'email', 'role'] },
        { model: User, as: 'supervisor', attributes: ['id', 'name', 'email', 'role'] },
        { model: Branch, attributes: ['id', 'name'] }
      ]
    });

    if (!log) {
      return res.status(404).json({ message: 'Audit log entry not found' });
    }

    return res.json({ log });
  } catch (error) {
    console.error('Error fetching audit log detail:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
