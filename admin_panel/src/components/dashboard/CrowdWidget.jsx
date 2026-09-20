import React, { useState } from 'react';
import { UserPlus, UserMinus, RotateCcw } from 'lucide-react';

export default function CrowdWidget({ crowdData, onSimulate, onReset }) {
  const [simLoading, setSimLoading] = useState(false);
  const currentCrowd = crowdData?.currentCrowd;
  const isCrowdLoaded = typeof currentCrowd === 'number';
  const capacity = typeof crowdData?.capacity === 'number' && crowdData.capacity > 0 ? crowdData.capacity : null;
  const crowdPercent = capacity !== null && isCrowdLoaded
    ? (crowdData?.crowdPercent ?? Math.min(100, Math.round((currentCrowd / capacity) * 100)))
    : null;

  const statusColor = (crowdPercent ?? 0) >= 80 ? '#ef4444' : (crowdPercent ?? 0) >= 50 ? '#f59e0b' : '#22c55e';

  const handleSimulate = async (type) => {
    if (!onSimulate) return;
    setSimLoading(true);
    try {
      await onSimulate(type, 1);
    } finally {
      setSimLoading(false);
    }
  };

  const handleReset = async () => {
    if (!onReset || !window.confirm('Reset current crowd count to 0?')) return;
    setSimLoading(true);
    try {
      await onReset();
    } finally {
      setSimLoading(false);
    }
  };

  return (
    <div
      style={{
        background: 'rgba(6, 182, 212, 0.06)',
        border: '1px solid rgba(6, 182, 212, 0.22)',
        borderRadius: '16px',
        padding: '16px 20px',
        marginBottom: '20px',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
      }}
    >
      <div style={{ flex: '1', minWidth: '220px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <span className="pulsing-dot">
            <span className="pulsing-dot-ping" style={{ backgroundColor: '#06b6d4' }}></span>
            <span className="pulsing-dot-core" style={{ backgroundColor: '#06b6d4' }}></span>
          </span>
          <p style={{ fontSize: '12px', fontWeight: 700, color: '#06b6d4', letterSpacing: '0.02em' }}>
            IoT Live Footfall Sensor
          </p>
        </div>

        <p style={{ fontSize: '13px', color: '#44403c' }}>
          {isCrowdLoaded ? (
            <>
              <span style={{ fontSize: '24px', fontWeight: 800, color: '#1c1917', marginRight: '6px' }}>
                {currentCrowd}
              </span>
              people in premises right now
            </>
          ) : (
            <span style={{ fontSize: '18px', fontWeight: 700, color: '#78716c' }}>
              Loading...
            </span>
          )}
        </p>
      </div>

      {/* Capacity Progress */}
      <div style={{ minWidth: '130px', textAlign: 'right' }}>
        {!isCrowdLoaded ? (
          <p className="mono" style={{ fontSize: '11px', color: '#a8a29e' }}>
            Loading...
          </p>
        ) : capacity !== null && crowdPercent !== null ? (
          <>
            <p className="mono" style={{ fontSize: '10px', color: '#a8a29e', letterSpacing: '0.05em' }}>
              CAPACITY ({capacity} MAX)
            </p>
            <div style={{ width: '130px', height: '8px', borderRadius: '9999px', background: '#f5f3f0', overflow: 'hidden', margin: '6px 0 3px auto' }}>
              <div
                style={{
                  height: '100%',
                  borderRadius: '9999px',
                  width: `${Math.min(100, crowdPercent ?? 0)}%`,
                  background: `linear-gradient(90deg, #22c55e 0%, ${statusColor} 100%)`,
                  transition: 'width 0.5s ease',
                }}
              />
            </div>
            <p className="mono" style={{ fontSize: '11px', fontWeight: 600, color: statusColor }}>
              {crowdPercent}% full ({crowdData?.crowdStatus || 'NORMAL'})
            </p>
          </>
        ) : (
          <p className="mono" style={{ fontSize: '11px', color: '#a8a29e' }}>
            Capacity unavailable
          </p>
        )}
      </div>

      {/* Dev Simulator Actions */}
      {import.meta.env.DEV && onSimulate && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            onClick={() => handleSimulate('ENTRY')}
            disabled={simLoading}
            className="btn-secondary"
            style={{ padding: '6px 10px', fontSize: '11px', gap: '4px' }}
            title="Simulate 1 IoT Entry"
          >
            <UserPlus size={13} color="#22c55e" />
            <span>+ Entry</span>
          </button>
          <button
            onClick={() => handleSimulate('EXIT')}
            disabled={simLoading || currentCrowd === 0}
            className="btn-secondary"
            style={{ padding: '6px 10px', fontSize: '11px', gap: '4px' }}
            title="Simulate 1 IoT Exit"
          >
            <UserMinus size={13} color="#ef4444" />
            <span>- Exit</span>
          </button>
          <button
            onClick={handleReset}
            disabled={simLoading || currentCrowd === 0}
            className="btn-secondary"
            style={{ padding: '6px 8px', fontSize: '11px' }}
            title="Reset crowd count"
          >
            <RotateCcw size={13} />
          </button>
        </div>
      )}
    </div>
  );
}
