module.exports = (sequelize, DataTypes) => {
  const Order = sequelize.define(
    'Order',
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
      customerId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'customer_id'
      },
      subtotal: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        field: 'subtotal'
      },
      discountPercentage: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: true,
        field: 'discount_percentage'
      },
      discountAmount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        field: 'discount_amount'
      },
      cashierDiscountId: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'cashier_discount_id'
      },
      bulkDiscountPercentage: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: true,
        field: 'bulk_discount_percentage'
      },
      bulkDiscountAmount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        field: 'bulk_discount_amount'
      },
      originalItemCount: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'original_item_count'
      },
      refundedItemsCount: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 0,
        field: 'refunded_items_count'
      },
      discountRevoked: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        defaultValue: false,
        field: 'discount_revoked'
      },
      totalPrice: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        field: 'total_price'
      },
      paymentMethod: {
        type: DataTypes.ENUM('cash', 'visa', 'mixed'),
        allowNull: false,
        field: 'payment_method'
      },
      cashAmount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        field: 'cash_amount'
      },
      visaAmount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        field: 'visa_amount'
      },
      amountPaid: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        field: 'amount_paid'
      },
      changeAmount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        field: 'change_amount'
      },
      status: {
        type: DataTypes.ENUM('pending', 'completed', 'cancelled', 'refunded'),
        allowNull: false
      }
    },
    {
      tableName: 'orders',
      underscored: true,
      timestamps: true
    }
  );
  return Order;
};


