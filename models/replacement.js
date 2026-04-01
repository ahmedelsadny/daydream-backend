module.exports = (sequelize, DataTypes) => {
  const Replacement = sequelize.define(
    'Replacement',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      // Original order item being returned (legacy field for single-item replacements)
      originalOrderItemId: {
        type: DataTypes.UUID,
        allowNull: true, // Made nullable for multi-item replacements
        field: 'original_order_item_id',
        comment: 'Legacy field for single-item replacements. Use ReplacementOrderItem for multi-item replacements.'
      },
      branchId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'branch_id'
      },
      // New order created for replacement items
      newOrderId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'new_order_id'
      },
      customerId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'customer_id'
      },
      // Amount of original items returned
      returnedAmount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        field: 'returned_amount'
      },
      // Amount of new items
      newItemsAmount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        field: 'new_items_amount'
      },
      // Price difference (positive = customer pays more, negative = customer gets refund)
      priceDifference: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        field: 'price_difference'
      },
      // Dedicated field for money returned to customer
      refundToCustomer: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.00,
        field: 'refund_to_customer'
      },
      // Amount customer paid for price difference
      customerPayment: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.00,
        field: 'customer_payment'
      },
      paymentMethod: {
        type: DataTypes.ENUM('cash', 'visa', 'mixed', 'none'),
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
      // Detailed transaction log
      transactionLog: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'transaction_log'
      },
      processedBy: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'processed_by'
      },
      reason: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      status: {
        type: DataTypes.ENUM('completed', 'cancelled'),
        allowNull: false,
        defaultValue: 'completed'
      }
    },
    {
      tableName: 'replacements',
      underscored: true,
      timestamps: true
    }
  );

  // Define associations
  Replacement.associate = (models) => {
    // Legacy association for single-item replacements
    Replacement.belongsTo(models.OrderItem, {
      foreignKey: 'originalOrderItemId',
      as: 'OriginalOrderItem'
    });

    // New association for multi-item replacements
    Replacement.hasMany(models.ReplacementOrderItem, {
      foreignKey: 'replacementId',
      as: 'ReplacementOrderItems'
    });

    // Other existing associations
    Replacement.belongsTo(models.Branch, {
      foreignKey: 'branchId',
      as: 'Branch'
    });

    Replacement.belongsTo(models.Order, {
      foreignKey: 'newOrderId',
      as: 'NewOrder'
    });

    Replacement.belongsTo(models.Customer, {
      foreignKey: 'customerId',
      as: 'Customer'
    });

    Replacement.belongsTo(models.User, {
      foreignKey: 'processedBy',
      as: 'ProcessedBy'
    });
  };

  return Replacement;
};

