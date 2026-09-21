import React from 'react';
import { useSocket } from '../context/SocketContext';
import { useAnalytics } from '../hooks/useAnalytics';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorMessage from '../components/common/ErrorMessage';
import EmptyState from '../components/common/EmptyState';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie,
  Legend,
} from 'recharts';
import { RefreshCw } from 'lucide-react';

const SERVICE_COLORS = ['#f97316', '#06b6d4', '#22c55e', '#8b5cf6', '#ec4899', '#6366f1', '#f59e0b'];

export default function Analytics() {
  const { activeCenterId } = useSocket();
  const { analytics, loading, error, refreshAnalytics } = useAnalytics(activeCenterId);

  const summary = analytics?.summary || {};
  const hourlyFootfall = analytics?.hourlyFootfall || [];
  const serviceDemand = analytics?.serviceDemand || [];
  const counters = analytics?.counters || [];

  // Format service demand data for Pie chart
  const pieData = serviceDemand
    .filter((s) => (s.total || s.completed || 0) > 0)
    .map((s, idx) => ({
      name: s.name,
      value: s.total || s.completed || 0,
      color: SERVICE_COLORS[idx % SERVICE_COLORS.length],
    }));

  // Format counter utilization data from backend API
  const utilData = counters.map((c) => ({
    name: c.name,
    util: typeof c.utilizationPercent === 'number' ? c.utilizationPercent : null,
    served: c.served || 0,
  }));

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 800, color: '#1c1917', letterSpacing: '-0.02em' }}>
            Operational Analytics & Reports
          </h1>
          <p style={{ fontSize: '12px', color: '#78716c', marginTop: '2px' }}>
            Evidence-based metrics and operational trends from MongoDB Atlas
          </p>
        </div>

        <button
          onClick={refreshAnalytics}
          disabled={loading}
          className="btn-secondary"
          style={{ fontSize: '12px', padding: '6px 14px' }}
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      {error && <ErrorMessage message={error} onRetry={refreshAnalytics} />}

      {loading ? (
        <LoadingSpinner message="Aggregating analytics data..." />
      ) : (
        <>
          {/* Top Summary Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '14px', marginBottom: '24px' }}>
            <div className="stat-pill">
              <span className="stat-pill-val">{summary.totalIssued ?? 0}</span>
              <span className="stat-pill-label">Total Issued Today</span>
            </div>
            <div className="stat-pill">
              <span className="stat-pill-val">{summary.totalServed ?? 0}</span>
              <span className="stat-pill-label">Completed Services</span>
            </div>
            <div className="stat-pill">
              <span className="stat-pill-val">
                {summary.avgWaitSeconds ? `${Math.round(summary.avgWaitSeconds / 60)}m` : '—'}
              </span>
              <span className="stat-pill-label">Average Wait Time</span>
            </div>
            <div className="stat-pill">
              <span className="stat-pill-val">{summary.currentCrowd ?? '—'}</span>
              <span className="stat-pill-sub">{typeof summary.crowdPercent === 'number' ? `${summary.crowdPercent}% capacity` : '—'}</span>
              <span className="stat-pill-label">Current Crowd</span>
            </div>
          </div>

          {/* Charts Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '24px' }}>
            {/* Hourly Footfall Chart */}
            <div className="q-card" style={{ padding: '20px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#1c1917', marginBottom: '2px' }}>
                Hourly Visitor Footfall
              </h3>
              <p style={{ fontSize: '12px', color: '#a8a29e', marginBottom: '16px' }}>
                Entries recorded by IoT sensors per hour today
              </p>

              {hourlyFootfall.length === 0 ? (
                <EmptyState title="No footfall recorded yet" description="Footfall events will plot here as visitors arrive." />
              ) : (
                <div style={{ width: '100%', height: '220px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={hourlyFootfall} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
                      <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#a8a29e', fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: '#a8a29e', fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={{ background: '#ffffff', border: '1px solid #f0ede8', borderRadius: 12, fontSize: 12, boxShadow: 'var(--shadow-md)' }}
                        formatter={(value) => [`${value} visitors`, 'Visitors']}
                      />
                      <Line type="monotone" dataKey="count" stroke="#f97316" strokeWidth={2.5} dot={{ r: 3, fill: '#f97316' }} activeDot={{ r: 5 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Counter Utilization Chart */}
            <div className="q-card" style={{ padding: '20px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#1c1917', marginBottom: '2px' }}>
                Counter Utilization
              </h3>
              <p style={{ fontSize: '12px', color: '#a8a29e', marginBottom: '16px' }}>
                Capacity utilization percentage per counter
              </p>

              {utilData.length === 0 ? (
                <EmptyState title="No counter activity" description="Counters will display here once operational." />
              ) : utilData.every((d) => d.util === null) ? (
                <EmptyState title="Utilization unavailable" description="Counter utilization metrics are currently unavailable." />
              ) : (
                <>
                  <div style={{ width: '100%', height: '220px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={utilData} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
                        <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#a8a29e', fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
                        <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 10, fill: '#a8a29e', fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
                        <Tooltip
                          contentStyle={{ background: '#ffffff', border: '1px solid #f0ede8', borderRadius: 12, fontSize: 12, boxShadow: 'var(--shadow-md)' }}
                          formatter={(val) => [
                            val !== null && val !== undefined ? `${val}% utilization` : 'Utilization unavailable',
                            'Utilization'
                          ]}
                        />
                        <Bar dataKey="util" radius={[6, 6, 0, 0]}>
                          {utilData.map((d, i) => (
                            <Cell key={i} fill={d.util !== null ? (d.util > 70 ? '#22c55e' : d.util > 30 ? '#f97316' : '#3b82f6') : 'transparent'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div style={{ marginTop: '12px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {utilData.map((d, i) => (
                      <span
                        key={i}
                        style={{
                          fontSize: '11px',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          background: '#faf9f6',
                          border: '1px solid #f0ede8',
                          color: d.util !== null ? '#44403c' : '#a8a29e',
                        }}
                      >
                        {d.name}: {d.util !== null ? `${d.util}% utilization` : 'Utilization unavailable'}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Service Demand Distribution */}
            <div className="q-card" style={{ padding: '20px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#1c1917', marginBottom: '2px' }}>
                Service Demand Breakdown
              </h3>
              <p style={{ fontSize: '12px', color: '#a8a29e', marginBottom: '16px' }}>
                Tokens requested by service category
              </p>

              {pieData.length === 0 ? (
                <EmptyState title="No service data" description="Token categories will show here once tokens are requested." />
              ) : (
                <div style={{ width: '100%', height: '220px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} dataKey="value" cx="50%" cy="50%" outerRadius={75} innerRadius={42} paddingAngle={4}>
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: '#ffffff', border: '1px solid #f0ede8', borderRadius: 12, fontSize: 12, boxShadow: 'var(--shadow-md)' }}
                      />
                      <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, fontFamily: 'JetBrains Mono' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Average Service Time Section */}
            <div className="q-card" style={{ padding: '20px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#1c1917', marginBottom: '2px' }}>
                Average Service Time
              </h3>
              <p style={{ fontSize: '12px', color: '#a8a29e', marginBottom: '16px' }}>
                Average service duration per completed token by service category
              </p>

              {analytics.queues?.length === 0 ? (
                <EmptyState title="No queue data" description="Queues will appear here." />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {analytics.queues?.map((q, idx) => {
                    const avgSec = q.avgServiceTimeSeconds;
                    const avgDisplay = avgSec ? `~${Math.round(avgSec / 60)}m avg` : 'Estimate unavailable';
                    return (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 14px',
                          borderRadius: '12px',
                          background: '#faf9f6',
                          border: '1px solid #f0ede8',
                        }}
                      >
                        <div>
                          <p style={{ fontSize: '13px', fontWeight: 600, color: '#1c1917' }}>
                            {q.service?.name || 'Service'}
                          </p>
                          <p style={{ fontSize: '11px', color: '#78716c' }}>
                            {q.waitingCount || 0} waiting • {q.completedCount || 0} completed
                          </p>
                        </div>
                        <span className="mono" style={{ fontSize: '12px', fontWeight: 700, color: avgSec ? '#f97316' : '#a8a29e' }}>
                          {avgDisplay}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
