const express = require('express');
const { Transfer, TransferItem, Product, Inventory, Warehouse, Branch, User, ProductSerial } = require('../models');
const auth = require('../middleware/auth');
const { allowRoles, ROLES } = require('../middleware/roles');
const { Op } = require('sequelize');

const router = express.Router();

// Apply authentication to all routes
router.use(auth);

// Admin and Stock Keeper: Create and execute stock transfer
router.post('/', allowRoles(ROLES.ADMIN, ROLES.STOCK_KEEPER), async (req, res) => {
  const transaction = await require('../models').sequelize.transaction();
  
  try {
    const { 
      // Legacy single product fields (for backward compatibility)
      productId, 
      quantity, 
      // New multiple products fields
      items,
      selectSpecificSerials = false,
      // Common fields
      fromLocationType, 
      fromLocationId, 
      toLocationType, 
      toLocationId, 
      notes 
    } = req.body;

    // Determine if this is a single product or multiple products request
    const isMultipleProducts = items && Array.isArray(items) && items.length > 0;
    const isSingleProduct = productId && quantity;

    // Validate request format
    if (!isMultipleProducts && !isSingleProduct) {
      return res.status(400).json({ 
        message: 'Either provide single product fields (productId, quantity) or multiple products (items array)' 
      });
    }

    if (isMultipleProducts && isSingleProduct) {
      return res.status(400).json({ 
        message: 'Cannot provide both single product fields and items array. Use one format only.' 
      });
    }

    // Validate required common fields
    if (!fromLocationType || !fromLocationId || !toLocationType || !toLocationId) {
      return res.status(400).json({ 
        message: 'fromLocationType, fromLocationId, toLocationType, and toLocationId are required' 
      });
    }

    // Validate location types
    if (!['warehouse', 'branch'].includes(fromLocationType) || !['warehouse', 'branch'].includes(toLocationType)) {
      return res.status(400).json({ 
        message: 'fromLocationType and toLocationType must be either "warehouse" or "branch"' 
      });
    }

    // Cannot transfer to the same location
    if (fromLocationType === toLocationType && fromLocationId === toLocationId) {
      return res.status(400).json({ 
        message: 'Cannot transfer to the same location' 
      });
    }

    // Verify locations exist
    let fromLocation, toLocation;
    
    if (fromLocationType === 'warehouse') {
      fromLocation = await Warehouse.findByPk(fromLocationId, { transaction });
    } else {
      fromLocation = await Branch.findByPk(fromLocationId, { transaction });
    }
    if (!fromLocation) {
      await transaction.rollback();
      return res.status(404).json({ 
        message: `From ${fromLocationType} not found` 
      });
    }

    if (toLocationType === 'warehouse') {
      toLocation = await Warehouse.findByPk(toLocationId, { transaction });
    } else {
      toLocation = await Branch.findByPk(toLocationId, { transaction });
    }
    if (!toLocation) {
      await transaction.rollback();
      return res.status(404).json({ 
        message: `To ${toLocationType} not found` 
      });
    }

    // Prepare items array for processing
    let itemsToProcess = [];
    
    if (isSingleProduct) {
      // Convert single product to items format for unified processing
      itemsToProcess = [{
        productId,
        quantity,
        selectedSerials: null
      }];
    } else {
      // Validate multiple products format
      if (selectSpecificSerials) {
        // When selectSpecificSerials is true, each item must have selectedSerials
        for (const item of items) {
          if (!item.productId || !item.quantity || !item.selectedSerials || !Array.isArray(item.selectedSerials)) {
            await transaction.rollback();
            return res.status(400).json({ 
              message: 'When selectSpecificSerials is true, each item must have productId, quantity, and selectedSerials array' 
            });
          }
          if (item.selectedSerials.length !== item.quantity) {
            await transaction.rollback();
            return res.status(400).json({ 
              message: `Item for product ${item.productId}: selectedSerials length (${item.selectedSerials.length}) must match quantity (${item.quantity})` 
            });
          }
        }
      } else {
        // When selectSpecificSerials is false, selectedSerials should be null/empty
        for (const item of items) {
          if (!item.productId || !item.quantity) {
            await transaction.rollback();
            return res.status(400).json({ 
              message: 'Each item must have productId and quantity' 
            });
          }
          if (item.quantity <= 0) {
            await transaction.rollback();
            return res.status(400).json({ 
              message: 'Quantity must be greater than 0 for all items' 
            });
          }
        }
      }
      itemsToProcess = items;
    }

    // Create the main transfer record
    const transfer = await Transfer.create({
      productId: isSingleProduct ? productId : null, // Keep for backward compatibility
      quantity: isSingleProduct ? quantity : null,   // Keep for backward compatibility
      selectSpecificSerials,
      fromLocationType,
      fromLocationId,
      toLocationType,
      toLocationId,
      requestedBy: req.user.id,
      notes,
      status: 'completed' // Execute immediately
    }, { transaction });

    const transferItems = [];
    const allTransferredSerials = [];

    // Process each item
    for (const item of itemsToProcess) {
      const { productId: itemProductId, quantity: itemQuantity, selectedSerials } = item;

      // Verify product exists
      const product = await Product.findByPk(itemProductId, { transaction });
      if (!product) {
        await transaction.rollback();
        return res.status(404).json({ 
          message: `Product ${itemProductId} not found` 
        });
      }

      // Check if inventory exists at source location
      const sourceInventory = await Inventory.findOne({
        where: {
          productId: itemProductId,
          [fromLocationType === 'warehouse' ? 'warehouseId' : 'branchId']: fromLocationId,
          [fromLocationType === 'warehouse' ? 'branchId' : 'warehouseId']: null
        },
        transaction
      });

      if (!sourceInventory) {
        await transaction.rollback();
        return res.status(404).json({ 
          message: `Product ${product.name} not found in source ${fromLocationType}` 
        });
      }

      // Check if there's enough quantity
      if (sourceInventory.quantity < itemQuantity) {
        await transaction.rollback();
        return res.status(400).json({ 
          message: `Insufficient quantity for ${product.name}. Available: ${sourceInventory.quantity}, Requested: ${itemQuantity}` 
        });
      }

      // Create transfer item record
      const transferItem = await TransferItem.create({
        transferId: transfer.id,
        productId: itemProductId,
        quantity: itemQuantity,
        selectedSerials: selectSpecificSerials ? selectedSerials : null
      }, { transaction });

      transferItems.push(transferItem);

      // Handle serials based on selectSpecificSerials flag
      let serialsToTransfer = [];

      if (selectSpecificSerials && selectedSerials) {
        // Transfer specific serials
        const specificSerials = await ProductSerial.findAll({
          where: {
            id: { [Op.in]: selectedSerials },
            productId: itemProductId,
            orderItemId: null, // Only available serials
            [fromLocationType === 'warehouse' ? 'warehouseId' : 'branchId']: fromLocationId,
            [fromLocationType === 'warehouse' ? 'branchId' : 'warehouseId']: null
          },
          transaction
        });

        if (specificSerials.length !== itemQuantity) {
          await transaction.rollback();
          return res.status(400).json({ 
            message: `Not all selected serials are available for ${product.name}. Found: ${specificSerials.length}, Expected: ${itemQuantity}` 
          });
        }

        serialsToTransfer = specificSerials;
      } else {
        // Transfer random available serials
        const whereClause = {
          productId: itemProductId,
          orderItemId: null // Only available serials (not sold)
        };
        
        if (fromLocationType === 'warehouse') {
          whereClause.warehouseId = fromLocationId;
          whereClause.branchId = null;
        } else {
          whereClause.branchId = fromLocationId;
          whereClause.warehouseId = null;
        }

        const availableSerials = await ProductSerial.findAll({
          where: whereClause,
          limit: itemQuantity,
          transaction
        });

        if (availableSerials.length < itemQuantity) {
          await transaction.rollback();
          return res.status(400).json({ 
            message: `Insufficient available serials for ${product.name}. Available: ${availableSerials.length}, Requested: ${itemQuantity}` 
          });
        }

        serialsToTransfer = availableSerials;
      }

      // Transfer the serials to destination location
      const serialIds = serialsToTransfer.map(serial => serial.id);
      await ProductSerial.update({
        [toLocationType === 'warehouse' ? 'warehouseId' : 'branchId']: toLocationId,
        [toLocationType === 'warehouse' ? 'branchId' : 'warehouseId']: null
      }, {
        where: {
          id: {
            [Op.in]: serialIds
          }
        },
        transaction
      });

      // Update source inventory (reduce quantity)
      await sourceInventory.update({
        quantity: sourceInventory.quantity - itemQuantity
      }, { transaction });

      // Find or create destination inventory
      let destInventory = await Inventory.findOne({
        where: {
          productId: itemProductId,
          [toLocationType === 'warehouse' ? 'warehouseId' : 'branchId']: toLocationId,
          [toLocationType === 'warehouse' ? 'branchId' : 'warehouseId']: null
        },
        transaction
      });

      if (destInventory) {
        // Update existing inventory
        await destInventory.update({
          quantity: destInventory.quantity + itemQuantity
        }, { transaction });
      } else {
        // Create new inventory record
        await Inventory.create({
          productId: itemProductId,
          [toLocationType === 'warehouse' ? 'warehouseId' : 'branchId']: toLocationId,
          [toLocationType === 'warehouse' ? 'branchId' : 'warehouseId']: null,
          quantity: itemQuantity
        }, { transaction });
      }

      // Add to all transferred serials for response
      allTransferredSerials.push({
        productId: itemProductId,
        productName: product.name,
        quantity: itemQuantity,
        serials: serialsToTransfer.map(serial => ({
          id: serial.id,
          serialCode: serial.serialCode,
          note: serial.note
        }))
      });
    }

    // Commit transaction
    await transaction.commit();

    // Fetch the created transfer with all related data
    const createdTransfer = await Transfer.findByPk(transfer.id, {
      include: [
        {
          model: Product,
          attributes: ['id', 'name', 'sku', 'barcode']
        },
        {
          model: User,
          as: 'Requester',
          attributes: ['id', 'name', 'email']
        },
        {
          model: TransferItem,
          include: [
            {
              model: Product,
              attributes: ['id', 'name', 'sku', 'barcode']
            }
          ]
        }
      ]
    });

    return res.status(201).json({
      message: 'Stock transfer completed successfully',
      transfer: createdTransfer,
      transferredSerials: allTransferredSerials
    });

  } catch (error) {
    await transaction.rollback();
    console.error('Error creating transfer:', error);
    
    // Handle Sequelize validation errors
    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({
        message: 'Validation error',
        errors: error.errors.map(err => ({
          field: err.path,
          message: err.message
        }))
      });
    }

    return res.status(500).json({
      message: 'Internal server error'
    });
  }
});

// Admin and Stock Keeper: Get all transfers
router.get('/', allowRoles(ROLES.ADMIN, ROLES.STOCK_KEEPER), async (req, res) => {
  try {
    const { page = 1, limit = 50, status, productId } = req.query;
    const offset = (page - 1) * limit;

    const whereClause = {};
    if (status) whereClause.status = status;
    if (productId) whereClause.productId = productId;

    const transfers = await Transfer.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: Product,
          attributes: ['id', 'name', 'sku', 'barcode']
        },
        {
          model: User,
          as: 'Requester',
          attributes: ['id', 'name', 'email']
        },
        {
          model: TransferItem,
          include: [
            {
              model: Product,
              attributes: ['id', 'name', 'sku', 'barcode']
            }
          ]
        }
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    return res.json({
      transfers: transfers.rows,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(transfers.count / limit),
        totalItems: transfers.count,
        itemsPerPage: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Error fetching transfers:', error);
    return res.status(500).json({
      message: 'Internal server error'
    });
  }
});

// Admin and Stock Keeper: Get transfer by ID
router.get('/:id', allowRoles(ROLES.ADMIN, ROLES.STOCK_KEEPER), async (req, res) => {
  try {
    const { id } = req.params;

    const transfer = await Transfer.findByPk(id, {
      include: [
        {
          model: Product,
          attributes: ['id', 'name', 'sku', 'barcode']
        },
        {
          model: User,
          as: 'Requester',
          attributes: ['id', 'name', 'email']
        },
        {
          model: TransferItem,
          include: [
            {
              model: Product,
              attributes: ['id', 'name', 'sku', 'barcode']
            }
          ]
        }
      ]
    });

    if (!transfer) {
      return res.status(404).json({
        message: 'Transfer not found'
      });
    }

    return res.json({
      transfer
    });

  } catch (error) {
    console.error('Error fetching transfer:', error);
    return res.status(500).json({
      message: 'Internal server error'
    });
  }
});

module.exports = router;
