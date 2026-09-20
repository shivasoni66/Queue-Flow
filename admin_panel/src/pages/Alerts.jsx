import React, { useState } from 'react';
import { useSocket } from '../context/SocketContext';
import { useAnalytics } from '../hooks/useAnalytics';
import { notificationAPI } from '../services/api';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorMessage from '../components/common/ErrorMessage';
import EmptyState from '../components/common/EmptyState';
import { AlertTriangle, Info, CheckCircle, Send, Check } from 'lucide-react';

export default function Alerts() {
  const { activeCenterId } = useSocket();
  const { analytics, loading, error, refreshAnalytics } = useAnalytics(activeCenterId);
  const recommendations = analytics?.recommendations || [];

  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastBody, setBroadcastBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);

  const handleSendBroadcast = async (e) => {
    e.preventDefault();
    if (!broadcastTitle || !broadcastBody) return;

    setSending(true);
    setSendSuccess(false);
    try {
      await notificationAPI.sendBroadcast(activeCenterId, broadcastTitle, broadcastBody);
      setSendSuccess(true);
      setBroadcastTitle('');
      setBroadcastBody('');
      setTimeout(() => setSendSuccess(false), 4000);
    } catch (err) {
      alert(err.message || 'Failed to send broadcast');
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ padding: '24px', maxWidth: '900px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 800, color: '#1c1917', letterSpacing: '-0.02em' }}>
          Operational Alerts & Recommendations
        </h1>
        <p style={{ fontSize: '12px', color: '#78716c', marginTop: '2px' }}>
          Real-time intelligent recommendations based on active queue loads and IoT crowd levels
        </p>
      </div>

      {error && <ErrorMessage message={error} onRetry={refreshAnalytics} />}

      {loading ? (
        <LoadingSpinner message="Evaluating operational parameters..." />
      ) : (
        <>
          {/* Action item header pill */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '12px 18px',
              borderRadius: '16px',
              marginBottom: '24px',
              background: recommendations.length > 0 ? 'rgba(249, 115, 22, 0.08)' : 'rgba(34, 197, 94, 0.08)',
              border: recommendations.length > 0 ? '1px solid rgba(249, 115, 22, 0.25)' : '1px solid rgba(34, 197, 94, 0.25)',
            }}
          >
            {recommendations.length > 0 ? (
              <AlertTriangle size={18} color="#f97316" />
            ) : (
              <CheckCircle size={18} color="#22c55e" />
            )}
            <p style={{ fontSize: '13px', fontWeight: 700, color: recommendations.length > 0 ? '#ea580c' : '#15803d' }}>
              {recommendations.length > 0
                ? `${recommendations.length} operational recommendation${recommendations.length > 1 ? 's' : ''} require attention`
                : 'All queues and operations are currently running within optimal parameters'}
            </p>
          </div>

          {/* Recommendations List */}
          <div style={{ marginBottom: '32px' }}>
            <p className="mono" style={{ fontSize: '10px', letterSpacing: '0.1em', color: '#a8a29e', marginBottom: '12px', textTransform: 'uppercase' }}>
              DATA-DRIVEN RECOMMENDATIONS
            </p>

            {recommendations.length === 0 ? (
              <EmptyState
                title="No active alerts"
                description="When queues spike or counter capacities reach threshold, operational suggestions will appear here."
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {recommendations.map((rec, i) => {
                  const isWarn = rec.type === 'WARN';
                  const isSuggest = rec.type === 'SUGGEST';
                  const borderColor = isWarn ? 'rgba(249,115,22,0.3)' : isSuggest ? 'rgba(34,197,94,0.3)' : 'rgba(6,182,212,0.3)';
                  const tagBg = isWarn ? 'rgba(249,115,22,0.1)' : isSuggest ? 'rgba(34,197,94,0.1)' : 'rgba(6,182,212,0.1)';
                  const tagColor = isWarn ? '#f97316' : isSuggest ? '#22c55e' : '#06b6d4';

                  return (
                    <div
                      key={i}
                      className="q-card"
                      style={{
                        padding: '18px 20px',
                        border: `1px solid ${borderColor}`,
                        background: '#ffffff',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span
                          className="mono"
                          style={{
                            fontSize: '9px',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: '6px',
                            background: tagBg,
                            color: tagColor,
                          }}
                        >
                          {rec.type || 'INFO'}
                        </span>
                        {isWarn ? <AlertTriangle size={15} color={tagColor} /> : <Info size={15} color={tagColor} />}
                      </div>

                      <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#1c1917', marginBottom: '4px' }}>
                        {rec.title}
                      </h3>

                      <p style={{ fontSize: '13px', color: '#78716c', lineHeight: 1.5, marginBottom: '14px' }}>
                        {rec.desc}
                      </p>

                      {rec.action && (
                        <div style={{ display: 'inline-flex' }}>
                          <span
                            className="mono"
                            style={{
                              fontSize: '11px',
                              fontWeight: 600,
                              padding: '6px 12px',
                              borderRadius: '8px',
                              background: tagBg,
                              color: tagColor,
                              border: `1px solid ${borderColor}`,
                            }}
                          >
                            Suggested: {rec.action}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Broadcast Notification Form matching UI reference */}
          <div>
            <p className="mono" style={{ fontSize: '10px', letterSpacing: '0.1em', color: '#a8a29e', marginBottom: '12px', textTransform: 'uppercase' }}>
              BROADCAST ANNOUNCEMENT
            </p>

            <div className="q-card" style={{ padding: '24px' }}>
              <p style={{ fontSize: '13px', color: '#78716c', marginBottom: '16px' }}>
                Send a real-time announcement to all queued visitors at this service center via Socket.IO.
              </p>

              {sendSuccess && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', borderRadius: '12px', background: 'rgba(34,197,94,0.1)', color: '#15803d', fontSize: '13px', marginBottom: '16px' }}>
                  <Check size={16} />
                  <span>Announcement successfully broadcast to all active queued visitors!</span>
                </div>
              )}

              <form onSubmit={handleSendBroadcast}>
                <div style={{ marginBottom: '14px' }}>
                  <input
                    type="text"
                    required
                    value={broadcastTitle}
                    onChange={(e) => setBroadcastTitle(e.target.value)}
                    placeholder="Announcement Title (e.g. Counter 03 Opening Shortly)"
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '12px',
                      border: '1px solid #e7e5e4',
                      fontSize: '14px',
                      fontFamily: 'var(--font-main)',
                      outline: 'none',
                      background: '#faf9f6',
                    }}
                  />
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <textarea
                    rows={3}
                    required
                    value={broadcastBody}
                    onChange={(e) => setBroadcastBody(e.target.value)}
                    placeholder="Type your message here for all queued visitors..."
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      borderRadius: '12px',
                      border: '1px solid #e7e5e4',
                      fontSize: '14px',
                      fontFamily: 'var(--font-main)',
                      outline: 'none',
                      resize: 'none',
                      background: '#faf9f6',
                    }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={sending || !broadcastTitle || !broadcastBody}
                  className="btn-primary"
                  style={{ width: '100%', padding: '12px', fontSize: '13px' }}
                >
                  <Send size={14} />
                  <span>{sending ? 'Broadcasting...' : 'Broadcast to All Queued Visitors'}</span>
                </button>
              </form>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
