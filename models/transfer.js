module.exports = (sequelize, DataTypes) => {
  const Transfer = sequelize.define(
    'Transfer',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      productId: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'product_id'
      },
      quantity: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      selectSpecificSerials: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'select_specific_serials'
      },
      fromLocationType: {
        type: DataTypes.ENUM('warehouse', 'branch'),
        allowNull: false,
        field: 'from_location_type'
      },
      fromLocationId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'from_location_id'
      },
      toLocationType: {
        type: DataTypes.ENUM('warehouse', 'branch'),
        allowNull: false,
        field: 'to_location_type'
      },
      toLocationId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'to_location_id'
      },
      status: {
        type: DataTypes.ENUM('pending', 'completed', 'cancelled'),
        allowNull: false,
        defaultValue: 'pending'
      },
      requestedBy: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'requested_by'
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true
      }
    },
    {
      tableName: 'transfers',
      underscored: true,
      timestamps: true
    }
  );
  return Transfer;
};
