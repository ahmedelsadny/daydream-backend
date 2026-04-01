const express = require('express');
const { SubCategory, Category } = require('../models');
const auth = require('../middleware/auth');
const { allowRoles, ROLES } = require('../middleware/roles');

const router = express.Router();

// Create subcategory (admin only)
router.post('/', auth, allowRoles(ROLES.ADMIN), async (req, res) => {
    const { name, categoryId } = req.body || {};
    if (!name || !name.trim()) {
        return res.status(400).json({ message: 'name is required' });
    }
    if (!categoryId) {
        return res.status(400).json({ message: 'categoryId is required' });
    }

    // Verify category exists
    const category = await Category.findByPk(categoryId);
    if (!category) {
        return res.status(404).json({ message: 'Category not found' });
    }

    // Optional: enforce unique name within category at app layer (db constraint recommended too)
    const exists = await SubCategory.findOne({ where: { name, categoryId } });
    if (exists) {
        return res.status(409).json({ message: 'SubCategory name already exists in this category' });
    }

    const subCategory = await SubCategory.create({ name, categoryId });
    return res.status(201).json({
        subCategory: {
            id: subCategory.id,
            name: subCategory.name,
            categoryId: subCategory.categoryId,
            createdAt: subCategory.createdAt,
            updatedAt: subCategory.updatedAt
        }
    });
});

// List subcategories (admin, branch_manager, cashier)
router.get('/', auth, allowRoles(ROLES.ADMIN, ROLES.BRANCH_MANAGER, ROLES.CASHIER), async (req, res) => {
    const { categoryId } = req.query;

    const whereClause = categoryId ? { categoryId } : {};
    const subCategories = await SubCategory.findAll({
        where: whereClause,
        order: [['created_at', 'DESC']]
    });

    return res.json({
        subCategories: subCategories.map((sc) => ({
            id: sc.id,
            name: sc.name,
            categoryId: sc.categoryId,
            createdAt: sc.createdAt,
            updatedAt: sc.updatedAt
        }))
    });
});

// Update subcategory (admin only)
router.put('/:id', auth, allowRoles(ROLES.ADMIN), async (req, res) => {
    const { id } = req.params;
    const { name, categoryId } = req.body || {};
    if (!name || !name.trim()) {
        return res.status(400).json({ message: 'name is required' });
    }

    const subCategory = await SubCategory.findByPk(id);
    if (!subCategory) {
        return res.status(404).json({ message: 'SubCategory not found' });
    }

    // If categoryId is being updated, verify it exists
    if (categoryId && categoryId !== subCategory.categoryId) {
        const category = await Category.findByPk(categoryId);
        if (!category) {
            return res.status(404).json({ message: 'Category not found' });
        }
    }

    // Optional: check for duplicate name within the same category
    const targetCategoryId = categoryId || subCategory.categoryId;
    const duplicate = await SubCategory.findOne({ where: { name, categoryId: targetCategoryId } });
    if (duplicate && duplicate.id !== subCategory.id) {
        return res.status(409).json({ message: 'SubCategory name already exists in this category' });
    }

    subCategory.name = name;
    if (categoryId) {
        subCategory.categoryId = categoryId;
    }
    await subCategory.save();

    return res.json({
        subCategory: {
            id: subCategory.id,
            name: subCategory.name,
            categoryId: subCategory.categoryId,
            createdAt: subCategory.createdAt,
            updatedAt: subCategory.updatedAt
        }
    });
});

// Delete subcategory (admin only)
router.delete('/:id', auth, allowRoles(ROLES.ADMIN), async (req, res) => {
    const { id } = req.params;
    const subCategory = await SubCategory.findByPk(id);
    if (!subCategory) {
        return res.status(404).json({ message: 'SubCategory not found' });
    }

    try {
        await subCategory.destroy();
        return res.status(200).json({ message: 'SubCategory deleted successfully' });
    } catch (err) {
        return res.status(409).json({ message: 'Cannot delete subcategory with related records' });
    }
});

module.exports = router;