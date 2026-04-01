const express = require('express');
const { Shift, User, Branch, Order, OrderItem, Product, Refund, Replacement, sequelize, Sequelize } = require('../models');
const auth = require('../middleware/auth');
const { allowRoles, ROLES } = require('../middleware/roles');
const { Op } = require('sequelize');

const router = express.Router();

// Start a new shift (cashier, branch_manager)
router.post('/start', auth, allowRoles(ROLES.CASHIER, ROLES.BRANCH_MANAGER), async (req, res) => {
  try {
    // Ensure user has a branch assigned
    if (!req.user.branchId) {
      return res.status(403).json({
        message: 'User is not assigned to any branch'
      });
    }

    // Check if cashier already has an active shift
    const activeShift = await Shift.findOne({
      where: {
        cashierId: req.user.id,
        status: 'active'
      }
    });

    if (activeShift) {
      return res.status(400).json({
        message: 'You already have an active shift. Please end your current shift before starting a new one.',
        activeShift: {
          id: activeShift.id,
          startTime: activeShift.startTime
        }
      });
    }

    // Create new shift
    const shift = await Shift.create({
      cashierId: req.user.id,
      branchId: req.user.branchId,
      startTime: new Date(),
      status: 'active'
    });

    // Get user and branch details for response
    const user = await User.findByPk(req.user.id, {
      attributes: ['id', 'name', 'email']
    });
    const branch = await Branch.findByPk(req.user.branchId, {
      attributes: ['id', 'name', 'location']
    });

    return res.status(201).json({
      message: 'Shift started successfully',
      shift: {
        id: shift.id,
        cashier: {
          id: user.id,
          name: user.name,
          email: user.email
        },
        branch: {
          id: branch.id,
          name: branch.name,
          location: branch.location
        },
        startTime: shift.startTime,
        status: shift.status
      }
    });

  } catch (error) {
    console.error('Error starting shift:', error);
    return res.status(500).json({
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// End current shift (cashier, branch_manager)
router.post('/end', auth, allowRoles(ROLES.CASHIER, ROLES.BRANCH_MANAGER), async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    // Find active shift for this cashier
    const shift = await Shift.findOne({
      where: {
        cashierId: req.user.id,
        status: 'active'
      },
      transaction
    });

    if (!shift) {
      await transaction.rollback();
      return res.status(404).json({
        message: 'No active shift found. Please start a shift first.'
      });
    }

    // Calculate shift statistics
    const orders = await Order.findAll({
      where: {
        cashierId: req.user.id,
        branchId: req.user.branchId,
        status: 'completed',
        createdAt: {
          [Op.gte]: shift.startTime,
          [Op.lte]: new Date()
        }
      },
      include: [
        {
          model: OrderItem,
          include: [
            {
              model: Product,
              attributes: ['id', 'name', 'sku', 'price']
            }
          ]
        }
      ],
      transaction
    });

    // Get refunds processed during this shift with product details
    const refunds = await Refund.findAll({
      where: {
        branchId: req.user.branchId,
        status: 'approved',
        createdAt: {
          [Op.gte]: shift.startTime,
          [Op.lte]: new Date()
        }
      },
      include: [
        {
          model: OrderItem,
          include: [
            {
              model: Product,
              attributes: ['id', 'name', 'sku', 'price']
            }
          ]
        }
      ],
      transaction
    });

    // Get replacements processed during this shift with product details
    const replacements = await Replacement.findAll({
      where: {
        branchId: req.user.branchId,
        status: 'completed',
        createdAt: {
          [Op.gte]: shift.startTime,
          [Op.lte]: new Date()
        }
      },
      include: [
        {
          model: OrderItem,
          as: 'originalOrderItem',
          include: [
            {
              model: Product,
              attributes: ['id', 'name', 'sku', 'price']
            }
          ]
        }
      ],
      transaction
    });

    // Calculate totals
    let totalSales = 0;
    let totalSubtotal = 0;
    let totalDiscounts = 0;
    let cashSales = 0;
    let visaSales = 0;
    let totalRefunds = 0;
    let refundSubtotal = 0;
    let refundDiscounts = 0;
    let totalReplacements = 0;
    let replacementSubtotal = 0;
    let replacementDiscounts = 0;
    let totalReplacementRefunds = 0;
    let totalReplacementPayments = 0;
    const productsSoldMap = new Map();

    orders.forEach(order => {
      // Track subtotal and discounts for sales
      const orderSubtotal = parseFloat(order.subtotal || order.totalPrice);
      const orderDiscount = parseFloat(order.discountAmount || 0);
      
      totalSubtotal += orderSubtotal;
      totalDiscounts += orderDiscount;
      totalSales += parseFloat(order.totalPrice);
      
      // Calculate cash and visa sales
      if (order.cashAmount) {
        cashSales += parseFloat(order.cashAmount);
      }
      if (order.visaAmount) {
        visaSales += parseFloat(order.visaAmount);
      }

      // Aggregate products sold
      order.OrderItems.forEach(item => {
        const productId = item.productId;
        const productName = item.Product.name;
        const sku = item.Product.sku;
        const quantity = item.quantity;
        const unitPrice = parseFloat(item.Product.price);
        const itemTotal = unitPrice * quantity;

        if (productsSoldMap.has(productId)) {
          const existing = productsSoldMap.get(productId);
          existing.quantity += quantity;
          existing.totalPrice += itemTotal;
        } else {
          productsSoldMap.set(productId, {
            productId,
            productName,
            sku,
            quantity,
            unitPrice,
            totalPrice: itemTotal
          });
        }
      });
    });

    // Calculate refund totals and aggregate refunded products
    const productsRefundedMap = new Map();
    refunds.forEach(refund => {
      // Track refund subtotal and discounts
      const refundSubtotalAmount = parseFloat(refund.originalAmount || refund.refundAmount);
      const refundDiscountAmount = parseFloat(refund.discountAmount || 0);
      
      refundSubtotal += refundSubtotalAmount;
      refundDiscounts += refundDiscountAmount;
      totalRefunds += parseFloat(refund.refundAmount);
      
      // Aggregate refunded products
      if (refund.OrderItem && refund.OrderItem.Product) {
        const productId = refund.OrderItem.productId;
        const productName = refund.OrderItem.Product.name;
        const sku = refund.OrderItem.Product.sku;
        const quantity = refund.quantity;
        const refundAmount = parseFloat(refund.refundAmount);

        if (productsRefundedMap.has(productId)) {
          const existing = productsRefundedMap.get(productId);
          existing.quantity += quantity;
          existing.refundAmount += refundAmount;
        } else {
          productsRefundedMap.set(productId, {
            productId,
            productName,
            sku,
            quantity,
            refundAmount
          });
        }
      }
    });

    // Calculate replacement totals and aggregate replaced products
    const productsReplacedMap = new Map();
    replacements.forEach(replacement => {
      // Track replacement subtotal and discounts
      const replacementSubtotalAmount = parseFloat(replacement.originalAmount || (parseFloat(replacement.returnedAmount) + parseFloat(replacement.newItemsAmount)));
      const replacementDiscountAmount = parseFloat(replacement.discountAmount || 0);
      
      replacementSubtotal += replacementSubtotalAmount;
      replacementDiscounts += replacementDiscountAmount;
      totalReplacements += parseFloat(replacement.returnedAmount) + parseFloat(replacement.newItemsAmount);
      totalReplacementRefunds += parseFloat(replacement.refundToCustomer);
      totalReplacementPayments += parseFloat(replacement.customerPayment);
      
      // Aggregate replaced products
      if (replacement.originalOrderItem && replacement.originalOrderItem.Product) {
        const productId = replacement.originalOrderItem.productId;
        const productName = replacement.originalOrderItem.Product.name;
        const sku = replacement.originalOrderItem.Product.sku;
        const returnedAmount = parseFloat(replacement.returnedAmount);
        const newItemsAmount = parseFloat(replacement.newItemsAmount);
        const priceDifference = parseFloat(replacement.priceDifference);

        if (productsReplacedMap.has(productId)) {
          const existing = productsReplacedMap.get(productId);
          existing.returnedAmount += returnedAmount;
          existing.newItemsAmount += newItemsAmount;
          existing.priceDifference += priceDifference;
        } else {
          productsReplacedMap.set(productId, {
            productId,
            productName,
            sku,
            returnedAmount,
            newItemsAmount,
            priceDifference
          });
        }
      }
    });

    const productsSold = Array.from(productsSoldMap.values());
    const productsRefunded = Array.from(productsRefundedMap.values());
    const productsReplaced = Array.from(productsReplacedMap.values());
    const netSales = totalSales - totalRefunds;

    // Update shift with end time and statistics
    await shift.update({
      endTime: new Date(),
      status: 'completed',
      totalSales: totalSales,
      totalSubtotal: totalSubtotal,
      totalDiscounts: totalDiscounts,
      totalOrders: orders.length,
      cashSales: cashSales,
      visaSales: visaSales,
      totalRefunds: totalRefunds,
      refundSubtotal: refundSubtotal,
      refundDiscounts: refundDiscounts,
      refundCount: refunds.length,
      totalReplacements: totalReplacements,
      replacementSubtotal: replacementSubtotal,
      replacementDiscounts: replacementDiscounts,
      replacementCount: replacements.length,
      totalReplacementRefunds: totalReplacementRefunds,
      totalReplacementPayments: totalReplacementPayments,
      netSales: netSales,
      productsSold: productsSold,
      productsRefunded: productsRefunded,
      productsReplaced: productsReplaced
    }, { transaction });

    await transaction.commit();

    // Get user and branch details for response
    const user = await User.findByPk(req.user.id, {
      attributes: ['id', 'name', 'email']
    });
    const branch = await Branch.findByPk(req.user.branchId, {
      attributes: ['id', 'name', 'location']
    });

    return res.json({
      message: 'Shift ended successfully',
      shift: {
        id: shift.id,
        cashier: {
          id: user.id,
          name: user.name,
          email: user.email
        },
        branch: {
          id: branch.id,
          name: branch.name,
          location: branch.location
        },
        startTime: shift.startTime,
        endTime: shift.endTime,
        status: shift.status,
        totalSubtotal: parseFloat(shift.totalSubtotal || 0),
        totalDiscounts: parseFloat(shift.totalDiscounts || 0),
        totalSales: parseFloat(shift.totalSales),
        totalOrders: shift.totalOrders,
        cashSales: parseFloat(shift.cashSales),
        visaSales: parseFloat(shift.visaSales),
        totalRefunds: parseFloat(shift.totalRefunds),
        refundCount: shift.refundCount,
        totalReplacements: parseFloat(shift.totalReplacements),
        replacementCount: shift.replacementCount,
        totalReplacementRefunds: parseFloat(shift.totalReplacementRefunds),
        totalReplacementPayments: parseFloat(shift.totalReplacementPayments),
        netSales: parseFloat(shift.netSales),
        productsSold: shift.productsSold,
        productsRefunded: shift.productsRefunded,
        productsReplaced: shift.productsReplaced
      }
    });

  } catch (error) {
    try {
      await transaction.rollback();
    } catch (rollbackError) {
      console.error('Error rolling back transaction:', rollbackError);
    }
    console.error('Error ending shift:', error);
    return res.status(500).json({
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get current active shift for cashier (cashier, branch_manager)
router.get('/current', auth, allowRoles(ROLES.CASHIER, ROLES.BRANCH_MANAGER), async (req, res) => {
  try {
    const shift = await Shift.findOne({
      where: {
        cashierId: req.user.id,
        status: 'active'
      },
      include: [
        {
          model: User,
          as: 'cashier',
          attributes: ['id', 'name', 'email']
        },
        {
          model: Branch,
          attributes: ['id', 'name', 'location']
        }
      ]
    });

    if (!shift) {
      return res.status(200).json({
        success: false,
        message: 'No active shift found',
        data: null
      });
    }

    // Calculate real-time statistics for current shift
    const orders = await Order.findAll({
      where: {
        cashierId: req.user.id,
        branchId: req.user.branchId,
        status: 'completed',
        createdAt: {
          [Op.gte]: shift.startTime,
          [Op.lte]: new Date()
        }
      }
    });

    // Get refunds processed during current shift with product details
    const refunds = await Refund.findAll({
      where: {
        branchId: req.user.branchId,
        status: 'approved',
        createdAt: {
          [Op.gte]: shift.startTime,
          [Op.lte]: new Date()
        }
      },
      include: [
        {
          model: OrderItem,
          include: [
            {
              model: Product,
              attributes: ['id', 'name', 'sku', 'price']
            }
          ]
        }
      ]
    });

    // Get replacements processed during current shift with product details
    const replacements = await Replacement.findAll({
      where: {
        branchId: req.user.branchId,
        status: 'completed',
        createdAt: {
          [Op.gte]: shift.startTime,
          [Op.lte]: new Date()
        }
      },
      include: [
        {
          model: OrderItem,
          as: 'originalOrderItem',
          include: [
            {
              model: Product,
              attributes: ['id', 'name', 'sku', 'price']
            }
          ]
        }
      ]
    });

    let currentTotalSales = 0;
    let currentCashSales = 0;
    let currentVisaSales = 0;
    let currentTotalRefunds = 0;
    let currentTotalReplacements = 0;
    let currentTotalReplacementRefunds = 0;
    let currentTotalReplacementPayments = 0;

    orders.forEach(order => {
      currentTotalSales += parseFloat(order.totalPrice);
      if (order.cashAmount) {
        currentCashSales += parseFloat(order.cashAmount);
      }
      if (order.visaAmount) {
        currentVisaSales += parseFloat(order.visaAmount);
      }
    });

    // Calculate refunded products for current shift
    const currentProductsRefundedMap = new Map();
    refunds.forEach(refund => {
      currentTotalRefunds += parseFloat(refund.refundAmount);
      
      // Aggregate refunded products
      if (refund.OrderItem && refund.OrderItem.Product) {
        const productId = refund.OrderItem.productId;
        const productName = refund.OrderItem.Product.name;
        const sku = refund.OrderItem.Product.sku;
        const quantity = refund.quantity;
        const refundAmount = parseFloat(refund.refundAmount);

        if (currentProductsRefundedMap.has(productId)) {
          const existing = currentProductsRefundedMap.get(productId);
          existing.quantity += quantity;
          existing.refundAmount += refundAmount;
        } else {
          currentProductsRefundedMap.set(productId, {
            productId,
            productName,
            sku,
            quantity,
            refundAmount
          });
        }
      }
    });

    // Calculate replaced products for current shift
    const currentProductsReplacedMap = new Map();
    replacements.forEach(replacement => {
      currentTotalReplacements += parseFloat(replacement.returnedAmount) + parseFloat(replacement.newItemsAmount);
      currentTotalReplacementRefunds += parseFloat(replacement.refundToCustomer);
      currentTotalReplacementPayments += parseFloat(replacement.customerPayment);
      
      // Aggregate replaced products
      if (replacement.originalOrderItem && replacement.originalOrderItem.Product) {
        const productId = replacement.originalOrderItem.productId;
        const productName = replacement.originalOrderItem.Product.name;
        const sku = replacement.originalOrderItem.Product.sku;
        const returnedAmount = parseFloat(replacement.returnedAmount);
        const newItemsAmount = parseFloat(replacement.newItemsAmount);
        const priceDifference = parseFloat(replacement.priceDifference);

        if (currentProductsReplacedMap.has(productId)) {
          const existing = currentProductsReplacedMap.get(productId);
          existing.returnedAmount += returnedAmount;
          existing.newItemsAmount += newItemsAmount;
          existing.priceDifference += priceDifference;
        } else {
          currentProductsReplacedMap.set(productId, {
            productId,
            productName,
            sku,
            returnedAmount,
            newItemsAmount,
            priceDifference
          });
        }
      }
    });

    const currentProductsRefunded = Array.from(currentProductsRefundedMap.values());
    const currentProductsReplaced = Array.from(currentProductsReplacedMap.values());
    const currentNetSales = currentTotalSales - currentTotalRefunds;

    // Calculate total discounts for current shift
    let totalDiscounts = 0;
    orders.forEach(order => {
      if (order.discountAmount) {
        totalDiscounts += parseFloat(order.discountAmount);
      }
    });

    return res.json({
      success: true,
      data: {
        id: shift.id,
        cashier: {
          id: shift.cashier.id,
          name: shift.cashier.name,
          email: shift.cashier.email
        },
        branch: {
          id: shift.Branch.id,
          name: shift.Branch.name,
          location: shift.Branch.location
        },
        startTime: shift.startTime,
        status: shift.status,
        currentTotalSubtotal: parseFloat(currentTotalSales + currentTotalRefunds) || 0,
        currentTotalDiscounts: parseFloat(totalDiscounts) || 0,
        currentTotalSales: parseFloat(currentTotalSales) || 0,
        currentTotalOrders: orders.length,
        currentCashSales: parseFloat(currentCashSales) || 0,
        currentVisaSales: parseFloat(currentVisaSales) || 0,
        currentTotalRefunds: parseFloat(currentTotalRefunds) || 0,
        currentRefundCount: refunds.length,
        currentTotalReplacements: parseFloat(currentTotalReplacements) || 0,
        currentReplacementCount: replacements.length,
        currentTotalReplacementRefunds: parseFloat(currentTotalReplacementRefunds) || 0,
        currentTotalReplacementPayments: parseFloat(currentTotalReplacementPayments) || 0,
        currentNetSales: parseFloat(currentNetSales) || 0,
        currentProductsRefunded: currentProductsRefunded,
        currentProductsReplaced: currentProductsReplaced
      }
    });

  } catch (error) {
    console.error('Error fetching current shift:', error);
    return res.status(500).json({
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get all shifts (admin)
router.get('/', auth, allowRoles(ROLES.ADMIN), async (req, res) => {
  try {
    const {
      cashierId,
      branchId,
      status,
      startDate,
      endDate,
      page = 1,
      limit = 1000
    } = req.query;

    // Build where conditions
    const whereConditions = {};

    if (cashierId) {
      whereConditions.cashierId = cashierId;
    }

    if (branchId) {
      whereConditions.branchId = branchId;
    }

    if (status) {
      whereConditions.status = status;
    }

    // Date filtering
    if (startDate || endDate) {
      whereConditions.startTime = {};
      if (startDate) {
        whereConditions.startTime[Op.gte] = new Date(startDate);
      }
      if (endDate) {
        whereConditions.startTime[Op.lte] = new Date(endDate);
      }
    }

    // Pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Get shifts with related data
    const { count, rows: shifts } = await Shift.findAndCountAll({
      where: whereConditions,
      include: [
        {
          model: User,
          as: 'cashier',
          attributes: ['id', 'name', 'email', 'role']
        },
        {
          model: Branch,
          attributes: ['id', 'name', 'location']
        }
      ],
      order: [['startTime', 'DESC']],
      limit: parseInt(limit),
      offset: offset
    });

    // Format the response
    const formattedShifts = shifts.map(shift => ({
      id: shift.id,
      cashier: {
        id: shift.cashier.id,
        name: shift.cashier.name,
        email: shift.cashier.email,
        role: shift.cashier.role
      },
      branch: {
        id: shift.Branch.id,
        name: shift.Branch.name,
        location: shift.Branch.location
      },
      startTime: shift.startTime,
      endTime: shift.endTime,
      status: shift.status,
      totalSales: shift.totalSales ? parseFloat(shift.totalSales) : 0,
      totalSubtotal: shift.totalSubtotal ? parseFloat(shift.totalSubtotal) : 0,
      totalDiscounts: shift.totalDiscounts ? parseFloat(shift.totalDiscounts) : 0,
      totalOrders: shift.totalOrders || 0,
      cashSales: shift.cashSales ? parseFloat(shift.cashSales) : 0,
      visaSales: shift.visaSales ? parseFloat(shift.visaSales) : 0,
      totalRefunds: shift.totalRefunds ? parseFloat(shift.totalRefunds) : 0,
      refundSubtotal: shift.refundSubtotal ? parseFloat(shift.refundSubtotal) : 0,
      refundDiscounts: shift.refundDiscounts ? parseFloat(shift.refundDiscounts) : 0,
      refundCount: shift.refundCount || 0,
      totalReplacements: shift.totalReplacements ? parseFloat(shift.totalReplacements) : 0,
      replacementSubtotal: shift.replacementSubtotal ? parseFloat(shift.replacementSubtotal) : 0,
      replacementDiscounts: shift.replacementDiscounts ? parseFloat(shift.replacementDiscounts) : 0,
      replacementCount: shift.replacementCount || 0,
      totalReplacementRefunds: shift.totalReplacementRefunds ? parseFloat(shift.totalReplacementRefunds) : 0,
      totalReplacementPayments: shift.totalReplacementPayments ? parseFloat(shift.totalReplacementPayments) : 0,
      netSales: shift.netSales ? parseFloat(shift.netSales) : 0,
      productsSold: shift.productsSold || [],
      productsRefunded: shift.productsRefunded || [],
      productsReplaced: shift.productsReplaced || [],
      createdAt: shift.createdAt,
      updatedAt: shift.updatedAt
    }));

    return res.json({
      shifts: formattedShifts,
      pagination: {
        totalCount: count,
        currentPage: parseInt(page),
        totalPages: Math.ceil(count / parseInt(limit)),
        limit: parseInt(limit)
      },
      filters: {
        cashierId,
        branchId,
        status,
        startDate,
        endDate
      }
    });

  } catch (error) {
    console.error('Error fetching shifts:', error);
    return res.status(500).json({
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get shift by ID (admin)
router.get('/:id', auth, allowRoles(ROLES.ADMIN), async (req, res) => {
  try {
    const { id } = req.params;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return res.status(400).json({
        message: 'Invalid shift ID format. Must be a valid UUID.'
      });
    }

    // Get shift with related data
    const shift = await Shift.findByPk(id, {
      include: [
        {
          model: User,
          as: 'cashier',
          attributes: ['id', 'name', 'email', 'role']
        },
        {
          model: Branch,
          attributes: ['id', 'name', 'location']
        }
      ]
    });

    if (!shift) {
      return res.status(404).json({
        message: 'Shift not found'
      });
    }

    // Get orders for this shift
    const orders = await Order.findAll({
      where: {
        cashierId: shift.cashierId,
        branchId: shift.branchId,
        status: 'completed',
        createdAt: {
          [Op.gte]: shift.startTime,
          [Op.lte]: shift.endTime || new Date()
        }
      },
      attributes: ['id', 'totalPrice', 'paymentMethod', 'createdAt'],
      order: [['createdAt', 'ASC']]
    });

    // Format the response
    const formattedShift = {
      id: shift.id,
      cashier: {
        id: shift.cashier.id,
        name: shift.cashier.name,
        email: shift.cashier.email,
        role: shift.cashier.role
      },
      branch: {
        id: shift.Branch.id,
        name: shift.Branch.name,
        location: shift.Branch.location
      },
      startTime: shift.startTime,
      endTime: shift.endTime,
      status: shift.status,
      totalSales: shift.totalSales ? parseFloat(shift.totalSales) : 0,
      totalOrders: shift.totalOrders || 0,
      cashSales: shift.cashSales ? parseFloat(shift.cashSales) : 0,
      visaSales: shift.visaSales ? parseFloat(shift.visaSales) : 0,
      totalRefunds: shift.totalRefunds ? parseFloat(shift.totalRefunds) : 0,
      refundSubtotal: shift.refundSubtotal ? parseFloat(shift.refundSubtotal) : 0,
      refundDiscounts: shift.refundDiscounts ? parseFloat(shift.refundDiscounts) : 0,
      refundCount: shift.refundCount || 0,
      totalReplacements: shift.totalReplacements ? parseFloat(shift.totalReplacements) : 0,
      replacementSubtotal: shift.replacementSubtotal ? parseFloat(shift.replacementSubtotal) : 0,
      replacementDiscounts: shift.replacementDiscounts ? parseFloat(shift.replacementDiscounts) : 0,
      replacementCount: shift.replacementCount || 0,
      totalReplacementRefunds: shift.totalReplacementRefunds ? parseFloat(shift.totalReplacementRefunds) : 0,
      totalReplacementPayments: shift.totalReplacementPayments ? parseFloat(shift.totalReplacementPayments) : 0,
      netSales: shift.netSales ? parseFloat(shift.netSales) : 0,
      productsSold: shift.productsSold || [],
      productsRefunded: shift.productsRefunded || [],
      productsReplaced: shift.productsReplaced || [],
      orders: orders.map(order => ({
        id: order.id,
        orderNumber: `ORD-${order.id.substring(0, 8).toUpperCase()}`,
        totalPrice: parseFloat(order.totalPrice),
        paymentMethod: order.paymentMethod,
        createdAt: order.createdAt
      })),
      createdAt: shift.createdAt,
      updatedAt: shift.updatedAt
    };

    return res.json({
      shift: formattedShift
    });

  } catch (error) {
    console.error('Error fetching shift:', error);
    return res.status(500).json({
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;
