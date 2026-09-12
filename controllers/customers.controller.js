const express = require('express');
const { Customer, CustomerCreditTransaction, Order, User, Branch, sequelize, Sequelize } = require('../models');
const auth = require('../middleware/auth');
const { allowRoles, ROLES } = require('../middleware/roles');
const { logAuditEvent } = require('../utils/auditLogger');
const { Op } = Sequelize;

const router = express.Router();

// Create customer (admin, branch_manager, cashier)
router.post('/', auth, allowRoles(ROLES.ADMIN, ROLES.BRANCH_MANAGER, ROLES.CASHIER), async (req, res) => {
  try {
    const { name, phone, address, creditLimit = 0, isCreditAllowed = false, notes } = req.body || {};

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
      phone: phone.trim(),
      address: address ? address.trim() : null,
      creditLimit: parseFloat(creditLimit) || 0.00,
      currentDebt: 0.00,
      isCreditAllowed: !!isCreditAllowed,
      notes: notes ? notes.trim() : null
    });

    return res.status(201).json({
      success: true,
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        address: customer.address,
        creditLimit: parseFloat(customer.creditLimit),
        currentDebt: parseFloat(customer.currentDebt),
        isCreditAllowed: customer.isCreditAllowed,
        loyaltyPoints: customer.loyaltyPoints,
        createdAt: customer.createdAt,
        updatedAt: customer.updatedAt
      },
      message: 'Customer created successfully'
    });
  } catch (err) {
    console.error('Error creating customer:', err);
    return res.status(500).json({ message: 'Internal server error', error: err.message });
  }
});

// List all debtors (customers with positive outstanding debt)
router.get('/debtors', auth, allowRoles(ROLES.ADMIN, ROLES.BRANCH_MANAGER, ROLES.CASHIER), async (req, res) => {
  try {
    const debtors = await Customer.findAll({
      where: {
        currentDebt: { [Op.gt]: 0 }
      },
      order: [['currentDebt', 'DESC']]
    });

    const totalOutstandingDebt = debtors.reduce((sum, c) => sum + parseFloat(c.currentDebt || 0), 0);

    return res.json({
      success: true,
      totalDebtors: debtors.length,
      totalOutstandingDebt: parseFloat(totalOutstandingDebt.toFixed(2)),
      debtors: debtors.map(c => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        currentDebt: parseFloat(c.currentDebt),
        creditLimit: parseFloat(c.creditLimit),
        isCreditAllowed: c.isCreditAllowed,
        address: c.address
      }))
    });
  } catch (err) {
    console.error('Error fetching debtors:', err);
    return res.status(500).json({ message: 'Internal server error', error: err.message });
  }
});

// List customers (admin, branch_manager, cashier)
router.get('/', auth, allowRoles(ROLES.ADMIN, ROLES.BRANCH_MANAGER, ROLES.CASHIER), async (req, res) => {
  try {
    const { search, limit = 50, offset = 0 } = req.query;

    const where = {};
    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      where[Op.or] = [
        { name: { [Op.like]: term } },
        { phone: { [Op.like]: term } }
      ];
    }

    const { count, rows: customers } = await Customer.findAndCountAll({
      where,
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
      order: [['createdAt', 'DESC']]
    });

    return res.json({
      success: true,
      total: count,
      customers: customers.map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        address: c.address,
        creditLimit: parseFloat(c.creditLimit || 0),
        currentDebt: parseFloat(c.currentDebt || 0),
        isCreditAllowed: c.isCreditAllowed,
        loyaltyPoints: c.loyaltyPoints,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt
      }))
    });
  } catch (err) {
    console.error('Error fetching customers:', err);
    return res.status(500).json({ message: 'Internal server error', error: err.message });
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
      success: true,
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        address: customer.address,
        creditLimit: parseFloat(customer.creditLimit || 0),
        currentDebt: parseFloat(customer.currentDebt || 0),
        isCreditAllowed: customer.isCreditAllowed,
        loyaltyPoints: customer.loyaltyPoints,
        createdAt: customer.createdAt,
        updatedAt: customer.updatedAt
      }
    });
  } catch (err) {
    console.error('Error fetching customer by id:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// Configure or update credit limit and eligibility (Admin or Branch Manager)
router.post('/:id/credit-limit', auth, allowRoles(ROLES.ADMIN, ROLES.BRANCH_MANAGER), async (req, res) => {
  try {
    const { id } = req.params;
    const { creditLimit, isCreditAllowed } = req.body;

    const customer = await Customer.findByPk(id);
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    const oldLimit = parseFloat(customer.creditLimit);
    const newLimit = creditLimit !== undefined ? parseFloat(creditLimit) : oldLimit;
    const newAllowed = isCreditAllowed !== undefined ? !!isCreditAllowed : customer.isCreditAllowed;

    await customer.update({
      creditLimit: newLimit,
      isCreditAllowed: newAllowed
    });

    await logAuditEvent({
      req,
      action: 'CUSTOMER_CREDIT_LIMIT_CHANGE',
      entityType: 'Customer',
      entityId: customer.id,
      oldValues: { creditLimit: oldLimit, isCreditAllowed: customer.isCreditAllowed },
      newValues: { creditLimit: newLimit, isCreditAllowed: newAllowed }
    });

    return res.json({
      success: true,
      message: 'Customer credit terms updated successfully',
      customer: {
        id: customer.id,
        name: customer.name,
        creditLimit: newLimit,
        currentDebt: parseFloat(customer.currentDebt),
        isCreditAllowed: newAllowed
      }
    });
  } catch (err) {
    console.error('Error setting credit limit:', err);
    return res.status(500).json({ message: 'Internal server error', error: err.message });
  }
});

// Record customer debt repayment (سداد جزء أو كل الشكك)
router.post('/:id/pay-debt', auth, allowRoles(ROLES.ADMIN, ROLES.BRANCH_MANAGER, ROLES.CASHIER), async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { amount, paymentMethod = 'cash', notes, branchId } = req.body;

    const payAmount = parseFloat(amount);
    if (isNaN(payAmount) || payAmount <= 0) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Valid positive payment amount is required' });
    }

    const customer = await Customer.findByPk(id, { transaction });
    if (!customer) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Customer not found' });
    }

    const oldDebt = parseFloat(customer.currentDebt || 0);
    if (oldDebt <= 0) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Customer has no outstanding debt to settle' });
    }

    const newDebt = parseFloat(Math.max(0, oldDebt - payAmount).toFixed(2));
    const targetBranchId = branchId || req.user.branchId || null;

    const creditTx = await CustomerCreditTransaction.create({
      customerId: customer.id,
      orderId: null,
      type: 'credit', // Credit reduces customer debt
      amount: payAmount,
      previousDebt: oldDebt,
      newDebt: newDebt,
      paymentMethod,
      notes: notes ? notes.trim() : `سداد مديونية نقداً`,
      recordedBy: req.user.id,
      branchId: targetBranchId
    }, { transaction });

    await customer.update({ currentDebt: newDebt }, { transaction });

    await logAuditEvent({
      req,
      action: 'CUSTOMER_DEBT_PAYMENT',
      entityType: 'Customer',
      entityId: customer.id,
      transaction,
      oldValues: { debt: oldDebt },
      newValues: {
        paidAmount: payAmount,
        remainingDebt: newDebt,
        paymentMethod,
        transactionId: creditTx.id
      }
    });

    await transaction.commit();

    return res.json({
      success: true,
      message: 'Debt payment recorded successfully',
      payment: creditTx,
      previousDebt: oldDebt,
      newDebt: newDebt
    });
  } catch (err) {
    await transaction.rollback();
    console.error('Error processing debt payment:', err);
    return res.status(500).json({ message: 'Internal server error', error: err.message });
  }
});

// Get customer credit ledger / statement of account (كشف حساب الشكك)
router.get('/:id/ledger', auth, allowRoles(ROLES.ADMIN, ROLES.BRANCH_MANAGER, ROLES.CASHIER), async (req, res) => {
  try {
    const { id } = req.params;
    const customer = await Customer.findByPk(id);
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    const transactions = await CustomerCreditTransaction.findAll({
      where: { customerId: customer.id },
      order: [['createdAt', 'ASC']],
      include: [
        { model: User, as: 'recorder', attributes: ['id', 'name'] },
        { model: Order, as: 'order', attributes: ['id', 'totalPrice', 'createdAt'] }
      ]
    });

    return res.json({
      success: true,
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        creditLimit: parseFloat(customer.creditLimit),
        currentDebt: parseFloat(customer.currentDebt)
      },
      transactions: transactions.map(t => ({
        id: t.id,
        date: t.createdAt,
        type: t.type,
        amount: parseFloat(t.amount),
        previousDebt: parseFloat(t.previousDebt),
        newDebt: parseFloat(t.newDebt),
        paymentMethod: t.paymentMethod,
        notes: t.notes,
        orderId: t.orderId,
        orderRef: t.order ? `ORD-${t.order.id.substring(0, 8).toUpperCase()}` : null,
        recordedBy: t.recorder ? t.recorder.name : null
      }))
    });
  } catch (err) {
    console.error('Error fetching customer credit ledger:', err);
    return res.status(500).json({ message: 'Internal server error', error: err.message });
  }
});

module.exports = router;
