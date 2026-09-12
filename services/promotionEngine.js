const { Promotion, Product, Category, Sequelize } = require('../models');
const { Op } = Sequelize;

/**
 * Intelligent Supermarket Promotion Calculation Engine
 * Evaluates active promotions against current cart items and computes exact promotional savings.
 * 
 * @param {Object} options
 * @param {Array} options.items - Array of items in the cart: [{ productId, quantity, unitPrice, categoryId }]
 * @param {String} options.branchId - Optional branch ID
 * @param {Number} options.subtotal - Cart subtotal before promo discounts
 * @returns {Promise<Object>} { totalPromotionDiscount, appliedPromotions }
 */
async function evaluatePromotions({ items = [], branchId = null, subtotal = 0 }) {
  try {
    if (!items || !Array.isArray(items) || items.length === 0) {
      return { totalPromotionDiscount: 0.00, appliedPromotions: [] };
    }

    const now = new Date();

    const promoWhere = {
      isActive: true,
      startDate: { [Op.lte]: now },
      endDate: { [Op.gte]: now }
    };

    if (branchId) {
      promoWhere[Op.or] = [
        { branchId: null },
        { branchId }
      ];
    } else {
      promoWhere.branchId = null;
    }

    const activePromotions = await Promotion.findAll({
      where: promoWhere,
      order: [['priority', 'DESC'], ['createdAt', 'DESC']]
    });

    if (!activePromotions || activePromotions.length === 0) {
      return { totalPromotionDiscount: 0.00, appliedPromotions: [] };
    }

    let totalPromotionDiscount = 0;
    const appliedPromotions = [];

    // Aggregate items by product ID
    const productQuantities = {};
    const productPrices = {};
    const productCategories = {};

    for (const item of items) {
      const pId = item.productId;
      const qty = parseFloat(item.quantity || 0);
      const price = parseFloat(item.unitPrice || 0);

      productQuantities[pId] = (productQuantities[pId] || 0) + qty;
      productPrices[pId] = price;
      if (item.categoryId) productCategories[pId] = item.categoryId;
    }

    for (const promo of activePromotions) {
      // 1. Buy X Get Y
      if (promo.type === 'buy_x_get_y' && promo.targetProductId) {
        const pId = promo.targetProductId;
        const cartQty = productQuantities[pId] || 0;
        const buyQty = parseFloat(promo.buyQuantity) || 1;
        const getQty = parseFloat(promo.getQuantity) || 1;
        const groupSize = buyQty + getQty;

        if (cartQty >= groupSize) {
          const completeGroups = Math.floor(cartQty / groupSize);
          const freeUnits = completeGroups * getQty;
          const unitPrice = productPrices[pId] || 0;
          const discount = parseFloat((freeUnits * unitPrice).toFixed(2));

          if (discount > 0) {
            totalPromotionDiscount += discount;
            appliedPromotions.push({
              promotionId: promo.id,
              name: promo.name,
              type: 'buy_x_get_y',
              productId: pId,
              freeUnits,
              discountAmount: discount,
              description: `اشتري ${buyQty} واحصل على ${getQty} مجاناً (${freeUnits} قطعة مجانية)`
            });
          }
        }
      }

      // 2. Bundle Price (e.g. 3 for 50 EGP)
      else if (promo.type === 'bundle_price' && promo.targetProductId) {
        const pId = promo.targetProductId;
        const cartQty = productQuantities[pId] || 0;
        const bundleQty = parseFloat(promo.buyQuantity) || 1;
        const bundlePrice = parseFloat(promo.bundlePrice) || 0;

        if (cartQty >= bundleQty) {
          const completeBundles = Math.floor(cartQty / bundleQty);
          const unitPrice = productPrices[pId] || 0;
          const normalTotal = completeBundles * bundleQty * unitPrice;
          const dealTotal = completeBundles * bundlePrice;
          const discount = parseFloat(Math.max(0, normalTotal - dealTotal).toFixed(2));

          if (discount > 0) {
            totalPromotionDiscount += discount;
            appliedPromotions.push({
              promotionId: promo.id,
              name: promo.name,
              type: 'bundle_price',
              productId: pId,
              bundleCount: completeBundles,
              discountAmount: discount,
              description: `عرض حزمة: ${bundleQty} قطع بسعر ${bundlePrice} جنيه`
            });
          }
        }
      }

      // 3. Percentage Discount
      else if (promo.type === 'percentage') {
        const percent = parseFloat(promo.discountPercentage) || 0;

        if (percent > 0) {
          if (promo.scope === 'product' && promo.targetProductId) {
            const pId = promo.targetProductId;
            const cartQty = productQuantities[pId] || 0;
            const unitPrice = productPrices[pId] || 0;
            const lineSubtotal = cartQty * unitPrice;
            const discount = parseFloat(((lineSubtotal * percent) / 100).toFixed(2));

            if (discount > 0) {
              totalPromotionDiscount += discount;
              appliedPromotions.push({
                promotionId: promo.id,
                name: promo.name,
                type: 'percentage',
                productId: pId,
                percentage: percent,
                discountAmount: discount,
                description: `خصم ${percent}% على الصنف`
              });
            }
          } else if (promo.scope === 'category' && promo.targetCategoryId) {
            // Find all items belonging to this category
            let catTotal = 0;
            for (const item of items) {
              if (item.categoryId === promo.targetCategoryId) {
                catTotal += (parseFloat(item.quantity) * parseFloat(item.unitPrice));
              }
            }

            const discount = parseFloat(((catTotal * percent) / 100).toFixed(2));
            if (discount > 0) {
              totalPromotionDiscount += discount;
              appliedPromotions.push({
                promotionId: promo.id,
                name: promo.name,
                type: 'percentage',
                categoryId: promo.targetCategoryId,
                percentage: percent,
                discountAmount: discount,
                description: `خصم ${percent}% على القسم`
              });
            }
          } else if (promo.scope === 'cart_total') {
            const minAmt = parseFloat(promo.minOrderAmount) || 0;
            if (subtotal >= minAmt) {
              const discount = parseFloat(((subtotal * percent) / 100).toFixed(2));
              if (discount > 0) {
                totalPromotionDiscount += discount;
                appliedPromotions.push({
                  promotionId: promo.id,
                  name: promo.name,
                  type: 'percentage',
                  percentage: percent,
                  discountAmount: discount,
                  description: `خصم ${percent}% على إجمالي السلة`
                });
              }
            }
          }
        }
      }

      // 4. Fixed Discount Amount
      else if (promo.type === 'fixed_amount') {
        const fixAmt = parseFloat(promo.discountAmount) || 0;
        const minAmt = parseFloat(promo.minOrderAmount) || 0;

        if (fixAmt > 0 && subtotal >= minAmt) {
          totalPromotionDiscount += fixAmt;
          appliedPromotions.push({
            promotionId: promo.id,
            name: promo.name,
            type: 'fixed_amount',
            discountAmount: fixAmt,
            description: `خصم مباشر بقيمة ${fixAmt} جنيه`
          });
        }
      }
    }

    return {
      totalPromotionDiscount: parseFloat(totalPromotionDiscount.toFixed(2)),
      appliedPromotions
    };
  } catch (err) {
    console.error('Error evaluating promotions:', err);
    return { totalPromotionDiscount: 0.00, appliedPromotions: [] };
  }
}

module.exports = {
  evaluatePromotions
};
