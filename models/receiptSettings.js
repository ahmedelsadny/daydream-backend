'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ReceiptSettings extends Model {
    /**
     * Associations (none for this model — singleton table)
     */
    static associate(models) {
      // No associations needed
    }

    /**
     * Get the current (singleton) receipt settings
     */
    static async getCurrent() {
      let settings = await this.findOne();
      if (!settings) {
        settings = await this.create({
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
          discountFormat: 'percentage'
        });
      }
      return settings;
    }

    /**
     * Update the singleton receipt settings
     */
    static async updateCurrent(updates) {
      let settings = await this.findOne();
      if (!settings) {
        settings = await this.create(updates);
      } else {
        await settings.update(updates);
      }
      return settings;
    }
  }

  ReceiptSettings.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    logoUrl: {
      type: DataTypes.STRING(500),
      allowNull: true,
      defaultValue: '',
      comment: 'URL of the shop logo for receipts'
    },
    logoWidth: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 150,
      comment: 'Width of the logo in pixels'
    },
    shopName: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: 'Your Shop Name',
      comment: 'Name of the shop/business'
    },
    address: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: 'Your Shop Address',
      comment: 'Shop address'
    },
    telephone: {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: 'Your Phone Number',
      comment: 'Shop phone number'
    },
    receiptTitle: {
      type: DataTypes.STRING(100),
      allowNull: false,
      defaultValue: 'RECEIPT',
      comment: 'Title displayed on receipts'
    },
    thankYouMessage: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: 'Thank you for your business!',
      comment: 'Thank you message on receipts'
    },
    policiesAndTerms: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: '',
      comment: 'Policies and terms text for receipts'
    },
    policiesFontSize: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 10,
      comment: 'Font size for policies text in pixels'
    },
    cashLabel: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'Cash',
      comment: 'Label for cash payment method'
    },
    changeLabel: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'Change',
      comment: 'Label for change amount'
    },
    cardLabel: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'Bank Card',
      comment: 'Label for card payment method'
    },
    approvalCodeLabel: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'Approval Code',
      comment: 'Label for card approval code'
    },
    discountLabel: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'Discount',
      comment: 'Label for discount amount'
    },
    subtotalLabel: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'Subtotal',
      comment: 'Label for subtotal amount'
    },
    discountFormat: {
      type: DataTypes.ENUM('percentage', 'amount', 'both'),
      allowNull: false,
      defaultValue: 'percentage',
      comment: 'How discount is displayed on receipt'
    }
  }, {
    sequelize,
    modelName: 'ReceiptSettings',
    tableName: 'receipt_settings',
    timestamps: true,
    freezeTableName: true,
    underscored: false
  });

  return ReceiptSettings;
};
