const express = require('express');
const { Product, Category, SubCategory, Inventory, ProductSerial, Warehouse, Order, OrderItem, sequelize, Sequelize } = require('../models');
const { Op } = Sequelize;
const auth = require('../middleware/auth');
const { allowRoles, ROLES } = require('../middleware/roles');

const router = express.Router();

// Helper function to generate EAN-13 check digit
function generateEAN13CheckDigit(barcode) {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(barcode[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return (10 - (sum % 10)) % 10;
}

// Helper function to get category abbreviation
function getCategoryAbbr(categoryName) {
  const abbrMap = {
    'clothing': 'CL',
    'shoes': 'SH',
    'accessories': 'AC',
    'electronics': 'EL'
  };
  return abbrMap[categoryName.toLowerCase()] || 'PR';
}

// Helper function to get subcategory abbreviation
function getSubCategoryAbbr(subCategoryName) {
  const abbrMap = {
    't-shirt': 'TSH',
    'sneakers': 'SNK',
    'boots': 'BOT',
    'sandals': 'SND',
    'jeans': 'JNS',
    'dress': 'DRS',
    'jacket': 'JCK',
    'pants': 'PNT'
  };
  return abbrMap[subCategoryName.toLowerCase()] || 'SUB';
}

// Helper function to get color abbreviation
function getColorAbbr(color) {
  const abbrMap = {
    'black': 'BLK',
    'white': 'WHT',
    'red': 'RED',
    'blue': 'BLU',
    'green': 'GRN',
    'yellow': 'YLW',
    'pink': 'PNK',
    'purple': 'PUR',
    'orange': 'ORG',
    'brown': 'BRN',
    'gray': 'GRY',
    'grey': 'GRY'
  };
  return abbrMap[color.toLowerCase()] || 'CLR';
}

// Create product (admin, stock_keeper)
router.post('/', auth, allowRoles(ROLES.ADMIN, ROLES.STOCK_KEEPER), async (req, res) => {
  const { 
    name, 
    price, 
    cost,
    currency,
    categoryId, 
    subCategoryId, 
    size, 
    shoeSize, 
    color, 
    gender, 
    warehouseId, 
    quantity 
  } = req.body || {};

  // Debug logging
  console.log('Creating product with data:', {
    name, price, cost, currency, categoryId, subCategoryId, 
    size, shoeSize, color, gender, warehouseId, quantity
  });

  // Validate required fields
  if (!name || !name.trim()) {
    return res.status(400).json({ message: 'name is required' });
  }
  if (!price || price <= 0) {
    return res.status(400).json({ message: 'price is required and must be greater than 0' });
  }
  if (!categoryId) {
    return res.status(400).json({ message: 'categoryId is required' });
  }
  if (!subCategoryId) {
    return res.status(400).json({ message: 'subCategoryId is required' });
  }
  if (!cost || cost <= 0) {
    return res.status(400).json({ message: 'cost is required and must be greater than 0' });
  }
  // Color is optional, but if provided, it must not be empty
  if (color !== undefined && color !== null && color !== '' && color.trim() === '') {
    return res.status(400).json({ message: 'color cannot be empty if provided' });
  }
  if (!gender || !['Men', 'Women', 'Unisex', 'Kids'].includes(gender)) {
    return res.status(400).json({ message: 'gender is required and must be Men, Women, Unisex, or Kids' });
  }
  if (!quantity || quantity <= 0) {
    return res.status(400).json({ message: 'quantity is required and must be greater than 0' });
  }
  if (!currency || !currency.trim()) {
    return res.status(400).json({ message: 'currency is required' });
  }

  try {
    // Verify category and subcategory exist
    const category = await Category.findByPk(categoryId);
    const subCategory = await SubCategory.findByPk(subCategoryId);
    
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }
    if (!subCategory) {
      return res.status(404).json({ message: 'SubCategory not found' });
    }

    // Verify warehouse exists (default to central if not provided)
    let targetWarehouseId = warehouseId;
    if (!targetWarehouseId) {
      const centralWarehouse = await Warehouse.findOne({ where: { type: 'central' } });
      if (!centralWarehouse) {
        return res.status(404).json({ message: 'No central warehouse found. Please specify a warehouseId' });
      }
      targetWarehouseId = centralWarehouse.id;
    } else {
      const warehouse = await Warehouse.findByPk(targetWarehouseId);
      if (!warehouse) {
        return res.status(404).json({ message: 'Warehouse not found' });
      }
    }

    // Generate SKU
    const categoryAbbr = getCategoryAbbr(category.name);
    const subCategoryAbbr = getSubCategoryAbbr(subCategory.name);
    const colorAbbr = color ? getColorAbbr(color) : 'NOC';
    
    // Generate SKU pattern - include size/shoeSize only if they exist
    let skuPattern;
    if (size || shoeSize) {
      // Include size in SKU if provided
      skuPattern = `${categoryAbbr}-${subCategoryAbbr}-${size || shoeSize}-${colorAbbr}`;
    } else {
      // No size, generate SKU without size component
      skuPattern = `${categoryAbbr}-${subCategoryAbbr}-${colorAbbr}`;
    }
    
    // Find the highest existing sequence number for this pattern
    const existingProducts = await Product.findAll({
      where: {
        sku: {
          [require('sequelize').Op.like]: `${skuPattern}-%`
        }
      },
      order: [['createdAt', 'DESC']]
    });
    
    // Extract sequence numbers and find the highest
    let maxSeq = 0;
    existingProducts.forEach(product => {
      const parts = product.sku.split('-');
      const seqPart = parts[parts.length - 1];
      const seqNum = parseInt(seqPart, 10);
      if (!isNaN(seqNum) && seqNum > maxSeq) {
        maxSeq = seqNum;
      }
    });
    
    const nextSeq = String(maxSeq + 1).padStart(3, '0');
    const sku = `${skuPattern}-${nextSeq}`;
    
    console.log('Generated SKU:', sku, 'from pattern:', skuPattern, 'maxSeq:', maxSeq, 'hasSize:', !!(size || shoeSize));

    // Generate product barcode (EAN-13 compatible) - starts with 1
    // Find the highest existing product barcode sequence numerically
    const [maxProductRow] = await Product.findAll({
      attributes: [
        [sequelize.literal('MAX(CAST(SUBSTRING(barcode, 2, 11) AS UNSIGNED))'), 'maxSeq']
      ],
      raw: true
    });

    let nextProductSeq = 1;
    if (maxProductRow && maxProductRow.maxSeq !== null && maxProductRow.maxSeq !== undefined) {
      const parsedMax = parseInt(maxProductRow.maxSeq, 10);
      nextProductSeq = Number.isFinite(parsedMax) ? parsedMax + 1 : 1;
    }

    const productBarcodeBase = `1${String(nextProductSeq).padStart(11, '0')}`; // 1 + 11 digits
    const productCheckDigit = generateEAN13CheckDigit(productBarcodeBase);
    const productBarcode = productBarcodeBase + productCheckDigit;

    console.log('Generated product barcode:', productBarcode, 'sequence:', nextProductSeq);

    // Create product with retry mechanism for SKU conflicts
    let product;
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
      try {
        product = await Product.create({
          name,
          sku,
          barcode: productBarcode,
          price,
          cost,
          categoryId,
          subCategoryId,
          size: size || null,
          shoeSize: shoeSize || null,
          color,
          gender,
          currency
        });
        break; // Success, exit the retry loop
      } catch (error) {
        if (error.name === 'SequelizeUniqueConstraintError' && error.fields && error.fields.sku) {
          attempts++;
          console.log(`SKU conflict detected, retrying... (attempt ${attempts}/${maxAttempts})`);
          
          // Generate a new SKU with timestamp to ensure uniqueness
          const timestamp = Date.now().toString().slice(-3);
          sku = `${skuPattern}-${timestamp}`;
          console.log('New SKU generated:', sku);
        } else {
          throw error; // Re-throw if it's not a SKU conflict
        }
      }
    }
    
    if (attempts >= maxAttempts) {
      throw new Error('Failed to generate unique SKU after multiple attempts');
    }

    // Create inventory record
    const inventory = await Inventory.create({
      productId: product.id,
      warehouseId: targetWarehouseId,
      branchId: null,
      quantity
    });

    // Generate serials for each unit (EAN-13 compatible) - starts with 2
    const serials = [];
    
    // Generate batch ID for this initial creation
    const { v4: uuidv4 } = require('uuid');
    const batchId = uuidv4();
    
    // Compute the highest existing numeric serial sequence robustly in DB to avoid lexicographic issues
    const [maxRow] = await ProductSerial.findAll({
      attributes: [[sequelize.literal('MAX(CAST(SUBSTRING(serial_code, 2, 11) AS UNSIGNED))'), 'maxSeq']],
      raw: true
    });
    let baseSerialSeq = 1;
    if (maxRow && maxRow.maxSeq !== null && maxRow.maxSeq !== undefined) {
      const parsedMax = parseInt(maxRow.maxSeq, 10);
      baseSerialSeq = Number.isFinite(parsedMax) ? parsedMax + 1 : 1;
    }
    
    for (let i = 1; i <= quantity; i++) {
      // Generate serial barcode (EAN-13) - starts with 2 to avoid confusion
      const serialSeq = baseSerialSeq + i - 1; // Ensure unique sequence across all products
      const serialBarcodeBase = `2${String(serialSeq).padStart(11, '0')}`; // 2 + 11 digits
      const serialCheckDigit = generateEAN13CheckDigit(serialBarcodeBase);
      const serialBarcode = serialBarcodeBase + serialCheckDigit;
      
      // Keep human-readable serial code for reference
      const humanSerialCode = `${sku}-${String(i).padStart(4, '0')}`;
      
      const serial = await ProductSerial.create({
        productId: product.id,
        serialCode: serialBarcode, // Store the scannable barcode
        note: `in_stock - warehouse ${targetWarehouseId} (${humanSerialCode})`,
        warehouseId: targetWarehouseId,
        branchId: null,
        orderItemId: null,
        isPrinted: false,
        batchId: batchId
      });
      serials.push(serial);
    }

    return res.status(201).json({
      product: {
        id: product.id,
        name: product.name,
        sku: product.sku,
        barcode: product.barcode,
        price: product.price,
        cost: product.cost,
        categoryId: product.categoryId,
        subCategoryId: product.subCategoryId,
        size: product.size,
        shoeSize: product.shoeSize,
        color: product.color,
        gender: product.gender,
        isPrinted: product.isPrinted,
        currency: product.currency,
        createdAt: product.createdAt,
        updatedAt: product.updatedAt
      },
      inventory: {
        id: inventory.id,
        productId: inventory.productId,
        warehouseId: inventory.warehouseId,
        quantity: inventory.quantity
      },
      serials: serials.map(s => ({
        id: s.id,
        serialCode: s.serialCode, // EAN-13 scannable barcode
        humanCode: s.note.split('(')[1]?.replace(')', ''), // Human-readable code
        note: s.note,
        warehouseId: s.warehouseId
      })),
      message: `Product created successfully with ${quantity} units and serials`
    });

  } catch (error) {
    console.error('Error creating product:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    return res.status(500).json({ 
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get all products (admin, stock_keeper)
router.get('/', auth, allowRoles(ROLES.ADMIN, ROLES.STOCK_KEEPER), async (req, res) => {
  // Disable caching to ensure fresh data
  res.set({
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  
  try {
    const { page = 1, limit = 1000, categoryId, subCategoryId, gender, color } = req.query; 
    const offset = (page - 1) * limit;
    
    console.log('Backend: Received limit parameter:', limit);
    console.log('Backend: Parsed limit:', parseInt(limit));
    
    // If limit is 1000 or higher, disable pagination to get all products
    const shouldPaginate = parseInt(limit) < 1000;
    console.log('Backend: Should paginate:', shouldPaginate);

    // Build where clause for filtering
    const whereClause = {};
    if (categoryId) whereClause.categoryId = categoryId;
    if (subCategoryId) whereClause.subCategoryId = subCategoryId;
    if (gender) whereClause.gender = gender;
    if (color) whereClause.color = color;

    // Get products with conditional pagination
    const queryOptions = {
      where: whereClause,
      include: [
        {
          model: require('../models').Category,
          as: 'Category',
          attributes: ['id', 'name']
        },
        {
          model: require('../models').SubCategory,
          as: 'SubCategory',
          attributes: ['id', 'name']
        }
      ],
      order: [['createdAt', 'DESC']]
    };
    
    // Only add pagination if limit is less than 1000
    if (shouldPaginate) {
      queryOptions.limit = parseInt(limit);
      queryOptions.offset = parseInt(offset);
    }
    
    const { count, rows: products } = await Product.findAndCountAll(queryOptions);
    
    console.log('Backend: Total count from database:', count);
    console.log('Backend: Products returned:', products.length);
    
    // Also check total products without any filters
    const totalProductsInDB = await Product.count();
    console.log('Backend: Total products in database (no filters):', totalProductsInDB);

    // Get inventory information for each product
    const productsWithInventory = await Promise.all(
      products.map(async (product) => {
        const inventory = await Inventory.findAll({
          where: { productId: product.id },
          include: [
            {
              model: require('../models').Warehouse,
              as: 'Warehouse',
              attributes: ['id', 'name', 'type']
            },
            {
              model: require('../models').Branch,
              as: 'Branch',
              attributes: ['id', 'name']
            }
          ]
        });

        // Calculate total quantity across all warehouses/branches
        const totalQuantity = inventory.reduce((sum, inv) => sum + inv.quantity, 0);

        return {
          id: product.id,
          name: product.name,
          sku: product.sku,
          barcode: product.barcode,
          price: product.price,
          cost: product.cost,
          currency: product.currency,
          category: product.Category ? {
            id: product.Category.id,
            name: product.Category.name
          } : null,
          subCategory: product.SubCategory ? {
            id: product.SubCategory.id,
            name: product.SubCategory.name
          } : null,
          size: product.size,
          shoeSize: product.shoeSize,
          color: product.color,
          gender: product.gender,
          isPrinted: product.isPrinted,
          totalQuantity,
          inventory: inventory.map(inv => ({
            id: inv.id,
            warehouse: inv.Warehouse ? {
              id: inv.Warehouse.id,
              name: inv.Warehouse.name,
              type: inv.Warehouse.type
            } : null,
            branch: inv.Branch ? {
              id: inv.Branch.id,
              name: inv.Branch.name
            } : null,
            quantity: inv.quantity
          })),
          createdAt: product.createdAt,
          updatedAt: product.updatedAt
        };
      })
    );

    return res.json({
      products: productsWithInventory,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(count / limit),
        totalItems: count,
        itemsPerPage: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Error fetching products:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// Search products by barcode (product or serial) - all roles with branch filtering
router.get('/search', auth, allowRoles(ROLES.ADMIN, ROLES.STOCK_KEEPER, ROLES.BRANCH_MANAGER, ROLES.CASHIER), async (req, res) => {
  try {
    const { code } = req.query;
    
    if (!code || !code.trim()) {
      return res.status(400).json({ message: 'code parameter is required' });
    }

    console.log('Backend: Search request - code:', code, 'role:', req.user.role);

    // Determine search scope based on role
    let branchFilter = null;
    
    if (req.user.role === 'cashier' || req.user.role === 'branch_manager') {
      // Cashiers and Branch Managers: Only their branch
      if (!req.user.branchId) {
        return res.status(403).json({ 
          message: 'User not assigned to any branch' 
        });
      }
      branchFilter = req.user.branchId;
      console.log('Backend: Branch-filtered search for', req.user.role, '- branch:', branchFilter);
    } else {
      console.log('Backend: Global search for', req.user.role);
    }

    // Detect barcode type by first character
    if (code.startsWith('1')) {
      // Product barcode search
      console.log('Backend: Searching for product barcode');
      
      const product = await Product.findOne({
        where: { barcode: code },
        include: [
          {
            model: Category,
            as: 'Category',
            attributes: ['id', 'name']
          },
          {
            model: SubCategory,
            as: 'SubCategory',
            attributes: ['id', 'name']
          }
        ]
      });

      if (!product) {
        return res.status(404).json({ 
          message: 'Product not found with this barcode',
          type: 'product'
        });
      }

      // Get available serials in scope (branch or global)
      const serialsWhere = {
        productId: product.id,
        orderItemId: null  // Only available serials
      };
      
      if (branchFilter) {
        serialsWhere.branchId = branchFilter;
      }

      const availableSerials = await ProductSerial.findAll({
        where: serialsWhere,
        include: [
          {
            model: require('../models').Warehouse,
            as: 'Warehouse',
            attributes: ['id', 'name', 'type']
          },
          {
            model: require('../models').Branch,
            as: 'Branch',
            attributes: ['id', 'name', 'location']
          }
        ],
        order: [['createdAt', 'ASC']]
      });

      // Get inventory count
      const inventoryWhere = { productId: product.id };
      if (branchFilter) {
        inventoryWhere.branchId = branchFilter;
      }

      const inventory = await Inventory.findAll({
        where: inventoryWhere
      });

      const totalAvailable = inventory.reduce((sum, inv) => sum + inv.quantity, 0);

      console.log('Backend: Found product with', availableSerials.length, 'available serials');

      return res.json({
        type: 'product',
        product: {
          id: product.id,
          name: product.name,
          sku: product.sku,
          barcode: product.barcode,
          price: parseFloat(product.price),
          cost: parseFloat(product.cost),
          currency: product.currency,
          category: product.Category ? {
            id: product.Category.id,
            name: product.Category.name
          } : null,
          subCategory: product.SubCategory ? {
            id: product.SubCategory.id,
            name: product.SubCategory.name
          } : null,
          size: product.size,
          shoeSize: product.shoeSize,
          color: product.color,
          gender: product.gender,
          isPrinted: product.isPrinted,
          availableInScope: totalAvailable
        },
        availableSerials: availableSerials.map(serial => ({
          id: serial.id,
          serialCode: serial.serialCode,
          humanCode: serial.note.split('(')[1]?.replace(')', ''),
          isPrinted: serial.isPrinted,
          status: 'available',
          location: serial.Warehouse ? {
            type: 'warehouse',
            id: serial.Warehouse.id,
            name: serial.Warehouse.name
          } : serial.Branch ? {
            type: 'branch',
            id: serial.Branch.id,
            name: serial.Branch.name,
            location: serial.Branch.location
          } : null
        })),
        scope: branchFilter ? 'branch' : 'global',
        branchId: branchFilter
      });

    } else if (code.startsWith('2')) {
      // Serial barcode search
      console.log('Backend: Searching for serial barcode');
      
      const serialWhere = { serialCode: code };
      if (branchFilter) {
        serialWhere.branchId = branchFilter;
      }

      const serial = await ProductSerial.findOne({
        where: serialWhere,
        include: [
          {
            model: Product,
            as: 'Product',
            include: [
              {
                model: Category,
                as: 'Category',
                attributes: ['id', 'name']
              },
              {
                model: SubCategory,
                as: 'SubCategory',
                attributes: ['id', 'name']
              }
            ]
          },
          {
            model: require('../models').Warehouse,
            as: 'Warehouse',
            attributes: ['id', 'name', 'type']
          },
          {
            model: require('../models').Branch,
            as: 'Branch',
            attributes: ['id', 'name', 'location']
          },
          {
            model: OrderItem,
            as: 'OrderItem',
            include: [
              {
                model: Order,
                as: 'Order',
                attributes: ['id', 'status', 'createdAt']
              }
            ]
          }
        ]
      });

      if (!serial) {
        // Check if serial exists in another branch
        if (branchFilter) {
          const serialElsewhere = await ProductSerial.findOne({
            where: { serialCode: code }
          });
          
          if (serialElsewhere) {
            return res.status(404).json({ 
              message: 'Serial not found in your branch. It may exist in another location.',
              type: 'serial',
              available: false
            });
          }
        }
        
        return res.status(404).json({ 
          message: 'Serial not found with this barcode',
          type: 'serial'
        });
      }

      const status = serial.orderItemId ? 'sold' : 'available';
      const product = serial.Product;

      console.log('Backend: Found serial with status:', status);

      const response = {
        type: 'serial',
        serial: {
          id: serial.id,
          serialCode: serial.serialCode,
          humanCode: serial.note.split('(')[1]?.replace(')', ''),
          status: status,
          isPrinted: serial.isPrinted,
          batchId: serial.batchId
        },
        product: {
          id: product.id,
          name: product.name,
          sku: product.sku,
          barcode: product.barcode,
          price: parseFloat(product.price),
          cost: parseFloat(product.cost),
          currency: product.currency,
          category: product.Category ? {
            id: product.Category.id,
            name: product.Category.name
          } : null,
          subCategory: product.SubCategory ? {
            id: product.SubCategory.id,
            name: product.SubCategory.name
          } : null,
          size: product.size,
          shoeSize: product.shoeSize,
          color: product.color,
          gender: product.gender
        },
        location: serial.Warehouse ? {
          type: 'warehouse',
          id: serial.Warehouse.id,
          name: serial.Warehouse.name
        } : serial.Branch ? {
          type: 'branch',
          id: serial.Branch.id,
          name: serial.Branch.name,
          location: serial.Branch.location
        } : null,
        scope: branchFilter ? 'branch' : 'global',
        branchId: branchFilter
      };

      // If sold, add order info and error
      if (status === 'sold' && serial.OrderItem) {
        response.order = {
          id: serial.OrderItem.Order.id,
          orderNumber: `ORD-${serial.OrderItem.Order.id.substring(0, 8).toUpperCase()}`,
          status: serial.OrderItem.Order.status,
          soldAt: serial.OrderItem.Order.createdAt
        };
        response.error = 'This item has already been sold';
      }

      return res.json(response);

    } else {
      // Invalid barcode format
      return res.status(400).json({ 
        message: 'Invalid barcode format. Expected product barcode (starts with 1) or serial barcode (starts with 2)',
        providedCode: code
      });
    }

  } catch (error) {
    console.error('Error searching by barcode:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// Get products for current user's branch (branch_manager, cashier)
router.get('/branch/my-products', auth, allowRoles(ROLES.BRANCH_MANAGER, ROLES.CASHIER), async (req, res) => {
  // Disable caching to ensure fresh data
  res.set({
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  
  try {
    // Ensure user has a branch assigned
    if (!req.user.branchId) {
      return res.status(403).json({ 
        message: 'User is not assigned to any branch' 
      });
    }

    const { page = 1, limit = 1000, categoryId, subCategoryId, gender, color } = req.query;
    const offset = (page - 1) * limit;
    
    console.log('Backend: Branch products request - branchId:', req.user.branchId);
    console.log('Backend: Received limit parameter:', limit);
    
    // Check if pagination should be disabled
    const shouldPaginate = parseInt(limit) < 1000;
    console.log('Backend: Should paginate:', shouldPaginate);

    // First, find all products that have inventory in this branch
    const inventoryInBranch = await Inventory.findAll({
      where: { 
        branchId: req.user.branchId,
        quantity: {
          [require('sequelize').Op.gt]: 0
        }
      },
      attributes: ['productId']
    });

    // Extract product IDs
    const productIds = inventoryInBranch.map(inv => inv.productId);
    console.log('Backend: Found', productIds.length, 'products in branch');

    if (productIds.length === 0) {
      return res.json({
        products: [],
        branch: {
          id: req.user.branchId
        },
        pagination: {
          currentPage: parseInt(page),
          totalPages: 0,
          totalItems: 0,
          itemsPerPage: parseInt(limit)
        }
      });
    }

    // Build where clause for filtering
    const whereClause = {
      id: {
        [require('sequelize').Op.in]: productIds
      }
    };
    if (categoryId) whereClause.categoryId = categoryId;
    if (subCategoryId) whereClause.subCategoryId = subCategoryId;
    if (gender) whereClause.gender = gender;
    if (color) whereClause.color = color;

    // Get products with conditional pagination
    const queryOptions = {
      where: whereClause,
      include: [
        {
          model: Category,
          as: 'Category',
          attributes: ['id', 'name']
        },
        {
          model: SubCategory,
          as: 'SubCategory',
          attributes: ['id', 'name']
        }
      ],
      order: [['createdAt', 'DESC']]
    };
    
    // Only add pagination if limit is less than 1000
    if (shouldPaginate) {
      queryOptions.limit = parseInt(limit);
      queryOptions.offset = parseInt(offset);
    }
    
    const { count, rows: products } = await Product.findAndCountAll(queryOptions);
    console.log('Backend: Products returned:', products.length);

    // Get inventory information for each product (only from current branch)
    const productsWithInventory = await Promise.all(
      products.map(async (product) => {
        const inventory = await Inventory.findAll({
          where: { 
            productId: product.id,
            branchId: req.user.branchId
          },
          include: [
            {
              model: require('../models').Branch,
              as: 'Branch',
              attributes: ['id', 'name', 'location']
            }
          ]
        });

        // Calculate total quantity in this branch only
        const totalQuantity = inventory.reduce((sum, inv) => sum + inv.quantity, 0);

        return {
          id: product.id,
          name: product.name,
          sku: product.sku,
          barcode: product.barcode,
          price: product.price,
          cost: product.cost,
          currency: product.currency,
          category: product.Category ? {
            id: product.Category.id,
            name: product.Category.name
          } : null,
          subCategory: product.SubCategory ? {
            id: product.SubCategory.id,
            name: product.SubCategory.name
          } : null,
          size: product.size,
          shoeSize: product.shoeSize,
          color: product.color,
          gender: product.gender,
          isPrinted: product.isPrinted,
          totalQuantity, // Quantity in this branch only
          inventory: inventory.map(inv => ({
            id: inv.id,
            branch: inv.Branch ? {
              id: inv.Branch.id,
              name: inv.Branch.name,
              location: inv.Branch.location
            } : null,
            quantity: inv.quantity
          })),
          createdAt: product.createdAt,
          updatedAt: product.updatedAt
        };
      })
    );

    return res.json({
      products: productsWithInventory,
      branch: {
        id: req.user.branchId
      },
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(count / limit),
        totalItems: count,
        itemsPerPage: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Error fetching branch products:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// Get specific product details for current user's branch (branch_manager, cashier)
router.get('/branch/:id', auth, allowRoles(ROLES.BRANCH_MANAGER, ROLES.CASHIER), async (req, res) => {
  try {
    const { id } = req.params;
    
    // Ensure user has a branch assigned
    if (!req.user.branchId) {
      return res.status(403).json({ 
        message: 'User is not assigned to any branch' 
      });
    }

    console.log('Backend: Branch product details request - branchId:', req.user.branchId, 'productId:', id);

    // Get product with category and subcategory
    const product = await Product.findByPk(id, {
      include: [
        {
          model: require('../models').Category,
          as: 'Category',
          attributes: ['id', 'name']
        },
        {
          model: require('../models').SubCategory,
          as: 'SubCategory',
          attributes: ['id', 'name']
        }
      ]
    });

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Get inventory information ONLY for this branch
    const inventory = await Inventory.findAll({
      where: { 
        productId: product.id,
        branchId: req.user.branchId
      },
      include: [
        {
          model: require('../models').Branch,
          as: 'Branch',
          attributes: ['id', 'name', 'location']
        }
      ]
    });

    // Check if product exists in this branch
    if (inventory.length === 0) {
      return res.status(404).json({ 
        message: 'Product not available in your branch' 
      });
    }

    // Calculate total quantity in this branch only
    const totalQuantity = inventory.reduce((sum, inv) => sum + inv.quantity, 0);

    // Get product serials ONLY for this branch
    const serials = await ProductSerial.findAll({
      where: { 
        productId: product.id,
        branchId: req.user.branchId
      },
      include: [
        {
          model: require('../models').Branch,
          as: 'Branch',
          attributes: ['id', 'name']
        }
      ],
      order: [['createdAt', 'ASC']]
    });

    console.log('Backend: Found', totalQuantity, 'units and', serials.length, 'serials in branch');

    return res.json({
      product: {
        id: product.id,
        name: product.name,
        sku: product.sku,
        barcode: product.barcode,
        price: product.price,
        cost: product.cost,
        currency: product.currency,
        category: product.Category ? {
          id: product.Category.id,
          name: product.Category.name
        } : null,
        subCategory: product.SubCategory ? {
          id: product.SubCategory.id,
          name: product.SubCategory.name
        } : null,
        size: product.size,
        shoeSize: product.shoeSize,
        color: product.color,
        gender: product.gender,
        isPrinted: product.isPrinted,
        totalQuantity, // Quantity in this branch only
        inventory: inventory.map(inv => ({
          id: inv.id,
          branch: inv.Branch ? {
            id: inv.Branch.id,
            name: inv.Branch.name,
            location: inv.Branch.location
          } : null,
          quantity: inv.quantity
        })),
        serials: serials.map(serial => ({
          id: serial.id,
          serialCode: serial.serialCode,
          humanCode: serial.note.split('(')[1]?.replace(')', ''),
          note: serial.note,
          isPrinted: serial.isPrinted,
          batchId: serial.batchId,
          branch: serial.Branch ? {
            id: serial.Branch.id,
            name: serial.Branch.name
          } : null,
          orderItemId: serial.orderItemId,
          createdAt: serial.createdAt,
          updatedAt: serial.updatedAt
        })),
        createdAt: product.createdAt,
        updatedAt: product.updatedAt
      },
      branch: {
        id: req.user.branchId
      }
    });

  } catch (error) {
    console.error('Error fetching branch product details:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// Get specific product by ID (admin, stock_keeper)
router.get('/:id', auth, allowRoles(ROLES.ADMIN, ROLES.STOCK_KEEPER), async (req, res) => {
  try {
    const { id } = req.params;

    // Get product with category and subcategory
    const product = await Product.findByPk(id, {
      include: [
        {
          model: require('../models').Category,
          as: 'Category',
          attributes: ['id', 'name']
        },
        {
          model: require('../models').SubCategory,
          as: 'SubCategory',
          attributes: ['id', 'name']
        }
      ]
    });

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Get inventory information for this product
    const inventory = await Inventory.findAll({
      where: { productId: product.id },
      include: [
        {
          model: require('../models').Warehouse,
          as: 'Warehouse',
          attributes: ['id', 'name', 'type', 'location']
        },
        {
          model: require('../models').Branch,
          as: 'Branch',
          attributes: ['id', 'name', 'location']
        }
      ]
    });

    // Calculate total quantity across all warehouses/branches
    const totalQuantity = inventory.reduce((sum, inv) => sum + inv.quantity, 0);

    // Get product serials for this product
    const serials = await ProductSerial.findAll({
      where: { productId: product.id },
      include: [
        {
          model: require('../models').Warehouse,
          as: 'Warehouse',
          attributes: ['id', 'name', 'type']
        },
        {
          model: require('../models').Branch,
          as: 'Branch',
          attributes: ['id', 'name']
        }
      ],
      order: [['createdAt', 'ASC']]
    });

    return res.json({
      product: {
        id: product.id,
        name: product.name,
        sku: product.sku,
        barcode: product.barcode,
        price: product.price,
        cost: product.cost,
          currency: product.currency,
        category: product.Category ? {
          id: product.Category.id,
          name: product.Category.name
        } : null,
        subCategory: product.SubCategory ? {
          id: product.SubCategory.id,
          name: product.SubCategory.name
        } : null,
        size: product.size,
        shoeSize: product.shoeSize,
        color: product.color,
        gender: product.gender,
        isPrinted: product.isPrinted,
        totalQuantity,
        inventory: inventory.map(inv => ({
          id: inv.id,
          warehouse: inv.Warehouse ? {
            id: inv.Warehouse.id,
            name: inv.Warehouse.name,
            type: inv.Warehouse.type,
            location: inv.Warehouse.location
          } : null,
          branch: inv.Branch ? {
            id: inv.Branch.id,
            name: inv.Branch.name,
            location: inv.Branch.location
          } : null,
          quantity: inv.quantity
        })),
        serials: serials.map(serial => ({
          id: serial.id,
          serialCode: serial.serialCode,
          humanCode: serial.note.split('(')[1]?.replace(')', ''),
          note: serial.note,
          isPrinted: serial.isPrinted,
          batchId: serial.batchId,
          warehouse: serial.Warehouse ? {
            id: serial.Warehouse.id,
            name: serial.Warehouse.name,
            type: serial.Warehouse.type
          } : null,
          branch: serial.Branch ? {
            id: serial.Branch.id,
            name: serial.Branch.name
          } : null,
          orderItemId: serial.orderItemId,
          createdAt: serial.createdAt,
          updatedAt: serial.updatedAt
        })),
        createdAt: product.createdAt,
        updatedAt: product.updatedAt
      }
    });

  } catch (error) {
    console.error('Error fetching product:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// Mark product barcodes as printed
router.post('/:id/mark-printed', auth, allowRoles(ROLES.ADMIN, ROLES.STOCK_KEEPER), async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;

    // Find the product
    const product = await Product.findByPk(id, { transaction });
    
    if (!product) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Product not found' });
    }

    // Mark product as printed
    await product.update({ isPrinted: true }, { transaction });

    // Mark ALL unassigned serials for this product as printed
    const [updatedCount] = await ProductSerial.update(
      { isPrinted: true },
      {
        where: {
          productId: id,
          orderItemId: null  // Only unassigned serials
        },
        transaction
      }
    );

    await transaction.commit();

    return res.json({
      message: 'Product barcodes marked as printed successfully',
      product: {
        id: product.id,
        name: product.name,
        isPrinted: true
      },
      serialsMarked: updatedCount || 0
    });

  } catch (error) {
    await transaction.rollback();
    console.error('Error marking product as printed:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// Update product (admin, stock_keeper)
router.put('/:id', auth, allowRoles(ROLES.ADMIN, ROLES.STOCK_KEEPER), async (req, res) => {
  const transaction = await require('../models').sequelize.transaction();
  try {
    const { id } = req.params;
    const { name, price, cost, currency, size, color, shoeSize, gender } = req.body || {};
    const { operation, quantity, warehouseId, branchId } = req.body || {};

    // Find the product
    const product = await Product.findByPk(id, { transaction });
    if (!product) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Product not found' });
    }

    // Validate product fields
    const hasProductFields = (
      name !== undefined || price !== undefined || cost !== undefined || currency !== undefined ||
      size !== undefined || color !== undefined || shoeSize !== undefined || gender !== undefined
    );

    const hasQuantityOperation = (operation !== undefined || quantity !== undefined || warehouseId !== undefined || branchId !== undefined);

    if (!hasProductFields && !hasQuantityOperation) {
      await transaction.rollback();
      return res.status(400).json({ 
        message: 'Provide product fields (name, price, cost, currency, size, color, shoeSize, gender) or quantity operation (operation, quantity)'
      });
    }

    if (name !== undefined && (!name || !name.trim())) {
      await transaction.rollback();
      return res.status(400).json({ message: 'name cannot be empty' });
    }
    if (price !== undefined && (price <= 0 || isNaN(price))) {
      await transaction.rollback();
      return res.status(400).json({ message: 'price must be a positive number' });
    }
    if (cost !== undefined && (cost <= 0 || isNaN(cost))) {
      await transaction.rollback();
      return res.status(400).json({ message: 'cost must be a positive number' });
    }
    if (currency !== undefined && (!currency || !currency.trim())) {
      await transaction.rollback();
      return res.status(400).json({ message: 'currency cannot be empty if provided' });
    }
    if (gender !== undefined && !['Men', 'Women', 'Unisex', 'Kids'].includes(gender)) {
      await transaction.rollback();
      return res.status(400).json({ message: 'gender must be Men, Women, Unisex, or Kids' });
    }

    // Apply product field updates
    if (name !== undefined) product.name = name;
    if (price !== undefined) product.price = price;
    if (cost !== undefined) product.cost = cost;
    if (currency !== undefined) product.currency = currency;
    if (size !== undefined) product.size = size;
    if (color !== undefined) product.color = color;
    if (shoeSize !== undefined) product.shoeSize = shoeSize;
    if (gender !== undefined) product.gender = gender;

    if (hasProductFields) {
      await product.save({ transaction });
    }

    const createdSerials = [];
    const deletedSerials = [];
    const updatedInventory = [];

    // Quantity operation handling
    if (operation !== undefined || quantity !== undefined) {
      if (!operation || !['increase', 'decrease'].includes(operation)) {
        await transaction.rollback();
        return res.status(400).json({ message: "operation must be 'increase' or 'decrease'" });
      }
      if (!quantity || quantity <= 0 || !Number.isInteger(Number(quantity))) {
        await transaction.rollback();
        return res.status(400).json({ message: 'quantity is required and must be a positive integer' });
      }

      // Validate location existence when provided
      if (warehouseId) {
        const warehouse = await Warehouse.findByPk(warehouseId, { transaction });
        if (!warehouse) {
          await transaction.rollback();
          return res.status(404).json({ message: 'Warehouse not found' });
        }
      }
      if (branchId) {
        const Branch = require('../models').Branch;
        const branch = await Branch.findByPk(branchId, { transaction });
        if (!branch) {
          await transaction.rollback();
          return res.status(404).json({ message: 'Branch not found' });
        }
      }

      if (operation === 'increase') {
        if (!warehouseId && !branchId) {
          await transaction.rollback();
          return res.status(400).json({ message: 'warehouseId or branchId is required for increase operation' });
        }

        const invWhere = {
          productId: product.id,
          warehouseId: warehouseId || null,
          branchId: branchId || null
        };

        let invRecord = await Inventory.findOne({ where: invWhere, transaction, lock: transaction.LOCK.UPDATE });
        
        // Track if product was previously printed
        const wasPrinted = product.isPrinted;
        
        if (!invRecord) {
          invRecord = await Inventory.create({
            productId: product.id,
            warehouseId: warehouseId || null,
            branchId: branchId || null,
            quantity: 0
          }, { transaction });
        }

        // Generate batch ID for new serials
        const { v4: uuidv4 } = require('uuid');
        const newBatchId = uuidv4();

        // Determine max serial sequence numerically (SQL) to avoid lexicographic sort issues
        const [maxRow] = await ProductSerial.findAll({
          attributes: [[require('../models').sequelize.literal('MAX(CAST(SUBSTRING(serial_code, 2, 11) AS UNSIGNED))'), 'maxSeq']],
          raw: true,
          transaction,
          lock: transaction.LOCK.UPDATE
        });
        let baseSerialSeq = 1;
        if (maxRow && maxRow.maxSeq !== null && maxRow.maxSeq !== undefined) {
          const parsedMax = parseInt(maxRow.maxSeq, 10);
          baseSerialSeq = Number.isFinite(parsedMax) ? parsedMax + 1 : 1;
        }

        for (let i = 0; i < Number(quantity); i++) {
          const serialSeq = baseSerialSeq + i;
          const serialBarcodeBase = `2${String(serialSeq).padStart(11, '0')}`;
          const serialCheckDigit = generateEAN13CheckDigit(serialBarcodeBase);
          const serialBarcode = serialBarcodeBase + serialCheckDigit;

          const serial = await ProductSerial.create({
            productId: product.id,
            serialCode: serialBarcode,
            note: `in_stock - ${warehouseId ? `warehouse ${warehouseId}` : `branch ${branchId}`}`,
            warehouseId: warehouseId || null,
            branchId: branchId || null,
            orderItemId: null,
            isPrinted: false,
            batchId: newBatchId
          }, { transaction });

          createdSerials.push({ 
            id: serial.id, 
            serialCode: serial.serialCode, 
            warehouseId: warehouseId || null, 
            branchId: branchId || null,
            batchId: newBatchId
          });
        }

        const newQty = invRecord.quantity + Number(quantity);
        await invRecord.update({ quantity: newQty }, { transaction });
        updatedInventory.push({ 
          id: invRecord.id, 
          warehouseId: invRecord.warehouseId, 
          branchId: invRecord.branchId, 
          quantity: newQty,
          wasPrinted: wasPrinted,
          newBatchId: newBatchId
        });
      }

      if (operation === 'decrease') {
        if (!warehouseId && !branchId) {
          await transaction.rollback();
          return res.status(400).json({ message: 'warehouseId or branchId is required for decrease operation' });
        }

        const invWhere = { productId: product.id };
        if (warehouseId) invWhere.warehouseId = warehouseId;
        if (branchId) invWhere.branchId = branchId;

        const inventoryRecords = await Inventory.findAll({ where: invWhere, transaction, lock: transaction.LOCK.UPDATE });
        if (inventoryRecords.length === 0) {
          await transaction.rollback();
          return res.status(404).json({ message: 'No inventory found for this product at the specified location(s)' });
        }

        // Get the inventory record (assuming single location for now)
        const inventory = inventoryRecords[0];
        const { selectedSerials } = req.body;

        // Check if product was printed
        if (product.isPrinted) {
          // Require specific serial selection when printed
          if (!selectedSerials || !Array.isArray(selectedSerials) || selectedSerials.length !== Number(quantity)) {
            // Get available serials to show in error response
            const availableSerials = await ProductSerial.findAll({
              where: {
                productId: product.id,
                warehouseId: warehouseId || null,
                branchId: branchId || null,
                orderItemId: null
              },
              attributes: ['id', 'serialCode', 'note'],
              transaction
            });

            await transaction.rollback();
            return res.status(400).json({ 
              message: `Since barcodes were printed, you must select exactly ${quantity} serial(s) to remove`,
              requiresSerialSelection: true,
              availableSerials: availableSerials.map(s => ({
                id: s.id,
                serialCode: s.serialCode,
                humanCode: s.note.split('(')[1]?.replace(')', '')
              }))
            });
          }

          // Verify and delete only selected serials
          const serials = await ProductSerial.findAll({
            where: {
              id: selectedSerials,
              productId: product.id,
              warehouseId: warehouseId || null,
              branchId: branchId || null,
              orderItemId: null
            },
            transaction,
            lock: transaction.LOCK.UPDATE
          });

          if (serials.length !== selectedSerials.length) {
            await transaction.rollback();
            return res.status(400).json({ 
              message: 'One or more selected serials are invalid or already assigned' 
            });
          }

          // Delete selected serials
          for (const serial of serials) {
            deletedSerials.push({ 
              id: serial.id, 
              serialCode: serial.serialCode, 
              warehouseId: inventory.warehouseId, 
              branchId: inventory.branchId 
            });
            await serial.destroy({ transaction });
          }

          // Update inventory
          const newQuantity = inventory.quantity - Number(quantity);
          if (newQuantity > 0) {
            await inventory.update({ quantity: newQuantity }, { transaction });
            updatedInventory.push({ 
              id: inventory.id, 
              warehouseId: inventory.warehouseId, 
              branchId: inventory.branchId, 
              quantity: newQuantity 
            });
          } else {
            await inventory.destroy({ transaction });
          }

        } else {
          // Not printed: Random deletion (existing logic)
          const serialScope = { productId: product.id, orderItemId: null };
          
          // Fix: Use either warehouse OR branch, not both
          if (warehouseId && branchId) {
            // If both are provided, use OR condition to find serials in either location
            serialScope[Op.or] = [
              { warehouseId: warehouseId },
              { branchId: branchId }
            ];
          } else if (warehouseId) {
            serialScope.warehouseId = warehouseId;
          } else if (branchId) {
            serialScope.branchId = branchId;
          }

          const availableSerialsCount = await ProductSerial.count({ where: serialScope, transaction, lock: transaction.LOCK.UPDATE });
          if (availableSerialsCount < Number(quantity)) {
            await transaction.rollback();
            return res.status(400).json({ message: `Cannot decrease by ${quantity}. Only ${availableSerialsCount} unassigned unit(s) available to remove` });
          }

          let remainingToDelete = Number(quantity);

          for (const invRecord of inventoryRecords) {
            if (remainingToDelete <= 0) break;

            const serialsAtLocation = await ProductSerial.findAll({
              where: {
                productId: product.id,
                warehouseId: invRecord.warehouseId,
                branchId: invRecord.branchId,
                orderItemId: null
              },
              limit: remainingToDelete,
              transaction,
              lock: transaction.LOCK.UPDATE
            });

            const deleteFromThisLocation = Math.min(remainingToDelete, serialsAtLocation.length, invRecord.quantity);

            for (let i = 0; i < deleteFromThisLocation; i++) {
              const serial = serialsAtLocation[i];
              deletedSerials.push({ id: serial.id, serialCode: serial.serialCode, warehouseId: invRecord.warehouseId, branchId: invRecord.branchId });
              await serial.destroy({ transaction });
            }

            const newQuantity = invRecord.quantity - deleteFromThisLocation;
            if (newQuantity > 0) {
              await invRecord.update({ quantity: newQuantity }, { transaction });
              updatedInventory.push({ id: invRecord.id, warehouseId: invRecord.warehouseId, branchId: invRecord.branchId, quantity: newQuantity });
            } else {
              await invRecord.destroy({ transaction });
            }

            remainingToDelete -= deleteFromThisLocation;
          }

          if (remainingToDelete > 0) {
            await transaction.rollback();
            return res.status(400).json({ message: `Not enough available units to remove. Remaining shortfall: ${remainingToDelete}` });
          }
        }
      }
    }

    // Reload product and inventory for response
    const updatedProduct = await Product.findByPk(id, {
      include: [
        {
          model: require('../models').Category,
          as: 'Category',
          attributes: ['id', 'name']
        },
        {
          model: require('../models').SubCategory,
          as: 'SubCategory',
          attributes: ['id', 'name']
        }
      ],
      transaction
    });

    const inventoryForProduct = await Inventory.findAll({
      where: { productId: updatedProduct.id },
      include: [
        {
          model: require('../models').Warehouse,
          as: 'Warehouse',
          attributes: ['id', 'name', 'type']
        },
        {
          model: require('../models').Branch,
          as: 'Branch',
          attributes: ['id', 'name']
        }
      ],
      transaction
    });

    const totalQuantity = inventoryForProduct.reduce((sum, inv) => sum + inv.quantity, 0);

    await transaction.commit();

    return res.json({
      product: {
        id: updatedProduct.id,
        name: updatedProduct.name,
        sku: updatedProduct.sku,
        barcode: updatedProduct.barcode,
        price: updatedProduct.price,
        cost: updatedProduct.cost,
        currency: updatedProduct.currency,
        category: updatedProduct.Category ? {
          id: updatedProduct.Category.id,
          name: updatedProduct.Category.name
        } : null,
        subCategory: updatedProduct.SubCategory ? {
          id: updatedProduct.SubCategory.id,
          name: updatedProduct.SubCategory.name
        } : null,
        size: updatedProduct.size,
        shoeSize: updatedProduct.shoeSize,
        color: updatedProduct.color,
        gender: updatedProduct.gender,
        isPrinted: updatedProduct.isPrinted,
        totalQuantity,
        inventory: inventoryForProduct.map(inv => ({
          id: inv.id,
          warehouse: inv.Warehouse ? {
            id: inv.Warehouse.id,
            name: inv.Warehouse.name,
            type: inv.Warehouse.type
          } : null,
          branch: inv.Branch ? {
            id: inv.Branch.id,
            name: inv.Branch.name
          } : null,
          quantity: inv.quantity
        })),
        createdAt: updatedProduct.createdAt,
        updatedAt: updatedProduct.updatedAt
      },
      createdSerials,
      deletedSerials,
      updatedInventory,
      message: hasQuantityOperation ? 'Product and quantity updated successfully' : 'Product updated successfully'
    });

  } catch (error) {
    try { await transaction.rollback(); } catch (e) {}
    console.error('Error updating product:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// Delete product or reduce quantity (admin, stock_keeper)
router.delete('/:id', auth, allowRoles(ROLES.ADMIN, ROLES.STOCK_KEEPER), async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity, warehouseId, branchId, deleteAll = false } = req.body || {};

    // Find the product
    const product = await Product.findByPk(id);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Get current inventory for this product
    const inventoryConditions = { productId: product.id };
    if (warehouseId) inventoryConditions.warehouseId = warehouseId;
    if (branchId) inventoryConditions.branchId = branchId;

    const inventoryRecords = await Inventory.findAll({
      where: inventoryConditions,
      include: [
        {
          model: require('../models').Warehouse,
          as: 'Warehouse',
          attributes: ['id', 'name', 'type']
        },
        {
          model: require('../models').Branch,
          as: 'Branch',
          attributes: ['id', 'name']
        }
      ]
    });

    if (inventoryRecords.length === 0) {
      return res.status(404).json({ message: 'No inventory found for this product' });
    }

    const totalAvailableQuantity = inventoryRecords.reduce((sum, inv) => sum + inv.quantity, 0);

    if (deleteAll) {
      // Delete all inventory records for this product
      await Inventory.destroy({
        where: { productId: product.id }
      });

      // Delete all product serials
      await ProductSerial.destroy({
        where: { productId: product.id }
      });

      // Delete the product itself
      await Product.destroy({
        where: { id: product.id }
      });

      return res.json({
        message: 'Product and all inventory deleted successfully',
        deletedProduct: {
          id: product.id,
          name: product.name,
          sku: product.sku,
          totalQuantityDeleted: totalAvailableQuantity
        }
      });
    } else {
      // Partial deletion - reduce quantity
      if (!quantity || quantity <= 0) {
        return res.status(400).json({ 
          message: 'quantity is required and must be greater than 0 for partial deletion' 
        });
      }

      if (quantity > totalAvailableQuantity) {
        return res.status(400).json({ 
          message: `Cannot delete ${quantity} units. Only ${totalAvailableQuantity} units available` 
        });
      }

      let remainingToDelete = quantity;
      const deletedSerials = [];
      const updatedInventory = [];

      // Process inventory records to reduce quantities
      for (const invRecord of inventoryRecords) {
        if (remainingToDelete <= 0) break;

        const deleteFromThisLocation = Math.min(remainingToDelete, invRecord.quantity);
        
        // Get serials from this location to delete
        const serialsToDelete = await ProductSerial.findAll({
          where: {
            productId: product.id,
            warehouseId: invRecord.warehouseId,
            branchId: invRecord.branchId,
            orderItemId: null // Only delete unassigned serials
          },
          limit: deleteFromThisLocation
        });

        // Delete the serials
        for (const serial of serialsToDelete) {
          deletedSerials.push({
            id: serial.id,
            serialCode: serial.serialCode,
            humanCode: serial.note.split('(')[1]?.replace(')', ''),
            location: invRecord.Warehouse ? invRecord.Warehouse.name : invRecord.Branch.name
          });
          await serial.destroy();
        }

        // Update inventory quantity
        const newQuantity = invRecord.quantity - deleteFromThisLocation;
        if (newQuantity > 0) {
          await invRecord.update({ quantity: newQuantity });
          updatedInventory.push({
            id: invRecord.id,
            location: invRecord.Warehouse ? invRecord.Warehouse.name : invRecord.Branch.name,
            remainingQuantity: newQuantity
          });
        } else {
          await invRecord.destroy();
        }

        remainingToDelete -= deleteFromThisLocation;
      }

      return res.json({
        message: `Successfully deleted ${quantity} units from inventory`,
        deletedQuantity: quantity,
        deletedSerials: deletedSerials,
        updatedInventory: updatedInventory,
        remainingTotalQuantity: totalAvailableQuantity - quantity
      });
    }

  } catch (error) {
    console.error('Error deleting product:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// Search product by serial number (for barcode scanning)
router.get('/search-by-serial/:serialCode', auth, allowRoles(ROLES.CASHIER, ROLES.BRANCH_MANAGER), async (req, res) => {
  try {
    const { serialCode } = req.params;
    
    // Ensure user has a branch assigned
    if (!req.user.branchId) {
      return res.status(403).json({ 
        message: 'User is not assigned to any branch' 
      });
    }

    console.log('Backend: Searching product by serial:', serialCode, 'in branch:', req.user.branchId);

    // Find the serial number
    const serial = await ProductSerial.findOne({
      where: { 
        serialCode: serialCode,
        branchId: req.user.branchId // Only search in cashier's branch
      },
      include: [{
        model: Product,
        include: [
          {
            model: Category,
            as: 'Category',
            attributes: ['id', 'name']
          },
          {
            model: SubCategory,
            as: 'SubCategory',
            attributes: ['id', 'name']
          }
        ]
      }]
    });

    if (!serial) {
      return res.status(404).json({ message: 'Serial number not found in this branch' });
    }

    // Check if serial is already sold
    if (serial.orderItemId) {
      return res.status(400).json({ 
        message: 'This item has already been sold',
        serial: serial.serialCode
      });
    }

    // Get total quantity for this product in this branch
    const totalQuantity = await ProductSerial.count({
      where: {
        productId: serial.productId,
        branchId: req.user.branchId,
        orderItemId: null // Only count available serials
      }
    });

    // Return product with serial information
    const productData = {
      ...serial.product.toJSON(),
      totalQuantity: totalQuantity
    };

    res.json({
      product: productData,
      serial: {
        id: serial.id,
        serialCode: serial.serialCode,
        batchId: serial.batchId,
        branchId: serial.branchId
      }
    });

  } catch (error) {
    console.error('Error searching by serial:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// Get product quantity in specific location (warehouse or branch)
router.get('/:id/quantity/:locationType/:locationId', auth, allowRoles(ROLES.ADMIN, ROLES.STOCK_KEEPER, ROLES.BRANCH_MANAGER, ROLES.CASHIER), async (req, res) => {
  try {
    const { id, locationType, locationId } = req.params;

    // Validate locationType
    if (!['warehouse', 'branch'].includes(locationType)) {
      return res.status(400).json({ message: 'locationType must be "warehouse" or "branch"' });
    }

    // Validate product exists
    const product = await Product.findByPk(id);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Build where clause based on location type
    const whereClause = {
      productId: id,
      [locationType === 'warehouse' ? 'warehouseId' : 'branchId']: locationId,
      [locationType === 'warehouse' ? 'branchId' : 'warehouseId']: null
    };

    // Find inventory record
    const inventoryRecord = await Inventory.findOne({
      where: whereClause,
      include: [
        {
          model: require('../models').Warehouse,
          as: 'Warehouse',
          attributes: ['id', 'name', 'type']
        },
        {
          model: require('../models').Branch,
          as: 'Branch',
          attributes: ['id', 'name']
        }
      ]
    });

    const availableQuantity = inventoryRecord ? inventoryRecord.quantity : 0;

    return res.json({
      productId: id,
      locationType,
      locationId,
      availableQuantity,
      inventory: inventoryRecord ? {
        id: inventoryRecord.id,
        quantity: inventoryRecord.quantity,
        warehouse: inventoryRecord.Warehouse ? {
          id: inventoryRecord.Warehouse.id,
          name: inventoryRecord.Warehouse.name,
          type: inventoryRecord.Warehouse.type
        } : null,
        branch: inventoryRecord.Branch ? {
          id: inventoryRecord.Branch.id,
          name: inventoryRecord.Branch.name
        } : null
      } : null
    });

  } catch (error) {
    console.error('Error fetching product quantity:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
