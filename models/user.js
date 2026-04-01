module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define(
    'User',
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
      email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        validate: { isEmail: true }
      },
      passwordHash: {
        type: DataTypes.STRING,
        allowNull: false,
        field: 'password_hash'
      },
      role: {
        type: DataTypes.ENUM('admin', 'branch_manager', 'cashier', 'stock_keeper'),
        allowNull: false
      },
      branchId: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'branch_id'
      },
      warehouseId: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'warehouse_id'
      }
    },
    {
      tableName: 'users',
      underscored: true,
      timestamps: true
    }
  );
  return User;
};


