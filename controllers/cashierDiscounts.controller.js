const express = require('express');
const { CashierDiscount, User, Order, sequelize } = require('../models');
const auth = require('../middleware/auth');
const { allowRoles, ROLES } = require('../middleware/roles');
const { Op } = require('sequelize');

const router = express.Router();

/**
 * @swagger
 * /api/v1/cashier-discounts:
 *   post:
 *     summary: Create a discount for a cashier (Admin only)
 *     tags: [Cashier Discounts]
 *     security:
 *       - bearerAuth: []
 */
router.post('/', auth, allowRoles(ROLES.ADMIN), async (req, res) => {
    try {
        const { cashierId, discountPercentage, startDate, endDate, description } = req.body;

        // Validate required fields
        if (!cashierId || !discountPercentage || !startDate || !endDate) {
            return res.status(400).json({
                message: 'cashierId, discountPercentage, startDate, and endDate are required'
            });
        }

        // Validate percentage
        if (discountPercentage < 0 || discountPercentage > 100) {
            return res.status(400).json({
                message: 'Discount percentage must be between 0 and 100'
            });
        }

        // Validate dates
        const start = new Date(startDate);
        const end = new Date(endDate);
        if (end < start) {
            return res.status(400).json({
                message: 'End date cannot be before start date'
            });
        }

        // Verify cashier exists and has cashier role
        const cashier = await User.findByPk(cashierId);
        if (!cashier) {
            return res.status(404).json({ message: 'Cashier not found' });
        }
        if (cashier.role !== ROLES.CASHIER && cashier.role !== ROLES.BRANCH_MANAGER) {
            return res.status(400).json({
                message: 'User must be a cashier or branch manager'
            });
        }

        // Allow multiple discounts for the same cashier during overlapping periods
        // Cashiers can have multiple discount options to choose from

        // Create discount
        const discount = await CashierDiscount.create({
            cashierId,
            discountPercentage,
            startDate: start,
            endDate: end,
            description: description || null,
            isActive: true,
            createdBy: req.user.id
        });

        const createdDiscount = await CashierDiscount.findByPk(discount.id, {
            include: [
                {
                    model: User,
                    as: 'cashier',
                    attributes: ['id', 'name', 'email', 'role']
                }
            ]
        });

        return res.status(201).json({
            message: 'Cashier discount created successfully',
            discount: {
                id: createdDiscount.id,
                cashier: {
                    id: createdDiscount.cashier.id,
                    name: createdDiscount.cashier.name,
                    email: createdDiscount.cashier.email,
                    role: createdDiscount.cashier.role
                },
                discountPercentage: parseFloat(createdDiscount.discountPercentage),
                startDate: createdDiscount.startDate,
                endDate: createdDiscount.endDate,
                isActive: createdDiscount.isActive,
                description: createdDiscount.description,
                createdAt: createdDiscount.createdAt
            }
        });

    } catch (error) {
        console.error('Error creating cashier discount:', error);
        return res.status(500).json({
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * @swagger
 * /api/v1/cashier-discounts:
 *   get:
 *     summary: List all cashier discounts (Admin only)
 *     tags: [Cashier Discounts]
 *     security:
 *       - bearerAuth: []
 */
router.get('/', auth, allowRoles(ROLES.ADMIN), async (req, res) => {
    try {
        const { isActive, cashierId, limit = 50, offset = 0 } = req.query;

        const whereClause = {};
        if (isActive !== undefined) {
            whereClause.isActive = isActive === 'true';
        }
        if (cashierId) {
            whereClause.cashierId = cashierId;
        }

        const { count, rows: discounts } = await CashierDiscount.findAndCountAll({
            where: whereClause,
            limit: parseInt(limit),
            offset: parseInt(offset),
            include: [
                {
                    model: User,
                    as: 'cashier',
                    attributes: ['id', 'name', 'email', 'role', 'branchId']
                },
                {
                    model: User,
                    as: 'creator',
                    attributes: ['id', 'name', 'email']
                }
            ],
            order: [['createdAt', 'DESC']]
        });

        const formattedDiscounts = discounts.map(d => ({
            id: d.id,
            cashier: {
                id: d.cashier.id,
                name: d.cashier.name,
                email: d.cashier.email,
                role: d.cashier.role,
                branchId: d.cashier.branchId
            },
            discountPercentage: parseFloat(d.discountPercentage),
            startDate: d.startDate,
            endDate: d.endDate,
            isActive: d.isActive,
            description: d.description,
            createdBy: {
                id: d.creator.id,
                name: d.creator.name,
                email: d.creator.email
            },
            createdAt: d.createdAt,
            updatedAt: d.updatedAt
        }));

        return res.status(200).json({
            discounts: formattedDiscounts,
            total: count,
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

    } catch (error) {
        console.error('Error fetching cashier discounts:', error);
        return res.status(500).json({
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * @swagger
 * /api/v1/cashier-discounts/my-discount:
 *   get:
 *     summary: Get cashier's active discount (Cashier/Branch Manager)
 *     tags: [Cashier Discounts]
 *     security:
 *       - bearerAuth: []
 */
router.get('/my-discount', auth, allowRoles(ROLES.CASHIER, ROLES.BRANCH_MANAGER), async (req, res) => {
    try {
        const now = new Date();

        const discount = await CashierDiscount.findOne({
            where: {
                cashierId: req.user.id,
                isActive: true,
                startDate: { [Op.lte]: now },
                endDate: { [Op.gte]: now }
            },
            order: [['createdAt', 'DESC']]
        });

        if (!discount) {
            return res.status(200).json({
                hasDiscount: false,
                discount: null,
                message: 'No active discount available'
            });
        }

        return res.status(200).json({
            hasDiscount: true,
            discount: {
                id: discount.id,
                discountPercentage: parseFloat(discount.discountPercentage),
                startDate: discount.startDate,
                endDate: discount.endDate,
                description: discount.description
            }
        });

    } catch (error) {
        console.error('Error fetching cashier discount:', error);
        return res.status(500).json({
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * @swagger
 * /api/v1/cashier-discounts/my-discounts:
 *   get:
 *     summary: Get all active discounts for cashier (Cashier/Branch Manager)
 *     tags: [Cashier Discounts]
 *     security:
 *       - bearerAuth: []
 */
router.get('/my-discounts', auth, allowRoles(ROLES.CASHIER, ROLES.BRANCH_MANAGER), async (req, res) => {
    try {
        const now = new Date();

        const discounts = await CashierDiscount.findAll({
            where: {
                cashierId: req.user.id,
                isActive: true,
                startDate: { [Op.lte]: now },
                endDate: { [Op.gte]: now }
            },
            order: [['discountPercentage', 'ASC']] // Order by percentage ascending
        });

        const formattedDiscounts = discounts.map(discount => ({
            id: discount.id,
            discountPercentage: parseFloat(discount.discountPercentage),
            startDate: discount.startDate,
            endDate: discount.endDate,
            description: discount.description
        }));

        return res.status(200).json({
            success: true,
            data: formattedDiscounts,
            count: formattedDiscounts.length
        });

    } catch (error) {
        console.error('Error fetching cashier discounts:', error);
        return res.status(500).json({
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * @swagger
 * /api/v1/cashier-discounts/{id}:
 *   put:
 *     summary: Update cashier discount (Admin only)
 *     tags: [Cashier Discounts]
 *     security:
 *       - bearerAuth: []
 */
router.put('/:id', auth, allowRoles(ROLES.ADMIN), async (req, res) => {
    try {
        const { id } = req.params;
        const { discountPercentage, startDate, endDate, isActive, description } = req.body;

        const discount = await CashierDiscount.findByPk(id);
        if (!discount) {
            return res.status(404).json({ message: 'Cashier discount not found' });
        }

        const updateData = {};

        if (discountPercentage !== undefined) {
            if (discountPercentage < 0 || discountPercentage > 100) {
                return res.status(400).json({
                    message: 'Discount percentage must be between 0 and 100'
                });
            }
            updateData.discountPercentage = discountPercentage;
        }

        if (startDate !== undefined) {
            updateData.startDate = new Date(startDate);
        }

        if (endDate !== undefined) {
            updateData.endDate = new Date(endDate);
        }

        if (isActive !== undefined) {
            updateData.isActive = isActive;
        }

        if (description !== undefined) {
            updateData.description = description;
        }

        // Validate dates if both are being updated
        if (updateData.startDate && updateData.endDate) {
            if (updateData.endDate < updateData.startDate) {
                return res.status(400).json({
                    message: 'End date cannot be before start date'
                });
            }
        }

        await discount.update(updateData);

        const updatedDiscount = await CashierDiscount.findByPk(id, {
            include: [
                {
                    model: User,
                    as: 'cashier',
                    attributes: ['id', 'name', 'email', 'role']
                }
            ]
        });

        return res.status(200).json({
            message: 'Cashier discount updated successfully',
            discount: {
                id: updatedDiscount.id,
                cashier: {
                    id: updatedDiscount.cashier.id,
                    name: updatedDiscount.cashier.name,
                    email: updatedDiscount.cashier.email,
                    role: updatedDiscount.cashier.role
                },
                discountPercentage: parseFloat(updatedDiscount.discountPercentage),
                startDate: updatedDiscount.startDate,
                endDate: updatedDiscount.endDate,
                isActive: updatedDiscount.isActive,
                description: updatedDiscount.description,
                createdAt: updatedDiscount.createdAt,
                updatedAt: updatedDiscount.updatedAt
            }
        });

    } catch (error) {
        console.error('Error updating cashier discount:', error);
        return res.status(500).json({
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * @swagger
 * /api/v1/cashier-discounts/{id}:
 *   delete:
 *     summary: Delete cashier discount (Admin only)
 *     tags: [Cashier Discounts]
 *     security:
 *       - bearerAuth: []
 */
router.delete('/:id', auth, allowRoles(ROLES.ADMIN), async (req, res) => {
    try {
        const { id } = req.params;

        const discount = await CashierDiscount.findByPk(id);
        if (!discount) {
            return res.status(404).json({ message: 'Cashier discount not found' });
        }

        // Check if discount was used in any orders
        const ordersUsingDiscount = await Order.count({
            where: { cashierDiscountId: id }
        });

        await discount.destroy();

        return res.status(200).json({
            message: 'Cashier discount deleted successfully',
            ordersAffected: ordersUsingDiscount,
            note: ordersUsingDiscount > 0 ? 'Orders that used this discount will retain their discount information' : null
        });

    } catch (error) {
        console.error('Error deleting cashier discount:', error);
        return res.status(500).json({
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

module.exports = router;

