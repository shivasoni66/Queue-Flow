import React from 'react';

export default function StatPills({ queues = [], counters = [], avgWaitSeconds = null }) {
  const totalWaiting = queues.reduce((sum, q) => sum + (q.waitingCount || 0), 0);
  const totalServed = counters.reduce((sum, c) => sum + (c.stats?.served || 0), 0);
  const activeCounters = counters.filter((c) => c.status === 'ACTIVE').length;
  const totalCounters = counters.length;

  // Format real backend-derived average waiting time (preferring summary.avgWaitSeconds)
  let avgWaitFormatted = '—';
  if (typeof avgWaitSeconds === 'number' && avgWaitSeconds > 0) {
    avgWaitFormatted = `${Math.round(avgWaitSeconds / 60)}m`;
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '20px' }}>
      <div className="stat-pill">
        <span className="stat-pill-val">{totalWaiting}</span>
        <span className="stat-pill-label">Waiting</span>
      </div>

      <div className="stat-pill">
        <span className="stat-pill-val">{avgWaitFormatted}</span>
        <span className="stat-pill-sub">est.</span>
        <span className="stat-pill-label">Avg Wait</span>
      </div>

      <div className="stat-pill">
        <span className="stat-pill-val">{totalServed}</span>
        <span className="stat-pill-label">Served</span>
      </div>

      <div className="stat-pill">
        <span className="stat-pill-val">
          {activeCounters}<span style={{ fontSize: '16px', color: '#a8a29e', fontWeight: 600 }}>/{totalCounters}</span>
        </span>
        <span className="stat-pill-label">Active</span>
      </div>
    </div>
  );
}
