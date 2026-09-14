/**
 * ESC/POS Thermal Receipt Generator Service
 * Formats supermarket receipts for 80mm (48 chars) and 58mm (32 chars) thermal printers,
 * and generates ready-to-send ESC/POS hex commands including automatic cash drawer kick.
 */

const { ReceiptSettings } = require('../models');

// Standard ESC/POS Command Constants
const ESC = '\x1b';
const GS = '\x1d';

const COMMANDS = {
  INIT: `${ESC}@`,                          // Initialize printer
  ALIGN_LEFT: `${ESC}a\x00`,               // Left alignment
  ALIGN_CENTER: `${ESC}a\x01`,             // Center alignment
  ALIGN_RIGHT: `${ESC}a\x02`,              // Right alignment
  BOLD_ON: `${ESC}E\x01`,                  // Bold font ON
  BOLD_OFF: `${ESC}E\x00`,                 // Bold font OFF
  DOUBLE_HEIGHT: `${ESC}!\x10`,            // Double height font
  DOUBLE_WIDTH: `${ESC}!\x20`,             // Double width font
  DOUBLE_BOTH: `${ESC}!\x30`,              // Double height & width font
  NORMAL: `${ESC}!\x00`,                   // Normal font size
  FEED_LINES: (n = 3) => `${ESC}d${String.fromCharCode(n)}`, // Feed n lines
  PARTIAL_CUT: `${GS}V\x01`,               // Partial paper cut
  FULL_CUT: `${GS}V\x00`,                  // Full paper cut
  DRAWER_KICK: `${ESC}p\x00\x19\xfa`,       // Drawer kick pulse (25ms pulse, 250ms interval on Pin 2)
  DRAWER_KICK_PIN5: `${ESC}p\x01\x19\xfa`  // Drawer kick pulse on Pin 5
};

/**
 * Format string with padding to fill column width
 */
function padLine(left, right, width = 48) {
  const leftStr = String(left || '');
  const rightStr = String(right || '');
  const spacesNeeded = Math.max(1, width - (leftStr.length + rightStr.length));
  return leftStr + ' '.repeat(spacesNeeded) + rightStr;
}

/**
 * Format a 3-column or 4-column item line for thermal receipt
 */
function formatItemLine(name, qty, unitPrice, total, width = 48) {
  const qtyPrice = `${qty} x ${parseFloat(unitPrice).toFixed(2)}`;
  const totalStr = parseFloat(total).toFixed(2);
  
  if (width >= 48) {
    // 80mm paper width
    const leftPart = name.length > 24 ? name.substring(0, 23) + '…' : name;
    return padLine(`${leftPart.padEnd(25)} ${qtyPrice.padEnd(12)}`, totalStr, width);
  } else {
    // 58mm paper width: two lines per item for readability
    const line1 = name;
    const line2 = padLine(`  ${qtyPrice}`, totalStr, width);
    return `${line1}\n${line2}`;
  }
}

/**
 * Generate formatted plain text and raw ESC/POS buffer for an order
 * @param {Object} order - Full order object with OrderItems, Branch, Cashier
 * @param {Object} customSettings - Optional custom receipt settings
 * @param {Number} paperWidth - 48 (80mm) or 32 (58mm)
 * @returns {Object} { plainText, escposBase64, escposCommandsHex, drawerKickHex, summary }
 */
async function generateReceiptPayload(order, customSettings = null, paperWidth = 48) {
  let settings = customSettings;
  if (!settings) {
    settings = await ReceiptSettings.getSettings();
  }

  const shopName = settings.shopName || 'Supermarket';
  const address = settings.address || (order.Branch ? order.Branch.name : '');
  const phone = settings.telephone || '';
  const receiptTitle = settings.receiptTitle || 'فاتورة مبيعات نقدية';
  const thankYou = settings.thankYouMessage || 'شكراً لزيارتكم';
  const policies = settings.policiesAndTerms || 'البضاعة المباعة ترد وتستبدل خلال 14 يوماً مع الفاتورة';

  const orderDate = new Date(order.createdAt || Date.now());
  const dateStr = orderDate.toLocaleDateString('ar-EG', { year: 'numeric', month: '2-digit', day: '2-digit' });
  const timeStr = orderDate.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const cashierName = order.cashier ? order.cashier.name : (order.Cashier ? order.Cashier.name : 'الكاشير');
  const divider = '='.repeat(paperWidth);
  const thinDivider = '-'.repeat(paperWidth);

  // 1. Build Plain Text Receipt
  const textLines = [];
  textLines.push(shopName);
  if (address) textLines.push(address);
  if (phone) textLines.push(`هاتف: ${phone}`);
  textLines.push(divider);
  textLines.push(`${receiptTitle} - فاتورة رقم: #${String(order.id).substring(0, 8)}`);
  textLines.push(`التاريخ: ${dateStr}   الوقت: ${timeStr}`);
  textLines.push(`الكاشير: ${cashierName}`);
  textLines.push(thinDivider);
  
  // Header of items table
  if (paperWidth >= 48) {
    textLines.push(padLine('الصنف                    الكمية x السعر', 'الإجمالي', paperWidth));
  } else {
    textLines.push(padLine('الصنف', 'الإجمالي', paperWidth));
  }
  textLines.push(thinDivider);

  // Items
  const items = order.OrderItems || [];
  items.forEach(item => {
    const pName = item.Product ? item.Product.name : (item.name || 'صنف');
    const qty = parseFloat(item.quantity || 1);
    const unitPrice = parseFloat(item.unitPrice || 0);
    const itemTotal = qty * unitPrice;
    textLines.push(formatItemLine(pName, qty, unitPrice, itemTotal, paperWidth));
  });

  textLines.push(divider);

  // Totals & Cash Breakdown
  const subtotal = parseFloat(order.subtotal || order.totalPrice || 0);
  const promoDiscount = parseFloat(order.promotionDiscount || 0);
  const manualDiscount = parseFloat(order.discountAmount || 0);
  const totalDiscount = promoDiscount + manualDiscount;
  const grandTotal = parseFloat(order.totalPrice || 0);
  const amountPaid = parseFloat(order.amountPaid || grandTotal);
  const changeDue = parseFloat(order.changeAmount || (amountPaid - grandTotal));

  if (totalDiscount > 0) {
    textLines.push(padLine('المجموع الفرعي:', `${subtotal.toFixed(2)} ج.م`, paperWidth));
    textLines.push(padLine('خصومات وعروض:', `-${totalDiscount.toFixed(2)} ج.م`, paperWidth));
  }
  textLines.push(padLine('الإجمالي النهائي:', `${grandTotal.toFixed(2)} ج.م`, paperWidth));
  textLines.push(thinDivider);
  textLines.push(padLine('المدفوع نقداً (كاش):', `${amountPaid.toFixed(2)} ج.م`, paperWidth));
  textLines.push(padLine('الباقي المستحق للعميل:', `${changeDue.toFixed(2)} ج.م`, paperWidth));
  textLines.push(divider);

  if (thankYou) textLines.push(thankYou);
  if (policies) textLines.push(policies);

  const plainText = textLines.join('\n');

  // 2. Build Binary ESC/POS Stream
  let escpos = '';
  // Open Cash Drawer IMMEDIATELY at the start of printing
  escpos += COMMANDS.DRAWER_KICK;
  escpos += COMMANDS.INIT;

  // Center align store info
  escpos += COMMANDS.ALIGN_CENTER;
  escpos += COMMANDS.DOUBLE_BOTH;
  escpos += `${shopName}\n`;
  escpos += COMMANDS.NORMAL;
  if (address) escpos += `${address}\n`;
  if (phone) escpos += `Tel: ${phone}\n`;
  escpos += `${divider}\n`;

  // Receipt meta
  escpos += COMMANDS.BOLD_ON;
  escpos += `${receiptTitle} #${String(order.id).substring(0, 8)}\n`;
  escpos += COMMANDS.BOLD_OFF;
  escpos += `${dateStr}  ${timeStr}\n`;
  escpos += `Cashier: ${cashierName}\n`;
  escpos += `${thinDivider}\n`;

  // Items table
  escpos += COMMANDS.ALIGN_LEFT;
  if (paperWidth >= 48) {
    escpos += padLine('Item                     Qty x Price', 'Total', paperWidth) + '\n';
  } else {
    escpos += padLine('Item', 'Total', paperWidth) + '\n';
  }
  escpos += `${thinDivider}\n`;

  items.forEach(item => {
    const pName = item.Product ? item.Product.name : (item.name || 'Item');
    const qty = parseFloat(item.quantity || 1);
    const unitPrice = parseFloat(item.unitPrice || 0);
    const itemTotal = qty * unitPrice;
    escpos += formatItemLine(pName, qty, unitPrice, itemTotal, paperWidth) + '\n';
  });

  escpos += `${divider}\n`;

  // Financial Summary
  if (totalDiscount > 0) {
    escpos += padLine('Subtotal:', `${subtotal.toFixed(2)}`, paperWidth) + '\n';
    escpos += padLine('Discount / Savings:', `-${totalDiscount.toFixed(2)}`, paperWidth) + '\n';
  }
  
  // Total in bold / double height
  escpos += COMMANDS.BOLD_ON;
  escpos += COMMANDS.DOUBLE_HEIGHT;
  escpos += padLine('TOTAL DUE:', `${grandTotal.toFixed(2)} EGP`, paperWidth) + '\n';
  escpos += COMMANDS.NORMAL;
  escpos += COMMANDS.BOLD_OFF;
  escpos += `${thinDivider}\n`;

  // Cash Paid and Change Due (Emphasized)
  escpos += padLine('CASH PAID:', `${amountPaid.toFixed(2)} EGP`, paperWidth) + '\n';
  escpos += COMMANDS.BOLD_ON;
  escpos += padLine('CHANGE DUE:', `${changeDue.toFixed(2)} EGP`, paperWidth) + '\n';
  escpos += COMMANDS.BOLD_OFF;
  escpos += `${divider}\n`;

  // Footer & Thank You
  escpos += COMMANDS.ALIGN_CENTER;
  if (thankYou) escpos += `${thankYou}\n`;
  if (policies) escpos += `${policies}\n`;

  // Feed and cut paper
  escpos += COMMANDS.FEED_LINES(4);
  escpos += COMMANDS.FULL_CUT;

  const escposBuffer = Buffer.from(escpos, 'binary');

  return {
    plainText,
    escposBase64: escposBuffer.toString('base64'),
    escposCommandsHex: escposBuffer.toString('hex'),
    drawerKickHex: Buffer.from(COMMANDS.DRAWER_KICK, 'binary').toString('hex'),
    summary: {
      orderId: order.id,
      totalPrice: grandTotal,
      amountPaid: amountPaid,
      changeAmount: changeDue,
      itemsCount: items.length
    }
  };
}

/**
 * Generate formatted plain text and raw ESC/POS buffer for a Shift Z-Report
 * @param {Object} zReportData - The complete zReport object from shifts.controller
 * @param {Object} customSettings - Optional custom receipt settings
 * @param {Number} paperWidth - 48 (80mm) or 32 (58mm)
 * @returns {Object} { plainText, escposBase64, escposCommandsHex }
 */
async function generateZReportReceipt(zReportData, customSettings = null, paperWidth = 48) {
  let settings = customSettings;
  if (!settings) {
    settings = await ReceiptSettings.getSettings();
  }

  const shopName = settings.shopName || 'Supermarket';
  const branchName = zReportData.branch?.name || '';
  const cashierName = zReportData.cashier?.name || '';
  const startTime = zReportData.timing?.startTime ? new Date(zReportData.timing.startTime).toLocaleString('ar-EG') : '';
  const endTime = zReportData.timing?.endTime ? new Date(zReportData.timing.endTime).toLocaleString('ar-EG') : '';
  const divider = '='.repeat(paperWidth);
  const thinDivider = '-'.repeat(paperWidth);

  const rec = zReportData.drawerReconciliation || {};
  const sales = zReportData.salesSummary || {};

  const lines = [];
  lines.push(shopName);
  if (branchName) lines.push(`فرع: ${branchName}`);
  lines.push(divider);
  lines.push('*** تقرير إغلاق الوردية (Z-REPORT) ***');
  lines.push(`وردية رقم: #${String(zReportData.shiftId || '').substring(0, 8)}`);
  lines.push(`الكاشير: ${cashierName}`);
  lines.push(`البداية: ${startTime}`);
  lines.push(`النهاية: ${endTime}`);
  lines.push(`المدة: ${zReportData.timing?.durationHours || 0} ساعة`);
  lines.push(thinDivider);
  lines.push('--- مطابقة نقدية الدرج (CASH DRAWER) ---');
  lines.push(padLine('العهدة الافتتاحية:', `${parseFloat(rec.openingBalance || 0).toFixed(2)} ج.م`, paperWidth));
  lines.push(padLine('+ مبيعات الكاش:', `${parseFloat(rec.cashSales || 0).toFixed(2)} ج.م`, paperWidth));
  lines.push(padLine('- مرتجعات الكاش:', `${parseFloat(rec.cashRefunds || 0).toFixed(2)} ج.م`, paperWidth));
  lines.push(padLine('+ إيداعات الدرج (Cash In):', `${parseFloat(rec.cashIn || 0).toFixed(2)} ج.م`, paperWidth));
  lines.push(padLine('- سحوبات الدرج (Cash Out):', `${parseFloat(rec.cashOut || 0).toFixed(2)} ج.م`, paperWidth));
  lines.push(thinDivider);
  lines.push(padLine('= النقدية المتوقعة بالدرج:', `${parseFloat(rec.expectedCash || 0).toFixed(2)} ج.م`, paperWidth));
  lines.push(padLine('النقدية الفعلية المعدودة:', `${rec.actualCashCounted !== null ? parseFloat(rec.actualCashCounted).toFixed(2) : 'لم تسجل'} ج.م`, paperWidth));
  
  const diffStr = parseFloat(rec.difference || 0).toFixed(2);
  const statusLabel = rec.status === 'balanced' ? 'متطابق (سليم)' : (rec.status === 'surplus' ? `زيادة (+${diffStr})` : `عجز (${diffStr})`);
  lines.push(padLine('الفارق (العجز/الزيادة):', statusLabel, paperWidth));
  lines.push(thinDivider);
  lines.push('--- ملخص المبيعات ---');
  lines.push(padLine('إجمالي عدد الفواتير:', `${sales.totalOrders || 0}`, paperWidth));
  lines.push(padLine('إجمالي المبيعات:', `${parseFloat(sales.totalSales || 0).toFixed(2)} ج.م`, paperWidth));
  lines.push(padLine('إجمالي الخصومات:', `${parseFloat(sales.totalDiscounts || 0).toFixed(2)} ج.م`, paperWidth));
  lines.push(padLine('صافي المبيعات:', `${parseFloat(sales.netSales || 0).toFixed(2)} ج.م`, paperWidth));
  lines.push(divider);
  lines.push('\nتوقيع الكاشير: .............................');
  lines.push('\nتوقيع المشرف:  .............................\n');

  const plainText = lines.join('\n');

  // ESC/POS binary format
  let escpos = '';
  escpos += COMMANDS.INIT;
  escpos += COMMANDS.ALIGN_CENTER;
  escpos += COMMANDS.DOUBLE_BOTH;
  escpos += `${shopName}\n`;
  escpos += COMMANDS.NORMAL;
  escpos += `*** Z-REPORT ***\n`;
  escpos += `Shift: #${String(zReportData.shiftId || '').substring(0, 8)}\n`;
  escpos += `Cashier: ${cashierName}\n`;
  escpos += `${divider}\n`;

  escpos += COMMANDS.ALIGN_LEFT;
  escpos += padLine('Opening Float:', `${parseFloat(rec.openingBalance || 0).toFixed(2)}`, paperWidth) + '\n';
  escpos += padLine('+ Cash Sales:', `${parseFloat(rec.cashSales || 0).toFixed(2)}`, paperWidth) + '\n';
  escpos += padLine('- Refunds:', `${parseFloat(rec.cashRefunds || 0).toFixed(2)}`, paperWidth) + '\n';
  escpos += padLine('+ Cash In:', `${parseFloat(rec.cashIn || 0).toFixed(2)}`, paperWidth) + '\n';
  escpos += padLine('- Cash Out:', `${parseFloat(rec.cashOut || 0).toFixed(2)}`, paperWidth) + '\n';
  escpos += `${thinDivider}\n`;

  escpos += COMMANDS.BOLD_ON;
  escpos += padLine('EXPECTED CASH:', `${parseFloat(rec.expectedCash || 0).toFixed(2)} EGP`, paperWidth) + '\n';
  escpos += padLine('ACTUAL COUNTED:', `${rec.actualCashCounted !== null ? parseFloat(rec.actualCashCounted).toFixed(2) : 'N/A'} EGP`, paperWidth) + '\n';
  escpos += padLine('VARIANCE:', `${diffStr} EGP (${rec.status || 'balanced'})`, paperWidth) + '\n';
  escpos += COMMANDS.BOLD_OFF;
  escpos += `${divider}\n`;

  escpos += padLine('Total Invoices:', `${sales.totalOrders || 0}`, paperWidth) + '\n';
  escpos += padLine('Total Sales:', `${parseFloat(sales.totalSales || 0).toFixed(2)} EGP`, paperWidth) + '\n';
  escpos += padLine('Net Sales:', `${parseFloat(sales.netSales || 0).toFixed(2)} EGP`, paperWidth) + '\n';
  escpos += `${divider}\n`;

  escpos += '\nCashier Sig: ....................\n';
  escpos += 'Supervisor Sig: .................\n';

  escpos += COMMANDS.FEED_LINES(4);
  escpos += COMMANDS.FULL_CUT;

  const escposBuffer = Buffer.from(escpos, 'binary');

  return {
    plainText,
    escposBase64: escposBuffer.toString('base64'),
    escposCommandsHex: escposBuffer.toString('hex')
  };
}

module.exports = {
  generateReceiptPayload,
  generateZReportReceipt,
  COMMANDS
};
