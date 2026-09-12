const express = require('express');
const { 
  Stocktake, StocktakeItem, Product, Inventory, Branch, Warehouse, User, 
  sequelize, Sequelize 
} = require('../models');
const auth = require('../middleware/auth');
const { allowRoles, ROLES } = require('../middleware/roles');
const { requireSupervisorPin } = require('../middleware/supervisorPin');
const { logAuditEvent } = require('../utils/auditLogger');
const { Op } = Sequelize;

const router = express.Router();

function generateStocktakeNumber() {
  const prefix = 'STK';
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.floor(100 + Math.random() * 900);
  return `${prefix}-${timestamp}-${random}`;
}

// List stocktake sessions
router.get('/', auth, allowRoles(ROLES.ADMIN, ROLES.BRANCH_MANAGER, ROLES.STOCK_KEEPER), async (req, res) => {
  try {
    const { branchId, warehouseId, status, limit = 50, offset = 0 } = req.query;

    const where = {};
    if (status) where.status = status;
    if (branchId) where.branchId = branchId;
    if (warehouseId) where.warehouseId = warehouseId;

    if (req.user.role === ROLES.BRANCH_MANAGER && req.user.branchId) {
      where.branchId = req.user.branchId;
    }

    const { count, rows: stocktakes } = await Stocktake.findAndCountAll({
      where,
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
      order: [['createdAt', 'DESC']],
      include: [
        { model: Branch, attributes: ['id', 'name'] },
        { model: Warehouse, attributes: ['id', 'name'] },
        { model: User, as: 'initiator', attributes: ['id', 'name'] },
        { model: User, as: 'completer', attributes: ['id', 'name'] }
      ]
    });

    return res.json({
      success: true,
      total: count,
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
      stocktakes
    });
  } catch (error) {
    console.error('Error fetching stocktakes:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Get single stocktake session with counted items
router.get('/:id', auth, allowRoles(ROLES.ADMIN, ROLES.BRANCH_MANAGER, ROLES.STOCK_KEEPER), async (req, res) => {
  try {
    const stocktake = await Stocktake.findByPk(req.params.id, {
      include: [
        { model: Branch, attributes: ['id', 'name'] },
        { model: Warehouse, attributes: ['id', 'name'] },
        { model: User, as: 'initiator', attributes: ['id', 'name'] },
        { model: User, as: 'completer', attributes: ['id', 'name'] },
        {
          model: StocktakeItem,
          as: 'items',
          include: [
            {
              model: Product,
              as: 'product',
              attributes: ['id', 'name', 'sku', 'barcode', 'price', 'cost', 'unit']
            }
          ]
        }
      ]
    });

    if (!stocktake) {
      return res.status(404).json({ message: 'Stocktake session not found' });
    }

    return res.json({ success: true, stocktake });
  } catch (error) {
    console.error('Error fetching stocktake:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Start a new physical stocktake session
router.post('/start', auth, allowRoles(ROLES.ADMIN, ROLES.BRANCH_MANAGER, ROLES.STOCK_KEEPER), async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { branchId, warehouseId, notes } = req.body;

    const targetBranchId = branchId || (req.user.branchId ? req.user.branchId : null);
    const targetWarehouseId = warehouseId || (req.user.warehouseId ? req.user.warehouseId : null);

    if (!targetBranchId && !targetWarehouseId) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Either branchId or warehouseId is required to start stocktake' });
    }

    // Check if there is already an active session in progress for this location
    const activeWhere = { status: 'in_progress' };
    if (targetBranchId) activeWhere.branchId = targetBranchId;
    if (targetWarehouseId) activeWhere.warehouseId = targetWarehouseId;

    const existingSession = await Stocktake.findOne({ where: activeWhere, transaction });
    if (existingSession) {
      await transaction.rollback();
      return res.status(400).json({
        message: 'There is already an active stocktake in progress for this location',
        existingSessionId: existingSession.id,
        sessionNumber: existingSession.sessionNumber
      });
    }

    // Fetch all current inventory records for this location
    const invWhere = {};
    if (targetBranchId) invWhere.branchId = targetBranchId;
    if (targetWarehouseId) invWhere.warehouseId = targetWarehouseId;

    const inventoryRecords = await Inventory.findAll({
      where: invWhere,
      include: [{ model: Product, attributes: ['id', 'name', 'cost'] }],
      transaction
    });

    let totalExpectedQty = 0;
    const sessionNumber = generateStocktakeNumber();

    const stocktake = await Stocktake.create({
      sessionNumber,
      branchId: targetBranchId,
      warehouseId: targetWarehouseId,
      status: 'in_progress',
      totalExpectedQty: 0,
      totalCountedQty: 0,
      totalVarianceQty: 0,
      totalVarianceValue: 0,
      notes: notes ? notes.trim() : null,
      startedBy: req.user.id
    }, { transaction });

    for (const inv of inventoryRecords) {
      const sysQty = parseFloat(inv.quantity || 0);
      const unitCost = inv.Product?.cost ? parseFloat(inv.Product.cost) : 0;
      totalExpectedQty += sysQty;

      await StocktakeItem.create({
        stocktakeId: stocktake.id,
        productId: inv.productId,
        systemQuantity: sysQty,
        countedQuantity: 0.000,
        variance: -sysQty,
        unitCost: unitCost,
        varianceValue: parseFloat((-sysQty * unitCost).toFixed(2))
      }, { transaction });
    }

    await stocktake.update({
      totalExpectedQty: parseFloat(totalExpectedQty.toFixed(3)),
      totalVarianceQty: parseFloat((-totalExpectedQty).toFixed(3))
    }, { transaction });

    await logAuditEvent({
      req,
      action: 'STOCKTAKE_START',
      entityType: 'Stocktake',
      entityId: stocktake.id,
      transaction,
      newValues: {
        sessionNumber,
        itemsCount: inventoryRecords.length,
        totalExpectedQty
      }
    });

    await transaction.commit();

    return res.status(201).json({
      success: true,
      message: 'Stocktake session initialized successfully. Ready for physical count scanning.',
      stocktakeId: stocktake.id,
      sessionNumber,
      itemsTracked: inventoryRecords.length,
      totalExpectedQty
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error starting stocktake:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Record or update physical count of a product in session (by scan or manual)
router.post('/:id/count-item', auth, allowRoles(ROLES.ADMIN, ROLES.BRANCH_MANAGER, ROLES.STOCK_KEEPER), async (req, res) => {
  try {
    const { productId, barcode, countedQuantity, addQuantity, notes } = req.body;

    const stocktake = await Stocktake.findByPk(req.params.id);
    if (!stocktake) {
      return res.status(404).json({ message: 'Stocktake session not found' });
    }

    if (stocktake.status !== 'in_progress') {
      return res.status(400).json({ message: 'Stocktake session is not in progress' });
    }

    // Resolve product by id or barcode
    let product = null;
    if (productId) {
      product = await Product.findByPk(productId);
    } else if (barcode) {
      product = await Product.findOne({ where: { barcode } });
    }

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    let item = await StocktakeItem.findOne({
      where: { stocktakeId: stocktake.id, productId: product.id }
    });

    const unitCost = product.cost ? parseFloat(product.cost) : 0;

    // If item was not originally in the stocktake (found on shelf unexpectedly), add it!
    if (!item) {
      item = await StocktakeItem.create({
        stocktakeId: stocktake.id,
        productId: product.id,
        systemQuantity: 0.000,
        countedQuantity: 0.000,
        variance: 0.000,
        unitCost: unitCost,
        varianceValue: 0.00
      });
    }

    let finalCount = 0;
    if (countedQuantity !== undefined) {
      finalCount = parseFloat(countedQuantity);
    } else if (addQuantity !== undefined) {
      finalCount = parseFloat(item.countedQuantity || 0) + parseFloat(addQuantity);
    } else {
      // Default: increment by 1 on single barcode beep
      finalCount = parseFloat(item.countedQuantity || 0) + 1;
    }

    if (isNaN(finalCount) || finalCount < 0) {
      return res.status(400).json({ message: 'Invalid counted quantity' });
    }

    const sysQty = parseFloat(item.systemQuantity);
    const variance = parseFloat((finalCount - sysQty).toFixed(3));
    const varianceValue = parseFloat((variance * unitCost).toFixed(2));

    await item.update({
      countedQuantity: finalCount,
      variance,
      varianceValue,
      notes: notes ? notes.trim() : item.notes
    });

    // Re-calculate session totals
    const allItems = await StocktakeItem.findAll({ where: { stocktakeId: stocktake.id } });
    let totalCounted = 0;
    let totalVarQty = 0;
    let totalVarVal = 0;

    allItems.forEach(i => {
      totalCounted += parseFloat(i.countedQuantity || 0);
      totalVarQty += parseFloat(i.variance || 0);
      totalVarVal += parseFloat(i.varianceValue || 0);
    });

    await stocktake.update({
      totalCountedQty: parseFloat(totalCounted.toFixed(3)),
      totalVarianceQty: parseFloat(totalVarQty.toFixed(3)),
      totalVarianceValue: parseFloat(totalVarVal.toFixed(2))
    });

    return res.json({
      success: true,
      item: {
        id: item.id,
        productId: product.id,
        productName: product.name,
        systemQuantity: sysQty,
        countedQuantity: finalCount,
        variance,
        varianceValue
      },
      sessionSummary: {
        totalCountedQty: parseFloat(totalCounted.toFixed(3)),
        totalVarianceQty: parseFloat(totalVarQty.toFixed(3)),
        totalVarianceValue: parseFloat(totalVarVal.toFixed(2))
      }
    });
  } catch (error) {
    console.error('Error counting stocktake item:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Finalize stocktake & auto-reconcile physical inventory (Supervisor Protected)
router.post('/:id/complete', auth, allowRoles(ROLES.ADMIN, ROLES.BRANCH_MANAGER), requireSupervisorPin, async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const stocktake = await Stocktake.findByPk(req.params.id, {
      include: [{ model: StocktakeItem, as: 'items', include: [{ model: Product, as: 'product' }] }],
      transaction
    });

    if (!stocktake) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Stocktake session not found' });
    }

    if (stocktake.status !== 'in_progress') {
      await transaction.rollback();
      return res.status(400).json({ message: `Cannot complete stocktake with status ${stocktake.status}` });
    }

    const targetBranchId = stocktake.branchId;
    const targetWarehouseId = stocktake.warehouseId;

    // Apply counted quantities directly to inventory table
    for (const item of stocktake.items) {
      const invWhere = { productId: item.productId };
      if (targetBranchId) invWhere.branchId = targetBranchId;
      if (targetWarehouseId) invWhere.warehouseId = targetWarehouseId;

      let inv = await Inventory.findOne({ where: invWhere, transaction });
      const physicallyCounted = parseFloat(item.countedQuantity);

      if (inv) {
        await inv.update({ quantity: physicallyCounted }, { transaction });
      } else {
        await Inventory.create({
          productId: item.productId,
          branchId: targetBranchId,
          warehouseId: targetWarehouseId,
          quantity: physicallyCounted
        }, { transaction });
      }
    }

    await stocktake.update({
      status: 'completed',
      completedBy: req.user.id
    }, { transaction });

    await logAuditEvent({
      req,
      action: 'STOCKTAKE_COMPLETE',
      entityType: 'Stocktake',
      entityId: stocktake.id,
      supervisorId: req.supervisor?.id,
      transaction,
      newValues: {
        sessionNumber: stocktake.sessionNumber,
        totalVarianceQty: stocktake.totalVarianceQty,
        totalVarianceValue: stocktake.totalVarianceValue,
        completedBy: req.user.name,
        authorizedBySupervisor: req.supervisor?.name
      }
    });

    await transaction.commit();

    return res.json({
      success: true,
      message: 'Stocktake finalized and inventory reconciled to physical count',
      sessionNumber: stocktake.sessionNumber,
      totalCountedQty: stocktake.totalCountedQty,
      totalVarianceQty: stocktake.totalVarianceQty,
      totalVarianceValue: stocktake.totalVarianceValue,
      authorizedBy: req.supervisor ? { id: req.supervisor.id, name: req.supervisor.name } : null
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error completing stocktake:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Cancel a stocktake session
router.post('/:id/cancel', auth, allowRoles(ROLES.ADMIN, ROLES.BRANCH_MANAGER), async (req, res) => {
  try {
    const stocktake = await Stocktake.findByPk(req.params.id);
    if (!stocktake) {
      return res.status(404).json({ message: 'Stocktake session not found' });
    }

    if (stocktake.status === 'completed') {
      return res.status(400).json({ message: 'Cannot cancel an already completed stocktake' });
    }

    await stocktake.update({ status: 'cancelled' });

    await logAuditEvent({
      req,
      action: 'STOCKTAKE_CANCEL',
      entityType: 'Stocktake',
      entityId: stocktake.id,
      newValues: { status: 'cancelled' }
    });

    return res.json({ success: true, message: 'Stocktake session cancelled' });
  } catch (error) {
    console.error('Error cancelling stocktake:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

module.exports = router;
