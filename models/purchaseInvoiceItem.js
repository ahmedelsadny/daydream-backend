module.exports = (sequelize, DataTypes) => {
  const PurchaseInvoiceItem = sequelize.define(
    'PurchaseInvoiceItem',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      purchaseInvoiceId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'purchase_invoice_id',
        references: {
          model: 'purchase_invoices',
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
        comment: 'Received quantity (units or kg/grams)'
      },
      unitCost: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        field: 'unit_cost',
        comment: 'Unit cost in this purchase order'
      },
      totalCost: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        field: 'total_cost'
      },
      newSellingPrice: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        field: 'new_selling_price',
        comment: 'Updated retail shelf price if changed'
      },
      expiryDate: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'expiry_date'
      },
      batchNumber: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'batch_number'
      }
    },
    {
      tableName: 'purchase_invoice_items',
      underscored: true,
      timestamps: true
    }
  );

  return PurchaseInvoiceItem;
};
