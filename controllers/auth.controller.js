const express = require('express');
const bcrypt = require('bcryptjs');
const { User, Branch, Warehouse } = require('../models');
const { signJwt } = require('../auth-jwt');
const auth = require('../middleware/auth');
const { allowRoles, ROLES } = require('../middleware/roles');
const { revokeToken } = require('../auth-jwt/blacklist');

const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    console.log('🔐 Login request received');
    console.log('Request body:', req.body);
    
    const { email, password } = req.body;
    if (!email || !password) {
      console.log('❌ Missing email or password');
      return res.status(400).json({ message: 'Email and password are required' });
    }

    console.log(`🔍 Looking up user: ${email}`);
    const user = await User.findOne({ 
      where: { email },
      include: [
        {
          model: Branch,
          attributes: ['id', 'name'],
          required: false
        },
        {
          model: Warehouse,
          attributes: ['id', 'name'],
          required: false
        }
      ]
    });
    
    if (!user) {
      console.log('❌ User not found');
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    console.log('✅ User found, checking password');
    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      console.log('❌ Password mismatch');
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    console.log('✅ Password correct, generating token');
    const token = signJwt({ sub: user.id, role: user.role });

    console.log('✅ Login successful');
    return res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        branchId: user.branchId,
        warehouseId: user.warehouseId,
        Branch: user.Branch,
        Warehouse: user.Warehouse
      }
    });
  } catch (error) {
    console.error('❌ Login error:', error);
    console.error('Error stack:', error.stack);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// Get current user profile
router.get('/profile', auth, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      include: [
        {
          model: Branch,
          attributes: ['id', 'name'],
          required: false
        },
        {
          model: Warehouse,
          attributes: ['id', 'name'],
          required: false
        }
      ],
      attributes: ['id', 'name', 'email', 'role', 'branchId', 'warehouseId', 'createdAt', 'updatedAt']
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    return res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        branchId: user.branchId,
        warehouseId: user.warehouseId,
        Branch: user.Branch,
        Warehouse: user.Warehouse,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }
    });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return res.status(500).json({
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get available roles (admin only)
router.get('/roles', auth, allowRoles(ROLES.ADMIN), async (req, res) => {
  try {
    const roles = [
      {
        value: 'branch_manager',
        label: 'Branch Manager',
        description: 'Manages a specific branch location'
      },
      {
        value: 'cashier',
        label: 'Cashier',
        description: 'Handles point of sale transactions'
      },
      {
        value: 'stock_keeper',
        label: 'Stock Keeper',
        description: 'Manages inventory and stock'
      }
    ];

    return res.status(200).json({
      message: 'Roles retrieved successfully',
      roles: roles
    });
  } catch (error) {
    console.error('Error getting roles:', error);
    return res.status(500).json({
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Admin only: register new user accounts (non-admin roles)
router.post('/register', auth, allowRoles(ROLES.ADMIN), async (req, res) => {
  const { name, email, password, role, branchId = null, warehouseId = null } = req.body || {};

  if (!name || !email || !password || !role) {
    return res.status(400).json({ message: 'name, email, password, role are required' });
  }

  const allowedRoles = [ROLES.BRANCH_MANAGER, ROLES.CASHIER, ROLES.STOCK_KEEPER];
  if (!allowedRoles.includes(role)) {
    return res.status(400).json({ message: 'Invalid role. Allowed: branch_manager, cashier, stock_keeper' });
  }

  const exists = await User.findOne({ where: { email } });
  if (exists) {
    return res.status(409).json({ message: 'Email already in use' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const created = await User.create({
    name,
    email,
    passwordHash,
    role,
    branchId,
    warehouseId
  });

  return res.status(201).json({
    user: {
      id: created.id,
      name: created.name,
      email: created.email,
      role: created.role,
      branchId: created.branchId,
      warehouseId: created.warehouseId
    }
  });
});

// Logout: revoke token (accepts token in body; falls back to Authorization header)
router.post('/logout', async (req, res) => {
  const bodyToken = req.body && req.body.token;
  const authHeader = req.headers.authorization || '';
  const headerToken = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : undefined;
  const token = bodyToken || headerToken;

  if (!token) {
    return res.status(400).json({ message: 'token is required in body or Authorization header' });
  }

  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8'));
    revokeToken(token, payload.exp || Math.floor(Date.now() / 1000) + 3600);
  } catch (_e) {
    // if parsing fails, just revoke for 1 hour to be safe
    revokeToken(token, Math.floor(Date.now() / 1000) + 3600);
  }
  return res.status(200).json({ message: 'You successfully logged out' });
});

// Get all users (admin only)
router.get('/users', auth, allowRoles(ROLES.ADMIN), async (req, res) => {
  try {
    const { role, branchId, warehouseId, limit = 50, offset = 0 } = req.query;

    // Build where clause for filtering
    const whereClause = {};
    
    if (role && ['admin', 'branch_manager', 'cashier', 'stock_keeper'].includes(role)) {
      whereClause.role = role;
    }
    
    if (branchId) {
      whereClause.branchId = branchId;
    }
    
    if (warehouseId) {
      whereClause.warehouseId = warehouseId;
    }

    // Fetch users with related data
    const { count, rows: users } = await User.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      include: [
        {
          model: Branch,
          attributes: ['id', 'name'],
          required: false
        },
        {
          model: Warehouse,
          attributes: ['id', 'name'],
          required: false
        }
      ],
      attributes: ['id', 'name', 'email', 'role', 'branchId', 'warehouseId', 'createdAt', 'updatedAt'],
      order: [['createdAt', 'DESC']]
    });

    // Format response
    const formattedUsers = users.map(user => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      branch: user.Branch ? {
        id: user.Branch.id,
        name: user.Branch.name
      } : null,
      warehouse: user.Warehouse ? {
        id: user.Warehouse.id,
        name: user.Warehouse.name
      } : null,
      branchId: user.branchId,
      warehouseId: user.warehouseId,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    }));

    return res.status(200).json({
      users: formattedUsers,
      total: count,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

  } catch (error) {
    console.error('Error fetching users:', error);
    return res.status(500).json({
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Update user (admin only) - allows partial updates
router.patch('/users/:id', auth, allowRoles(ROLES.ADMIN), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, password, role, branchId, warehouseId } = req.body;

    // Find user
    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Build update object with only provided fields
    const updateData = {};

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ message: 'Name must be a non-empty string' });
      }
      updateData.name = name.trim();
    }

    if (email !== undefined) {
      if (typeof email !== 'string' || !email.includes('@')) {
        return res.status(400).json({ message: 'Valid email is required' });
      }
      // Check if email is already taken by another user
      const existingUser = await User.findOne({ where: { email } });
      if (existingUser && existingUser.id !== id) {
        return res.status(409).json({ message: 'Email already in use by another user' });
      }
      updateData.email = email.trim().toLowerCase();
    }

    if (password !== undefined) {
      if (typeof password !== 'string' || password.length < 6) {
        return res.status(400).json({ message: 'Password must be at least 6 characters' });
      }
      updateData.passwordHash = await bcrypt.hash(password, 10);
    }

    if (role !== undefined) {
      const validRoles = ['admin', 'branch_manager', 'cashier', 'stock_keeper'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ 
          message: `Invalid role. Allowed: ${validRoles.join(', ')}` 
        });
      }
      updateData.role = role;
    }

    if (branchId !== undefined) {
      // Allow null to unassign from branch
      if (branchId === null) {
        updateData.branchId = null;
      } else {
        // Verify branch exists
        const branch = await Branch.findByPk(branchId);
        if (!branch) {
          return res.status(404).json({ message: 'Branch not found' });
        }
        updateData.branchId = branchId;
      }
    }

    if (warehouseId !== undefined) {
      // Allow null to unassign from warehouse
      if (warehouseId === null) {
        updateData.warehouseId = null;
      } else {
        // Verify warehouse exists
        const warehouse = await Warehouse.findByPk(warehouseId);
        if (!warehouse) {
          return res.status(404).json({ message: 'Warehouse not found' });
        }
        updateData.warehouseId = warehouseId;
      }
    }

    // Check if there's anything to update
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ message: 'No valid fields provided for update' });
    }

    // Update user
    await user.update(updateData);

    // Fetch updated user with relations
    const updatedUser = await User.findByPk(id, {
      include: [
        {
          model: Branch,
          attributes: ['id', 'name'],
          required: false
        },
        {
          model: Warehouse,
          attributes: ['id', 'name'],
          required: false
        }
      ],
      attributes: ['id', 'name', 'email', 'role', 'branchId', 'warehouseId', 'createdAt', 'updatedAt']
    });

    return res.status(200).json({
      message: 'User updated successfully',
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        branch: updatedUser.Branch ? {
          id: updatedUser.Branch.id,
          name: updatedUser.Branch.name
        } : null,
        warehouse: updatedUser.Warehouse ? {
          id: updatedUser.Warehouse.id,
          name: updatedUser.Warehouse.name
        } : null,
        branchId: updatedUser.branchId,
        warehouseId: updatedUser.warehouseId,
        createdAt: updatedUser.createdAt,
        updatedAt: updatedUser.updatedAt
      }
    });

  } catch (error) {
    console.error('Error updating user:', error);
    return res.status(500).json({
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Delete user (admin only)
router.delete('/users/:id', auth, allowRoles(ROLES.ADMIN), async (req, res) => {
  try {
    const { id } = req.params;

    // Find user
    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Prevent deleting your own account
    if (user.id === req.user.id) {
      return res.status(400).json({ 
        message: 'Cannot delete your own account' 
      });
    }

    // Prevent deleting admin accounts
    if (user.role === 'admin') {
      return res.status(403).json({ 
        message: 'Cannot delete admin accounts' 
      });
    }

    // Store user info for response
    const deletedUserInfo = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    };

    // Delete user
    await user.destroy();

    return res.status(200).json({
      message: 'User deleted successfully',
      user: deletedUserInfo
    });

  } catch (error) {
    console.error('Error deleting user:', error);
    return res.status(500).json({
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;
