import React, { useEffect } from 'react';
import { usePos } from '../context/PosContext';
import { posApi } from '../services/api';
import { soundEffects } from '../services/soundEffects';

export default function FooterShortcuts() {
  const { 
    isPaymentOpen, 
    setIsPaymentOpen, 
    isSearchOpen, 
    setIsSearchOpen, 
    isHeldOrdersOpen, 
    setIsHeldOrdersOpen,
    isShiftModalOpen,
    setIsShiftModalOpen,
    isReceiptOpen,
    setIsReceiptOpen,
    cartItems,
    holdCurrentCart,
    refocusBarcode
  } = usePos();

  // Global Keyboard Shortcuts Listener
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      // Don't intercept if user is typing inside an open modal input (except ESC)
      const isAnyModalOpen = isPaymentOpen || isSearchOpen || isHeldOrdersOpen || isShiftModalOpen || isReceiptOpen;

      if (e.key === 'Escape') {
        setIsPaymentOpen(false);
        setIsSearchOpen(false);
        setIsHeldOrdersOpen(false);
        setIsShiftModalOpen(false);
        setIsReceiptOpen(false);
        refocusBarcode();
        return;
      }

      // If a modal is open, let that modal handle its own Enter/Keys
      if (isAnyModalOpen) {
        return;
      }

      // F1: Quick Product Search Modal
      if (e.key === 'F1') {
        e.preventDefault();
        setIsSearchOpen(true);
      }
      // F6: Hold Current Cart
      else if (e.key === 'F6') {
        e.preventDefault();
        if (cartItems.length > 0) {
          const note = prompt('ملاحظة على الفاتورة المعلقة:');
          holdCurrentCart(note);
        }
      }
      // F7: Recall Held Orders
      else if (e.key === 'F7') {
        e.preventDefault();
        setIsHeldOrdersOpen(true);
      }
      // F9: Shift & Drawer Control
      else if (e.key === 'F9') {
        e.preventDefault();
        setIsShiftModalOpen(true);
      }
      // F12: Open Cash Drawer Pulse
      else if (e.key === 'F12') {
        e.preventDefault();
        soundEffects.playCashChime();
        posApi.manualDrawerKick('فتح يدوي للدرج (F12)').catch(console.warn);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [
    isPaymentOpen, 
    isSearchOpen, 
    isHeldOrdersOpen, 
    isShiftModalOpen, 
    isReceiptOpen, 
    cartItems
  ]);

  return (
    <footer className="pos-footer">
      <div className="shortcuts-list">
        <div className="shortcut-pill">
          <span className="shortcut-key">Enter</span>
          <span>الدفع كاش</span>
        </div>
        <div className="shortcut-pill">
          <span className="shortcut-key">F1</span>
          <span>بحث بالاسم</span>
        </div>
        <div className="shortcut-pill">
          <span className="shortcut-key">F6</span>
          <span>تعليق السلة</span>
        </div>
        <div className="shortcut-pill">
          <span className="shortcut-key">F7</span>
          <span>استرجاع معلق</span>
        </div>
        <div className="shortcut-pill">
          <span className="shortcut-key">F9</span>
          <span>الوردية</span>
        </div>
        <div className="shortcut-pill">
          <span className="shortcut-key">F12</span>
          <span>فتح الدرج</span>
        </div>
        <div className="shortcut-pill">
          <span className="shortcut-key">Esc</span>
          <span>إلغاء / خروج</span>
        </div>
      </div>

      <div>
        <span>نظام الكاشير السريع v2.5 • 🟢 متصل محلياً</span>
      </div>
    </footer>
  );
}
