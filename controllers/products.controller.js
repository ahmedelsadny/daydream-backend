const express = require('express');
const { Product, Category, SubCategory, Inventory, ProductSerial, Warehouse, Branch, Order, OrderItem, Transfer, ProductUnit, sequelize, Sequelize } = require('../models');
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

// Helper function to extract human readable code from serial note safely
function extractHumanCode(note) {
  if (!note || typeof note !== 'string') return null;
  const match = note.split('(')[1];
  return match ? match.replace(')', '').trim() : null;
}

// Safe UUID generator with crypto fallback
function generateBatchId() {
  try {
    const { v4: uuidv4 } = require('uuid');
    return uuidv4();
  } catch (err) {
    const crypto = require('crypto');
    return crypto.randomUUID ? crypto.randomUUID() : ('batch-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9));
  }
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
    barcode,
    unit,
    isWeighted,
    scaleCode,
    minAlertLimit,
    isFavorite,
    generateSerials,
    // Handle both old single-location format and new multi-location format
    warehouseId, 
    quantity,
    initialInventory // Array of { warehouseId?, branchId?, quantity }
  } = req.body || {};

  // Standardize inventory format
  let inventoryList = initialInventory;
  if (!inventoryList || !Array.isArray(inventoryList)) {
    inventoryList = [{
      warehouseId: warehouseId || null,
      branchId: null,
      quantity: quantity || 0
    }];
  }

  // Calculate total quantity across all entries
  const totalQuantity = inventoryList.reduce((sum, item) => sum + (parseFloat(item.quantity) || 0), 0);

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
  const finalGender = gender && ['Men', 'Women', 'Unisex', 'Kids'].includes(gender) ? gender : 'Unisex';
  if (totalQuantity <= 0) {
    return res.status(400).json({ message: 'total quantity must be greater than 0 across all locations' });
  }
  if (!currency || !currency.trim()) {
    return res.status(400).json({ message: 'currency is required' });
  }

  const transaction = await sequelize.transaction();
  try {
    // Verify category and subcategory exist
    const category = await Category.findByPk(categoryId, { transaction });
    const subCategory = await SubCategory.findByPk(subCategoryId, { transaction });
    
    if (!category || !subCategory) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Category or SubCategory not found' });
    }

    // Generate SKU
    const categoryAbbr = getCategoryAbbr(category.name);
    const subCategoryAbbr = getSubCategoryAbbr(subCategory.name);
    const colorAbbr = color ? getColorAbbr(color) : 'NOC';
    let skuPattern = (size || shoeSize) 
      ? `${categoryAbbr}-${subCategoryAbbr}-${size || shoeSize}-${colorAbbr}`
      : `${categoryAbbr}-${subCategoryAbbr}-${colorAbbr}`;
    
    // Find the highest existing sequence number for this pattern in a dialect-agnostic way
    const existingSkuProducts = await Product.findAll({
      attributes: ['sku'],
      where: { sku: { [Op.like]: `${skuPattern}-%` } },
      raw: true,
      transaction
    });
    let maxSkuSeq = 0;
    for (const p of existingSkuProducts) {
      const parts = p.sku ? p.sku.split('-') : [];
      const num = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(num) && num > maxSkuSeq) maxSkuSeq = num;
    }
    const nextSeq = String(maxSkuSeq + 1).padStart(3, '0');
    let sku = `${skuPattern}-${nextSeq}`;
    
    // Handle barcode (use external factory barcode if provided, else generate dialect-agnostic EAN-13)
    let productBarcode = null;
    if (barcode && String(barcode).trim()) {
      productBarcode = String(barcode).trim();
      const existingProduct = await Product.findOne({ where: { barcode: productBarcode }, transaction });
      if (existingProduct) {
        await transaction.rollback();
        return res.status(400).json({ message: `Barcode ${productBarcode} is already in use by product: ${existingProduct.name}` });
      }
    } else {
      const isSqlite = sequelize.getDialect() === 'sqlite';
      const barcodeAttr = isSqlite
        ? sequelize.literal('MAX(CAST(SUBSTR(barcode, 2, 11) AS INTEGER))')
        : sequelize.literal('MAX(CAST(SUBSTR(barcode, 2, 11) AS UNSIGNED))');

      const barcodeQueryOptions = {
        attributes: [[barcodeAttr, 'maxSeq']],
        raw: true,
        transaction
      };
      if (!isSqlite) {
        barcodeQueryOptions.lock = transaction.LOCK.UPDATE;
      }

      const [maxProductRow] = await Product.findAll(barcodeQueryOptions);
      const nextProductSeq = (maxProductRow?.maxSeq || 0) + 1;
      const productBarcodeBase = `1${String(nextProductSeq).padStart(11, '0')}`;
      productBarcode = productBarcodeBase + generateEAN13CheckDigit(productBarcodeBase);
    }

    // Create product with supermarket attributes
    const product = await Product.create({
      name,
      sku,
      barcode: productBarcode,
      price,
      cost,
      categoryId,
      subCategoryId,
      size: size || null,
      shoeSize: shoeSize || null,
      color: color || null,
      gender: finalGender,
      currency: currency || 'EGP',
      unit: unit || 'piece',
      isWeighted: isWeighted === true || isWeighted === 'true',
      scaleCode: scaleCode || null,
      minAlertLimit: minAlertLimit || null,
      isFavorite: isFavorite === true || isFavorite === 'true'
    }, { transaction });

    // Generate batch ID for all serials created in this request
    const batchId = generateBatchId();
    
    // Get initial serial sequence
    const serialAttr = isSqlite
      ? sequelize.literal('MAX(CAST(SUBSTR(serial_code, 2, 11) AS INTEGER))')
      : sequelize.literal('MAX(CAST(SUBSTR(serial_code, 2, 11) AS UNSIGNED))');

    const serialQueryOptions = {
      attributes: [[serialAttr, 'maxSeq']],
      raw: true,
      transaction
    };
    if (!isSqlite) {
      serialQueryOptions.lock = transaction.LOCK.UPDATE;
    }

    const [maxSerialRow] = await ProductSerial.findAll(serialQueryOptions);
    let currentSerialSeq = (maxSerialRow?.maxSeq || 0) + 1;

    const createdInventory = [];
    const createdSerials = [];

    // Process each inventory entry
    for (const item of inventoryList) {
      const { warehouseId, branchId, quantity: itemQty } = item;
      const qty = parseInt(itemQty);
      if (qty <= 0) continue;

      // Validate location
      if (warehouseId) {
        const wh = await Warehouse.findByPk(warehouseId, { transaction });
        if (!wh) { await transaction.rollback(); return res.status(404).json({ message: `Warehouse ${warehouseId} not found` }); }
      } else if (branchId) {
        const br = await require('../models').Branch.findByPk(branchId, { transaction });
        if (!br) { await transaction.rollback(); return res.status(404).json({ message: `Branch ${branchId} not found` }); }
      } else {
        await transaction.rollback();
        return res.status(400).json({ message: 'Each inventory entry must have a warehouseId or branchId' });
      }

      // Create inventory record
      const inventory = await Inventory.create({
        productId: product.id,
        warehouseId: warehouseId || null,
        branchId: branchId || null,
        quantity: qty
      }, { transaction });
      createdInventory.push(inventory);

      // Create serials for this location only if requested or traditional fashion product
      const shouldCreateSerials = generateSerials === true || (!isWeighted && isWeighted !== 'true' && generateSerials !== false && unit !== 'kg' && unit !== 'g');
      if (shouldCreateSerials) {
        for (let i = 0; i < qty; i++) {
          const serialBarcodeBase = `2${String(currentSerialSeq).padStart(11, '0')}`;
          const serialBarcode = serialBarcodeBase + generateEAN13CheckDigit(serialBarcodeBase);
          const humanSerialCode = `${sku}-${String(i + 1).padStart(4, '0')}`;
          
          const serial = await ProductSerial.create({
            productId: product.id,
            serialCode: serialBarcode,
            note: `initial_stock - ${warehouseId ? 'warehouse' : 'branch'} ${warehouseId || branchId} (${humanSerialCode})`,
            warehouseId: warehouseId || null,
            branchId: branchId || null,
            batchId: batchId
          }, { transaction });
          
          createdSerials.push(serial);
          currentSerialSeq++;
        }
      }
    }

    await transaction.commit();

    return res.status(201).json({
      product,
      inventory: createdInventory,
      serialsCount: createdSerials.length,
      message: `Product created successfully with stock in ${createdInventory.length} locations.`
    });

  } catch (error) {
    if (transaction) await transaction.rollback();
    console.error('Error creating product:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
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
    const { page = 1, limit = 50, categoryId, subCategoryId, gender, color } = req.query; 
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
    const offset = (pageNum - 1) * limitNum;

    // Build where clause for filtering
    const whereClause = {};
    if (categoryId) whereClause.categoryId = categoryId;
    if (subCategoryId) whereClause.subCategoryId = subCategoryId;
    if (gender) whereClause.gender = gender;
    if (color) whereClause.color = color;

    // Get products with pagination
    const { count, rows: products } = await Product.findAndCountAll({
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
      limit: limitNum,
      offset: offset,
      order: [['createdAt', 'DESC']]
    });

    // Batch fetch inventory information for all products in page (eliminates N+1 queries)
    const productIds = products.map(p => p.id);
    const inventoryByProduct = {};

    if (productIds.length > 0) {
      const allInventories = await Inventory.findAll({
        where: { productId: productIds },
        include: [
          {
            model: Warehouse,
            as: 'Warehouse',
            attributes: ['id', 'name', 'type']
          },
          {
            model: Branch,
            as: 'Branch',
            attributes: ['id', 'name']
          }
        ]
      });

      for (const inv of allInventories) {
        if (!inventoryByProduct[inv.productId]) {
          inventoryByProduct[inv.productId] = [];
        }
        inventoryByProduct[inv.productId].push(inv);
      }
    }

    // Assemble products with grouped inventory
    const productsWithInventory = products.map((product) => {
      const inventory = inventoryByProduct[product.id] || [];
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
    });

    return res.json({
      products: productsWithInventory,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(count / limitNum),
        totalItems: count,
        itemsPerPage: limitNum
      }
    });

  } catch (error) {
    console.error('Error fetching products:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// Get quick-touch favorite products for POS cashier screen (all roles)
router.get('/favorites', auth, allowRoles(ROLES.ADMIN, ROLES.STOCK_KEEPER, ROLES.BRANCH_MANAGER, ROLES.CASHIER), async (req, res) => {
  try {
    const branchFilter = req.user.branchId || (req.query.branchId || null);

    const favoriteProducts = await Product.findAll({
      where: {
        isFavorite: true
      },
      include: [
        { model: Category, as: 'Category', attributes: ['id', 'name'] },
        { model: SubCategory, as: 'SubCategory', attributes: ['id', 'name'] }
      ],
      order: [['name', 'ASC']]
    });

    const formattedFavorites = await Promise.all(favoriteProducts.map(async (prod) => {
      let availableQty = 0;
      if (branchFilter) {
        const branchInv = await Inventory.findOne({
          where: { productId: prod.id, branchId: branchFilter }
        });
        availableQty = branchInv ? parseFloat(branchInv.quantity || 0) : 0;
      }

      return {
        id: prod.id,
        name: prod.name,
        sku: prod.sku,
        barcode: prod.barcode,
        price: parseFloat(prod.price),
        cost: (req.user.role === ROLES.ADMIN || req.user.role === ROLES.STOCK_KEEPER) ? parseFloat(prod.cost || 0) : undefined,
        currency: prod.currency,
        unit: prod.unit || 'piece',
        isWeighted: prod.isWeighted || false,
        scaleCode: prod.scaleCode,
        isFavorite: true,
        category: prod.Category ? { id: prod.Category.id, name: prod.Category.name } : null,
        subCategory: prod.SubCategory ? { id: prod.SubCategory.id, name: prod.SubCategory.name } : null,
        availableQuantity: availableQty
      };
    }));

    return res.json({
      count: formattedFavorites.length,
      favorites: formattedFavorites
    });
  } catch (error) {
    console.error('Error fetching favorite products:', error);
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

    // 1. Scale Barcode check (GS1 in-store variable measure prefix 20 or 21)
    const isScaleBarcode = (code.startsWith('20') || code.startsWith('21')) && (code.length === 12 || code.length === 13);
    if (isScaleBarcode) {
      console.log('Backend: Detected scale barcode:', code);
      const rawItemCode = code.substring(2, 7); // 5-digit PLU code
      const rawWeight = code.substring(7, 12);   // 5-digit weight in grams
      const parsedScaleCode = String(parseInt(rawItemCode, 10)); // e.g. "123"
      const weightKg = parseFloat(rawWeight) / 1000; // e.g. 0.450 kg

      let product = await Product.findOne({
        where: {
          [Op.or]: [
            { scaleCode: parsedScaleCode },
            { scaleCode: rawItemCode },
            { barcode: code }
          ]
        },
        include: [
          { model: Category, as: 'Category', attributes: ['id', 'name'] },
          { model: SubCategory, as: 'SubCategory', attributes: ['id', 'name'] }
        ]
      });

      if (product) {
        const inventoryWhere = { productId: product.id };
        if (branchFilter) inventoryWhere.branchId = branchFilter;
        const inventory = await Inventory.findAll({ where: inventoryWhere });
        const totalAvailable = inventory.reduce((sum, inv) => sum + parseFloat(inv.quantity || 0), 0);
        const unitPrice = parseFloat(product.price);
        const calculatedTotal = parseFloat((unitPrice * weightKg).toFixed(2));

        return res.json({
          type: 'scale_product',
          isScaleBarcode: true,
          scaleCode: parsedScaleCode,
          weight: weightKg,
          calculatedTotal: calculatedTotal,
          product: {
            id: product.id,
            name: product.name,
            sku: product.sku,
            barcode: product.barcode,
            price: unitPrice,
            cost: (req.user.role === ROLES.ADMIN || req.user.role === ROLES.STOCK_KEEPER) ? parseFloat(product.cost) : undefined,
            currency: product.currency,
            category: product.Category ? { id: product.Category.id, name: product.Category.name } : null,
            subCategory: product.SubCategory ? { id: product.SubCategory.id, name: product.SubCategory.name } : null,
            unit: product.unit || 'kg',
            isWeighted: true,
            availableInScope: totalAvailable
          },
          scope: branchFilter ? 'branch' : 'global',
          branchId: branchFilter
        });
      }
    }

    // 2. Direct Product Barcode or SKU Search (any barcode: 622, 1..., etc.)
    console.log('Backend: Searching for product by barcode or SKU:', code);
    const product = await Product.findOne({
      where: {
        [Op.or]: [
          { barcode: code },
          { sku: code }
        ]
      },
      include: [
        { model: Category, as: 'Category', attributes: ['id', 'name'] },
        { model: SubCategory, as: 'SubCategory', attributes: ['id', 'name'] }
      ]
    });

    if (product) {
      // Get available serials in scope (if product is serial-tracked)
      const serialsWhere = {
        productId: product.id,
        orderItemId: null
      };
      if (branchFilter) serialsWhere.branchId = branchFilter;

      const availableSerials = await ProductSerial.findAll({
        where: serialsWhere,
        include: [
          { model: Warehouse, as: 'Warehouse', attributes: ['id', 'name', 'type'] },
          { model: Branch, as: 'Branch', attributes: ['id', 'name', 'location'] }
        ],
        order: [['createdAt', 'ASC']]
      });

      const inventoryWhere = { productId: product.id };
      if (branchFilter) inventoryWhere.branchId = branchFilter;
      const inventory = await Inventory.findAll({ where: inventoryWhere });
      const totalAvailable = inventory.reduce((sum, inv) => sum + parseFloat(inv.quantity || 0), 0);

      return res.json({
        type: 'product',
        product: {
          id: product.id,
          name: product.name,
          sku: product.sku,
          barcode: product.barcode,
          price: parseFloat(product.price),
          cost: (req.user.role === ROLES.ADMIN || req.user.role === ROLES.STOCK_KEEPER) ? parseFloat(product.cost) : undefined,
          currency: product.currency,
          category: product.Category ? { id: product.Category.id, name: product.Category.name } : null,
          subCategory: product.SubCategory ? { id: product.SubCategory.id, name: product.SubCategory.name } : null,
          size: product.size,
          shoeSize: product.shoeSize,
          color: product.color,
          gender: product.gender,
          unit: product.unit || 'piece',
          isWeighted: product.isWeighted || false,
          scaleCode: product.scaleCode,
          isPrinted: product.isPrinted,
          availableInScope: totalAvailable
        },
        availableSerials: availableSerials.map(serial => ({
          id: serial.id,
          serialCode: serial.serialCode,
          humanCode: extractHumanCode(serial.note),
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
    }

    // 3. Serial Barcode search (if not found by product barcode/sku, check serials)
    console.log('Backend: Searching for serial barcode:', code);
    const serialWhere = { serialCode: code };
    if (branchFilter) serialWhere.branchId = branchFilter;

    const serial = await ProductSerial.findOne({
      where: serialWhere,
      include: [
        {
          model: Product,
          as: 'Product',
          include: [
            { model: Category, as: 'Category', attributes: ['id', 'name'] },
            { model: SubCategory, as: 'SubCategory', attributes: ['id', 'name'] }
          ]
        },
        { model: require('../models').Warehouse, as: 'Warehouse', attributes: ['id', 'name', 'type'] },
        { model: require('../models').Branch, as: 'Branch', attributes: ['id', 'name', 'location'] },
        { model: OrderItem, as: 'OrderItem', include: [{ model: Order, as: 'Order' }] }
      ]
    });

    if (serial) {
      const serialProduct = serial.Product;
      const status = serial.orderItemId ? 'sold' : 'available';
      const response = {
        type: 'serial',
        serial: {
          id: serial.id,
          serialCode: serial.serialCode,
          humanCode: extractHumanCode(serial.note),
          status: status,
          isPrinted: serial.isPrinted,
          batchId: serial.batchId
        },
        product: {
          id: serialProduct.id,
          name: serialProduct.name,
          sku: serialProduct.sku,
          barcode: serialProduct.barcode,
          price: parseFloat(serialProduct.price),
          cost: (req.user.role === ROLES.ADMIN || req.user.role === ROLES.STOCK_KEEPER) ? parseFloat(serialProduct.cost) : undefined,
          currency: serialProduct.currency,
          category: serialProduct.Category ? { id: serialProduct.Category.id, name: serialProduct.Category.name } : null,
          subCategory: serialProduct.SubCategory ? { id: serialProduct.SubCategory.id, name: serialProduct.SubCategory.name } : null,
          size: serialProduct.size,
          shoeSize: serialProduct.shoeSize,
          color: serialProduct.color,
          gender: serialProduct.gender,
          unit: serialProduct.unit || 'piece',
          isWeighted: serialProduct.isWeighted || false,
          scaleCode: serialProduct.scaleCode
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
        status: status,
        scope: branchFilter ? 'branch' : 'global',
        branchId: branchFilter
      };

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
    }

    // 3.5 Check Multi-Unit Packaging Barcode (ProductUnit)
    console.log('Backend: Searching for multi-unit packaging by barcode:', code);
    const productUnit = await ProductUnit.findOne({
      where: { barcode: code, isActive: true },
      include: [
        {
          model: Product,
          as: 'product',
          include: [
            { model: Category, as: 'Category', attributes: ['id', 'name'] },
            { model: SubCategory, as: 'SubCategory', attributes: ['id', 'name'] }
          ]
        }
      ]
    });

    if (productUnit && productUnit.product) {
      const parentProduct = productUnit.product;
      const inventoryWhere = { productId: parentProduct.id };
      if (branchFilter) inventoryWhere.branchId = branchFilter;
      const inventory = await Inventory.findAll({ where: inventoryWhere });
      const totalAvailablePieces = inventory.reduce((sum, inv) => sum + parseFloat(inv.quantity || 0), 0);
      const conversionFactor = parseFloat(productUnit.conversionFactor) || 1;
      const totalAvailableUnits = conversionFactor > 0 ? parseFloat((totalAvailablePieces / conversionFactor).toFixed(2)) : 0;

      return res.json({
        type: 'packaging_unit',
        isPackagingUnit: true,
        unit: {
          id: productUnit.id,
          unitName: productUnit.unitName,
          barcode: productUnit.barcode,
          conversionFactor: conversionFactor,
          sellingPrice: parseFloat(productUnit.sellingPrice),
          costPrice: productUnit.costPrice ? parseFloat(productUnit.costPrice) : undefined
        },
        product: {
          id: parentProduct.id,
          name: parentProduct.name,
          sku: parentProduct.sku,
          barcode: parentProduct.barcode,
          price: parseFloat(parentProduct.price),
          category: parentProduct.Category ? { id: parentProduct.Category.id, name: parentProduct.Category.name } : null,
          subCategory: parentProduct.SubCategory ? { id: parentProduct.SubCategory.id, name: parentProduct.SubCategory.name } : null,
          unit: parentProduct.unit || 'piece',
          availableInScopePieces: totalAvailablePieces,
          availableInScopeUnits: totalAvailableUnits
        },
        scope: branchFilter ? 'branch' : 'global',
        branchId: branchFilter
      });
    }

    // 4. Not found
    return res.status(404).json({ 
      message: 'Product or serial not found with this code',
      providedCode: code
    });

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
          model: Branch,
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
          model: Branch,
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
          humanCode: extractHumanCode(serial.note),
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
      return res.status(404).json({ message: 'Product not found' });
    }

    // Get inventory information for this product
    const inventory = await Inventory.findAll({
      where: { productId: product.id },
      include: [
        {
          model: Warehouse,
          as: 'Warehouse',
          attributes: ['id', 'name', 'type', 'location']
        },
        {
          model: Branch,
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
          model: Warehouse,
          as: 'Warehouse',
          attributes: ['id', 'name', 'type']
        },
        {
          model: Branch,
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
          humanCode: extractHumanCode(serial.note),
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
        const newBatchId = generateBatchId();

        // Determine max serial sequence numerically (SQL) to avoid lexicographic sort issues
        const isSqliteAdd = sequelize.getDialect() === 'sqlite';
        const serialMaxAttr = isSqliteAdd
          ? sequelize.literal('MAX(CAST(SUBSTR(serial_code, 2, 11) AS INTEGER))')
          : sequelize.literal('MAX(CAST(SUBSTR(serial_code, 2, 11) AS UNSIGNED))');

        const serialQueryOpts = {
          attributes: [[serialMaxAttr, 'maxSeq']],
          raw: true,
          transaction
        };
        if (!isSqliteAdd) {
          serialQueryOpts.lock = transaction.LOCK.UPDATE;
        }

        const [maxRow] = await ProductSerial.findAll(serialQueryOpts);
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
                humanCode: extractHumanCode(s.note)
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
          const newQuantity = Math.max(0, inventory.quantity - Number(quantity));
          await inventory.update({ quantity: newQuantity }, { transaction });
          updatedInventory.push({ 
            id: inventory.id, 
            warehouseId: inventory.warehouseId, 
            branchId: inventory.branchId, 
            quantity: newQuantity 
          });

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

            const newQuantity = Math.max(0, invRecord.quantity - deleteFromThisLocation);
            await invRecord.update({ quantity: newQuantity }, { transaction });
            updatedInventory.push({ id: invRecord.id, warehouseId: invRecord.warehouseId, branchId: invRecord.branchId, quantity: newQuantity });

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
      transaction
    });

    const inventoryForProduct = await Inventory.findAll({
      where: { productId: updatedProduct.id },
      include: [
        {
          model: Warehouse,
          as: 'Warehouse',
          attributes: ['id', 'name', 'type']
        },
        {
          model: Branch,
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
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { quantity, warehouseId, branchId, deleteAll = false } = req.body || {};

    // Find the product
    const product = await Product.findByPk(id, { transaction });
    if (!product) {
      await transaction.rollback();
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
          model: Warehouse,
          as: 'Warehouse',
          attributes: ['id', 'name', 'type']
        },
        {
          model: Branch,
          as: 'Branch',
          attributes: ['id', 'name']
        }
      ],
      transaction
    });

    const totalAvailableQuantity = inventoryRecords.reduce((sum, inv) => sum + inv.quantity, 0);

    if (deleteAll) {
      // Check if product was ever ordered in sales
      const orderItemCount = await OrderItem.count({
        where: { productId: product.id },
        transaction
      });

      if (orderItemCount > 0) {
        await transaction.rollback();
        return res.status(400).json({
          message: 'Cannot delete product because it has associated sales orders. Consider archiving or setting quantity to 0 instead.'
        });
      }

      // Delete inventory records for this product
      await Inventory.destroy({
        where: { productId: product.id },
        transaction
      });

      // Delete only unassigned product serials
      await ProductSerial.destroy({
        where: { productId: product.id, orderItemId: null },
        transaction
      });

      // Delete the product itself
      await Product.destroy({
        where: { id: product.id },
        transaction
      });

      await transaction.commit();
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
      if (inventoryRecords.length === 0) {
        await transaction.rollback();
        return res.status(404).json({ message: 'No inventory found for this product' });
      }

      if (!quantity || quantity <= 0) {
        await transaction.rollback();
        return res.status(400).json({ 
          message: 'quantity is required and must be greater than 0 for partial deletion' 
        });
      }

      if (quantity > totalAvailableQuantity) {
        await transaction.rollback();
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
          limit: deleteFromThisLocation,
          transaction
        });

        // Delete the serials
        for (const serial of serialsToDelete) {
          deletedSerials.push({
            id: serial.id,
            serialCode: serial.serialCode,
            humanCode: extractHumanCode(serial.note),
            location: invRecord.Warehouse ? invRecord.Warehouse.name : (invRecord.Branch ? invRecord.Branch.name : 'Unknown')
          });
          await serial.destroy({ transaction });
        }

        // Update inventory quantity
        const newQuantity = invRecord.quantity - deleteFromThisLocation;
        if (newQuantity > 0) {
          await invRecord.update({ quantity: newQuantity }, { transaction });
          updatedInventory.push({
            id: invRecord.id,
            location: invRecord.Warehouse ? invRecord.Warehouse.name : (invRecord.Branch ? invRecord.Branch.name : 'Unknown'),
            remainingQuantity: newQuantity
          });
        } else {
          await invRecord.destroy({ transaction });
        }

        remainingToDelete -= deleteFromThisLocation;
      }

      await transaction.commit();
      return res.json({
        message: `Successfully deleted ${quantity} units from inventory`,
        deletedQuantity: quantity,
        deletedSerials: deletedSerials,
        updatedInventory: updatedInventory,
        remainingTotalQuantity: totalAvailableQuantity - quantity
      });
    }

  } catch (error) {
    if (typeof transaction !== 'undefined' && transaction && !transaction.finished) {
      try { await transaction.rollback(); } catch (rbErr) {}
    }
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
    const associatedProduct = serial.Product || serial.product;
    const productData = {
      ...(associatedProduct && typeof associatedProduct.toJSON === 'function' ? associatedProduct.toJSON() : (associatedProduct || {})),
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
          model: Warehouse,
          as: 'Warehouse',
          attributes: ['id', 'name', 'type']
        },
        {
          model: Branch,
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

// ==================== Multi-Unit Packaging Endpoints ====================

// Add packaging unit to a product (e.g. carton, pack)
router.post('/:id/units', auth, allowRoles(ROLES.ADMIN, ROLES.STOCK_KEEPER), async (req, res) => {
  try {
    const { id } = req.params;
    const { unitName, barcode, conversionFactor, sellingPrice, costPrice } = req.body;

    const product = await Product.findByPk(id);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    if (!unitName || !unitName.trim()) {
      return res.status(400).json({ message: 'unitName is required' });
    }

    if (!barcode || !barcode.trim()) {
      return res.status(400).json({ message: 'barcode is required' });
    }

    const conv = parseFloat(conversionFactor);
    if (isNaN(conv) || conv <= 0) {
      return res.status(400).json({ message: 'conversionFactor must be a positive number' });
    }

    const price = parseFloat(sellingPrice);
    if (isNaN(price) || price < 0) {
      return res.status(400).json({ message: 'sellingPrice must be a valid number' });
    }

    // Ensure barcode is not already used
    const existingUnit = await ProductUnit.findOne({ where: { barcode: barcode.trim() } });
    const existingProduct = await Product.findOne({ where: { barcode: barcode.trim() } });
    if (existingUnit || existingProduct) {
      return res.status(400).json({ message: 'This barcode is already assigned to another product or packaging unit' });
    }

    const unit = await ProductUnit.create({
      productId: product.id,
      unitName: unitName.trim(),
      barcode: barcode.trim(),
      conversionFactor: conv,
      sellingPrice: price,
      costPrice: costPrice ? parseFloat(costPrice) : null,
      isActive: true
    });

    return res.status(201).json({
      success: true,
      message: 'Packaging unit added successfully',
      unit
    });
  } catch (error) {
    console.error('Error adding packaging unit:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Get packaging units for a product
router.get('/:id/units', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const units = await ProductUnit.findAll({
      where: { productId: id },
      order: [['conversionFactor', 'ASC']]
    });

    return res.json({ success: true, units });
  } catch (error) {
    console.error('Error fetching packaging units:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Delete a packaging unit
router.delete('/units/:unitId', auth, allowRoles(ROLES.ADMIN, ROLES.STOCK_KEEPER), async (req, res) => {
  try {
    const { unitId } = req.params;
    const unit = await ProductUnit.findByPk(unitId);
    if (!unit) {
      return res.status(404).json({ message: 'Packaging unit not found' });
    }

    await unit.destroy();
    return res.json({ success: true, message: 'Packaging unit deleted successfully' });
  } catch (error) {
    console.error('Error deleting packaging unit:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

module.exports = router;
