'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Check if table already exists
    const tableExists = await queryInterface.tableExists('replacement_order_items');
    if (tableExists) {
      console.log('Table replacement_order_items already exists, skipping creation');
      return;
    }

    // Create junction table for replacement order items
    await queryInterface.createTable('replacement_order_items', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      replacement_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'replacements',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      order_item_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'order_items',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      returned_amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        comment: 'Amount returned for this specific order item'
      },
      quantity_returned: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: 'Quantity returned for this order item'
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      }
    });

    // Add indexes for better performance
    await queryInterface.addIndex('replacement_order_items', ['replacement_id']);
    await queryInterface.addIndex('replacement_order_items', ['order_item_id']);
    await queryInterface.addIndex('replacement_order_items', ['replacement_id', 'order_item_id'], {
      unique: true,
      name: 'unique_replacement_order_item'
    });

    // Add new fields to replacements table for backward compatibility
    const tableDescription = await queryInterface.describeTable('replacements');
    if (!tableDescription.original_order_item_id) {
      await queryInterface.addColumn('replacements', 'original_order_item_id', {
        type: Sequelize.UUID,
        allowNull: true, // Make it nullable for new multi-item replacements
        references: {
          model: 'order_items',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      });
    } else {
      // Column already exists, just modify it to be nullable
      await queryInterface.changeColumn('replacements', 'original_order_item_id', {
        type: Sequelize.UUID,
        allowNull: true,
        comment: 'Legacy field for single-item replacements. Use replacement_order_items table for multi-item replacements.'
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    // Remove the junction table
    await queryInterface.dropTable('replacement_order_items');
    
    // Remove the nullable original_order_item_id column
    await queryInterface.removeColumn('replacements', 'original_order_item_id');
  }
};
