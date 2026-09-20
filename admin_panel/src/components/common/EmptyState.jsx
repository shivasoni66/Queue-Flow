import React from 'react';

export default function EmptyState({ title = 'No data available', description = 'There are no active records at this time.', action = null }) {
  return (
    <div style={{ textAlign: 'center', padding: '40px 20px', background: '#fff', borderRadius: '16px', border: '1px dashed #e7e5e4' }}>
      <div style={{ width: '44px', height: '44px', margin: '0 auto 12px', borderRadius: '50%', background: '#faf9f6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a8a29e' }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#1c1917', marginBottom: '4px' }}>{title}</h3>
      <p style={{ fontSize: '13px', color: '#78716c', maxWidth: '320px', margin: '0 auto' }}>{description}</p>
      {action && <div style={{ marginTop: '16px' }}>{action}</div>}
    </div>
  );
}
