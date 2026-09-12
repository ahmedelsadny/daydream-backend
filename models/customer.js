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
      },
      address: {
        type: DataTypes.STRING,
        allowNull: true
      },
      creditLimit: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.00,
        field: 'credit_limit',
        comment: 'Maximum credit ceiling allowed for this customer'
      },
      currentDebt: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.00,
        field: 'current_debt',
        comment: 'Total outstanding debt owed by this customer'
      },
      isCreditAllowed: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'is_credit_allowed',
        comment: 'Flag permitting on-credit sales'
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true
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


