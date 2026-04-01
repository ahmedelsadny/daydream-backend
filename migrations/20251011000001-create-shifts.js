'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('shifts', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      cashier_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      branch_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'branches',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      start_time: {
        type: Sequelize.DATE,
        allowNull: false
      },
      end_time: {
        type: Sequelize.DATE,
        allowNull: true
      },
      status: {
        type: Sequelize.ENUM('active', 'completed'),
        allowNull: false,
        defaultValue: 'active'
      },
      total_sales: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0
      },
      total_orders: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0
      },
      cash_sales: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0
      },
      visa_sales: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0
      },
      products_sold: {
        type: Sequelize.JSON,
        allowNull: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });

    // Add indexes
    await queryInterface.addIndex('shifts', ['cashier_id']);
    await queryInterface.addIndex('shifts', ['branch_id']);
    await queryInterface.addIndex('shifts', ['status']);
    await queryInterface.addIndex('shifts', ['start_time']);
    await queryInterface.addIndex('shifts', ['created_at']);
    
    // Add composite index for finding active shifts by cashier
    await queryInterface.addIndex('shifts', ['cashier_id', 'status']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('shifts');
  }
};
