'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('replacements', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      original_order_item_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'order_items',
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
      new_order_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'orders',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      customer_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'customers',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      returned_amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false
      },
      new_items_amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false
      },
      price_difference: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false
      },
      refund_to_customer: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.00
      },
      customer_payment: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.00
      },
      payment_method: {
        type: Sequelize.ENUM('cash', 'visa', 'mixed', 'none'),
        allowNull: false
      },
      cash_amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true
      },
      visa_amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true
      },
      transaction_log: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      processed_by: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      reason: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      status: {
        type: Sequelize.ENUM('completed', 'cancelled'),
        allowNull: false,
        defaultValue: 'completed'
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

    // Add indexes for better query performance
    await queryInterface.addIndex('replacements', ['branch_id']);
    await queryInterface.addIndex('replacements', ['customer_id']);
    await queryInterface.addIndex('replacements', ['new_order_id']);
    await queryInterface.addIndex('replacements', ['created_at']);
    await queryInterface.addIndex('replacements', ['status']);
    await queryInterface.addIndex('replacements', ['refund_to_customer']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('replacements');
  }
};

