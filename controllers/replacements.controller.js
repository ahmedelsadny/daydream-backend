const express = require('express');
const { Order, OrderItem, Product, Replacement, ReplacementOrderItem, Inventory, ProductSerial, Branch, Customer, User, sequelize } = require('../models');
const auth = require('../middleware/auth');
const { allowRoles, ROLES } = require('../middleware/roles');

const router = express.Router();

/**
 * @swagger
 * /api/v1/replacements:
 *   post:
 *     summary: Create a replacement for a customer
 *     description: |
 *       Process a replacement where a customer returns items from an original order 
 *       and receives different items in exchange. The endpoint handles:
 *       - Returning original items to inventory
 *       - Creating a new order with replacement items
 *       - Calculating price difference and handling payment
 *       - Serial code tracking for both returned and new items
 *     tags: [Replacements]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - originalOrderItemId
 *               - returnSerialIds
 *               - newItems
 *               - paymentMethod
 *             properties:
 *               originalOrderItemId:
 *                 type: string
 *                 format: uuid
 *                 description: ID of the order item being returned
 *               returnSerialIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *                 description: Serial IDs of the items being returned
 *               newItems:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - productId
 *                     - serialIds
 *                   properties:
 *                     productId:
 *                       type: string
 *                       format: uuid
 *                       description: Product ID for replacement item
 *                     serialIds:
 *                       type: array
 *                       items:
 *                         type: string
 *                         format: uuid
 *                       description: Serial IDs to assign to this product
 *                 description: Array of new products and their serials for replacement
 *               paymentMethod:
 *                 type: string
 *                 enum: [cash, visa, mixed, none]
 *                 description: Payment method (use 'none' if customer receives money back)
 *               cashAmount:
 *                 type: number
 *                 format: decimal
 *                 description: Amount paid in cash (required if paymentMethod is cash or mixed)
 *               visaAmount:
 *                 type: number
 *                 format: decimal
 *                 description: Amount paid via visa (required if paymentMethod is visa or mixed)
 *               reason:
 *                 type: string
 *                 description: Reason for replacement
 *     responses:
 *       201:
 *         description: Replacement created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 replacement:
 *                   type: object
 *                 originalItems:
 *                   type: object
 *                 newOrder:
 *                   type: object
 *                 priceDifference:
 *                   type: number
 *                 message:
 *                   type: string
 *       400:
 *         description: Bad request - validation error
 *       403:
 *         description: Forbidden - user not assigned to branch or wrong branch
 *       404:
 *         description: Order item or product not found
 *       500:
 *         description: Internal server error
 */
router.post('/', auth, allowRoles(ROLES.BRANCH_MANAGER, ROLES.CASHIER), async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
        const {
            originalOrderItemId, // Legacy field for single-item replacements
            originalOrderItemIds, // New field for multi-item replacements
            returnSerialIds,
            newItems,
            paymentMethod,
            cashAmount,
            visaAmount,
            manualPriceDifference,
            reason
        } = req.body;

        // Validate required fields - support both single and multi-item replacements
        const isMultiItem = originalOrderItemIds && Array.isArray(originalOrderItemIds) && originalOrderItemIds.length > 0;
        const isSingleItem = originalOrderItemId && !isMultiItem;

        if (!isSingleItem && !isMultiItem) {
            await transaction.rollback();
            return res.status(400).json({
                message: 'Either originalOrderItemId (single item) or originalOrderItemIds (multi-item) is required'
            });
        }

        if (!returnSerialIds || !Array.isArray(returnSerialIds) || returnSerialIds.length === 0) {
            await transaction.rollback();
            return res.status(400).json({ message: 'returnSerialIds array is required and must not be empty' });
        }

        if (!newItems || !Array.isArray(newItems) || newItems.length === 0) {
            await transaction.rollback();
            return res.status(400).json({ message: 'newItems array is required and must not be empty' });
        }

        if (!paymentMethod || !['cash', 'visa', 'mixed', 'none'].includes(paymentMethod)) {
            await transaction.rollback();
            return res.status(400).json({ message: 'Valid paymentMethod is required (cash, visa, mixed, or none)' });
        }

        // Ensure user has a branch assigned
        if (!req.user.branchId) {
            await transaction.rollback();
            return res.status(403).json({
                message: 'User is not assigned to any branch'
            });
        }

        // Get original order items (single or multiple)
        let originalOrderItems = [];
        let parentOrder = null;

        if (isSingleItem) {
            // Single-item replacement (legacy)
            const originalOrderItem = await OrderItem.findByPk(originalOrderItemId, {
                include: [
                    {
                        model: Order,
                        include: [{ model: Branch }, { model: Customer }]
                    },
                    { model: Product }
                ],
                transaction
            });

            if (!originalOrderItem) {
                await transaction.rollback();
                return res.status(404).json({ message: 'Original order item not found' });
            }

            originalOrderItems = [originalOrderItem];
            parentOrder = originalOrderItem.Order;
        } else {
            // Multi-item replacement
            originalOrderItems = await OrderItem.findAll({
                where: {
                    id: originalOrderItemIds
                },
                include: [
                    {
                        model: Order,
                        include: [{ model: Branch }, { model: Customer }]
                    },
                    { model: Product }
                ],
                transaction
            });

            if (originalOrderItems.length === 0) {
                await transaction.rollback();
                return res.status(404).json({ message: 'No original order items found' });
            }

            if (originalOrderItems.length !== originalOrderItemIds.length) {
                await transaction.rollback();
                return res.status(400).json({ message: 'Some order items not found' });
            }

            // Verify all items belong to the same order
            const orderIds = [...new Set(originalOrderItems.map(item => item.orderId))];
            if (orderIds.length > 1) {
                await transaction.rollback();
                return res.status(400).json({ message: 'All order items must belong to the same order' });
            }

            parentOrder = originalOrderItems[0].Order;
        }

        // Verify order belongs to user's branch
        if (parentOrder.branchId !== req.user.branchId) {
            await transaction.rollback();
            return res.status(403).json({
                message: 'Order does not belong to your branch'
            });
        }

        // Validate return quantities and serials for all order items
        const returnQuantity = returnSerialIds.length;
        let totalReturnedQuantity = 0;
        let totalReturnedAmount = 0;

        // Group serials by order item for validation
        const serialsByOrderItem = {};
        for (const orderItem of originalOrderItems) {
            serialsByOrderItem[orderItem.id] = [];
        }

        // Validate return serials
        const serialsToReturn = await ProductSerial.findAll({
            where: {
                id: returnSerialIds
            },
            include: [{ model: OrderItem }],
            transaction
        });

        if (serialsToReturn.length !== returnSerialIds.length) {
            await transaction.rollback();
            return res.status(400).json({ message: 'Some return serials not found' });
        }

        // Group serials by their order item and validate
        for (const serial of serialsToReturn) {
            if (!serialsByOrderItem[serial.orderItemId]) {
                await transaction.rollback();
                return res.status(400).json({
                    message: `Serial ${serial.serialCode} does not belong to any of the selected order items`
                });
            }
            serialsByOrderItem[serial.orderItemId].push(serial);
        }

        // Validate quantities for each order item
        for (const orderItem of originalOrderItems) {
            const itemSerials = serialsByOrderItem[orderItem.id] || [];
            const itemReturnQuantity = itemSerials.length;

            if (itemReturnQuantity > orderItem.quantity) {
                await transaction.rollback();
                return res.status(400).json({
                    message: `Cannot return more than purchased for ${orderItem.Product.name}. Purchased: ${orderItem.quantity}, Requested: ${itemReturnQuantity}`
                });
            }

            totalReturnedQuantity += itemReturnQuantity;
            totalReturnedAmount += itemReturnQuantity * parseFloat(orderItem.Product.price);
        }

        // Check for duplicate serials
        const uniqueReturnSerials = [...new Set(returnSerialIds)];
        if (uniqueReturnSerials.length !== returnSerialIds.length) {
            await transaction.rollback();
            return res.status(400).json({
                message: 'Cannot return the same serial twice'
            });
        }

        // Calculate returned amount considering any discounts applied to the original order
        let returnedAmount = totalReturnedAmount;

        // Check if the original order had any discounts
        if (parentOrder && parentOrder.discountAmount > 0 && parentOrder.subtotal > 0) {
            const discountPercentage = (parentOrder.discountAmount / parentOrder.subtotal) * 100;

            // Apply the same discount percentage to the returned amount
            returnedAmount = returnedAmount * (1 - discountPercentage / 100);
        }

        // Validate and process new items
        let newItemsAmount = 0;
        const newItemsDetails = [];

        for (const item of newItems) {
            if (!item.productId || !item.serialIds || !Array.isArray(item.serialIds)) {
                await transaction.rollback();
                return res.status(400).json({
                    message: 'Each new item must have productId and serialIds array'
                });
            }

            const quantity = item.serialIds.length;

            // Get product
            const product = await Product.findByPk(item.productId, { transaction });
            if (!product) {
                await transaction.rollback();
                return res.status(404).json({
                    message: `Product ${item.productId} not found`
                });
            }

            // Check available serials
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
                    message: `Insufficient inventory for ${product.name}. Available: ${availableSerials.length}, Required: ${quantity}`
                });
            }

            // Validate serials
            const serials = await ProductSerial.findAll({
                where: {
                    id: item.serialIds,
                    productId: item.productId,
                    branchId: req.user.branchId,
                    orderItemId: null
                },
                transaction
            });

            if (serials.length !== item.serialIds.length) {
                await transaction.rollback();
                return res.status(400).json({
                    message: `Invalid serials for ${product.name}. Provided: ${item.serialIds.length}, Available: ${serials.length}`
                });
            }

            const itemAmount = parseFloat(product.price) * quantity;
            newItemsAmount += itemAmount;

            newItemsDetails.push({
                product,
                quantity,
                serialIds: item.serialIds,
                serials,
                amount: itemAmount
            });
        }

        // Apply the same discount percentage to new items that was applied to the original order
        let discountedNewItemsAmount = newItemsAmount;
        if (parentOrder && parentOrder.discountAmount > 0 && parentOrder.subtotal > 0) {
            const discountPercentage = (parentOrder.discountAmount / parentOrder.subtotal) * 100;
            discountedNewItemsAmount = newItemsAmount * (1 - discountPercentage / 100);
        }

        // Calculate price difference using discounted amounts
        // Use manual price difference if provided, otherwise calculate automatically
        const priceDifference = manualPriceDifference !== undefined && manualPriceDifference !== null
            ? parseFloat(manualPriceDifference)
            : discountedNewItemsAmount - returnedAmount;

        // Validate payment
        if (priceDifference > 0) {
            // Customer needs to pay more
            if (paymentMethod === 'none') {
                await transaction.rollback();
                return res.status(400).json({
                    message: `Customer must pay ${priceDifference.toFixed(2)} more. Cannot use payment method 'none'`
                });
            }

            if (paymentMethod === 'cash') {
                if (!cashAmount || parseFloat(cashAmount) < priceDifference) {
                    await transaction.rollback();
                    return res.status(400).json({
                        message: `Insufficient cash payment. Required: ${priceDifference.toFixed(2)}, Provided: ${cashAmount || 0}`
                    });
                }
            } else if (paymentMethod === 'visa') {
                if (!visaAmount || parseFloat(visaAmount) < priceDifference) {
                    await transaction.rollback();
                    return res.status(400).json({
                        message: `Insufficient visa payment. Required: ${priceDifference.toFixed(2)}, Provided: ${visaAmount || 0}`
                    });
                }
            } else if (paymentMethod === 'mixed') {
                const totalPaid = parseFloat(cashAmount || 0) + parseFloat(visaAmount || 0);
                if (totalPaid < priceDifference) {
                    await transaction.rollback();
                    return res.status(400).json({
                        message: `Insufficient payment. Required: ${priceDifference.toFixed(2)}, Provided: ${totalPaid.toFixed(2)}`
                    });
                }
            }
        }

        // Calculate amounts for customer payment or refund
        const customerPayment = priceDifference > 0 ? priceDifference : 0;
        const refundToCustomer = priceDifference < 0 ? Math.abs(priceDifference) : 0;

        // Build detailed transaction log
        const transactionLog = {
            timestamp: new Date().toISOString(),
            originalOrder: {
                orderId: parentOrder.id,
                orderNumber: `ORD-${parentOrder.id.substring(0, 8).toUpperCase()}`,
                orderDate: parentOrder.createdAt
            },
            itemsReturned: isMultiItem ?
                originalOrderItems.map(item => ({
                    product: {
                        id: item.Product.id,
                        name: item.Product.name,
                        sku: item.Product.sku,
                        price: parseFloat(item.Product.price)
                    },
                    quantity: serialsByOrderItem[item.id] ? serialsByOrderItem[item.id].length : 0,
                    serials: serialsByOrderItem[item.id] ? serialsByOrderItem[item.id].map(s => s.serialCode) : [],
                    totalValue: serialsByOrderItem[item.id] ? serialsByOrderItem[item.id].length * parseFloat(item.Product.price) : 0
                })) :
                [{
                    product: {
                        id: originalOrderItems[0].Product.id,
                        name: originalOrderItems[0].Product.name,
                        sku: originalOrderItems[0].Product.sku,
                        price: parseFloat(originalOrderItems[0].Product.price)
                    },
                    quantity: returnQuantity,
                    serials: serialsToReturn.map(s => s.serialCode),
                    totalValue: returnedAmount
                }],
            itemsProvided: newItemsDetails.map(item => ({
                product: {
                    id: item.product.id,
                    name: item.product.name,
                    sku: item.product.sku,
                    price: parseFloat(item.product.price)
                },
                quantity: item.quantity,
                serials: item.serials.map(s => s.serialCode),
                totalValue: item.amount
            })),
            financial: {
                returnedItemsValue: returnedAmount,
                newItemsValue: newItemsAmount,
                priceDifference: priceDifference,
                customerPaid: customerPayment,
                refundedToCustomer: refundToCustomer,
                paymentMethod: priceDifference <= 0 ? 'none' : paymentMethod,
                cashReceived: priceDifference > 0 ? (cashAmount || 0) : 0,
                visaReceived: priceDifference > 0 ? (visaAmount || 0) : 0,
                changeGiven: priceDifference > 0 && paymentMethod === 'cash'
                    ? Math.max(0, parseFloat(cashAmount) - priceDifference)
                    : 0
            },
            processedBy: {
                userId: req.user.id,
                userName: req.user.name,
                userRole: req.user.role
            },
            reason: reason || 'No reason provided'
        };

        // Calculate total item count for tracking refunds
        const totalItemCount = newItemsDetails.reduce((sum, item) => sum + item.serialIds.length, 0);

        // Create new order for replacement items
        const newOrder = await Order.create({
            cashierId: req.user.id,
            branchId: req.user.branchId,
            customerId: parentOrder.customerId,
            originalItemCount: totalItemCount,
            refundedItemsCount: 0,
            totalPrice: newItemsAmount,
            paymentMethod: priceDifference <= 0 ? 'cash' : paymentMethod,
            cashAmount: priceDifference > 0 ? (cashAmount || null) : 0,
            visaAmount: priceDifference > 0 ? (visaAmount || null) : 0,
            amountPaid: priceDifference > 0 ? Math.max(newItemsAmount, parseFloat(cashAmount || 0) + parseFloat(visaAmount || 0)) : newItemsAmount,
            changeAmount: priceDifference > 0 && paymentMethod === 'cash'
                ? Math.max(0, parseFloat(cashAmount) - priceDifference)
                : 0,
            status: 'completed'
        }, { transaction });

        const newOrderItems = [];

        // Process new items
        for (const itemDetail of newItemsDetails) {
            // Create order item
            const orderItem = await OrderItem.create({
                orderId: newOrder.id,
                productId: itemDetail.product.id,
                quantity: itemDetail.quantity
            }, { transaction });

            // Reduce inventory
            await Inventory.decrement('quantity', {
                by: itemDetail.quantity,
                where: {
                    productId: itemDetail.product.id,
                    branchId: req.user.branchId
                },
                transaction
            });

            // Assign serials to order item
            for (const serial of itemDetail.serials) {
                await serial.update({
                    orderItemId: orderItem.id,
                    branchId: null,
                    note: `REPLACEMENT-ISSUE: Sold as replacement in order ${newOrder.id}. Original return from order ${parentOrder.id}. Product: ${itemDetail.product.name}. Date: ${new Date().toISOString()}`
                }, { transaction });
            }

            newOrderItems.push({
                orderItemId: orderItem.id,
                productId: itemDetail.product.id,
                productName: itemDetail.product.name,
                productSku: itemDetail.product.sku,
                quantity: itemDetail.quantity,
                price: parseFloat(itemDetail.product.price),
                amount: itemDetail.amount,
                serials: itemDetail.serials.map(s => s.serialCode)
            });
        }

        // Return original items to inventory (handle multiple order items)
        const inventoryUpdates = {};

        // Group return quantities by product
        for (const orderItem of originalOrderItems) {
            const itemSerials = serialsByOrderItem[orderItem.id] || [];
            const itemReturnQuantity = itemSerials.length;

            if (itemReturnQuantity > 0) {
                if (!inventoryUpdates[orderItem.productId]) {
                    inventoryUpdates[orderItem.productId] = 0;
                }
                inventoryUpdates[orderItem.productId] += itemReturnQuantity;
            }
        }

        // Update inventory for each product
        for (const [productId, returnQuantity] of Object.entries(inventoryUpdates)) {
            let returnInventory = await Inventory.findOne({
                where: {
                    productId: productId,
                    branchId: req.user.branchId
                },
                transaction
            });

            if (returnInventory) {
                await returnInventory.update({
                    quantity: returnInventory.quantity + returnQuantity
                }, { transaction });
            } else {
                await Inventory.create({
                    productId: productId,
                    branchId: req.user.branchId,
                    quantity: returnQuantity
                }, { transaction });
            }
        }

        // Unassign return serials
        for (const serial of serialsToReturn) {
            await serial.update({
                orderItemId: null,
                branchId: req.user.branchId,
                note: `REPLACEMENT-RETURN: Returned from order ${parentOrder.id} via replacement ${newOrder.id}. Product: ${serial.Product?.name || 'Unknown'}. Date: ${new Date().toISOString()}`
            }, { transaction });
        }

        // Create replacement record
        const replacement = await Replacement.create({
            originalOrderItemId: isSingleItem ? originalOrderItemId : null, // Legacy field for single-item
            branchId: req.user.branchId,
            newOrderId: newOrder.id,
            customerId: parentOrder.customerId,
            returnedAmount: returnedAmount,
            newItemsAmount: newItemsAmount,
            priceDifference: priceDifference,
            refundToCustomer: refundToCustomer,
            customerPayment: customerPayment,
            paymentMethod: priceDifference <= 0 ? 'none' : paymentMethod,
            cashAmount: priceDifference > 0 ? (cashAmount || null) : null,
            visaAmount: priceDifference > 0 ? (visaAmount || null) : null,
            transactionLog: JSON.stringify(transactionLog, null, 2),
            processedBy: req.user.id,
            reason: reason || null,
            status: 'completed'
        }, { transaction });

        // Create replacement order item records for multi-item replacements
        if (isMultiItem) {
            for (const orderItem of originalOrderItems) {
                const itemSerials = serialsByOrderItem[orderItem.id] || [];
                const itemReturnQuantity = itemSerials.length;
                const itemReturnedAmount = itemReturnQuantity * parseFloat(orderItem.Product.price);

                // Apply discount if applicable
                let finalItemReturnedAmount = itemReturnedAmount;
                if (parentOrder && parentOrder.discountAmount > 0 && parentOrder.subtotal > 0) {
                    const discountPercentage = (parentOrder.discountAmount / parentOrder.subtotal) * 100;
                    finalItemReturnedAmount = itemReturnedAmount * (1 - discountPercentage / 100);
                }

                await ReplacementOrderItem.create({
                    replacementId: replacement.id,
                    orderItemId: orderItem.id,
                    returnedAmount: finalItemReturnedAmount,
                    quantityReturned: itemReturnQuantity
                }, { transaction });
            }
        }

        await transaction.commit();

        return res.status(201).json({
            replacement: {
                id: replacement.id,
                originalOrderId: parentOrder.id,
                originalOrderNumber: `ORD-${parentOrder.id.substring(0, 8).toUpperCase()}`,
                newOrderId: newOrder.id,
                newOrderNumber: `ORD-${newOrder.id.substring(0, 8).toUpperCase()}`,
                status: replacement.status,
                reason: replacement.reason,
                createdAt: replacement.createdAt,
                isMultiItem: isMultiItem
            },
            originalItems: isMultiItem ?
                originalOrderItems.map(orderItem => {
                    const itemSerials = serialsByOrderItem[orderItem.id] || [];
                    return {
                        product: {
                            id: orderItem.Product.id,
                            name: orderItem.Product.name,
                            sku: orderItem.Product.sku,
                            price: parseFloat(orderItem.Product.price)
                        },
                        quantity: itemSerials.length,
                        serials: itemSerials.map(s => s.serialCode)
                    };
                }) :
                [{
                    product: {
                        id: originalOrderItems[0].Product.id,
                        name: originalOrderItems[0].Product.name,
                        sku: originalOrderItems[0].Product.sku,
                        price: parseFloat(originalOrderItems[0].Product.price)
                    },
                    quantity: returnQuantity,
                    amount: returnedAmount,
                    serialsReturned: serialsToReturn.map(s => s.serialCode)
                }],
            newOrder: {
                id: newOrder.id,
                orderNumber: `ORD-${newOrder.id.substring(0, 8).toUpperCase()}`,
                totalAmount: parseFloat(discountedNewItemsAmount),
                items: newOrderItems
            },
            customer: {
                id: parentOrder.Customer.id,
                name: parentOrder.Customer.name,
                phone: parentOrder.Customer.phone
            },
            financialSummary: {
                returnedAmount: parseFloat(returnedAmount),
                newItemsAmount: parseFloat(discountedNewItemsAmount),
                priceDifference: parseFloat(priceDifference),
                customerPayment: parseFloat(customerPayment),
                refundToCustomer: parseFloat(refundToCustomer),
                paymentMethod: replacement.paymentMethod,
                cashReceived: replacement.cashAmount ? parseFloat(replacement.cashAmount) : 0,
                visaReceived: replacement.visaAmount ? parseFloat(replacement.visaAmount) : 0,
                changeGiven: priceDifference > 0 && paymentMethod === 'cash'
                    ? Math.max(0, parseFloat(cashAmount) - priceDifference)
                    : 0,
                transactionType: refundToCustomer > 0
                    ? `REFUND - Customer received ${refundToCustomer.toFixed(2)} back`
                    : customerPayment > 0
                        ? `PAYMENT - Customer paid ${customerPayment.toFixed(2)} additional`
                        : 'EVEN EXCHANGE - No payment difference'
            },
            transactionLog: transactionLog,
            message: refundToCustomer > 0
                ? `Replacement processed successfully. Customer receives ${refundToCustomer.toFixed(2)} refund.`
                : customerPayment > 0
                    ? `Replacement processed successfully. Customer paid ${customerPayment.toFixed(2)} additional.`
                    : 'Replacement processed successfully. Even exchange.'
        });

    } catch (error) {
        try {
            await transaction.rollback();
        } catch (rollbackError) {
            console.error('Error rolling back transaction:', rollbackError);
        }
        console.error('Error creating replacement:', error);
        return res.status(500).json({
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Admin endpoint for creating replacements
router.post('/admin', auth, allowRoles(ROLES.ADMIN), async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
        const {
            originalOrderItemId, // Legacy field for single-item replacements
            originalOrderItemIds, // New field for multi-item replacements
            returnSerialIds,
            newItems,
            paymentMethod,
            cashAmount,
            visaAmount,
            manualPriceDifference,
            reason,
            branchId: bodyBranchId // Optional branch ID for admin
        } = req.body;

        // Validate required fields - support both single and multi-item replacements
        const isMultiItem = originalOrderItemIds && Array.isArray(originalOrderItemIds) && originalOrderItemIds.length > 0;
        const isSingleItem = originalOrderItemId && !isMultiItem;

        if (!isSingleItem && !isMultiItem) {
            await transaction.rollback();
            return res.status(400).json({
                message: 'Either originalOrderItemId (single item) or originalOrderItemIds (multi-item) is required'
            });
        }

        if (!returnSerialIds || !Array.isArray(returnSerialIds) || returnSerialIds.length === 0) {
            await transaction.rollback();
            return res.status(400).json({ message: 'returnSerialIds array is required and must not be empty' });
        }

        if (!newItems || !Array.isArray(newItems) || newItems.length === 0) {
            await transaction.rollback();
            return res.status(400).json({ message: 'newItems array is required and must not be empty' });
        }

        if (!paymentMethod || !['cash', 'visa', 'mixed', 'none'].includes(paymentMethod)) {
            await transaction.rollback();
            return res.status(400).json({ message: 'Valid paymentMethod is required (cash, visa, mixed, or none)' });
        }

        // Get original order items (single or multiple)
        let originalOrderItems = [];
        let parentOrder = null;

        if (isSingleItem) {
            // Single-item replacement (legacy)
            const originalOrderItem = await OrderItem.findByPk(originalOrderItemId, {
                include: [
                    {
                        model: Order,
                        include: [{ model: Branch }, { model: Customer }]
                    },
                    { model: Product }
                ],
                transaction
            });

            if (!originalOrderItem) {
                await transaction.rollback();
                return res.status(404).json({ message: 'Original order item not found' });
            }

            originalOrderItems = [originalOrderItem];
            parentOrder = originalOrderItem.Order;
        } else {
            // Multi-item replacement
            originalOrderItems = await OrderItem.findAll({
                where: {
                    id: originalOrderItemIds
                },
                include: [
                    {
                        model: Order,
                        include: [{ model: Branch }, { model: Customer }]
                    },
                    { model: Product }
                ],
                transaction
            });

            if (originalOrderItems.length === 0) {
                await transaction.rollback();
                return res.status(404).json({ message: 'No original order items found' });
            }

            if (originalOrderItems.length !== originalOrderItemIds.length) {
                await transaction.rollback();
                return res.status(400).json({ message: 'Some order items not found' });
            }

            // Verify all items belong to the same order
            const orderIds = [...new Set(originalOrderItems.map(item => item.orderId))];
            if (orderIds.length > 1) {
                await transaction.rollback();
                return res.status(400).json({ message: 'All order items must belong to the same order' });
            }

            parentOrder = originalOrderItems[0].Order;
        }

        // Determine target branch ID (admin can specify or use order's branch)
        let targetBranchId;
        if (bodyBranchId != null && bodyBranchId !== '') {
            const branch = await Branch.findByPk(bodyBranchId, { transaction });
            if (!branch) {
                await transaction.rollback();
                return res.status(404).json({ message: 'Branch not found' });
            }
            targetBranchId = branch.id;
        } else {
            targetBranchId = parentOrder.branchId;
        }

        // Validate return quantities and serials for all order items
        const returnQuantity = returnSerialIds.length;
        let totalReturnedQuantity = 0;
        let totalReturnedAmount = 0;

        // Group serials by order item for validation
        const serialsByOrderItem = {};
        for (const orderItem of originalOrderItems) {
            serialsByOrderItem[orderItem.id] = [];
        }

        // Validate return serials
        const serialsToReturn = await ProductSerial.findAll({
            where: {
                id: returnSerialIds
            },
            include: [{ model: OrderItem }],
            transaction
        });

        if (serialsToReturn.length !== returnSerialIds.length) {
            await transaction.rollback();
            return res.status(400).json({ message: 'Some return serials not found' });
        }

        // Group serials by their order item and validate
        for (const serial of serialsToReturn) {
            if (!serialsByOrderItem[serial.orderItemId]) {
                await transaction.rollback();
                return res.status(400).json({
                    message: `Serial ${serial.serialCode} does not belong to any of the selected order items`
                });
            }
            serialsByOrderItem[serial.orderItemId].push(serial);
        }

        // Validate quantities for each order item
        for (const orderItem of originalOrderItems) {
            const itemSerials = serialsByOrderItem[orderItem.id] || [];
            const itemReturnQuantity = itemSerials.length;

            if (itemReturnQuantity > orderItem.quantity) {
                await transaction.rollback();
                return res.status(400).json({
                    message: `Cannot return more than purchased for ${orderItem.Product.name}. Purchased: ${orderItem.quantity}, Requested: ${itemReturnQuantity}`
                });
            }

            totalReturnedQuantity += itemReturnQuantity;
            totalReturnedAmount += itemReturnQuantity * parseFloat(orderItem.Product.price);
        }

        // Check for duplicate serials
        const uniqueReturnSerials = [...new Set(returnSerialIds)];
        if (uniqueReturnSerials.length !== returnSerialIds.length) {
            await transaction.rollback();
            return res.status(400).json({
                message: 'Cannot return the same serial twice'
            });
        }

        // Calculate returned amount considering any discounts applied to the original order
        let returnedAmount = totalReturnedAmount;

        // Check if the original order had any discounts
        if (parentOrder && parentOrder.discountAmount > 0 && parentOrder.subtotal > 0) {
            const discountPercentage = (parentOrder.discountAmount / parentOrder.subtotal) * 100;

            // Apply the same discount percentage to the returned amount
            returnedAmount = returnedAmount * (1 - discountPercentage / 100);
        }

        // Validate and process new items
        let newItemsAmount = 0;
        const newItemsDetails = [];

        for (const item of newItems) {
            if (!item.productId || !item.serialIds || !Array.isArray(item.serialIds)) {
                await transaction.rollback();
                return res.status(400).json({
                    message: 'Each new item must have productId and serialIds array'
                });
            }

            const quantity = item.serialIds.length;

            // Get product
            const product = await Product.findByPk(item.productId, { transaction });
            if (!product) {
                await transaction.rollback();
                return res.status(404).json({
                    message: `Product ${item.productId} not found`
                });
            }

            // Check available serials - use targetBranchId instead of req.user.branchId
            const availableSerials = await ProductSerial.findAll({
                where: {
                    productId: item.productId,
                    branchId: targetBranchId,
                    orderItemId: null  // Only available serials
                },
                transaction
            });

            if (availableSerials.length < quantity) {
                await transaction.rollback();
                return res.status(400).json({
                    message: `Insufficient inventory for ${product.name}. Available: ${availableSerials.length}, Required: ${quantity}`
                });
            }

            // Validate serials
            const serials = await ProductSerial.findAll({
                where: {
                    id: item.serialIds,
                    productId: item.productId,
                    branchId: targetBranchId,
                    orderItemId: null
                },
                transaction
            });

            if (serials.length !== item.serialIds.length) {
                await transaction.rollback();
                return res.status(400).json({
                    message: `Invalid serials for ${product.name}. Provided: ${item.serialIds.length}, Available: ${serials.length}`
                });
            }

            const itemAmount = parseFloat(product.price) * quantity;
            newItemsAmount += itemAmount;

            newItemsDetails.push({
                product,
                quantity,
                serialIds: item.serialIds,
                serials,
                amount: itemAmount
            });
        }

        // Apply the same discount percentage to new items that was applied to the original order
        let discountedNewItemsAmount = newItemsAmount;
        if (parentOrder && parentOrder.discountAmount > 0 && parentOrder.subtotal > 0) {
            const discountPercentage = (parentOrder.discountAmount / parentOrder.subtotal) * 100;
            discountedNewItemsAmount = newItemsAmount * (1 - discountPercentage / 100);
        }

        // Calculate price difference using discounted amounts
        // Use manual price difference if provided, otherwise calculate automatically
        const priceDifference = manualPriceDifference !== undefined && manualPriceDifference !== null
            ? parseFloat(manualPriceDifference)
            : discountedNewItemsAmount - returnedAmount;

        // Validate payment
        if (priceDifference > 0) {
            // Customer needs to pay more
            if (paymentMethod === 'none') {
                await transaction.rollback();
                return res.status(400).json({
                    message: `Customer must pay ${priceDifference.toFixed(2)} more. Cannot use payment method 'none'`
                });
            }

            if (paymentMethod === 'cash') {
                if (!cashAmount || parseFloat(cashAmount) < priceDifference) {
                    await transaction.rollback();
                    return res.status(400).json({
                        message: `Insufficient cash payment. Required: ${priceDifference.toFixed(2)}, Provided: ${cashAmount || 0}`
                    });
                }
            } else if (paymentMethod === 'visa') {
                if (!visaAmount || parseFloat(visaAmount) < priceDifference) {
                    await transaction.rollback();
                    return res.status(400).json({
                        message: `Insufficient visa payment. Required: ${priceDifference.toFixed(2)}, Provided: ${visaAmount || 0}`
                    });
                }
            } else if (paymentMethod === 'mixed') {
                const totalPaid = parseFloat(cashAmount || 0) + parseFloat(visaAmount || 0);
                if (totalPaid < priceDifference) {
                    await transaction.rollback();
                    return res.status(400).json({
                        message: `Insufficient payment. Required: ${priceDifference.toFixed(2)}, Provided: ${totalPaid.toFixed(2)}`
                    });
                }
            }
        }

        // Calculate amounts for customer payment or refund
        const customerPayment = priceDifference > 0 ? priceDifference : 0;
        const refundToCustomer = priceDifference < 0 ? Math.abs(priceDifference) : 0;

        // Build detailed transaction log
        const transactionLog = {
            timestamp: new Date().toISOString(),
            originalOrder: {
                orderId: parentOrder.id,
                orderNumber: `ORD-${parentOrder.id.substring(0, 8).toUpperCase()}`,
                orderDate: parentOrder.createdAt
            },
            itemsReturned: isMultiItem ?
                originalOrderItems.map(item => ({
                    product: {
                        id: item.Product.id,
                        name: item.Product.name,
                        sku: item.Product.sku,
                        price: parseFloat(item.Product.price)
                    },
                    quantity: serialsByOrderItem[item.id] ? serialsByOrderItem[item.id].length : 0,
                    serials: serialsByOrderItem[item.id] ? serialsByOrderItem[item.id].map(s => s.serialCode) : [],
                    totalValue: serialsByOrderItem[item.id] ? serialsByOrderItem[item.id].length * parseFloat(item.Product.price) : 0
                })) :
                [{
                    product: {
                        id: originalOrderItems[0].Product.id,
                        name: originalOrderItems[0].Product.name,
                        sku: originalOrderItems[0].Product.sku,
                        price: parseFloat(originalOrderItems[0].Product.price)
                    },
                    quantity: returnQuantity,
                    serials: serialsToReturn.map(s => s.serialCode),
                    totalValue: returnedAmount
                }],
            itemsProvided: newItemsDetails.map(item => ({
                product: {
                    id: item.product.id,
                    name: item.product.name,
                    sku: item.product.sku,
                    price: parseFloat(item.product.price)
                },
                quantity: item.quantity,
                serials: item.serials.map(s => s.serialCode),
                totalValue: item.amount
            })),
            financial: {
                returnedItemsValue: returnedAmount,
                newItemsValue: newItemsAmount,
                priceDifference: priceDifference,
                customerPaid: customerPayment,
                refundedToCustomer: refundToCustomer,
                paymentMethod: priceDifference <= 0 ? 'none' : paymentMethod,
                cashReceived: priceDifference > 0 ? (cashAmount || 0) : 0,
                visaReceived: priceDifference > 0 ? (visaAmount || 0) : 0,
                changeGiven: priceDifference > 0 && paymentMethod === 'cash'
                    ? Math.max(0, parseFloat(cashAmount) - priceDifference)
                    : 0
            },
            processedBy: {
                userId: req.user.id,
                userName: req.user.name,
                userRole: req.user.role
            },
            reason: reason || 'No reason provided'
        };

        // Calculate total item count for tracking refunds
        const totalItemCount = newItemsDetails.reduce((sum, item) => sum + item.serialIds.length, 0);

        // Create new order for replacement items - use targetBranchId
        const newOrder = await Order.create({
            cashierId: req.user.id,
            branchId: targetBranchId,
            customerId: parentOrder.customerId,
            originalItemCount: totalItemCount,
            refundedItemsCount: 0,
            totalPrice: newItemsAmount,
            paymentMethod: priceDifference <= 0 ? 'cash' : paymentMethod,
            cashAmount: priceDifference > 0 ? (cashAmount || null) : 0,
            visaAmount: priceDifference > 0 ? (visaAmount || null) : 0,
            amountPaid: priceDifference > 0 ? Math.max(newItemsAmount, parseFloat(cashAmount || 0) + parseFloat(visaAmount || 0)) : newItemsAmount,
            changeAmount: priceDifference > 0 && paymentMethod === 'cash'
                ? Math.max(0, parseFloat(cashAmount) - priceDifference)
                : 0,
            status: 'completed'
        }, { transaction });

        const newOrderItems = [];

        // Process new items
        for (const itemDetail of newItemsDetails) {
            // Create order item
            const orderItem = await OrderItem.create({
                orderId: newOrder.id,
                productId: itemDetail.product.id,
                quantity: itemDetail.quantity
            }, { transaction });

            // Reduce inventory - use targetBranchId
            await Inventory.decrement('quantity', {
                by: itemDetail.quantity,
                where: {
                    productId: itemDetail.product.id,
                    branchId: targetBranchId
                },
                transaction
            });

            // Assign serials to order item
            for (const serial of itemDetail.serials) {
                await serial.update({
                    orderItemId: orderItem.id,
                    branchId: null,
                    note: `REPLACEMENT-ISSUE: Sold as replacement in order ${newOrder.id}. Original return from order ${parentOrder.id}. Product: ${itemDetail.product.name}. Date: ${new Date().toISOString()}`
                }, { transaction });
            }

            newOrderItems.push({
                orderItemId: orderItem.id,
                productId: itemDetail.product.id,
                productName: itemDetail.product.name,
                productSku: itemDetail.product.sku,
                quantity: itemDetail.quantity,
                price: parseFloat(itemDetail.product.price),
                amount: itemDetail.amount,
                serials: itemDetail.serials.map(s => s.serialCode)
            });
        }

        // Return original items to inventory (handle multiple order items) - use targetBranchId
        const inventoryUpdates = {};

        // Group return quantities by product
        for (const orderItem of originalOrderItems) {
            const itemSerials = serialsByOrderItem[orderItem.id] || [];
            const itemReturnQuantity = itemSerials.length;

            if (itemReturnQuantity > 0) {
                if (!inventoryUpdates[orderItem.productId]) {
                    inventoryUpdates[orderItem.productId] = 0;
                }
                inventoryUpdates[orderItem.productId] += itemReturnQuantity;
            }
        }

        // Update inventory for each product - use targetBranchId
        for (const [productId, returnQuantity] of Object.entries(inventoryUpdates)) {
            let returnInventory = await Inventory.findOne({
                where: {
                    productId: productId,
                    branchId: targetBranchId
                },
                transaction
            });

            if (returnInventory) {
                await returnInventory.update({
                    quantity: returnInventory.quantity + returnQuantity
                }, { transaction });
            } else {
                await Inventory.create({
                    productId: productId,
                    branchId: targetBranchId,
                    quantity: returnQuantity
                }, { transaction });
            }
        }

        // Unassign return serials - use targetBranchId
        for (const serial of serialsToReturn) {
            await serial.update({
                orderItemId: null,
                branchId: targetBranchId,
                note: `REPLACEMENT-RETURN: Returned from order ${parentOrder.id} via replacement ${newOrder.id}. Product: ${serial.Product?.name || 'Unknown'}. Date: ${new Date().toISOString()}`
            }, { transaction });
        }

        // Create replacement record - use targetBranchId
        const replacement = await Replacement.create({
            originalOrderItemId: isSingleItem ? originalOrderItemId : null, // Legacy field for single-item
            branchId: targetBranchId,
            newOrderId: newOrder.id,
            customerId: parentOrder.customerId,
            returnedAmount: returnedAmount,
            newItemsAmount: newItemsAmount,
            priceDifference: priceDifference,
            refundToCustomer: refundToCustomer,
            customerPayment: customerPayment,
            paymentMethod: priceDifference <= 0 ? 'none' : paymentMethod,
            cashAmount: priceDifference > 0 ? (cashAmount || null) : null,
            visaAmount: priceDifference > 0 ? (visaAmount || null) : null,
            transactionLog: JSON.stringify(transactionLog, null, 2),
            processedBy: req.user.id,
            reason: reason || null,
            status: 'completed'
        }, { transaction });

        // Create replacement order item records for multi-item replacements
        if (isMultiItem) {
            for (const orderItem of originalOrderItems) {
                const itemSerials = serialsByOrderItem[orderItem.id] || [];
                const itemReturnQuantity = itemSerials.length;
                const itemReturnedAmount = itemReturnQuantity * parseFloat(orderItem.Product.price);

                // Apply discount if applicable
                let finalItemReturnedAmount = itemReturnedAmount;
                if (parentOrder && parentOrder.discountAmount > 0 && parentOrder.subtotal > 0) {
                    const discountPercentage = (parentOrder.discountAmount / parentOrder.subtotal) * 100;
                    finalItemReturnedAmount = itemReturnedAmount * (1 - discountPercentage / 100);
                }

                await ReplacementOrderItem.create({
                    replacementId: replacement.id,
                    orderItemId: orderItem.id,
                    returnedAmount: finalItemReturnedAmount,
                    quantityReturned: itemReturnQuantity
                }, { transaction });
            }
        }

        await transaction.commit();

        return res.status(201).json({
            replacement: {
                id: replacement.id,
                originalOrderId: parentOrder.id,
                originalOrderNumber: `ORD-${parentOrder.id.substring(0, 8).toUpperCase()}`,
                newOrderId: newOrder.id,
                newOrderNumber: `ORD-${newOrder.id.substring(0, 8).toUpperCase()}`,
                status: replacement.status,
                reason: replacement.reason,
                createdAt: replacement.createdAt,
                isMultiItem: isMultiItem
            },
            originalItems: isMultiItem ?
                originalOrderItems.map(orderItem => {
                    const itemSerials = serialsByOrderItem[orderItem.id] || [];
                    return {
                        product: {
                            id: orderItem.Product.id,
                            name: orderItem.Product.name,
                            sku: orderItem.Product.sku,
                            price: parseFloat(orderItem.Product.price)
                        },
                        quantity: itemSerials.length,
                        serials: itemSerials.map(s => s.serialCode)
                    };
                }) :
                [{
                    product: {
                        id: originalOrderItems[0].Product.id,
                        name: originalOrderItems[0].Product.name,
                        sku: originalOrderItems[0].Product.sku,
                        price: parseFloat(originalOrderItems[0].Product.price)
                    },
                    quantity: returnQuantity,
                    amount: returnedAmount,
                    serialsReturned: serialsToReturn.map(s => s.serialCode)
                }],
            newOrder: {
                id: newOrder.id,
                orderNumber: `ORD-${newOrder.id.substring(0, 8).toUpperCase()}`,
                totalAmount: parseFloat(discountedNewItemsAmount),
                items: newOrderItems
            },
            customer: {
                id: parentOrder.Customer.id,
                name: parentOrder.Customer.name,
                phone: parentOrder.Customer.phone
            },
            financialSummary: {
                returnedAmount: parseFloat(returnedAmount),
                newItemsAmount: parseFloat(discountedNewItemsAmount),
                priceDifference: parseFloat(priceDifference),
                customerPayment: parseFloat(customerPayment),
                refundToCustomer: parseFloat(refundToCustomer),
                paymentMethod: replacement.paymentMethod,
                cashReceived: replacement.cashAmount ? parseFloat(replacement.cashAmount) : 0,
                visaReceived: replacement.visaAmount ? parseFloat(replacement.visaAmount) : 0,
                changeGiven: priceDifference > 0 && paymentMethod === 'cash'
                    ? Math.max(0, parseFloat(cashAmount) - priceDifference)
                    : 0,
                transactionType: refundToCustomer > 0
                    ? `REFUND - Customer received ${refundToCustomer.toFixed(2)} back`
                    : customerPayment > 0
                        ? `PAYMENT - Customer paid ${customerPayment.toFixed(2)} additional`
                        : 'EVEN EXCHANGE - No payment difference'
            },
            transactionLog: transactionLog,
            message: refundToCustomer > 0
                ? `Replacement processed successfully. Customer receives ${refundToCustomer.toFixed(2)} refund.`
                : customerPayment > 0
                    ? `Replacement processed successfully. Customer paid ${customerPayment.toFixed(2)} additional.`
                    : 'Replacement processed successfully. Even exchange.'
        });

    } catch (error) {
        try {
            await transaction.rollback();
        } catch (rollbackError) {
            console.error('Error rolling back transaction:', rollbackError);
        }
        console.error('Error creating admin replacement:', error);
        return res.status(500).json({
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * @swagger
 * /api/v1/replacements:
 *   get:
 *     summary: List all replacements (admin only)
 *     description: Get a list of all replacements system-wide
 *     tags: [Replacements]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [completed, cancelled]
 *         description: Filter by replacement status
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Maximum number of results to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Number of results to skip
 *     responses:
 *       200:
 *         description: List of replacements
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Internal server error
 */
router.get('/', auth, allowRoles(ROLES.ADMIN), async (req, res) => {
    try {
        const { status, limit = 50, offset = 0 } = req.query;

        const whereClause = {};
        if (status && ['completed', 'cancelled'].includes(status)) {
            whereClause.status = status;
        }

        const { count, rows: replacements } = await Replacement.findAndCountAll({
            where: whereClause,
            limit: parseInt(limit),
            offset: parseInt(offset),
            include: [
                {
                    model: OrderItem,
                    as: 'originalOrderItem',
                    include: [
                        {
                            model: Product,
                            attributes: ['id', 'name', 'sku', 'price']
                        },
                        {
                            model: Order,
                            attributes: ['id', 'createdAt']
                        }
                    ]
                },
                {
                    model: Order,
                    as: 'newOrder',
                    attributes: ['id', 'totalPrice', 'createdAt'],
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
                },
                {
                    model: Branch,
                    attributes: ['id', 'name']
                },
                {
                    model: Customer,
                    attributes: ['id', 'name', 'phone']
                },
                {
                    model: User,
                    as: 'processor',
                    attributes: ['id', 'name', 'email', 'role']
                }
            ],
            order: [['createdAt', 'DESC']]
        });

        // Fetch returned serials for each replacement
        const newOrderIds = replacements.map(r => r.newOrder?.id).filter(Boolean);
        const returnedSerials = await ProductSerial.findAll({
            where: {
                note: {
                    [sequelize.Sequelize.Op.like]: '%REPLACEMENT-RETURN%'
                }
            },
            attributes: ['id', 'serialCode', 'note', 'productId']
        });

        // Group serials by new order ID, then map to replacement
        const serialsByNewOrderId = {};
        returnedSerials.forEach(serial => {
            const match = serial.note.match(/via replacement ([a-f0-9-]+)/i);
            if (match) {
                const newOrderId = match[1];
                if (!serialsByNewOrderId[newOrderId]) {
                    serialsByNewOrderId[newOrderId] = [];
                }
                serialsByNewOrderId[newOrderId].push({
                    id: serial.id,
                    serialCode: serial.serialCode,
                    productId: serial.productId
                });
            }
        });

        const formattedReplacements = replacements.map(r => {
            // Try to get original order info from direct relation or fallback to transaction log
            let originalOrderId = r.originalOrderItem?.Order?.id;
            let originalOrderNumber = r.originalOrderItem?.Order?.id
                ? `ORD-${r.originalOrderItem.Order.id.substring(0, 8).toUpperCase()}`
                : null;

            if (!originalOrderId && r.transactionLog) {
                try {
                    const log = JSON.parse(r.transactionLog);
                    if (log && log.originalOrder) {
                        originalOrderId = log.originalOrder.orderId;
                        originalOrderNumber = log.originalOrder.orderNumber;
                    }
                } catch (e) {
                    // ignore parse error
                }
            }

            return {
                id: r.id,
                originalOrderId: originalOrderId,
                originalOrderNumber: originalOrderNumber,
                newOrderId: r.newOrder?.id,
                newOrderNumber: r.newOrder?.id
                    ? `ORD-${r.newOrder.id.substring(0, 8).toUpperCase()}`
                    : null,
                branch: r.Branch ? {
                    id: r.Branch.id,
                    name: r.Branch.name
                } : null,
                customer: r.Customer ? {
                    id: r.Customer.id,
                    name: r.Customer.name,
                    phone: r.Customer.phone
                } : null,
                returnedAmount: parseFloat(r.returnedAmount),
                newItemsAmount: parseFloat(r.newItemsAmount),
                priceDifference: parseFloat(r.priceDifference),
                refundToCustomer: parseFloat(r.refundToCustomer),
                customerPayment: parseFloat(r.customerPayment),
                paymentMethod: r.paymentMethod,
                status: r.status,
                reason: r.reason,
                serialsReturned: serialsByNewOrderId[r.newOrder?.id] || [],
                processedBy: r.processor ? {
                    id: r.processor.id,
                    name: r.processor.name,
                    email: r.processor.email,
                    role: r.processor.role
                } : null,
                createdAt: r.createdAt,
                updatedAt: r.updatedAt
            };
        });

        return res.status(200).json({
            replacements: formattedReplacements,
            total: count,
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

    } catch (error) {
        console.error('Error fetching replacements:', error);
        return res.status(500).json({
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * @swagger
 * /api/v1/replacements/branch:
 *   get:
 *     summary: List replacements for user's branch (branch_manager, cashier)
 *     description: Get a list of replacements for the authenticated user's branch
 *     tags: [Replacements]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [completed, cancelled]
 *         description: Filter by replacement status
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Maximum number of results to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Number of results to skip
 *     responses:
 *       200:
 *         description: List of branch replacements
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - user not assigned to branch
 *       500:
 *         description: Internal server error
 */
router.get('/branch', auth, allowRoles(ROLES.BRANCH_MANAGER, ROLES.CASHIER), async (req, res) => {
    try {
        const { status, limit = 50, offset = 0 } = req.query;

        if (!req.user.branchId) {
            return res.status(403).json({
                message: 'User must be assigned to a branch'
            });
        }

        const whereClause = {
            branchId: req.user.branchId
        };

        if (status && ['completed', 'cancelled'].includes(status)) {
            whereClause.status = status;
        }

        const { count, rows: replacements } = await Replacement.findAndCountAll({
            where: whereClause,
            limit: parseInt(limit),
            offset: parseInt(offset),
            include: [
                {
                    model: OrderItem,
                    as: 'originalOrderItem',
                    include: [
                        {
                            model: Product,
                            attributes: ['id', 'name', 'sku', 'price']
                        },
                        {
                            model: Order,
                            attributes: ['id', 'createdAt']
                        }
                    ]
                },
                {
                    model: Order,
                    as: 'newOrder',
                    attributes: ['id', 'totalPrice', 'createdAt'],
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
                },
                {
                    model: Branch,
                    attributes: ['id', 'name']
                },
                {
                    model: Customer,
                    attributes: ['id', 'name', 'phone']
                },
                {
                    model: User,
                    as: 'processor',
                    attributes: ['id', 'name', 'email', 'role']
                }
            ],
            order: [['createdAt', 'DESC']]
        });

        // Fetch returned serials for each replacement
        const newOrderIds = replacements.map(r => r.newOrder?.id).filter(Boolean);
        const returnedSerials = await ProductSerial.findAll({
            where: {
                note: {
                    [sequelize.Sequelize.Op.like]: '%REPLACEMENT-RETURN%'
                }
            },
            attributes: ['id', 'serialCode', 'note', 'productId']
        });

        // Group serials by new order ID, then map to replacement
        const serialsByNewOrderId = {};
        returnedSerials.forEach(serial => {
            const match = serial.note.match(/via replacement ([a-f0-9-]+)/i);
            if (match) {
                const newOrderId = match[1];
                if (!serialsByNewOrderId[newOrderId]) {
                    serialsByNewOrderId[newOrderId] = [];
                }
                serialsByNewOrderId[newOrderId].push({
                    id: serial.id,
                    serialCode: serial.serialCode,
                    productId: serial.productId
                });
            }
        });

        const formattedReplacements = replacements.map(r => {
            // Try to get original order info from direct relation or fallback to transaction log
            let originalOrderId = r.originalOrderItem?.Order?.id;
            let originalOrderNumber = r.originalOrderItem?.Order?.id
                ? `ORD-${r.originalOrderItem.Order.id.substring(0, 8).toUpperCase()}`
                : null;

            if (!originalOrderId && r.transactionLog) {
                try {
                    const log = JSON.parse(r.transactionLog);
                    if (log && log.originalOrder) {
                        originalOrderId = log.originalOrder.orderId;
                        originalOrderNumber = log.originalOrder.orderNumber;
                    }
                } catch (e) {
                    // ignore parse error
                }
            }

            return {
                id: r.id,
                originalOrderId: originalOrderId,
                originalOrderNumber: originalOrderNumber,
                newOrderId: r.newOrder?.id,
                newOrderNumber: r.newOrder?.id
                    ? `ORD-${r.newOrder.id.substring(0, 8).toUpperCase()}`
                    : null,
                branch: r.Branch ? {
                    id: r.Branch.id,
                    name: r.Branch.name
                } : null,
                customer: r.Customer ? {
                    id: r.Customer.id,
                    name: r.Customer.name,
                    phone: r.Customer.phone
                } : null,
                returnedAmount: parseFloat(r.returnedAmount),
                newItemsAmount: parseFloat(r.newItemsAmount),
                priceDifference: parseFloat(r.priceDifference),
                refundToCustomer: parseFloat(r.refundToCustomer),
                customerPayment: parseFloat(r.customerPayment),
                paymentMethod: r.paymentMethod,
                status: r.status,
                reason: r.reason,
                serialsReturned: serialsByNewOrderId[r.newOrder?.id] || [],
                processedBy: r.processor ? {
                    id: r.processor.id,
                    name: r.processor.name,
                    email: r.processor.email,
                    role: r.processor.role
                } : null,
                createdAt: r.createdAt,
                updatedAt: r.updatedAt
            };
        });

        return res.status(200).json({
            replacements: formattedReplacements,
            total: count,
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

    } catch (error) {
        console.error('Error fetching branch replacements:', error);
        return res.status(500).json({
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * @swagger
 * /api/v1/replacements/{id}:
 *   get:
 *     summary: Get replacement details by ID
 *     description: Get detailed information about a specific replacement including all items and serials
 *     tags: [Replacements]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Replacement ID
 *     responses:
 *       200:
 *         description: Replacement details
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Replacement not found
 *       500:
 *         description: Internal server error
 */
router.get('/:id', auth, allowRoles(ROLES.ADMIN, ROLES.BRANCH_MANAGER, ROLES.CASHIER), async (req, res) => {
    try {
        const { id } = req.params;

        const replacement = await Replacement.findByPk(id, {
            include: [
                {
                    model: OrderItem,
                    as: 'originalOrderItem',
                    include: [
                        {
                            model: Product,
                            attributes: ['id', 'name', 'sku', 'price']
                        },
                        {
                            model: Order,
                            attributes: ['id', 'createdAt']
                        },
                        {
                            model: ProductSerial,
                            where: {
                                note: {
                                    [sequelize.Sequelize.Op.like]: `%REPLACEMENT-RETURN%`
                                }
                            },
                            required: false
                        }
                    ]
                },
                {
                    model: Order,
                    as: 'newOrder',
                    attributes: ['id', 'totalPrice', 'paymentMethod', 'createdAt'],
                    include: [
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
                    ]
                },
                {
                    model: Branch,
                    attributes: ['id', 'name']
                },
                {
                    model: Customer,
                    attributes: ['id', 'name', 'phone']
                },
                {
                    model: User,
                    as: 'processor',
                    attributes: ['id', 'name', 'email', 'role']
                }
            ]
        });

        if (!replacement) {
            return res.status(404).json({ message: 'Replacement not found' });
        }

        // Check authorization for branch-specific users
        if (req.user.role !== ROLES.ADMIN && req.user.branchId !== replacement.branchId) {
            return res.status(403).json({
                message: 'Cannot view replacements from other branches'
            });
        }

        // Parse transaction log for fallbacks
        let transactionLog = null;
        try {
            if (replacement.transactionLog) {
                transactionLog = JSON.parse(replacement.transactionLog);
            }
        } catch (e) {
            console.error('Error parsing transaction log:', e);
        }

        // Determine original order details (Relation -> Fallback)
        let originalOrderData = null;
        if (replacement.originalOrderItem?.Order) {
            originalOrderData = {
                orderId: replacement.originalOrderItem.Order.id,
                orderNumber: `ORD-${replacement.originalOrderItem.Order.id.substring(0, 8).toUpperCase()}`,
                orderDate: replacement.originalOrderItem.Order.createdAt,
                product: replacement.originalOrderItem.Product ? {
                    id: replacement.originalOrderItem.Product.id,
                    name: replacement.originalOrderItem.Product.name,
                    sku: replacement.originalOrderItem.Product.sku,
                    price: parseFloat(replacement.originalOrderItem.Product.price)
                } : null,
                serialsReturned: replacement.originalOrderItem.ProductSerials?.map(s => ({
                    id: s.id,
                    serialCode: s.serialCode
                })) || []
            };
        } else if (transactionLog && transactionLog.originalOrder) {
            console.log('Using transaction log fallback for original order');
            // Fallback to transaction log
            originalOrderData = {
                orderId: transactionLog.originalOrder.orderId,
                orderNumber: transactionLog.originalOrder.orderNumber,
                orderDate: transactionLog.originalOrder.orderDate,
                product: transactionLog.itemsReturned && transactionLog.itemsReturned.length > 0 ? transactionLog.itemsReturned[0].product : null,
                serialsReturned: [] // Serials might be harder to reconstruct perfectly from log without structure match
            };
        }

        return res.status(200).json({
            replacement: {
                id: replacement.id,
                originalOrderNumber: originalOrderData ? originalOrderData.orderNumber : null,
                originalOrderId: originalOrderData ? originalOrderData.orderId : null,
                originalOrder: originalOrderData || {
                    orderId: null,
                    orderNumber: null,
                    orderDate: null,
                    product: null,
                    serialsReturned: []
                },
                newOrder: {
                    orderId: replacement.newOrder?.id,
                    orderNumber: replacement.newOrder?.id
                        ? `ORD-${replacement.newOrder.id.substring(0, 8).toUpperCase()}`
                        : null,
                    orderDate: replacement.newOrder?.createdAt,
                    items: replacement.newOrder?.OrderItems?.map(item => ({
                        orderItemId: item.id,
                        product: {
                            id: item.Product.id,
                            name: item.Product.name,
                            sku: item.Product.sku,
                            price: parseFloat(item.Product.price)
                        },
                        quantity: item.quantity,
                        serials: item.ProductSerials?.map(s => ({
                            id: s.id,
                            serialCode: s.serialCode
                        })) || []
                    })) || []
                },
                branch: replacement.Branch ? {
                    id: replacement.Branch.id,
                    name: replacement.Branch.name
                } : null,
                customer: replacement.Customer ? {
                    id: replacement.Customer.id,
                    name: replacement.Customer.name,
                    phone: replacement.Customer.phone
                } : null,
                financial: {
                    returnedAmount: parseFloat(replacement.returnedAmount),
                    newItemsAmount: parseFloat(replacement.newItemsAmount),
                    priceDifference: parseFloat(replacement.priceDifference),
                    refundToCustomer: parseFloat(replacement.refundToCustomer),
                    customerPayment: parseFloat(replacement.customerPayment),
                    paymentMethod: replacement.paymentMethod,
                    cashAmount: replacement.cashAmount ? parseFloat(replacement.cashAmount) : null,
                    visaAmount: replacement.visaAmount ? parseFloat(replacement.visaAmount) : null
                },
                status: replacement.status,
                reason: replacement.reason,
                transactionLog: transactionLog,
                processedBy: replacement.processor ? {
                    id: replacement.processor.id,
                    name: replacement.processor.name,
                    email: replacement.processor.email,
                    role: replacement.processor.role
                } : null,
                createdAt: replacement.createdAt,
                updatedAt: replacement.updatedAt
            }
        });

    } catch (error) {
        console.error('Error fetching replacement details:', error);
        return res.status(500).json({
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

module.exports = router;

