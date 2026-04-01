'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('shifts', 'total_refunds', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: 0
    });

    await queryInterface.addColumn('shifts', 'refund_count', {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: 0
    });

    await queryInterface.addColumn('shifts', 'net_sales', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: 0
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('shifts', 'total_refunds');
    await queryInterface.removeColumn('shifts', 'refund_count');
    await queryInterface.removeColumn('shifts', 'net_sales');
  }
};
