import React from 'react';
import { usePos } from '../context/PosContext';

export default function TotalSection() {
  const { 
    subtotal, 
    discountAmount, 
    grandTotal, 
    totalItemsCount, 
    cartItems, 
    clearCart, 
    holdCurrentCart, 
    setIsPaymentOpen 
  } = usePos();

  const handleCheckoutClick = () => {
    if (cartItems.length === 0) {
      alert('السلة فارغة. يرجى مسح أصناف أولاً قبل الدفع.');
      return;
    }
    setIsPaymentOpen(true);
  };

  const handleHoldClick = () => {
    if (cartItems.length === 0) return;
    const note = prompt('ملاحظة على الفاتورة المعلقة (اختياري):', '');
    holdCurrentCart(note);
  };

  const handleClearClick = () => {
    if (cartItems.length === 0) return;
    if (confirm('هل أنت متأكد من تفريغ وإلغاء السلة الحالية؟')) {
      clearCart();
    }
  };

  return (
    <div className="pos-total-section">
      {/* Subtotal & Items Breakdown */}
      <div className="total-row">
        <span>عدد الأصناف في الفاتورة:</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
          {totalItemsCount} {totalItemsCount === 1 ? 'صنف' : 'أصناف'}
        </span>
      </div>

      <div className="total-row">
        <span>المجموع الفرعي:</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
          {subtotal.toFixed(2)} ج.م
        </span>
      </div>

      {discountAmount > 0 && (
        <div className="total-row discount-row">
          <span>الخصم / عروض التوفير:</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
            -{discountAmount.toFixed(2)} ج.م
          </span>
        </div>
      )}

      {/* Grand Total Display */}
      <div className="grand-total-row">
        <span className="grand-total-label">المطلوب سداده:</span>
        <div style={{ display: 'flex', alignItems: 'baseline' }}>
          <span className="grand-total-currency">ج.م</span>
          <span className="grand-total-amount">{grandTotal.toFixed(2)}</span>
        </div>
      </div>

      {/* Action Buttons Grid */}
      <div className="cart-actions-grid">
        {/* Hold Cart (F6) */}
        <button 
          className="btn-action btn-hold"
          onClick={handleHoldClick}
          disabled={cartItems.length === 0}
          title="تعليق السلة الحالية (F6)"
        >
          <span>⏸️ تعليق (F6)</span>
        </button>

        {/* Clear Cart */}
        <button 
          className="btn-action btn-clear"
          onClick={handleClearClick}
          disabled={cartItems.length === 0}
          title="تفريغ السلة"
        >
          <span>🗑️ تفريغ</span>
        </button>

        {/* Huge Cash Payment Button (Enter) */}
        <button 
          className="btn-action btn-checkout"
          onClick={handleCheckoutClick}
          disabled={cartItems.length === 0}
          title="الدفع نقداً وإنهاء الفاتورة (Enter)"
        >
          <span>💵 الدفع كاش (Enter)</span>
        </button>
      </div>
    </div>
  );
}
