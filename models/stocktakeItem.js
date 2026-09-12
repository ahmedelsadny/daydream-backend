module.exports = (sequelize, DataTypes) => {
  const StocktakeItem = sequelize.define(
    'StocktakeItem',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      stocktakeId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'stocktake_id',
        references: {
          model: 'stocktakes',
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
      systemQuantity: {
        type: DataTypes.DECIMAL(10, 3),
        allowNull: false,
        defaultValue: 0.000,
        field: 'system_quantity',
        comment: 'Book stock at the moment of session initiation'
      },
      countedQuantity: {
        type: DataTypes.DECIMAL(10, 3),
        allowNull: false,
        defaultValue: 0.000,
        field: 'counted_quantity',
        comment: 'Physically verified on-shelf stock'
      },
      variance: {
        type: DataTypes.DECIMAL(10, 3),
        allowNull: false,
        defaultValue: 0.000,
        comment: 'countedQuantity - systemQuantity'
      },
      unitCost: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.00,
        field: 'unit_cost'
      },
      varianceValue: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0.00,
        field: 'variance_value',
        comment: 'variance * unitCost'
      },
      notes: {
        type: DataTypes.STRING,
        allowNull: true
      }
    },
    {
      tableName: 'stocktake_items',
      underscored: true,
      timestamps: true
    }
  );

  return StocktakeItem;
};
