import React, { useState, useEffect } from 'react';
import { usePos } from '../context/PosContext';
import { posApi } from '../services/api';
import { soundEffects } from '../services/soundEffects';

export default function Header() {
  const { 
    user, 
    shift, 
    isShiftActive, 
    drawerCash, 
    heldOrders, 
    setIsShiftModalOpen, 
    setIsHeldOrdersOpen,
    handleLogout 
  } = usePos();

  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleManualDrawerKick = async () => {
    try {
      soundEffects.playCashChime();
      await posApi.manualDrawerKick('فتح يدوي للدرج من شاشة الكاشير (F12)');
      alert('تم إرسال إشارة فتح درج الكاشير وتسجيلها في سجل الرقابة.');
    } catch (err) {
      alert('تنبيه: ' + err.message);
    }
  };

  const formattedTime = currentTime.toLocaleTimeString('ar-EG', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  return (
    <header className="pos-header">
      {/* Brand & Logo */}
      <div className="pos-brand">
        <div className="pos-brand-icon">🛒</div>
        <div>
          <h1 className="pos-brand-title">DAYDREAM POS</h1>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>نظام كاشير السوبر ماركت</span>
        </div>
      </div>

      {/* Shift & Cashier Status */}
      <div className="pos-shift-info">
        {/* Active Shift Indicator */}
        <div 
          className="shift-badge" 
          onClick={() => setIsShiftModalOpen(true)}
          style={{ cursor: 'pointer' }}
          title="إدارة الوردية والدرج"
        >
          <div className={`status-dot ${isShiftActive ? '' : 'inactive'}`}></div>
          <span>
            {isShiftActive ? (
              <>
                <strong>وردية مفتوحة</strong> (#{String(shift?.id || '').substring(0, 5)})
              </>
            ) : (
              <strong style={{ color: 'var(--color-rose)' }}>الوردية مغلقة (اضغط للفتح)</strong>
            )}
          </span>
        </div>

        {/* Current Drawer Cash Display */}
        {isShiftActive && (
          <div className="shift-badge" style={{ borderColor: 'var(--color-emerald)', background: 'rgba(16, 185, 129, 0.08)' }}>
            <span style={{ color: 'var(--color-emerald)', fontWeight: 800 }}>💵 نقدية الدرج:</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#fff' }}>
              {drawerCash.toFixed(2)} ج.م
            </span>
          </div>
        )}

        {/* Cashier Name */}
        <div className="shift-badge">
          <span>👤 {user ? user.name : 'الكاشير'}</span>
        </div>

        {/* Live Digital Clock */}
        <div className="shift-badge" style={{ fontFamily: 'var(--font-mono)', letterSpacing: '1px' }}>
          🕒 {formattedTime}
        </div>
      </div>

      {/* Quick Action Header Buttons */}
      <div className="header-actions">
        {/* Held Orders Recall Badge */}
        <button 
          className={`btn-header ${heldOrders.length > 0 ? 'active-highlight' : ''}`}
          onClick={() => setIsHeldOrdersOpen(true)}
          title="استرجاع الفواتير المعلقة (F7)"
        >
          📥 المعلق ({heldOrders.length})
        </button>

        {/* Shift Management */}
        <button 
          className="btn-header"
          onClick={() => setIsShiftModalOpen(true)}
          title="إدارة الوردية والخزينة"
        >
          💼 الوردية
        </button>

        {/* Drawer Kick Button */}
        <button 
          className="btn-header"
          onClick={handleManualDrawerKick}
          title="فتح درج النقدية يدوياً (F12)"
          style={{ color: '#38bdf8' }}
        >
          ⚡ فتح الدرج (F12)
        </button>

        {/* Logout */}
        <button 
          className="btn-header"
          onClick={handleLogout}
          style={{ color: 'var(--color-rose)', borderColor: 'rgba(239, 68, 68, 0.3)' }}
          title="تسجيل الخروج"
        >
          🚪 خروج
        </button>
      </div>
    </header>
  );
}
