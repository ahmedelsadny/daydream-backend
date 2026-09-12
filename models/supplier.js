module.exports = (sequelize, DataTypes) => {
  const Supplier = sequelize.define(
    'Supplier',
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
      companyName: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'company_name'
      },
      contactPerson: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'contact_person'
      },
      phone: {
        type: DataTypes.STRING,
        allowNull: true
      },
      email: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          isEmail: true
        }
      },
      taxNumber: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'tax_number'
      },
      address: {
        type: DataTypes.STRING,
        allowNull: true
      },
      paymentTerms: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: 'cash',
        field: 'payment_terms'
      },
      currentBalance: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0.00,
        field: 'current_balance',
        comment: 'Current balance owed to supplier (positive means payable)'
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        field: 'is_active'
      }
    },
    {
      tableName: 'suppliers',
      underscored: true,
      timestamps: true
    }
  );

  return Supplier;
};
