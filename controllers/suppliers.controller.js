const express = require('express');
const { 
  Supplier, SupplierPayment, PurchaseInvoice, Branch, User, sequelize, Sequelize 
} = require('../models');
const auth = require('../middleware/auth');
const { allowRoles, ROLES } = require('../middleware/roles');
const { logAuditEvent } = require('../utils/auditLogger');
const { Op } = Sequelize;

const router = express.Router();

// List suppliers
router.get('/', auth, allowRoles(ROLES.ADMIN, ROLES.BRANCH_MANAGER, ROLES.STOCK_KEEPER), async (req, res) => {
  try {
    const { search, isActive, limit = 50, offset = 0 } = req.query;

    const where = {};
    if (isActive !== undefined) {
      where.isActive = isActive === 'true' || isActive === '1';
    }

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      where[Op.or] = [
        { name: { [Op.like]: term } },
        { companyName: { [Op.like]: term } },
        { contactPerson: { [Op.like]: term } },
        { phone: { [Op.like]: term } }
      ];
    }

    const { count, rows: suppliers } = await Supplier.findAndCountAll({
      where,
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
      order: [['name', 'ASC']]
    });

    return res.json({
      success: true,
      total: count,
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
      suppliers
    });
  } catch (error) {
    console.error('Error fetching suppliers:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Get single supplier
router.get('/:id', auth, allowRoles(ROLES.ADMIN, ROLES.BRANCH_MANAGER, ROLES.STOCK_KEEPER), async (req, res) => {
  try {
    const supplier = await Supplier.findByPk(req.params.id, {
      include: [
        {
          model: PurchaseInvoice,
          limit: 5,
          order: [['invoiceDate', 'DESC']]
        },
        {
          model: SupplierPayment,
          as: 'payments',
          limit: 5,
          order: [['paymentDate', 'DESC']]
        }
      ]
    });

    if (!supplier) {
      return res.status(404).json({ message: 'Supplier not found' });
    }

    return res.json({ success: true, supplier });
  } catch (error) {
    console.error('Error fetching supplier:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Create supplier
router.post('/', auth, allowRoles(ROLES.ADMIN, ROLES.STOCK_KEEPER), async (req, res) => {
  try {
    const {
      name, companyName, contactPerson, phone, email,
      taxNumber, address, paymentTerms, initialBalance = 0, notes
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Supplier name is required' });
    }

    const supplier = await Supplier.create({
      name: name.trim(),
      companyName: companyName ? companyName.trim() : null,
      contactPerson: contactPerson ? contactPerson.trim() : null,
      phone: phone ? phone.trim() : null,
      email: email ? email.trim().toLowerCase() : null,
      taxNumber: taxNumber ? taxNumber.trim() : null,
      address: address ? address.trim() : null,
      paymentTerms: paymentTerms || 'cash',
      currentBalance: parseFloat(initialBalance) || 0.00,
      notes: notes ? notes.trim() : null
    });

    await logAuditEvent({
      req,
      action: 'SUPPLIER_CREATE',
      entityType: 'Supplier',
      entityId: supplier.id,
      newValues: { name: supplier.name, currentBalance: supplier.currentBalance }
    });

    return res.status(201).json({
      success: true,
      message: 'Supplier created successfully',
      supplier
    });
  } catch (error) {
    console.error('Error creating supplier:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Update supplier
router.put('/:id', auth, allowRoles(ROLES.ADMIN, ROLES.STOCK_KEEPER), async (req, res) => {
  try {
    const supplier = await Supplier.findByPk(req.params.id);
    if (!supplier) {
      return res.status(404).json({ message: 'Supplier not found' });
    }

    const {
      name, companyName, contactPerson, phone, email,
      taxNumber, address, paymentTerms, notes, isActive
    } = req.body;

    const oldValues = {
      name: supplier.name,
      phone: supplier.phone,
      paymentTerms: supplier.paymentTerms,
      isActive: supplier.isActive
    };

    await supplier.update({
      name: name !== undefined ? name.trim() : supplier.name,
      companyName: companyName !== undefined ? companyName.trim() : supplier.companyName,
      contactPerson: contactPerson !== undefined ? contactPerson.trim() : supplier.contactPerson,
      phone: phone !== undefined ? phone.trim() : supplier.phone,
      email: email !== undefined ? (email ? email.trim().toLowerCase() : null) : supplier.email,
      taxNumber: taxNumber !== undefined ? taxNumber.trim() : supplier.taxNumber,
      address: address !== undefined ? address.trim() : supplier.address,
      paymentTerms: paymentTerms !== undefined ? paymentTerms : supplier.paymentTerms,
      notes: notes !== undefined ? notes.trim() : supplier.notes,
      isActive: isActive !== undefined ? !!isActive : supplier.isActive
    });

    await logAuditEvent({
      req,
      action: 'SUPPLIER_UPDATE',
      entityType: 'Supplier',
      entityId: supplier.id,
      oldValues,
      newValues: {
        name: supplier.name,
        phone: supplier.phone,
        paymentTerms: supplier.paymentTerms,
        isActive: supplier.isActive
      }
    });

    return res.json({
      success: true,
      message: 'Supplier updated successfully',
      supplier
    });
  } catch (error) {
    console.error('Error updating supplier:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Record a payment to supplier (disbursement)
router.post('/:id/payments', auth, allowRoles(ROLES.ADMIN, ROLES.BRANCH_MANAGER), async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const supplier = await Supplier.findByPk(req.params.id, { transaction });
    if (!supplier) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Supplier not found' });
    }

    const { amount, paymentMethod = 'cash', referenceNumber, paymentDate, notes, branchId } = req.body;

    const payAmount = parseFloat(amount);
    if (!payAmount || payAmount <= 0) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Valid positive amount is required' });
    }

    const targetBranchId = branchId || req.user.branchId || null;

    const payment = await SupplierPayment.create({
      supplierId: supplier.id,
      branchId: targetBranchId,
      amount: payAmount,
      paymentMethod,
      referenceNumber: referenceNumber ? referenceNumber.trim() : null,
      paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
      notes: notes ? notes.trim() : null,
      recordedBy: req.user.id
    }, { transaction });

    // Decrement supplier balance (debt owed is reduced)
    const oldBalance = parseFloat(supplier.currentBalance);
    const newBalance = oldBalance - payAmount;
    await supplier.update({ currentBalance: newBalance }, { transaction });

    await logAuditEvent({
      req,
      action: 'SUPPLIER_PAYMENT',
      entityType: 'Supplier',
      entityId: supplier.id,
      transaction,
      oldValues: { balance: oldBalance },
      newValues: {
        paymentId: payment.id,
        amountPaid: payAmount,
        newBalance,
        paymentMethod
      }
    });

    await transaction.commit();

    return res.status(201).json({
      success: true,
      message: 'Supplier payment recorded successfully',
      payment,
      newBalance
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error recording supplier payment:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Supplier Statement of Account / Ledger
router.get('/:id/ledger', auth, allowRoles(ROLES.ADMIN, ROLES.BRANCH_MANAGER, ROLES.STOCK_KEEPER), async (req, res) => {
  try {
    const supplier = await Supplier.findByPk(req.params.id);
    if (!supplier) {
      return res.status(404).json({ message: 'Supplier not found' });
    }

    const { startDate, endDate } = req.query;
    const dateFilter = {};
    if (startDate || endDate) {
      if (startDate) dateFilter[Op.gte] = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateFilter[Op.lte] = end;
      }
    }

    const invoiceWhere = {
      supplierId: supplier.id,
      status: { [Op.ne]: 'cancelled' }
    };
    if (startDate || endDate) invoiceWhere.invoiceDate = dateFilter;

    const paymentWhere = { supplierId: supplier.id };
    if (startDate || endDate) paymentWhere.paymentDate = dateFilter;

    const [invoices, payments] = await Promise.all([
      PurchaseInvoice.findAll({
        where: invoiceWhere,
        attributes: ['id', 'invoiceNumber', 'supplierInvoiceNumber', 'invoiceDate', 'totalAmount', 'status', 'notes'],
        order: [['invoiceDate', 'ASC']]
      }),
      SupplierPayment.findAll({
        where: paymentWhere,
        attributes: ['id', 'amount', 'paymentMethod', 'referenceNumber', 'paymentDate', 'notes'],
        order: [['paymentDate', 'ASC']]
      })
    ]);

    // Merge into chronological ledger
    const entries = [];
    invoices.forEach(inv => {
      entries.push({
        id: inv.id,
        date: inv.invoiceDate,
        type: 'INVOICE',
        reference: inv.invoiceNumber,
        supplierRef: inv.supplierInvoiceNumber,
        description: `فاتورة مشتريات #${inv.invoiceNumber}` + (inv.notes ? ` - ${inv.notes}` : ''),
        credit: parseFloat(inv.totalAmount), // Added to debt owed to supplier
        debit: 0.00
      });
    });

    payments.forEach(pay => {
      entries.push({
        id: pay.id,
        date: pay.paymentDate,
        type: 'PAYMENT',
        reference: pay.referenceNumber || `PAY-${pay.id.substring(0, 8)}`,
        description: `سداد دفعة للمورد (${pay.paymentMethod})` + (pay.notes ? ` - ${pay.notes}` : ''),
        credit: 0.00,
        debit: parseFloat(pay.amount) // Deducted from debt owed
      });
    });

    entries.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Calculate running balance
    let runningBalance = 0;
    const ledgerWithBalance = entries.map(entry => {
      runningBalance += (entry.credit - entry.debit);
      return {
        ...entry,
        runningBalance: parseFloat(runningBalance.toFixed(2))
      };
    });

    const totalCredit = entries.reduce((sum, e) => sum + e.credit, 0);
    const totalDebit = entries.reduce((sum, e) => sum + e.debit, 0);

    return res.json({
      success: true,
      supplier: {
        id: supplier.id,
        name: supplier.name,
        companyName: supplier.companyName,
        phone: supplier.phone,
        currentBalance: parseFloat(supplier.currentBalance)
      },
      summary: {
        totalInvoiced: parseFloat(totalCredit.toFixed(2)),
        totalPaid: parseFloat(totalDebit.toFixed(2)),
        netBalance: parseFloat(runningBalance.toFixed(2))
      },
      ledger: ledgerWithBalance
    });
  } catch (error) {
    console.error('Error generating supplier ledger:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

module.exports = router;
