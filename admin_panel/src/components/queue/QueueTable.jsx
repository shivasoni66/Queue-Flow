import React from 'react';

export default function QueueTable({ queues = [] }) {
  if (queues.length === 0) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: '#a8a29e', fontSize: '13px', background: '#fff', borderRadius: '16px', border: '1px solid #f0ede8' }}>
        No active queues found for today.
      </div>
    );
  }

  return (
    <div style={{ marginBottom: '24px' }}>
      <p className="mono" style={{ fontSize: '10px', letterSpacing: '0.1em', color: '#a8a29e', marginBottom: '10px', textTransform: 'uppercase' }}>
        SERVICE QUEUES (TODAY)
      </p>

      <div
        className="q-card"
        style={{
          overflow: 'hidden',
          background: '#ffffff',
          border: '1px solid #f0ede8',
        }}
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#faf9f6', borderBottom: '1px solid #f0ede8', color: '#78716c', fontSize: '11px' }}>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>SERVICE</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>PREFIX</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>WAITING</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>SERVED</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>TOTAL ISSUED</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>AVG SERVICE TIME</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {queues.map((q, idx) => {
                const serviceName = q.service?.name || 'General Service';
                const prefix = q.service?.tokenPrefix || 'A';
                const waiting = q.waitingCount || 0;
                const completed = q.completedCount || 0;
                const total = q.totalIssued || 0;
                const avgSec = q.avgServiceTimeSeconds;
                const avgDisplay = avgSec
                  ? `${Math.round(avgSec / 60)} min`
                  : 'Estimate unavailable';

                return (
                  <tr
                    key={q._id || idx}
                    style={{
                      borderBottom: idx < queues.length - 1 ? '1px solid #f7f5f2' : 'none',
                      transition: 'background 0.15s ease',
                    }}
                  >
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: '#1c1917' }}>
                      {serviceName}
                    </td>

                    <td style={{ padding: '12px 16px' }}>
                      <span
                        className="mono"
                        style={{
                          fontSize: '11px',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          background: 'rgba(249, 115, 22, 0.1)',
                          color: '#f97316',
                          fontWeight: 700,
                        }}
                      >
                        {prefix}
                      </span>
                    </td>

                    <td style={{ padding: '12px 16px' }}>
                      <span
                        style={{
                          fontSize: '14px',
                          fontWeight: 700,
                          color: waiting > 10 ? '#ef4444' : waiting > 5 ? '#f59e0b' : '#1c1917',
                        }}
                      >
                        {waiting}
                      </span>
                    </td>

                    <td style={{ padding: '12px 16px', color: '#22c55e', fontWeight: 600 }}>
                      {completed}
                    </td>

                    <td style={{ padding: '12px 16px', color: '#44403c', fontFamily: 'var(--font-mono)' }}>
                      {total}
                    </td>

                    <td style={{ padding: '12px 16px', color: '#78716c' }}>
                      {avgDisplay}
                    </td>

                    <td style={{ padding: '12px 16px' }}>
                      <span
                        className="badge"
                        style={{
                          fontSize: '9px',
                          background: q.status === 'OPEN' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                          color: q.status === 'OPEN' ? '#22c55e' : '#ef4444',
                        }}
                      >
                        {q.status || 'OPEN'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
