const express = require('express');
const { Warehouse } = require('../models');
const auth = require('../middleware/auth');
const { allowRoles, ROLES } = require('../middleware/roles');

const router = express.Router();

// Create warehouse (admin only)
router.post('/', auth, allowRoles(ROLES.ADMIN), async (req, res) => {
  const { name, location, type } = req.body || {};
  
  // Validate required fields
  if (!name || !name.trim()) {
    return res.status(400).json({ message: 'name is required' });
  }
  if (!location || !location.trim()) {
    return res.status(400).json({ message: 'location is required' });
  }
  if (!type || !['central', 'stock'].includes(type)) {
    return res.status(400).json({ message: 'type is required and must be either "central" or "stock"' });
  }

  // Optional: enforce unique name at app layer
  const exists = await Warehouse.findOne({ where: { name } });
  if (exists) {
    return res.status(409).json({ message: 'Warehouse name already exists' });
  }

  const warehouse = await Warehouse.create({ name, location, type });
  return res.status(201).json({
    warehouse: {
      id: warehouse.id,
      name: warehouse.name,
      location: warehouse.location,
      type: warehouse.type,
      createdAt: warehouse.createdAt,
      updatedAt: warehouse.updatedAt
    }
  });
});

// List warehouses (admin, stock_keeper)
router.get('/', auth, allowRoles(ROLES.ADMIN, ROLES.STOCK_KEEPER), async (_req, res) => {
  const warehouses = await Warehouse.findAll({ order: [['created_at', 'DESC']] });
  return res.json({
    warehouses: warehouses.map((w) => ({
      id: w.id,
      name: w.name,
      location: w.location,
      type: w.type,
      createdAt: w.createdAt,
      updatedAt: w.updatedAt
    }))
  });
});

// Get warehouse by ID (admin, stock_keeper)
router.get('/:id', auth, allowRoles(ROLES.ADMIN, ROLES.STOCK_KEEPER), async (req, res) => {
  const { id } = req.params;
  const warehouse = await Warehouse.findByPk(id);
  if (!warehouse) {
    return res.status(404).json({ message: 'Warehouse not found' });
  }
  return res.json({
    warehouse: {
      id: warehouse.id,
      name: warehouse.name,
      location: warehouse.location,
      type: warehouse.type,
      createdAt: warehouse.createdAt,
      updatedAt: warehouse.updatedAt
    }
  });
});

// Update warehouse (admin only)
router.put('/:id', auth, allowRoles(ROLES.ADMIN), async (req, res) => {
  const { id } = req.params;
  const { name, location, type } = req.body || {};

  const warehouse = await Warehouse.findByPk(id);
  if (!warehouse) {
    return res.status(404).json({ message: 'Warehouse not found' });
  }

  // Ensure at least one field is provided
  if (name === undefined && location === undefined && type === undefined) {
    return res.status(400).json({ message: 'At least one field (name, location, or type) must be provided' });
  }

  // Validate fields if provided
  if (name !== undefined && (!name || !name.trim())) {
    return res.status(400).json({ message: 'name cannot be empty' });
  }
  if (location !== undefined && (!location || !location.trim())) {
    return res.status(400).json({ message: 'location cannot be empty' });
  }
  if (type !== undefined && !['central', 'stock'].includes(type)) {
    return res.status(400).json({ message: 'type must be either "central" or "stock"' });
  }

  // Check for duplicate name
  if (name !== undefined) {
    const duplicate = await Warehouse.findOne({ where: { name } });
    if (duplicate && duplicate.id !== warehouse.id) {
      return res.status(409).json({ message: 'Warehouse name already exists' });
    }
    warehouse.name = name;
  }

  if (location !== undefined) warehouse.location = location;
  if (type !== undefined) warehouse.type = type;

  await warehouse.save();
  return res.json({
    warehouse: {
      id: warehouse.id,
      name: warehouse.name,
      location: warehouse.location,
      type: warehouse.type,
      createdAt: warehouse.createdAt,
      updatedAt: warehouse.updatedAt
    }
  });
});

// Delete warehouse (admin only)
router.delete('/:id', auth, allowRoles(ROLES.ADMIN), async (req, res) => {
  const { id } = req.params;
  const warehouse = await Warehouse.findByPk(id);
  if (!warehouse) {
    return res.status(404).json({ message: 'Warehouse not found' });
  }
  try {
    await warehouse.destroy();
    return res.status(200).json({ message: 'Warehouse deleted successfully' });
  } catch (err) {
    return res.status(409).json({ message: 'Cannot delete warehouse with related records' });
  }
});

module.exports = router;

