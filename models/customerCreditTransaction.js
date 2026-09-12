module.exports = (sequelize, DataTypes) => {
  const CustomerCreditTransaction = sequelize.define(
    'CustomerCreditTransaction',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      customerId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'customer_id',
        references: {
          model: 'customers',
          key: 'id'
        }
      },
      orderId: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'order_id',
        references: {
          model: 'orders',
          key: 'id'
        },
        comment: 'Associated order if debit was caused by a credit sale'
      },
      type: {
        type: DataTypes.ENUM('debit', 'credit'),
        allowNull: false,
        comment: 'debit = customer owes more money; credit = customer paid off debt'
      },
      amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false
      },
      previousDebt: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.00,
        field: 'previous_debt'
      },
      newDebt: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.00,
        field: 'new_debt'
      },
      paymentMethod: {
        type: DataTypes.ENUM('cash', 'card', 'transfer', 'other'),
        allowNull: false,
        defaultValue: 'cash',
        field: 'payment_method'
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      recordedBy: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'recorded_by',
        references: {
          model: 'users',
          key: 'id'
        }
      },
      branchId: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'branch_id',
        references: {
          model: 'branches',
          key: 'id'
        }
      }
    },
    {
      tableName: 'customer_credit_transactions',
      underscored: true,
      timestamps: true
    }
  );

  return CustomerCreditTransaction;
};
