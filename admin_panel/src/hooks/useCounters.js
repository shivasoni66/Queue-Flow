import { useState, useEffect, useCallback } from 'react';
import { counterAPI } from '../services/api';
import { useSocket } from '../context/SocketContext';

export function useCounters(centerId) {
  const [counters, setCounters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const { on } = useSocket();

  const fetchCounters = useCallback(async () => {
    if (!centerId) return;
    try {
      setError(null);
      const res = await counterAPI.list(centerId);
      if (res.success && res.data?.counters) {
        setCounters(res.data.counters);
      }
    } catch (err) {
      console.error('Error fetching counters:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [centerId]);

  useEffect(() => {
    fetchCounters();
  }, [fetchCounters]);

  // Real-time counter updates via Socket.IO
  useEffect(() => {
    if (!centerId) return;

    const unsubCounter = on('counter.updated', (data) => {
      const updatedCounter = data.counter;
      if (updatedCounter) {
        setCounters((prev) =>
          prev.map((c) => (c._id === updatedCounter._id ? { ...c, ...updatedCounter } : c))
        );
      }
    });

    const unsubTokenCompleted = on('token.completed', () => {
      fetchCounters();
    });

    const unsubTokenCalled = on('token.called', () => {
      fetchCounters();
    });

    const unsubTokenServing = on('token.serving', () => {
      fetchCounters();
    });

    const unsubTokenSkipped = on('token.skipped', () => {
      fetchCounters();
    });

    const unsubTokenCancelled = on('token.cancelled', () => {
      fetchCounters();
    });

    const unsubTokenExpired = on('token.expired', () => {
      fetchCounters();
    });

    return () => {
      unsubCounter();
      unsubTokenCompleted();
      unsubTokenCalled();
      unsubTokenServing();
      unsubTokenSkipped();
      unsubTokenCancelled();
      unsubTokenExpired();
    };
  }, [centerId, on, fetchCounters]);

  // Counter Actions
  const callNext = async (counterId) => {
    setActionLoadingId(counterId);
    try {
      const res = await counterAPI.callNext(counterId);
      await fetchCounters();
      return res.data;
    } catch (err) {
      alert(err.message || 'Failed to call next token');
      throw err;
    } finally {
      setActionLoadingId(null);
    }
  };

  const startServing = async (counterId) => {
    setActionLoadingId(counterId);
    try {
      const res = await counterAPI.startServing(counterId);
      await fetchCounters();
      return res.data;
    } catch (err) {
      alert(err.message || 'Failed to start serving');
      throw err;
    } finally {
      setActionLoadingId(null);
    }
  };

  const complete = async (counterId) => {
    setActionLoadingId(counterId);
    try {
      const res = await counterAPI.complete(counterId);
      await fetchCounters();
      return res.data;
    } catch (err) {
      alert(err.message || 'Failed to complete token');
      throw err;
    } finally {
      setActionLoadingId(null);
    }
  };

  const skip = async (counterId, tokenId) => {
    setActionLoadingId(counterId);
    try {
      const res = await counterAPI.skip(counterId, tokenId);
      await fetchCounters();
      return res.data;
    } catch (err) {
      alert(err.message || 'Failed to skip token');
      throw err;
    } finally {
      setActionLoadingId(null);
    }
  };

  const updateStatus = async (counterId, status) => {
    setActionLoadingId(counterId);
    try {
      const res = await counterAPI.updateStatus(counterId, status);
      await fetchCounters();
      return res.data;
    } catch (err) {
      alert(err.message || 'Failed to update counter status');
      throw err;
    } finally {
      setActionLoadingId(null);
    }
  };

  const assignService = async (counterId, serviceId) => {
    setActionLoadingId(counterId);
    try {
      const res = await counterAPI.assignService(counterId, serviceId);
      await fetchCounters();
      return res.data;
    } catch (err) {
      alert(err.message || 'Failed to assign service');
      throw err;
    } finally {
      setActionLoadingId(null);
    }
  };

  return {
    counters,
    loading,
    error,
    actionLoadingId,
    callNext,
    startServing,
    complete,
    skip,
    updateStatus,
    assignService,
    refreshCounters: fetchCounters,
  };
}
