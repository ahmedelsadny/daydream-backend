const express = require('express');
const { 
  Order, OrderItem, Product, Customer, Branch, User, 
  Shift, Category, SubCategory, Inventory, sequelize, Sequelize,
  Refund, Replacement 
} = require('../models');
const auth = require('../middleware/auth');
const { allowRoles, ROLES } = require('../middleware/roles');
const { Op } = require('sequelize');

const router = express.Router();

console.log('🔧 Analytics controller loaded - daily-report route will be available at /api/v1/analytics/daily-report');

// Test route without authentication to verify route registration
router.get('/test-daily-report-no-auth', (req, res) => {
  res.json({ success: true, message: 'Daily report route is registered!', query: req.query });
});

router.get('/test-sales', async (req, res) => {
  const dateGrouping = sequelize.fn('strftime', '%Y-%m-%d', sequelize.col('created_at'));
  const salesByPeriod = await Order.findAll({
    attributes: [
      [dateGrouping, 'period'],
      [sequelize.fn('COUNT', sequelize.col('Order.id')), 'orderCount']
    ],
    group: [dateGrouping],
    raw: true
  });
  const allOrders = await Order.findAll({ limit: 5, raw: true });
  res.json({ salesByPeriod, allOrders });
});

// All analytics endpoints are admin-only
router.use(auth, allowRoles(ROLES.ADMIN));

/**
 * GET /api/v1/analytics/sales-overview
 * Get overall sales metrics
 */
router.get('/sales-overview', async (req, res) => {
  try {
    const { startDate, endDate, branchId } = req.query;

    // Build where conditions
    const whereConditions = {
      status: 'completed'
    };

    // Add date filtering
    if (startDate || endDate) {
      whereConditions.created_at = {};
      if (startDate) {
        whereConditions.created_at[Op.gte] = new Date(startDate);
      }
      if (endDate) {
        // Set end date to end of day (23:59:59.999) to include the entire day
        const endDateObj = new Date(endDate);
        endDateObj.setHours(23, 59, 59, 999);
        whereConditions.created_at[Op.lte] = endDateObj;
      }
    }

    // Add branch filtering
    if (branchId) {
      whereConditions.branchId = branchId;
    }

    // Get sales overview data
    const salesData = await Order.findAll({
      attributes: [
        [sequelize.fn('SUM', sequelize.col('total_price')), 'totalSales'],
        [sequelize.fn('COUNT', sequelize.col('Order.id')), 'totalOrders'],
        [sequelize.fn('AVG', sequelize.col('total_price')), 'averageOrderValue'],
        [sequelize.fn('SUM', sequelize.col('cash_amount')), 'cashSales'],
        [sequelize.fn('SUM', sequelize.col('visa_amount')), 'visaSales'],
        [sequelize.fn('SUM', sequelize.col('discount_amount')), 'totalDiscounts']
      ],
      where: whereConditions,
      raw: true
    });

    // Get refunds data
    const refundsData = await Refund.findAll({
      attributes: [
        [sequelize.fn('SUM', sequelize.col('refund_amount')), 'totalRefunds']
      ],
      where: {
        status: 'approved',
        ...(startDate || endDate ? {
          [Op.and]: [
            startDate ? sequelize.where(sequelize.fn('DATE', sequelize.col('Refund.created_at')), Op.gte, startDate) : null,
            endDate ? sequelize.where(sequelize.fn('DATE', sequelize.col('Refund.created_at')), Op.lte, endDate) : null
          ].filter(Boolean)
        } : {})
      },
      raw: true
    });

    // Get replacements data
    const replacementsData = await Replacement.findAll({
      attributes: [
        [sequelize.fn('SUM', sequelize.col('returned_amount')), 'totalReplacements']
      ],
      where: {
        status: 'completed',
        ...(startDate || endDate ? {
          [Op.and]: [
            startDate ? sequelize.where(sequelize.fn('DATE', sequelize.col('Replacement.created_at')), Op.gte, startDate) : null,
            endDate ? sequelize.where(sequelize.fn('DATE', sequelize.col('Replacement.created_at')), Op.lte, endDate) : null
          ].filter(Boolean)
        } : {})
      },
      raw: true
    });

    const overview = salesData[0] || {
      totalSales: 0,
      totalOrders: 0,
      averageOrderValue: 0,
      cashSales: 0,
      visaSales: 0,
      totalDiscounts: 0
    };

    const totalRefunds = parseFloat(refundsData[0]?.totalRefunds) || 0;
    const totalReplacements = parseFloat(replacementsData[0]?.totalReplacements) || 0;
    const netProfit = parseFloat(overview.totalSales) - totalRefunds - totalReplacements;

    return res.json({
      success: true,
      data: {
        totalSales: parseFloat(overview.totalSales) || 0,
        totalOrders: parseInt(overview.totalOrders) || 0,
        averageOrderValue: parseFloat(overview.averageOrderValue) || 0,
        cashSales: parseFloat(overview.cashSales) || 0,
        visaSales: parseFloat(overview.visaSales) || 0,
        totalDiscounts: parseFloat(overview.totalDiscounts) || 0,
        totalRefunds: totalRefunds,
        totalReplacements: totalReplacements,
        netProfit: netProfit,
        period: {
          startDate: startDate || null,
          endDate: endDate || null
        },
        generatedAt: new Date()
      }
    });

  } catch (error) {
    console.error('Sales overview error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch sales overview',
      error: error.message
    });
  }
});

/**
 * GET /api/v1/analytics/sales-by-period
 * Get sales trends by time period
 */
router.get('/sales-by-period', async (req, res) => {
  try {
    const { period = 'daily', startDate, endDate, branchId } = req.query;

    // Validate period parameter
    if (!['daily', 'weekly', 'monthly'].includes(period)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid period. Must be daily, weekly, or monthly'
      });
    }

    // Set date range objects if provided
    const endDateObj = endDate ? new Date(endDate) : null;
    const startDateObj = startDate ? new Date(startDate) : null;

    // Build where conditions
    const whereConditions = {
      status: 'completed'
    };

    if (startDateObj || endDateObj) {
      whereConditions.created_at = {};
      if (startDateObj) {
        whereConditions.created_at[Op.gte] = startDateObj;
      }
      if (endDateObj) {
        endDateObj.setHours(23, 59, 59, 999);
        whereConditions.created_at[Op.lte] = endDateObj;
      }
    }

    // Add branch filtering
    if (branchId) {
      whereConditions.branchId = branchId;
    }

    // Determine date grouping function based on period and dialect
    let dateGrouping;
    const dialect = sequelize.getDialect();
    
    if (dialect === 'sqlite') {
      switch (period) {
        case 'daily':
          dateGrouping = sequelize.fn('strftime', '%Y-%m-%d', sequelize.col('created_at'));
          break;
        case 'weekly':
          dateGrouping = sequelize.fn('strftime', '%Y-%W', sequelize.col('created_at'));
          break;
        case 'monthly':
          dateGrouping = sequelize.fn('strftime', '%Y-%m', sequelize.col('created_at'));
          break;
      }
    } else {
      switch (period) {
        case 'daily':
          dateGrouping = sequelize.fn('DATE', sequelize.col('created_at'));
          break;
        case 'weekly':
          dateGrouping = sequelize.fn('YEARWEEK', sequelize.col('created_at'));
          break;
        case 'monthly':
          dateGrouping = sequelize.fn('DATE_FORMAT', sequelize.col('created_at'), '%Y-%m');
          break;
      }
    }

    // Get sales data by period
    const salesByPeriod = await Order.findAll({
      attributes: [
        [dateGrouping, 'period'],
        [sequelize.fn('SUM', sequelize.col('total_price')), 'totalSales'],
        [sequelize.fn('COUNT', sequelize.col('Order.id')), 'orderCount'],
        [sequelize.fn('AVG', sequelize.col('total_price')), 'averageOrderValue'],
        [sequelize.fn('SUM', sequelize.col('cash_amount')), 'cashSales'],
        [sequelize.fn('SUM', sequelize.col('visa_amount')), 'visaSales']
      ],
      where: whereConditions,
      group: [dateGrouping],
      order: [[dateGrouping, 'ASC']],
      raw: true
    });

    // Format the response data
    const formattedData = salesByPeriod.map(item => ({
      period: period,
      date: item.period,
      totalSales: parseFloat(item.totalSales) || 0,
      orderCount: parseInt(item.orderCount) || 0,
      averageOrderValue: parseFloat(item.averageOrderValue) || 0,
      cashSales: parseFloat(item.cashSales) || 0,
      visaSales: parseFloat(item.visaSales) || 0
    }));

    return res.json({
      success: true,
      data: formattedData,
      summary: {
        totalPeriods: formattedData.length,
        periodType: period,
        dateRange: {
          startDate: startDateObj ? startDateObj.toISOString().split('T')[0] : null,
          endDate: endDateObj ? endDateObj.toISOString().split('T')[0] : null
        },
        generatedAt: new Date()
      }
    });

  } catch (error) {
    console.error('Sales by period error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch sales by period',
      error: error.message
    });
  }
});

/**
 * GET /api/v1/analytics/sales-by-branch
 * Get branch performance comparison
 */
router.get('/sales-by-branch', async (req, res) => {
  try {
    const { startDate, endDate, sortBy = 'totalSales', sortOrder = 'desc' } = req.query;

    // Build where conditions
    const whereConditions = {
      status: 'completed'
    };

    // Add date filtering
    if (startDate || endDate) {
      whereConditions.created_at = {};
      if (startDate) {
        whereConditions.created_at[Op.gte] = new Date(startDate);
      }
      if (endDate) {
        // Set end date to end of day (23:59:59.999) to include the entire day
        const endDateObj = new Date(endDate);
        endDateObj.setHours(23, 59, 59, 999);
        whereConditions.created_at[Op.lte] = endDateObj;
      }
    }

    // Get branch performance data
    const branchPerformance = await Order.findAll({
      attributes: [
        'branchId',
        [sequelize.fn('SUM', sequelize.col('total_price')), 'totalSales'],
        [sequelize.fn('COUNT', sequelize.col('Order.id')), 'orderCount'],
        [sequelize.fn('AVG', sequelize.col('total_price')), 'averageOrderValue'],
        [sequelize.fn('SUM', sequelize.col('cash_amount')), 'cashSales'],
        [sequelize.fn('SUM', sequelize.col('visa_amount')), 'visaSales'],
        [sequelize.fn('SUM', sequelize.col('discount_amount')), 'totalDiscounts']
      ],
      include: [{
        model: Branch,
        attributes: ['id', 'name', 'location']
      }],
      where: whereConditions,
      group: ['branchId', 'Branch.id'],
      raw: true,
      nest: true
    });

    // Calculate total sales across all branches for percentage calculation
    const totalSalesAcrossBranches = branchPerformance.reduce((sum, branch) => {
      return sum + (parseFloat(branch.totalSales) || 0);
    }, 0);

    // Format the response data
    const formattedData = branchPerformance.map(branch => ({
      branchId: branch.branchId,
      branchName: branch.Branch?.name || 'Unknown Branch',
      branchLocation: branch.Branch?.location || 'Unknown Location',
      totalSales: parseFloat(branch.totalSales) || 0,
      orderCount: parseInt(branch.orderCount) || 0,
      averageOrderValue: parseFloat(branch.averageOrderValue) || 0,
      cashSales: parseFloat(branch.cashSales) || 0,
      visaSales: parseFloat(branch.visaSales) || 0,
      totalDiscounts: parseFloat(branch.totalDiscounts) || 0,
      salesPercentage: totalSalesAcrossBranches > 0 ? 
        ((parseFloat(branch.totalSales) || 0) / totalSalesAcrossBranches * 100) : 0
    }));

    // Sort the data
    const validSortFields = ['totalSales', 'orderCount', 'averageOrderValue'];
    if (validSortFields.includes(sortBy)) {
      formattedData.sort((a, b) => {
        const aValue = a[sortBy];
        const bValue = b[sortBy];
        
        if (sortOrder === 'asc') {
          return aValue - bValue;
        } else {
          return bValue - aValue;
        }
      });
    }

    // Find top performing branch
    const topPerformingBranch = formattedData.length > 0 ? formattedData[0] : null;

    return res.json({
      success: true,
      data: formattedData,
      summary: {
        totalBranches: formattedData.length,
        totalSales: totalSalesAcrossBranches,
        averageSalesPerBranch: formattedData.length > 0 ? 
          totalSalesAcrossBranches / formattedData.length : 0,
        topPerformingBranch: topPerformingBranch ? {
          branchId: topPerformingBranch.branchId,
          branchName: topPerformingBranch.branchName,
          sales: topPerformingBranch.totalSales
        } : null,
        dateRange: {
          startDate: startDate || null,
          endDate: endDate || null
        },
        generatedAt: new Date()
      }
    });

  } catch (error) {
    console.error('Sales by branch error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch sales by branch',
      error: error.message
    });
  }
});

/**
 * GET /api/v1/analytics/top-products
 * Get best selling products
 */
router.get('/top-products', async (req, res) => {
  try {
    const { 
      startDate, 
      endDate, 
      branchId, 
      limit = 10, 
      sortBy = 'quantity',
      categoryId 
    } = req.query;

    // Validate parameters
    const validSortOptions = ['quantity', 'revenue'];
    if (!validSortOptions.includes(sortBy)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid sortBy parameter. Must be quantity or revenue'
      });
    }

    const limitNum = Math.min(Math.max(parseInt(limit) || 10, 1), 100);

    // Build where conditions for orders
    const orderWhereConditions = {
      status: 'completed'
    };

    // Add date filtering
    if (startDate || endDate) {
      orderWhereConditions.created_at = {};
      if (startDate) {
        orderWhereConditions.created_at[Op.gte] = new Date(startDate);
      }
      if (endDate) {
        // Set end date to end of day (23:59:59.999) to include the entire day
        const endDateObj = new Date(endDate);
        endDateObj.setHours(23, 59, 59, 999);
        orderWhereConditions.created_at[Op.lte] = endDateObj;
      }
    }

    // Add branch filtering
    if (branchId) {
      orderWhereConditions.branchId = branchId;
    }

    // Build product where conditions
    const productWhereConditions = {};
    if (categoryId) {
      productWhereConditions.categoryId = categoryId;
    }

    // Get top products data
    const topProducts = await OrderItem.findAll({
      attributes: [
        'productId',
        [sequelize.fn('SUM', sequelize.col('quantity')), 'totalQuantitySold'],
        [sequelize.fn('SUM', sequelize.col('total_price')), 'totalRevenue'],
        [sequelize.fn('COUNT', sequelize.col('OrderItem.id')), 'orderCount']
      ],
      include: [{
        model: Order,
        where: orderWhereConditions,
        attributes: []
      }, {
          model: Product,
          where: productWhereConditions,
        attributes: ['id', 'name', 'sku', 'price'],
        include: [{
              model: Category,
          attributes: ['name']
        }, {
              model: SubCategory,
          attributes: ['name']
        }]
      }],
      group: ['productId', 'Product.id', 'Product.Category.id', 'Product.SubCategory.id'],
      order: sortBy === 'quantity' ? 
        [[sequelize.fn('SUM', sequelize.col('quantity')), 'DESC']] :
        [[sequelize.fn('SUM', sequelize.col('total_price')), 'DESC']],
      limit: limitNum,
      raw: true,
      nest: true
    });

    // Format the response data
    const formattedData = topProducts.map(item => ({
      productId: item.productId,
      productName: item.Product?.name || 'Unknown Product',
      sku: item.Product?.sku || 'N/A',
      price: parseFloat(item.Product?.price) || 0,
      totalQuantitySold: parseInt(item.totalQuantitySold) || 0,
      totalRevenue: parseFloat(item.totalRevenue) || 0,
      averageOrderValue: parseInt(item.orderCount) > 0 ? 
        parseFloat(item.totalRevenue) / parseInt(item.orderCount) : 0,
      orderCount: parseInt(item.orderCount) || 0,
      categoryName: item.Product?.Category?.name || 'Uncategorized',
      subCategoryName: item.Product?.SubCategory?.name || 'Uncategorized'
    }));

    // Calculate summary
    const totalQuantitySold = formattedData.reduce((sum, item) => sum + item.totalQuantitySold, 0);
    const totalRevenue = formattedData.reduce((sum, item) => sum + item.totalRevenue, 0);

    return res.json({
      success: true,
      data: formattedData,
      summary: {
        totalProducts: formattedData.length,
        totalQuantitySold,
        totalRevenue,
        sortBy,
        dateRange: {
          startDate: startDate || null,
          endDate: endDate || null
        },
        generatedAt: new Date()
      }
    });

  } catch (error) {
    console.error('Top products error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch top products',
      error: error.message
    });
  }
});

/**
 * GET /api/v1/analytics/payment-breakdown
 * Get payment method breakdown
 */
router.get('/payment-breakdown', async (req, res) => {
  try {
    const { startDate, endDate, branchId } = req.query;

    // Build where conditions
    const whereConditions = {
      status: 'completed'
    };

    // Add date filtering
    if (startDate || endDate) {
      whereConditions.created_at = {};
      if (startDate) {
        whereConditions.created_at[Op.gte] = new Date(startDate);
      }
      if (endDate) {
        // Set end date to end of day (23:59:59.999) to include the entire day
        const endDateObj = new Date(endDate);
        endDateObj.setHours(23, 59, 59, 999);
        whereConditions.created_at[Op.lte] = endDateObj;
      }
    }

    // Add branch filtering
    if (branchId) {
      whereConditions.branchId = branchId;
    }

    // Get payment breakdown data
    const paymentData = await Order.findAll({
      attributes: [
        [sequelize.fn('SUM', sequelize.col('cash_amount')), 'cashSales'],
        [sequelize.fn('SUM', sequelize.col('visa_amount')), 'visaSales'],
        [sequelize.fn('COUNT', sequelize.col('Order.id')), 'orderCount']
      ],
      where: whereConditions,
      raw: true
    });

    const data = paymentData[0] || {
      cashSales: 0,
      visaSales: 0,
      orderCount: 0
    };

    const cashSales = parseFloat(data.cashSales) || 0;
    const visaSales = parseFloat(data.visaSales) || 0;
    const totalSales = cashSales + visaSales;

    return res.json({
      success: true,
      data: [{
        branchId: 'all',
        branchName: 'All Branches',
        branchLocation: 'All Locations',
        period: 'All Time',
        cashSales,
        visaSales,
        mixedSales: 0, // Add placeholder for mixed sales
        totalSales,
        cashPercentage: totalSales > 0 ? (cashSales / totalSales * 100) : 0,
        visaPercentage: totalSales > 0 ? (visaSales / totalSales * 100) : 0,
        orderCount: parseInt(data.orderCount) || 0
      }],
      summary: {
        totalSales: totalSales, // Frontend expects totalSales in summary
        totalCashSales: cashSales,
        totalVisaSales: visaSales,
        totalMixedSales: 0, // Add placeholder for mixed sales
        averageCashPercentage: totalSales > 0 ? (cashSales / totalSales * 100) : 0,
        averageVisaPercentage: totalSales > 0 ? (visaSales / totalSales * 100) : 0,
        averageMixedPercentage: 0, // Add placeholder for mixed percentage
        dateRange: {
          startDate: startDate || null,
          endDate: endDate || null
        },
        generatedAt: new Date()
      }
    });

  } catch (error) {
    console.error('Payment breakdown error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch payment breakdown',
      error: error.message
    });
  }
});

/**
 * GET /api/v1/analytics/branch-profit-analysis
 * Get branch profit analysis
 */
router.get('/branch-profit-analysis', async (req, res) => {
  try {
    const { startDate, endDate, branchId } = req.query;

    // Build where conditions
    const whereConditions = {
      status: 'completed'
    };

    // Add date filtering
    if (startDate || endDate) {
      whereConditions.created_at = {};
      if (startDate) {
        whereConditions.created_at[Op.gte] = new Date(startDate);
      }
      if (endDate) {
        // Set end date to end of day (23:59:59.999) to include the entire day
        const endDateObj = new Date(endDate);
        endDateObj.setHours(23, 59, 59, 999);
        whereConditions.created_at[Op.lte] = endDateObj;
      }
    }

    // Add branch filtering
    if (branchId) {
      whereConditions.branchId = branchId;
    }

    // Get sales data
    const salesData = await Order.findAll({
      attributes: [
        'branchId',
        [sequelize.fn('SUM', sequelize.col('total_price')), 'grossSales'],
        [sequelize.fn('SUM', sequelize.col('cash_amount')), 'cashSales'],
        [sequelize.fn('SUM', sequelize.col('visa_amount')), 'visaSales'],
        [sequelize.fn('SUM', sequelize.col('discount_amount')), 'totalDiscounts'],
        [sequelize.fn('COUNT', sequelize.col('Order.id')), 'orderCount']
      ],
      include: [{
        model: Branch,
        attributes: ['id', 'name', 'location']
      }],
      where: whereConditions,
      group: ['branchId', 'Branch.id'],
      raw: true,
      nest: true
    });

    // Format the response data
    const formattedData = salesData.map(branch => {
      const grossSales = parseFloat(branch.grossSales) || 0;
      const totalDiscounts = parseFloat(branch.totalDiscounts) || 0;
      const netSales = grossSales - totalDiscounts;
      const profitMargin = grossSales > 0 ? (netSales / grossSales) * 100 : 0;
      
      return {
        branchId: branch.branchId,
        branchName: branch.Branch?.name || 'Unknown Branch',
        branchLocation: branch.Branch?.location || 'Unknown Location',
        period: 'All Time', // Add period field
        grossSales: grossSales,
        cashSales: parseFloat(branch.cashSales) || 0,
        visaSales: parseFloat(branch.visaSales) || 0,
        mixedSales: 0, // Add mixedSales field (placeholder)
        totalDiscounts: totalDiscounts,
        refundAmount: 0, // Add refundAmount field (placeholder)
        replacementAmount: 0, // Add replacementAmount field (placeholder)
        netSales: netSales,
        netProfit: netSales, // Add netProfit field for frontend compatibility
        profitMargin: profitMargin, // Add profitMargin field for frontend compatibility
        orderCount: parseInt(branch.orderCount) || 0,
        averageOrderValue: parseInt(branch.orderCount) > 0 ? 
          grossSales / parseInt(branch.orderCount) : 0
      };
    });

    const totalGrossSales = formattedData.reduce((sum, item) => sum + item.grossSales, 0);
    const totalNetSales = formattedData.reduce((sum, item) => sum + item.netSales, 0);
    const totalDiscounts = formattedData.reduce((sum, item) => sum + item.totalDiscounts, 0);
    const overallProfitMargin = totalGrossSales > 0 ? ((totalNetSales / totalGrossSales) * 100) : 0;

    return res.json({
      success: true,
      data: formattedData,
      summary: {
        totalBranches: formattedData.length,
        totalGrossSales: totalGrossSales,
        totalNetProfit: totalNetSales, // Frontend expects totalNetProfit
        totalDiscounts: totalDiscounts,
        overallProfitMargin: overallProfitMargin,
        totalRefunds: 0, // Add placeholder for refunds
        totalReplacements: 0, // Add placeholder for replacements
        dateRange: {
          startDate: startDate || null,
          endDate: endDate || null
        },
        generatedAt: new Date()
      }
    });

  } catch (error) {
    console.error('Branch profit analysis error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch branch profit analysis',
      error: error.message
    });
  }
});

/**
 * GET /api/v1/analytics/product-performance
 * Get product sales trends over time
 */
router.get('/product-performance', async (req, res) => {
  try {
    const { 
      startDate, 
      endDate, 
      branchId, 
      productId,
      period = 'daily'
    } = req.query;

    // Build where conditions for orders
    const orderWhereConditions = {
      status: 'completed'
    };

    // Add date filtering
    if (startDate || endDate) {
      orderWhereConditions.created_at = {};
      if (startDate) {
        orderWhereConditions.created_at[Op.gte] = new Date(startDate);
      }
      if (endDate) {
        orderWhereConditions.created_at[Op.lte] = new Date(endDate);
      }
    }

    // Add branch filtering
    if (branchId) {
      orderWhereConditions.branchId = branchId;
    }

    // Build product where conditions
    const productWhereConditions = {};
    if (productId) {
      productWhereConditions.id = productId;
    }

    // Get product performance data
    const productPerformance = await OrderItem.findAll({
      attributes: [
        [sequelize.fn('DATE', sequelize.col('Order.created_at')), 'date'],
        [sequelize.fn('SUM', sequelize.col('OrderItem.quantity')), 'totalQuantitySold'],
        [sequelize.fn('SUM', sequelize.literal('OrderItem.quantity * OrderItem.price')), 'totalRevenue'],
        [sequelize.fn('COUNT', sequelize.col('OrderItem.id')), 'orderCount']
      ],
      include: [{
        model: Order,
        attributes: [],
        where: orderWhereConditions
      }, {
        model: Product,
        attributes: ['id', 'name', 'sku'],
        where: productWhereConditions
      }],
      group: ['Product.id', 'Product.name', 'Product.sku', sequelize.fn('DATE', sequelize.col('Order.created_at'))],
      order: [[sequelize.fn('DATE', sequelize.col('Order.created_at')), 'ASC']],
      raw: true,
      nest: true
    });

    // Format the response data
    const formattedData = productPerformance.map(item => ({
      productId: item.Product?.id,
      productName: item.Product?.name || 'Unknown Product',
      productSku: item.Product?.sku || 'Unknown SKU',
      date: item.date,
      totalQuantitySold: parseInt(item.totalQuantitySold) || 0,
      totalRevenue: parseFloat(item.totalRevenue) || 0,
      orderCount: parseInt(item.orderCount) || 0,
      averageOrderValue: parseInt(item.orderCount) > 0 ? 
        (parseFloat(item.totalRevenue) || 0) / parseInt(item.orderCount) : 0
    }));

    return res.json({
      success: true,
      data: formattedData,
      summary: {
        totalProducts: [...new Set(formattedData.map(item => item.productId))].length,
        totalPeriods: formattedData.length,
        periodType: period,
        dateRange: {
          startDate: startDate || null,
          endDate: endDate || null
        },
        generatedAt: new Date()
      }
    });

  } catch (error) {
    console.error('Product performance error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch product performance',
      error: error.message
    });
  }
});

/**
 * GET /api/v1/analytics/daily-report
 * Generate daily report with comprehensive sales data
 */
router.get('/daily-report', async (req, res) => {
  console.log('📊 Daily report endpoint hit with params:', req.query);
  try {
    const { startDate, endDate, branchId } = req.query;

    // Validate date parameters
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Both startDate and endDate are required (format: YYYY-MM-DD)'
      });
    }

    // Validate date format
    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);
    
    if (isNaN(startDateObj.getTime()) || isNaN(endDateObj.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format. Use YYYY-MM-DD format'
      });
    }

    if (startDateObj > endDateObj) {
      return res.status(400).json({
        success: false,
        message: 'startDate cannot be after endDate'
      });
    }

    // Build where conditions for orders
    const orderWhereConditions = {
      status: 'completed',
      [Op.and]: [
        sequelize.where(sequelize.fn('DATE', sequelize.col('Order.created_at')), Op.gte, startDate),
        sequelize.where(sequelize.fn('DATE', sequelize.col('Order.created_at')), Op.lte, endDate)
      ]
    };

    // Add branch filtering
    if (branchId) {
      orderWhereConditions.branchId = branchId;
    }

    // Build where conditions for refunds
    const refundWhereConditions = {
      status: 'approved',
      [Op.and]: [
        sequelize.where(sequelize.fn('DATE', sequelize.col('Refund.created_at')), Op.gte, startDate),
        sequelize.where(sequelize.fn('DATE', sequelize.col('Refund.created_at')), Op.lte, endDate)
      ]
    };

    // Debug: Check if there are any orders in the database
    const totalOrdersCount = await Order.count();
    const ordersInDateRange = await Order.count({
      where: orderWhereConditions
    });
    
    // Get some sample orders to see what dates exist
    const sampleOrders = await Order.findAll({
      attributes: ['id', 'created_at', 'status', 'total_price', 'subtotal', 'discount_amount', 'discount_percentage'],
      limit: 5,
      order: [['created_at', 'DESC']],
      raw: true
    });
    
    // Get orders in date range with discount info
    const ordersInRange = await Order.findAll({
      attributes: ['id', 'subtotal', 'discount_amount', 'discount_percentage', 'total_price'],
      where: orderWhereConditions,
      raw: true
    });
    
    console.log('Debug - Total orders in database:', totalOrdersCount);
    console.log('Debug - Orders in date range:', ordersInDateRange);
    console.log('Debug - Date range:', { startDate, endDate });
    console.log('Debug - Sample orders:', sampleOrders);
    console.log('Debug - Orders in range with discount info:', ordersInRange);

    // 1. Products Sold Query - Get detailed order information for each product
    const productsSold = await OrderItem.findAll({
      attributes: [
        'productId',
        [sequelize.fn('SUM', sequelize.col('OrderItem.quantity')), 'total_quantity_sold'],
        [sequelize.fn('SUM', sequelize.literal('OrderItem.quantity * Product.price')), 'total_before_discount'],
        [sequelize.fn('SUM', sequelize.literal('OrderItem.quantity * Product.price * (1 - COALESCE(Order.discount_percentage, 0) / 100)')), 'total_after_discount'],
        [sequelize.fn('SUM', sequelize.literal('OrderItem.quantity * Product.price * COALESCE(Order.discount_percentage, 0) / 100')), 'discount_share']
      ],
      include: [{
        model: Order,
        where: orderWhereConditions,
        attributes: ['discount_percentage', 'discount_amount']
      }, {
        model: Product,
        attributes: ['id', 'name', 'price']
      }],
      group: ['OrderItem.product_id', 'Product.id', 'Product.name', 'Product.price', 'Order.discount_percentage', 'Order.discount_amount'],
      order: [[sequelize.literal('total_after_discount'), 'DESC']],
      raw: true,
      nest: true
    });

    // Calculate discount information separately
    const discountInfo = await Order.findAll({
      attributes: [
        [sequelize.fn('SUM', sequelize.fn('COALESCE', sequelize.col('discount_amount'), 0)), 'total_discount_amount'],
        [sequelize.fn('SUM', sequelize.fn('COALESCE', sequelize.col('subtotal'), sequelize.col('total_price'))), 'total_before_discount'],
        [sequelize.fn('SUM', sequelize.col('total_price')), 'total_after_discount']
      ],
      where: orderWhereConditions,
      raw: true
    });

    const discountData = discountInfo[0] || { total_discount_amount: 0, total_before_discount: 0, total_after_discount: 0 };
    const totalDiscountAmount = parseFloat(discountData.total_discount_amount) || 0;
    const totalBeforeDiscount = parseFloat(discountData.total_before_discount) || 0;
    const totalAfterDiscount = parseFloat(discountData.total_after_discount) || 0;
    
    console.log('🔍 Discount Debug Info:');
    console.log('  Raw discount data:', discountData);
    console.log('  Total discount amount:', totalDiscountAmount);
    console.log('  Total before discount:', totalBeforeDiscount);
    console.log('  Total after discount:', totalAfterDiscount);

    // 2. Refunds Query (use actual approved refund amounts)
    const refundsData = await Refund.findAll({
      attributes: [
        [sequelize.col('OrderItem.product_id'), 'product_id'],
        [sequelize.fn('SUM', sequelize.col('Refund.quantity')), 'total_refunded_quantity'],
        [sequelize.fn('SUM', sequelize.col('Refund.refund_amount')), 'total_refunded_value']
      ],
      include: [{
        model: OrderItem,
        attributes: [],
        include: [{
          model: Product,
          attributes: ['id', 'name', 'price']
        }]
      }],
      where: refundWhereConditions,
      group: ['OrderItem.product_id', 'OrderItem.Product.id', 'OrderItem.Product.name', 'OrderItem.Product.price'],
      order: [[sequelize.literal('total_refunded_value'), 'DESC']],
      raw: true,
      nest: true
    });

    // 3. Discounts Summary
    const discountsSummary = await Order.findAll({
      attributes: [
        [sequelize.fn('SUM', sequelize.fn('COALESCE', sequelize.col('discount_amount'), 0)), 'total_discount_amount'],
        [sequelize.fn('SUM', sequelize.fn('COALESCE', sequelize.col('subtotal'), sequelize.col('total_price'))), 'total_before_discount'],
        [sequelize.fn('SUM', sequelize.col('total_price')), 'total_after_discount']
      ],
      where: orderWhereConditions,
      raw: true
    });

    // 4. Payment Methods Summary
    const paymentMethods = await Order.findAll({
      attributes: [
        [sequelize.fn('SUM', sequelize.col('cash_amount')), 'cash_total'],
        [sequelize.fn('SUM', sequelize.col('visa_amount')), 'visa_total'],
        [sequelize.fn('SUM', sequelize.col('total_price')), 'total_after_discount']
      ],
      where: orderWhereConditions,
      raw: true
    });

    // 5. Replacements Query
    const replacementsData = await Replacement.findAll({
      attributes: [
        [sequelize.fn('SUM', sequelize.col('returned_amount')), 'total_returned_amount'],
        [sequelize.fn('SUM', sequelize.col('new_items_amount')), 'total_new_items_amount'],
        [sequelize.fn('SUM', sequelize.col('price_difference')), 'total_price_difference'],
        [sequelize.fn('SUM', sequelize.col('refund_to_customer')), 'total_refund_to_customer'],
        [sequelize.fn('SUM', sequelize.col('customer_payment')), 'total_customer_payment']
      ],
      where: {
        status: 'completed',
        [Op.and]: [
          sequelize.where(sequelize.fn('DATE', sequelize.col('Replacement.created_at')), Op.gte, startDate),
          sequelize.where(sequelize.fn('DATE', sequelize.col('Replacement.created_at')), Op.lte, endDate)
        ]
      },
      raw: true
    });

    // 6. Net Total After Refunds
    const netTotalData = await Order.findAll({
      attributes: [
        [sequelize.fn('SUM', sequelize.col('total_price')), 'total_after_discount_orders']
      ],
      where: orderWhereConditions,
      raw: true
    });

    const refundsTotal = await Refund.findAll({
      attributes: [
        [sequelize.fn('SUM', sequelize.col('refund_amount')), 'total_refunds']
      ],
      where: refundWhereConditions,
      raw: true
    });

    // Format the response data
    const formattedProductsSold = productsSold.map(item => {
      const itemBeforeDiscount = parseFloat(item.total_before_discount) || 0;
      const itemAfterDiscount = parseFloat(item.total_after_discount) || 0;
      const itemDiscountShare = parseFloat(item.discount_share) || 0;
      
      return {
        item_name: item.Product?.name || 'Unknown Product',
        total_quantity_sold: parseInt(item.total_quantity_sold) || 0,
        unit_price: parseFloat(item.Product?.price) || 0,
        total_before_discount: itemBeforeDiscount,
        total_after_discount: itemAfterDiscount,
        discount_share: itemDiscountShare
      };
    });

    const formattedRefunds = refundsData.map(item => {
      const qty = parseInt(item.total_refunded_quantity) || 0;
      const totalRefunded = parseFloat(item.total_refunded_value) || 0;
      // Compute effective refunded amount per unit (supports manual refunds)
      const effectiveUnitRefund = qty > 0 ? (totalRefunded / qty) : 0;
      return {
        item_name: item.OrderItem?.Product?.name || 'Unknown Product',
        total_refunded_quantity: qty,
        unit_price: effectiveUnitRefund,
        total_refunded_value: totalRefunded
      };
    });

    const discountsSummaryData = discountsSummary[0] || {
      total_discount_amount: 0,
      total_before_discount: 0,
      total_after_discount: 0
    };

    const paymentMethodsData = paymentMethods[0] || {
      cash_total: 0,
      visa_total: 0,
      total_after_discount: 0
    };

    const netTotalOrders = parseFloat(netTotalData[0]?.total_after_discount_orders) || 0;
    const totalRefunds = parseFloat(refundsTotal[0]?.total_refunds) || 0;

    // One-time penalty adjustment for orders where the 6+ items discount was revoked
    const refundPenaltyCandidates = await Refund.findAll({
      attributes: [
        [sequelize.fn('DISTINCT', sequelize.col('OrderItem.Order.id')), 'order_id'],
        [sequelize.col('OrderItem.Order.discount_amount'), 'discount_amount'],
        [sequelize.col('OrderItem.Order.discount_revoked'), 'discount_revoked'],
        [sequelize.col('OrderItem.Order.original_item_count'), 'original_item_count']
      ],
      include: [{ 
        model: OrderItem, 
        attributes: [],
        include: [{ model: Order, attributes: [] }]
      }],
      where: refundWhereConditions,
      raw: true
    });
    const penaltySum = refundPenaltyCandidates
      .filter(r => (r.discount_revoked === true || r.discount_revoked === 1) && ((parseInt(r.original_item_count) || 0) >= 6))
      .reduce((sum, r) => sum + (parseFloat(r.discount_amount) || 0), 0);

    // Additional adjustment: if a discounted order had ALL its items refunded within the range,
    // subtract that order's discount amount from net (to avoid residual discount impact).
    // 1) Fetch discounted orders in range with their total item quantity
    const discountedOrders = await Order.findAll({
      attributes: [
        'id',
        [sequelize.col('Order.discount_amount'), 'discount_amount'],
        [sequelize.fn('SUM', sequelize.col('OrderItems.quantity')), 'total_qty']
      ],
      where: {
        ...orderWhereConditions,
        discount_amount: { [Op.gt]: 0 }
      },
      include: [{ model: OrderItem, attributes: [] }],
      group: ['Order.id', 'Order.discount_amount'],
      raw: true
    });

    // 2) For those orders, compute total refunded quantity within date range
    const refundedPerOrder = await Refund.findAll({
      attributes: [
        // Use actual DB column name for MySQL (snake_case)
        [sequelize.col('OrderItem.order_id'), 'order_id'],
        [sequelize.fn('SUM', sequelize.col('Refund.quantity')), 'refunded_qty']
      ],
      include: [{ model: OrderItem, attributes: [] }],
      where: refundWhereConditions,
      group: ['OrderItem.order_id'],
      raw: true
    });

    // 3) Also get replaced quantities per order within date range
    // Use raw query with proper joins since ReplacementOrderItem -> OrderItem -> Order
    const replacedPerOrderRaw = await sequelize.query(
      `SELECT oi.order_id, SUM(roi.quantity_returned) as replaced_qty
       FROM replacement_order_items roi
       INNER JOIN order_items oi ON roi.order_item_id = oi.id
       INNER JOIN orders o ON oi.order_id = o.id
       WHERE DATE(roi.created_at) >= ? AND DATE(roi.created_at) <= ?
       GROUP BY oi.order_id`,
      {
        replacements: [startDate, endDate],
        type: sequelize.QueryTypes.SELECT
      }
    );
    const replacedPerOrder = replacedPerOrderRaw;

    const orderIdToRefundedQty = new Map();
    for (const row of refundedPerOrder) {
      const oid = row.order_id;
      const qty = parseInt(row.refunded_qty) || 0;
      orderIdToRefundedQty.set(oid, qty);
    }

    const orderIdToReplacedQty = new Map();
    for (const row of replacedPerOrder) {
      const oid = row.order_id;
      const qty = parseInt(row.replaced_qty) || 0;
      orderIdToReplacedQty.set(oid, qty);
    }

    let fullyReturnedDiscountSum = 0;
    for (const ord of discountedOrders) {
      const oid = ord.id;
      const totalQty = parseInt(ord.total_qty) || 0;
      const refundedQty = orderIdToRefundedQty.get(oid) || 0;
      const replacedQty = orderIdToReplacedQty.get(oid) || 0;
      const totalReturnedQty = refundedQty + replacedQty;
      
      // Only subtract discount if ALL items from the order were returned (refunded OR replaced)
      if (totalQty > 0 && totalReturnedQty >= totalQty) {
        fullyReturnedDiscountSum += parseFloat(ord.discount_amount) || 0;
      }
    }
    const replacementsSummaryData = replacementsData[0] || {
      total_returned_amount: 0,
      total_new_items_amount: 0,
      total_price_difference: 0,
      total_refund_to_customer: 0,
      total_customer_payment: 0
    };

    // Adjusted totals to account for replacements: orders already include the
    // new replacement orders, so subtract the returned amount to reflect net
    // revenue impact (e.g., 600 original + 400 replacement new - 300 returned = 700)
    const replacementsReturned = parseFloat(replacementsSummaryData.total_returned_amount) || 0;
    const replacementsNewItems = parseFloat(replacementsSummaryData.total_new_items_amount) || 0; // informational
    const replacementsCustomerPayment = parseFloat(replacementsSummaryData.total_customer_payment) || 0; // informational

    // Net total should reflect replacements impact correctly:
    // Orders total already includes replacement "new" orders.
    // To avoid double counting, subtract the replacement new items amount and
    // add back only the customer payment (price difference) for replacements.
    // (already declared above)

    // Net total: orders after discount - refunds - revoked discount penalty
    // Replacement new orders are already in orders total, and customer payments are part of those orders,
    // so we do not add replacement customer payments here to avoid double counting in cash basis.
    const netTotalAfterRefunds = (netTotalOrders - totalRefunds - (parseFloat(penaltySum) || 0) - fullyReturnedDiscountSum);

    // Also provide an adjusted discounts summary after replacements
    const totalAfterDiscountAdjusted = (parseFloat(totalAfterDiscount) || 0) - replacementsReturned;

    return res.json({
      success: true,
      data: {
        productsSold: formattedProductsSold,
        refundedItems: formattedRefunds,
        replacedItems: {
          total_returned_amount: parseFloat(replacementsSummaryData.total_returned_amount) || 0,
          total_new_items_amount: parseFloat(replacementsSummaryData.total_new_items_amount) || 0,
          total_price_difference: parseFloat(replacementsSummaryData.total_price_difference) || 0,
          total_refund_to_customer: parseFloat(replacementsSummaryData.total_refund_to_customer) || 0,
          total_customer_payment: parseFloat(replacementsSummaryData.total_customer_payment) || 0
        },
        discountsSummary: {
          total_discount_amount: totalDiscountAmount,
          total_before_discount: totalBeforeDiscount,
          total_after_discount: totalAfterDiscount,
          total_after_discount_adjusted_for_replacements: totalAfterDiscountAdjusted
        },
        paymentMethodsSummary: [
          {
            payment_method: 'cash',
            total_after_discount: parseFloat(paymentMethodsData.cash_total) || 0
          },
          {
            payment_method: 'visa',
            total_after_discount: parseFloat(paymentMethodsData.visa_total) || 0
          }
        ],
        netTotalAfterRefunds: {
          total_after_discount_orders: netTotalOrders,
          total_refunds: totalRefunds,
          replacements_returned: replacementsReturned,
          replacements_customer_payment: replacementsCustomerPayment,
          net_total_after_refunds: netTotalAfterRefunds
        }
      },
      summary: {
        dateRange: {
          startDate: startDate,
          endDate: endDate
        },
        branchId: branchId || 'all',
        totalProductsSold: formattedProductsSold.length,
        totalRefundedItems: formattedRefunds.length,
        totalOrdersInDatabase: totalOrdersCount,
        ordersInDateRange: ordersInDateRange,
        generatedAt: new Date()
      }
    });

  } catch (error) {
    console.error('Daily report error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate daily report',
      error: error.message
    });
  }
});

/**
 * POST /api/v1/analytics/generate-report
 * Generate comprehensive analytics report
 */
// Debug route to list all registered routes
router.get('/test-routes', (req, res) => {
  const routes = [];
  router.stack.forEach((middleware) => {
    if (middleware.route) {
      routes.push({
        path: middleware.route.path,
        methods: Object.keys(middleware.route.methods)
      });
    }
  });
  res.json({ success: true, routes });
});

router.post('/generate-report', async (req, res) => {
  try {
    const { 
      reportType = 'comprehensive',
      startDate, 
      endDate, 
      branchId,
      period = 'daily',
      includeCharts = true,
      format = 'pdf'
    } = req.body;

    // Generate a unique report ID
    const reportId = `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // For now, return a success response with report metadata
    // In a real implementation, you would:
    // 1. Generate the actual report (PDF, Excel, etc.)
    // 2. Store it in a file system or cloud storage
    // 3. Return a download link or file path
    
    const reportData = {
      reportId,
      reportType,
      status: 'generated',
      format,
      parameters: {
        startDate: startDate || null,
        endDate: endDate || null,
        branchId: branchId || null,
        period,
        includeCharts
      },
      generatedAt: new Date(),
      downloadUrl: `/api/v1/analytics/reports/${reportId}.${format}`,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours from now
    };

    return res.json({
      success: true,
      message: 'Report generated successfully',
      data: reportData
    });

  } catch (error) {
    console.error('Generate report error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate report',
      error: error.message
    });
  }
});

/**
 * GET /api/v1/analytics/detailed-report
 * Generate comprehensive detailed analytics report with sales, refunds, and discounts
 */
router.get('/detailed-report', async (req, res) => {
  console.log('📊 Detailed report endpoint hit with params:', req.query);
  try {
    const { startDate, endDate, branchId } = req.query;

    // Validate date parameters
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Both startDate and endDate are required (format: YYYY-MM-DD)'
      });
    }

    // Validate date format
    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);
    
    if (isNaN(startDateObj.getTime()) || isNaN(endDateObj.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format. Use YYYY-MM-DD format'
      });
    }

    if (startDateObj > endDateObj) {
      return res.status(400).json({
        success: false,
        message: 'startDate cannot be after endDate'
      });
    }

    // Build where conditions for orders
    const orderWhereConditions = {
      status: 'completed',
      [Op.and]: [
        sequelize.where(sequelize.fn('DATE', sequelize.col('Order.created_at')), Op.gte, startDate),
        sequelize.where(sequelize.fn('DATE', sequelize.col('Order.created_at')), Op.lte, endDate)
      ]
    };

    // Add branch filtering
    if (branchId) {
      orderWhereConditions.branchId = branchId;
    }

    // Build where conditions for refunds
    const refundWhereConditions = {
      status: 'approved',
      [Op.and]: [
        sequelize.where(sequelize.fn('DATE', sequelize.col('Refund.created_at')), Op.gte, startDate),
        sequelize.where(sequelize.fn('DATE', sequelize.col('Refund.created_at')), Op.lte, endDate)
      ]
    };

    // 1. DETAILED PRODUCTS SOLD - with discount information
    const productsSold = await OrderItem.findAll({
      attributes: [
        'productId',
        [sequelize.fn('SUM', sequelize.col('OrderItem.quantity')), 'total_quantity_sold'],
        [sequelize.fn('SUM', sequelize.literal('OrderItem.quantity * Product.price')), 'total_before_discount'],
        [sequelize.fn('SUM', sequelize.literal('OrderItem.quantity * Product.price * (1 - COALESCE(Order.discount_percentage, 0) / 100)')), 'total_after_discount'],
        [sequelize.fn('SUM', sequelize.literal('OrderItem.quantity * Product.price * COALESCE(Order.discount_percentage, 0) / 100')), 'discount_applied'],
        [sequelize.fn('COUNT', sequelize.col('OrderItem.id')), 'order_count'],
        [sequelize.fn('AVG', sequelize.col('Product.price')), 'average_unit_price']
      ],
      include: [{
        model: Order,
        where: orderWhereConditions,
        attributes: ['id', 'discount_percentage', 'discount_amount', 'subtotal', 'total_price', 'created_at']
      }, {
        model: Product,
        attributes: ['id', 'name', 'sku', 'price']
      }],
      group: ['OrderItem.product_id', 'Product.id', 'Product.name', 'Product.sku', 'Product.price'],
      order: [[sequelize.literal('total_after_discount'), 'DESC']],
      raw: true,
      nest: true
    });

    // 2. DETAILED REFUNDS - with discount information
    const refundsData = await Refund.findAll({
      attributes: [
        'id',
        'quantity',
        'refund_amount',
        'status',
        'reason',
        'created_at',
        [sequelize.literal('`OrderItem->Product`.`price`'), 'original_unit_price'],
        [sequelize.literal('`OrderItem->Product`.`price` * (1 - COALESCE(`OrderItem->Order`.`discount_percentage`, 0) / 100)'), 'discounted_unit_price'],
        [sequelize.literal('`OrderItem->Product`.`price` * COALESCE(`OrderItem->Order`.`discount_percentage`, 0) / 100'), 'discount_on_refund'],
        [sequelize.literal('`OrderItem->Product`.`price` * Refund.quantity'), 'original_total_value'],
        [sequelize.literal('Refund.refund_amount'), 'actual_refund_amount']
      ],
      include: [{
        model: OrderItem,
        attributes: ['id', 'quantity'],
        include: [{
          model: Product,
          attributes: ['id', 'name', 'sku', 'price']
        }, {
          model: Order,
          attributes: ['id', 'discount_percentage', 'discount_amount', 'subtotal', 'total_price', 'created_at']
        }]
      }],
      where: refundWhereConditions,
      order: [['created_at', 'DESC']],
      raw: true,
      nest: true
    });

    // 3. AGGREGATED REFUNDS BY PRODUCT
    const refundsByProduct = await Refund.findAll({
      attributes: [
        [sequelize.col('OrderItem.productId'), 'product_id'],
        [sequelize.fn('SUM', sequelize.col('Refund.quantity')), 'total_refunded_quantity'],
        [sequelize.fn('SUM', sequelize.col('Refund.refund_amount')), 'total_refund_amount'],
        [sequelize.fn('SUM', sequelize.literal('Refund.quantity * `OrderItem->Product`.`price`')), 'total_original_value'],
        [sequelize.fn('SUM', sequelize.literal('Refund.quantity * `OrderItem->Product`.`price` * COALESCE(`OrderItem->Order`.`discount_percentage`, 0) / 100')), 'total_discount_on_refunds'],
        [sequelize.fn('COUNT', sequelize.col('Refund.id')), 'refund_count']
      ],
      include: [{
        model: OrderItem,
        attributes: [],
        include: [{
          model: Product,
          attributes: ['id', 'name', 'sku', 'price']
        }, {
          model: Order,
          attributes: []
        }]
      }],
      where: refundWhereConditions,
      group: ['OrderItem.product_id', 'OrderItem.Product.id', 'OrderItem.Product.name', 'OrderItem.Product.sku', 'OrderItem.Product.price'],
      order: [[sequelize.literal('total_refund_amount'), 'DESC']],
      raw: true,
      nest: true
    });

    // 4. DISCOUNT SUMMARY
    const discountSummary = await Order.findAll({
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('Order.id')), 'total_orders'],
        [sequelize.fn('SUM', sequelize.col('subtotal')), 'total_before_discount'],
        [sequelize.fn('SUM', sequelize.col('discount_amount')), 'total_discount_amount'],
        [sequelize.fn('SUM', sequelize.col('total_price')), 'total_after_discount'],
        [sequelize.fn('AVG', sequelize.col('discount_percentage')), 'average_discount_percentage'],
        [sequelize.fn('COUNT', sequelize.literal('CASE WHEN discount_amount > 0 THEN 1 END')), 'orders_with_discount']
      ],
      where: orderWhereConditions,
      raw: true
    });

    // 5. PAYMENT METHODS BREAKDOWN
    const paymentBreakdown = await Order.findAll({
      attributes: [
        [sequelize.fn('SUM', sequelize.col('cash_amount')), 'cash_total'],
        [sequelize.fn('SUM', sequelize.col('visa_amount')), 'visa_total'],
        [sequelize.fn('SUM', sequelize.col('total_price')), 'total_sales'],
        [sequelize.fn('COUNT', sequelize.literal('CASE WHEN payment_method = "cash" THEN 1 END')), 'cash_orders'],
        [sequelize.fn('COUNT', sequelize.literal('CASE WHEN payment_method = "visa" THEN 1 END')), 'visa_orders'],
        [sequelize.fn('COUNT', sequelize.literal('CASE WHEN payment_method = "mixed" THEN 1 END')), 'mixed_orders']
      ],
      where: orderWhereConditions,
      raw: true
    });

    // 6. NET TOTALS CALCULATION
    const netTotals = await Order.findAll({
      attributes: [
        [sequelize.fn('SUM', sequelize.col('total_price')), 'total_sales_after_discount']
      ],
      where: orderWhereConditions,
      raw: true
    });

    const totalRefunds = await Refund.findAll({
      attributes: [
        [sequelize.fn('SUM', sequelize.col('refund_amount')), 'total_refunds']
      ],
      where: refundWhereConditions,
      raw: true
    });

    // Format the response data
    const formattedProductsSold = productsSold.map(item => {
      const beforeDiscount = parseFloat(item.total_before_discount) || 0;
      const afterDiscount = parseFloat(item.total_after_discount) || 0;
      const discountApplied = parseFloat(item.discount_applied) || 0;
      const discountPercentage = beforeDiscount > 0 ? (discountApplied / beforeDiscount) * 100 : 0;

      return {
        product_id: item.productId,
        product_name: item.Product?.name || 'Unknown Product',
        product_sku: item.Product?.sku || 'N/A',
        unit_price: parseFloat(item.Product?.price) || 0,
        total_quantity_sold: parseInt(item.total_quantity_sold) || 0,
        total_before_discount: beforeDiscount,
        total_after_discount: afterDiscount,
        discount_applied: discountApplied,
        discount_percentage: discountPercentage,
        average_unit_price: parseFloat(item.average_unit_price) || 0,
        order_count: parseInt(item.order_count) || 0
      };
    });

    const formattedRefunds = refundsData.map(refund => {
      const originalPrice = parseFloat(refund.original_unit_price) || 0;
      const discountedPrice = parseFloat(refund.discounted_unit_price) || 0;
      const discountOnRefund = parseFloat(refund.discount_on_refund) || 0;
      const originalTotalValue = parseFloat(refund.original_total_value) || 0;
      const actualRefundAmount = parseFloat(refund.actual_refund_amount) || 0;
      const discountPercentage = originalPrice > 0 ? (discountOnRefund / originalPrice) * 100 : 0;

      return {
        refund_id: refund.id,
        order_id: refund.OrderItem?.Order?.id,
        product_name: refund.OrderItem?.Product?.name || 'Unknown Product',
        product_sku: refund.OrderItem?.Product?.sku || 'N/A',
        unit_price: originalPrice, // Original unit price (before discount)
        total_refunded_value: actualRefundAmount, // Actual refunded amount (after discount)
        original_total_value: originalTotalValue, // Original total value (before discount)
        discount_on_refund: discountOnRefund,
        discount_percentage: discountPercentage,
        quantity_refunded: parseInt(refund.quantity) || 0,
        refund_amount: actualRefundAmount,
        reason: refund.reason,
        refund_date: refund.created_at,
        original_order_date: refund.OrderItem?.Order?.created_at,
        original_order_discount: refund.OrderItem?.Order?.discount_amount ? parseFloat(refund.OrderItem.Order.discount_amount) : 0
      };
    });

    const formattedRefundsByProduct = refundsByProduct.map(item => {
      const originalTotalValue = parseFloat(item.total_original_value) || 0;
      const actualRefundAmount = parseFloat(item.total_refund_amount) || 0;
      const discountOnRefunds = parseFloat(item.total_discount_on_refunds) || 0;
      const discountPercentage = originalTotalValue > 0 ? (discountOnRefunds / originalTotalValue) * 100 : 0;

      return {
        product_id: item.product_id,
        product_name: item.OrderItem?.Product?.name || 'Unknown Product',
        product_sku: item.OrderItem?.Product?.sku || 'N/A',
        unit_price: parseFloat(item.OrderItem?.Product?.price) || 0, // Original unit price
        total_quantity_refunded: parseInt(item.total_refunded_quantity) || 0,
        total_original_value: originalTotalValue, // Original total value (before discount)
        total_refunded_value: actualRefundAmount, // Actual refunded amount (after discount)
        total_discount_on_refunds: discountOnRefunds,
        discount_percentage: discountPercentage,
        refund_count: parseInt(item.refund_count) || 0
      };
    });

    const discountData = discountSummary[0] || {};
    const paymentData = paymentBreakdown[0] || {};
    const netSales = parseFloat(netTotals[0]?.total_sales_after_discount) || 0;
    const totalRefundAmount = parseFloat(totalRefunds[0]?.total_refunds) || 0;
    const netTotal = netSales - totalRefundAmount;

    return res.json({
      success: true,
      data: {
        // 1. PRODUCTS SOLD WITH DISCOUNTS
        products_sold: {
          items: formattedProductsSold,
          summary: {
            total_products: formattedProductsSold.length,
            total_quantity_sold: formattedProductsSold.reduce((sum, item) => sum + item.total_quantity_sold, 0),
            total_before_discount: formattedProductsSold.reduce((sum, item) => sum + item.total_before_discount, 0),
            total_after_discount: formattedProductsSold.reduce((sum, item) => sum + item.total_after_discount, 0),
            total_discounts_applied: formattedProductsSold.reduce((sum, item) => sum + item.discount_applied, 0)
          }
        },

        // 2. REFUNDS WITH DISCOUNT INFORMATION
        refunds: {
          detailed_refunds: formattedRefunds,
          refunds_by_product: formattedRefundsByProduct,
          summary: {
            total_refunds: formattedRefunds.length,
            total_quantity_refunded: formattedRefunds.reduce((sum, item) => sum + item.quantity_refunded, 0),
            total_refund_amount: formattedRefunds.reduce((sum, item) => sum + item.refund_amount, 0),
            total_discount_on_refunds: formattedRefunds.reduce((sum, item) => sum + item.discount_on_refund, 0)
          }
        },

        // 3. DISCOUNT ANALYSIS
        discount_analysis: {
          total_orders: parseInt(discountData.total_orders) || 0,
          orders_with_discount: parseInt(discountData.orders_with_discount) || 0,
          total_before_discount: parseFloat(discountData.total_before_discount) || 0,
          total_discount_amount: parseFloat(discountData.total_discount_amount) || 0,
          total_after_discount: parseFloat(discountData.total_after_discount) || 0,
          average_discount_percentage: parseFloat(discountData.average_discount_percentage) || 0,
          discount_coverage: parseInt(discountData.total_orders) > 0 ? 
            (parseInt(discountData.orders_with_discount) / parseInt(discountData.total_orders)) * 100 : 0
        },

        // 4. PAYMENT BREAKDOWN
        payment_breakdown: {
          cash_total: parseFloat(paymentData.cash_total) || 0,
          visa_total: parseFloat(paymentData.visa_total) || 0,
          total_sales: parseFloat(paymentData.total_sales) || 0,
          cash_orders: parseInt(paymentData.cash_orders) || 0,
          visa_orders: parseInt(paymentData.visa_orders) || 0,
          mixed_orders: parseInt(paymentData.mixed_orders) || 0,
          cash_percentage: parseFloat(paymentData.total_sales) > 0 ? 
            (parseFloat(paymentData.cash_total) / parseFloat(paymentData.total_sales)) * 100 : 0,
          visa_percentage: parseFloat(paymentData.total_sales) > 0 ? 
            (parseFloat(paymentData.visa_total) / parseFloat(paymentData.total_sales)) * 100 : 0
        },

        // 5. NET TOTALS
        net_totals: {
          total_sales_after_discount: netSales,
          total_refunds: totalRefundAmount,
          net_total_after_refunds: netTotal,
          profit_margin: netSales > 0 ? ((netTotal / netSales) * 100) : 0
        }
      },
      summary: {
        date_range: {
          start_date: startDate,
          end_date: endDate
        },
        branch_id: branchId || 'all',
        generated_at: new Date(),
        report_type: 'detailed_analytics'
      }
    });

  } catch (error) {
    console.error('Detailed report error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate detailed report',
      error: error.message
    });
  }
});

module.exports = router;
