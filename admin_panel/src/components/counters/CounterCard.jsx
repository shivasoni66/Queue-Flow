import React, { useState } from 'react';
import { ExternalLink, Settings, Play, CheckCircle2, SkipForward, Coffee } from 'lucide-react';

export default function CounterCard({
  counter,
  onCallNext,
  onStartServing,
  onComplete,
  onSkip,
  onUpdateStatus,
  onOpenAssign,
  isLoading = false,
}) {
  const isBreak = counter.status === 'BREAK';
  const isClosed = counter.status === 'CLOSED';
  const isActive = counter.status === 'ACTIVE';

  const currentToken = counter.currentTokenId;
  const currentTokenCode = currentToken?.tokenCode || (typeof currentToken === 'string' ? currentToken : '—');
  const tokenStatus = currentToken?.status || null;

  const servedCount = counter.stats?.served || 0;
  const serviceName = counter.serviceId?.name || 'Unassigned';

  const handleToggleBreak = () => {
    const nextStatus = isActive ? 'BREAK' : 'ACTIVE';
    onUpdateStatus(counter._id, nextStatus);
  };

  const handleToggleClosed = () => {
    const nextStatus = isClosed ? 'ACTIVE' : 'CLOSED';
    onUpdateStatus(counter._id, nextStatus);
  };

  return (
    <div
      className="q-card"
      style={{
        overflow: 'hidden',
        border: isActive ? '1px solid #f0ede8' : '1px solid #fcd34d60',
      }}
    >
      {/* Card Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 16px',
          borderBottom: '1px solid #f7f5f2',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '14px',
              background: isActive ? 'rgba(249,115,22,0.1)' : 'rgba(148,163,184,0.15)',
              color: isActive ? '#f97316' : '#94a3b8',
            }}
          >
            {counter.number || 'C'}
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <p style={{ fontWeight: 700, fontSize: '14px', color: '#1c1917', lineHeight: 1.2 }}>
                {counter.name}
              </p>
              <a
                href={`/counter/${counter._id}`}
                target="_blank"
                rel="noreferrer"
                style={{ color: '#a8a29e', display: 'flex', alignItems: 'center' }}
                title="Open fullscreen display board"
              >
                <ExternalLink size={12} />
              </a>
            </div>
            <p style={{ fontSize: '11px', color: '#78716c', marginTop: '2px' }}>
              {serviceName} • {servedCount} served today
            </p>
          </div>
        </div>

        {/* Status Pill & Settings */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            onClick={() => onOpenAssign(counter)}
            style={{ background: 'none', border: 'none', color: '#a8a29e', cursor: 'pointer', padding: '4px' }}
            title="Reassign Service"
          >
            <Settings size={14} />
          </button>

          <span
            className="badge"
            style={{
              fontSize: '10px',
              background: isActive
                ? 'rgba(34,197,94,0.1)'
                : isBreak
                ? 'rgba(234,179,8,0.12)'
                : 'rgba(148,163,184,0.15)',
              color: isActive ? '#22c55e' : isBreak ? '#ca8a04' : '#64748b',
            }}
          >
            {counter.status}
          </span>
        </div>
      </div>

      {/* Serving Area */}
      <div
        style={{
          padding: '14px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          background: currentTokenCode !== '—' ? 'rgba(249, 115, 22, 0.02)' : 'transparent',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
            <p className="mono" style={{ fontSize: '10px', color: '#a8a29e', textTransform: 'uppercase' }}>
              NOW SERVING
            </p>
            {tokenStatus && (
              <span
                className={`badge badge-${tokenStatus.toLowerCase()}`}
                style={{ fontSize: '9px', padding: '1px 5px' }}
              >
                {tokenStatus}
              </span>
            )}
          </div>
          <p className="mono" style={{ fontSize: '26px', fontWeight: 800, color: '#1c1917', lineHeight: 1 }}>
            {currentTokenCode}
          </p>
        </div>

        {/* Dynamic Action Buttons based on Token Lifecycle */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'flex-end' }}>
          {/* If a token is currently CALLED -> offer Start Serving or Skip */}
          {tokenStatus === 'CALLED' && (
            <>
              <button
                onClick={() => onStartServing(counter._id)}
                disabled={isLoading}
                className="btn-primary"
                style={{ padding: '6px 12px', fontSize: '12px', background: '#3b82f6' }}
                title="Customer has arrived at counter"
              >
                <Play size={13} />
                <span>Start Serving</span>
              </button>
              <button
                onClick={() => onSkip(counter._id, currentToken?._id)}
                disabled={isLoading}
                className="btn-danger"
                style={{ padding: '6px 10px', fontSize: '12px' }}
                title="Customer did not arrive"
              >
                <SkipForward size={13} />
                <span>Skip</span>
              </button>
            </>
          )}

          {/* If a token is currently SERVING -> offer Complete or Skip */}
          {tokenStatus === 'SERVING' && (
            <>
              <button
                onClick={() => onComplete(counter._id)}
                disabled={isLoading}
                className="btn-success"
                style={{ padding: '6px 14px', fontSize: '12px' }}
                title="Finish service"
              >
                <CheckCircle2 size={14} />
                <span>Complete</span>
              </button>
              <button
                onClick={() => onSkip(counter._id, currentToken?._id)}
                disabled={isLoading}
                className="btn-danger"
                style={{ padding: '6px 10px', fontSize: '12px' }}
                title="Abandon / Skip"
              >
                <SkipForward size={13} />
              </button>
            </>
          )}

          {/* If no active token or counter is idle -> Call Next */}
          {(!currentToken || currentTokenCode === '—') && (
            <button
              onClick={() => onCallNext(counter._id)}
              disabled={isLoading || !isActive || !counter.serviceId}
              className="btn-primary"
              style={{ padding: '7px 16px', fontSize: '12px' }}
            >
              <span>Call Next →</span>
            </button>
          )}

          {/* Break / Active switch */}
          {!isClosed && (
            <button
              onClick={handleToggleBreak}
              disabled={isLoading}
              className="btn-secondary"
              style={{ padding: '6px 10px', fontSize: '12px' }}
              title={isActive ? 'Put counter on break' : 'Resume counter from break'}
            >
              <Coffee size={13} />
              <span>{isActive ? 'Break' : 'Resume'}</span>
            </button>
          )}

          {/* Close / Open toggle */}
          <button
            onClick={handleToggleClosed}
            disabled={isLoading}
            className="btn-secondary"
            style={{ padding: '6px 8px', fontSize: '12px' }}
            title={isClosed ? 'Open Counter' : 'Close Counter'}
          >
            <span style={{ fontSize: '11px' }}>{isClosed ? 'Open' : 'Close'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
