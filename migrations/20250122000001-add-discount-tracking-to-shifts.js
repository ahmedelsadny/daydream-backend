'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add discount tracking fields to shifts table
    await queryInterface.addColumn('shifts', 'total_discounts', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: 0,
      comment: 'Total discounts applied during the shift'
    });

    await queryInterface.addColumn('shifts', 'total_subtotal', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: 0,
      comment: 'Total subtotal before discounts during the shift'
    });

    await queryInterface.addColumn('shifts', 'refund_discounts', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: 0,
      comment: 'Total discounts applied to refunds during the shift'
    });

    await queryInterface.addColumn('shifts', 'refund_subtotal', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: 0,
      comment: 'Total refund subtotal before discounts during the shift'
    });

    await queryInterface.addColumn('shifts', 'replacement_discounts', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: 0,
      comment: 'Total discounts applied to replacements during the shift'
    });

    await queryInterface.addColumn('shifts', 'replacement_subtotal', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: 0,
      comment: 'Total replacement subtotal before discounts during the shift'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('shifts', 'total_discounts');
    await queryInterface.removeColumn('shifts', 'total_subtotal');
    await queryInterface.removeColumn('shifts', 'refund_discounts');
    await queryInterface.removeColumn('shifts', 'refund_subtotal');
    await queryInterface.removeColumn('shifts', 'replacement_discounts');
    await queryInterface.removeColumn('shifts', 'replacement_subtotal');
  }
};
