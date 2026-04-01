'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('orders', 'refunded_items_count', {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: 0
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('orders', 'refunded_items_count');
  }
};
