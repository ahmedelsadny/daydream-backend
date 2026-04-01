'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('product_serials', 'is_printed', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Tracks if this serial barcode has been printed'
    });
    
    await queryInterface.addColumn('product_serials', 'batch_id', {
      type: Sequelize.UUID,
      allowNull: true,
      comment: 'Groups serials created together (for tracking original vs. added serials)'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('product_serials', 'is_printed');
    await queryInterface.removeColumn('product_serials', 'batch_id');
  }
};
