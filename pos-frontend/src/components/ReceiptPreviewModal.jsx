import React from 'react';
import { usePos } from '../context/PosContext';

export default function ReceiptPreviewModal() {
  const { isReceiptOpen, setIsReceiptOpen, lastReceiptData, refocusBarcode } = usePos();

  if (!isReceiptOpen || !lastReceiptData) return null;

  const handleClose = () => {
    setIsReceiptOpen(false);
    refocusBarcode();
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-card" style={{ maxWidth: '420px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">🧾 إيصال الفاتورة الحراري</h2>
          <button className="modal-close-btn" onClick={handleClose}>✕</button>
        </div>

        <div className="modal-body" style={{ padding: '1rem' }}>
          {/* Visual Paper Receipt Card */}
          <div
            id="printable-receipt"
            style={{
              background: '#fff',
              color: '#000',
              fontFamily: 'var(--font-mono), monospace',
              padding: '1.25rem 1rem',
              borderRadius: '8px',
              fontSize: '12px',
              lineHeight: '1.4',
              whiteSpace: 'pre-wrap',
              direction: 'ltr',
              textAlign: 'left',
              maxHeight: '420px',
              overflowY: 'auto',
              border: '1px dashed #cbd5e1',
              boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'
            }}
          >
            {lastReceiptData.plainText}
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
            <button
              className="btn-confirm-payment"
              style={{ flex: 1, background: 'var(--color-blue)', padding: '0.85rem' }}
              onClick={handlePrint}
            >
              🖨️ طباعة الإيصال
            </button>
            <button
              className="btn-confirm-payment"
              style={{ flex: 1, background: 'var(--bg-elevated)', border: '1px solid var(--border-normal)', padding: '0.85rem' }}
              onClick={handleClose}
            >
              جاهز للعميل التالي ↵
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
