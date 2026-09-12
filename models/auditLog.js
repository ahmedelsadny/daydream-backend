module.exports = (sequelize, DataTypes) => {
  const AuditLog = sequelize.define(
    'AuditLog',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'user_id',
        references: {
          model: 'users',
          key: 'id'
        }
      },
      userName: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'user_name'
      },
      userRole: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'user_role'
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
      action: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: 'Action code: ORDER_VOID, ITEM_VOID, PRICE_CHANGE, INVENTORY_ADJUST, DRAWER_KICK, EXPENSE_CREATE, etc.'
      },
      entityType: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'entity_type',
        comment: 'Target entity type: Order, Product, Inventory, Expense, Shift'
      },
      entityId: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'entity_id',
        comment: 'UUID or code of the modified record'
      },
      oldValues: {
        type: DataTypes.JSON,
        allowNull: true,
        field: 'old_values'
      },
      newValues: {
        type: DataTypes.JSON,
        allowNull: true,
        field: 'new_values'
      },
      reason: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      supervisorId: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'supervisor_id',
        references: {
          model: 'users',
          key: 'id'
        },
        comment: 'Supervisor who authorized the action via PIN'
      },
      ipAddress: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'ip_address'
      },
      userAgent: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'user_agent'
      }
    },
    {
      tableName: 'audit_logs',
      underscored: true,
      timestamps: true
    }
  );

  return AuditLog;
};
