module.exports = (sequelize, DataTypes) => {
  const CashierDiscount = sequelize.define(
    'CashierDiscount',
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
      discountPercentage: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        field: 'discount_percentage',
        validate: {
          min: 0,
          max: 100
        }
      },
      startDate: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'start_date'
      },
      endDate: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'end_date'
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        field: 'is_active'
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      createdBy: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'created_by'
      }
    },
    {
      tableName: 'cashier_discounts',
      underscored: true,
      timestamps: true
    }
  );

  return CashierDiscount;
};

