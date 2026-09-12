module.exports = (sequelize, DataTypes) => {
  const PurchaseInvoice = sequelize.define(
    'PurchaseInvoice',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      invoiceNumber: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        field: 'invoice_number'
      },
      supplierInvoiceNumber: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'supplier_invoice_number',
        comment: 'Official bill number from supplier'
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
      warehouseId: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'warehouse_id',
        references: {
          model: 'warehouses',
          key: 'id'
        }
      },
      invoiceDate: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        field: 'invoice_date'
      },
      dueDate: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'due_date'
      },
      status: {
        type: DataTypes.ENUM('draft', 'received', 'partially_paid', 'paid', 'cancelled'),
        allowNull: false,
        defaultValue: 'draft'
      },
      subtotal: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0.00
      },
      taxAmount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.00,
        field: 'tax_amount'
      },
      discountAmount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.00,
        field: 'discount_amount'
      },
      totalAmount: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0.00,
        field: 'total_amount'
      },
      paidAmount: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0.00,
        field: 'paid_amount'
      },
      remainingAmount: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0.00,
        field: 'remaining_amount'
      },
      paymentStatus: {
        type: DataTypes.ENUM('unpaid', 'partially_paid', 'paid'),
        allowNull: false,
        defaultValue: 'unpaid',
        field: 'payment_status'
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      receivedBy: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'received_by',
        references: {
          model: 'users',
          key: 'id'
        }
      },
      receivedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'received_at'
      }
    },
    {
      tableName: 'purchase_invoices',
      underscored: true,
      timestamps: true
    }
  );

  return PurchaseInvoice;
};
