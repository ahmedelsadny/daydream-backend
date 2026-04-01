'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('orders', 'amount_paid', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      comment: 'The actual amount paid by the customer'
    });

    await queryInterface.addColumn('orders', 'change_amount', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      comment: 'The change amount to be returned to the customer (amount_paid - total_price)'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('orders', 'amount_paid');
    await queryInterface.removeColumn('orders', 'change_amount');
  }
};
