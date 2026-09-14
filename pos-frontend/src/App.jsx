import React from 'react';
import { PosProvider } from './context/PosContext';
import Header from './components/Header';
import CartTable from './components/CartTable';
import TotalSection from './components/TotalSection';
import QuickTouchGrid from './components/QuickTouchGrid';
import FooterShortcuts from './components/FooterShortcuts';
import PaymentModal from './components/PaymentModal';
import SearchProductModal from './components/SearchProductModal';
import HeldOrdersModal from './components/HeldOrdersModal';
import ShiftModal from './components/ShiftModal';
import ReceiptPreviewModal from './components/ReceiptPreviewModal';
import LoginModal from './components/LoginModal';

function PosTerminal() {
  return (
    <div className="pos-app">
      {/* Header Bar */}
      <Header />

      {/* Main Split Body */}
      <main className="pos-body">
        {/* Left Column: Live Cart & Totals (60%) */}
        <section className="pos-cart-panel">
          <CartTable />
          <TotalSection />
        </section>

        {/* Right Column: Quick Touch Grid & Favorites (40%) */}
        <QuickTouchGrid />
      </main>

      {/* Footer Keyboard Shortcuts Bar */}
      <FooterShortcuts />

      {/* Interactive Flow Modals */}
      <PaymentModal />
      <SearchProductModal />
      <HeldOrdersModal />
      <ShiftModal />
      <ReceiptPreviewModal />
      <LoginModal />
    </div>
  );
}

export default function App() {
  return (
    <PosProvider>
      <PosTerminal />
    </PosProvider>
  );
}
