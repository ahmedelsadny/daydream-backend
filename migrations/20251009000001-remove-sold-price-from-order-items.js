'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('order_items', 'sold_price');
  },
  
  down: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('order_items', 'sold_price', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.00
    });
  }
};

