module.exports = (sequelize, DataTypes) => {
  const Refund = sequelize.define(
    'Refund',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      orderItemId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'order_item_id'
      },
      branchId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'branch_id'
      },
      quantity: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      status: {
        type: DataTypes.ENUM('pending', 'approved', 'rejected'),
        allowNull: false,
        defaultValue: 'approved'
      },
      refundAmount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        field: 'refund_amount'
      },
      requestedBy: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'requested_by'
      },
      reason: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      approvedBy: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'approved_by'
      }
    },
    {
      tableName: 'refunds',
      underscored: true,
      timestamps: true
    }
  );
  return Refund;
};


