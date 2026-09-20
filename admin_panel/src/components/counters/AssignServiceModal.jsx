import React, { useState, useEffect } from 'react';
import { serviceAPI } from '../../services/api';
import { X } from 'lucide-react';

export default function AssignServiceModal({ counter, centerId, onClose, onAssign }) {
  const [services, setServices] = useState([]);
  const [selectedServiceId, setSelectedServiceId] = useState(
    counter?.serviceId?._id || counter?.serviceId || ''
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadServices() {
      if (!centerId) return;
      try {
        const res = await serviceAPI.list(centerId);
        if (res.success && res.data?.services) {
          setServices(res.data.services);
        }
      } catch (err) {
        console.error('Failed to load services for counter assignment:', err);
      } finally {
        setLoading(false);
      }
    }
    loadServices();
  }, [centerId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onAssign(counter._id, selectedServiceId || null);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #f0ede8' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1c1917' }}>
            Assign Service to {counter?.name}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a8a29e' }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '20px' }}>
          <p style={{ fontSize: '13px', color: '#78716c', marginBottom: '14px' }}>
            Choose which service queue this counter will handle. Calling next will draw from this queue.
          </p>

          {loading ? (
            <p style={{ fontSize: '13px', color: '#a8a29e' }}>Loading available services...</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '10px 14px',
                  borderRadius: '12px',
                  border: !selectedServiceId ? '2px solid #f97316' : '1px solid #e7e5e4',
                  background: !selectedServiceId ? 'rgba(249,115,22,0.04)' : '#fff',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="radio"
                  name="service"
                  value=""
                  checked={!selectedServiceId}
                  onChange={() => setSelectedServiceId('')}
                />
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#1c1917' }}>Unassigned (Idle)</span>
              </label>

              {services.map((svc) => (
                <label
                  key={svc._id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '10px 14px',
                    borderRadius: '12px',
                    border: selectedServiceId === svc._id ? '2px solid #f97316' : '1px solid #e7e5e4',
                    background: selectedServiceId === svc._id ? 'rgba(249,115,22,0.04)' : '#fff',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="radio"
                    name="service"
                    value={svc._id}
                    checked={selectedServiceId === svc._id}
                    onChange={() => setSelectedServiceId(svc._id)}
                  />
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: '13px', fontWeight: 600, color: '#1c1917' }}>{svc.name}</p>
                    <p style={{ fontSize: '11px', color: '#a8a29e' }}>Prefix: {svc.tokenPrefix} • ~{svc.avgServiceTimeMinutes} min/customer</p>
                  </div>
                </label>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Saving...' : 'Save Assignment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
