module.exports = (sequelize, DataTypes) => {
  const Branch = sequelize.define(
    'Branch',
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
      warehouseId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'warehouse_id'
      }
    },
    {
      tableName: 'branches',
      underscored: true,
      timestamps: true
    }
  );
  return Branch;
};


