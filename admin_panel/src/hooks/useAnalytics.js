import { useState, useEffect, useCallback, useRef } from 'react';
import { analyticsAPI } from '../services/api';
import { useSocket } from '../context/SocketContext';

// Queue lifecycle events that can change the stat pills.
const METRIC_EVENTS = [
  'queue.updated',
  'token.created',
  'token.called',
  'token.serving',
  'token.completed',
  'token.skipped',
  'token.cancelled',
  'token.expired',
  'crowd.updated',
];

const INITIAL_DATA = Object.freeze({
  summary: null,
  queues: [],
  counters: [],
  hourlyFootfall: [],
  serviceDemand: [],
  recommendations: [],
});

export function useAnalytics(centerId) {
  const [data, setData] = useState(INITIAL_DATA);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const { on } = useSocket();

  const centerRef = useRef(centerId);
  centerRef.current = centerId;

  const fetchAnalytics = useCallback(async (isManualRefresh = false) => {
    if (!centerId) {
      setData(INITIAL_DATA);
      setLoading(false);
      return;
    }

    try {
      setError(null);
      if (isManualRefresh) {
        setRefreshing(true);
      }
      const res = await analyticsAPI.getDashboard(centerId);
      // Discard if active center changed during request
      if (String(centerRef.current) !== String(centerId)) {
        return;
      }
      if (res.success && res.data) {
        setData(res.data);
      }
    } catch (err) {
      if (String(centerRef.current) === String(centerId)) {
        console.error('Error fetching analytics:', err);
        setError(err.message || 'Failed to load operational analytics');
      }
    } finally {
      if (String(centerRef.current) === String(centerId)) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [centerId]);

  // When active center changes: clear old data immediately, set loading, load new center
  useEffect(() => {
    setData(INITIAL_DATA);
    setLoading(true);
    setError(null);
    fetchAnalytics(false);
  }, [centerId, fetchAnalytics]);

  // Realtime refresh via socket events scoped to active center
  const pendingRef = useRef(null);

  useEffect(() => {
    if (!centerId) return undefined;

    const scheduleRefresh = () => {
      if (pendingRef.current) return;
      pendingRef.current = setTimeout(() => {
        pendingRef.current = null;
        if (centerRef.current) fetchAnalytics(false);
      }, 250);
    };

    const unsubscribers = METRIC_EVENTS.map((eventName) =>
      on(eventName, (payload) => {
        // Realtime crowd update: patch crowd immediately in current summary
        if (eventName === 'crowd.updated' && payload) {
          const payloadCenterId = payload.centerId;
          if (String(payloadCenterId) === String(centerRef.current)) {
            setData((prev) => {
              if (!prev || !prev.summary) return prev;
              return {
                ...prev,
                summary: {
                  ...prev.summary,
                  currentCrowd: typeof payload.currentCrowd === 'number' ? payload.currentCrowd : prev.summary.currentCrowd,
                  crowdPercent: typeof payload.crowdPercent === 'number' ? payload.crowdPercent : prev.summary.crowdPercent,
                  crowdStatus: payload.crowdStatus || prev.summary.crowdStatus,
                  crowdUpdatedAt: payload.crowdUpdatedAt || new Date().toISOString(),
                  crowdSensorOnline: true,
                },
              };
            });
            return;
          }
        }

        // Ignore events for other centers
        const payloadCenterId = payload?.centerId ?? payload?.token?.centerId;
        if (payloadCenterId && String(payloadCenterId) !== String(centerRef.current)) {
          return;
        }
        scheduleRefresh();
      })
    );

    return () => {
      if (pendingRef.current) {
        clearTimeout(pendingRef.current);
        pendingRef.current = null;
      }
      unsubscribers.forEach((off) => off());
    };
  }, [centerId, on, fetchAnalytics]);

  return {
    analytics: data,
    loading,
    refreshing,
    error,
    refreshAnalytics: () => fetchAnalytics(true),
  };
}
