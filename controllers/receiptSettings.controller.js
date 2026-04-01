const express = require('express');
const { ReceiptSettings } = require('../models');
const auth = require('../middleware/auth');
const { allowRoles, ROLES } = require('../middleware/roles');

const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     ReceiptSettings:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *           description: Unique identifier
 *         logoUrl:
 *           type: string
 *           description: URL of the shop logo
 *         logoWidth:
 *           type: integer
 *           description: Width of the logo in pixels
 *         shopName:
 *           type: string
 *           description: Name of the shop/business
 *         address:
 *           type: string
 *           description: Shop address
 *         telephone:
 *           type: string
 *           description: Shop phone number
 *         receiptTitle:
 *           type: string
 *           description: Title displayed on receipts
 *         thankYouMessage:
 *           type: string
 *           description: Thank you message on receipts
 *         policiesAndTerms:
 *           type: string
 *           description: Policies and terms text
 *         policiesFontSize:
 *           type: integer
 *           description: Font size for policies text
 *         cashLabel:
 *           type: string
 *           description: Label for cash payment
 *         changeLabel:
 *           type: string
 *           description: Label for change amount
 *         cardLabel:
 *           type: string
 *           description: Label for card payment
 *         approvalCodeLabel:
 *           type: string
 *           description: Label for approval code
 *         discountLabel:
 *           type: string
 *           description: Label for discount
 *         subtotalLabel:
 *           type: string
 *           description: Label for subtotal
 *         discountFormat:
 *           type: string
 *           enum: [percentage, amount]
 *           description: How discount is displayed
 */

/**
 * @swagger
 * /api/v1/receipt-settings:
 *   get:
 *     summary: Get receipt settings
 *     tags: [Receipt Settings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Receipt settings retrieved successfully
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get(
  '/',
  auth,
  allowRoles(ROLES.ADMIN, ROLES.BRANCH_MANAGER, ROLES.CASHIER),
  async (req, res) => {
    try {
      let settings = await ReceiptSettings.findOne({ where: { id: 1 } });

      if (!settings) {
        settings = await ReceiptSettings.create({
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
          discountFormat: 'percentage'
        });
      }

      return res.json({ success: true, data: settings });
    } catch (error) {
      console.error('Error fetching receipt settings:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * @swagger
 * /api/v1/receipt-settings/public:
 *   get:
 *     summary: Get public receipt settings (no auth required)
 *     tags: [Receipt Settings]
 */
router.get('/public', async (req, res) => {
  try {
    let settings = await ReceiptSettings.findOne({ where: { id: 1 } });

    if (!settings) {
      settings = {
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
        discountFormat: 'percentage'
      };
    }

    return res.json({ success: true, data: settings });
  } catch (error) {
    console.error('Error fetching public receipt settings:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @swagger
 * /api/v1/receipt-settings:
 *   put:
 *     summary: Update receipt settings
 *     tags: [Receipt Settings]
 *     security:
 *       - bearerAuth: []
 */
router.put('/', auth, allowRoles(ROLES.ADMIN, ROLES.BRANCH_MANAGER), async (req, res) => {
  try {
    const {
      logoUrl,
      logoWidth,
      shopName,
      address,
      telephone,
      receiptTitle,
      thankYouMessage,
      policiesAndTerms,
      policiesFontSize,
      cashLabel,
      changeLabel,
      cardLabel,
      approvalCodeLabel,
      discountLabel,
      subtotalLabel,
      discountFormat
    } = req.body;

    // Validation
    if (discountFormat && !['percentage', 'amount'].includes(discountFormat)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid discountFormat. Must be "percentage" or "amount"'
      });
    }

    if (
      policiesFontSize &&
      (typeof policiesFontSize !== 'number' || policiesFontSize < 8 || policiesFontSize > 24)
    ) {
      return res.status(400).json({
        success: false,
        message: 'Invalid policiesFontSize. Must be a number between 8 and 24'
      });
    }

    if (logoWidth && (typeof logoWidth !== 'number' || logoWidth < 50 || logoWidth > 500)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid logoWidth. Must be a number between 50 and 500'
      });
    }

    // Update
    let settings = await ReceiptSettings.findOne({ where: { id: 1 } });

    if (!settings) {
      settings = await ReceiptSettings.create({
        id: 1,
        logoUrl: logoUrl || '',
        logoWidth: logoWidth || 150,
        shopName: shopName || 'Your Shop Name',
        address: address || 'Your Shop Address',
        telephone: telephone || 'Your Phone Number',
        receiptTitle: receiptTitle || 'RECEIPT',
        thankYouMessage: thankYouMessage || 'Thank you for your business!',
        policiesAndTerms: policiesAndTerms || '',
        policiesFontSize: policiesFontSize || 10,
        cashLabel: cashLabel || 'Cash',
        changeLabel: changeLabel || 'Change',
        cardLabel: cardLabel || 'Bank Card',
        approvalCodeLabel: approvalCodeLabel || 'Approval Code',
        discountLabel: discountLabel || 'Discount',
        subtotalLabel: subtotalLabel || 'Subtotal',
        discountFormat: discountFormat || 'percentage'
      });
    } else {
      await settings.update({
        logoUrl: logoUrl ?? settings.logoUrl,
        logoWidth: logoWidth ?? settings.logoWidth,
        shopName: shopName ?? settings.shopName,
        address: address ?? settings.address,
        telephone: telephone ?? settings.telephone,
        receiptTitle: receiptTitle ?? settings.receiptTitle,
        thankYouMessage: thankYouMessage ?? settings.thankYouMessage,
        policiesAndTerms: policiesAndTerms ?? settings.policiesAndTerms,
        policiesFontSize: policiesFontSize ?? settings.policiesFontSize,
        cashLabel: cashLabel ?? settings.cashLabel,
        changeLabel: changeLabel ?? settings.changeLabel,
        cardLabel: cardLabel ?? settings.cardLabel,
        approvalCodeLabel: approvalCodeLabel ?? settings.approvalCodeLabel,
        discountLabel: discountLabel ?? settings.discountLabel,
        subtotalLabel: subtotalLabel ?? settings.subtotalLabel,
        discountFormat: discountFormat ?? settings.discountFormat
      });
    }

    return res.json({
      success: true,
      message: 'Receipt settings updated successfully',
      data: settings
    });
  } catch (error) {
    console.error('Error updating receipt settings:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;
