module.exports = (sequelize, DataTypes) => {
  const CashTransaction = sequelize.define(
    'CashTransaction',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      shiftId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'shift_id',
        references: {
          model: 'shifts',
          key: 'id'
        }
      },
      cashierId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'cashier_id',
        references: {
          model: 'users',
          key: 'id'
        }
      },
      branchId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'branch_id',
        references: {
          model: 'branches',
          key: 'id'
        }
      },
      type: {
        type: DataTypes.ENUM('in', 'out'),
        allowNull: false,
        comment: "'in' = cash float deposit; 'out' = cash withdrawal (petty expense, supervisor drop)"
      },
      amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false
      },
      reason: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: 'Reason for the transaction (e.g. Additional Float, Packaging Bags, Supervisor Drop)'
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true
      }
    },
    {
      tableName: 'cash_transactions',
      underscored: true,
      timestamps: true
    }
  );

  return CashTransaction;
};
