const express = require('express');
const { 
  PurchaseInvoice, PurchaseInvoiceItem, Supplier, Product, Inventory, 
  Branch, Warehouse, User, sequelize, Sequelize 
} = require('../models');
const auth = require('../middleware/auth');
const { allowRoles, ROLES } = require('../middleware/roles');
const { logAuditEvent } = require('../utils/auditLogger');
const { Op } = Sequelize;

const router = express.Router();

// Helper to generate invoice number
function generatePurchaseNumber() {
  const prefix = 'PUR';
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${timestamp}-${random}`;
}

// List purchase invoices
router.get('/', auth, allowRoles(ROLES.ADMIN, ROLES.BRANCH_MANAGER, ROLES.STOCK_KEEPER), async (req, res) => {
  try {
    const { 
      supplierId, branchId, warehouseId, status, paymentStatus, 
      startDate, endDate, limit = 50, offset = 0 
    } = req.query;

    const where = {};
    if (supplierId) where.supplierId = supplierId;
    if (branchId) where.branchId = branchId;
    if (warehouseId) where.warehouseId = warehouseId;
    if (status) where.status = status;
    if (paymentStatus) where.paymentStatus = paymentStatus;

    if (startDate || endDate) {
      where.invoiceDate = {};
      if (startDate) where.invoiceDate[Op.gte] = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.invoiceDate[Op.lte] = end;
      }
    }

    // Cashiers/branch managers can only see their own branch if specified
    if (req.user.role === ROLES.BRANCH_MANAGER && req.user.branchId) {
      where[Op.or] = [
        { branchId: req.user.branchId },
        { branchId: null }
      ];
    }

    const { count, rows: invoices } = await PurchaseInvoice.findAndCountAll({
      where,
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
      order: [['invoiceDate', 'DESC']],
      include: [
        { model: Supplier, as: 'supplier', attributes: ['id', 'name', 'companyName', 'phone'] },
        { model: Branch, attributes: ['id', 'name'] },
        { model: Warehouse, attributes: ['id', 'name'] },
        { model: User, as: 'receiver', attributes: ['id', 'name'] }
      ]
    });

    return res.json({
      success: true,
      total: count,
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
      invoices
    });
  } catch (error) {
    console.error('Error fetching purchase invoices:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Get single purchase invoice with items
router.get('/:id', auth, allowRoles(ROLES.ADMIN, ROLES.BRANCH_MANAGER, ROLES.STOCK_KEEPER), async (req, res) => {
  try {
    const invoice = await PurchaseInvoice.findByPk(req.params.id, {
      include: [
        { model: Supplier, as: 'supplier' },
        { model: Branch, attributes: ['id', 'name'] },
        { model: Warehouse, attributes: ['id', 'name'] },
        { model: User, as: 'receiver', attributes: ['id', 'name'] },
        {
          model: PurchaseInvoiceItem,
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

    if (!invoice) {
      return res.status(404).json({ message: 'Purchase invoice not found' });
    }

    return res.json({ success: true, invoice });
  } catch (error) {
    console.error('Error fetching purchase invoice:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Create purchase invoice (Draft)
router.post('/', auth, allowRoles(ROLES.ADMIN, ROLES.STOCK_KEEPER, ROLES.BRANCH_MANAGER), async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const {
      supplierId, supplierInvoiceNumber, branchId, warehouseId,
      invoiceDate, dueDate, notes, taxAmount = 0, discountAmount = 0,
      paidAmount = 0, items
    } = req.body;

    if (!supplierId) {
      await transaction.rollback();
      return res.status(400).json({ message: 'supplierId is required' });
    }

    const supplier = await Supplier.findByPk(supplierId, { transaction });
    if (!supplier) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Supplier not found' });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      await transaction.rollback();
      return res.status(400).json({ message: 'At least one item is required in the purchase invoice' });
    }

    // Validate items and calculate subtotal
    let subtotal = 0;
    const itemsToCreate = [];

    for (const item of items) {
      if (!item.productId) {
        await transaction.rollback();
        return res.status(400).json({ message: 'productId is required for every line item' });
      }

      const qty = parseFloat(item.quantity);
      const unitCost = parseFloat(item.unitCost);

      if (isNaN(qty) || qty <= 0) {
        await transaction.rollback();
        return res.status(400).json({ message: `Invalid quantity for product ${item.productId}` });
      }

      if (isNaN(unitCost) || unitCost < 0) {
        await transaction.rollback();
        return res.status(400).json({ message: `Invalid unitCost for product ${item.productId}` });
      }

      const lineTotal = parseFloat((qty * unitCost).toFixed(2));
      subtotal += lineTotal;

      itemsToCreate.push({
        productId: item.productId,
        quantity: qty,
        unitCost: unitCost,
        totalCost: lineTotal,
        newSellingPrice: item.newSellingPrice ? parseFloat(item.newSellingPrice) : null,
        expiryDate: item.expiryDate ? new Date(item.expiryDate) : null,
        batchNumber: item.batchNumber ? String(item.batchNumber).trim() : null
      });
    }

    const parsedTax = parseFloat(taxAmount) || 0;
    const parsedDiscount = parseFloat(discountAmount) || 0;
    const totalAmount = parseFloat((subtotal + parsedTax - parsedDiscount).toFixed(2));
    const parsedPaid = parseFloat(paidAmount) || 0;
    const remainingAmount = parseFloat(Math.max(0, totalAmount - parsedPaid).toFixed(2));

    let paymentStatus = 'unpaid';
    if (parsedPaid >= totalAmount && totalAmount > 0) {
      paymentStatus = 'paid';
    } else if (parsedPaid > 0) {
      paymentStatus = 'partially_paid';
    }

    const invoiceNumber = generatePurchaseNumber();

    const invoice = await PurchaseInvoice.create({
      invoiceNumber,
      supplierInvoiceNumber: supplierInvoiceNumber ? supplierInvoiceNumber.trim() : null,
      supplierId: supplier.id,
      branchId: branchId || req.user.branchId || null,
      warehouseId: warehouseId || req.user.warehouseId || null,
      invoiceDate: invoiceDate ? new Date(invoiceDate) : new Date(),
      dueDate: dueDate ? new Date(dueDate) : null,
      status: 'draft',
      subtotal: parseFloat(subtotal.toFixed(2)),
      taxAmount: parsedTax,
      discountAmount: parsedDiscount,
      totalAmount,
      paidAmount: parsedPaid,
      remainingAmount,
      paymentStatus,
      notes: notes ? notes.trim() : null
    }, { transaction });

    for (const line of itemsToCreate) {
      line.purchaseInvoiceId = invoice.id;
      await PurchaseInvoiceItem.create(line, { transaction });
    }

    await logAuditEvent({
      req,
      action: 'PURCHASE_CREATE',
      entityType: 'PurchaseInvoice',
      entityId: invoice.id,
      transaction,
      newValues: {
        invoiceNumber: invoice.invoiceNumber,
        supplierName: supplier.name,
        totalAmount
      }
    });

    await transaction.commit();

    const createdWithItems = await PurchaseInvoice.findByPk(invoice.id, {
      include: [
        { model: Supplier, as: 'supplier' },
        { model: PurchaseInvoiceItem, as: 'items', include: [{ model: Product, as: 'product' }] }
      ]
    });

    return res.status(201).json({
      success: true,
      message: 'Purchase invoice draft created successfully',
      invoice: createdWithItems
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error creating purchase invoice:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Receive purchase invoice (Receiving & Stock Update)
router.post('/:id/receive', auth, allowRoles(ROLES.ADMIN, ROLES.STOCK_KEEPER, ROLES.BRANCH_MANAGER), async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const invoice = await PurchaseInvoice.findByPk(req.params.id, {
      include: [
        { model: Supplier, as: 'supplier' },
        { model: PurchaseInvoiceItem, as: 'items', include: [{ model: Product, as: 'product' }] }
      ],
      transaction
    });

    if (!invoice) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Purchase invoice not found' });
    }

    if (invoice.status === 'received') {
      await transaction.rollback();
      return res.status(400).json({ message: 'Purchase invoice has already been received' });
    }

    if (invoice.status === 'cancelled') {
      await transaction.rollback();
      return res.status(400).json({ message: 'Cannot receive a cancelled purchase invoice' });
    }

    const targetBranchId = invoice.branchId || req.user.branchId || null;
    const targetWarehouseId = invoice.warehouseId || req.user.warehouseId || null;

    if (!targetBranchId && !targetWarehouseId) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Purchase invoice must have either branchId or warehouseId to receive items into' });
    }

    // 1. Process items: increment stock & update product cost/prices
    for (const item of invoice.items) {
      const invWhere = { productId: item.productId };
      if (targetBranchId) invWhere.branchId = targetBranchId;
      if (targetWarehouseId) invWhere.warehouseId = targetWarehouseId;

      let inv = await Inventory.findOne({ where: invWhere, transaction });
      const qtyToAdd = parseFloat(item.quantity);

      if (inv) {
        const newQty = parseFloat(inv.quantity) + qtyToAdd;
        await inv.update({ quantity: newQty }, { transaction });
      } else {
        await Inventory.create({
          productId: item.productId,
          branchId: targetBranchId,
          warehouseId: targetWarehouseId,
          quantity: qtyToAdd
        }, { transaction });
      }

      // Update product cost price (and optional new retail selling price)
      if (item.product) {
        const updateFields = { cost: item.unitCost };
        if (item.newSellingPrice && parseFloat(item.newSellingPrice) > 0) {
          updateFields.price = parseFloat(item.newSellingPrice);
        }
        await item.product.update(updateFields, { transaction });
      }
    }

    // 2. Update supplier balance (unpaid amount increases debt owed)
    const netDebtIncrease = parseFloat(invoice.totalAmount) - parseFloat(invoice.paidAmount);
    if (netDebtIncrease > 0 && invoice.supplier) {
      const currentSupBalance = parseFloat(invoice.supplier.currentBalance);
      await invoice.supplier.update({
        currentBalance: currentSupBalance + netDebtIncrease
      }, { transaction });
    }

    // 3. Mark invoice as received
    await invoice.update({
      status: 'received',
      receivedBy: req.user.id,
      receivedAt: new Date()
    }, { transaction });

    await logAuditEvent({
      req,
      action: 'PURCHASE_RECEIVE',
      entityType: 'PurchaseInvoice',
      entityId: invoice.id,
      transaction,
      newValues: {
        status: 'received',
        invoiceNumber: invoice.invoiceNumber,
        itemsCount: invoice.items.length,
        receivedBy: req.user.name
      }
    });

    await transaction.commit();

    return res.json({
      success: true,
      message: 'Purchase invoice received successfully and inventory updated',
      invoiceId: invoice.id,
      status: 'received'
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error receiving purchase invoice:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Cancel a draft purchase invoice
router.post('/:id/cancel', auth, allowRoles(ROLES.ADMIN, ROLES.STOCK_KEEPER), async (req, res) => {
  try {
    const invoice = await PurchaseInvoice.findByPk(req.params.id);
    if (!invoice) {
      return res.status(404).json({ message: 'Purchase invoice not found' });
    }

    if (invoice.status === 'received') {
      return res.status(400).json({ message: 'Cannot cancel an already received purchase invoice' });
    }

    await invoice.update({ status: 'cancelled' });

    await logAuditEvent({
      req,
      action: 'PURCHASE_CANCEL',
      entityType: 'PurchaseInvoice',
      entityId: invoice.id,
      newValues: { status: 'cancelled' }
    });

    return res.json({ success: true, message: 'Purchase invoice cancelled' });
  } catch (error) {
    console.error('Error cancelling purchase invoice:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

module.exports = router;
