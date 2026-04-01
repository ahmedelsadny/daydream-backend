module.exports = (sequelize, DataTypes) => {
  const SubCategory = sequelize.define(
    'SubCategory',
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
      categoryId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'category_id'
      }
    },
    {
      tableName: 'sub_categories',
      underscored: true,
      timestamps: true
    }
  );
  return SubCategory;
};


