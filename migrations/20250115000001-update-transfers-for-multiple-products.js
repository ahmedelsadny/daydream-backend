'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add new fields to transfers table
    await queryInterface.addColumn('transfers', 'select_specific_serials', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Flag to indicate if specific serials should be selected'
    });

    // Make product_id nullable to support multiple products
    await queryInterface.changeColumn('transfers', 'product_id', {
      type: Sequelize.UUID,
      allowNull: true,
      field: 'product_id'
    });

    // Make quantity nullable for multiple products (quantity will be in transfer_items)
    await queryInterface.changeColumn('transfers', 'quantity', {
      type: Sequelize.INTEGER,
      allowNull: true,
      field: 'quantity'
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Remove the new column
    await queryInterface.removeColumn('transfers', 'select_specific_serials');

    // Revert product_id to not null
    await queryInterface.changeColumn('transfers', 'product_id', {
      type: Sequelize.UUID,
      allowNull: false,
      field: 'product_id'
    });

    // Revert quantity to not null
    await queryInterface.changeColumn('transfers', 'quantity', {
      type: Sequelize.INTEGER,
      allowNull: false,
      field: 'quantity'
    });
  }
};
