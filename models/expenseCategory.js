module.exports = (sequelize, DataTypes) => {
  const ExpenseCategory = sequelize.define(
    'ExpenseCategory',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      isSystem: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'is_system',
        comment: 'If true, category is protected and cannot be deleted'
      }
    },
    {
      tableName: 'expense_categories',
      underscored: true,
      timestamps: true
    }
  );

  return ExpenseCategory;
};
