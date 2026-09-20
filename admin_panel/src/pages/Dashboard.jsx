import React, { useState } from 'react';
import { useSocket } from '../context/SocketContext';
import { useQueue } from '../hooks/useQueue';
import { useCounters } from '../hooks/useCounters';
import { useCrowd } from '../hooks/useCrowd';
import { useAnalytics } from '../hooks/useAnalytics';
import StatPills from '../components/dashboard/StatPills';
import CrowdWidget from '../components/dashboard/CrowdWidget';
import CounterCard from '../components/counters/CounterCard';
import AssignServiceModal from '../components/counters/AssignServiceModal';
import QueueTable from '../components/queue/QueueTable';
import LiveLog from '../components/dashboard/LiveLog';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorMessage from '../components/common/ErrorMessage';
import { RefreshCw } from 'lucide-react';

export default function Dashboard() {
  const { activeCenterId } = useSocket();
  const { queues, liveLog, loading: queueLoading, error: queueError, refreshQueue } = useQueue(activeCenterId);
  const {
    counters,
    loading: countersLoading,
    error: countersError,
    actionLoadingId,
    callNext,
    startServing,
    complete,
    skip,
    updateStatus,
    assignService,
    refreshCounters,
  } = useCounters(activeCenterId);
  const { crowdData, simulateCrowd, resetCrowd, refreshCrowd } = useCrowd(activeCenterId);
  const { analytics, refreshAnalytics } = useAnalytics(activeCenterId);

  const [selectedCounterForAssign, setSelectedCounterForAssign] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefreshAll = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        refreshQueue(),
        refreshCounters(),
        refreshCrowd(),
        refreshAnalytics?.(),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  const isLoading = queueLoading || countersLoading;
  const error = queueError || countersError;

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 800, color: '#1c1917', letterSpacing: '-0.02em' }}>
            Live Queue & Counter Operations
          </h1>
          <p style={{ fontSize: '12px', color: '#78716c', marginTop: '2px' }}>
            Real-time management dashboard synchronized via Socket.IO
          </p>
        </div>

        <button
          onClick={handleRefreshAll}
          disabled={refreshing}
          className="btn-secondary"
          style={{ fontSize: '12px', padding: '6px 14px' }}
          title="Force refresh data"
        >
          <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
        </button>
      </div>

      {error && <ErrorMessage message={error} onRetry={handleRefreshAll} />}

      {isLoading && !refreshing ? (
        <LoadingSpinner message="Connecting to queue services..." />
      ) : (
        <>
          {/* Top Metrics Stat Pills */}
          <StatPills
            queues={queues}
            counters={counters}
            avgWaitSeconds={analytics?.summary?.avgWaitSeconds}
          />

          {/* IoT Live Footfall Card */}
          <CrowdWidget
            crowdData={crowdData}
            onSimulate={simulateCrowd}
            onReset={resetCrowd}
          />

          {/* Main 2-Column Grid: Counters on left, Live Log & Queues on right */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '24px', alignItems: 'start' }}>
            {/* Left Column: Counters */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <p className="mono" style={{ fontSize: '10px', letterSpacing: '0.1em', color: '#a8a29e', textTransform: 'uppercase' }}>
                  ACTIVE COUNTERS ({counters.length})
                </p>
              </div>

              {counters.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', color: '#a8a29e', fontSize: '13px', background: '#fff', borderRadius: '16px', border: '1px solid #f0ede8' }}>
                  No counters configured for this service center.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '24px' }}>
                  {counters.map((c) => (
                    <CounterCard
                      key={c._id}
                      counter={c}
                      isLoading={actionLoadingId === c._id}
                      onCallNext={callNext}
                      onStartServing={startServing}
                      onComplete={complete}
                      onSkip={skip}
                      onUpdateStatus={updateStatus}
                      onOpenAssign={setSelectedCounterForAssign}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Right Column: Live Event Log & Service Queues */}
            <div>
              <LiveLog log={liveLog} />
              <QueueTable queues={queues} />
            </div>
          </div>
        </>
      )}

      {/* Assign Service Modal */}
      {selectedCounterForAssign && (
        <AssignServiceModal
          counter={selectedCounterForAssign}
          centerId={activeCenterId}
          onClose={() => setSelectedCounterForAssign(null)}
          onAssign={assignService}
        />
      )}
    </div>
  );
}
