import React, { useState, useEffect } from 'react';
import { useSocket } from '../context/SocketContext';
import { useCrowd } from '../hooks/useCrowd';
import CrowdWidget from '../components/dashboard/CrowdWidget';
import EmptyState from '../components/common/EmptyState';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorMessage from '../components/common/ErrorMessage';
import { Users, Cpu, Activity, Radio, RefreshCw } from 'lucide-react';

export default function CrowdMonitoring() {
  const { activeCenterId, on } = useSocket();
  const { crowdData, loading, error, simulateCrowd, resetCrowd, refreshCrowd } = useCrowd(activeCenterId);
  const [refreshing, setRefreshing] = useState(false);
  const [lastSyncEvent, setLastSyncEvent] = useState(null);

  // Listen to live crowd.updated Socket.IO events for sync-status details
  useEffect(() => {
    if (!activeCenterId || !on) return;
    const unsub = on('crowd.updated', (data) => {
      if (data?.centerId === activeCenterId) {
        setLastSyncEvent(data.event || {
          type: 'LIVE_UPDATE',
          timestamp: new Date().toISOString(),
        });
      }
    });
    return () => {
      unsub();
    };
  }, [activeCenterId, on]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshCrowd();
    } finally {
      setRefreshing(false);
    }
  };

  // State: No active center
  if (!activeCenterId) {
    return (
      <div style={{ padding: '24px 28px', maxWidth: '1600px', margin: '0 auto' }}>
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 style={{ fontSize: '22px', fontWeight: 800, color: '#F8FAFC', letterSpacing: '-0.02em' }}>
              Crowd Monitoring
            </h1>
            <span
              className="mono"
              style={{
                fontSize: '10px',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '6px',
                background: 'rgba(0, 229, 168, 0.12)',
                color: '#00E5A8',
                border: '1px solid rgba(0, 229, 168, 0.3)',
                letterSpacing: '0.05em',
              }}
            >
              CCTV LIVE
            </span>
          </div>
          <p style={{ fontSize: '13px', color: '#94A3B8', marginTop: '3px' }}>
            Live CCTV-based crowd monitoring
          </p>
        </div>
        <EmptyState
          title="No Active Center"
          description="Please select an active service center to view live crowd telemetry."
        />
      </div>
    );
  }

  // State: Loading
  if (loading && !refreshing) {
    return (
      <div style={{ padding: '24px 28px', maxWidth: '1600px', margin: '0 auto' }}>
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 style={{ fontSize: '22px', fontWeight: 800, color: '#F8FAFC', letterSpacing: '-0.02em' }}>
              Crowd Monitoring
            </h1>
            <span
              className="mono"
              style={{
                fontSize: '10px',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '6px',
                background: 'rgba(0, 229, 168, 0.12)',
                color: '#00E5A8',
                border: '1px solid rgba(0, 229, 168, 0.3)',
                letterSpacing: '0.05em',
              }}
            >
              CCTV LIVE
            </span>
          </div>
          <p style={{ fontSize: '13px', color: '#94A3B8', marginTop: '3px' }}>
            Live CCTV-based crowd monitoring
          </p>
        </div>
        <LoadingSpinner message="Connecting to live CCTV crowd telemetry..." />
      </div>
    );
  }

  // Calculate KPI values
  const currentOccupancy = crowdData?.currentCrowd ?? '—';
  const capacity = crowdData?.capacity ?? '—';
  const occupancyPercent = crowdData?.crowdPercent !== null && crowdData?.crowdPercent !== undefined
    ? `${crowdData.crowdPercent}%`
    : (typeof crowdData?.currentCrowd === 'number' && typeof crowdData?.capacity === 'number' && crowdData.capacity > 0)
      ? `${Math.min(100, Math.round((crowdData.currentCrowd / crowdData.capacity) * 100))}%`
      : '—';
  const status = crowdData?.crowdStatus || 'NORMAL';

  const statusColor =
    status === 'CRITICAL' || (typeof crowdData?.crowdPercent === 'number' && crowdData.crowdPercent >= 80)
      ? '#EF4444'
      : status === 'WARNING' || status === 'MODERATE' || (typeof crowdData?.crowdPercent === 'number' && crowdData.crowdPercent >= 50)
      ? '#F59E0B'
      : '#00E5A8';

  const kpis = [
    {
      label: 'CURRENT OCCUPANCY',
      value: currentOccupancy,
      subtext: 'Live people detected',
      icon: Users,
      color: '#00E5A8',
    },
    {
      label: 'CAPACITY',
      value: capacity,
      subtext: 'Facility threshold',
      icon: Cpu,
      color: '#00D2FF',
    },
    {
      label: 'OCCUPANCY %',
      value: occupancyPercent,
      subtext: 'Current utilization',
      icon: Activity,
      color: statusColor,
    },
    {
      label: 'STATUS',
      value: (
        <span style={{ fontSize: '24px', fontWeight: 800, color: statusColor }}>
          {status}
        </span>
      ),
      subtext: 'Live crowd condition',
      icon: Radio,
      color: statusColor,
    },
  ];

  return (
    <div style={{ padding: '24px 28px', maxWidth: '1600px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 style={{ fontSize: '22px', fontWeight: 800, color: '#F8FAFC', letterSpacing: '-0.02em' }}>
              Crowd Monitoring
            </h1>
            <span
              className="mono"
              style={{
                fontSize: '10px',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '6px',
                background: 'rgba(0, 229, 168, 0.12)',
                color: '#00E5A8',
                border: '1px solid rgba(0, 229, 168, 0.3)',
                letterSpacing: '0.05em',
              }}
            >
              CCTV LIVE
            </span>
          </div>
          <p style={{ fontSize: '13px', color: '#94A3B8', marginTop: '3px' }}>
            Live CCTV-based crowd monitoring
          </p>
        </div>

        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="btn-secondary"
          style={{ fontSize: '12px', padding: '8px 16px', gap: '8px' }}
          title="Refresh crowd telemetry"
        >
          <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          <span>{refreshing ? 'Synchronizing...' : 'Sync Telemetry'}</span>
        </button>
      </div>

      {/* State: Error */}
      {error && <ErrorMessage message={error} onRetry={handleRefresh} />}

      {/* KPI Section */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        {kpis.map((kpi, idx) => {
          const Icon = kpi.icon;
          return (
            <div
              key={idx}
              className="stat-pill"
              style={{
                padding: '20px 22px',
                alignItems: 'flex-start',
                textAlign: 'left',
                background: 'linear-gradient(135deg, rgba(17, 27, 44, 0.75) 0%, rgba(13, 20, 34, 0.6) 100%)',
                borderRadius: '16px',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '12px',
                }}
              >
                <span
                  className="mono"
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: '#94A3B8',
                    letterSpacing: '0.06em',
                  }}
                >
                  {kpi.label}
                </span>
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '10px',
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid var(--border-subtle)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: kpi.color,
                  }}
                >
                  <Icon size={16} />
                </div>
              </div>

              <div
                className="mono"
                style={{
                  fontSize: '32px',
                  fontWeight: 800,
                  color: '#F8FAFC',
                  lineHeight: 1,
                  letterSpacing: '-0.03em',
                }}
              >
                {kpi.value}
              </div>

              <p style={{ fontSize: '12px', color: '#64748B', marginTop: '6px' }}>
                {kpi.subtext}
              </p>
            </div>
          );
        })}
      </div>

      {/* Reused CrowdWidget Component */}
      <CrowdWidget
        crowdData={crowdData}
        onSimulate={simulateCrowd}
        onReset={resetCrowd}
      />

      {/* Live Sync-Status Section */}
      <div
        className="q-card"
        style={{
          background: 'linear-gradient(135deg, rgba(13, 20, 34, 0.85) 0%, rgba(8, 14, 25, 0.8) 100%)',
          border: '1px solid rgba(0, 229, 168, 0.2)',
          borderRadius: '16px',
          padding: '20px 24px',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4), inset 0 0 15px rgba(0, 229, 168, 0.03)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '12px',
                background: 'rgba(0, 229, 168, 0.1)',
                border: '1px solid rgba(0, 229, 168, 0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#00E5A8',
              }}
            >
              <Radio size={20} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="pulsing-dot">
                  <span className="pulsing-dot-ping" style={{ backgroundColor: '#00E5A8' }} />
                  <span className="pulsing-dot-core" style={{ backgroundColor: '#00E5A8' }} />
                </span>
                <span className="mono" style={{ fontSize: '13px', fontWeight: 700, color: '#F8FAFC' }}>
                  CCTV synchronization active
                </span>
                <span
                  className="mono"
                  style={{
                    fontSize: '10px',
                    padding: '2px 8px',
                    borderRadius: '6px',
                    background: 'rgba(0, 210, 255, 0.12)',
                    color: '#00D2FF',
                    border: '1px solid rgba(0, 210, 255, 0.25)',
                  }}
                >
                  {lastSyncEvent?.sensorId || 'CCTV_CAM_01'}
                </span>
              </div>
              <p style={{ fontSize: '12px', color: '#94A3B8', marginTop: '4px' }}>
                {lastSyncEvent
                  ? `Last sync: ${lastSyncEvent.type || 'ABSOLUTE_SYNC'} at ${new Date(lastSyncEvent.timestamp).toLocaleTimeString()}`
                  : 'Receiving live telemetry from automated camera feed and IoT mesh'}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ textAlign: 'right' }}>
              <p className="mono" style={{ fontSize: '10px', color: '#64748B', letterSpacing: '0.05em' }}>
                SYNC PROTOCOL
              </p>
              <p className="mono" style={{ fontSize: '12px', fontWeight: 700, color: '#00E5A8' }}>
                {lastSyncEvent?.type || 'ABSOLUTE_SYNC'}
              </p>
            </div>
            <div style={{ width: '1px', height: '28px', background: 'var(--border-subtle)' }} />
            <div style={{ textAlign: 'right' }}>
              <p className="mono" style={{ fontSize: '10px', color: '#64748B', letterSpacing: '0.05em' }}>
                CHANNEL
              </p>
              <p className="mono" style={{ fontSize: '12px', fontWeight: 700, color: '#00D2FF' }}>
                crowd.updated
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
