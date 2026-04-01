'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('orders', 'bulk_discount_percentage', {
      type: Sequelize.DECIMAL(5, 2),
      allowNull: true,
      defaultValue: null
    });

    await queryInterface.addColumn('orders', 'bulk_discount_amount', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: null
    });

    await queryInterface.addColumn('orders', 'original_item_count', {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: null
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('orders', 'bulk_discount_percentage');
    await queryInterface.removeColumn('orders', 'bulk_discount_amount');
    await queryInterface.removeColumn('orders', 'original_item_count');
  }
};
