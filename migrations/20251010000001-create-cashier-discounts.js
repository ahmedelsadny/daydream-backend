'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Create cashier_discounts table
    await queryInterface.createTable('cashier_discounts', {
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
      discount_percentage: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: false
      },
      start_date: {
        type: Sequelize.DATE,
        allowNull: false
      },
      end_date: {
        type: Sequelize.DATE,
        allowNull: false
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      created_by: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
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
    await queryInterface.addIndex('cashier_discounts', ['cashier_id']);
    await queryInterface.addIndex('cashier_discounts', ['is_active']);
    await queryInterface.addIndex('cashier_discounts', ['start_date', 'end_date']);

    // Add discount fields to orders table
    await queryInterface.addColumn('orders', 'subtotal', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true
    });

    await queryInterface.addColumn('orders', 'discount_percentage', {
      type: Sequelize.DECIMAL(5, 2),
      allowNull: true
    });

    await queryInterface.addColumn('orders', 'discount_amount', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true
    });

    await queryInterface.addColumn('orders', 'cashier_discount_id', {
      type: Sequelize.UUID,
      allowNull: true,
      references: {
        model: 'cashier_discounts',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });

    await queryInterface.addIndex('orders', ['cashier_discount_id']);
  },

  down: async (queryInterface, Sequelize) => {
    // Remove columns from orders
    await queryInterface.removeIndex('orders', ['cashier_discount_id']);
    await queryInterface.removeColumn('orders', 'cashier_discount_id');
    await queryInterface.removeColumn('orders', 'discount_amount');
    await queryInterface.removeColumn('orders', 'discount_percentage');
    await queryInterface.removeColumn('orders', 'subtotal');

    // Drop table
    await queryInterface.dropTable('cashier_discounts');
  }
};

