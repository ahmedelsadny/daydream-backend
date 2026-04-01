'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('transfer_items', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      transfer_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'transfers',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      product_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'products',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      quantity: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      selected_serials: {
        type: Sequelize.JSON,
        allowNull: true,
        comment: 'Array of serial IDs when selectSpecificSerials is true'
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

    // Add index for better performance
    await queryInterface.addIndex('transfer_items', ['transfer_id']);
    await queryInterface.addIndex('transfer_items', ['product_id']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('transfer_items');
  }
};
