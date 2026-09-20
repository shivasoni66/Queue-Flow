import { useState, useEffect, useCallback } from 'react';
import { crowdAPI, devAPI } from '../services/api';
import { useSocket } from '../context/SocketContext';

export function useCrowd(centerId) {
  const [crowdData, setCrowdData] = useState({
    currentCrowd: null,
    capacity: null,
    crowdPercent: null,
    crowdStatus: null,
    entriesToday: 0,
    exitsToday: 0,
    events: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { on } = useSocket();

  const fetchCrowd = useCallback(async () => {
    if (!centerId) return;
    try {
      setError(null);
      const res = await crowdAPI.getStatus(centerId);
      if (res.success && res.data) {
        setCrowdData((prev) => ({
          ...prev,
          ...res.data,
        }));
      }
    } catch (err) {
      console.error('Error fetching crowd status:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [centerId]);

  useEffect(() => {
    fetchCrowd();
  }, [fetchCrowd]);

  // Real-time crowd update via Socket.IO
  useEffect(() => {
    if (!centerId) return;

    const unsubCrowd = on('crowd.updated', (data) => {
      if (data.centerId === centerId) {
        setCrowdData((prev) => {
          const current = data.currentCrowd ?? prev.currentCrowd;
          const cap = data.capacity ?? prev.capacity;
          const pct = data.crowdPercent ?? (cap ? Math.round(((current || 0) / cap) * 100) : null);
          return {
            ...prev,
            currentCrowd: current,
            capacity: cap ?? null,
            crowdPercent: pct,
            crowdStatus: data.crowdStatus ?? prev.crowdStatus,
          };
        });
      }
    });

    return () => {
      unsubCrowd();
    };
  }, [centerId, on]);

  // Simulator actions for development/testing
  const simulateCrowd = async (type, count = 1) => {
    try {
      const res = await devAPI.simulateCrowd(centerId, type, count);
      await fetchCrowd();
      return res.data;
    } catch (err) {
      alert(err.message || 'Failed to simulate crowd');
      throw err;
    }
  };

  const resetCrowd = async () => {
    try {
      const res = await devAPI.resetCrowd(centerId);
      await fetchCrowd();
      return res.data;
    } catch (err) {
      alert(err.message || 'Failed to reset crowd');
      throw err;
    }
  };

  return {
    crowdData,
    loading,
    error,
    simulateCrowd,
    resetCrowd,
    refreshCrowd: fetchCrowd,
  };
}
