'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('orders', 'discount_revoked', {
      type: Sequelize.BOOLEAN,
      allowNull: true,
      defaultValue: false
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('orders', 'discount_revoked');
  }
};
