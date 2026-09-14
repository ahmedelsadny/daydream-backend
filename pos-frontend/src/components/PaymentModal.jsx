import React, { useState, useEffect, useRef } from 'react';
import { usePos } from '../context/PosContext';
import { posApi } from '../services/api';
import { soundEffects } from '../services/soundEffects';

export default function PaymentModal() {
  const { 
    isPaymentOpen, 
    setIsPaymentOpen, 
    grandTotal, 
    cartItems, 
    discountAmount, 
    clearCart, 
    setDrawerCash,
    setLastReceiptData,
    setIsReceiptOpen 
  } = usePos();

  const [amountPaidInput, setAmountPaidInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef(null);

  // Initialize input with exact grand total and auto-focus
  useEffect(() => {
    if (isPaymentOpen) {
      setAmountPaidInput(grandTotal.toFixed(2));
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 50);
    }
  }, [isPaymentOpen, grandTotal]);

  if (!isPaymentOpen) return null;

  const parsedAmountPaid = parseFloat(amountPaidInput) || 0;
  const changeDue = Math.max(0, parsedAmountPaid - grandTotal);
  const isShortage = parsedAmountPaid < (grandTotal - 0.01);

  const handlePresetBill = (val) => {
    setAmountPaidInput(val.toString());
    if (inputRef.current) inputRef.current.focus();
  };

  const handleConfirmPayment = async () => {
    if (isShortage) {
      soundEffects.playErrorBuzz();
      alert(`المبلغ المدفوع (${parsedAmountPaid.toFixed(2)}) أقل من إجمالي الفاتورة (${grandTotal.toFixed(2)}).`);
      return;
    }

    setIsSubmitting(true);
    try {
      // Build order payload matching daydream-backend orders controller
      const payload = {
        paymentMethod: 'cash',
        amountPaid: parsedAmountPaid,
        frontendDiscountAmount: discountAmount > 0 ? discountAmount : undefined,
        paperWidth: 48, // 80mm
        items: cartItems.map(item => ({
          productId: item.productId,
          quantity: item.quantity,
          unitId: item.unitId || undefined
        }))
      };

      const res = await posApi.createOrder(payload);

      // Play cash drawer chime and drawer kick
      soundEffects.playCashChime();

      // Update active drawer cash
      setDrawerCash(prev => prev + grandTotal);

      // Save receipt data for visual preview and printing
      if (res && res.receipt) {
        setLastReceiptData(res.receipt);
        setIsReceiptOpen(true);
      }

      // Reset cart and close payment modal
      clearCart();
      setIsPaymentOpen(false);

    } catch (err) {
      soundEffects.playErrorBuzz();
      alert('خطأ أثناء حفظ الفاتورة: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleConfirmPayment();
    } else if (e.key === 'Escape') {
      setIsPaymentOpen(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={() => setIsPaymentOpen(false)}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        {/* Header */}
        <div className="modal-header">
          <h2 className="modal-title">💵 الدفع النقدي (كاش)</h2>
          <button className="modal-close-btn" onClick={() => setIsPaymentOpen(false)}>✕</button>
        </div>

        <div className="modal-body">
          {/* Total Due Banner */}
          <div className="payment-due-banner">
            <div className="payment-due-label">إجمالي المبلغ المستحق</div>
            <div className="payment-due-amount">{grandTotal.toFixed(2)} <span style={{ fontSize: '1.2rem' }}>ج.م</span></div>
          </div>

          {/* Quick Preset Bills */}
          <div className="preset-bills-grid">
            <button className="btn-bill" onClick={() => handlePresetBill(grandTotal.toFixed(2))}>
              المبلغ بالضبط
            </button>
            <button className="btn-bill" onClick={() => handlePresetBill(100)}>
              100 ج.م
            </button>
            <button className="btn-bill" onClick={() => handlePresetBill(200)}>
              200 ج.م
            </button>
            <button className="btn-bill" onClick={() => handlePresetBill(500)}>
              500 ج.م
            </button>
          </div>

          {/* Amount Paid Input Box */}
          <div className="cash-paid-input-box">
            <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              المبلغ المستلم نقداً من العميل (أو اكتب الرقم واضغط Enter):
            </label>
            <input
              ref={inputRef}
              type="number"
              step="any"
              className="cash-paid-input"
              value={amountPaidInput}
              onChange={(e) => setAmountPaidInput(e.target.value)}
              placeholder="0.00"
            />
          </div>

          {/* Huge Change Due Card */}
          <div className="change-due-card">
            <div className="change-due-label">الباقي المستحق للعميل:</div>
            <div className="change-due-val">
              {changeDue.toFixed(2)} <span style={{ fontSize: '1.4rem' }}>ج.م</span>
            </div>
            {isShortage && (
              <div style={{ color: 'var(--color-rose)', fontWeight: 800, marginTop: '0.25rem', fontSize: '0.9rem' }}>
                ⚠️ تنبيه: المبلغ المستلم أقل من الفاتورة بـ {Math.abs(parsedAmountPaid - grandTotal).toFixed(2)} ج.م
              </div>
            )}
          </div>

          {/* Confirm & Print Button */}
          <button 
            className="btn-confirm-payment"
            onClick={handleConfirmPayment}
            disabled={isSubmitting || isShortage}
          >
            {isSubmitting ? (
              <span>جاري الحفظ والطباعة...</span>
            ) : (
              <span>تأكيد الفاتورة وفتح الدرج (Enter) ⚡</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
