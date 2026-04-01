'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Check for duplicate barcodes before adding constraint
    const [duplicates] = await queryInterface.sequelize.query(`
      SELECT barcode, COUNT(*) as count
      FROM products
      WHERE barcode IS NOT NULL
      GROUP BY barcode
      HAVING COUNT(*) > 1
    `);
    
    if (duplicates.length > 0) {
      console.error('Found duplicate barcodes:');
      duplicates.forEach(dup => {
        console.error(`  Barcode ${dup.barcode}: ${dup.count} occurrences`);
      });
      throw new Error('Cannot add unique constraint: duplicate barcodes exist. Please fix duplicates manually first.');
    }
    
    // Add unique constraint to barcode field
    await queryInterface.addConstraint('products', {
      fields: ['barcode'],
      type: 'unique',
      name: 'products_barcode_unique'
    });
  },

  async down(queryInterface, Sequelize) {
    // Remove the unique constraint
    await queryInterface.removeConstraint('products', 'products_barcode_unique');
  }
};

