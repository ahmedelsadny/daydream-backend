module.exports = (sequelize, DataTypes) => {
  const HeldOrder = sequelize.define(
    'HeldOrder',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
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
      customerId: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'customer_id',
        references: {
          model: 'customers',
          key: 'id'
        }
      },
      customerName: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'customer_name'
      },
      cartData: {
        type: DataTypes.JSON,
        allowNull: false,
        field: 'cart_data',
        comment: 'JSON payload containing cart items, quantities, and pricing'
      },
      holdReason: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'hold_reason',
        comment: 'Reason cart was held (e.g. customer retrieving wallet, forgot weight sticker)'
      },
      totalAmount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.00,
        field: 'total_amount'
      }
    },
    {
      tableName: 'held_orders',
      underscored: true,
      timestamps: true
    }
  );

  return HeldOrder;
};
