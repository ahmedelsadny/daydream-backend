module.exports = (sequelize, DataTypes) => {
  const Inventory = sequelize.define(
    'Inventory',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      productId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'product_id'
      },
      warehouseId: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'warehouse_id'
      },
      branchId: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'branch_id'
      },
      quantity: {
        type: DataTypes.INTEGER,
        allowNull: false
      }
    },
    {
      tableName: 'inventory',
      underscored: true,
      timestamps: true,
      updatedAt: 'updated_at',
      createdAt: false
    }
  );
  return Inventory;
};


