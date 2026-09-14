import React, { useState } from 'react';
import { usePos } from '../context/PosContext';
import { posApi } from '../services/api';
import { soundEffects } from '../services/soundEffects';

export default function LoginModal() {
  const { user, handleLogin } = usePos();
  const [email, setEmail] = useState('cashier@daydream.com');
  const [password, setPassword] = useState('password123');
  const [apiBaseUrl, setApiBaseUrl] = useState('http://localhost:5000/api/v1');
  const [showConfig, setShowConfig] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // If user is already authenticated, don't show login modal
  if (user) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (apiBaseUrl) {
        localStorage.setItem('DAYDREAM_API_BASE', apiBaseUrl.trim());
      }

      const res = await posApi.login(email.trim(), password);
      if (res && res.token) {
        soundEffects.playCashChime();
        handleLogin(res.user, res.token);
      } else {
        throw new Error('لم يتم استلام توكن المصادقة من السيرفر.');
      }
    } catch (err) {
      soundEffects.playErrorBuzz();
      setError(err.message || 'بيانات الدخول غير صحيحة أو السيرفر غير متصل.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card" style={{ maxWidth: '440px' }}>
        <div className="modal-header" style={{ justifyContent: 'center', textAlign: 'center' }}>
          <div>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.25rem' }}>🛒</div>
            <h2 className="modal-title" style={{ fontSize: '1.4rem' }}>تسجيل دخول كاشير السوبر ماركت</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>DayDream Enterprise POS System</p>
          </div>
        </div>

        <div className="modal-body">
          {error && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid var(--color-rose)',
              borderRadius: '8px',
              padding: '0.75rem',
              color: '#f87171',
              fontSize: '0.875rem',
              marginBottom: '1rem',
              textAlign: 'center'
            }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                البريد الإلكتروني للكاشير:
              </label>
              <input
                type="email"
                className="barcode-input"
                style={{ width: '100%', direction: 'ltr', textAlign: 'left', fontSize: '1rem' }}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                كلمة المرور:
              </label>
              <input
                type="password"
                className="barcode-input"
                style={{ width: '100%', direction: 'ltr', textAlign: 'left', fontSize: '1rem' }}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {/* Optional Server URL Setting */}
            <div>
              <button
                type="button"
                style={{ background: 'transparent', border: 'none', color: 'var(--color-blue)', cursor: 'pointer', fontSize: '0.8rem' }}
                onClick={() => setShowConfig(!showConfig)}
              >
                ⚙️ {showConfig ? 'إخفاء إعدادات السيرفر' : 'تغيير عنوان السيرفر (LAN / IP)'}
              </button>

              {showConfig && (
                <input
                  type="text"
                  className="barcode-input"
                  style={{ marginTop: '0.5rem', width: '100%', direction: 'ltr', textAlign: 'left', fontSize: '0.85rem' }}
                  value={apiBaseUrl}
                  onChange={(e) => setApiBaseUrl(e.target.value)}
                  placeholder="http://localhost:5000/api/v1"
                />
              )}
            </div>

            <button
              type="submit"
              className="btn-confirm-payment"
              disabled={isLoading}
              style={{ marginTop: '0.5rem' }}
            >
              {isLoading ? 'جاري التحقق...' : 'دخول شاشة البيع 🚀'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
