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
