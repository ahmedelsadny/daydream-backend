const express = require('express');
const { Promotion, Product, Category, Branch, sequelize, Sequelize } = require('../models');
const auth = require('../middleware/auth');
const { allowRoles, ROLES } = require('../middleware/roles');
const { logAuditEvent } = require('../utils/auditLogger');
const { evaluatePromotions } = require('../services/promotionEngine');
const { Op } = Sequelize;

const router = express.Router();

// List promotions
router.get('/', auth, async (req, res) => {
  try {
    const { isActive, type, scope, branchId, limit = 50, offset = 0 } = req.query;

    const where = {};
    if (isActive !== undefined) {
      where.isActive = isActive === 'true' || isActive === '1';
    }
    if (type) where.type = type;
    if (scope) where.scope = scope;
    if (branchId) {
      where[Op.or] = [{ branchId: null }, { branchId }];
    }

    const { count, rows: promotions } = await Promotion.findAndCountAll({
      where,
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
      order: [['priority', 'DESC'], ['createdAt', 'DESC']],
      include: [
        { model: Product, as: 'targetProduct', attributes: ['id', 'name', 'sku', 'barcode', 'price'] },
        { model: Category, as: 'targetCategory', attributes: ['id', 'name'] },
        { model: Branch, attributes: ['id', 'name'] }
      ]
    });

    return res.json({
      success: true,
      total: count,
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
      promotions
    });
  } catch (error) {
    console.error('Error fetching promotions:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Evaluate cart promotions (preview calculation for POS front-end)
router.post('/evaluate', auth, async (req, res) => {
  try {
    const { items, branchId, subtotal } = req.body;
    const targetBranchId = branchId || req.user.branchId || null;

    const result = await evaluatePromotions({
      items,
      branchId: targetBranchId,
      subtotal: parseFloat(subtotal) || 0
    });

    return res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error evaluating promotions:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Get single promotion
router.get('/:id', auth, async (req, res) => {
  try {
    const promotion = await Promotion.findByPk(req.params.id, {
      include: [
        { model: Product, as: 'targetProduct' },
        { model: Category, as: 'targetCategory' },
        { model: Branch }
      ]
    });

    if (!promotion) {
      return res.status(404).json({ message: 'Promotion not found' });
    }

    return res.json({ success: true, promotion });
  } catch (error) {
    console.error('Error fetching promotion:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Create promotion (admin, branch_manager)
router.post('/', auth, allowRoles(ROLES.ADMIN, ROLES.BRANCH_MANAGER), async (req, res) => {
  try {
    const {
      name, type, scope, targetProductId, targetCategoryId,
      buyQuantity, getQuantity, discountPercentage, discountAmount,
      bundlePrice, minOrderAmount, startDate, endDate, isActive,
      branchId, priority
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Promotion name is required' });
    }

    if (!startDate || !endDate) {
      return res.status(400).json({ message: 'Both startDate and endDate are required' });
    }

    const promo = await Promotion.create({
      name: name.trim(),
      type: type || 'buy_x_get_y',
      scope: scope || 'product',
      targetProductId: targetProductId || null,
      targetCategoryId: targetCategoryId || null,
      buyQuantity: buyQuantity ? parseFloat(buyQuantity) : 1.000,
      getQuantity: getQuantity ? parseFloat(getQuantity) : 1.000,
      discountPercentage: discountPercentage ? parseFloat(discountPercentage) : null,
      discountAmount: discountAmount ? parseFloat(discountAmount) : null,
      bundlePrice: bundlePrice ? parseFloat(bundlePrice) : null,
      minOrderAmount: minOrderAmount ? parseFloat(minOrderAmount) : 0.00,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      isActive: isActive !== undefined ? !!isActive : true,
      branchId: branchId || (req.user.role === ROLES.BRANCH_MANAGER ? req.user.branchId : null),
      priority: priority ? parseInt(priority, 10) : 0
    });

    await logAuditEvent({
      req,
      action: 'PROMOTION_CREATE',
      entityType: 'Promotion',
      entityId: promo.id,
      newValues: { name: promo.name, type: promo.type }
    });

    return res.status(201).json({
      success: true,
      message: 'Promotion created successfully',
      promotion: promo
    });
  } catch (error) {
    console.error('Error creating promotion:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Update promotion
router.put('/:id', auth, allowRoles(ROLES.ADMIN, ROLES.BRANCH_MANAGER), async (req, res) => {
  try {
    const promo = await Promotion.findByPk(req.params.id);
    if (!promo) {
      return res.status(404).json({ message: 'Promotion not found' });
    }

    const {
      name, type, scope, targetProductId, targetCategoryId,
      buyQuantity, getQuantity, discountPercentage, discountAmount,
      bundlePrice, minOrderAmount, startDate, endDate, isActive,
      branchId, priority
    } = req.body;

    const oldValues = { name: promo.name, isActive: promo.isActive };

    await promo.update({
      name: name !== undefined ? name.trim() : promo.name,
      type: type !== undefined ? type : promo.type,
      scope: scope !== undefined ? scope : promo.scope,
      targetProductId: targetProductId !== undefined ? targetProductId : promo.targetProductId,
      targetCategoryId: targetCategoryId !== undefined ? targetCategoryId : promo.targetCategoryId,
      buyQuantity: buyQuantity !== undefined ? parseFloat(buyQuantity) : promo.buyQuantity,
      getQuantity: getQuantity !== undefined ? parseFloat(getQuantity) : promo.getQuantity,
      discountPercentage: discountPercentage !== undefined ? parseFloat(discountPercentage) : promo.discountPercentage,
      discountAmount: discountAmount !== undefined ? parseFloat(discountAmount) : promo.discountAmount,
      bundlePrice: bundlePrice !== undefined ? parseFloat(bundlePrice) : promo.bundlePrice,
      minOrderAmount: minOrderAmount !== undefined ? parseFloat(minOrderAmount) : promo.minOrderAmount,
      startDate: startDate !== undefined ? new Date(startDate) : promo.startDate,
      endDate: endDate !== undefined ? new Date(endDate) : promo.endDate,
      isActive: isActive !== undefined ? !!isActive : promo.isActive,
      branchId: branchId !== undefined ? branchId : promo.branchId,
      priority: priority !== undefined ? parseInt(priority, 10) : promo.priority
    });

    await logAuditEvent({
      req,
      action: 'PROMOTION_UPDATE',
      entityType: 'Promotion',
      entityId: promo.id,
      oldValues,
      newValues: { name: promo.name, isActive: promo.isActive }
    });

    return res.json({
      success: true,
      message: 'Promotion updated successfully',
      promotion: promo
    });
  } catch (error) {
    console.error('Error updating promotion:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Delete promotion
router.delete('/:id', auth, allowRoles(ROLES.ADMIN, ROLES.BRANCH_MANAGER), async (req, res) => {
  try {
    const promo = await Promotion.findByPk(req.params.id);
    if (!promo) {
      return res.status(404).json({ message: 'Promotion not found' });
    }

    await promo.destroy();

    await logAuditEvent({
      req,
      action: 'PROMOTION_DELETE',
      entityType: 'Promotion',
      entityId: req.params.id,
      oldValues: { name: promo.name }
    });

    return res.json({ success: true, message: 'Promotion deleted successfully' });
  } catch (error) {
    console.error('Error deleting promotion:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

module.exports = router;
