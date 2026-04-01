module.exports = (sequelize, DataTypes) => {
  const ReplacementOrderItem = sequelize.define(
    'ReplacementOrderItem',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      replacementId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'replacement_id',
        references: {
          model: 'replacements',
          key: 'id'
        }
      },
      orderItemId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'order_item_id',
        references: {
          model: 'order_items',
          key: 'id'
        }
      },
      returnedAmount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        field: 'returned_amount',
        comment: 'Amount returned for this specific order item'
      },
      quantityReturned: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'quantity_returned',
        comment: 'Quantity returned for this order item'
      }
    },
    {
      tableName: 'replacement_order_items',
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      indexes: [
        {
          unique: true,
          fields: ['replacement_id', 'order_item_id'],
          name: 'unique_replacement_order_item'
        }
      ]
    }
  );

  // Define associations
  ReplacementOrderItem.associate = (models) => {
    ReplacementOrderItem.belongsTo(models.Replacement, {
      foreignKey: 'replacementId',
      as: 'Replacement'
    });
    
    ReplacementOrderItem.belongsTo(models.OrderItem, {
      foreignKey: 'orderItemId',
      as: 'OrderItem'
    });
  };

  return ReplacementOrderItem;
};
