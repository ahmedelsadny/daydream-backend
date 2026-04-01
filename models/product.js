module.exports = (sequelize, DataTypes) => {
  const Product = sequelize.define(
    'Product',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false
      },
      sku: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
      },
      barcode: {
        type: DataTypes.STRING,
        allowNull: true,
        unique: true
      },
      price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false
      },
      cost: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true
      },
      currency: {
        type: DataTypes.STRING(3),
        allowNull: true
      },
      categoryId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'category_id'
      },
      subCategoryId: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'sub_category_id'
      },
      itemName: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'item_name'
      },
      size: {
        type: DataTypes.STRING,
        allowNull: true
      },
      shoeSize: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'shoe_size'
      },
      color: {
        type: DataTypes.STRING,
        allowNull: true
      },
      gender: {
        type: DataTypes.STRING,
        allowNull: true
      },
      isPrinted: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'is_printed'
      }
    },
    {
      tableName: 'products',
      underscored: true,
      timestamps: true
    }
  );
  return Product;
};


