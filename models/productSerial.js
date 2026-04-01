module.exports = (sequelize, DataTypes) => {
  const ProductSerial = sequelize.define(
    'ProductSerial',
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
      serialCode: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        field: 'serial_code'
      },
      note: {
        type: DataTypes.STRING,
        allowNull: true
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
      orderItemId: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'order_item_id'
      },
      isPrinted: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'is_printed'
      },
      batchId: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'batch_id'
      }
    },
    {
      tableName: 'product_serials',
      underscored: true,
      timestamps: true
    }
  );
  return ProductSerial;
};

