import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { getSocket, joinCenterRoom, leaveCenterRoom } from '../services/socket';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const [isConnected, setIsConnected] = useState(false);
  const [activeCenterId, setActiveCenterId] = useState(null);
  const previousCenterRef = useRef(null);

  useEffect(() => {
    const socket = getSocket();

    function handleConnect() {
      setIsConnected(true);
      if (activeCenterId) {
        joinCenterRoom(activeCenterId);
      }
    }

    function handleDisconnect() {
      setIsConnected(false);
    }

    if (socket.connected) {
      setIsConnected(true);
    }

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
    };
  }, [activeCenterId]);

  // Handle center room switching
  useEffect(() => {
    if (previousCenterRef.current && previousCenterRef.current !== activeCenterId) {
      leaveCenterRoom(previousCenterRef.current);
    }

    if (activeCenterId) {
      joinCenterRoom(activeCenterId);
      previousCenterRef.current = activeCenterId;
    }
  }, [activeCenterId]);

  /**
   * Subscribe to a socket event with automatic cleanup
   */
  const on = useCallback((eventName, handler) => {
    const socket = getSocket();
    socket.on(eventName, handler);
    return () => {
      socket.off(eventName, handler);
    };
  }, []);

  const value = {
    socket: getSocket(),
    isConnected,
    activeCenterId,
    setActiveCenterId,
    on,
  };

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket() {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
}
