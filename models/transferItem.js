module.exports = (sequelize, DataTypes) => {
  const TransferItem = sequelize.define(
    'TransferItem',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      transferId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'transfer_id',
        references: {
          model: 'transfers',
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
        type: DataTypes.INTEGER,
        allowNull: false
      },
      selectedSerials: {
        type: DataTypes.JSON,
        allowNull: true,
        field: 'selected_serials',
        comment: 'Array of serial IDs when selectSpecificSerials is true'
      }
    },
    {
      tableName: 'transfer_items',
      underscored: true,
      timestamps: true
    }
  );

  return TransferItem;
};
