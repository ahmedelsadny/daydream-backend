'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('shifts', 'products_refunded', {
      type: Sequelize.JSON,
      allowNull: true,
      comment: 'Array of {productId, productName, sku, quantity, refundAmount}'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('shifts', 'products_refunded');
  }
};
