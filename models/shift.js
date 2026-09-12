module.exports = (sequelize, DataTypes) => {
  const Shift = sequelize.define(
    'Shift',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      cashierId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'cashier_id'
      },
      branchId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'branch_id'
      },
      startTime: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'start_time'
      },
      endTime: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'end_time'
      },
      status: {
        type: DataTypes.ENUM('active', 'completed'),
        allowNull: false,
        defaultValue: 'active'
      },
      totalSales: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0,
        field: 'total_sales'
      },
      totalOrders: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 0,
        field: 'total_orders'
      },
      cashSales: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0,
        field: 'cash_sales'
      },
      visaSales: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0,
        field: 'visa_sales'
      },
      productsSold: {
        type: DataTypes.JSON,
        allowNull: true,
        field: 'products_sold',
        comment: 'Array of {productId, productName, sku, quantity, totalPrice}'
      },
      totalRefunds: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0,
        field: 'total_refunds'
      },
      refundCount: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 0,
        field: 'refund_count'
      },
      netSales: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0,
        field: 'net_sales'
      },
      productsRefunded: {
        type: DataTypes.JSON,
        allowNull: true,
        field: 'products_refunded',
        comment: 'Array of {productId, productName, sku, quantity, refundAmount}'
      },
      totalReplacements: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0,
        field: 'total_replacements'
      },
      replacementCount: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 0,
        field: 'replacement_count'
      },
      totalReplacementRefunds: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0,
        field: 'total_replacement_refunds'
      },
      totalReplacementPayments: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0,
        field: 'total_replacement_payments'
      },
      productsReplaced: {
        type: DataTypes.JSON,
        allowNull: true,
        field: 'products_replaced',
        comment: 'Array of {productId, productName, sku, quantity, returnedAmount, newItemsAmount, priceDifference}'
      },
      totalDiscounts: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0,
        field: 'total_discounts',
        comment: 'Total discounts applied during the shift'
      },
      totalSubtotal: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0,
        field: 'total_subtotal',
        comment: 'Total subtotal before discounts during the shift'
      },
      refundDiscounts: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0,
        field: 'refund_discounts',
        comment: 'Total discounts applied to refunds during the shift'
      },
      refundSubtotal: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0,
        field: 'refund_subtotal',
        comment: 'Total refund subtotal before discounts during the shift'
      },
      replacementDiscounts: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0,
        field: 'replacement_discounts',
        comment: 'Total discounts applied to replacements during the shift'
      },
      replacementSubtotal: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0,
        field: 'replacement_subtotal',
        comment: 'Total replacement subtotal before discounts during the shift'
      },
      openingBalance: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.00,
        field: 'opening_balance',
        comment: 'Initial cash float in drawer when shift is opened'
      },
      closingBalance: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        field: 'closing_balance',
        comment: 'Actual physical cash counted in drawer at shift close'
      },
      expectedBalance: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        field: 'expected_balance',
        comment: 'Calculated expected cash: opening + cashSales - cashRefunds + cashIn - cashOut'
      },
      cashDifference: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0.00,
        field: 'cash_difference',
        comment: 'Shortage (negative) or surplus (positive): closingBalance - expectedBalance'
      },
      cashIn: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.00,
        field: 'cash_in',
        comment: 'Total cash added to drawer during shift (additional float)'
      },
      cashOut: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.00,
        field: 'cash_out',
        comment: 'Total cash removed from drawer during shift (petty expense or supervisor drop)'
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'notes'
      }
    },
    {
      tableName: 'shifts',
      underscored: true,
      timestamps: true
    }
  );
  return Shift;
};
