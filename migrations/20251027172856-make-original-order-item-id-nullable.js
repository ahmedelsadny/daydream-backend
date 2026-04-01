'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // Make original_order_item_id column nullable to support multi-item replacements
    await queryInterface.changeColumn('replacements', 'original_order_item_id', {
      type: Sequelize.UUID,
      allowNull: true,
      comment: 'Legacy field for single-item replacements. Use replacement_order_items table for multi-item replacements.'
    });
  },

  async down (queryInterface, Sequelize) {
    // Revert original_order_item_id column to not nullable
    await queryInterface.changeColumn('replacements', 'original_order_item_id', {
      type: Sequelize.UUID,
      allowNull: false,
      comment: 'ID of the order item being returned'
    });
  }
};
