module.exports = (sequelize, DataTypes) => {
  const Expense = sequelize.define(
    'Expense',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      categoryId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'category_id',
        references: {
          model: 'expense_categories',
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
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'user_id',
        references: {
          model: 'users',
          key: 'id'
        }
      },
      shiftId: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'shift_id',
        references: {
          model: 'shifts',
          key: 'id'
        },
        comment: 'Optional shift ID if paid directly from cash drawer'
      },
      amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false
      },
      paymentMethod: {
        type: DataTypes.ENUM('cash_drawer', 'safe', 'bank_transfer', 'cheque'),
        allowNull: false,
        defaultValue: 'safe',
        field: 'payment_method'
      },
      title: {
        type: DataTypes.STRING,
        allowNull: false
      },
      recipient: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'Person or entity receiving the payment'
      },
      receiptNumber: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'receipt_number',
        comment: 'Physical receipt or invoice number'
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      expenseDate: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        field: 'expense_date'
      }
    },
    {
      tableName: 'expenses',
      underscored: true,
      timestamps: true
    }
  );

  return Expense;
};
