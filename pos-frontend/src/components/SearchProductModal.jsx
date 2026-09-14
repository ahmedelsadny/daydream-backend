import React, { useState, useEffect, useRef } from 'react';
import { usePos } from '../context/PosContext';

export default function SearchProductModal() {
  const { isSearchOpen, setIsSearchOpen, productsCache, addToCart } = usePos();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isSearchOpen) {
      setSearchTerm('');
      setSelectedIndex(0);
      setTimeout(() => {
        if (inputRef.current) inputRef.current.focus();
      }, 50);
    }
  }, [isSearchOpen]);

  if (!isSearchOpen) return null;

  const filtered = productsCache.filter(p => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return true;
    return (
      (p.name && p.name.toLowerCase().includes(term)) ||
      (p.barcode && p.barcode.includes(term)) ||
      (p.sku && p.sku.toLowerCase().includes(term)) ||
      (p.scaleCode && String(p.scaleCode).includes(term))
    );
  }).slice(0, 30); // Show top 30 matches

  const handleSelectItem = (item) => {
    if (item.isWeighted) {
      const weightStr = prompt(`أدخل الوزن المطلوب بالكيلو جرام لـ (${item.name}):`, '0.250');
      if (weightStr) {
        const parsedWeight = parseFloat(weightStr);
        if (!isNaN(parsedWeight) && parsedWeight > 0) {
          addToCart(item, parsedWeight, { isScaleItem: true, scaleWeight: parsedWeight });
        }
      }
    } else {
      addToCart(item, 1);
    }
    setIsSearchOpen(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev < filtered.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        handleSelectItem(filtered[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsSearchOpen(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={() => setIsSearchOpen(false)}>
      <div 
        className="modal-card" 
        style={{ maxWidth: '650px' }} 
        onClick={(e) => e.stopPropagation()} 
        onKeyDown={handleKeyDown}
      >
        <div className="modal-header">
          <h2 className="modal-title">🔎 البحث السريع عن الأصناف (F1)</h2>
          <button className="modal-close-btn" onClick={() => setIsSearchOpen(false)}>✕</button>
        </div>

        <div className="modal-body" style={{ padding: '1rem' }}>
          {/* Search Box */}
          <input
            ref={inputRef}
            type="text"
            className="barcode-input"
            style={{ marginBottom: '1rem', width: '100%', direction: 'rtl', textAlign: 'right' }}
            placeholder="اكتب اسم الصنف أو جزء من الباركود أو الكود..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setSelectedIndex(0);
            }}
          />

          {/* Results List */}
          <div style={{ maxHeight: '380px', overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                لا توجد أصناف مطابقة للبحث
              </div>
            ) : (
              <table className="cart-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>اسم الصنف</th>
                    <th>الباركود / الكود</th>
                    <th>السعر</th>
                    <th>النوع</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item, idx) => (
                    <tr
                      key={item.id}
                      className={`cart-row ${idx === selectedIndex ? 'selected-item' : ''}`}
                      onClick={() => handleSelectItem(item)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>
                        <strong style={{ fontSize: '0.95rem' }}>{item.name}</strong>
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        {item.barcode || item.sku || '-'}
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, color: 'var(--color-emerald)' }}>
                        {parseFloat(item.price || 0).toFixed(2)} ج.م
                      </td>
                      <td>
                        <span className="item-badge">
                          {item.isWeighted ? '⚖️ بالوزن' : '📦 بالقطعة'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'left' }}>
            تنقل بالأسهم (↑ ↓) واضغط <strong>Enter</strong> للاختيار، أو <strong>Esc</strong> للإلغاء
          </div>
        </div>
      </div>
    </div>
  );
}
