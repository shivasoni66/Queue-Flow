import React, { useState } from 'react';
import { useSocket } from '../context/SocketContext';
import { useAnalytics } from '../hooks/useAnalytics';
import { useCrowd } from '../hooks/useCrowd';
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
import { RefreshCw, TrendingUp, BarChart2, PieChart as PieIcon, Clock } from 'lucide-react';

const SERVICE_COLORS = [
  'var(--color-primary)',
  'var(--color-cyan)',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  'var(--color-warning)',
  'var(--color-success)',
];

export default function Analytics() {
  const { activeCenterId } = useSocket();
  const { analytics, loading, refreshing, error, refreshAnalytics } = useAnalytics(activeCenterId);
  const { crowdData, isReadingStale, refreshCrowd } = useCrowd(activeCenterId);
  const [manualRefreshing, setManualRefreshing] = useState(false);

  const summary = analytics?.summary || {};
  const hourlyFootfall = analytics?.hourlyFootfall || [];
  const serviceDemand = analytics?.serviceDemand || [];
  const counters = analytics?.counters || [];
  const queues = analytics?.queues || [];

  // Format service demand data for Donut/Pie chart
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

  // Authoritative Current Crowd (mirrors Live Counter & CCTV telemetry)
  const isCrowdStale = isReadingStale(crowdData) || (summary.crowdSensorOnline === false && crowdData.currentCrowd === null);
  const currentCrowdDisplay = isCrowdStale ? 'OFFLINE' : (crowdData.currentCrowd ?? summary.currentCrowd ?? '—');
  const crowdPercentDisplay = isCrowdStale
    ? 'Telemetry stale'
    : typeof (crowdData.crowdPercent ?? summary.crowdPercent) === 'number'
    ? `${crowdData.crowdPercent ?? summary.crowdPercent}% full`
    : '';

  const handleRefresh = async () => {
    try {
      setManualRefreshing(true);
      await Promise.all([
        refreshAnalytics?.(),
        refreshCrowd?.(),
      ]);
    } finally {
      setManualRefreshing(false);
    }
  };

  const isBusy = loading || refreshing || manualRefreshing;

  const darkTooltipStyle = {
    background: 'var(--bg-card)',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    borderRadius: 12,
    fontSize: 12,
    color: 'var(--text-primary)',
    boxShadow: '0 8px 30px rgba(0, 0, 0, 0.7)',
    fontFamily: 'var(--font-mono)',
  };

  return (
    <div style={{ padding: '24px 28px', maxWidth: '1600px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            Operational Analytics & Telemetry
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '3px' }}>
            Historical queue performance, counter utilization, and IoT footfall trends
          </p>
        </div>

        <button
          onClick={handleRefresh}
          disabled={isBusy}
          className="btn-secondary"
          style={{ fontSize: '12px', padding: '8px 16px', gap: '8px' }}
        >
          <RefreshCw size={13} className={isBusy ? 'animate-spin' : ''} />
          <span>{isBusy ? 'Refreshing...' : 'Refresh Analytics'}</span>
        </button>
      </div>

      {error && <ErrorMessage message={error} onRetry={handleRefresh} />}

      {loading ? (
        <LoadingSpinner message="Aggregating authoritative telemetry datasets..." />
      ) : (
        <>
          {/* Top Summary Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            {/* Total Issued Today */}
            <div className="stat-pill" style={{ alignItems: 'flex-start', textAlign: 'left', padding: '18px 20px' }}>
              <span className="stat-pill-label">Total Issued Today</span>
              <span className="stat-pill-val" style={{ color: 'var(--text-primary)', marginTop: '8px' }}>
                {summary.totalIssued ?? summary.issuedToday ?? 0}
              </span>
              <div style={{ marginTop: '4px' }}>
                {typeof summary.trends?.issuedTrend === 'number' ? (
                  <span
                    className="stat-pill-sub"
                    style={{
                      color: summary.trends.issuedTrend >= 0 ? 'var(--color-primary)' : 'var(--color-warning)',
                      fontSize: '11px',
                    }}
                  >
                    {summary.trends.issuedTrend > 0 ? `+${summary.trends.issuedTrend}%` : `${summary.trends.issuedTrend}%`} vs yesterday
                  </span>
                ) : (
                  <span className="stat-pill-sub" style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                    No comparison data
                  </span>
                )}
              </div>
            </div>

            {/* Completed Services */}
            <div className="stat-pill" style={{ alignItems: 'flex-start', textAlign: 'left', padding: '18px 20px' }}>
              <span className="stat-pill-label">Completed Services</span>
              <span className="stat-pill-val" style={{ color: 'var(--color-primary)', marginTop: '8px' }}>
                {summary.totalServed ?? summary.completedToday ?? 0}
              </span>
              <div style={{ marginTop: '4px' }}>
                {typeof summary.trends?.completedTrend === 'number' ? (
                  <span
                    className="stat-pill-sub"
                    style={{
                      color: summary.trends.completedTrend >= 0 ? 'var(--color-primary)' : 'var(--color-warning)',
                      fontSize: '11px',
                    }}
                  >
                    {summary.trends.completedTrend > 0 ? `+${summary.trends.completedTrend}%` : `${summary.trends.completedTrend}%`} vs yesterday
                  </span>
                ) : (
                  <span className="stat-pill-sub" style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                    No comparison data
                  </span>
                )}
              </div>
            </div>

            {/* Average Wait Time */}
            <div className="stat-pill" style={{ alignItems: 'flex-start', textAlign: 'left', padding: '18px 20px' }}>
              <span className="stat-pill-label">Average Wait Time</span>
              <span className="stat-pill-val" style={{ color: 'var(--color-cyan)', marginTop: '8px' }}>
                {typeof summary.avgWaitSeconds === 'number' && (summary.waitSampleCount || 0) > 0
                  ? `${Math.round(summary.avgWaitSeconds / 60)}m`
                  : '—'}
              </span>
              <div style={{ marginTop: '4px' }}>
                {(summary.waitSampleCount || 0) > 0 ? (
                  <span className="stat-pill-sub" style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>
                    {summary.waitSampleCount} sample{summary.waitSampleCount > 1 ? 's' : ''}
                    {typeof summary.trends?.waitTrend === 'number'
                      ? ` • ${summary.trends.waitTrend > 0 ? `+${summary.trends.waitTrend}%` : `${summary.trends.waitTrend}%`} vs yesterday`
                      : ''}
                  </span>
                ) : (
                  <span className="stat-pill-sub" style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                    No wait samples today
                  </span>
                )}
              </div>
            </div>

            {/* Current Crowd */}
            <div className="stat-pill" style={{ alignItems: 'flex-start', textAlign: 'left', padding: '18px 20px' }}>
              <span className="stat-pill-label">Current Crowd</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '8px' }}>
                <span
                  className="stat-pill-val"
                  style={{ color: isCrowdStale ? 'var(--color-warning)' : 'var(--text-primary)' }}
                >
                  {currentCrowdDisplay}
                </span>
                {crowdPercentDisplay && (
                  <span
                    className="stat-pill-sub"
                    style={{ color: isCrowdStale ? 'var(--color-warning)' : 'var(--color-primary)' }}
                  >
                    {crowdPercentDisplay}
                  </span>
                )}
              </div>
              <div style={{ marginTop: '4px' }}>
                <span className="stat-pill-sub" style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                  {isCrowdStale ? 'Awaiting camera telemetry' : 'Realtime optical/CCTV'}
                </span>
              </div>
            </div>
          </div>

          {/* Charts Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))', gap: '24px' }}>
            {/* Hourly Footfall Chart */}
            <div className="q-card" style={{ padding: '22px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <TrendingUp size={16} color="var(--color-primary)" />
                <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Hourly Visitor Footfall
                </h3>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '18px' }}>
                Entries & crowd telemetry logged by IoT optical sensor sensors and CCTV cameras by hour today
              </p>

              {hourlyFootfall.length === 0 ? (
                <EmptyState title="No footfall data available" description="Footfall events will plot here as visitors arrive." />
              ) : (
                <div style={{ width: '100%', height: '240px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={hourlyFootfall} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
                      <XAxis dataKey="hour" tick={{ fontSize: 10, fill: 'var(--text-muted)', fontFamily: 'JetBrains Mono' }} axisLine={{ stroke: 'var(--bg-card-alt)' }} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)', fontFamily: 'JetBrains Mono' }} axisLine={{ stroke: 'var(--bg-card-alt)' }} tickLine={false} />
                      <Tooltip
                        contentStyle={darkTooltipStyle}
                        formatter={(value, name, item) => {
                          const entries = item?.payload?.entries || 0;
                          const peak = item?.payload?.peakCount || 0;
                          const obs = item?.payload?.observations || 0;
                          if (entries > 0) return [`${entries} entries`, 'Sensor Entries'];
                          if (peak > 0) return [`${peak} peak visitors (${obs} readings)`, 'CCTV Telemetry'];
                          return [`${value} visitors`, 'Footfall'];
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="count"
                        stroke="var(--color-primary)"
                        strokeWidth={2.5}
                        dot={{ r: 4, fill: 'var(--color-primary)', stroke: 'var(--bg-card)', strokeWidth: 2 }}
                        activeDot={{ r: 6, fill: 'var(--color-primary)' }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Counter Utilization Chart */}
            <div className="q-card" style={{ padding: '22px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <BarChart2 size={16} color="var(--color-cyan)" />
                <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Counter Utilization
                </h3>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '18px' }}>
                Active time utilization percentage per counter
              </p>

              {utilData.length === 0 ? (
                <EmptyState title="No counter activity" description="Counters will display here once operational." />
              ) : utilData.every((d) => d.util === null) ? (
                <EmptyState title="No utilization data" description="Counter utilization metrics will display once counters begin operating." />
              ) : (
                <>
                  <div style={{ width: '100%', height: '240px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={utilData} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
                        <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-muted)', fontFamily: 'JetBrains Mono' }} axisLine={{ stroke: 'var(--bg-card-alt)' }} tickLine={false} />
                        <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 10, fill: 'var(--text-muted)', fontFamily: 'JetBrains Mono' }} axisLine={{ stroke: 'var(--bg-card-alt)' }} tickLine={false} />
                        <Tooltip
                          contentStyle={darkTooltipStyle}
                          formatter={(val) => [
                            val !== null && val !== undefined ? `${val}% utilization` : 'Utilization unavailable',
                            'Utilization',
                          ]}
                        />
                        <Bar dataKey="util" radius={[6, 6, 0, 0]}>
                          {utilData.map((d, i) => (
                            <Cell
                              key={i}
                              fill={d.util !== null ? (d.util > 70 ? 'var(--color-primary)' : d.util > 30 ? 'var(--color-cyan)' : 'var(--color-cyan)') : 'transparent'}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div style={{ marginTop: '12px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {utilData.map((d, i) => (
                      <span
                        key={i}
                        className="mono"
                        style={{
                          fontSize: '11px',
                          padding: '4px 10px',
                          borderRadius: '8px',
                          background: 'var(--bg-card-alt)',
                          border: '1px solid var(--border-subtle)',
                          color: d.util !== null ? 'var(--text-primary)' : 'var(--text-muted)',
                        }}
                      >
                        {d.name}: {d.util !== null ? `${d.util}%` : '—'}
                        {d.served > 0 ? ` (${d.served} served)` : ''}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Service Demand Distribution */}
            <div className="q-card" style={{ padding: '22px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <PieIcon size={16} color="var(--color-cyan)" />
                <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Service Demand Breakdown
                </h3>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '18px' }}>
                Tokens requested by service category
              </p>

              {pieData.length === 0 ? (
                <EmptyState title="No service demand data" description="Token categories will show here once tokens are requested." />
              ) : (
                <div style={{ width: '100%', height: '240px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} dataKey="value" cx="50%" cy="50%" outerRadius={75} innerRadius={45} paddingAngle={4}>
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} stroke="var(--bg-card)" strokeWidth={2} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={darkTooltipStyle} />
                      <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, fontFamily: 'JetBrains Mono', color: 'var(--text-secondary)' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Average Service Time Section */}
            <div className="q-card" style={{ padding: '22px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <Clock size={16} color="var(--color-warning)" />
                <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Average Service Time
                </h3>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '18px' }}>
                Average service duration per completed token by service category
              </p>

              {(!queues || queues.length === 0) ? (
                <EmptyState title="No queue data" description="Queues will appear here." />
              ) : queues.every((q) => q.avgServiceTimeSeconds == null && !q.completedCount) ? (
                <EmptyState title="No completed services" description="Average service time will calculate as services complete." />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {queues.map((q, idx) => {
                    const avgSec = q.avgServiceTimeSeconds;
                    const avgDisplay = avgSec ? `~${Math.round(avgSec / 60)}m avg` : '—';
                    return (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '12px 16px',
                          borderRadius: '12px',
                          background: 'var(--bg-card-alt)',
                          border: '1px solid var(--border-subtle)',
                        }}
                      >
                        <div>
                          <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                            {q.service?.name || '—'}
                          </p>
                          <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                            {q.waitingCount || 0} waiting • {q.completedCount || 0} completed
                          </p>
                        </div>
                        <span
                          className="mono"
                          style={{
                            fontSize: '12px',
                            fontWeight: 700,
                            color: avgSec ? 'var(--color-primary)' : 'var(--text-muted)',
                          }}
                        >
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
