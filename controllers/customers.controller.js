const express = require('express');
const { Customer } = require('../models');
const auth = require('../middleware/auth');
const { allowRoles, ROLES } = require('../middleware/roles');

const router = express.Router();

// Create customer (admin, branch_manager, cashier)
router.post('/', auth, allowRoles(ROLES.ADMIN, ROLES.BRANCH_MANAGER, ROLES.CASHIER), async (req, res) => {
  try {
    const { name, phone } = req.body || {};

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'name is required' });
    }
    if (!phone || !phone.trim()) {
      return res.status(400).json({ message: 'phone is required' });
    }

    const existing = await Customer.findOne({ where: { phone: phone.trim() } });
    if (existing) {
      return res.status(409).json({ message: 'A customer with this phone already exists' });
    }

    const customer = await Customer.create({
      name: name.trim(),
      phone: phone.trim()
    });

    return res.status(201).json({
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        loyaltyPoints: customer.loyaltyPoints,
        createdAt: customer.createdAt,
        updatedAt: customer.updatedAt
      },
      message: 'Customer created successfully'
    });
  } catch (err) {
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// List customers (admin, branch_manager, cashier)
router.get('/', auth, allowRoles(ROLES.ADMIN, ROLES.BRANCH_MANAGER, ROLES.CASHIER), async (_req, res) => {
  try {
    const customers = await Customer.findAll({ order: [['createdAt', 'DESC']] });
    return res.json({
      customers: customers.map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        loyaltyPoints: c.loyaltyPoints,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt
      }))
    });
  } catch (_err) {
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// Get customer by ID (admin, branch_manager, cashier)
router.get('/:id', auth, allowRoles(ROLES.ADMIN, ROLES.BRANCH_MANAGER, ROLES.CASHIER), async (req, res) => {
  try {
    const { id } = req.params;
    const customer = await Customer.findByPk(id);
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }
    return res.json({
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        loyaltyPoints: customer.loyaltyPoints,
        createdAt: customer.createdAt,
        updatedAt: customer.updatedAt
      }
    });
  } catch (_err) {
    return res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;


