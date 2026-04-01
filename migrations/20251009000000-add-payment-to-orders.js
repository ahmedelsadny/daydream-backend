'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('orders', 'payment_method', {
      type: Sequelize.ENUM('cash', 'visa', 'mixed'),
      allowNull: false,
      defaultValue: 'cash'
    });
    
    await queryInterface.addColumn('orders', 'cash_amount', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true
    });
    
    await queryInterface.addColumn('orders', 'visa_amount', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true
    });
  },
  
  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('orders', 'visa_amount');
    await queryInterface.removeColumn('orders', 'cash_amount');
    await queryInterface.removeColumn('orders', 'payment_method');
  }
};

