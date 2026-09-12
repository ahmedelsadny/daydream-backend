const express = require('express');
const { 
  Expense, ExpenseCategory, Branch, User, Shift, CashTransaction, 
  sequelize, Sequelize 
} = require('../models');
const auth = require('../middleware/auth');
const { allowRoles, ROLES } = require('../middleware/roles');
const { logAuditEvent } = require('../utils/auditLogger');
const { Op } = require('sequelize');

const router = express.Router();

const DEFAULT_CATEGORIES = [
  { name: 'إيجار', description: 'إيجار المحل أو المخازن', isSystem: true },
  { name: 'كهرباء ومياه وغاز', description: 'فواتير المرافق العامة', isSystem: true },
  { name: 'رواتب ومكافآت', description: 'رواتب الموظفين والعمال والبدلات', isSystem: true },
  { name: 'أكياس ومواد تغليف', description: 'أكياس بلاستيك، استرتش، وأطباق فوم', isSystem: true },
  { name: 'بوفيه وضيافة', description: 'شاي وقهوة ومستلزمات الضيافة اليومية', isSystem: true },
  { name: 'صيانة ونظافة', description: 'أدوات نظافة، صيانة ثلاجات ومعدات', isSystem: true },
  { name: 'مشال ونقل بضائع', description: 'تكاليف الشحن والنقل والمشال', isSystem: true },
  { name: 'مصروفات نثرية وعامة', description: 'مصروفات يومية طارئة ومتنوعة', isSystem: true }
];

async function ensureDefaultCategories() {
  try {
    const count = await ExpenseCategory.count();
    if (count === 0) {
      for (const cat of DEFAULT_CATEGORIES) {
        await ExpenseCategory.create(cat);
      }
      console.log('✅ [Expenses] Seeded default supermarket expense categories');
    }
  } catch (err) {
    console.error('⚠️ [Expenses] Could not seed categories:', err.message);
  }
}

// ==================== CATEGORIES ENDPOINTS ====================

// List all expense categories (all authenticated roles)
router.get('/categories', auth, async (req, res) => {
  try {
    await ensureDefaultCategories();
    const categories = await ExpenseCategory.findAll({
      order: [['name', 'ASC']]
    });
    return res.json({ categories });
  } catch (error) {
    console.error('Error fetching expense categories:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// Create new expense category (admin, branch_manager)
router.post('/categories', auth, allowRoles(ROLES.ADMIN, ROLES.BRANCH_MANAGER), async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'name is required' });
    }

    const existing = await ExpenseCategory.findOne({ where: { name: name.trim() } });
    if (existing) {
      return res.status(400).json({ message: 'Category with this name already exists' });
    }

    const category = await ExpenseCategory.create({
      name: name.trim(),
      description: description || null,
      isSystem: false
    });

    await logAuditEvent({
      req,
      action: 'EXPENSE_CATEGORY_CREATE',
      entityType: 'ExpenseCategory',
      entityId: category.id,
      newValues: { name: category.name }
    });

    return res.status(201).json({
      message: 'Category created successfully',
      category
    });
  } catch (error) {
    console.error('Error creating expense category:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ==================== EXPENSES CRUD ENDPOINTS ====================

// Record new expense (admin, branch_manager, cashier)
router.post('/', auth, allowRoles(ROLES.ADMIN, ROLES.BRANCH_MANAGER, ROLES.CASHIER), async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const {
      categoryId,
      branchId: reqBranchId,
      amount,
      paymentMethod = 'safe',
      title,
      recipient,
      receiptNumber,
      notes,
      expenseDate
    } = req.body;

    if (!categoryId) {
      await transaction.rollback();
      return res.status(400).json({ message: 'categoryId is required' });
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      await transaction.rollback();
      return res.status(400).json({ message: 'amount must be a positive number' });
    }

    if (!title || !title.trim()) {
      await transaction.rollback();
      return res.status(400).json({ message: 'title is required' });
    }

    const category = await ExpenseCategory.findByPk(categoryId, { transaction });
    if (!category) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Expense category not found' });
    }

    const finalBranchId = req.user.role === ROLES.ADMIN ? (reqBranchId || req.user.branchId || null) : req.user.branchId;

    let shiftId = null;

    // If paid from cash drawer, verify active shift and deduct from drawer balance
    if (paymentMethod === 'cash_drawer') {
      const activeShift = await Shift.findOne({
        where: {
          cashierId: req.user.id,
          status: 'active'
        },
        transaction
      });

      if (!activeShift) {
        await transaction.rollback();
        return res.status(400).json({
          message: 'Cannot pay from cash_drawer: no active shift found for your account. Please select another payment method or open a shift.'
        });
      }

      shiftId = activeShift.id;

      // Record a CashTransaction (type: 'out') to keep shift balances consistent
      await CashTransaction.create({
        shiftId: activeShift.id,
        cashierId: req.user.id,
        branchId: activeShift.branchId,
        type: 'out',
        amount: parsedAmount,
        reason: `مصروف تشغيلي (${category.name}): ${title.trim()}`,
        notes: notes || null
      }, { transaction });

      // Update shift cash_out
      const updatedCashOut = (parseFloat(activeShift.cashOut) || 0) + parsedAmount;
      await activeShift.update({ cashOut: updatedCashOut }, { transaction });
    }

    const expense = await Expense.create({
      categoryId,
      branchId: finalBranchId,
      userId: req.user.id,
      shiftId: shiftId,
      amount: parsedAmount,
      paymentMethod,
      title: title.trim(),
      recipient: recipient || null,
      receiptNumber: receiptNumber || null,
      notes: notes || null,
      expenseDate: expenseDate ? new Date(expenseDate) : new Date()
    }, { transaction });

    await logAuditEvent({
      req,
      action: 'EXPENSE_CREATE',
      entityType: 'Expense',
      entityId: expense.id,
      newValues: {
        title: expense.title,
        amount: expense.amount,
        paymentMethod: expense.paymentMethod,
        category: category.name
      },
      transaction
    });

    await transaction.commit();

    return res.status(201).json({
      message: 'Expense recorded successfully',
      expense: {
        ...expense.toJSON(),
        category: { id: category.id, name: category.name }
      }
    });

  } catch (error) {
    await transaction.rollback();
    console.error('Error recording expense:', error);
    return res.status(500).json({
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// List expenses with filtering & pagination
router.get('/', auth, async (req, res) => {
  try {
    const {
      branchId,
      categoryId,
      paymentMethod,
      startDate,
      endDate,
      page = 1,
      limit = 50
    } = req.query;

    const whereClause = {};

    // Branch filter: cashiers and branch managers only see their branch
    if (req.user.role === ROLES.CASHIER || req.user.role === ROLES.BRANCH_MANAGER) {
      if (req.user.branchId) {
        whereClause.branchId = req.user.branchId;
      }
    } else if (branchId) {
      whereClause.branchId = branchId;
    }

    if (categoryId) {
      whereClause.categoryId = categoryId;
    }

    if (paymentMethod) {
      whereClause.paymentMethod = paymentMethod;
    }

    if (startDate || endDate) {
      whereClause.expenseDate = {};
      if (startDate) {
        whereClause.expenseDate[Op.gte] = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        whereClause.expenseDate[Op.lte] = end;
      }
    }

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, parseInt(limit) || 50);
    const offset = (pageNum - 1) * limitNum;

    const { count, rows: expenses } = await Expense.findAndCountAll({
      where: whereClause,
      include: [
        { model: ExpenseCategory, as: 'category', attributes: ['id', 'name'] },
        { model: Branch, attributes: ['id', 'name'] },
        { model: User, as: 'recorder', attributes: ['id', 'name', 'email', 'role'] }
      ],
      order: [['expenseDate', 'DESC']],
      limit: limitNum,
      offset: offset
    });

    const totalAmount = await Expense.sum('amount', { where: whereClause }) || 0;

    return res.json({
      count,
      totalAmount: parseFloat(totalAmount),
      page: pageNum,
      totalPages: Math.ceil(count / limitNum),
      expenses
    });

  } catch (error) {
    console.error('Error fetching expenses:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// Get expense summary & metrics (admin, branch_manager)
router.get('/summary', auth, allowRoles(ROLES.ADMIN, ROLES.BRANCH_MANAGER), async (req, res) => {
  try {
    const { branchId, startDate, endDate } = req.query;
    const whereClause = {};

    if (req.user.role === ROLES.BRANCH_MANAGER) {
      whereClause.branchId = req.user.branchId;
    } else if (branchId) {
      whereClause.branchId = branchId;
    }

    if (startDate || endDate) {
      whereClause.expenseDate = {};
      if (startDate) whereClause.expenseDate[Op.gte] = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        whereClause.expenseDate[Op.lte] = end;
      }
    }

    // Expenses by category
    const byCategory = await Expense.findAll({
      attributes: [
        'categoryId',
        [sequelize.col('category.name'), 'categoryName'],
        [sequelize.fn('SUM', sequelize.col('amount')), 'totalAmount'],
        [sequelize.fn('COUNT', sequelize.col('Expense.id')), 'count']
      ],
      include: [
        { model: ExpenseCategory, as: 'category', attributes: [] }
      ],
      where: whereClause,
      group: ['categoryId', 'category.name'],
      raw: true
    });

    // Expenses by payment method
    const byPaymentMethod = await Expense.findAll({
      attributes: [
        'paymentMethod',
        [sequelize.fn('SUM', sequelize.col('amount')), 'totalAmount'],
        [sequelize.fn('COUNT', sequelize.col('Expense.id')), 'count']
      ],
      where: whereClause,
      group: ['paymentMethod'],
      raw: true
    });

    const overallTotal = byCategory.reduce((sum, c) => sum + (parseFloat(c.totalAmount) || 0), 0);

    return res.json({
      overallTotal: parseFloat(overallTotal.toFixed(2)),
      byCategory: byCategory.map(c => ({
        categoryId: c.categoryId,
        categoryName: c.categoryName,
        totalAmount: parseFloat(c.totalAmount || 0),
        count: parseInt(c.count || 0),
        percentage: overallTotal > 0 ? parseFloat(((parseFloat(c.totalAmount || 0) / overallTotal) * 100).toFixed(2)) : 0
      })),
      byPaymentMethod: byPaymentMethod.map(p => ({
        paymentMethod: p.paymentMethod,
        totalAmount: parseFloat(p.totalAmount || 0),
        count: parseInt(p.count || 0)
      }))
    });

  } catch (error) {
    console.error('Error fetching expense summary:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// Update expense (admin, branch_manager)
router.put('/:id', auth, allowRoles(ROLES.ADMIN, ROLES.BRANCH_MANAGER), async (req, res) => {
  try {
    const { id } = req.params;
    const { title, recipient, receiptNumber, notes, expenseDate, categoryId } = req.body;

    const expense = await Expense.findByPk(id);
    if (!expense) {
      return res.status(404).json({ message: 'Expense not found' });
    }

    if (req.user.role === ROLES.BRANCH_MANAGER && expense.branchId !== req.user.branchId) {
      return res.status(403).json({ message: 'Cannot edit expenses for other branches' });
    }

    const oldValues = {
      title: expense.title,
      amount: expense.amount,
      categoryId: expense.categoryId
    };

    await expense.update({
      title: title ? title.trim() : expense.title,
      recipient: recipient !== undefined ? recipient : expense.recipient,
      receiptNumber: receiptNumber !== undefined ? receiptNumber : expense.receiptNumber,
      notes: notes !== undefined ? notes : expense.notes,
      expenseDate: expenseDate ? new Date(expenseDate) : expense.expenseDate,
      categoryId: categoryId || expense.categoryId
    });

    await logAuditEvent({
      req,
      action: 'EXPENSE_UPDATE',
      entityType: 'Expense',
      entityId: expense.id,
      oldValues,
      newValues: {
        title: expense.title,
        amount: expense.amount,
        categoryId: expense.categoryId
      }
    });

    return res.json({
      message: 'Expense updated successfully',
      expense
    });

  } catch (error) {
    console.error('Error updating expense:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// Delete expense (admin only)
router.delete('/:id', auth, allowRoles(ROLES.ADMIN), async (req, res) => {
  try {
    const { id } = req.params;
    const expense = await Expense.findByPk(id);
    if (!expense) {
      return res.status(404).json({ message: 'Expense not found' });
    }

    const deletedData = {
      id: expense.id,
      title: expense.title,
      amount: expense.amount,
      paymentMethod: expense.paymentMethod
    };

    await expense.destroy();

    await logAuditEvent({
      req,
      action: 'EXPENSE_DELETE',
      entityType: 'Expense',
      entityId: id,
      oldValues: deletedData
    });

    return res.json({
      message: 'Expense deleted successfully',
      deletedExpense: deletedData
    });

  } catch (error) {
    console.error('Error deleting expense:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
