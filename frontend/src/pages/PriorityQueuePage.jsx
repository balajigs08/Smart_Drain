import React, { useEffect, useState } from 'react'
import { api } from '../api'
import { RiskBadge, PriorityBadge, EmptyState, Spinner } from '../components/Shared'

export default function PriorityQueuePage({ dashboardData }) {
  const [queue,   setQueue]   = useState([])
  const [loading, setLoading] = useState(true)

  const load = () => {
    api.getPriorityQueue()
      .then(setQueue)
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])
  useEffect(() => { if (dashboardData) load() }, [dashboardData])

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><Spinner /></div>

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Priority Intervention Queue</h1>
        <p className="page-subtitle">Drains requiring attention, ordered by severity</p>
      </div>

      {queue.length === 0 ? (
        <EmptyState icon="✅" text="No drains currently require intervention. All systems normal." />
      ) : (
        queue.map(item => (
          <div key={item.device_id} className={`queue-row ${item.priority}`}>
            <PriorityBadge priority={item.priority} />
            <div className="queue-info">
              <div className="queue-location">
                <span className="mono" style={{ color: 'var(--text-accent)', marginRight: 8 }}>
                  {item.device_id}
                </span>
                {item.location_name}
              </div>
              <div className="queue-detail">
                Ward: {item.ward} ·
                Team: {item.team_name} ·
                <span style={{ color: 'var(--text-muted)' }}> {item.contact_phone}</span>
              </div>
              {item.risk_reasons && item.risk_reasons.length > 0 && (
                <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {item.risk_reasons.slice(0, 3).map((r, i) => (
                    <span key={i} style={{
                      fontSize: 10, padding: '2px 6px',
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border)',
                      borderRadius: 4,
                      color: 'var(--text-muted)',
                    }}>
                      {r}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', align: 'center', gap: 12, alignItems: 'center' }}>
              <RiskBadge level={item.risk_level} />
            </div>

            {item.predicted_failure_minutes != null ? (
              <div className="queue-eta">
                <span className="queue-eta-value">{item.predicted_failure_minutes}<span style={{ fontSize: 11 }}>m</span></span>
                <span className="queue-eta-label">ETA (est.)</span>
              </div>
            ) : (
              <div className="queue-eta">
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>—</span>
              </div>
            )}

            {item.incident_status && (
              <span className={`incident-status ${item.incident_status}`}>
                {item.incident_status}
              </span>
            )}
          </div>
        ))
      )}

      <div style={{ marginTop: 20, padding: 14, background: 'var(--bg-surface)', borderRadius: 8, border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.8 }}>
          <strong style={{ color: 'var(--text-secondary)' }}>Priority System:</strong>{' '}
          P1 = CRITICAL (immediate intervention) ·
          P2 = HIGH (respond within minutes) ·
          P3 = MEDIUM (monitor closely) ·
          P4 = LOW (no action needed)
        </div>
      </div>
    </div>
  )
}
