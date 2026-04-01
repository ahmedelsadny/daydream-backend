const express = require('express');
const { Order, OrderItem, Product, Refund, Inventory, ProductSerial, Branch, User, sequelize } = require('../models');
const auth = require('../middleware/auth');
const { allowRoles, ROLES } = require('../middleware/roles');

const router = express.Router();

/**
 * @swagger
 * /api/v1/refunds:
 *   get:
 *     summary: List all refunds (admin only)
 *     description: Get a list of all refunds system-wide with their associated serial codes. Only accessible to admins.
 *     tags: [Refunds]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, approved, rejected]
 *         description: Filter by refund status
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
 *         description: List of refunds with serials
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 refunds:
 *                   type: array
 *                   items:
 *                     type: object
 *                 total:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *                 offset:
 *                   type: integer
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - insufficient permissions
 *       500:
 *         description: Internal server error
 */
router.get('/', auth, allowRoles(ROLES.ADMIN), async (req, res) => {
    try {
        const { status, limit = 50, offset = 0 } = req.query;
        
        // Build where clause
        const whereClause = {};
        
        // Filter by status if provided
        if (status && ['pending', 'approved', 'rejected'].includes(status)) {
            whereClause.status = status;
        }
        
        // Fetch refunds with related data
        const { count, rows: refunds } = await Refund.findAndCountAll({
            where: whereClause,
            limit: parseInt(limit),
            offset: parseInt(offset),
            include: [
                {
                    model: OrderItem,
                    include: [
                        {
                            model: Product,
                            attributes: ['id', 'name', 'sku', 'price']
                        },
                        {
                            model: Order,
                            attributes: ['id', 'subtotal', 'discountPercentage', 'discountAmount', 'totalPrice', 'createdAt'],
                            include: [
                                {
                                    model: Branch,
                                    attributes: ['id', 'name']
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
                    model: User,
                    as: 'requester',
                    attributes: ['id', 'name', 'email', 'role']
                },
                {
                    model: User,
                    as: 'approver',
                    attributes: ['id', 'name', 'email', 'role']
                }
            ],
            order: [['createdAt', 'DESC']]
        });
        
        // Fetch serials for each refund
        const refundIds = refunds.map(r => r.id);
        const serials = await ProductSerial.findAll({
            where: {
                note: {
                    [sequelize.Sequelize.Op.in]: refundIds.map(id => `refunded - refund ${id}`)
                }
            },
            attributes: ['id', 'serialCode', 'note', 'productId']
        });
        
        // Group serials by refund ID
        const serialsByRefund = {};
        serials.forEach(serial => {
            const match = serial.note.match(/refunded - refund (.+)/);
            if (match) {
                const refundId = match[1];
                if (!serialsByRefund[refundId]) {
                    serialsByRefund[refundId] = [];
                }
                serialsByRefund[refundId].push({
                    id: serial.id,
                    serialCode: serial.serialCode,
                    productId: serial.productId
                });
            }
        });
        
        // Format response
        const formattedRefunds = refunds.map(refund => ({
            id: refund.id,
            orderItemId: refund.orderItemId,
            orderId: refund.OrderItem?.Order?.id,
            orderNumber: refund.OrderItem?.Order?.id ? `ORD-${refund.OrderItem.Order.id.substring(0, 8).toUpperCase()}` : null,
            orderDate: refund.OrderItem?.Order?.createdAt,
            originalOrder: refund.OrderItem?.Order ? {
                id: refund.OrderItem.Order.id,
                orderNumber: `ORD-${refund.OrderItem.Order.id.substring(0, 8).toUpperCase()}`,
                subtotal: refund.OrderItem.Order.subtotal ? parseFloat(refund.OrderItem.Order.subtotal) : parseFloat(refund.OrderItem.Order.totalPrice),
                discountApplied: refund.OrderItem.Order.discountAmount > 0,
                discountPercentage: refund.OrderItem.Order.discountPercentage ? parseFloat(refund.OrderItem.Order.discountPercentage) : null,
                discountAmount: refund.OrderItem.Order.discountAmount ? parseFloat(refund.OrderItem.Order.discountAmount) : null,
                totalPrice: parseFloat(refund.OrderItem.Order.totalPrice),
                createdAt: refund.OrderItem.Order.createdAt
            } : null,
            branch: refund.Branch ? {
                id: refund.Branch.id,
                name: refund.Branch.name
            } : null,
            product: refund.OrderItem?.Product ? {
                id: refund.OrderItem.Product.id,
                name: refund.OrderItem.Product.name,
                sku: refund.OrderItem.Product.sku,
                price: parseFloat(refund.OrderItem.Product.price)
            } : null,
            quantity: refund.quantity,
            status: refund.status,
            refundAmount: parseFloat(refund.refundAmount),
            reason: refund.reason,
            serials: serialsByRefund[refund.id] || [],
            requestedBy: refund.requester ? {
                id: refund.requester.id,
                name: refund.requester.name,
                email: refund.requester.email,
                role: refund.requester.role
            } : null,
            approvedBy: refund.approver ? {
                id: refund.approver.id,
                name: refund.approver.name,
                email: refund.approver.email,
                role: refund.approver.role
            } : null,
            createdAt: refund.createdAt,
            updatedAt: refund.updatedAt
        }));
        
        return res.status(200).json({
            refunds: formattedRefunds,
            total: count,
            limit: parseInt(limit),
            offset: parseInt(offset)
        });
        
    } catch (error) {
        console.error('Error fetching refunds:', error);
        return res.status(500).json({
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * @swagger
 * /api/v1/refunds/branch:
 *   get:
 *     summary: List refunds for user's branch (branch_manager, cashier)
 *     description: Get a list of refunds for the authenticated user's branch with their associated serial codes. Only accessible to branch managers and cashiers assigned to a branch.
 *     tags: [Refunds]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, approved, rejected]
 *         description: Filter by refund status
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
 *         description: List of branch refunds with serials
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 refunds:
 *                   type: array
 *                   items:
 *                     type: object
 *                 total:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *                 offset:
 *                   type: integer
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - user not assigned to a branch
 *       500:
 *         description: Internal server error
 */
router.get('/branch', auth, allowRoles(ROLES.BRANCH_MANAGER, ROLES.CASHIER), async (req, res) => {
    try {
        const { status, limit = 50, offset = 0 } = req.query;
        
        // Ensure user has a branch assigned
        if (!req.user.branchId) {
            return res.status(403).json({
                message: 'User must be assigned to a branch'
            });
        }
        
        // Build where clause
        const whereClause = {
            branchId: req.user.branchId
        };
        
        // Filter by status if provided
        if (status && ['pending', 'approved', 'rejected'].includes(status)) {
            whereClause.status = status;
        }
        
        // Fetch refunds with related data
        const { count, rows: refunds } = await Refund.findAndCountAll({
            where: whereClause,
            limit: parseInt(limit),
            offset: parseInt(offset),
            include: [
                {
                    model: OrderItem,
                    include: [
                        {
                            model: Product,
                            attributes: ['id', 'name', 'sku', 'price']
                        },
                        {
                            model: Order,
                            attributes: ['id', 'subtotal', 'discountPercentage', 'discountAmount', 'totalPrice', 'createdAt'],
                            include: [
                                {
                                    model: Branch,
                                    attributes: ['id', 'name']
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
                    model: User,
                    as: 'requester',
                    attributes: ['id', 'name', 'email', 'role']
                },
                {
                    model: User,
                    as: 'approver',
                    attributes: ['id', 'name', 'email', 'role']
                }
            ],
            order: [['createdAt', 'DESC']]
        });
        
        // Fetch serials for each refund
        const refundIds = refunds.map(r => r.id);
        const serials = await ProductSerial.findAll({
            where: {
                note: {
                    [sequelize.Sequelize.Op.in]: refundIds.map(id => `refunded - refund ${id}`)
                }
            },
            attributes: ['id', 'serialCode', 'note', 'productId']
        });
        
        // Group serials by refund ID
        const serialsByRefund = {};
        serials.forEach(serial => {
            const match = serial.note.match(/refunded - refund (.+)/);
            if (match) {
                const refundId = match[1];
                if (!serialsByRefund[refundId]) {
                    serialsByRefund[refundId] = [];
                }
                serialsByRefund[refundId].push({
                    id: serial.id,
                    serialCode: serial.serialCode,
                    productId: serial.productId
                });
            }
        });
        
        // Format response
        const formattedRefunds = refunds.map(refund => ({
            id: refund.id,
            orderItemId: refund.orderItemId,
            orderId: refund.OrderItem?.Order?.id,
            orderNumber: refund.OrderItem?.Order?.id ? `ORD-${refund.OrderItem.Order.id.substring(0, 8).toUpperCase()}` : null,
            orderDate: refund.OrderItem?.Order?.createdAt,
            originalOrder: refund.OrderItem?.Order ? {
                id: refund.OrderItem.Order.id,
                orderNumber: `ORD-${refund.OrderItem.Order.id.substring(0, 8).toUpperCase()}`,
                subtotal: refund.OrderItem.Order.subtotal ? parseFloat(refund.OrderItem.Order.subtotal) : parseFloat(refund.OrderItem.Order.totalPrice),
                discountApplied: refund.OrderItem.Order.discountAmount > 0,
                discountPercentage: refund.OrderItem.Order.discountPercentage ? parseFloat(refund.OrderItem.Order.discountPercentage) : null,
                discountAmount: refund.OrderItem.Order.discountAmount ? parseFloat(refund.OrderItem.Order.discountAmount) : null,
                totalPrice: parseFloat(refund.OrderItem.Order.totalPrice),
                createdAt: refund.OrderItem.Order.createdAt
            } : null,
            branch: refund.Branch ? {
                id: refund.Branch.id,
                name: refund.Branch.name
            } : null,
            product: refund.OrderItem?.Product ? {
                id: refund.OrderItem.Product.id,
                name: refund.OrderItem.Product.name,
                sku: refund.OrderItem.Product.sku,
                price: parseFloat(refund.OrderItem.Product.price)
            } : null,
            quantity: refund.quantity,
            status: refund.status,
            refundAmount: parseFloat(refund.refundAmount),
            reason: refund.reason,
            serials: serialsByRefund[refund.id] || [],
            requestedBy: refund.requester ? {
                id: refund.requester.id,
                name: refund.requester.name,
                email: refund.requester.email,
                role: refund.requester.role
            } : null,
            approvedBy: refund.approver ? {
                id: refund.approver.id,
                name: refund.approver.name,
                email: refund.approver.email,
                role: refund.approver.role
            } : null,
            createdAt: refund.createdAt,
            updatedAt: refund.updatedAt
        }));
        
        return res.status(200).json({
            refunds: formattedRefunds,
            total: count,
            limit: parseInt(limit),
            offset: parseInt(offset)
        });
        
    } catch (error) {
        console.error('Error fetching branch refunds:', error);
        return res.status(500).json({
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Request refund for expired orders (after 18 days) - cashier, branch_manager
router.post('/request', auth, allowRoles(ROLES.BRANCH_MANAGER, ROLES.CASHIER), async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
        const { orderItemId, serialIds, reason, manualRefundAmount } = req.body;

        // Validate required fields
        if (!orderItemId) {
            await transaction.rollback();
            return res.status(400).json({ message: 'orderItemId is required' });
        }

        if (!serialIds || !Array.isArray(serialIds) || serialIds.length === 0) {
            await transaction.rollback();
            return res.status(400).json({ message: 'serialIds array is required and must not be empty' });
        }

        if (!reason || reason.trim().length === 0) {
            await transaction.rollback();
            return res.status(400).json({ message: 'reason is required for late refund requests' });
        }

        const quantity = serialIds.length;

        // Ensure user has a branch assigned
        if (!req.user.branchId) {
            await transaction.rollback();
            return res.status(403).json({
                message: 'User is not assigned to any branch'
            });
        }

        // Get order item with related data
        const orderItem = await OrderItem.findByPk(orderItemId, {
            include: [
                {
                    model: Order,
                    include: [
                        { model: Branch }
                    ]
                },
                {
                    model: Product
                },
                {
                    model: ProductSerial
                }
            ],
            transaction
        });

        if (!orderItem) {
            await transaction.rollback();
            return res.status(404).json({ message: 'Order item not found' });
        }

        // Verify order belongs to user's branch
        if (orderItem.Order.branchId !== req.user.branchId) {
            await transaction.rollback();
            return res.status(403).json({
                message: 'Cannot request refund for items from other branches'
            });
        }

        // Validate quantity
        if (quantity > orderItem.quantity) {
            await transaction.rollback();
            return res.status(400).json({
                message: `Cannot refund more than purchased quantity. Purchased: ${orderItem.quantity}, Requested: ${quantity}`
            });
        }

        // Check if order item has been fully refunded or has pending requests
        const existingRefunds = await Refund.findAll({
            where: { orderItemId: orderItemId },
            transaction
        });

        // Calculate total already refunded quantity
        const totalRefundedQuantity = existingRefunds.reduce((sum, refund) => sum + refund.quantity, 0);
        
        // Check if trying to refund more than available
        if (totalRefundedQuantity + quantity > orderItem.quantity) {
            await transaction.rollback();
            return res.status(400).json({
                message: `Cannot refund more than available quantity. Available: ${orderItem.quantity - totalRefundedQuantity}, Requested: ${quantity}`
            });
        }

        // Check for pending requests (only if there are any)
        const pendingRefund = existingRefunds.find(refund => refund.status === 'pending');
        if (pendingRefund) {
            await transaction.rollback();
            return res.status(400).json({
                message: `This order item already has a pending refund request`
            });
        }

        // Validate that the provided serials belong to this order item
        const serialsToRefund = await ProductSerial.findAll({
            where: {
                id: serialIds,
                orderItemId: orderItemId,
                productId: orderItem.productId
            },
            transaction
        });

        if (serialsToRefund.length !== serialIds.length) {
            await transaction.rollback();
            return res.status(400).json({
                message: `Invalid serials provided. Some serials don't belong to this order item or don't exist. Provided: ${serialIds.length}, Valid: ${serialsToRefund.length}`
            });
        }

        // Check for duplicate serials in the request
        const uniqueSerials = [...new Set(serialIds)];
        if (uniqueSerials.length !== serialIds.length) {
            await transaction.rollback();
            return res.status(400).json({
                message: 'Cannot refund the same serial twice'
            });
        }

        // Get order for tracking refunded items count (needed regardless of manual/automatic calculation)
        const order = await Order.findByPk(orderItem.Order.id, { 
            include: [{ model: OrderItem, as: 'OrderItems' }],
            transaction 
        });

        // Calculate refund amount - use manual amount if provided, otherwise calculate automatically
        let refundAmount = 0;
        
        if (manualRefundAmount && manualRefundAmount > 0) {
            // Use manual amount if provided
            refundAmount = parseFloat(manualRefundAmount);
            console.log('Using manual refund amount:', refundAmount);
            
            // Still need to update refunded items count even with manual amount
            if (order) {
                const currentRefundedCount = order.refundedItemsCount || 0;
                const newRefundedCount = currentRefundedCount + quantity;
                await order.update({
                    refundedItemsCount: newRefundedCount
                }, { transaction });
            }
        } else {
            // Fallback to automatic calculation (original logic)
            refundAmount = parseFloat(orderItem.Product.price) * quantity;
            console.log('Using automatic refund calculation:', refundAmount);
            
            if (order) {
                // Fix: Ensure originalItemCount is set for existing orders
                if (order.originalItemCount === null || order.originalItemCount === undefined || order.originalItemCount === 0) {
                    console.log('🔧 FIXING MISSING originalItemCount for order:', order.id);
                    const totalOrderItems = order.OrderItems ? 
                        order.OrderItems.reduce((sum, item) => sum + item.quantity, 0) : 0;
                    
                    console.log('  Calculated originalItemCount:', totalOrderItems);
                    
                    // Update the order with original item count
                    await order.update({
                        originalItemCount: totalOrderItems
                    }, { transaction });
                    
                    // Refresh the order object
                    order.originalItemCount = totalOrderItems;
                    console.log('  ✅ Updated order.originalItemCount to:', order.originalItemCount);
                }
                
                // Handle regular discount
                if (order.discountAmount > 0 && order.subtotal > 0) {
                    const discountPercentage = (order.discountAmount / order.subtotal) * 100;
                    
                    // Check if this is specifically a 10% discount (likely for 6+ items)
                    if (Math.abs(discountPercentage - 10.0) < 0.01) {
                        // Get current refunded items count
                        const currentRefundedCount = order.refundedItemsCount || 0;
                        const newRefundedCount = currentRefundedCount + quantity;
                        const remainingItemsAfterRefund = order.originalItemCount - newRefundedCount;
                        
                        // Check if discount has already been revoked
                        const currentRemainingItems = order.originalItemCount - currentRefundedCount;
                        const discountAlreadyRevoked = order.discountRevoked;
                        
                        console.log('🔍 DISCOUNT REVOCATION DEBUG:');
                        console.log('  remainingItemsAfterRefund:', remainingItemsAfterRefund);
                        console.log('  order.originalItemCount:', order.originalItemCount);
                        console.log('  discountAlreadyRevoked:', discountAlreadyRevoked);
                        console.log('  order.discountRevoked:', order.discountRevoked);
                        console.log('  original item price:', parseFloat(orderItem.Product.price));
                        console.log('  quantity:', quantity);
                        
                        if (order.discountRevoked === true) {
                            // Discount already revoked previously → refund original price
                            refundAmount = parseFloat(orderItem.Product.price) * quantity;
                            console.log('  ✅ DISCOUNT ALREADY REVOKED - refunding original price:', refundAmount);
                        } else if (remainingItemsAfterRefund < 6 && order.originalItemCount >= 6) {
                            // Crossing below 6 for the first time → apply one-time penalty equal to full original discount
                            refundAmount = (parseFloat(orderItem.Product.price) * quantity) - order.discountAmount;
                            console.log('  ✅ DISCOUNT PENALTY APPLIED - first time below 6:', refundAmount);
                            console.log(`    Gross refund: $${parseFloat(orderItem.Product.price) * quantity}`);
                            console.log(`    Original discount: $${order.discountAmount}`);
                            console.log(`    Net refund after penalty: $${refundAmount}`);
                            if (!order.discountRevoked) {
                                await order.update({ discountRevoked: true }, { transaction });
                            }
                        } else {
                            // Still 6+ items → keep discount
                            refundAmount = refundAmount * (1 - discountPercentage / 100);
                            console.log('  ✅ KEEPING DISCOUNT - still 6+ items:', refundAmount);
                        }
                        
                        // Update refunded items count
                        await order.update({
                            refundedItemsCount: newRefundedCount
                        }, { transaction });
                    } else {
                        // For other discount percentages, apply normally
                        refundAmount = refundAmount * (1 - discountPercentage / 100);
                    }
                }
            }
        }

        // Create refund request with pending status
        const refund = await Refund.create({
            orderItemId: orderItemId,
            branchId: req.user.branchId,
            quantity: quantity,
            status: 'pending',
            refundAmount: refundAmount,
            requestedBy: req.user.id,
            reason: reason,
            approvedBy: null
        }, { transaction });

        // Store serial IDs in a temporary note for later processing
        const serialIdsList = serialIds.join(',');
        await refund.update({
            reason: `${reason}\n[SERIAL_IDS:${serialIdsList}]`
        }, { transaction });

        await transaction.commit();

        const orderDate = new Date(orderItem.Order.createdAt);
        const daysSinceOrder = Math.floor((new Date() - orderDate) / (1000 * 60 * 60 * 24));

        return res.status(201).json({
            refund: {
                id: refund.id,
                orderItemId: refund.orderItemId,
                branchId: refund.branchId,
                quantity: refund.quantity,
                status: refund.status,
                refundAmount: parseFloat(refund.refundAmount),
                requestedBy: refund.requestedBy,
                reason: reason,
                createdAt: refund.createdAt
            },
            originalOrder: {
                id: orderItem.Order.id,
                orderNumber: `ORD-${orderItem.Order.id.substring(0, 8).toUpperCase()}`,
                subtotal: orderItem.Order.subtotal ? parseFloat(orderItem.Order.subtotal) : parseFloat(orderItem.Order.totalPrice),
                discountApplied: orderItem.Order.discountAmount > 0,
                discountPercentage: orderItem.Order.discountPercentage ? parseFloat(orderItem.Order.discountPercentage) : null,
                discountAmount: orderItem.Order.discountAmount ? parseFloat(orderItem.Order.discountAmount) : null,
                totalPrice: parseFloat(orderItem.Order.totalPrice),
                createdAt: orderItem.Order.createdAt
            },
            product: {
                id: orderItem.Product.id,
                name: orderItem.Product.name,
                sku: orderItem.Product.sku
            },
            orderDate: orderDate,
            daysSinceOrder: daysSinceOrder,
            serialsRequested: serialsToRefund.map(s => s.serialCode),
            message: 'Refund request created successfully. Awaiting admin approval.'
        });

    } catch (error) {
        try {
            await transaction.rollback();
        } catch (rollbackError) {
            console.error('Error rolling back transaction:', rollbackError);
        }
        console.error('Error creating refund request:', error);
        return res.status(500).json({
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * @swagger
 * /api/v1/refunds/admin:
 *   post:
 *     summary: Create refund (admin only)
 *     description: |
 *       Admin-only endpoint to create a refund. Admin does not need to be assigned to a branch.
 *       Optional body.branchId selects which branch receives the refund amount and returned inventory; if omitted, the order's branch is used.
 *     tags: [Refunds]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - orderItemId
 *               - serialIds
 *             properties:
 *               orderItemId:
 *                 type: string
 *                 description: Order item ID (UUID)
 *               serialIds:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 description: Product serial IDs to refund
 *               reason:
 *                 type: string
 *                 description: Optional reason for refund
 *               manualRefundAmount:
 *                 type: number
 *                 description: Optional manual refund amount (otherwise calculated)
 *               branchId:
 *                 type: integer
 *                 description: Optional branch ID where refund and inventory are returned. If omitted, order's branch is used.
 *     responses:
 *       201:
 *         description: Refund created successfully
 *       400:
 *         description: Bad request (validation, quantity, serials, refund window)
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - admin only
 *       404:
 *         description: Order item or branch not found
 *       500:
 *         description: Internal server error
 */
// Create refund (admin only) - separate endpoint; admin may choose return branch
router.post('/admin', auth, allowRoles(ROLES.ADMIN), async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
        const { orderItemId, serialIds, reason, manualRefundAmount, branchId: bodyBranchId } = req.body;

        if (!orderItemId) {
            await transaction.rollback();
            return res.status(400).json({ message: 'orderItemId is required' });
        }

        if (!serialIds || !Array.isArray(serialIds) || serialIds.length === 0) {
            await transaction.rollback();
            return res.status(400).json({ message: 'serialIds array is required and must not be empty' });
        }

        const quantity = serialIds.length;

        const orderItem = await OrderItem.findByPk(orderItemId, {
            include: [
                { model: Order, include: [{ model: Branch }] },
                { model: Product },
                { model: ProductSerial }
            ],
            transaction
        });

        if (!orderItem) {
            await transaction.rollback();
            return res.status(404).json({ message: 'Order item not found' });
        }

        let targetBranchId;
        if (bodyBranchId != null && bodyBranchId !== '') {
            const branch = await Branch.findByPk(bodyBranchId, { transaction });
            if (!branch) {
                await transaction.rollback();
                return res.status(404).json({ message: 'Branch not found' });
            }
            targetBranchId = branch.id;
        } else {
            targetBranchId = orderItem.Order.branchId;
        }

        const refundWindowMinutes = 30 * 24 * 60;
        const orderDate = new Date(orderItem.Order.createdAt);
        const now = new Date();
        const minutesSinceOrder = (now - orderDate) / (1000 * 60);

        if (minutesSinceOrder > refundWindowMinutes) {
            await transaction.rollback();
            const daysSinceOrder = Math.floor(minutesSinceOrder / (24 * 60));
            return res.status(400).json({
                message: `Refund window expired. Orders can only be refunded within 18 days of purchase`,
                orderDate: orderDate,
                daysSinceOrder: daysSinceOrder
            });
        }

        if (quantity > orderItem.quantity) {
            await transaction.rollback();
            return res.status(400).json({
                message: `Cannot refund more than purchased quantity. Purchased: ${orderItem.quantity}, Requested: ${quantity}`
            });
        }

        const existingRefunds = await Refund.findAll({
            where: { orderItemId: orderItemId },
            transaction
        });
        const totalRefundedQuantity = existingRefunds.reduce((sum, r) => sum + r.quantity, 0);
        if (totalRefundedQuantity + quantity > orderItem.quantity) {
            await transaction.rollback();
            return res.status(400).json({
                message: `Cannot refund more than available quantity. Available: ${orderItem.quantity - totalRefundedQuantity}, Requested: ${quantity}`
            });
        }

        const serialsToRefund = await ProductSerial.findAll({
            where: {
                id: serialIds,
                orderItemId: orderItemId,
                productId: orderItem.productId
            },
            transaction
        });

        if (serialsToRefund.length !== serialIds.length) {
            await transaction.rollback();
            return res.status(400).json({
                message: `Invalid serials provided. Some serials don't belong to this order item or don't exist. Provided: ${serialIds.length}, Valid: ${serialsToRefund.length}`
            });
        }

        const uniqueSerials = [...new Set(serialIds)];
        if (uniqueSerials.length !== serialIds.length) {
            await transaction.rollback();
            return res.status(400).json({ message: 'Cannot refund the same serial twice' });
        }

        const order = await Order.findByPk(orderItem.Order.id, {
            include: [{ model: OrderItem, as: 'OrderItems' }],
            transaction
        });

        let refundAmount = 0;
        if (manualRefundAmount && manualRefundAmount > 0) {
            refundAmount = parseFloat(manualRefundAmount);
            if (order) {
                const currentRefundedCount = order.refundedItemsCount || 0;
                const newRefundedCount = currentRefundedCount + quantity;
                await order.update({ refundedItemsCount: newRefundedCount }, { transaction });
            }
        } else {
            refundAmount = parseFloat(orderItem.Product.price) * quantity;
            if (order) {
                if (order.originalItemCount === null || order.originalItemCount === undefined || order.originalItemCount === 0) {
                    const totalOrderItems = order.OrderItems ? order.OrderItems.reduce((sum, item) => sum + item.quantity, 0) : 0;
                    await order.update({ originalItemCount: totalOrderItems }, { transaction });
                    order.originalItemCount = totalOrderItems;
                }
                if (order.discountAmount > 0 && order.subtotal > 0) {
                    const discountPercentage = (order.discountAmount / order.subtotal) * 100;
                    if (Math.abs(discountPercentage - 10.0) < 0.01) {
                        const currentRefundedCount = order.refundedItemsCount || 0;
                        const newRefundedCount = currentRefundedCount + quantity;
                        const remainingItemsAfterRefund = order.originalItemCount - newRefundedCount;
                        if (order.discountRevoked === true) {
                            refundAmount = parseFloat(orderItem.Product.price) * quantity;
                        } else if (remainingItemsAfterRefund < 6 && order.originalItemCount >= 6) {
                            refundAmount = (parseFloat(orderItem.Product.price) * quantity) - order.discountAmount;
                            if (!order.discountRevoked) {
                                await order.update({ discountRevoked: true }, { transaction });
                            }
                        } else {
                            refundAmount = refundAmount * (1 - discountPercentage / 100);
                        }
                        await order.update({ refundedItemsCount: newRefundedCount }, { transaction });
                    } else {
                        refundAmount = refundAmount * (1 - discountPercentage / 100);
                    }
                }
            }
        }

        const refund = await Refund.create({
            orderItemId: orderItemId,
            branchId: targetBranchId,
            quantity: quantity,
            status: 'approved',
            refundAmount: refundAmount,
            requestedBy: req.user.id,
            reason: reason || null,
            approvedBy: req.user.id
        }, { transaction });

        let inventory = await Inventory.findOne({
            where: { productId: orderItem.productId, branchId: targetBranchId },
            transaction
        });
        if (inventory) {
            await inventory.update({ quantity: inventory.quantity + quantity }, { transaction });
        } else {
            await Inventory.create({
                productId: orderItem.productId,
                branchId: targetBranchId,
                quantity: quantity
            }, { transaction });
        }

        for (const serial of serialsToRefund) {
            await serial.update({
                orderItemId: null,
                note: `refunded - refund ${refund.id}`
            }, { transaction });
        }

        await transaction.commit();

        return res.status(201).json({
            refund: {
                id: refund.id,
                orderItemId: refund.orderItemId,
                branchId: refund.branchId,
                quantity: refund.quantity,
                status: refund.status,
                refundAmount: parseFloat(refund.refundAmount),
                requestedBy: refund.requestedBy,
                reason: refund.reason,
                approvedBy: refund.approvedBy,
                createdAt: refund.createdAt
            },
            originalOrder: {
                id: orderItem.Order.id,
                orderNumber: `ORD-${orderItem.Order.id.substring(0, 8).toUpperCase()}`,
                subtotal: orderItem.Order.subtotal ? parseFloat(orderItem.Order.subtotal) : parseFloat(orderItem.Order.totalPrice),
                discountApplied: orderItem.Order.discountAmount > 0,
                discountPercentage: orderItem.Order.discountPercentage ? parseFloat(orderItem.Order.discountPercentage) : null,
                discountAmount: orderItem.Order.discountAmount ? parseFloat(orderItem.Order.discountAmount) : null,
                totalPrice: parseFloat(orderItem.Order.totalPrice),
                createdAt: orderItem.Order.createdAt
            },
            product: {
                id: orderItem.Product.id,
                name: orderItem.Product.name,
                sku: orderItem.Product.sku
            },
            serialsRefunded: serialsToRefund.map(s => s.serialCode),
            message: 'Refund processed successfully (admin)'
        });

    } catch (error) {
        try {
            await transaction.rollback();
        } catch (rollbackError) {
            console.error('Error rolling back transaction:', rollbackError);
        }
        console.error('Error creating admin refund:', error);
        return res.status(500).json({
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Approve pending refund request (admin only)
router.put('/:id/approve', auth, allowRoles(ROLES.ADMIN), async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
        const { id } = req.params;

        // Get refund request
        const refund = await Refund.findByPk(id, {
            include: [
                {
                    model: OrderItem,
                    include: [
                        {
                            model: Product
                        },
                        {
                            model: Order
                        }
                    ]
                }
            ],
            transaction
        });

        if (!refund) {
            await transaction.rollback();
            return res.status(404).json({ message: 'Refund request not found' });
        }

        if (refund.status !== 'pending') {
            await transaction.rollback();
            return res.status(400).json({
                message: `Cannot approve refund with status: ${refund.status}. Only pending refunds can be approved.`
            });
        }

        // Extract serial IDs from reason
        const serialIdsMatch = refund.reason.match(/\[SERIAL_IDS:([^\]]+)\]/);
        if (!serialIdsMatch) {
            await transaction.rollback();
            return res.status(400).json({
                message: 'Serial IDs not found in refund request'
            });
        }

        const serialIds = serialIdsMatch[1].split(',');
        const cleanReason = refund.reason.replace(/\n\[SERIAL_IDS:[^\]]+\]/, '');

        // Validate serials still exist and belong to order item
        const serialsToRefund = await ProductSerial.findAll({
            where: {
                id: serialIds,
                orderItemId: refund.orderItemId
            },
            transaction
        });

        if (serialsToRefund.length !== serialIds.length) {
            await transaction.rollback();
            return res.status(400).json({
                message: `Some serials are no longer valid or don't belong to this order item`
            });
        }

        // Update refund status
        await refund.update({
            status: 'approved',
            approvedBy: req.user.id,
            reason: cleanReason
        }, { transaction });

        // Check if we need to update order's 10% discount
        const order = await Order.findByPk(refund.OrderItem.Order.id, { transaction });
        if (order && order.discountAmount > 0 && order.subtotal > 0) {
            const discountPercentage = (order.discountAmount / order.subtotal) * 100;
            
            // Check if this is specifically a 10% discount
            if (Math.abs(discountPercentage - 10.0) < 0.01) {
                const totalOrderItems = await OrderItem.sum('quantity', {
                    where: { orderId: order.id },
                    transaction
                });
                
                const remainingItemsAfterRefund = totalOrderItems - refund.quantity;
                
                // If remaining items will be less than 6, remove the 10% discount
                if (remainingItemsAfterRefund < 6) {
                    await order.update({
                        discountPercentage: null,
                        discountAmount: null,
                        totalPrice: order.subtotal
                    }, { transaction });
                }
            }
        }

        // Return inventory to branch
        let inventory = await Inventory.findOne({
            where: {
                productId: refund.OrderItem.productId,
                branchId: refund.branchId
            },
            transaction
        });

        if (inventory) {
            await inventory.update({
                quantity: inventory.quantity + refund.quantity
            }, { transaction });
        } else {
            inventory = await Inventory.create({
                productId: refund.OrderItem.productId,
                branchId: refund.branchId,
                quantity: refund.quantity
            }, { transaction });
        }

        // Unassign serials from order item
        for (const serial of serialsToRefund) {
            await serial.update({
                orderItemId: null,
                note: `refunded - refund ${refund.id}`
            }, { transaction });
        }

        // Update order status to refunded
        await refund.OrderItem.Order.update({
            status: 'refunded'
        }, { transaction });

        await transaction.commit();

        return res.status(200).json({
            message: 'Refund approved and processed successfully',
            refund: {
                id: refund.id,
                orderItemId: refund.orderItemId,
                branchId: refund.branchId,
                quantity: refund.quantity,
                status: refund.status,
                refundAmount: parseFloat(refund.refundAmount),
                reason: cleanReason,
                requestedBy: refund.requestedBy,
                approvedBy: refund.approvedBy,
                createdAt: refund.createdAt,
                updatedAt: refund.updatedAt
            },
            originalOrder: {
                id: refund.OrderItem.Order.id,
                orderNumber: `ORD-${refund.OrderItem.Order.id.substring(0, 8).toUpperCase()}`,
                subtotal: refund.OrderItem.Order.subtotal ? parseFloat(refund.OrderItem.Order.subtotal) : parseFloat(refund.OrderItem.Order.totalPrice),
                discountApplied: refund.OrderItem.Order.discountAmount > 0,
                discountPercentage: refund.OrderItem.Order.discountPercentage ? parseFloat(refund.OrderItem.Order.discountPercentage) : null,
                discountAmount: refund.OrderItem.Order.discountAmount ? parseFloat(refund.OrderItem.Order.discountAmount) : null,
                totalPrice: parseFloat(refund.OrderItem.Order.totalPrice),
                createdAt: refund.OrderItem.Order.createdAt
            },
            product: {
                id: refund.OrderItem.Product.id,
                name: refund.OrderItem.Product.name,
                sku: refund.OrderItem.Product.sku
            },
            serialsRefunded: serialsToRefund.map(s => s.serialCode)
        });

    } catch (error) {
        try {
            await transaction.rollback();
        } catch (rollbackError) {
            console.error('Error rolling back transaction:', rollbackError);
        }
        console.error('Error approving refund:', error);
        return res.status(500).json({
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Reject pending refund request (admin only)
router.put('/:id/reject', auth, allowRoles(ROLES.ADMIN), async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
        const { id } = req.params;
        const { rejectionReason } = req.body;

        // Get refund request
        const refund = await Refund.findByPk(id, {
            include: [
                {
                    model: OrderItem,
                    include: [
                        {
                            model: Product
                        }
                    ]
                }
            ],
            transaction
        });

        if (!refund) {
            await transaction.rollback();
            return res.status(404).json({ message: 'Refund request not found' });
        }

        if (refund.status !== 'pending') {
            await transaction.rollback();
            return res.status(400).json({
                message: `Cannot reject refund with status: ${refund.status}. Only pending refunds can be rejected.`
            });
        }

        // Clean up reason to remove serial IDs
        const cleanReason = refund.reason.replace(/\n\[SERIAL_IDS:[^\]]+\]/, '');
        const finalReason = rejectionReason 
            ? `${cleanReason}\n[REJECTION: ${rejectionReason}]`
            : cleanReason;

        // Update refund status
        await refund.update({
            status: 'rejected',
            approvedBy: req.user.id,
            reason: finalReason
        }, { transaction });

        await transaction.commit();

        return res.status(200).json({
            message: 'Refund request rejected',
            refund: {
                id: refund.id,
                orderItemId: refund.orderItemId,
                branchId: refund.branchId,
                quantity: refund.quantity,
                status: refund.status,
                refundAmount: parseFloat(refund.refundAmount),
                reason: finalReason,
                requestedBy: refund.requestedBy,
                approvedBy: refund.approvedBy,
                createdAt: refund.createdAt,
                updatedAt: refund.updatedAt
            },
            product: refund.OrderItem ? {
                id: refund.OrderItem.Product.id,
                name: refund.OrderItem.Product.name,
                sku: refund.OrderItem.Product.sku
            } : null
        });

    } catch (error) {
        try {
            await transaction.rollback();
        } catch (rollbackError) {
            console.error('Error rolling back transaction:', rollbackError);
        }
        console.error('Error rejecting refund:', error);
        return res.status(500).json({
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Create refund for an order item (cashier, branch_manager)
router.post('/', auth, allowRoles(ROLES.BRANCH_MANAGER, ROLES.CASHIER), async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
        const { orderItemId, serialIds, reason, manualRefundAmount } = req.body;

        // Validate required fields
        if (!orderItemId) {
            await transaction.rollback();
            return res.status(400).json({ message: 'orderItemId is required' });
        }

        if (!serialIds || !Array.isArray(serialIds) || serialIds.length === 0) {
            await transaction.rollback();
            return res.status(400).json({ message: 'serialIds array is required and must not be empty' });
        }

        const quantity = serialIds.length;

        // Ensure user has a branch assigned
        if (!req.user.branchId) {
            await transaction.rollback();
            return res.status(403).json({
                message: 'User is not assigned to any branch'
            });
        }

        // Get order item with related data
        const orderItem = await OrderItem.findByPk(orderItemId, {
            include: [
                {
                    model: Order,
                    include: [
                        { model: Branch }
                    ]
                },
                {
                    model: Product
                },
                {
                    model: ProductSerial
                }
            ],
            transaction
        });

        if (!orderItem) {
            await transaction.rollback();
            return res.status(404).json({ message: 'Order item not found' });
        }

        // Verify order belongs to user's branch
        if (orderItem.Order.branchId !== req.user.branchId) {
            await transaction.rollback();
            return res.status(403).json({
                message: 'Cannot refund items from other branches'
            });
        }

        // Check if order is within refund window (18 days)
        const refundWindowMinutes = 18 * 24 * 60; // 18 days = 25,920 minutes
        const orderDate = new Date(orderItem.Order.createdAt);
        const now = new Date();
        const minutesSinceOrder = (now - orderDate) / (1000 * 60);

        if (minutesSinceOrder > refundWindowMinutes) {
            await transaction.rollback();
            const daysSinceOrder = Math.floor(minutesSinceOrder / (24 * 60));
            return res.status(400).json({
                message: `Refund window expired. Orders can only be refunded within 18 days of purchase`,
                orderDate: orderDate,
                daysSinceOrder: daysSinceOrder
            });
        }

        // Validate quantity
        if (quantity > orderItem.quantity) {
            await transaction.rollback();
            return res.status(400).json({
                message: `Cannot refund more than purchased quantity. Purchased: ${orderItem.quantity}, Requested: ${quantity}`
            });
        }

        // Check if order item has been fully refunded
        const existingRefunds = await Refund.findAll({
            where: { orderItemId: orderItemId },
            transaction
        });

        // Calculate total already refunded quantity
        const totalRefundedQuantity = existingRefunds.reduce((sum, refund) => sum + refund.quantity, 0);
        
        // Check if trying to refund more than available
        if (totalRefundedQuantity + quantity > orderItem.quantity) {
            await transaction.rollback();
            return res.status(400).json({
                message: `Cannot refund more than available quantity. Available: ${orderItem.quantity - totalRefundedQuantity}, Requested: ${quantity}`
            });
        }

        // Validate that the provided serials belong to this order item
        const serialsToRefund = await ProductSerial.findAll({
            where: {
                id: serialIds,
                orderItemId: orderItemId,
                productId: orderItem.productId
            },
            transaction
        });

        if (serialsToRefund.length !== serialIds.length) {
            await transaction.rollback();
            return res.status(400).json({
                message: `Invalid serials provided. Some serials don't belong to this order item or don't exist. Provided: ${serialIds.length}, Valid: ${serialsToRefund.length}`
            });
        }

        // Check for duplicate serials in the request
        const uniqueSerials = [...new Set(serialIds)];
        if (uniqueSerials.length !== serialIds.length) {
            await transaction.rollback();
            return res.status(400).json({
                message: 'Cannot refund the same serial twice'
            });
        }

        // Get order for tracking refunded items count (needed regardless of manual/automatic calculation)
        const order = await Order.findByPk(orderItem.Order.id, { 
            include: [{ model: OrderItem, as: 'OrderItems' }],
            transaction 
        });

        // Calculate refund amount - use manual amount if provided, otherwise calculate automatically
        let refundAmount = 0;
        
        if (manualRefundAmount && manualRefundAmount > 0) {
            // Use manual amount if provided
            refundAmount = parseFloat(manualRefundAmount);
            console.log('Using manual refund amount:', refundAmount);
            
            // Still need to update refunded items count even with manual amount
            if (order) {
                const currentRefundedCount = order.refundedItemsCount || 0;
                const newRefundedCount = currentRefundedCount + quantity;
                await order.update({
                    refundedItemsCount: newRefundedCount
                }, { transaction });
            }
        } else {
            // Fallback to automatic calculation (original logic)
            refundAmount = parseFloat(orderItem.Product.price) * quantity;
            console.log('Using automatic refund calculation:', refundAmount);
            
            if (order) {
                // Fix: Ensure originalItemCount is set for existing orders
                if (order.originalItemCount === null || order.originalItemCount === undefined || order.originalItemCount === 0) {
                    console.log('🔧 FIXING MISSING originalItemCount for order:', order.id);
                    const totalOrderItems = order.OrderItems ? 
                        order.OrderItems.reduce((sum, item) => sum + item.quantity, 0) : 0;
                    
                    console.log('  Calculated originalItemCount:', totalOrderItems);
                    
                    // Update the order with original item count
                    await order.update({
                        originalItemCount: totalOrderItems
                    }, { transaction });
                    
                    // Refresh the order object
                    order.originalItemCount = totalOrderItems;
                    console.log('  ✅ Updated order.originalItemCount to:', order.originalItemCount);
                }
                
                // Handle regular discount
                if (order.discountAmount > 0 && order.subtotal > 0) {
                    const discountPercentage = (order.discountAmount / order.subtotal) * 100;
                    
                    // Check if this is specifically a 10% discount (likely for 6+ items)
                    if (Math.abs(discountPercentage - 10.0) < 0.01) {
                        // Get current refunded items count
                        const currentRefundedCount = order.refundedItemsCount || 0;
                        const newRefundedCount = currentRefundedCount + quantity;
                        const remainingItemsAfterRefund = order.originalItemCount - newRefundedCount;
                        
                        // Check if discount has already been revoked
                        const currentRemainingItems = order.originalItemCount - currentRefundedCount;
                        const discountAlreadyRevoked = order.discountRevoked;
                        
                        console.log('🔍 DISCOUNT REVOCATION DEBUG:');
                        console.log('  remainingItemsAfterRefund:', remainingItemsAfterRefund);
                        console.log('  order.originalItemCount:', order.originalItemCount);
                        console.log('  discountAlreadyRevoked:', discountAlreadyRevoked);
                        console.log('  order.discountRevoked:', order.discountRevoked);
                        console.log('  original item price:', parseFloat(orderItem.Product.price));
                        console.log('  quantity:', quantity);
                        
                        if (order.discountRevoked === true) {
                            // Discount already revoked previously → refund original price
                            refundAmount = parseFloat(orderItem.Product.price) * quantity;
                            console.log('  ✅ DISCOUNT ALREADY REVOKED - refunding original price:', refundAmount);
                        } else if (remainingItemsAfterRefund < 6 && order.originalItemCount >= 6) {
                            // Crossing below 6 for the first time → apply one-time penalty equal to full original discount
                            refundAmount = (parseFloat(orderItem.Product.price) * quantity) - order.discountAmount;
                            console.log('  ✅ DISCOUNT PENALTY APPLIED - first time below 6:', refundAmount);
                            console.log(`    Gross refund: $${parseFloat(orderItem.Product.price) * quantity}`);
                            console.log(`    Original discount: $${order.discountAmount}`);
                            console.log(`    Net refund after penalty: $${refundAmount}`);
                            if (!order.discountRevoked) {
                                await order.update({ discountRevoked: true }, { transaction });
                            }
                        } else {
                            // Still 6+ items → keep discount
                            refundAmount = refundAmount * (1 - discountPercentage / 100);
                            console.log('  ✅ KEEPING DISCOUNT - still 6+ items:', refundAmount);
                        }
                        
                        // Update refunded items count
                        await order.update({
                            refundedItemsCount: newRefundedCount
                        }, { transaction });
                    } else {
                        // For other discount percentages, apply normally
                        refundAmount = refundAmount * (1 - discountPercentage / 100);
                    }
                }
            }
        }

        // Create refund record
        const refund = await Refund.create({
            orderItemId: orderItemId,
            branchId: req.user.branchId,
            quantity: quantity,
            status: 'approved',
            refundAmount: refundAmount,
            requestedBy: req.user.id,
            reason: reason || null,
            approvedBy: req.user.id
        }, { transaction });

        // Return inventory to branch
        let inventory = await Inventory.findOne({
            where: {
                productId: orderItem.productId,
                branchId: req.user.branchId
            },
            transaction
        });

        if (inventory) {
            await inventory.update({
                quantity: inventory.quantity + quantity
            }, { transaction });
        } else {
            inventory = await Inventory.create({
                productId: orderItem.productId,
                branchId: req.user.branchId,
                quantity: quantity
            }, { transaction });
        }

        // Unassign serials from order item
        for (const serial of serialsToRefund) {
            await serial.update({
                orderItemId: null,
                note: `refunded - refund ${refund.id}`
            }, { transaction });
        }

        await transaction.commit();

        return res.status(201).json({
            refund: {
                id: refund.id,
                orderItemId: refund.orderItemId,
                branchId: refund.branchId,
                quantity: refund.quantity,
                status: refund.status,
                refundAmount: parseFloat(refund.refundAmount),
                requestedBy: refund.requestedBy,
                reason: refund.reason,
                approvedBy: refund.approvedBy,
                createdAt: refund.createdAt,
                discountRevoked: order?.discountRevoked || false,
                originalDiscount: order?.discountAmount || 0,
                penaltyApplied: order?.discountRevoked && order?.originalItemCount >= 6,
                penaltyAmount: order?.discountRevoked && order?.originalItemCount >= 6 ? order?.discountAmount : 0
            },
            originalOrder: {
                id: orderItem.Order.id,
                orderNumber: `ORD-${orderItem.Order.id.substring(0, 8).toUpperCase()}`,
                subtotal: orderItem.Order.subtotal ? parseFloat(orderItem.Order.subtotal) : parseFloat(orderItem.Order.totalPrice),
                discountApplied: orderItem.Order.discountAmount > 0,
                discountPercentage: orderItem.Order.discountPercentage ? parseFloat(orderItem.Order.discountPercentage) : null,
                discountAmount: orderItem.Order.discountAmount ? parseFloat(orderItem.Order.discountAmount) : null,
                totalPrice: parseFloat(orderItem.Order.totalPrice),
                createdAt: orderItem.Order.createdAt
            },
            product: {
                id: orderItem.Product.id,
                name: orderItem.Product.name,
                sku: orderItem.Product.sku
            },
            serialsRefunded: serialsToRefund.map(s => s.serialCode),
            message: 'Refund processed successfully'
        });

    } catch (error) {
        try {
            await transaction.rollback();
        } catch (rollbackError) {
            console.error('Error rolling back transaction:', rollbackError);
        }
        console.error('Error creating refund:', error);
        return res.status(500).json({
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Create refund for entire order (cashier, branch_manager)
router.post('/order/:orderId', auth, allowRoles(ROLES.BRANCH_MANAGER, ROLES.CASHIER), async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
        const { orderId } = req.params;
        const { reason } = req.body;

        // Ensure user has a branch assigned
        if (!req.user.branchId) {
            await transaction.rollback();
            return res.status(403).json({
                message: 'User is not assigned to any branch'
            });
        }

        // Get order with all items
        const order = await Order.findByPk(orderId, {
            include: [
                {
                    model: Branch
                },
                {
                    model: OrderItem,
                    include: [
                        {
                            model: Product
                        },
                        {
                            model: ProductSerial
                        }
                    ]
                }
            ],
            transaction
        });

        if (!order) {
            await transaction.rollback();
            return res.status(404).json({ message: 'Order not found' });
        }

        // Verify order belongs to user's branch
        if (order.branchId !== req.user.branchId) {
            await transaction.rollback();
            return res.status(403).json({
                message: 'Cannot refund orders from other branches'
            });
        }

        // Check if order has items
        if (!order.OrderItems || order.OrderItems.length === 0) {
            await transaction.rollback();
            return res.status(400).json({
                message: 'Order has no items to refund'
            });
        }

        // Check if order is within refund window (18 days)
        const refundWindowMinutes = 18 * 24 * 60; // 18 days = 25,920 minutes
        const orderDate = new Date(order.createdAt);
        const now = new Date();
        const minutesSinceOrder = (now - orderDate) / (1000 * 60);

        if (minutesSinceOrder > refundWindowMinutes) {
            await transaction.rollback();
            const daysSinceOrder = Math.floor(minutesSinceOrder / (24 * 60));
            return res.status(400).json({
                message: `Refund window expired. Orders can only be refunded within 18 days of purchase`,
                orderDate: orderDate,
                daysSinceOrder: daysSinceOrder
            });
        }

        // Check if any items already refunded
        const existingRefunds = await Refund.findAll({
            where: {
                orderItemId: order.OrderItems.map(item => item.id)
            },
            transaction
        });

        if (existingRefunds.length > 0) {
            await transaction.rollback();
            return res.status(400).json({
                message: 'Some items in this order have already been refunded. Cannot refund entire order.'
            });
        }

        // Process refund for each order item
        const refundedItems = [];
        let totalRefundAmount = 0;

        for (const orderItem of order.OrderItems) {
            const quantity = orderItem.quantity;
            let refundAmount = parseFloat(orderItem.Product.price) * quantity;
            
            // Handle regular discount
            if (order.discountAmount > 0 && order.subtotal > 0) {
                const discountPercentage = (order.discountAmount / order.subtotal) * 100;
                
                // For entire order refund, apply the discount normally
                refundAmount = refundAmount * (1 - discountPercentage / 100);
            }
            
            totalRefundAmount += refundAmount;

            // Get serials to refund
            const serialsToRefund = orderItem.ProductSerials;

            if (serialsToRefund.length !== quantity) {
                await transaction.rollback();
                return res.status(400).json({
                    message: `Not enough serials found for product ${orderItem.Product.name}. Found: ${serialsToRefund.length}, Required: ${quantity}`
                });
            }

            // Create refund record
            const refund = await Refund.create({
                orderItemId: orderItem.id,
                branchId: req.user.branchId,
                quantity: quantity,
                status: 'approved',
                refundAmount: refundAmount,
                requestedBy: req.user.id,
                reason: reason || null,
                approvedBy: req.user.id
            }, { transaction });

            // Return inventory to branch
            let inventory = await Inventory.findOne({
                where: {
                    productId: orderItem.productId,
                    branchId: req.user.branchId
                },
                transaction
            });

            if (inventory) {
                await inventory.update({
                    quantity: inventory.quantity + quantity
                }, { transaction });
            } else {
                inventory = await Inventory.create({
                    productId: orderItem.productId,
                    branchId: req.user.branchId,
                    quantity: quantity
                }, { transaction });
            }

            // Unassign serials from order item
            for (const serial of serialsToRefund) {
                await serial.update({
                    orderItemId: null,
                    note: `refunded - refund ${refund.id}`
                }, { transaction });
            }

            refundedItems.push({
                refundId: refund.id,
                orderItemId: orderItem.id,
                productId: orderItem.Product.id,
                productName: orderItem.Product.name,
                productSku: orderItem.Product.sku,
                quantity: quantity,
                refundAmount: refundAmount,
                serialsRefunded: serialsToRefund.map(s => s.serialCode)
            });
        }

        // Remove discount from order since entire order is refunded
        if (order.discountAmount > 0) {
            await order.update({
                discountPercentage: null,
                discountAmount: null,
                totalPrice: order.subtotal
            }, { transaction });
        }

        await transaction.commit();

        return res.status(201).json({
            orderId: order.id,
            orderNumber: `ORD-${order.id.substring(0, 8).toUpperCase()}`,
            totalRefundAmount: totalRefundAmount,
            itemsRefunded: refundedItems.length,
            refundedItems: refundedItems,
            reason: reason || null,
            message: 'Entire order refunded successfully'
        });

    } catch (error) {
        try {
            await transaction.rollback();
        } catch (rollbackError) {
            console.error('Error rolling back transaction:', rollbackError);
        }
        console.error('Error refunding order:', error);
        return res.status(500).json({
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * @swagger
 * /api/v1/refunds/{id}:
 *   get:
 *     summary: Get refund by ID (admin only)
 *     description: Get detailed information about a specific refund by its ID. Only accessible to admins.
 *     tags: [Refunds]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Refund ID
 *     responses:
 *       200:
 *         description: Refund details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 refund:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     orderItemId:
 *                       type: string
 *                       format: uuid
 *                     branchId:
 *                       type: string
 *                       format: uuid
 *                     quantity:
 *                       type: integer
 *                     status:
 *                       type: string
 *                       enum: [pending, approved, rejected]
 *                     refundAmount:
 *                       type: number
 *                       format: decimal
 *                     requestedBy:
 *                       type: string
 *                       format: uuid
 *                     reason:
 *                       type: string
 *                     approvedBy:
 *                       type: string
 *                       format: uuid
 *                       nullable: true
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *                     OrderItem:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                           format: uuid
 *                         productId:
 *                           type: string
 *                           format: uuid
 *                         quantity:
 *                           type: integer
 *                         Product:
 *                           type: object
 *                           properties:
 *                             id:
 *                               type: string
 *                               format: uuid
 *                             name:
 *                               type: string
 *                             sku:
 *                               type: string
 *                             price:
 *                               type: number
 *                               format: decimal
 *                     Branch:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                           format: uuid
 *                         name:
 *                           type: string
 *                         location:
 *                           type: string
 *                     RequestedByUser:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                           format: uuid
 *                         name:
 *                           type: string
 *                         email:
 *                           type: string
 *                     ApprovedByUser:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         id:
 *                           type: string
 *                           format: uuid
 *                         name:
 *                           type: string
 *                         email:
 *                           type: string
 *       404:
 *         description: Refund not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Refund not found"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Internal server error"
 */
router.get('/:id', auth, allowRoles(ROLES.ADMIN), async (req, res) => {
    try {
        const { id } = req.params;

        // Validate UUID format
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(id)) {
            return res.status(400).json({
                message: 'Invalid refund ID format'
            });
        }

        // Find the refund with all related data
        const refund = await Refund.findByPk(id, {
            include: [
                {
                    model: OrderItem,
                    include: [
                        {
                            model: Product,
                            attributes: ['id', 'name', 'sku', 'price']
                        },
                        {
                            model: Order,
                            attributes: ['id', 'subtotal', 'discountPercentage', 'discountAmount', 'totalPrice', 'createdAt']
                        }
                    ]
                },
                {
                    model: Branch,
                    attributes: ['id', 'name', 'location']
                },
                {
                    model: User,
                    as: 'requester',
                    attributes: ['id', 'name', 'email']
                },
                {
                    model: User,
                    as: 'approver',
                    attributes: ['id', 'name', 'email']
                }
            ]
        });

        if (!refund) {
            return res.status(404).json({
                message: 'Refund not found'
            });
        }

        return res.json({
            refund: {
                id: refund.id,
                orderItemId: refund.orderItemId,
                branchId: refund.branchId,
                quantity: refund.quantity,
                status: refund.status,
                refundAmount: parseFloat(refund.refundAmount),
                requestedBy: refund.requestedBy,
                reason: refund.reason,
                approvedBy: refund.approvedBy,
                createdAt: refund.createdAt,
                updatedAt: refund.updatedAt,
                OrderItem: refund.OrderItem ? {
                    id: refund.OrderItem.id,
                    productId: refund.OrderItem.productId,
                    quantity: refund.OrderItem.quantity,
                    Product: refund.OrderItem.Product
                } : null,
                originalOrder: refund.OrderItem?.Order ? {
                    id: refund.OrderItem.Order.id,
                    orderNumber: `ORD-${refund.OrderItem.Order.id.substring(0, 8).toUpperCase()}`,
                    subtotal: refund.OrderItem.Order.subtotal ? parseFloat(refund.OrderItem.Order.subtotal) : parseFloat(refund.OrderItem.Order.totalPrice),
                    discountApplied: refund.OrderItem.Order.discountAmount > 0,
                    discountPercentage: refund.OrderItem.Order.discountPercentage ? parseFloat(refund.OrderItem.Order.discountPercentage) : null,
                    discountAmount: refund.OrderItem.Order.discountAmount ? parseFloat(refund.OrderItem.Order.discountAmount) : null,
                    totalPrice: parseFloat(refund.OrderItem.Order.totalPrice),
                    createdAt: refund.OrderItem.Order.createdAt
                } : null,
                Branch: refund.Branch,
                RequestedByUser: refund.requester,
                ApprovedByUser: refund.approver
            }
        });

    } catch (error) {
        console.error('Error fetching refund by ID:', error);
        return res.status(500).json({
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * @swagger
 * /api/v1/refunds/estimate:
 *   get:
 *     summary: Calculate estimated refund amount
 *     description: Calculate the estimated refund amount for order items without processing the actual refund. Considers discounts and business rules.
 *     tags: [Refunds]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: orderItemId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Order item ID to calculate refund for
 *       - in: query
 *         name: quantity
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Quantity of items to refund
 *     responses:
 *       200:
 *         description: Estimated refund amount calculated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 estimatedRefund:
 *                   type: object
 *                   properties:
 *                     orderItemId:
 *                       type: string
 *                       format: uuid
 *                     productId:
 *                       type: string
 *                       format: uuid
 *                     productName:
 *                       type: string
 *                     productSku:
 *                       type: string
 *                     originalPrice:
 *                       type: number
 *                       format: decimal
 *                     quantity:
 *                       type: integer
 *                     grossRefundAmount:
 *                       type: number
 *                       format: decimal
 *                     discountApplied:
 *                       type: boolean
 *                     discountPercentage:
 *                       type: number
 *                       format: decimal
 *                       nullable: true
 *                     discountAmount:
 *                       type: number
 *                       format: decimal
 *                       nullable: true
 *                     estimatedRefundAmount:
 *                       type: number
 *                       format: decimal
 *                     discountRevoked:
 *                       type: boolean
 *                     penaltyApplied:
 *                       type: boolean
 *                     penaltyAmount:
 *                       type: number
 *                       format: decimal
 *                       nullable: true
 *                 originalOrder:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     orderNumber:
 *                       type: string
 *                     subtotal:
 *                       type: number
 *                       format: decimal
 *                     discountApplied:
 *                       type: boolean
 *                     discountPercentage:
 *                       type: number
 *                       format: decimal
 *                       nullable: true
 *                     discountAmount:
 *                       type: number
 *                       format: decimal
 *                       nullable: true
 *                     totalPrice:
 *                       type: number
 *                       format: decimal
 *                     originalItemCount:
 *                       type: integer
 *                     refundedItemsCount:
 *                       type: integer
 *                     remainingItemsAfterRefund:
 *                       type: integer
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Bad request - invalid parameters
 *       403:
 *         description: Forbidden - user not assigned to a branch
 *       404:
 *         description: Order item not found
 *       500:
 *         description: Internal server error
 */
router.get('/estimate', auth, allowRoles(ROLES.BRANCH_MANAGER, ROLES.CASHIER), async (req, res) => {
    try {
        const { orderItemId, quantity } = req.query;

        // Validate required fields
        if (!orderItemId) {
            return res.status(400).json({ message: 'orderItemId is required' });
        }

        if (!quantity || isNaN(parseInt(quantity)) || parseInt(quantity) <= 0) {
            return res.status(400).json({ message: 'quantity is required and must be a positive integer' });
        }

        const refundQuantity = parseInt(quantity);

        // Ensure user has a branch assigned
        if (!req.user.branchId) {
            return res.status(403).json({
                message: 'User is not assigned to any branch'
            });
        }

        // Get order item with related data
        const orderItem = await OrderItem.findByPk(orderItemId, {
            include: [
                {
                    model: Order,
                    include: [
                        { model: Branch }
                    ]
                },
                {
                    model: Product
                }
            ]
        });

        if (!orderItem) {
            return res.status(404).json({ message: 'Order item not found' });
        }

        // Verify order belongs to user's branch
        if (orderItem.Order.branchId !== req.user.branchId) {
            return res.status(403).json({
                message: 'Cannot estimate refund for items from other branches'
            });
        }

        // Validate quantity
        if (refundQuantity > orderItem.quantity) {
            return res.status(400).json({
                message: `Cannot refund more than purchased quantity. Purchased: ${orderItem.quantity}, Requested: ${refundQuantity}`
            });
        }

        // Check if order item has been fully refunded or has pending requests
        const existingRefunds = await Refund.findAll({
            where: { orderItemId: orderItemId }
        });

        // Calculate total already refunded quantity
        const totalRefundedQuantity = existingRefunds.reduce((sum, refund) => sum + refund.quantity, 0);
        
        // Check if trying to refund more than available
        if (totalRefundedQuantity + refundQuantity > orderItem.quantity) {
            return res.status(400).json({
                message: `Cannot refund more than available quantity. Available: ${orderItem.quantity - totalRefundedQuantity}, Requested: ${refundQuantity}`
            });
        }

        // Get order with all items for discount calculations
        const order = await Order.findByPk(orderItem.Order.id, { 
            include: [{ model: OrderItem, as: 'OrderItems' }]
        });

        // Calculate estimated refund amount
        let grossRefundAmount = parseFloat(orderItem.Product.price) * refundQuantity;
        let estimatedRefundAmount = grossRefundAmount;
        let discountApplied = false;
        let discountPercentage = null;
        let discountAmount = null;
        let discountRevoked = false;
        let penaltyApplied = false;
        let penaltyAmount = null;

        if (order) {
            // Fix: Ensure originalItemCount is set for existing orders
            if (order.originalItemCount === null || order.originalItemCount === undefined || order.originalItemCount === 0) {
                const totalOrderItems = order.OrderItems ? 
                    order.OrderItems.reduce((sum, item) => sum + item.quantity, 0) : 0;
                
                // Update the order with original item count
                await order.update({
                    originalItemCount: totalOrderItems
                });
                
                // Refresh the order object
                order.originalItemCount = totalOrderItems;
            }
            
            // Handle regular discount
            if (order.discountAmount > 0 && order.subtotal > 0) {
                discountPercentage = (order.discountAmount / order.subtotal) * 100;
                discountApplied = true;
                discountAmount = order.discountAmount;
                
                // Check if this is specifically a 10% discount (likely for 6+ items)
                if (Math.abs(discountPercentage - 10.0) < 0.01) {
                    // Get current refunded items count
                    const currentRefundedCount = order.refundedItemsCount || 0;
                    const newRefundedCount = currentRefundedCount + refundQuantity;
                    const remainingItemsAfterRefund = order.originalItemCount - newRefundedCount;
                    
                    // Check if discount has already been revoked
                    const discountAlreadyRevoked = order.discountRevoked;
                    
                    if (discountAlreadyRevoked === true) {
                        // Discount already revoked previously → refund original price
                        estimatedRefundAmount = grossRefundAmount;
                    } else if (remainingItemsAfterRefund < 6 && order.originalItemCount >= 6) {
                        // Crossing below 6 for the first time → apply one-time penalty equal to full original discount
                        penaltyApplied = true;
                        penaltyAmount = order.discountAmount;
                        estimatedRefundAmount = grossRefundAmount - order.discountAmount;
                        discountRevoked = true;
                    } else {
                        // Still 6+ items → keep discount
                        estimatedRefundAmount = grossRefundAmount * (1 - discountPercentage / 100);
                    }
                } else {
                    // For other discount percentages, apply normally
                    estimatedRefundAmount = grossRefundAmount * (1 - discountPercentage / 100);
                }
            }
        }

        return res.status(200).json({
            estimatedRefund: {
                orderItemId: orderItem.id,
                productId: orderItem.productId,
                productName: orderItem.Product.name,
                productSku: orderItem.Product.sku,
                originalPrice: parseFloat(orderItem.Product.price),
                quantity: refundQuantity,
                grossRefundAmount: grossRefundAmount,
                discountApplied: discountApplied,
                discountPercentage: discountPercentage,
                discountAmount: discountAmount,
                estimatedRefundAmount: estimatedRefundAmount,
                discountRevoked: discountRevoked,
                penaltyApplied: penaltyApplied,
                penaltyAmount: penaltyAmount
            },
            originalOrder: {
                id: orderItem.Order.id,
                orderNumber: `ORD-${orderItem.Order.id.substring(0, 8).toUpperCase()}`,
                subtotal: orderItem.Order.subtotal ? parseFloat(orderItem.Order.subtotal) : parseFloat(orderItem.Order.totalPrice),
                discountApplied: orderItem.Order.discountAmount > 0,
                discountPercentage: orderItem.Order.discountPercentage ? parseFloat(orderItem.Order.discountPercentage) : null,
                discountAmount: orderItem.Order.discountAmount ? parseFloat(orderItem.Order.discountAmount) : null,
                totalPrice: parseFloat(orderItem.Order.totalPrice),
                originalItemCount: order.originalItemCount || 0,
                refundedItemsCount: order.refundedItemsCount || 0,
                remainingItemsAfterRefund: (order.originalItemCount || 0) - (order.refundedItemsCount || 0) - refundQuantity,
                createdAt: orderItem.Order.createdAt
            },
            message: 'Estimated refund amount calculated successfully'
        });

    } catch (error) {
        console.error('Error calculating estimated refund:', error);
        return res.status(500).json({
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

module.exports = router;
