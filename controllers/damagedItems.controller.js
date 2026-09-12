const express = require('express');
const { 
  DamagedItem, Product, Inventory, Branch, Warehouse, User, 
  sequelize, Sequelize 
} = require('../models');
const auth = require('../middleware/auth');
const { allowRoles, ROLES } = require('../middleware/roles');
const { requireSupervisorPin } = require('../middleware/supervisorPin');
const { logAuditEvent } = require('../utils/auditLogger');
const { Op } = Sequelize;

const router = express.Router();

// List damaged and expired goods
router.get('/', auth, allowRoles(ROLES.ADMIN, ROLES.BRANCH_MANAGER, ROLES.STOCK_KEEPER), async (req, res) => {
  try {
    const { branchId, warehouseId, reason, startDate, endDate, limit = 50, offset = 0 } = req.query;

    const where = {};
    if (reason) where.reason = reason;
    if (branchId) where.branchId = branchId;
    if (warehouseId) where.warehouseId = warehouseId;

    if (req.user.role === ROLES.BRANCH_MANAGER && req.user.branchId) {
      where.branchId = req.user.branchId;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt[Op.gte] = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.createdAt[Op.lte] = end;
      }
    }

    const { count, rows: damagedItems } = await DamagedItem.findAndCountAll({
      where,
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
      order: [['createdAt', 'DESC']],
      include: [
        { model: Product, as: 'product', attributes: ['id', 'name', 'sku', 'barcode', 'unit'] },
        { model: Branch, attributes: ['id', 'name'] },
        { model: Warehouse, attributes: ['id', 'name'] },
        { model: User, as: 'reporter', attributes: ['id', 'name'] },
        { model: User, as: 'approver', attributes: ['id', 'name'] }
      ]
    });

    return res.json({
      success: true,
      total: count,
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
      damagedItems
    });
  } catch (error) {
    console.error('Error fetching damaged items:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Financial summary of damaged goods and losses
router.get('/summary', auth, allowRoles(ROLES.ADMIN, ROLES.BRANCH_MANAGER), async (req, res) => {
  try {
    const { branchId, warehouseId, startDate, endDate } = req.query;

    const where = {};
    if (branchId) where.branchId = branchId;
    if (warehouseId) where.warehouseId = warehouseId;
    if (req.user.role === ROLES.BRANCH_MANAGER && req.user.branchId) {
      where.branchId = req.user.branchId;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt[Op.gte] = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.createdAt[Op.lte] = end;
      }
    }

    const records = await DamagedItem.findAll({
      where,
      attributes: ['reason', 'totalLossValue', 'quantity']
    });

    let totalLoss = 0;
    let totalQty = 0;
    const byReason = {};

    records.forEach(r => {
      const val = parseFloat(r.totalLossValue || 0);
      const qty = parseFloat(r.quantity || 0);
      totalLoss += val;
      totalQty += qty;

      if (!byReason[r.reason]) {
        byReason[r.reason] = { count: 0, quantity: 0, totalLoss: 0 };
      }
      byReason[r.reason].count += 1;
      byReason[r.reason].quantity += qty;
      byReason[r.reason].totalLoss += val;
    });

    return res.json({
      success: true,
      summary: {
        totalRecords: records.length,
        totalDamagedQuantity: parseFloat(totalQty.toFixed(3)),
        totalLossValue: parseFloat(totalLoss.toFixed(2)),
        breakdownByReason: Object.keys(byReason).map(reason => ({
          reason,
          count: byReason[reason].count,
          quantity: parseFloat(byReason[reason].quantity.toFixed(3)),
          totalLoss: parseFloat(byReason[reason].totalLoss.toFixed(2))
        }))
      }
    });
  } catch (error) {
    console.error('Error fetching damaged items summary:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Record damaged / expired / spoiled items (Supervisor Protected)
router.post('/', auth, allowRoles(ROLES.ADMIN, ROLES.BRANCH_MANAGER, ROLES.STOCK_KEEPER), requireSupervisorPin, async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { productId, quantity, branchId, warehouseId, reason = 'expired', notes } = req.body;

    if (!productId) {
      await transaction.rollback();
      return res.status(400).json({ message: 'productId is required' });
    }

    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty <= 0) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Valid positive quantity is required' });
    }

    const product = await Product.findByPk(productId, { transaction });
    if (!product) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Product not found' });
    }

    const targetBranchId = branchId || (req.user.branchId ? req.user.branchId : null);
    const targetWarehouseId = warehouseId || (req.user.warehouseId ? req.user.warehouseId : null);

    if (!targetBranchId && !targetWarehouseId) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Either branchId or warehouseId is required' });
    }

    const invWhere = { productId: product.id };
    if (targetBranchId) invWhere.branchId = targetBranchId;
    if (targetWarehouseId) invWhere.warehouseId = targetWarehouseId;

    const inventory = await Inventory.findOne({ where: invWhere, transaction });
    const currentQty = inventory ? parseFloat(inventory.quantity) : 0;

    if (currentQty < qty) {
      await transaction.rollback();
      return res.status(400).json({
        message: `Insufficient inventory to write off. Available stock: ${currentQty}, requested: ${qty}`
      });
    }

    // Deduct stock
    const newQty = parseFloat((currentQty - qty).toFixed(3));
    await inventory.update({ quantity: newQty }, { transaction });

    const unitCost = product.cost ? parseFloat(product.cost) : 0;
    const totalLossValue = parseFloat((qty * unitCost).toFixed(2));

    const record = await DamagedItem.create({
      branchId: targetBranchId,
      warehouseId: targetWarehouseId,
      productId: product.id,
      quantity: qty,
      unitCost,
      totalLossValue,
      reason,
      notes: notes ? notes.trim() : null,
      reportedBy: req.user.id,
      approvedBy: req.supervisor ? req.supervisor.id : req.user.id
    }, { transaction });

    await logAuditEvent({
      req,
      action: 'DAMAGED_ITEM_RECORD',
      entityType: 'Product',
      entityId: product.id,
      supervisorId: req.supervisor?.id,
      transaction,
      oldValues: { stockQuantity: currentQty },
      newValues: {
        damagedRecordId: record.id,
        writtenOffQuantity: qty,
        remainingStock: newQty,
        lossValue: totalLossValue,
        reason,
        authorizedBySupervisor: req.supervisor?.name
      }
    });

    await transaction.commit();

    return res.status(201).json({
      success: true,
      message: 'Damaged items recorded and deducted from inventory',
      record,
      remainingInventory: newQty,
      authorizedBy: req.supervisor ? { id: req.supervisor.id, name: req.supervisor.name } : null
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error recording damaged items:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

module.exports = router;
