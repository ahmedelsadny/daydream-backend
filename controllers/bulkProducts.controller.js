const express = require('express');
const { Product, Category, Inventory, Branch, Warehouse, sequelize, Sequelize } = require('../models');
const auth = require('../middleware/auth');
const { allowRoles, ROLES } = require('../middleware/roles');
const { logAuditEvent } = require('../utils/auditLogger');
const { Op } = Sequelize;

const router = express.Router();

// Helper to escape CSV cell value
function escapeCsv(val) {
  if (val === null || val === undefined) return '';
  const str = String(val).replace(/"/g, '""');
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str}"`;
  }
  return str;
}

// Download Excel/CSV bulk import template
router.get('/template', (req, res) => {
  const headers = [
    'name',
    'barcode',
    'sku',
    'price',
    'cost',
    'categoryName',
    'unit',
    'isWeighted',
    'scaleCode',
    'minAlertLimit',
    'initialQuantity'
  ];

  const sampleRows = [
    [
      'جبنة فيتا دومتي 500 جم',
      '6223000123456',
      'DOM-FETA-500',
      '38.50',
      '31.00',
      'أجبان وألبان',
      'piece',
      '0',
      '',
      '10',
      '50'
    ],
    [
      'زيت عباد الشمس عافية 1.6 لتر',
      '6223000987654',
      'AFIA-OIL-1.6',
      '115.00',
      '98.00',
      'زيوت وسمن',
      'piece',
      '0',
      '',
      '5',
      '24'
    ],
    [
      'تفاح لبناني أحمر بالكيلو',
      '',
      'APL-RED-LB',
      '75.00',
      '55.00',
      'خضار وفاكهة',
      'kg',
      '1',
      '101',
      '15',
      '30.500'
    ]
  ];

  let csvContent = '\uFEFF'; // UTF-8 BOM for Arabic support in Excel
  csvContent += headers.map(escapeCsv).join(',') + '\r\n';
  sampleRows.forEach(row => {
    csvContent += row.map(escapeCsv).join(',') + '\r\n';
  });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="supermarket_products_template.csv"');
  return res.send(csvContent);
});

// Export all products catalog to CSV
router.get('/export', auth, allowRoles(ROLES.ADMIN, ROLES.BRANCH_MANAGER, ROLES.STOCK_KEEPER), async (req, res) => {
  try {
    const products = await Product.findAll({
      include: [
        { model: Category, as: 'Category', attributes: ['name'] },
        { model: Inventory, attributes: ['quantity', 'branchId', 'warehouseId'] }
      ],
      order: [['name', 'ASC']]
    });

    const headers = [
      'اسم الصنف',
      'الباركود',
      'كود الصنف (SKU)',
      'سعر البيع',
      'سعر التكلفة',
      'القسم / التصنيف',
      'الوحدة',
      'وزن ميزان (1/0)',
      'كود الميزان (PLU)',
      'حد الطلب الأدنى',
      'إجمالي الرصيد بالمخزن'
    ];

    let csvContent = '\uFEFF';
    csvContent += headers.map(escapeCsv).join(',') + '\r\n';

    products.forEach(p => {
      const totalStock = (p.Inventories || []).reduce((sum, inv) => sum + parseFloat(inv.quantity || 0), 0);
      const row = [
        p.name,
        p.barcode || '',
        p.sku,
        parseFloat(p.price).toFixed(2),
        p.cost ? parseFloat(p.cost).toFixed(2) : '',
        p.Category ? p.Category.name : '',
        p.unit || 'piece',
        p.isWeighted ? '1' : '0',
        p.scaleCode || '',
        p.minAlertLimit ? parseFloat(p.minAlertLimit).toFixed(3) : '',
        parseFloat(totalStock.toFixed(3))
      ];
      csvContent += row.map(escapeCsv).join(',') + '\r\n';
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="supermarket_products_catalog.csv"');
    return res.send(csvContent);
  } catch (error) {
    console.error('Error exporting products catalog:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Bulk import products from CSV text or JSON array
router.post('/import', auth, allowRoles(ROLES.ADMIN, ROLES.STOCK_KEEPER), async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { csvData, items: jsonItems, branchId, warehouseId } = req.body;

    let itemsToProcess = [];

    if (jsonItems && Array.isArray(jsonItems)) {
      itemsToProcess = jsonItems;
    } else if (csvData && typeof csvData === 'string') {
      // Parse CSV text
      const cleanCsv = csvData.replace(/^\uFEFF/, '');
      const lines = cleanCsv.split(/\r?\n/).filter(line => line.trim().length > 0);
      if (lines.length <= 1) {
        await transaction.rollback();
        return res.status(400).json({ message: 'CSV file contains no product rows' });
      }

      // Simple CSV line splitter that respects quoted strings
      const parseCsvLine = (line) => {
        const result = [];
        let cur = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
              cur += '"';
              i++;
            } else {
              inQuotes = !inQuotes;
            }
          } else if (char === ',' && !inQuotes) {
            result.push(cur.trim());
            cur = '';
          } else {
            cur += char;
          }
        }
        result.push(cur.trim());
        return result;
      };

      const rawHeaders = parseCsvLine(lines[0]);
      const headerIndex = {};
      rawHeaders.forEach((h, idx) => {
        headerIndex[h.toLowerCase().trim()] = idx;
      });

      for (let i = 1; i < lines.length; i++) {
        const cols = parseCsvLine(lines[i]);
        if (cols.length === 0 || cols.every(c => c === '')) continue;

        const getVal = (name) => {
          const idx = headerIndex[name.toLowerCase()];
          return idx !== undefined && cols[idx] !== undefined ? cols[idx] : null;
        };

        itemsToProcess.push({
          name: getVal('name') || getVal('اسم الصنف'),
          barcode: getVal('barcode') || getVal('الباركود'),
          sku: getVal('sku') || getVal('كود الصنف (sku)'),
          price: getVal('price') || getVal('سعر البيع'),
          cost: getVal('cost') || getVal('سعر التكلفة'),
          categoryName: getVal('categoryname') || getVal('القسم / التصنيف'),
          unit: getVal('unit') || getVal('الوحدة') || 'piece',
          isWeighted: getVal('isweighted') === '1' || getVal('وزن ميزان (1/0)') === '1',
          scaleCode: getVal('scalecode') || getVal('كود الميزان (plu)'),
          minAlertLimit: getVal('minalertlimit') || getVal('حد الطلب الأدنى'),
          initialQuantity: getVal('initialquantity') || getVal('إجمالي الرصيد بالمخزن')
        });
      }
    } else {
      await transaction.rollback();
      return res.status(400).json({ message: 'Either csvData or items array is required' });
    }

    if (itemsToProcess.length === 0) {
      await transaction.rollback();
      return res.status(400).json({ message: 'No valid items found to import' });
    }

    // Default category cache
    const categoryCache = {};
    const defaultCategories = await Category.findAll({ transaction });
    defaultCategories.forEach(c => { categoryCache[c.name.trim().toLowerCase()] = c.id; });

    let defaultCatId = defaultCategories.length > 0 ? defaultCategories[0].id : null;
    if (!defaultCatId) {
      const createdDefaultCat = await Category.create({ name: 'عام / سلع استهلاكية' }, { transaction });
      defaultCatId = createdDefaultCat.id;
      categoryCache['عام / سلع استهلاكية'] = defaultCatId;
    }

    let createdCount = 0;
    let updatedCount = 0;
    const errors = [];

    const targetBranchId = branchId || (req.user.branchId ? req.user.branchId : null);
    const targetWarehouseId = warehouseId || (req.user.warehouseId ? req.user.warehouseId : null);

    for (let index = 0; index < itemsToProcess.length; index++) {
      const raw = itemsToProcess[index];
      const rowNum = index + 1;

      try {
        const name = raw.name ? String(raw.name).trim() : null;
        if (!name) {
          errors.push({ row: rowNum, error: 'Product name is missing' });
          continue;
        }

        const price = parseFloat(raw.price);
        if (isNaN(price) || price < 0) {
          errors.push({ row: rowNum, name, error: 'Invalid price value' });
          continue;
        }

        const cost = raw.cost !== undefined && raw.cost !== null && raw.cost !== '' ? parseFloat(raw.cost) : null;
        const barcode = raw.barcode && String(raw.barcode).trim() ? String(raw.barcode).trim() : null;
        const sku = raw.sku && String(raw.sku).trim() ? String(raw.sku).trim() : `PRD-${Date.now().toString().slice(-6)}-${rowNum}`;

        // Find or create category
        let categoryId = defaultCatId;
        if (raw.categoryName && String(raw.categoryName).trim()) {
          const catKey = String(raw.categoryName).trim().toLowerCase();
          if (categoryCache[catKey]) {
            categoryId = categoryCache[catKey];
          } else {
            const newCat = await Category.create({ name: String(raw.categoryName).trim() }, { transaction });
            categoryId = newCat.id;
            categoryCache[catKey] = categoryId;
          }
        }

        // Look for existing product by barcode or sku
        let existing = null;
        if (barcode) {
          existing = await Product.findOne({ where: { barcode }, transaction });
        }
        if (!existing && sku) {
          existing = await Product.findOne({ where: { sku }, transaction });
        }

        let product = null;
        if (existing) {
          await existing.update({
            name,
            price,
            cost: cost !== null ? cost : existing.cost,
            categoryId,
            unit: raw.unit || existing.unit || 'piece',
            isWeighted: raw.isWeighted !== undefined ? !!raw.isWeighted : existing.isWeighted,
            scaleCode: raw.scaleCode ? String(raw.scaleCode).trim() : existing.scaleCode,
            minAlertLimit: raw.minAlertLimit ? parseFloat(raw.minAlertLimit) : existing.minAlertLimit
          }, { transaction });
          product = existing;
          updatedCount++;
        } else {
          product = await Product.create({
            name,
            sku,
            barcode,
            price,
            cost,
            categoryId,
            unit: raw.unit || 'piece',
            isWeighted: !!raw.isWeighted,
            scaleCode: raw.scaleCode ? String(raw.scaleCode).trim() : null,
            minAlertLimit: raw.minAlertLimit ? parseFloat(raw.minAlertLimit) : null,
            isFavorite: false
          }, { transaction });
          createdCount++;
        }

        // Initialize / update inventory if specified
        if (raw.initialQuantity !== undefined && raw.initialQuantity !== null && raw.initialQuantity !== '') {
          const initQty = parseFloat(raw.initialQuantity);
          if (!isNaN(initQty)) {
            const invWhere = { productId: product.id };
            if (targetBranchId) invWhere.branchId = targetBranchId;
            if (targetWarehouseId) invWhere.warehouseId = targetWarehouseId;

            let inv = await Inventory.findOne({ where: invWhere, transaction });
            if (inv) {
              await inv.update({ quantity: initQty }, { transaction });
            } else {
              await Inventory.create({
                productId: product.id,
                branchId: targetBranchId,
                warehouseId: targetWarehouseId,
                quantity: initQty
              }, { transaction });
            }
          }
        }
      } catch (rowErr) {
        errors.push({ row: rowNum, name: raw.name, error: rowErr.message });
      }
    }

    await logAuditEvent({
      req,
      action: 'PRODUCTS_BULK_IMPORT',
      entityType: 'Product',
      entityId: `BATCH-${Date.now()}`,
      transaction,
      newValues: {
        totalRows: itemsToProcess.length,
        createdCount,
        updatedCount,
        errorsCount: errors.length
      }
    });

    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: `Bulk import completed: ${createdCount} created, ${updatedCount} updated`,
      summary: {
        totalProcessed: itemsToProcess.length,
        createdCount,
        updatedCount,
        failedCount: errors.length
      },
      errors: errors.slice(0, 50)
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error during bulk import:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

module.exports = router;
