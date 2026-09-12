module.exports = (sequelize, DataTypes) => {
  const Promotion = sequelize.define(
    'Promotion',
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
      type: {
        type: DataTypes.ENUM('buy_x_get_y', 'percentage', 'fixed_amount', 'bundle_price'),
        allowNull: false,
        defaultValue: 'buy_x_get_y',
        comment: 'Type of promotion algorithm'
      },
      scope: {
        type: DataTypes.ENUM('product', 'category', 'cart_total'),
        allowNull: false,
        defaultValue: 'product'
      },
      targetProductId: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'target_product_id',
        references: {
          model: 'products',
          key: 'id'
        }
      },
      targetCategoryId: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'target_category_id',
        references: {
          model: 'categories',
          key: 'id'
        }
      },
      buyQuantity: {
        type: DataTypes.DECIMAL(10, 3),
        allowNull: true,
        defaultValue: 1.000,
        field: 'buy_quantity',
        comment: 'Quantity customer must buy to qualify (e.g. 2 in Buy 2 Get 1)'
      },
      getQuantity: {
        type: DataTypes.DECIMAL(10, 3),
        allowNull: true,
        defaultValue: 1.000,
        field: 'get_quantity',
        comment: 'Quantity customer gets for free or discounted (e.g. 1 in Buy 2 Get 1)'
      },
      discountPercentage: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: true,
        field: 'discount_percentage'
      },
      discountAmount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        field: 'discount_amount'
      },
      bundlePrice: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        field: 'bundle_price',
        comment: 'Special fixed bundle price (e.g. 3 for 50 EGP)'
      },
      minOrderAmount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0.00,
        field: 'min_order_amount'
      },
      startDate: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'start_date'
      },
      endDate: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'end_date'
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        field: 'is_active'
      },
      branchId: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'branch_id',
        references: {
          model: 'branches',
          key: 'id'
        },
        comment: 'If set, offer applies only to this branch; null means all branches'
      },
      priority: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      }
    },
    {
      tableName: 'promotions',
      underscored: true,
      timestamps: true
    }
  );

  return Promotion;
};
