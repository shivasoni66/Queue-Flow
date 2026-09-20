import React from 'react';

export default function ErrorMessage({ message = 'An error occurred loading data.', onRetry = null }) {
  return (
    <div style={{ padding: '20px', borderRadius: '16px', background: 'rgba(239, 68, 68, 0.06)', border: '1px solid rgba(239, 68, 68, 0.2)', textAlign: 'center', margin: '16px 0' }}>
      <p style={{ color: '#ef4444', fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>
        ⚠️ {message}
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="btn-secondary"
          style={{ padding: '6px 14px', fontSize: '12px' }}
        >
          Try Again
        </button>
      )}
    </div>
  );
}
