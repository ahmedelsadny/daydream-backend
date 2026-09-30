/**
 * API Service for DayDream Supermarket Backend
 * Handles authentication headers, caching, and network requests.
 */

const getApiBase = () => {
  const envBase = import.meta.env?.VITE_API_BASE_URL;
  if (envBase) return envBase;
  const saved = localStorage.getItem('DAYDREAM_API_BASE');
  if (saved && !saved.includes(':5000')) return saved;
  // Default to backend on 8090
  return 'http://localhost:8090/api/v1';
};

export const API_BASE = getApiBase();

export function setApiBase(url) {
  localStorage.setItem('DAYDREAM_API_BASE', url);
}

export function getToken() {
  return localStorage.getItem('DAYDREAM_POS_TOKEN') || '';
}

export function setToken(token) {
  localStorage.setItem('DAYDREAM_POS_TOKEN', token);
}

export function removeToken() {
  localStorage.removeItem('DAYDREAM_POS_TOKEN');
}

async function request(endpoint, options = {}) {
  const url = `${getApiBase()}${endpoint}`;
  const token = getToken();

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };

  try {
    const res = await fetch(url, { ...options, headers });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const errorMsg = data.message || `خطأ في الخادم (${res.status})`;
      throw new Error(errorMsg);
    }

    return data;
  } catch (err) {
    console.error(`API Error on [${endpoint}]:`, err.message);
    throw err;
  }
}

export const posApi = {
  // Auth
  login: (email, password) => request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  }),

  // Categories
  fetchCategories: () => request('/categories'),

  // Products & Barcodes
  fetchProducts: () => request('/products?limit=1000'),
  fetchFavorites: () => request('/products/favorites'),
  fetchProductsByCategory: (categoryId) => request(`/products?categoryId=${categoryId}&limit=200`),
  findProductByBarcode: (barcode) => request(`/products/search?code=${encodeURIComponent(barcode)}`),

  // Live POS Sales & Orders
  createOrder: (orderPayload) => request('/orders', {
    method: 'POST',
    body: JSON.stringify(orderPayload)
  }),
  getOrderReceipt: (orderId, paperWidth = 48) => request(`/orders/${orderId}/receipt?paperWidth=${paperWidth}`),

  // Held Orders (Hold & Resume Cart)
  holdOrder: (data) => request('/orders/hold', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  getHeldOrders: () => request('/orders/held'),
  getHeldOrderById: (id) => request(`/orders/held/${id}`),
  deleteHeldOrder: (id) => request(`/orders/held/${id}`, {
    method: 'DELETE'
  }),

  // Shift & Cash Drawer Control
  getCurrentShift: () => request('/shifts/current'),
  startShift: (openingBalance) => request('/shifts/start', {
    method: 'POST',
    body: JSON.stringify({ openingBalance })
  }),
  cashIn: (amount, reason, notes) => request('/shifts/cash-in', {
    method: 'POST',
    body: JSON.stringify({ amount, reason, notes })
  }),
  cashOut: (amount, reason, notes) => request('/shifts/cash-out', {
    method: 'POST',
    body: JSON.stringify({ amount, reason, notes })
  }),
  endShift: (closingBalance, notes) => request('/shifts/end', {
    method: 'POST',
    body: JSON.stringify({ closingBalance, notes })
  }),
  manualDrawerKick: (reason) => request('/shifts/drawer-open', {
    method: 'POST',
    body: JSON.stringify({ reason })
  }),
  getZReportReceipt: (shiftId, paperWidth = 48) => request(`/shifts/${shiftId}/z-report-receipt?paperWidth=${paperWidth}`)
};
