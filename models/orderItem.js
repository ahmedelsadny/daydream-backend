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
        type: DataTypes.INTEGER,
        allowNull: false
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


