import React from 'react';

export default function LoadingSpinner({ message = 'Loading live data...' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', gap: '12px' }}>
      <div
        style={{
          width: '32px',
          height: '32px',
          border: '3px solid #f0ede8',
          borderTopColor: '#f97316',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }}
      />
      <p style={{ fontSize: '13px', color: '#78716c', fontWeight: 500 }}>{message}</p>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
