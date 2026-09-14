import React, { useState } from 'react';
import { usePos } from '../context/PosContext';
import { posApi } from '../services/api';
import { soundEffects } from '../services/soundEffects';

export default function ShiftModal() {
  const { 
    isShiftModalOpen, 
    setIsShiftModalOpen, 
    shift, 
    isShiftActive, 
    setShift, 
    setIsShiftActive, 
    drawerCash, 
    setDrawerCash,
    setLastReceiptData,
    setIsReceiptOpen
  } = usePos();

  const [tab, setTab] = useState('status'); // 'status', 'cashIn', 'cashOut', 'endShift'
  const [openingBalance, setOpeningBalance] = useState('200.00');
  const [cashTxAmount, setCashTxAmount] = useState('');
  const [cashTxReason, setCashTxReason] = useState('');
  const [closingCounted, setClosingCounted] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isShiftModalOpen) return null;

  // 1. Start Shift Handler
  const handleStartShift = async () => {
    const bal = parseFloat(openingBalance);
    if (isNaN(bal) || bal < 0) {
      alert('يرجى كتابة مبلغ العهدة الافتتاحية بشكل صحيح.');
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await posApi.startShift(bal);
      if (res && res.shift) {
        setShift(res.shift);
        setIsShiftActive(true);
        setDrawerCash(bal);
        soundEffects.playCashChime();
        alert('تم فتح الوردية بنجاح وتسجيل العهدة.');
        setIsShiftModalOpen(false);
      }
    } catch (err) {
      alert('خطأ أثناء فتح الوردية: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 2. Cash In Handler
  const handleCashIn = async () => {
    const amt = parseFloat(cashTxAmount);
    if (isNaN(amt) || amt <= 0 || !cashTxReason.trim()) {
      alert('يرجى تحديد المبلغ والسبب لإيداع النقدية.');
      return;
    }
    setIsSubmitting(true);
    try {
      await posApi.cashIn(amt, cashTxReason.trim());
      setDrawerCash(prev => prev + amt);
      soundEffects.playCashChime();
      alert('تم تسجيل إيداع النقدية في الدرج بنجاح.');
      setCashTxAmount('');
      setCashTxReason('');
      setTab('status');
    } catch (err) {
      alert('خطأ: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 3. Cash Out Handler
  const handleCashOut = async () => {
    const amt = parseFloat(cashTxAmount);
    if (isNaN(amt) || amt <= 0 || !cashTxReason.trim()) {
      alert('يرجى تحديد المبلغ والسبب لسحب النقدية.');
      return;
    }
    setIsSubmitting(true);
    try {
      await posApi.cashOut(amt, cashTxReason.trim());
      setDrawerCash(prev => Math.max(0, prev - amt));
      soundEffects.playCashChime();
      alert('تم تسجيل سحب النقدية بنجاح وتحديث حساب الدرج.');
      setCashTxAmount('');
      setCashTxReason('');
      setTab('status');
    } catch (err) {
      alert('خطأ: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 4. End Shift Handler (Blind Settlement & Z-Report)
  const handleEndShift = async () => {
    const counted = parseFloat(closingCounted);
    if (isNaN(counted) || counted < 0) {
      alert('يرجى عد النقدية وكتابة المبلغ الفعلي في الدرج بدقة.');
      return;
    }

    if (!confirm('هل أنت متأكد من إنهاء الوردية وجرد الدرج وإصدار الـ Z-Report؟')) {
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await posApi.endShift(counted, 'تقفيل الوردية وجرد الدرج');

      // Update state
      setIsShiftActive(false);
      setShift(null);
      setDrawerCash(0);

      // Show receipt if returned
      if (res && res.receipt) {
        setLastReceiptData(res.receipt);
        setIsReceiptOpen(true);
      }

      soundEffects.playCashChime();
      alert('تم إغلاق الوردية وإصدار تقرير الـ Z-Report بنجاح!');
      setIsShiftModalOpen(false);
    } catch (err) {
      alert('خطأ أثناء إغلاق الوردية: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={() => setIsShiftModalOpen(false)}>
      <div className="modal-card" style={{ maxWidth: '580px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">💼 إدارة الوردية والخزينة النقدية</h2>
          <button className="modal-close-btn" onClick={() => setIsShiftModalOpen(false)}>✕</button>
        </div>

        <div className="modal-body">
          {!isShiftActive ? (
            /* Open Shift Screen */
            <div>
              <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
                <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>🔐</div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff' }}>الوردية مغلقة حالياً</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
                  يجب تسجيل العهدة النقدية الافتتاحية في درج الكاشير للبدء.
                </p>
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 700 }}>
                  مبلغ العهدة الافتتاحية (الفكة في الدرج):
                </label>
                <input
                  type="number"
                  step="any"
                  className="cash-paid-input"
                  style={{ textAlign: 'center', fontSize: '1.8rem' }}
                  value={openingBalance}
                  onChange={(e) => setOpeningBalance(e.target.value)}
                  placeholder="200.00"
                  autoFocus
                />
              </div>

              <button
                className="btn-confirm-payment"
                onClick={handleStartShift}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'جاري الفتح...' : 'بدء الوردية الآن 🚀'}
              </button>
            </div>
          ) : (
            /* Active Shift Management Tabs */
            <div>
              {/* Tab Navigation */}
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
                <button
                  className={`btn-category ${tab === 'status' ? 'active' : ''}`}
                  onClick={() => setTab('status')}
                >
                  📊 حالة الوردية
                </button>
                <button
                  className={`btn-category ${tab === 'cashIn' ? 'active' : ''}`}
                  onClick={() => setTab('cashIn')}
                >
                  ➕ إيداع فكة
                </button>
                <button
                  className={`btn-category ${tab === 'cashOut' ? 'active' : ''}`}
                  onClick={() => setTab('cashOut')}
                >
                  ➖ سحب مصروف
                </button>
                <button
                  className={`btn-category ${tab === 'endShift' ? 'active' : ''}`}
                  onClick={() => setTab('endShift')}
                  style={{ borderColor: 'var(--color-rose)', color: tab === 'endShift' ? '#fff' : '#f87171' }}
                >
                  🔒 إغلاق وجرد Z-Report
                </button>
              </div>

              {/* Tab 1: Shift Status */}
              {tab === 'status' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div className="payment-due-banner">
                    <div className="payment-due-label">النقدية المحسوبة حالياً في الدرج</div>
                    <div className="payment-due-amount" style={{ color: 'var(--color-emerald)' }}>
                      {drawerCash.toFixed(2)} <span style={{ fontSize: '1.2rem' }}>ج.م</span>
                    </div>
                  </div>

                  <div style={{ background: 'var(--bg-surface)', padding: '1rem', borderRadius: '10px', fontSize: '0.9rem' }}>
                    <div className="total-row" style={{ padding: '0.4rem 0' }}>
                      <span>رقم الوردية:</span>
                      <span style={{ fontFamily: 'var(--font-mono)' }}>#{String(shift?.id || '').substring(0, 8)}</span>
                    </div>
                    <div className="total-row" style={{ padding: '0.4rem 0' }}>
                      <span>العهدة الافتتاحية:</span>
                      <span style={{ fontFamily: 'var(--font-mono)' }}>{parseFloat(shift?.openingBalance || 0).toFixed(2)} ج.م</span>
                    </div>
                    <div className="total-row" style={{ padding: '0.4rem 0' }}>
                      <span>توقيت الفتح:</span>
                      <span>{new Date(shift?.startTime || Date.now()).toLocaleTimeString('ar-EG')}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 2: Cash In */}
              {tab === 'cashIn' && (
                <div>
                  <h4 style={{ marginBottom: '1rem', color: '#fff' }}>إيداع فكة / نقدية إضافية في الدرج:</h4>
                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.875rem' }}>المبلغ المودع:</label>
                    <input
                      type="number"
                      step="any"
                      className="barcode-input"
                      value={cashTxAmount}
                      onChange={(e) => setCashTxAmount(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                  <div style={{ marginBottom: '1.5rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.875rem' }}>السبب / المصدر:</label>
                    <input
                      type="text"
                      className="barcode-input"
                      value={cashTxReason}
                      onChange={(e) => setCashTxReason(e.target.value)}
                      placeholder="مثال: فكة من المشرف، إيداع نقدي..."
                    />
                  </div>
                  <button className="btn-confirm-payment" onClick={handleCashIn} disabled={isSubmitting}>
                    {isSubmitting ? 'جاري التسجيل...' : 'تأكيد الإيداع في الدرج 💵'}
                  </button>
                </div>
              )}

              {/* Tab 3: Cash Out */}
              {tab === 'cashOut' && (
                <div>
                  <h4 style={{ marginBottom: '1rem', color: '#fff' }}>سحب نقدية من الدرج (مصروف / توريد للمشرف):</h4>
                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.875rem' }}>المبلغ المسحوب:</label>
                    <input
                      type="number"
                      step="any"
                      className="barcode-input"
                      value={cashTxAmount}
                      onChange={(e) => setCashTxAmount(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                  <div style={{ marginBottom: '1.5rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.875rem' }}>السبب / البند:</label>
                    <input
                      type="text"
                      className="barcode-input"
                      value={cashTxReason}
                      onChange={(e) => setCashTxReason(e.target.value)}
                      placeholder="مثال: شراء أكياس، بوفيه، توريد للمشرف..."
                    />
                  </div>
                  <button className="btn-confirm-payment" style={{ background: 'var(--color-rose)' }} onClick={handleCashOut} disabled={isSubmitting}>
                    {isSubmitting ? 'جاري التسجيل...' : 'تأكيد سحب النقدية 💸'}
                  </button>
                </div>
              )}

              {/* Tab 4: End Shift & Z-Report */}
              {tab === 'endShift' && (
                <div>
                  <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--color-rose)', borderRadius: '10px', padding: '1rem', marginBottom: '1.25rem' }}>
                    <h4 style={{ color: '#f87171', fontWeight: 800 }}>⚠️ الجرد الأعمى للخزينة (Blind Settlement)</h4>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                      قم بعد كافة النقدية والعملات المتواجدة فعلياً في درج الكاشير الآن، واكتب المبلغ الإجمالي المعدود.
                    </p>
                  </div>

                  <div style={{ marginBottom: '1.5rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 800, fontSize: '1.05rem' }}>
                      النقدية الفعلية المعدودة في الدرج الآن:
                    </label>
                    <input
                      type="number"
                      step="any"
                      className="cash-paid-input"
                      style={{ textAlign: 'center', fontSize: '2rem' }}
                      value={closingCounted}
                      onChange={(e) => setClosingCounted(e.target.value)}
                      placeholder="0.00"
                      autoFocus
                    />
                  </div>

                  <button
                    className="btn-confirm-payment"
                    style={{ background: 'linear-gradient(135deg, #ef4444, #b91c1c)' }}
                    onClick={handleEndShift}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? 'جاري المطابقة والإغلاق...' : 'إغلاق الوردية وطباعة الـ Z-Report 🖨️'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
