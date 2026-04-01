module.exports = (sequelize, DataTypes) => {
  const Warehouse = sequelize.define(
    'Warehouse',
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
      location: {
        type: DataTypes.STRING,
        allowNull: false
      },
      type: {
        type: DataTypes.ENUM('central', 'stock'),
        allowNull: false
      }
    },
    {
      tableName: 'warehouses',
      underscored: true,
      timestamps: true
    }
  );
  return Warehouse;
};


