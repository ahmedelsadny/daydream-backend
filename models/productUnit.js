module.exports = (sequelize, DataTypes) => {
  const ProductUnit = sequelize.define(
    'ProductUnit',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
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
      unitName: {
        type: DataTypes.STRING,
        allowNull: false,
        field: 'unit_name',
        comment: 'e.g. carton, pack, shrink, box, dozen'
      },
      barcode: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        comment: 'Unique barcode printed on the carton or packaging'
      },
      conversionFactor: {
        type: DataTypes.DECIMAL(10, 3),
        allowNull: false,
        defaultValue: 1.000,
        field: 'conversion_factor',
        comment: 'How many base units are in this package (e.g. 24 pieces per carton)'
      },
      sellingPrice: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        field: 'selling_price',
        comment: 'Special selling price for this bulk packaging unit'
      },
      costPrice: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        field: 'cost_price',
        comment: 'Optional purchase cost for this packaging unit'
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        field: 'is_active'
      }
    },
    {
      tableName: 'product_units',
      underscored: true,
      timestamps: true
    }
  );

  return ProductUnit;
};
