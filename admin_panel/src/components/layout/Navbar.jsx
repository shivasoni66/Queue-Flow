import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { serviceCenterAPI } from '../../services/api';
import { LogOut, Radio, ChevronDown, Building2 } from 'lucide-react';

export default function Navbar() {
  const { user, logout, isAdmin } = useAuth();
  const { isConnected, activeCenterId, setActiveCenterId } = useSocket();
  const [centers, setCenters] = useState([]);
  const [currentTime, setCurrentTime] = useState('');
  const navigate = useNavigate();

  // Load available service centers
  useEffect(() => {
    async function loadCenters() {
      try {
        const res = await serviceCenterAPI.list();
        if (res.success && res.data?.centers) {
          const list = res.data.centers;
          setCenters(list);
          if (list.length > 0 && !activeCenterId) {
            setActiveCenterId(list[0]._id);
          }
        }
      } catch (err) {
        console.error('Failed to load service centers:', err);
      }
    }
    loadCenters();
  }, [activeCenterId, setActiveCenterId]);

  // Live time ticker
  useEffect(() => {
    function updateClock() {
      const now = new Date();
      setCurrentTime(
        `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
      );
    }
    updateClock();
    const interval = setInterval(updateClock, 10000);
    return () => clearInterval(interval);
  }, []);

  const currentCenter = centers.find((c) => c._id === activeCenterId);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header style={{ background: '#faf9f6', borderBottom: '1px solid #f0ede8', position: 'sticky', top: 0, zIndex: 100 }}>
      {/* Top micro-bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 24px', borderBottom: '1px solid #f7f5f2', fontSize: '11px', color: '#a8a29e' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="mono">{currentTime}</span>
          <span>•</span>
          <span>Operator: <strong style={{ color: '#44403c' }}>{user?.name || 'Staff'}</strong></span>
          <span className="badge" style={{ fontSize: '9px', padding: '1px 6px', background: 'rgba(249,115,22,0.1)', color: '#f97316' }}>
            {user?.role || 'STAFF'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {/* Socket live indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {isConnected ? (
              <>
                <span className="pulsing-dot">
                  <span className="pulsing-dot-ping" style={{ backgroundColor: '#22c55e' }}></span>
                  <span className="pulsing-dot-core" style={{ backgroundColor: '#22c55e' }}></span>
                </span>
                <span style={{ color: '#22c55e', fontWeight: 600, fontSize: '11px', letterSpacing: '0.05em' }}>LIVE</span>
              </>
            ) : (
              <>
                <span className="pulsing-dot">
                  <span className="pulsing-dot-core" style={{ backgroundColor: '#f59e0b' }}></span>
                </span>
                <span style={{ color: '#f59e0b', fontWeight: 600, fontSize: '11px' }}>RECONNECTING</span>
              </>
            )}
          </div>

          <button
            onClick={handleLogout}
            style={{
              background: 'none',
              border: 'none',
              color: '#78716c',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '11px',
              padding: '2px 6px',
              borderRadius: '6px',
            }}
            title="Sign out"
          >
            <LogOut size={13} />
            <span>Sign out</span>
          </button>
        </div>
      </div>

      {/* Main Navigation Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 24px', maxWidth: '1400px', margin: '0 auto' }}>
        {/* Brand & Center Select */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: '#f97316', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <span style={{ fontWeight: 800, fontSize: '18px', color: '#1c1917', letterSpacing: '-0.02em' }}>QueueFlow</span>
            <span className="mono" style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '6px', fontWeight: 700, background: 'rgba(249,115,22,0.1)', color: '#f97316' }}>
              ADMIN
            </span>
          </div>

          {/* Service Center Switcher Dropdown */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Building2 size={15} style={{ color: '#a8a29e', marginRight: '6px' }} />
            <select
              value={activeCenterId || ''}
              onChange={(e) => setActiveCenterId(e.target.value)}
              style={{
                fontFamily: 'var(--font-main)',
                fontSize: '13px',
                fontWeight: 600,
                color: '#44403c',
                background: '#ffffff',
                border: '1px solid #e7e5e4',
                borderRadius: '10px',
                padding: '6px 28px 6px 10px',
                appearance: 'none',
                cursor: 'pointer',
                outline: 'none',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              {centers.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name} ({c.code})
                </option>
              ))}
            </select>
            <ChevronDown size={14} style={{ position: 'absolute', right: '10px', pointerEvents: 'none', color: '#78716c' }} />
          </div>
        </div>

        {/* Tab Navigation matching reference */}
        <nav style={{ display: 'flex', gap: '8px' }}>
          <NavLink
            to="/dashboard"
            className={({ isActive }) => (isActive ? 'active' : '')}
            style={({ isActive }) => ({
              padding: '8px 18px',
              borderRadius: '12px',
              fontSize: '13px',
              fontWeight: 600,
              textDecoration: 'none',
              transition: 'all 0.15s ease',
              background: isActive ? '#f97316' : 'rgba(0,0,0,0.04)',
              color: isActive ? '#ffffff' : '#78716c',
              boxShadow: isActive ? '0 2px 8px rgba(249,115,22,0.25)' : 'none',
            })}
          >
            Live
          </NavLink>

          <NavLink
            to="/analytics"
            style={({ isActive }) => ({
              padding: '8px 18px',
              borderRadius: '12px',
              fontSize: '13px',
              fontWeight: 600,
              textDecoration: 'none',
              transition: 'all 0.15s ease',
              background: isActive ? '#f97316' : 'rgba(0,0,0,0.04)',
              color: isActive ? '#ffffff' : '#78716c',
              boxShadow: isActive ? '0 2px 8px rgba(249,115,22,0.25)' : 'none',
            })}
          >
            Analytics
          </NavLink>

          <NavLink
            to="/alerts"
            style={({ isActive }) => ({
              padding: '8px 18px',
              borderRadius: '12px',
              fontSize: '13px',
              fontWeight: 600,
              textDecoration: 'none',
              transition: 'all 0.15s ease',
              background: isActive ? '#f97316' : 'rgba(0,0,0,0.04)',
              color: isActive ? '#ffffff' : '#78716c',
              boxShadow: isActive ? '0 2px 8px rgba(249,115,22,0.25)' : 'none',
            })}
          >
            Alerts
          </NavLink>
        </nav>
      </div>
    </header>
  );
}
