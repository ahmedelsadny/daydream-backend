'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('receipt_settings', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      logoUrl: {
        type: Sequelize.STRING(500),
        allowNull: true,
        defaultValue: '',
        comment: 'URL of the shop logo for receipts'
      },
      logoWidth: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 150,
        comment: 'Width of the logo in pixels'
      },
      shopName: {
        type: Sequelize.STRING(255),
        allowNull: false,
        defaultValue: 'Your Shop Name',
        comment: 'Name of the shop/business'
      },
      address: {
        type: Sequelize.TEXT,
        allowNull: true,
        defaultValue: 'Your Shop Address',
        comment: 'Shop address'
      },
      telephone: {
        type: Sequelize.STRING(50),
        allowNull: true,
        defaultValue: 'Your Phone Number',
        comment: 'Shop phone number'
      },
      receiptTitle: {
        type: Sequelize.STRING(100),
        allowNull: false,
        defaultValue: 'RECEIPT',
        comment: 'Title displayed on receipts'
      },
      thankYouMessage: {
        type: Sequelize.STRING(255),
        allowNull: false,
        defaultValue: 'Thank you for your business!',
        comment: 'Thank you message on receipts'
      },
      policiesAndTerms: {
        type: Sequelize.TEXT,
        allowNull: true,
        defaultValue: '',
        comment: 'Policies and terms text for receipts'
      },
      policiesFontSize: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 10,
        comment: 'Font size for policies text in pixels'
      },
      cashLabel: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: 'Cash',
        comment: 'Label for cash payment method'
      },
      changeLabel: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: 'Change',
        comment: 'Label for change amount'
      },
      cardLabel: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: 'Bank Card',
        comment: 'Label for card payment method'
      },
      approvalCodeLabel: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: 'Approval Code',
        comment: 'Label for card approval code'
      },
      discountLabel: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: 'Discount',
        comment: 'Label for discount amount'
      },
      subtotalLabel: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: 'Subtotal',
        comment: 'Label for subtotal amount'
      },
      discountFormat: {
        type: Sequelize.ENUM('percentage', 'amount'),
        allowNull: false,
        defaultValue: 'percentage',
        comment: 'How discount is displayed on receipt'
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Insert default settings
    await queryInterface.bulkInsert('receipt_settings', [{
      id: 1,
      logoUrl: '',
      logoWidth: 150,
      shopName: 'Your Shop Name',
      address: 'Your Shop Address',
      telephone: 'Your Phone Number',
      receiptTitle: 'RECEIPT',
      thankYouMessage: 'Thank you for your business!',
      policiesAndTerms: '',
      policiesFontSize: 10,
      cashLabel: 'Cash',
      changeLabel: 'Change',
      cardLabel: 'Bank Card',
      approvalCodeLabel: 'Approval Code',
      discountLabel: 'Discount',
      subtotalLabel: 'Subtotal',
      discountFormat: 'percentage',
      createdAt: new Date(),
      updatedAt: new Date()
    }]);

    console.log('✅ Successfully created receipt_settings table with default data');
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('receipt_settings');
    console.log('✅ Successfully dropped receipt_settings table');
  }
};
