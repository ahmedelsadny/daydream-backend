import React from 'react';
import { usePos } from '../context/PosContext';
import { posApi } from '../services/api';

export default function HeldOrdersModal() {
  const { isHeldOrdersOpen, setIsHeldOrdersOpen, heldOrders, recallHeldCart, setHeldOrders } = usePos();

  if (!isHeldOrdersOpen) return null;

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (confirm('هل أنت متأكد من حذف هذه السلة المعلقة نهائياً؟')) {
      try {
        await posApi.deleteHeldOrder(id);
        setHeldOrders(prev => prev.filter(h => h.id !== id));
      } catch (err) {
        alert('خطأ أثناء الحذف: ' + err.message);
      }
    }
  };

  return (
    <div className="modal-overlay" onClick={() => setIsHeldOrdersOpen(false)}>
      <div className="modal-card" style={{ maxWidth: '600px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">📥 السلات والفواتير المعلقة (F7)</h2>
          <button className="modal-close-btn" onClick={() => setIsHeldOrdersOpen(false)}>✕</button>
        </div>

        <div className="modal-body">
          {heldOrders.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.5 }}>📭</div>
              <h3>لا توجد فواتير معلقة حالياً</h3>
              <p style={{ fontSize: '0.875rem' }}>يمكنك تعليق أي سلة نشطة عبر الزر (F6) لتمرير عميل آخر.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '400px', overflowY: 'auto' }}>
              {heldOrders.map((h, idx) => {
                const items = typeof h.cartItems === 'string' ? JSON.parse(h.cartItems) : h.cartItems;
                const total = items?.reduce((sum, it) => sum + (it.totalPrice || 0), 0) || 0;
                const timeStr = new Date(h.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

                return (
                  <div
                    key={h.id || idx}
                    style={{
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-normal)',
                      borderRadius: '10px',
                      padding: '1rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '1rem', color: '#fff' }}>
                        {h.customerNote || `سلة معلقة #${idx + 1}`}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                        توقيت التعليق: {timeStr} • عدد البنود: {items?.length || 0}
                      </div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, color: 'var(--color-emerald)', marginTop: '0.35rem' }}>
                        الإجمالي: {total.toFixed(2)} ج.م
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        className="btn-action"
                        style={{ background: 'var(--color-blue)', color: '#fff', padding: '0.5rem 1rem', fontSize: '0.875rem' }}
                        onClick={() => recallHeldCart(h)}
                      >
                        استرجاع للسلة ↩️
                      </button>
                      <button
                        className="btn-action"
                        style={{ background: 'var(--color-rose-glow)', color: '#f87171', border: '1px solid var(--color-rose)', padding: '0.5rem 0.75rem', fontSize: '0.875rem' }}
                        onClick={(e) => handleDelete(h.id, e)}
                        title="حذف"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
