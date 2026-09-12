const express = require('express');
const { Order, OrderItem, Product, Customer, Inventory, ProductSerial, Branch, User, CashierDiscount, HeldOrder, ProductUnit, CustomerCreditTransaction, sequelize, Sequelize } = require('../models');
const auth = require('../middleware/auth');
const { allowRoles, ROLES } = require('../middleware/roles');
const { requireSupervisorPin } = require('../middleware/supervisorPin');
const { logAuditEvent } = require('../utils/auditLogger');
const { evaluatePromotions } = require('../services/promotionEngine');
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
    if (!paymentMethod || !['cash', 'visa', 'mixed', 'customer_credit'].includes(paymentMethod)) {
      await transaction.rollback();
      return res.status(400).json({ message: 'paymentMethod must be cash, visa, mixed, or customer_credit' });
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      await transaction.rollback();
      return res.status(400).json({ message: 'items array is required and must not be empty' });
    }

    // Validate customer exists if customerId is provided (optional for walk-in customers)
    let customer = null;
    if (customerId) {
      customer = await Customer.findByPk(customerId, { transaction });
      if (!customer) {
        await transaction.rollback();
        return res.status(404).json({ message: 'Customer not found' });
      }
      console.log('Backend: Creating order for customer:', customer.name, 'Branch:', req.user.branchId);
    } else {
      console.log('Backend: Creating order for Walk-in Customer (no customerId). Branch:', req.user.branchId);
    }

    // Validate items and calculate total
    let calculatedTotal = 0;
    const validatedItems = [];

    for (const item of items) {
      if (!item.productId) {
        await transaction.rollback();
        return res.status(400).json({
          message: 'Each item must have a productId'
        });
      }

      // Get product
      const product = await Product.findByPk(item.productId, { transaction });
      if (!product) {
        await transaction.rollback();
        return res.status(404).json({
          message: `Product with id ${item.productId} not found`
        });
      }

      const hasSerials = Array.isArray(item.serialIds) && item.serialIds.length > 0;
      let quantity = 0;
      let selectedSerials = [];
      let availableSerials = [];

      if (hasSerials) {
        // Serial-based selling (fashion / high value electronics)
        const uniqueSerials = [...new Set(item.serialIds)];
        if (uniqueSerials.length !== item.serialIds.length) {
          await transaction.rollback();
          return res.status(400).json({
            message: 'Cannot sell the same serial twice in one order'
          });
        }

        quantity = item.serialIds.length;

        // Check available serials in this branch
        availableSerials = await ProductSerial.findAll({
          where: {
            productId: item.productId,
            branchId: req.user.branchId,
            orderItemId: null
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
        selectedSerials = await ProductSerial.findAll({
          where: {
            id: item.serialIds,
            productId: item.productId,
            branchId: req.user.branchId,
            orderItemId: null
          },
          transaction,
          lock: transaction.LOCK.UPDATE
        });

        if (selectedSerials.length !== item.serialIds.length) {
          await transaction.rollback();
          return res.status(400).json({
            message: `Invalid or unavailable serials for product ${product.name}. Some serials may be already sold, not in your branch, or don't belong to this product.`,
            productName: product.name,
            providedSerials: item.serialIds.length,
            validSerials: selectedSerials.length
          });
        }

        const invalidSerials = selectedSerials.filter(s => s.productId !== item.productId);
        if (invalidSerials.length > 0) {
          await transaction.rollback();
          return res.status(400).json({
            message: `Some serials don't belong to product ${product.name}`
          });
        }
      } else {
        // Bulk / Supermarket selling (direct by quantity or by packaging unit)
        quantity = parseFloat(item.quantity);
        if (isNaN(quantity) || quantity <= 0) {
          await transaction.rollback();
          return res.status(400).json({
            message: `Invalid quantity for product ${product.name}. Quantity must be greater than 0`
          });
        }

        // Check if item is sold in a bulk packaging unit (carton, pack, etc.)
        let unitRecord = null;
        let conversionFactor = 1;
        if (item.productUnitId) {
          unitRecord = await ProductUnit.findOne({
            where: { id: item.productUnitId, productId: product.id, isActive: true },
            transaction
          });
          if (unitRecord) {
            conversionFactor = parseFloat(unitRecord.conversionFactor) || 1;
          }
        }

        const deductQuantity = parseFloat((quantity * conversionFactor).toFixed(3));

        // Check branch inventory against base units
        const branchInventory = await Inventory.findOne({
          where: {
            productId: item.productId,
            branchId: req.user.branchId
          },
          transaction
        });

        const availableQty = branchInventory ? parseFloat(branchInventory.quantity) : 0;
        if (availableQty < deductQuantity) {
          await transaction.rollback();
          return res.status(400).json({
            message: `Insufficient inventory for product ${product.name}. Available: ${availableQty} pieces, Requested: ${deductQuantity} pieces (${quantity} ${unitRecord ? unitRecord.unitName : 'units'})`
          });
        }

        const unitPrice = unitRecord ? parseFloat(unitRecord.sellingPrice) : parseFloat(product.price);
        const costPrice = unitRecord && unitRecord.costPrice ? parseFloat(unitRecord.costPrice) : (product.cost ? parseFloat(product.cost) * conversionFactor : null);
        const itemSubtotal = parseFloat((unitPrice * quantity).toFixed(2));
        calculatedTotal += itemSubtotal;

        validatedItems.push({
          productId: item.productId,
          product: product,
          quantity: quantity,
          deductQuantity: deductQuantity,
          productUnitId: unitRecord ? unitRecord.id : null,
          unitName: unitRecord ? unitRecord.unitName : (product.unit || 'piece'),
          unitPrice: unitPrice,
          costPrice: costPrice,
          subtotal: itemSubtotal,
          hasSerials: hasSerials,
          availableSerials: availableSerials,
          serials: selectedSerials
        });
      }
    }

    // Automatic Supermarket Promotion Evaluation
    const { totalPromotionDiscount = 0, appliedPromotions = [] } = await evaluatePromotions({
      items: validatedItems.map(i => ({
        productId: i.productId,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        categoryId: i.product?.categoryId
      })),
      branchId: req.user.branchId,
      subtotal: calculatedTotal
    });

    // Handle discount calculation
    let subtotal = Math.max(0, calculatedTotal - totalPromotionDiscount);
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

      // For cashiers, enforce authorized discount ceiling from CashierDiscount
      if (req.user.role === 'cashier' && discountAmount > 0) {
        const now = new Date();
        const activeDiscounts = await CashierDiscount.findAll({
          where: {
            cashierId: req.user.id,
            isActive: true,
            startDate: { [Op.lte]: now },
            endDate: { [Op.gte]: now }
          },
          transaction
        });

        if (!activeDiscounts || activeDiscounts.length === 0) {
          await transaction.rollback();
          return res.status(403).json({
            message: 'You are not authorized to apply discounts. No active discount permission found for your account.'
          });
        }

        const maxAllowedPercentage = Math.max(...activeDiscounts.map(d => parseFloat(d.discountPercentage) || 0));
        if (discountPercentage > (maxAllowedPercentage + 0.01)) {
          await transaction.rollback();
          return res.status(403).json({
            message: `Discount percentage (${discountPercentage.toFixed(2)}%) exceeds your maximum allowed limit of ${maxAllowedPercentage}%`
          });
        }

        cashierDiscountId = activeDiscounts[0].id;
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
      } else if (paymentMethod === 'customer_credit') {
        if (!customer) {
          await transaction.rollback();
          return res.status(400).json({ message: 'A registered customer is required for credit / on-account sales' });
        }
        if (!customer.isCreditAllowed) {
          await transaction.rollback();
          return res.status(400).json({ message: 'Credit / tab sales are not enabled for this customer account' });
        }
        const creditLimit = parseFloat(customer.creditLimit || 0);
        const currentDebt = parseFloat(customer.currentDebt || 0);
        if (currentDebt + totalPrice > creditLimit) {
          await transaction.rollback();
          return res.status(400).json({
            message: `Customer credit limit exceeded. Current debt: ${currentDebt.toFixed(2)}, Limit: ${creditLimit.toFixed(2)}, Order Total: ${totalPrice.toFixed(2)}`
          });
        }
        actualAmountPaid = 0;
        changeAmount = 0;
        finalCashAmount = null;
        finalVisaAmount = null;
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
      } else if (paymentMethod === 'customer_credit') {
        if (!customer) {
          await transaction.rollback();
          return res.status(400).json({ message: 'A registered customer is required for credit / on-account sales' });
        }
        if (!customer.isCreditAllowed) {
          await transaction.rollback();
          return res.status(400).json({ message: 'Credit / tab sales are not enabled for this customer account' });
        }
        const creditLimit = parseFloat(customer.creditLimit || 0);
        const currentDebt = parseFloat(customer.currentDebt || 0);
        if (currentDebt + totalPrice > creditLimit) {
          await transaction.rollback();
          return res.status(400).json({
            message: `Customer credit limit exceeded. Current debt: ${currentDebt.toFixed(2)}, Limit: ${creditLimit.toFixed(2)}, Order Total: ${totalPrice.toFixed(2)}`
          });
        }
        actualAmountPaid = 0;
        changeAmount = 0;
        finalCashAmount = null;
        finalVisaAmount = null;
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
    const totalItemCount = validatedItems ? validatedItems.reduce((sum, item) => {
      return sum + (Number(item.quantity) || 0);
    }, 0) : 0;
    
    console.log('  Total item count:', totalItemCount);
    
    const order = await Order.create({
      cashierId: req.user.id,
      branchId: req.user.branchId,
      customerId: customerId || null,
      subtotal: subtotal,
      discountPercentage: discountPercentage > 0 ? discountPercentage : null,
      discountAmount: discountAmount > 0 ? discountAmount : null,
      cashierDiscountId: cashierDiscountId,
      originalItemCount: Math.ceil(totalItemCount),
      refundedItemsCount: 0,
      totalPrice: totalPrice,
      paymentMethod: paymentMethod,
      cashAmount: finalCashAmount,
      visaAmount: finalVisaAmount,
      creditAmount: paymentMethod === 'customer_credit' ? totalPrice : 0.00,
      promotionDiscount: totalPromotionDiscount || 0.00,
      amountPaid: actualAmountPaid,
      changeAmount: changeAmount,
      roundingDifference: req.body.roundingDifference ? parseFloat(req.body.roundingDifference) : 0.00,
      orderNotes: req.body.orderNotes || null,
      status: 'completed'
    }, { transaction });
    
    console.log('✅ Order created with ID:', order.id);

    // Create order items and update inventory
    const createdItems = [];

    for (const validatedItem of validatedItems) {
      // Create order item with frozen prices
      const orderItem = await OrderItem.create({
        orderId: order.id,
        productId: validatedItem.productId,
        quantity: validatedItem.quantity,
        unitPrice: validatedItem.unitPrice,
        costPrice: validatedItem.costPrice,
        totalPrice: validatedItem.subtotal
      }, { transaction });

      // Assign serials if this item is tracked by serials
      const serialCodes = [];
      if (validatedItem.hasSerials && validatedItem.serials && validatedItem.serials.length > 0) {
        for (const serial of validatedItem.serials) {
          await serial.update({
            orderItemId: orderItem.id,
            note: `sold - order ${order.id}`
          }, { transaction });
          serialCodes.push(serial.serialCode);
        }
      }

      // Reduce inventory - DO NOT destroy record if 0, keep it for Out of Stock visibility!
      const inventory = await Inventory.findOne({
        where: {
          productId: validatedItem.productId,
          branchId: req.user.branchId
        },
        transaction
      });

      if (inventory) {
        const currentQty = parseFloat(inventory.quantity) || 0;
        const qtyToDeduct = validatedItem.deductQuantity !== undefined ? validatedItem.deductQuantity : validatedItem.quantity;
        const newQuantity = Math.max(0, currentQty - qtyToDeduct);
        await inventory.update({
          quantity: newQuantity
        }, { transaction });
      }

      createdItems.push({
        id: orderItem.id,
        productId: validatedItem.productId,
        productName: validatedItem.product.name,
        sku: validatedItem.product.sku,
        quantity: validatedItem.quantity,
        unitPrice: validatedItem.unitPrice,
        costPrice: validatedItem.costPrice,
        subtotal: validatedItem.subtotal,
        serials: serialCodes
      });
    }

    // Calculate and award loyalty points if customer account is present
    let pointsEarned = 0;
    if (customer) {
      pointsEarned = Math.floor(totalPrice);
      await customer.update({
        loyaltyPoints: (customer.loyaltyPoints || 0) + pointsEarned
      }, { transaction });
      console.log('Backend: Awarded', pointsEarned, 'loyalty points to customer');
    }

    // Customer Credit transaction and debt update
    if (paymentMethod === 'customer_credit' && customer) {
      const prevDebt = parseFloat(customer.currentDebt || 0);
      const nextDebt = parseFloat((prevDebt + totalPrice).toFixed(2));
      await customer.update({ currentDebt: nextDebt }, { transaction });

      await CustomerCreditTransaction.create({
        customerId: customer.id,
        orderId: order.id,
        type: 'debit',
        amount: totalPrice,
        previousDebt: prevDebt,
        newDebt: nextDebt,
        paymentMethod: 'other',
        notes: `شراء بالآجل فاتورة #${order.id.substring(0, 8).toUpperCase()}`,
        recordedBy: req.user.id,
        branchId: req.user.branchId
      }, { transaction });
    }

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
        roundingDifference: order.roundingDifference ? parseFloat(order.roundingDifference) : 0,
        orderNotes: order.orderNotes,
        status: order.status,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt
      },
      items: createdItems,
      customer: customer ? {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        loyaltyPoints: (customer.loyaltyPoints || 0) + pointsEarned,
        pointsEarned: pointsEarned
      } : null,
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

// ==================== HOLD & RESUME CART ENDPOINTS ====================

// Hold current cart/order (cashier, branch_manager)
router.post('/hold', auth, allowRoles(ROLES.CASHIER, ROLES.BRANCH_MANAGER), async (req, res) => {
  try {
    if (!req.user.branchId) {
      return res.status(403).json({ message: 'User is not assigned to any branch' });
    }

    const { items, customerId, customerName, holdReason, totalAmount } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'items array is required and cannot be empty to hold a cart' });
    }

    let calculatedTotal = 0;
    if (totalAmount !== undefined && totalAmount !== null) {
      calculatedTotal = parseFloat(totalAmount) || 0;
    } else {
      calculatedTotal = items.reduce((sum, it) => sum + ((parseFloat(it.price || it.unitPrice || 0)) * (parseFloat(it.quantity) || 1)), 0);
    }

    const heldOrder = await HeldOrder.create({
      cashierId: req.user.id,
      branchId: req.user.branchId,
      customerId: customerId || null,
      customerName: customerName || null,
      cartData: items,
      holdReason: holdReason || 'Customer temporarily stepped away',
      totalAmount: parseFloat(calculatedTotal.toFixed(2))
    });

    return res.status(201).json({
      message: 'Order held successfully',
      heldOrder: {
        id: heldOrder.id,
        cashierId: heldOrder.cashierId,
        branchId: heldOrder.branchId,
        customerId: heldOrder.customerId,
        customerName: heldOrder.customerName,
        cartData: heldOrder.cartData,
        holdReason: heldOrder.holdReason,
        totalAmount: parseFloat(heldOrder.totalAmount),
        createdAt: heldOrder.createdAt
      }
    });
  } catch (error) {
    console.error('Error holding order:', error);
    return res.status(500).json({
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// List all held orders for the branch (cashier, branch_manager)
router.get('/held', auth, allowRoles(ROLES.CASHIER, ROLES.BRANCH_MANAGER, ROLES.ADMIN), async (req, res) => {
  try {
    const branchId = req.user.role === ROLES.ADMIN ? (req.query.branchId || req.user.branchId) : req.user.branchId;

    const whereClause = {};
    if (branchId) {
      whereClause.branchId = branchId;
    }

    const heldOrders = await HeldOrder.findAll({
      where: whereClause,
      include: [
        { model: User, as: 'cashier', attributes: ['id', 'name', 'email'] },
        { model: Customer, attributes: ['id', 'name', 'phone'] }
      ],
      order: [['createdAt', 'DESC']]
    });

    return res.json({
      count: heldOrders.length,
      heldOrders: heldOrders.map(ho => ({
        id: ho.id,
        cashier: ho.cashier,
        customer: ho.Customer,
        customerName: ho.customerName || ho.Customer?.name,
        itemsCount: Array.isArray(ho.cartData) ? ho.cartData.length : 0,
        totalAmount: parseFloat(ho.totalAmount || 0),
        holdReason: ho.holdReason,
        cartData: ho.cartData,
        createdAt: ho.createdAt
      }))
    });
  } catch (error) {
    console.error('Error fetching held orders:', error);
    return res.status(500).json({
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get a specific held order by ID (cashier, branch_manager)
router.get('/held/:id', auth, allowRoles(ROLES.CASHIER, ROLES.BRANCH_MANAGER, ROLES.ADMIN), async (req, res) => {
  try {
    const { id } = req.params;
    const whereClause = { id };
    if (req.user.role !== ROLES.ADMIN && req.user.branchId) {
      whereClause.branchId = req.user.branchId;
    }

    const heldOrder = await HeldOrder.findOne({
      where: whereClause,
      include: [
        { model: User, as: 'cashier', attributes: ['id', 'name', 'email'] },
        { model: Customer, attributes: ['id', 'name', 'phone'] }
      ]
    });

    if (!heldOrder) {
      return res.status(404).json({ message: 'Held order not found' });
    }

    return res.json({
      heldOrder: {
        id: heldOrder.id,
        cashier: heldOrder.cashier,
        customer: heldOrder.Customer,
        customerName: heldOrder.customerName || heldOrder.Customer?.name,
        itemsCount: Array.isArray(heldOrder.cartData) ? heldOrder.cartData.length : 0,
        totalAmount: parseFloat(heldOrder.totalAmount || 0),
        holdReason: heldOrder.holdReason,
        cartData: heldOrder.cartData,
        createdAt: heldOrder.createdAt
      }
    });
  } catch (error) {
    console.error('Error fetching held order:', error);
    return res.status(500).json({
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Remove/Resume held order (cashier, branch_manager)
router.delete('/held/:id', auth, allowRoles(ROLES.CASHIER, ROLES.BRANCH_MANAGER, ROLES.ADMIN), async (req, res) => {
  try {
    const { id } = req.params;
    const whereClause = { id };
    if (req.user.role !== ROLES.ADMIN && req.user.branchId) {
      whereClause.branchId = req.user.branchId;
    }

    const heldOrder = await HeldOrder.findOne({ where: whereClause });
    if (!heldOrder) {
      return res.status(404).json({ message: 'Held order not found' });
    }

    await heldOrder.destroy();

    return res.json({
      message: 'Held order removed/resumed successfully',
      id: id
    });
  } catch (error) {
    console.error('Error deleting held order:', error);
    return res.status(500).json({
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ==================== VOID PROTECTION ENDPOINTS ====================

// Void entire order (requires supervisor PIN, restores inventory and reverses loyalty points)
router.post('/:id/void', auth, allowRoles(ROLES.ADMIN, ROLES.BRANCH_MANAGER, ROLES.CASHIER), requireSupervisorPin, async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || !reason.trim()) {
      await transaction.rollback();
      return res.status(400).json({ message: 'reason is required for voiding an order' });
    }

    const orderWhere = { id };
    if (req.user.role !== ROLES.ADMIN && req.user.branchId) {
      orderWhere.branchId = req.user.branchId;
    }

    const order = await Order.findOne({
      where: orderWhere,
      include: [
        { model: OrderItem, as: 'OrderItems' }
      ],
      transaction
    });

    if (!order) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Order not found' });
    }

    if (order.status === 'cancelled') {
      await transaction.rollback();
      return res.status(400).json({ message: 'Order is already cancelled/voided' });
    }

    if (order.status === 'refunded') {
      await transaction.rollback();
      return res.status(400).json({ message: 'Cannot void an order that has already been refunded' });
    }

    // Restore inventory for all items in order
    if (order.OrderItems && order.OrderItems.length > 0) {
      for (const item of order.OrderItems) {
        const inventory = await Inventory.findOne({
          where: {
            productId: item.productId,
            branchId: order.branchId
          },
          transaction
        });

        if (inventory) {
          const currentQty = parseFloat(inventory.quantity) || 0;
          await inventory.update({
            quantity: currentQty + parseFloat(item.quantity)
          }, { transaction });
        } else {
          await Inventory.create({
            productId: item.productId,
            branchId: order.branchId,
            quantity: parseFloat(item.quantity)
          }, { transaction });
        }

        // Unassign serials if item was serial-tracked
        await ProductSerial.update(
          { orderItemId: null, note: `voided - order ${order.id}` },
          { where: { orderItemId: item.id }, transaction }
        );
      }
    }

    // Reversal of loyalty points
    if (order.customerId) {
      const customer = await Customer.findByPk(order.customerId, { transaction });
      if (customer) {
        const pointsAwarded = Math.floor(parseFloat(order.totalPrice));
        const newPoints = Math.max(0, (customer.loyaltyPoints || 0) - pointsAwarded);
        await customer.update({ loyaltyPoints: newPoints }, { transaction });
      }
    }

    const oldStatus = order.status;

    await order.update({
      status: 'cancelled',
      orderNotes: order.orderNotes ? `${order.orderNotes} | VOIDED: ${reason.trim()}` : `VOIDED: ${reason.trim()}`
    }, { transaction });

    // Record in Audit Log
    await logAuditEvent({
      req,
      action: 'ORDER_VOID',
      entityType: 'Order',
      entityId: order.id,
      reason: reason.trim(),
      supervisorId: req.supervisor?.id,
      oldValues: {
        status: oldStatus,
        totalPrice: order.totalPrice,
        itemsCount: order.OrderItems ? order.OrderItems.length : 0
      },
      newValues: {
        status: 'cancelled',
        voidedBySupervisor: req.supervisor?.name
      },
      transaction
    });

    await transaction.commit();

    return res.json({
      message: 'Order voided successfully and inventory restored to branch',
      orderId: order.id,
      authorizedBy: req.supervisor ? { id: req.supervisor.id, name: req.supervisor.name } : null
    });

  } catch (error) {
    await transaction.rollback();
    console.error('Error voiding order:', error);
    return res.status(500).json({
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Void item at POS checkout (requires supervisor PIN to track item deletions)
router.post('/void-item', auth, allowRoles(ROLES.ADMIN, ROLES.BRANCH_MANAGER, ROLES.CASHIER), requireSupervisorPin, async (req, res) => {
  try {
    const { productId, productName, quantity, unitPrice, reason, cartSessionId } = req.body;

    if (!productId) {
      return res.status(400).json({ message: 'productId is required' });
    }

    if (!reason || !reason.trim()) {
      return res.status(400).json({ message: 'reason is required for item void' });
    }

    await logAuditEvent({
      req,
      action: 'ITEM_VOID',
      entityType: 'Product',
      entityId: productId,
      reason: reason.trim(),
      supervisorId: req.supervisor?.id,
      oldValues: {
        productName: productName || null,
        quantity: parseFloat(quantity) || 1,
        unitPrice: parseFloat(unitPrice) || 0,
        cartSessionId: cartSessionId || null
      },
      newValues: {
        voided: true,
        authorizedBy: req.supervisor?.name
      }
    });

    return res.json({
      message: 'Item void authorized and logged successfully',
      item: {
        productId,
        productName,
        quantity: parseFloat(quantity) || 1,
        unitPrice: parseFloat(unitPrice) || 0
      },
      authorizedBy: req.supervisor ? { id: req.supervisor.id, name: req.supervisor.name } : null
    });
  } catch (error) {
    console.error('Error recording item void:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;

