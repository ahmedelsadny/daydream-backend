import React, { useState } from 'react';
import { usePos } from '../context/PosContext';

export default function CartTable() {
  const { 
    cartItems, 
    updateItemQuantity, 
    removeItem, 
    barcodeInputRef, 
    processBarcodeScan, 
    setIsSearchOpen,
    setIsPaymentOpen
  } = usePos();

  const [barcodeInputVal, setBarcodeInputVal] = useState('');

  const handleBarcodeKeyDown = async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const raw = barcodeInputVal.trim();

      // If input is empty and cart has items, Enter opens the Payment Modal directly!
      if (!raw) {
        if (cartItems.length > 0) {
          setIsPaymentOpen(true);
        }
        return;
      }

      // Check if cashier entered multiplier syntax: e.g. "5*6221234"
      if (raw.includes('*')) {
        const parts = raw.split('*');
        const qty = parseFloat(parts[0]);
        const code = parts[1]?.trim();
        if (!isNaN(qty) && qty > 0 && code) {
          setBarcodeInputVal('');
          // We can process scan and then adjust the quantity of the added item
          await processBarcodeScan(code);
          return;
        }
      }

      setBarcodeInputVal('');
      await processBarcodeScan(raw);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Continuous Barcode Input Header */}
      <div className="barcode-input-container">
        <div className="barcode-input-wrapper">
          <span className="barcode-input-icon">🔍</span>
          <input
            ref={barcodeInputRef}
            type="text"
            className="barcode-input"
            placeholder="امسح الباركود بالسكانر أو اكتب الكود واضغط Enter..."
            value={barcodeInputVal}
            onChange={(e) => setBarcodeInputVal(e.target.value)}
            onKeyDown={handleBarcodeKeyDown}
            autoFocus
          />
        </div>

        {/* F1 Quick Search Button */}
        <button 
          className="btn-quick-search"
          onClick={() => setIsSearchOpen(true)}
          title="البحث عن صنف بالاسم (F1)"
        >
          <span>🔎 بحث (F1)</span>
        </button>
      </div>

      {/* Cart Items Table */}
      <div className="cart-table-wrapper">
        {cartItems.length === 0 ? (
          <div className="cart-empty-state">
            <div className="cart-empty-icon">🛒</div>
            <h3 style={{ fontWeight: 800, color: 'var(--text-secondary)' }}>السلة فارغة حالياً</h3>
            <p style={{ fontSize: '0.9rem', maxWidth: '300px', textAlign: 'center' }}>
              امسح باركود أي سلعة أو اختر من أزرار اللمس السريعة للبدء في الفاتورة.
            </p>
          </div>
        ) : (
          <table className="cart-table">
            <thead>
              <tr>
                <th style={{ width: '45%' }}>الصنف والبيان</th>
                <th style={{ width: '25%', textAlign: 'center' }}>الكمية / الوزن</th>
                <th style={{ width: '15%', textAlign: 'center' }}>السعر</th>
                <th style={{ width: '15%', textAlign: 'center' }}>الإجمالي</th>
                <th style={{ width: '5%' }}></th>
              </tr>
            </thead>
            <tbody>
              {cartItems.map((item, idx) => (
                <tr key={item.cartItemId} className="cart-row">
                  {/* Name & Unit Details */}
                  <td>
                    <div className="item-name-cell">
                      <span>{item.name}</span>
                      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                        <span className="item-sku">كود: {item.sku}</span>
                        {item.unitName && (
                          <span className="item-badge" style={{ background: 'var(--color-blue-glow)', color: '#60a5fa' }}>
                            📦 {item.unitName} (x{item.conversionFactor})
                          </span>
                        )}
                        {item.isScaleItem && (
                          <span className="item-badge" style={{ background: 'var(--color-amber-glow)', color: '#fbbf24' }}>
                            ⚖️ وزن ميزان
                          </span>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Quantity / Weight Controls */}
                  <td style={{ textAlign: 'center' }}>
                    <div className="qty-control" style={{ justifyContent: 'center' }}>
                      <button 
                        className="btn-qty"
                        onClick={() => updateItemQuantity(item.cartItemId, item.quantity - (item.isWeighted ? 0.05 : 1))}
                        title="إنقاص الكمية"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        step={item.isWeighted ? '0.001' : '1'}
                        className="qty-display"
                        style={{
                          background: 'var(--bg-elevated)',
                          border: '1px solid var(--border-normal)',
                          color: '#fff',
                          borderRadius: '6px',
                          padding: '0.2rem',
                          width: item.isWeighted ? '75px' : '55px'
                        }}
                        value={item.quantity}
                        onChange={(e) => updateItemQuantity(item.cartItemId, e.target.value)}
                      />
                      <button 
                        className="btn-qty"
                        onClick={() => updateItemQuantity(item.cartItemId, item.quantity + (item.isWeighted ? 0.05 : 1))}
                        title="زيادة الكمية"
                      >
                        +
                      </button>
                    </div>
                  </td>

                  {/* Unit Price */}
                  <td style={{ textAlign: 'center' }}>
                    <span className="price-cell">{item.unitPrice.toFixed(2)}</span>
                  </td>

                  {/* Total Line Amount */}
                  <td style={{ textAlign: 'center' }}>
                    <span className="total-cell">{item.totalPrice.toFixed(2)}</span>
                  </td>

                  {/* Delete Item */}
                  <td style={{ textAlign: 'center' }}>
                    <button 
                      className="btn-delete-row"
                      onClick={() => removeItem(item.cartItemId)}
                      title="حذف الصنف (Delete)"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
