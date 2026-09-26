import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

let socket = null;

export function getSocket() {
  const token = localStorage.getItem('queueflow_admin_token');

  if (!socket) {
    socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      auth: (cb) => {
        const currentToken = localStorage.getItem('queueflow_admin_token');
        cb(currentToken ? { token: currentToken } : {});
      },
      autoConnect: Boolean(token),
      reconnection: true,
      reconnectionAttempts: 15,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });

    socket.on('connect', () => {
      console.log(`[Socket] Connected to server: ${socket.id}`);
    });

    socket.on('disconnect', (reason) => {
      console.log(`[Socket] Disconnected from server: ${reason}`);
    });

    socket.on('connect_error', (error) => {
      console.warn('[Socket] Connection error:', error.message);
    });
  }

  // If a token is present and socket is not yet connected, update auth and connect
  if (token && !socket.connected) {
    socket.auth = { token };
    socket.connect();
  }

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function joinCenterRoom(centerId) {
  const s = getSocket();
  if (s && centerId) {
    s.emit('join:center', centerId);
  }
}

export function leaveCenterRoom(centerId) {
  const s = getSocket();
  if (s && centerId) {
    s.emit('leave:center', centerId);
  }
}

export function joinCounterRoom(centerId, counterId) {
  const s = getSocket();
  if (s && centerId && counterId) {
    s.emit('join:counter', { centerId, counterId });
  }
}

export function leaveCounterRoom(centerId, counterId) {
  const s = getSocket();
  if (s && centerId && counterId) {
    s.emit('leave:counter', { centerId, counterId });
  }
}

export function joinUserRoom(userId) {
  const s = getSocket();
  if (s && userId) {
    s.emit('join:user', userId);
  }
}

export default {
  getSocket,
  disconnectSocket,
  joinCenterRoom,
  leaveCenterRoom,
  joinCounterRoom,
  joinUserRoom,
};
