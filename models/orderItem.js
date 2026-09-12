module.exports = (sequelize, DataTypes) => {
  const OrderItem = sequelize.define(
    'OrderItem',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      orderId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'order_id'
      },
      productId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'product_id'
      },
      quantity: {
        type: DataTypes.DECIMAL(10, 3),
        allowNull: false
      },
      unitPrice: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.00,
        field: 'unit_price'
      },
      costPrice: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        field: 'cost_price'
      },
      totalPrice: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.00,
        field: 'total_price'
      }
    },
    {
      tableName: 'order_items',
      underscored: true,
      timestamps: true
    }
  );
  return OrderItem;
};


