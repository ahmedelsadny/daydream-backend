import React, { useState } from 'react';
import { usePos } from '../context/PosContext';

const DEFAULT_CATEGORIES = [
  { id: 'all', name: '⭐ الكل / الشائعة' },
  { id: 'bakery', name: '🥖 مخبوزات وعيش' },
  { id: 'dairy', name: '🧀 ألبان وأجبان' },
  { id: 'produce', name: '🍎 خضار وفاكهة' },
  { id: 'beverages', name: '🥤 مياه ومشروبات' },
  { id: 'snacks', name: '🍫 تسالي وشوكولاتة' }
];

const DEFAULT_QUICK_TILES = [
  { id: 'def-1', name: 'عيش بلدي مدعم (5 أرغفة)', price: 5.00, category: 'bakery', icon: '🫓', isWeighted: false, unit: 'ربطة' },
  { id: 'def-2', name: 'فينو سوبر ماركت (باكت)', price: 15.00, category: 'bakery', icon: '🥖', isWeighted: false, unit: 'باكت' },
  { id: 'def-3', name: 'جبنة بيضاء براميلي بالكيلو', price: 180.00, category: 'dairy', icon: '🧀', isWeighted: true, unit: 'كجم' },
  { id: 'def-4', name: 'جبنة رومي قديم بالكيلو', price: 320.00, category: 'dairy', icon: '🧀', isWeighted: true, unit: 'كجم' },
  { id: 'def-5', name: 'لبن بخيره 1 لتر', price: 42.00, category: 'dairy', icon: '🥛', isWeighted: false, unit: 'علبة' },
  { id: 'def-6', name: 'طماطم بلدي فرز أول', price: 20.00, category: 'produce', icon: '🍅', isWeighted: true, unit: 'كجم' },
  { id: 'def-7', name: 'خيار بلدي طازج', price: 25.00, category: 'produce', icon: '🥒', isWeighted: true, unit: 'كجم' },
  { id: 'def-8', name: 'موز بلدي فاخر', price: 30.00, category: 'produce', icon: '🍌', isWeighted: true, unit: 'كجم' },
  { id: 'def-9', name: 'زجاجة مياه معدنية 1.5 لتر', price: 10.00, category: 'beverages', icon: '💧', isWeighted: false, unit: 'زجاجة' },
  { id: 'def-10', name: 'كانز بيبسي 330 مل', price: 18.00, category: 'beverages', icon: '🥤', isWeighted: false, unit: 'كانز' },
  { id: 'def-11', name: 'شيبسي عائلي جامبو', price: 20.00, category: 'snacks', icon: '🥔', isWeighted: false, unit: 'كيس' },
  { id: 'def-12', name: 'شوكولاتة مورو كلاسيك', price: 15.00, category: 'snacks', icon: '🍫', isWeighted: false, unit: 'قطعة' },
  { id: 'def-13', name: 'كيس سكر أبيض 1 كجم', price: 35.00, category: 'all', icon: '🌾', isWeighted: false, unit: 'كيس' },
  { id: 'def-14', name: 'زجاجة زيت ذرة 800 مل', price: 75.00, category: 'all', icon: '🍾', isWeighted: false, unit: 'زجاجة' },
  { id: 'def-15', name: 'كيس مكرونة فرن 400 جم', price: 15.00, category: 'all', icon: '🍝', isWeighted: false, unit: 'كيس' },
  { id: 'def-16', name: 'أكياس تسوق بلاستيك كبيرة', price: 2.00, category: 'all', icon: '🛍️', isWeighted: false, unit: 'قطعة' }
];

export default function QuickTouchGrid() {
  const { favorites, addToCart } = usePos();
  const [activeCategory, setActiveCategory] = useState('all');

  // Combine loaded backend favorites with default common supermarket items
  const itemsToDisplay = favorites.length > 0 ? favorites : DEFAULT_QUICK_TILES;

  const filteredItems = itemsToDisplay.filter(item => {
    if (activeCategory === 'all') return true;
    return item.category === activeCategory;
  });

  const handleTileClick = (item) => {
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
  };

  return (
    <div className="pos-touch-panel">
      {/* Categories Bar */}
      <div className="categories-bar">
        {DEFAULT_CATEGORIES.map(cat => (
          <button
            key={cat.id}
            className={`btn-category ${activeCategory === cat.id ? 'active' : ''}`}
            onClick={() => setActiveCategory(cat.id)}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Touch Cards Grid */}
      <div className="products-grid">
        {filteredItems.map(item => (
          <div
            key={item.id}
            className="product-card"
            onClick={() => handleTileClick(item)}
            title={`اضغط للإضافة للسلة: ${item.name}`}
          >
            <div className="product-card-icon">{item.icon || '🏷️'}</div>
            <div className="product-card-title">{item.name}</div>
            <div className="product-card-price">
              {parseFloat(item.price).toFixed(2)} ج.م
              {item.isWeighted && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}> /كجم</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
