import React, { useState, useMemo } from 'react';
import { usePos } from '../context/PosContext';

// Icon map to automatically assign emoji icons to category names
const CATEGORY_ICON_MAP = {
  'مخبوزات': '🥖', 'خبز': '🥖', 'عيش': '🥖', 'bakery': '🥖',
  'ألبان': '🧀', 'جبن': '🧀', 'dairy': '🧀',
  'خضار': '🥦', 'خضروات': '🥦', 'produce': '🥦',
  'فاكهة': '🍎', 'fruits': '🍎',
  'لحوم': '🥩', 'meat': '🥩',
  'مشروبات': '🥤', 'beverages': '🥤', 'مياه': '💧',
  'تسالي': '🍫', 'شوكولاتة': '🍫', 'snacks': '🍫',
  'منظفات': '🧹', 'cleaning': '🧹',
  'معلبات': '🥫', 'canned': '🥫',
  'حبوب': '🌾', 'grains': '🌾',
  'زيوت': '🍾', 'oils': '🍾',
  'توابل': '🧂', 'spices': '🧂',
  'مجمد': '🧊', 'frozen': '🧊',
};

function getCategoryIcon(name = '') {
  const lower = name.toLowerCase().trim();
  for (const [key, icon] of Object.entries(CATEGORY_ICON_MAP)) {
    if (lower.includes(key.toLowerCase())) return icon;
  }
  return '📦';
}

function getProductIcon(product) {
  if (product.category?.name) {
    return getCategoryIcon(product.category.name);
  }
  if (product.isWeighted) return '⚖️';
  return '🏷️';
}

// Skeleton loader card
function SkeletonCard() {
  return (
    <div className="product-card" style={{ opacity: 0.4, cursor: 'default', animation: 'pulse 1.5s infinite' }}>
      <div style={{ fontSize: '2rem' }}>⬜</div>
      <div style={{ height: '0.75rem', background: 'var(--surface-3)', borderRadius: 4, margin: '0.5rem 0', width: '70%' }} />
      <div style={{ height: '0.6rem', background: 'var(--surface-3)', borderRadius: 4, width: '40%' }} />
    </div>
  );
}

export default function QuickTouchGrid() {
  const { favorites, categories, addToCart } = usePos();
  const [activeCategory, setActiveCategory] = useState('all');

  // Build dynamic category tabs from backend categories that have at least one favorite product
  const activeCategoriesFromFavorites = useMemo(() => {
    const catIds = new Set(favorites.map(f => f.category?.id).filter(Boolean));
    return categories.filter(c => catIds.has(c.id));
  }, [favorites, categories]);

  // Filter favorites by active category
  const filteredItems = useMemo(() => {
    if (activeCategory === 'all') return favorites;
    return favorites.filter(item => item.category?.id === activeCategory);
  }, [favorites, activeCategory]);

  const handleTileClick = (item) => {
    if (item.isWeighted) {
      const weightStr = prompt(`أدخل الوزن بالكيلو جرام لـ (${item.name}):`, '0.250');
      if (weightStr) {
        const parsedWeight = parseFloat(weightStr);
        if (!isNaN(parsedWeight) && parsedWeight > 0) {
          addToCart(item, parsedWeight, { isScaleItem: true, scaleWeight: parsedWeight });
        }
      }
    } else {
      addToCart(item, 1);
    }
  };

  // Loading state (before API data arrives)
  const isLoading = categories.length === 0 && favorites.length === 0;

  return (
    <div className="pos-touch-panel">
      {/* Dynamic Categories Bar — from API */}
      <div className="categories-bar">
        <button
          className={`btn-category ${activeCategory === 'all' ? 'active' : ''}`}
          onClick={() => setActiveCategory('all')}
        >
          ⭐ الكل
        </button>
        {activeCategoriesFromFavorites.map(cat => (
          <button
            key={cat.id}
            className={`btn-category ${activeCategory === cat.id ? 'active' : ''}`}
            onClick={() => setActiveCategory(cat.id)}
          >
            {getCategoryIcon(cat.name)} {cat.name}
          </button>
        ))}
      </div>

      {/* Products Grid */}
      <div className="products-grid">
        {/* Loading State */}
        {isLoading && (
          Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)
        )}

        {/* Empty State — API connected but no favorites set */}
        {!isLoading && favorites.length === 0 && (
          <div style={{
            gridColumn: '1 / -1',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
            gap: '0.75rem',
            color: 'var(--text-muted)',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '3rem' }}>🏷️</div>
            <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-secondary)' }}>
              لا توجد منتجات مفضلة بعد
            </div>
            <div style={{ fontSize: '0.82rem', lineHeight: 1.7, maxWidth: '260px' }}>
              من لوحة الإدارة، أضف منتجات وفعّل خاصية <strong>المفضلة</strong> عليها لتظهر هنا في شاشة الكاشير.
            </div>
            <div style={{
              marginTop: '0.5rem',
              padding: '0.5rem 1rem',
              background: 'var(--surface-2)',
              borderRadius: 8,
              fontSize: '0.78rem',
              direction: 'ltr',
              fontFamily: 'monospace'
            }}>
              PATCH /api/v1/products/:id<br />
              {'{ "isFavorite": true }'}
            </div>
          </div>
        )}

        {/* No results for selected category filter */}
        {!isLoading && favorites.length > 0 && filteredItems.length === 0 && (
          <div style={{
            gridColumn: '1 / -1',
            textAlign: 'center',
            padding: '2rem',
            color: 'var(--text-muted)',
            fontSize: '0.9rem'
          }}>
            لا يوجد منتجات مفضلة في هذا القسم
          </div>
        )}

        {/* Real Products — from API */}
        {filteredItems.map(item => (
          <div
            key={item.id}
            className="product-card"
            onClick={() => handleTileClick(item)}
            title={`اضغط للإضافة: ${item.name} — ${parseFloat(item.price).toFixed(2)} ج.م`}
          >
            <div className="product-card-icon">{getProductIcon(item)}</div>
            <div className="product-card-title">{item.name}</div>
            <div className="product-card-price">
              {parseFloat(item.price).toFixed(2)} ج.م
              {item.isWeighted && (
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginRight: '0.2rem' }}>
                  /كجم
                </span>
              )}
            </div>
            {item.availableQuantity !== undefined && item.availableQuantity <= 0 && (
              <div style={{
                fontSize: '0.65rem',
                color: 'var(--color-rose)',
                marginTop: '0.15rem',
                fontWeight: 700
              }}>
                نفد المخزون
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
