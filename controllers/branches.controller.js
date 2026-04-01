const express = require('express');
const { Branch, Warehouse } = require('../models');
const auth = require('../middleware/auth');
const { allowRoles, ROLES } = require('../middleware/roles');

const router = express.Router();

// Apply authentication to all routes
router.use(auth);

// Admin only: Create a new branch
router.post('/', allowRoles(ROLES.ADMIN), async (req, res) => {
  try {
    const { name, location, warehouseId } = req.body;

    // Validate required fields
    if (!name || !location || !warehouseId) {
      return res.status(400).json({ 
        message: 'Name, location, and warehouseId are required' 
      });
    }

    // Verify that the warehouse exists
    const warehouse = await Warehouse.findByPk(warehouseId);
    if (!warehouse) {
      return res.status(404).json({ 
        message: 'Warehouse not found' 
      });
    }

    // Create the branch
    const branch = await Branch.create({
      name,
      location,
      warehouseId
    });

    // Fetch the created branch with warehouse information
    const createdBranch = await Branch.findByPk(branch.id, {
      include: [{
        model: Warehouse,
        as: 'Warehouse',
        attributes: ['id', 'name', 'location', 'type']
      }]
    });

    return res.status(201).json({
      message: 'Branch created successfully',
      branch: createdBranch
    });

  } catch (error) {
    console.error('Error creating branch:', error);
    
    // Handle Sequelize validation errors
    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({
        message: 'Validation error',
        errors: error.errors.map(err => ({
          field: err.path,
          message: err.message
        }))
      });
    }

    // Handle duplicate entry errors
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({
        message: 'Branch with this name already exists for this warehouse'
      });
    }

    return res.status(500).json({
      message: 'Internal server error'
    });
  }
});

// Admin only: Get all branches
router.get('/', allowRoles(ROLES.ADMIN,ROLES.STOCK_KEEPER), async (req, res) => {
  try {
    const branches = await Branch.findAll({
      include: [{
        model: Warehouse,
        as: 'Warehouse',
        attributes: ['id', 'name', 'location', 'type']
      }],
      order: [['createdAt', 'DESC']]
    });

    return res.json({
      branches
    });

  } catch (error) {
    console.error('Error fetching branches:', error);
    return res.status(500).json({
      message: 'Internal server error'
    });
  }
});

// Admin only: Get branch by ID
router.get('/:id', allowRoles(ROLES.ADMIN,ROLES.STOCK_KEEPER), async (req, res) => {
  try {
    const { id } = req.params;

    const branch = await Branch.findByPk(id, {
      include: [{
        model: Warehouse,
        as: 'Warehouse',
        attributes: ['id', 'name', 'location', 'type']
      }]
    });

    if (!branch) {
      return res.status(404).json({
        message: 'Branch not found'
      });
    }

    return res.json({
      branch
    });

  } catch (error) {
    console.error('Error fetching branch:', error);
    return res.status(500).json({
      message: 'Internal server error'
    });
  }
});

// Admin only: Update branch
router.put('/:id', allowRoles(ROLES.ADMIN), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, location, warehouseId } = req.body;

    const branch = await Branch.findByPk(id);
    if (!branch) {
      return res.status(404).json({
        message: 'Branch not found'
      });
    }

    // If warehouseId is being updated, verify the warehouse exists
    if (warehouseId && warehouseId !== branch.warehouseId) {
      const warehouse = await Warehouse.findByPk(warehouseId);
      if (!warehouse) {
        return res.status(404).json({
          message: 'Warehouse not found'
        });
      }
    }

    // Update the branch
    await branch.update({
      ...(name && { name }),
      ...(location && { location }),
      ...(warehouseId && { warehouseId })
    });

    // Fetch the updated branch with warehouse information
    const updatedBranch = await Branch.findByPk(branch.id, {
      include: [{
        model: Warehouse,
        as: 'Warehouse',
        attributes: ['id', 'name', 'location', 'type']
      }]
    });

    return res.json({
      message: 'Branch updated successfully',
      branch: updatedBranch
    });

  } catch (error) {
    console.error('Error updating branch:', error);
    
    // Handle Sequelize validation errors
    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({
        message: 'Validation error',
        errors: error.errors.map(err => ({
          field: err.path,
          message: err.message
        }))
      });
    }

    // Handle duplicate entry errors
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({
        message: 'Branch with this name already exists for this warehouse'
      });
    }

    return res.status(500).json({
      message: 'Internal server error'
    });
  }
});

// Admin only: Delete branch
router.delete('/:id', allowRoles(ROLES.ADMIN), async (req, res) => {
  try {
    const { id } = req.params;

    const branch = await Branch.findByPk(id);
    if (!branch) {
      return res.status(404).json({
        message: 'Branch not found'
      });
    }

    await branch.destroy();

    return res.json({
      message: 'Branch deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting branch:', error);
    return res.status(500).json({
      message: 'Internal server error'
    });
  }
});

module.exports = router;
