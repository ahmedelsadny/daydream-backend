module.exports = (sequelize, DataTypes) => {
  const DamagedItem = sequelize.define(
    'DamagedItem',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
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
      warehouseId: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'warehouse_id',
        references: {
          model: 'warehouses',
          key: 'id'
        }
      },
      productId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'product_id',
        references: {
          model: 'products',
          key: 'id'
        }
      },
      quantity: {
        type: DataTypes.DECIMAL(10, 3),
        allowNull: false,
        comment: 'Damaged or expired quantity deducted from inventory'
      },
      unitCost: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.00,
        field: 'unit_cost'
      },
      totalLossValue: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0.00,
        field: 'total_loss_value',
        comment: 'quantity * unitCost'
      },
      reason: {
        type: DataTypes.ENUM(
          'expired',
          'broken_packaging',
          'spoiled',
          'theft_loss',
          'shipping_damage',
          'other'
        ),
        allowNull: false,
        defaultValue: 'expired'
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      reportedBy: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'reported_by',
        references: {
          model: 'users',
          key: 'id'
        }
      },
      approvedBy: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'approved_by',
        references: {
          model: 'users',
          key: 'id'
        },
        comment: 'Supervisor who authorized stock disposal'
      }
    },
    {
      tableName: 'damaged_items',
      underscored: true,
      timestamps: true
    }
  );

  return DamagedItem;
};
