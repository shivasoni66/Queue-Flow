import React from 'react';

const TAG_STYLES = {
  called: { bg: 'rgba(249,115,22,0.12)', color: '#f97316' },
  done: { bg: 'rgba(34,197,94,0.10)', color: '#22c55e' },
  break: { bg: 'rgba(148,163,184,0.15)', color: '#94a3b8' },
  skip: { bg: 'rgba(239,68,68,0.10)', color: '#ef4444' },
  waiting: { bg: 'rgba(245,158,11,0.12)', color: '#d97706' },
  serving: { bg: 'rgba(59,130,246,0.12)', color: '#3b82f6' },
  info: { bg: 'rgba(148,163,184,0.12)', color: '#64748b' },
};

export default function LiveLog({ log = [] }) {
  return (
    <div style={{ marginBottom: '24px' }}>
      <p className="mono" style={{ fontSize: '10px', letterSpacing: '0.1em', color: '#a8a29e', marginBottom: '10px', textTransform: 'uppercase' }}>
        LIVE LOG
      </p>

      <div
        className="q-card"
        style={{
          overflow: 'hidden',
          background: '#ffffff',
          border: '1px solid #f0ede8',
        }}
      >
        {log.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: '#a8a29e', fontSize: '13px' }}>
            No recent queue activity.
          </div>
        ) : (
          log.map((item, i) => {
            const style = TAG_STYLES[item.tag] || TAG_STYLES.info;
            return (
              <div
                key={item.id || i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px 16px',
                  borderBottom: i < log.length - 1 ? '1px solid #f7f5f2' : 'none',
                }}
              >
                <span className="mono" style={{ fontSize: '11px', color: '#a8a29e', width: '38px', flexShrink: 0 }}>
                  {item.t}
                </span>

                <span
                  className="mono"
                  style={{
                    fontSize: '9px',
                    padding: '2px 6px',
                    borderRadius: '6px',
                    fontWeight: 700,
                    flexShrink: 0,
                    background: style.bg,
                    color: style.color,
                  }}
                >
                  {(item.tag || 'INFO').toUpperCase()}
                </span>

                <span style={{ fontSize: '13px', color: '#44403c', lineHeight: 1.4 }}>
                  {item.event}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
