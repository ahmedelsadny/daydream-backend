const express = require('express');
const { Category, SubCategory, Product } = require('../models');
const auth = require('../middleware/auth');
const { allowRoles, ROLES } = require('../middleware/roles');

const router = express.Router();

// Create category (admin only)
router.post('/', auth, allowRoles(ROLES.ADMIN), async (req, res) => {
  const { name } = req.body || {};
  if (!name || !name.trim()) {
    return res.status(400).json({ message: 'name is required' });
  }

  // Optional: enforce unique name at app layer (db constraint recommended too)
  const exists = await Category.findOne({ where: { name } });
  if (exists) {
    return res.status(409).json({ message: 'Category name already exists' });
    }

  const category = await Category.create({ name });
  return res.status(201).json({
    category: {
      id: category.id,
      name: category.name,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt
    }
  });
});

// List categories (admin, branch_manager, cashier)
router.get('/', auth, allowRoles(ROLES.ADMIN, ROLES.BRANCH_MANAGER, ROLES.CASHIER), async (_req, res) => {
  const categories = await Category.findAll({ order: [['created_at', 'DESC']] });
  return res.json({
    categories: categories.map((c) => ({ id: c.id, name: c.name, createdAt: c.createdAt, updatedAt: c.updatedAt }))
  });
});

// Update category (admin only)
router.put('/:id', auth, allowRoles(ROLES.ADMIN), async (req, res) => {
  const { id } = req.params;
  const { name } = req.body || {};
  if (!name || !name.trim()) {
    return res.status(400).json({ message: 'name is required' });
  }

  const category = await Category.findByPk(id);
  if (!category) {
    return res.status(404).json({ message: 'Category not found' });
  }

  // Optional: check for duplicate name
  const duplicate = await Category.findOne({ where: { name } });
  if (duplicate && duplicate.id !== category.id) {
    return res.status(409).json({ message: 'Category name already exists' });
  }

  category.name = name;
  await category.save();
  return res.json({
    category: {
      id: category.id,
      name: category.name,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt
    }
  });
});

// Delete category (admin only)
router.delete('/:id', auth, allowRoles(ROLES.ADMIN), async (req, res) => {
  const { id } = req.params;
  const category = await Category.findByPk(id);
  if (!category) {
    return res.status(404).json({ message: 'Category not found' });
  }
  try {
    await category.destroy();
    return res.status(200).json({ message: 'Category deleted successfully' });
  } catch (err) {
    // Check if there are related records and provide specific guidance
    const subcategories = await SubCategory.count({ where: { categoryId: id } });
    const products = await Product.count({ where: { categoryId: id } });
    
    if (subcategories > 0 || products > 0) {
      const issues = [];
      if (subcategories > 0) issues.push(`${subcategories} subcategor${subcategories === 1 ? 'y' : 'ies'}`);
      if (products > 0) issues.push(`${products} product${products === 1 ? '' : 's'}`);
      
      return res.status(409).json({ 
        message: `Cannot delete category because it has related records: ${issues.join(' and ')}. Please remove all related records first.` 
      });
    }
    
    return res.status(409).json({ message: 'Cannot delete category with related records' });
  }
});

module.exports = router;