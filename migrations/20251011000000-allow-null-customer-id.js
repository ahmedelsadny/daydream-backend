'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn('orders', 'customer_id', {
      type: Sequelize.UUID,
      allowNull: true,  // Allow NULL for walk-in customers
      references: {
        model: 'customers',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });

    console.log('✅ Successfully modified customer_id column to allow NULL values');
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn('orders', 'customer_id', {
      type: Sequelize.UUID,
      allowNull: false,  // Revert back to NOT NULL
      references: {
        model: 'customers',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    });

    console.log('✅ Successfully reverted customer_id column to NOT NULL');
  }
};
