'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('shifts', 'total_replacements', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: 0
    });

    await queryInterface.addColumn('shifts', 'replacement_count', {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: 0
    });

    await queryInterface.addColumn('shifts', 'total_replacement_refunds', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: 0
    });

    await queryInterface.addColumn('shifts', 'total_replacement_payments', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: 0
    });

    await queryInterface.addColumn('shifts', 'products_replaced', {
      type: Sequelize.JSON,
      allowNull: true,
      comment: 'Array of {productId, productName, sku, quantity, returnedAmount, newItemsAmount, priceDifference}'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('shifts', 'total_replacements');
    await queryInterface.removeColumn('shifts', 'replacement_count');
    await queryInterface.removeColumn('shifts', 'total_replacement_refunds');
    await queryInterface.removeColumn('shifts', 'total_replacement_payments');
    await queryInterface.removeColumn('shifts', 'products_replaced');
  }
};
