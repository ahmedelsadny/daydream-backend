module.exports = (sequelize, DataTypes) => {
  const Stocktake = sequelize.define(
    'Stocktake',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      sessionNumber: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        field: 'session_number'
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
      status: {
        type: DataTypes.ENUM('in_progress', 'completed', 'cancelled'),
        allowNull: false,
        defaultValue: 'in_progress'
      },
      totalExpectedQty: {
        type: DataTypes.DECIMAL(12, 3),
        allowNull: false,
        defaultValue: 0.000,
        field: 'total_expected_qty'
      },
      totalCountedQty: {
        type: DataTypes.DECIMAL(12, 3),
        allowNull: false,
        defaultValue: 0.000,
        field: 'total_counted_qty'
      },
      totalVarianceQty: {
        type: DataTypes.DECIMAL(12, 3),
        allowNull: false,
        defaultValue: 0.000,
        field: 'total_variance_qty',
        comment: 'Difference in quantity (positive means surplus, negative means shortage)'
      },
      totalVarianceValue: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0.00,
        field: 'total_variance_value',
        comment: 'Net monetary variance based on cost'
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      startedBy: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'started_by',
        references: {
          model: 'users',
          key: 'id'
        }
      },
      completedBy: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'completed_by',
        references: {
          model: 'users',
          key: 'id'
        }
      }
    },
    {
      tableName: 'stocktakes',
      underscored: true,
      timestamps: true
    }
  );

  return Stocktake;
};
