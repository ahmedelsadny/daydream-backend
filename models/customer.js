module.exports = (sequelize, DataTypes) => {
  const Customer = sequelize.define(
    'Customer',
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
      phone: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
      },
      loyaltyPoints: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        field: 'loyalty_points'
      }
    },
    {
      tableName: 'customers',
      underscored: true,
      timestamps: true
    }
  );
  return Customer;
};


