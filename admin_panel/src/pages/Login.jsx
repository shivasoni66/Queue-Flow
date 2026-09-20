import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Lock, Mail, AlertCircle, ArrowRight } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const queryParams = new URLSearchParams(location.search);
  const isExpired = queryParams.get('expired') === '1';
  const isUnauthorized = queryParams.get('unauthorized') === '1';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError('');
    if (!email || !password) {
      setLocalError('Please enter both email and password');
      return;
    }

    setSubmitting(true);
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      setLocalError(err.message || 'Login failed. Please verify credentials.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickLogin = (role) => {
    if (role === 'admin') {
      setEmail('admin@queueflow.dev');
      setPassword('Admin@1234');
    } else {
      setEmail('staff1@queueflow.dev');
      setPassword('Staff@1234');
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#faf9f6',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div
        className="q-card"
        style={{
          width: '100%',
          maxWidth: '420px',
          padding: '36px 32px',
          background: '#ffffff',
          borderRadius: '24px',
          boxShadow: 'var(--shadow-lg)',
          border: '1px solid #f0ede8',
        }}
      >
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '14px',
              background: 'linear-gradient(135deg, #f97316, #fb923c)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              margin: '0 auto 12px',
              boxShadow: 'var(--shadow-glow-orange)',
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: '#1c1917', letterSpacing: '-0.02em' }}>
            QueueFlow
          </h1>
          <p style={{ fontSize: '13px', color: '#78716c', marginTop: '4px' }}>
            Admin & Counter Management Portal
          </p>
        </div>

        {/* Notices */}
        {isExpired && (
          <div style={{ padding: '10px 14px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: '12px', marginBottom: '16px', fontSize: '12px', color: '#b45309' }}>
            Your session has expired. Please sign in again.
          </div>
        )}

        {isUnauthorized && (
          <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '12px', marginBottom: '16px', fontSize: '12px', color: '#b91c1c' }}>
            Access denied. Customer accounts cannot access the admin panel.
          </div>
        )}

        {localError && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '12px', marginBottom: '16px', fontSize: '12px', color: '#b91c1c' }}>
            <AlertCircle size={15} style={{ flexShrink: 0 }} />
            <span>{localError}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#44403c', marginBottom: '6px' }}>
              Staff / Admin Email
            </label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Mail size={16} style={{ position: 'absolute', left: '12px', color: '#a8a29e' }} />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@queueflow.dev"
                style={{
                  width: '100%',
                  padding: '10px 12px 10px 38px',
                  borderRadius: '12px',
                  border: '1px solid #e7e5e4',
                  fontSize: '14px',
                  fontFamily: 'var(--font-main)',
                  outline: 'none',
                  background: '#faf9f6',
                  color: '#1c1917',
                  transition: 'border-color 0.15s ease',
                }}
                onFocus={(e) => (e.target.style.borderColor = '#f97316')}
                onBlur={(e) => (e.target.style.borderColor = '#e7e5e4')}
              />
            </div>
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#44403c', marginBottom: '6px' }}>
              Password
            </label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Lock size={16} style={{ position: 'absolute', left: '12px', color: '#a8a29e' }} />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{
                  width: '100%',
                  padding: '10px 12px 10px 38px',
                  borderRadius: '12px',
                  border: '1px solid #e7e5e4',
                  fontSize: '14px',
                  fontFamily: 'var(--font-main)',
                  outline: 'none',
                  background: '#faf9f6',
                  color: '#1c1917',
                  transition: 'border-color 0.15s ease',
                }}
                onFocus={(e) => (e.target.style.borderColor = '#f97316')}
                onBlur={(e) => (e.target.style.borderColor = '#e7e5e4')}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="btn-primary"
            style={{ width: '100%', padding: '12px', fontSize: '14px' }}
          >
            {submitting ? 'Authenticating...' : 'Sign In to Dashboard'}
            {!submitting && <ArrowRight size={16} />}
          </button>
        </form>

        {/* Demo Credentials Helper - Dev only */}
        {import.meta.env.DEV && (
          <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid #f7f5f2', textAlign: 'center' }}>
            <p style={{ fontSize: '11px', color: '#a8a29e', marginBottom: '8px' }}>
              QUICK LOGIN PRESETS (DEV ONLY)
            </p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={() => handleQuickLogin('admin')}
                className="btn-secondary"
                style={{ fontSize: '11px', padding: '6px 12px' }}
              >
                Admin
              </button>
              <button
                type="button"
                onClick={() => handleQuickLogin('staff')}
                className="btn-secondary"
                style={{ fontSize: '11px', padding: '6px 12px' }}
              >
                Staff
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
