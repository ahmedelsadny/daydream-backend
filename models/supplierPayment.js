module.exports = (sequelize, DataTypes) => {
  const SupplierPayment = sequelize.define(
    'SupplierPayment',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      supplierId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'supplier_id',
        references: {
          model: 'suppliers',
          key: 'id'
        }
      },
      branchId: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'branch_id',
        references: {
          model: 'branches',
          key: 'id'
        }
      },
      amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false
      },
      paymentMethod: {
        type: DataTypes.ENUM('cash', 'bank_transfer', 'check', 'other'),
        allowNull: false,
        defaultValue: 'cash',
        field: 'payment_method'
      },
      referenceNumber: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'reference_number',
        comment: 'Check number, transfer reference or receipt number'
      },
      paymentDate: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        field: 'payment_date'
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      recordedBy: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'recorded_by',
        references: {
          model: 'users',
          key: 'id'
        }
      }
    },
    {
      tableName: 'supplier_payments',
      underscored: true,
      timestamps: true
    }
  );

  return SupplierPayment;
};
