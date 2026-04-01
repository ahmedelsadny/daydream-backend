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

    const overview = salesData[0] || {
      totalSales: 0,
      totalOrders: 0,
      averageOrderValue: 0,
      cashSales: 0,
      visaSales: 0,
      totalDiscounts: 0
    };

    return res.json({
      success: true,
      data: {
        totalSales: parseFloat(overview.totalSales) || 0,
        totalOrders: parseInt(overview.totalOrders) || 0,
        averageOrderValue: parseFloat(overview.averageOrderValue) || 0,
        cashSales: parseFloat(overview.cashSales) || 0,
        visaSales: parseFloat(overview.visaSales) || 0,
        totalDiscounts: parseFloat(overview.totalDiscounts) || 0,
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

    // Set default date range if not provided (last 30 days)
    const endDateObj = endDate ? new Date(endDate) : new Date();
    const startDateObj = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Build where conditions
    const whereConditions = {
      status: 'completed',
      created_at: {
        [Op.gte]: startDateObj,
        [Op.lte]: endDateObj
      }
    };

    // Add branch filtering
    if (branchId) {
      whereConditions.branchId = branchId;
    }

    // Determine date grouping function based on period
    let dateGrouping;
    
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
          startDate: startDateObj.toISOString().split('T')[0],
          endDate: endDateObj.toISOString().split('T')[0]
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
        orderWhereConditions.created_at[Op.lte] = new Date(endDate);
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
      data: {
        cashSales,
        visaSales,
        totalSales,
        cashPercentage: totalSales > 0 ? (cashSales / totalSales * 100) : 0,
        visaPercentage: totalSales > 0 ? (visaSales / totalSales * 100) : 0,
        orderCount: parseInt(data.orderCount) || 0
      },
      summary: {
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
    const formattedData = salesData.map(branch => ({
      branchId: branch.branchId,
      branchName: branch.Branch?.name || 'Unknown Branch',
      branchLocation: branch.Branch?.location || 'Unknown Location',
      grossSales: parseFloat(branch.grossSales) || 0,
      cashSales: parseFloat(branch.cashSales) || 0,
      visaSales: parseFloat(branch.visaSales) || 0,
      totalDiscounts: parseFloat(branch.totalDiscounts) || 0,
      netSales: (parseFloat(branch.grossSales) || 0) - (parseFloat(branch.totalDiscounts) || 0),
      orderCount: parseInt(branch.orderCount) || 0,
      averageOrderValue: parseInt(branch.orderCount) > 0 ? 
        (parseFloat(branch.grossSales) || 0) / parseInt(branch.orderCount) : 0
    }));

    return res.json({
      success: true,
      data: formattedData,
      summary: {
        totalBranches: formattedData.length,
        totalGrossSales: formattedData.reduce((sum, item) => sum + item.grossSales, 0),
        totalNetSales: formattedData.reduce((sum, item) => sum + item.netSales, 0),
        totalDiscounts: formattedData.reduce((sum, item) => sum + item.totalDiscounts, 0),
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

module.exports = router;
