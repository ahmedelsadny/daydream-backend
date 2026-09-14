import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { posApi, getToken, setToken, removeToken } from '../services/api';
import { soundEffects } from '../services/soundEffects';
import { parseScaleBarcode } from '../services/scaleBarcodeParser';

const PosContext = createContext(null);

export function PosProvider({ children }) {
  // Auth & Session
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('DAYDREAM_POS_USER');
    return saved ? JSON.parse(saved) : null;
  });
  const [token, setAuthToken] = useState(getToken());

  // Shift & Cash Drawer
  const [shift, setShift] = useState(null);
  const [isShiftActive, setIsShiftActive] = useState(false);
  const [drawerCash, setDrawerCash] = useState(0);

  // Cart & Sales
  const [cartItems, setCartItems] = useState([]);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [customerNotes, setCustomerNotes] = useState('');

  // Local Product Catalog Cache (0ms Instant Barcode Response)
  const [productsCache, setProductsCache] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [heldOrders, setHeldOrders] = useState([]);

  // Modals Visibility
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isHeldOrdersOpen, setIsHeldOrdersOpen] = useState(false);
  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const [lastReceiptData, setLastReceiptData] = useState(null);

  // Barcode Continuous Focus Ref
  const barcodeInputRef = useRef(null);

  // Focus barcode input whenever no modal is open
  const refocusBarcode = () => {
    setTimeout(() => {
      if (barcodeInputRef.current && !isPaymentOpen && !isSearchOpen && !isHeldOrdersOpen && !isShiftModalOpen && !isReceiptOpen) {
        barcodeInputRef.current.focus();
      }
    }, 50);
  };

  // Initial Load: Check Auth, Shift, and Cache Products
  useEffect(() => {
    if (token) {
      loadInitialData();
    }
  }, [token]);

  // Keep barcode input auto-focused on click anywhere
  useEffect(() => {
    const handleGlobalClick = (e) => {
      // Don't steal focus if clicking inside an input, textarea, or button
      if (['INPUT', 'TEXTAREA', 'BUTTON', 'SELECT'].includes(e.target.tagName)) {
        return;
      }
      refocusBarcode();
    };

    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, [isPaymentOpen, isSearchOpen, isHeldOrdersOpen, isShiftModalOpen, isReceiptOpen]);

  const loadInitialData = async () => {
    try {
      // 1. Fetch current active shift
      try {
        const shiftRes = await posApi.getCurrentShift();
        if (shiftRes && shiftRes.shift && shiftRes.shift.status === 'active') {
          setShift(shiftRes.shift);
          setIsShiftActive(true);
          setDrawerCash(parseFloat(shiftRes.shift.expectedBalance || shiftRes.shift.openingBalance || 0));
        } else {
          setShift(null);
          setIsShiftActive(false);
        }
      } catch (shiftErr) {
        console.warn('Could not fetch active shift:', shiftErr.message);
      }

      // 2. Load and cache products
      try {
        const prodRes = await posApi.fetchProducts();
        const list = prodRes.products || (Array.isArray(prodRes) ? prodRes : []);
        setProductsCache(list);
      } catch (prodErr) {
        console.warn('Could not cache products:', prodErr.message);
      }

      // 3. Load favorites
      try {
        const favRes = await posApi.fetchFavorites();
        setFavorites(favRes.favorites || []);
      } catch (favErr) {
        console.warn('Could not load favorites:', favErr.message);
      }

      // 4. Load held orders
      try {
        const heldRes = await posApi.getHeldOrders();
        setHeldOrders(heldRes.heldOrders || []);
      } catch (heldErr) {
        console.warn('Could not load held orders:', heldErr.message);
      }
    } catch (err) {
      console.error('Error loading initial POS data:', err);
    }
  };

  // Auth Handlers
  const handleLogin = (userData, userToken) => {
    setUser(userData);
    setAuthToken(userToken);
    setToken(userToken);
    localStorage.setItem('DAYDREAM_POS_USER', JSON.stringify(userData));
    loadInitialData();
  };

  const handleLogout = () => {
    setUser(null);
    setAuthToken('');
    removeToken();
    localStorage.removeItem('DAYDREAM_POS_USER');
    setShift(null);
    setIsShiftActive(false);
    setCartItems([]);
  };

  // Cart Management
  const addToCart = (product, quantity = 1, options = {}) => {
    const qtyToAdd = parseFloat(quantity) || 1;
    const isWeighted = Boolean(product.isWeighted);
    const unitPrice = parseFloat(options.customPrice !== undefined ? options.customPrice : (product.price || 0));
    const costPrice = parseFloat(product.cost || 0);

    setCartItems(prevItems => {
      // If it's a piece (non-weighted) and already exists with same unit, increment quantity
      const existingIdx = prevItems.findIndex(item => 
        item.productId === product.id && 
        item.unitId === options.unitId &&
        !isWeighted && !options.isScaleItem
      );

      if (existingIdx !== -1) {
        const updated = [...prevItems];
        const newQty = updated[existingIdx].quantity + qtyToAdd;
        updated[existingIdx] = {
          ...updated[existingIdx],
          quantity: newQty,
          totalPrice: parseFloat((newQty * updated[existingIdx].unitPrice).toFixed(2))
        };
        soundEffects.playScanBeep();
        return updated;
      }

      // New entry in cart
      soundEffects.playScanBeep();
      const newItem = {
        cartItemId: Date.now() + Math.random().toString(36).substr(2, 4),
        productId: product.id,
        name: product.name,
        sku: product.sku,
        unitPrice: unitPrice,
        costPrice: costPrice,
        quantity: qtyToAdd,
        isWeighted: isWeighted,
        isScaleItem: Boolean(options.isScaleItem),
        scaleWeight: options.scaleWeight || null,
        unit: product.unit || 'piece',
        unitId: options.unitId || null,
        unitName: options.unitName || null,
        conversionFactor: options.conversionFactor || 1,
        totalPrice: parseFloat((qtyToAdd * unitPrice).toFixed(2))
      };

      return [newItem, ...prevItems];
    });

    refocusBarcode();
  };

  const updateItemQuantity = (cartItemId, newQty) => {
    const qty = parseFloat(newQty);
    if (isNaN(qty) || qty <= 0) {
      removeItem(cartItemId);
      return;
    }

    setCartItems(prev => prev.map(item => {
      if (item.cartItemId === cartItemId) {
        return {
          ...item,
          quantity: qty,
          totalPrice: parseFloat((qty * item.unitPrice).toFixed(2))
        };
      }
      return item;
    }));
  };

  const removeItem = (cartItemId) => {
    setCartItems(prev => prev.filter(item => item.cartItemId !== cartItemId));
    refocusBarcode();
  };

  const clearCart = () => {
    setCartItems([]);
    setDiscountAmount(0);
    setCustomerNotes('');
    refocusBarcode();
  };

  // Barcode Scanner Handler (0ms Instant Lookups & Scale Decodings)
  const processBarcodeScan = async (rawCode) => {
    if (!rawCode || !rawCode.trim()) return;
    const cleanCode = rawCode.trim();

    // 1. Check if it's an electronic scale barcode (Type 20/21)
    const scaleInfo = parseScaleBarcode(cleanCode);
    if (scaleInfo.isScaleBarcode) {
      // Find product by scaleCode / PLU in local cache
      const scaleProduct = productsCache.find(p => 
        String(p.scaleCode) === scaleInfo.itemCode || 
        String(p.sku) === scaleInfo.itemCode ||
        (p.barcode && p.barcode.endsWith(scaleInfo.itemCode))
      );

      if (scaleProduct) {
        addToCart(scaleProduct, scaleInfo.weight, {
          isScaleItem: true,
          scaleWeight: scaleInfo.weight
        });
        return;
      }
    }

    // 2. Search in local product cache for instant 0ms match
    const localMatch = productsCache.find(p => 
      p.barcode === cleanCode || 
      p.sku === cleanCode ||
      (p.ProductUnits && p.ProductUnits.some(u => u.barcode === cleanCode))
    );

    if (localMatch) {
      // Check if the barcode matched a specific packaging unit (e.g. carton)
      let unitOpt = {};
      if (localMatch.ProductUnits) {
        const matchedUnit = localMatch.ProductUnits.find(u => u.barcode === cleanCode);
        if (matchedUnit) {
          unitOpt = {
            unitId: matchedUnit.id,
            unitName: matchedUnit.unitName,
            customPrice: parseFloat(matchedUnit.sellingPrice),
            conversionFactor: parseFloat(matchedUnit.conversionFactor)
          };
        }
      }
      addToCart(localMatch, 1, unitOpt);
      return;
    }

    // 3. Fallback: Query backend API for new or un-cached product
    try {
      const res = await posApi.findProductByBarcode(cleanCode);
      if (res && res.product) {
        const p = res.product;
        // Update local cache
        setProductsCache(prev => [p, ...prev]);

        let unitOpt = {};
        if (res.isUnit && res.unit) {
          unitOpt = {
            unitId: res.unit.id,
            unitName: res.unit.unitName,
            customPrice: parseFloat(res.unit.sellingPrice),
            conversionFactor: parseFloat(res.unit.conversionFactor)
          };
        }
        addToCart(p, 1, unitOpt);
      } else {
        soundEffects.playErrorBuzz();
        alert(`عذراً: الصنف ذو الباركود (${cleanCode}) غير مسجل في النظام.`);
      }
    } catch (err) {
      soundEffects.playErrorBuzz();
      alert(`الباركود (${cleanCode}) غير موجود.`);
    }
  };

  // Hold & Recall Carts
  const holdCurrentCart = async (note = '') => {
    if (cartItems.length === 0) return;
    try {
      const payload = {
        cartItems: cartItems,
        customerNote: note || `سلة معلقة ${new Date().toLocaleTimeString('ar-EG')}`,
        branchId: user?.branchId
      };
      const res = await posApi.holdOrder(payload);
      if (res && res.heldOrder) {
        setHeldOrders(prev => [res.heldOrder, ...prev]);
        clearCart();
        alert('تم تعليق الفاتورة بنجاح.');
      }
    } catch (err) {
      alert('خطأ أثناء تعليق الفاتورة: ' + err.message);
    }
  };

  const recallHeldCart = async (heldOrder) => {
    try {
      if (cartItems.length > 0) {
        if (!confirm('السلة الحالية بها أصناف، هل تريد استبدالها بالسلة المعلقة؟')) {
          return;
        }
      }
      const items = typeof heldOrder.cartItems === 'string' ? JSON.parse(heldOrder.cartItems) : heldOrder.cartItems;
      setCartItems(items || []);
      // Delete from held orders
      await posApi.deleteHeldOrder(heldOrder.id);
      setHeldOrders(prev => prev.filter(h => h.id !== heldOrder.id));
      setIsHeldOrdersOpen(false);
      refocusBarcode();
    } catch (err) {
      alert('خطأ أثناء استرجاع السلة: ' + err.message);
    }
  };

  // Totals Calculations
  const subtotal = cartItems.reduce((sum, item) => sum + item.totalPrice, 0);
  const grandTotal = Math.max(0, subtotal - discountAmount);
  const totalItemsCount = cartItems.reduce((sum, item) => sum + (item.isWeighted ? 1 : item.quantity), 0);

  const value = {
    // Auth
    user,
    token,
    handleLogin,
    handleLogout,
    // Shift
    shift,
    isShiftActive,
    setShift,
    setIsShiftActive,
    drawerCash,
    setDrawerCash,
    loadInitialData,
    // Cart
    cartItems,
    addToCart,
    updateItemQuantity,
    removeItem,
    clearCart,
    subtotal,
    discountAmount,
    setDiscountAmount,
    grandTotal,
    totalItemsCount,
    customerNotes,
    setCustomerNotes,
    // Barcode & Products
    barcodeInputRef,
    refocusBarcode,
    processBarcodeScan,
    productsCache,
    favorites,
    // Hold / Recall
    heldOrders,
    holdCurrentCart,
    recallHeldCart,
    // Modals
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
    lastReceiptData,
    setLastReceiptData
  };

  return <PosContext.Provider value={value}>{children}</PosContext.Provider>;
}

export function usePos() {
  const context = useContext(PosContext);
  if (!context) {
    throw new Error('usePos must be used within a PosProvider');
  }
  return context;
}
