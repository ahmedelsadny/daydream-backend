const express = require('express');
const { Order, OrderItem, Product, Customer, Inventory, ProductSerial, Branch, User, CashierDiscount, sequelize, Sequelize } = require('../models');
const auth = require('../middleware/auth');
const { allowRoles, ROLES } = require('../middleware/roles');
const { Op } = require('sequelize');

const router = express.Router();

// Create new order (branch_manager, cashier)
router.post('/', auth, allowRoles(ROLES.BRANCH_MANAGER, ROLES.CASHIER), async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { customerId, paymentMethod, cashAmount, visaAmount, items, amountPaid, applyDiscount, cashierDiscountId: requestedDiscountId, discountAmount: frontendDiscountAmount } = req.body;

    console.log('🔍 Order request received:');
    console.log('  customerId:', customerId, 'Type:', typeof customerId);
    console.log('  paymentMethod:', paymentMethod);
    console.log('  items count:', items?.length);

    // Ensure user has a branch assigned
    if (!req.user.branchId) {
      await transaction.rollback();
      return res.status(403).json({
        message: 'User is not assigned to any branch'
      });
    }

    // Validate required fields
    if (!customerId) {
      await transaction.rollback();
      return res.status(400).json({ message: 'customerId is required' });
    }
    if (!paymentMethod || !['cash', 'visa', 'mixed'].includes(paymentMethod)) {
      await transaction.rollback();
      return res.status(400).json({ message: 'paymentMethod must be cash, visa, or mixed' });
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      await transaction.rollback();
      return res.status(400).json({ message: 'items array is required and must not be empty' });
    }

    // Validate customer exists
    const customer = await Customer.findByPk(customerId, { transaction });
    if (!customer) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Customer not found' });
    }
    console.log('Backend: Creating order for customer:', customer.name, 'Branch:', req.user.branchId);

    // Validate items and calculate total
    let calculatedTotal = 0;
    const validatedItems = [];

    for (const item of items) {
      // Validate that serialIds array is provided
      if (!item.productId || !item.serialIds || !Array.isArray(item.serialIds) || item.serialIds.length === 0) {
        await transaction.rollback();
        return res.status(400).json({
          message: 'Each item must have productId and serialIds array with at least one serial ID'
        });
      }

      // Check for duplicate serials in the request
      const uniqueSerials = [...new Set(item.serialIds)];
      if (uniqueSerials.length !== item.serialIds.length) {
        await transaction.rollback();
        return res.status(400).json({
          message: 'Cannot sell the same serial twice in one order'
        });
      }

      // Derive quantity from number of serials
      const quantity = item.serialIds.length;

      // Get product
      const product = await Product.findByPk(item.productId, { transaction });
      if (!product) {
        await transaction.rollback();
        return res.status(404).json({
          message: `Product with id ${item.productId} not found`
        });
      }

      // Check available serials in this branch
      const availableSerials = await ProductSerial.findAll({
        where: {
          productId: item.productId,
          branchId: req.user.branchId,
          orderItemId: null  // Only available serials
        },
        transaction
      });

      if (availableSerials.length < quantity) {
        await transaction.rollback();
        return res.status(400).json({
          message: `Insufficient inventory for product ${product.name}. Available: ${availableSerials.length}, Requested: ${quantity}`
        });
      }

      // Validate cashier-provided serials
      const selectedSerials = await ProductSerial.findAll({
        where: {
          id: item.serialIds,
          productId: item.productId,
          branchId: req.user.branchId,
          orderItemId: null  // Must be unassigned
        },
        transaction,
        lock: transaction.LOCK.UPDATE
      });

      // Validate all provided serials are valid and available
      if (selectedSerials.length !== item.serialIds.length) {
        await transaction.rollback();
        return res.status(400).json({
          message: `Invalid or unavailable serials for product ${product.name}. Some serials may be already sold, not in your branch, or don't belong to this product.`,
          productName: product.name,
          providedSerials: item.serialIds.length,
          validSerials: selectedSerials.length
        });
      }

      // Double-check all serials belong to the correct product
      const invalidSerials = selectedSerials.filter(s => s.productId !== item.productId);
      if (invalidSerials.length > 0) {
        await transaction.rollback();
        return res.status(400).json({
          message: `Some serials don't belong to product ${product.name}`
        });
      }

      const itemSubtotal = parseFloat(product.price) * quantity;
      calculatedTotal += itemSubtotal;

      validatedItems.push({
        productId: item.productId,
        product: product,
        quantity: quantity,
        unitPrice: parseFloat(product.price),
        subtotal: itemSubtotal,
        availableSerials: availableSerials,
        serials: selectedSerials
      });
    }

    // Handle discount calculation
    let subtotal = calculatedTotal;
    let discountPercentage = 0;
    let discountAmount = 0;
    let cashierDiscountId = null;

    // Option 1: Use frontend-provided discount amount (preferred)
    console.log('🔍 Discount Debug - Frontend values:');
    console.log('  frontendDiscountAmount:', frontendDiscountAmount, 'Type:', typeof frontendDiscountAmount);
    console.log('  applyDiscount:', applyDiscount, 'Type:', typeof applyDiscount);
    console.log('  subtotal:', subtotal);
    
    if (frontendDiscountAmount !== undefined && frontendDiscountAmount !== null) {
      discountAmount = parseFloat(frontendDiscountAmount);
      console.log('✅ Using frontend discount amount:', discountAmount);
      
      // Calculate discount percentage for record keeping
      if (subtotal > 0) {
        discountPercentage = (discountAmount / subtotal) * 100;
        console.log('✅ Calculated discount percentage:', discountPercentage);
      }
      
      // Validate discount amount
      if (discountAmount < 0) {
        await transaction.rollback();
        return res.status(400).json({ 
          message: 'Discount amount cannot be negative' 
        });
      }
      
      if (discountAmount > subtotal) {
        await transaction.rollback();
        return res.status(400).json({ 
          message: 'Discount amount cannot be greater than subtotal' 
        });
      }
    }
    // Option 2: Use cashier discount system (legacy/optional)
    else if (applyDiscount === true) {
      const now = new Date();
      let activeDiscount;

      if (requestedDiscountId) {
        // Use specific discount ID provided by frontend
        activeDiscount = await CashierDiscount.findOne({
          where: {
            id: requestedDiscountId,
            cashierId: req.user.id,
            isActive: true,
            startDate: { [Op.lte]: now },
            endDate: { [Op.gte]: now }
          },
          transaction
        });

        if (!activeDiscount) {
          await transaction.rollback();
          return res.status(400).json({ 
            message: 'Invalid or expired cashier discount. Please select a valid discount.' 
          });
        }
      } else {
        // Fallback: use the first available discount (legacy behavior)
        activeDiscount = await CashierDiscount.findOne({
          where: {
            cashierId: req.user.id,
            isActive: true,
            startDate: { [Op.lte]: now },
            endDate: { [Op.gte]: now }
          },
          order: [['createdAt', 'DESC']], // Get the most recently created discount
          transaction
        });

        if (!activeDiscount) {
          await transaction.rollback();
          return res.status(400).json({ 
            message: 'No active cashier discount available. Please contact admin to set up discounts.' 
          });
        }
      }

      discountPercentage = parseFloat(activeDiscount.discountPercentage);
      discountAmount = (subtotal * discountPercentage) / 100;
      cashierDiscountId = activeDiscount.id;
    }


    // Calculate payment amounts and change
    const totalPrice = subtotal - discountAmount;
    let actualAmountPaid = 0;
    let changeAmount = 0;
    let finalCashAmount = null;
    let finalVisaAmount = null;

    if (amountPaid !== undefined && amountPaid !== null) {
      // New logic: amountPaid is provided, calculate change
      actualAmountPaid = parseFloat(amountPaid);

      if (actualAmountPaid < totalPrice) {
        await transaction.rollback();
        return res.status(400).json({
          message: `Amount paid (${actualAmountPaid.toFixed(2)}) cannot be less than total price (${totalPrice.toFixed(2)})`
        });
      }

      // Set payment amounts based on payment method
      if (paymentMethod === 'cash') {
        // Cash payment: can have change
        finalCashAmount = actualAmountPaid;
        finalVisaAmount = null;
        changeAmount = actualAmountPaid - totalPrice;
      } else if (paymentMethod === 'visa') {
        // Visa payment: should be exact (no change possible)
        if (Math.abs(actualAmountPaid - totalPrice) > 0.01) {
          await transaction.rollback();
          return res.status(400).json({
            message: `Visa payments must be exact. Amount paid (${actualAmountPaid.toFixed(2)}) must equal total price (${totalPrice.toFixed(2)})`
          });
        }
        finalCashAmount = null;
        finalVisaAmount = actualAmountPaid;
        changeAmount = 0;
      } else if (paymentMethod === 'mixed') {
        // Mixed payment: only cash portion can have change, visa must be exact
        if (cashAmount === undefined || cashAmount === null || visaAmount === undefined || visaAmount === null) {
          await transaction.rollback();
          return res.status(400).json({
            message: 'For mixed payment with amountPaid, both cashAmount and visaAmount are required to specify the distribution'
          });
        }

        const requestedCashAmount = parseFloat(cashAmount);
        const requestedVisaAmount = parseFloat(visaAmount);

        // Validate that visa amount is exact (no change possible for visa)
        if (requestedVisaAmount < 0) {
          await transaction.rollback();
          return res.status(400).json({
            message: 'Visa amount cannot be negative'
          });
        }

        // Calculate how much cash is actually needed after visa payment
        const cashNeeded = totalPrice - requestedVisaAmount;

        if (cashNeeded < 0) {
          await transaction.rollback();
          return res.status(400).json({
            message: `Visa amount (${requestedVisaAmount.toFixed(2)}) cannot be greater than total price (${totalPrice.toFixed(2)})`
          });
        }

        // Cash portion can have change, visa portion is exact
        finalCashAmount = requestedCashAmount;
        finalVisaAmount = requestedVisaAmount;

        // Calculate change only from cash portion
        const cashChange = requestedCashAmount - cashNeeded;
        changeAmount = Math.max(0, cashChange);

        // Validate total amount paid
        const totalPaid = requestedCashAmount + requestedVisaAmount;
        if (Math.abs(totalPaid - actualAmountPaid) > 0.01) {
          await transaction.rollback();
          return res.status(400).json({
            message: `Total paid (${totalPaid.toFixed(2)}) must equal amountPaid (${actualAmountPaid.toFixed(2)})`
          });
        }
      }
    } else {
      // Legacy logic: exact payment amounts (no change)
      actualAmountPaid = totalPrice;
      changeAmount = 0;

      if (paymentMethod === 'cash') {
        finalCashAmount = totalPrice;
        finalVisaAmount = null;
      } else if (paymentMethod === 'visa') {
        finalCashAmount = null;
        finalVisaAmount = totalPrice;
      } else if (paymentMethod === 'mixed') {
        if (cashAmount === undefined || cashAmount === null || visaAmount === undefined || visaAmount === null) {
          await transaction.rollback();
          return res.status(400).json({
            message: 'For mixed payment, both cashAmount and visaAmount are required'
          });
        }

        finalCashAmount = parseFloat(cashAmount);
        finalVisaAmount = parseFloat(visaAmount);
        const sum = finalCashAmount + finalVisaAmount;

        if (Math.abs(sum - totalPrice) > 0.01) {
          await transaction.rollback();
          return res.status(400).json({
            message: `Payment amounts (${finalCashAmount.toFixed(2)} + ${finalVisaAmount.toFixed(2)} = ${sum.toFixed(2)}) do not match total price (${totalPrice.toFixed(2)})`
          });
        }
      }
    }

    // Create order
    console.log('🔍 Order Creation Debug:');
    console.log('  subtotal:', subtotal);
    console.log('  discountPercentage:', discountPercentage);
    console.log('  discountAmount:', discountAmount);
    console.log('  totalPrice:', totalPrice);
    
    // Calculate total item count for tracking refunds
    console.log('🔍 Calculating totalItemCount:');
    console.log('  validatedItems:', validatedItems);
    console.log('  validatedItems length:', validatedItems ? validatedItems.length : 'undefined');
    
    const totalItemCount = validatedItems ? validatedItems.reduce((sum, item) => {
      console.log('  Processing item:', item);
      console.log('  Item serialIds:', item.serialIds);
      const itemCount = item.serialIds ? item.serialIds.length : 0;
      console.log('  Item count:', itemCount);
      return sum + itemCount;
    }, 0) : 0;
    
    console.log('  Total item count:', totalItemCount);
    
    const order = await Order.create({
      cashierId: req.user.id,
      branchId: req.user.branchId,
      customerId: customerId,
      subtotal: subtotal,
      discountPercentage: discountPercentage > 0 ? discountPercentage : null,
      discountAmount: discountAmount > 0 ? discountAmount : null,
      cashierDiscountId: cashierDiscountId,
      originalItemCount: totalItemCount,
      refundedItemsCount: 0,
      totalPrice: totalPrice,
      paymentMethod: paymentMethod,
      cashAmount: finalCashAmount,
      visaAmount: finalVisaAmount,
      amountPaid: actualAmountPaid,
      changeAmount: changeAmount,
      status: 'completed'
    }, { transaction });
    
    console.log('✅ Order created with ID:', order.id);
    console.log('✅ Order discount fields:', {
      discountPercentage: order.discountPercentage,
      discountAmount: order.discountAmount,
      subtotal: order.subtotal,
      totalPrice: order.totalPrice
    });

    console.log('Backend: Order created with ID:', order.id);

    // Create order items and update inventory
    const createdItems = [];

    for (const validatedItem of validatedItems) {
      // Create order item
      const orderItem = await OrderItem.create({
        orderId: order.id,
        productId: validatedItem.productId,
        quantity: validatedItem.quantity
      }, { transaction });

      // Assign serials to this order item
      const serialCodes = [];
      for (const serial of validatedItem.serials) {
        await serial.update({
          orderItemId: orderItem.id,
          note: `sold - order ${order.id}`
        }, { transaction });
        serialCodes.push(serial.serialCode);
      }

      // Reduce inventory - find and update the inventory record
      const inventory = await Inventory.findOne({
        where: {
          productId: validatedItem.productId,
          branchId: req.user.branchId
        },
        transaction
      });

      if (inventory) {
        const newQuantity = inventory.quantity - validatedItem.quantity;
        if (newQuantity > 0) {
          await inventory.update({
            quantity: newQuantity
          }, { transaction });
        } else {
          await inventory.destroy({ transaction });
        }
      }

      createdItems.push({
        id: orderItem.id,
        productId: validatedItem.productId,
        productName: validatedItem.product.name,
        sku: validatedItem.product.sku,
        quantity: validatedItem.quantity,
        unitPrice: validatedItem.unitPrice,
        subtotal: validatedItem.subtotal,
        serials: serialCodes
      });
    }

    // Calculate and award loyalty points (1 point per currency unit spent, rounded down)
    const pointsEarned = Math.floor(totalPrice);

    // Update customer loyalty points
    await customer.update({
      loyaltyPoints: customer.loyaltyPoints + pointsEarned
    }, { transaction });

    console.log('Backend: Awarded', pointsEarned, 'loyalty points to customer');

    await transaction.commit();

    console.log('Backend: Order completed successfully');

    return res.status(201).json({
      order: {
        id: order.id,
        orderNumber: `ORD-${order.id.substring(0, 8).toUpperCase()}`,
        cashierId: order.cashierId,
        branchId: order.branchId,
        customerId: order.customerId,
        subtotal: order.subtotal ? parseFloat(order.subtotal) : parseFloat(order.totalPrice),
        discountApplied: discountAmount > 0,
        discountPercentage: discountPercentage > 0 ? parseFloat(discountPercentage) : null,
        discountAmount: discountAmount > 0 ? parseFloat(discountAmount) : null,
        totalPrice: parseFloat(order.totalPrice),
        paymentMethod: order.paymentMethod,
        cashAmount: order.cashAmount ? parseFloat(order.cashAmount) : null,
        visaAmount: order.visaAmount ? parseFloat(order.visaAmount) : null,
        amountPaid: parseFloat(order.amountPaid),
        changeAmount: parseFloat(order.changeAmount),
        status: order.status,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt
      },
      items: createdItems,
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        loyaltyPoints: customer.loyaltyPoints,
        pointsEarned: pointsEarned
      },
      message: 'Order created successfully'
    });

  } catch (error) {
    try {
      await transaction.rollback();
    } catch (rollbackError) {
      console.error('Error rolling back transaction:', rollbackError);
    }
    console.error('❌ Error creating order:', error);
    console.error('❌ Error message:', error.message);
    console.error('❌ Error stack:', error.stack);
    console.error('❌ Error name:', error.name);
    return res.status(500).json({
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Get orders for current user's branch (branch_manager, cashier)
router.get('/branch', auth, allowRoles(ROLES.BRANCH_MANAGER, ROLES.CASHIER), async (req, res) => {
  try {
    // Ensure user has a branch assigned
    if (!req.user.branchId) {
      return res.status(403).json({
        message: 'User is not assigned to any branch'
      });
    }


    // Build where conditions - restrict to user's branch
    const whereConditions = {
      branchId: req.user.branchId
    };

    console.log('Debug - Branch orders query:', {
      userBranchId: req.user.branchId,
      whereConditions: whereConditions
    });

    // Date filtering - Branch users only see orders from last 18 days
    const eighteenDaysAgo = new Date();
    eighteenDaysAgo.setDate(eighteenDaysAgo.getDate() - 18);

    whereConditions.createdAt = {};
    whereConditions.createdAt[Sequelize.Op.gte] = eighteenDaysAgo;

    // Get orders with related data for this branch only
    const orders = await Order.findAll({
      where: whereConditions,
      include: [
        {
          model: Customer,
          attributes: ['id', 'name', 'phone', 'loyaltyPoints']
        },
        {
          model: Branch,
          attributes: ['id', 'name', 'location']
        },
        {
          model: User,
          as: 'cashier',
          attributes: ['id', 'name', 'email']
        },
        {
          model: OrderItem,
          include: [
            {
              model: Product,
              attributes: ['id', 'name', 'sku', 'price']
            },
            {
              model: ProductSerial,
              attributes: ['id', 'serialCode', 'note']
            }
          ]
        }
      ],
      order: [['createdAt', 'DESC']] // Sort by newest first
    });

    console.log('Debug - Found orders count:', orders.length);
    console.log('Debug - Orders:', orders.map(o => ({ id: o.id, branchId: o.branchId })));

    // Format the response
    const formattedOrders = orders.map(order => ({
      id: order.id,
      orderNumber: `ORD-${order.id.substring(0, 8).toUpperCase()}`,
      subtotal: order.subtotal ? parseFloat(order.subtotal) : parseFloat(order.totalPrice),
      discountApplied: order.discountAmount > 0,
      discountPercentage: order.discountPercentage ? parseFloat(order.discountPercentage) : null,
      discountAmount: order.discountAmount ? parseFloat(order.discountAmount) : null,
      totalPrice: parseFloat(order.totalPrice),
      paymentMethod: order.paymentMethod,
      cashAmount: order.cashAmount ? parseFloat(order.cashAmount) : null,
      visaAmount: order.visaAmount ? parseFloat(order.visaAmount) : null,
      amountPaid: order.amountPaid ? parseFloat(order.amountPaid) : null,
      changeAmount: order.changeAmount ? parseFloat(order.changeAmount) : null,
      status: order.status,
      originalItemCount: order.originalItemCount || 0,
      refundedItemsCount: order.refundedItemsCount || 0,
      discountRevoked: order.discountRevoked || false,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      customer: {
        id: order.Customer.id,
        name: order.Customer.name,
        phone: order.Customer.phone,
        loyaltyPoints: order.Customer.loyaltyPoints
      },
      branch: {
        id: order.Branch.id,
        name: order.Branch.name,
        location: order.Branch.location
      },
      cashier: {
        id: order.cashier.id,
        name: order.cashier.name,
        email: order.cashier.email
      },
      items: order.OrderItems.map(item => ({
        id: item.id,
        quantity: item.quantity,
        product: {
          id: item.Product.id,
          name: item.Product.name,
          sku: item.Product.sku,
          price: parseFloat(item.Product.price)
        },
        serials: item.ProductSerials.map(serial => ({
          id: serial.id,
          serialCode: serial.serialCode,
          note: serial.note
        }))
      }))
    }));

    return res.json({
      orders: formattedOrders,
      totalCount: orders.length,
      branch: {
        id: req.user.branchId,
        name: orders.length > 0 ? orders[0].Branch.name : null,
        location: orders.length > 0 ? orders[0].Branch.location : null
      },
      filters: {}
    });

  } catch (error) {
    console.error('Error fetching branch orders:', error);
    return res.status(500).json({
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get all orders across all branches (admin, stock_keeper)
router.get('/', auth, allowRoles(ROLES.ADMIN, ROLES.STOCK_KEEPER), async (req, res) => {
  try {
    const {
      branchId,
      startDate,
      endDate
    } = req.query;

    // Build where conditions
    const whereConditions = {};

    if (branchId) {
      whereConditions.branchId = branchId;
    }

    // Date filtering
    if (startDate || endDate) {
      whereConditions.createdAt = {};
      if (startDate) {
        whereConditions.createdAt[Sequelize.Op.gte] = new Date(startDate);
      }
      if (endDate) {
        whereConditions.createdAt[Sequelize.Op.lte] = new Date(endDate);
      }
    }

    // Get orders with related data
    const orders = await Order.findAll({
      where: whereConditions,
      include: [
        {
          model: Customer,
          attributes: ['id', 'name', 'phone', 'loyaltyPoints']
        },
        {
          model: Branch,
          attributes: ['id', 'name', 'location']
        },
        {
          model: User,
          as: 'cashier',
          attributes: ['id', 'name', 'email']
        },
        {
          model: OrderItem,
          include: [
            {
              model: Product,
              attributes: ['id', 'name', 'sku', 'price']
            },
            {
              model: ProductSerial,
              attributes: ['id', 'serialCode', 'note']
            }
          ]
        }
      ],
      order: [['createdAt', 'DESC']] // Sort by newest first
    });

    // Format the response with null checks for production safety
    const formattedOrders = orders.map(order => {
      // Skip orders with missing critical relationships
      if (!order.Customer || !order.Branch || !order.cashier) {
        console.warn(`⚠️ Order ${order.id} has missing relationships - Customer: ${!!order.Customer}, Branch: ${!!order.Branch}, Cashier: ${!!order.cashier}`);
        return null;
      }

      return {
        id: order.id,
        orderNumber: `ORD-${order.id.substring(0, 8).toUpperCase()}`,
        subtotal: order.subtotal ? parseFloat(order.subtotal) : parseFloat(order.totalPrice),
        discountApplied: order.discountAmount > 0,
        discountPercentage: order.discountPercentage ? parseFloat(order.discountPercentage) : null,
        discountAmount: order.discountAmount ? parseFloat(order.discountAmount) : null,
        totalPrice: parseFloat(order.totalPrice),
        paymentMethod: order.paymentMethod,
        cashAmount: order.cashAmount ? parseFloat(order.cashAmount) : null,
        visaAmount: order.visaAmount ? parseFloat(order.visaAmount) : null,
        amountPaid: order.amountPaid ? parseFloat(order.amountPaid) : null,
        changeAmount: order.changeAmount ? parseFloat(order.changeAmount) : null,
        status: order.status,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        customer: {
          id: order.Customer.id,
          name: order.Customer.name,
          phone: order.Customer.phone,
          loyaltyPoints: order.Customer.loyaltyPoints
        },
        branch: {
          id: order.Branch.id,
          name: order.Branch.name,
          location: order.Branch.location
        },
        cashier: {
          id: order.cashier.id,
          name: order.cashier.name,
          email: order.cashier.email
        },
        items: (order.OrderItems || []).map(item => {
          if (!item.Product) {
            console.warn(`⚠️ OrderItem ${item.id} has missing Product`);
            return null;
          }
          return {
            id: item.id,
            quantity: item.quantity,
            product: {
              id: item.Product.id,
              name: item.Product.name,
              sku: item.Product.sku,
              price: parseFloat(item.Product.price)
            },
            serials: (item.ProductSerials || []).map(serial => ({
              id: serial.id,
              serialCode: serial.serialCode,
              note: serial.note
            }))
          };
        }).filter(item => item !== null)
      };
    }).filter(order => order !== null);

    return res.json({
      orders: formattedOrders,
      totalCount: formattedOrders.length,
      filters: {
        branchId,
        startDate,
        endDate
      }
    });

  } catch (error) {
    console.error('Error fetching orders:', error);
    return res.status(500).json({
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get order by ID (admin, stock_keeper, branch_manager, cashier)
router.get('/:id', auth, allowRoles(ROLES.ADMIN, ROLES.STOCK_KEEPER, ROLES.BRANCH_MANAGER, ROLES.CASHIER), async (req, res) => {
  try {
    const { id } = req.params;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return res.status(400).json({
        message: 'Invalid order ID format. Must be a valid UUID.'
      });
    }

    // Get order with related data
    const order = await Order.findByPk(id, {
      include: [
        {
          model: Customer,
          attributes: ['id', 'name', 'phone', 'loyaltyPoints']
        },
        {
          model: Branch,
          attributes: ['id', 'name', 'location']
        },
        {
          model: User,
          as: 'cashier',
          attributes: ['id', 'name', 'email']
        },
        {
          model: OrderItem,
          include: [
            {
              model: Product,
              attributes: ['id', 'name', 'sku', 'price', 'cost', 'currency']
            },
            {
              model: ProductSerial,
              attributes: ['id', 'serialCode', 'note']
            }
          ]
        }
      ]
    });

    if (!order) {
      return res.status(404).json({
        message: 'Order not found'
      });
    }

    // If user is cashier or branch_manager, verify they can only access orders from their branch
    if ((req.user.role === ROLES.CASHIER || req.user.role === ROLES.BRANCH_MANAGER) && req.user.branchId) {
      if (order.branchId !== req.user.branchId) {
        return res.status(403).json({
          message: 'Access denied. You can only view orders from your branch.'
        });
      }
    }

    // Format the response
    const formattedOrder = {
      id: order.id,
      orderNumber: `ORD-${order.id.substring(0, 8).toUpperCase()}`,
      subtotal: order.subtotal ? parseFloat(order.subtotal) : parseFloat(order.totalPrice),
      discountApplied: order.discountAmount > 0,
      discountPercentage: order.discountPercentage ? parseFloat(order.discountPercentage) : null,
      discountAmount: order.discountAmount ? parseFloat(order.discountAmount) : null,
      totalPrice: parseFloat(order.totalPrice),
      paymentMethod: order.paymentMethod,
      cashAmount: order.cashAmount ? parseFloat(order.cashAmount) : null,
      visaAmount: order.visaAmount ? parseFloat(order.visaAmount) : null,
      amountPaid: order.amountPaid ? parseFloat(order.amountPaid) : null,
      changeAmount: order.changeAmount ? parseFloat(order.changeAmount) : null,
      status: order.status,
      originalItemCount: order.originalItemCount || 0,
      refundedItemsCount: order.refundedItemsCount || 0,
      discountRevoked: order.discountRevoked || false,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      customer: {
        id: order.Customer.id,
        name: order.Customer.name,
        phone: order.Customer.phone,
        loyaltyPoints: order.Customer.loyaltyPoints
      },
      branch: {
        id: order.Branch.id,
        name: order.Branch.name,
        location: order.Branch.location
      },
      cashier: {
        id: order.cashier.id,
        name: order.cashier.name,
        email: order.cashier.email
      },
      items: order.OrderItems.map(item => ({
        id: item.id,
        quantity: item.quantity,
        product: {
          id: item.Product.id,
          name: item.Product.name,
          sku: item.Product.sku,
          price: parseFloat(item.Product.price),
          cost: parseFloat(item.Product.cost),
          currency: item.Product.currency
        },
        serials: (item.ProductSerials || []).map(serial => ({
          id: serial.id,
          serialCode: serial.serialCode,
          note: serial.note
        }))
      }))
    };

    return res.json({
      order: formattedOrder
    });

  } catch (error) {
    console.error('Error fetching order:', error);
    return res.status(500).json({
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;

