import React, { useEffect, useState } from 'react'
import { api } from '../api'
import { RiskBadge, Spinner, EmptyState } from '../components/Shared'
import { MultiChart } from '../components/Charts'

export default function DashboardPage({ dashboardData, onNavigate }) {
  const [drains, setDrains]   = useState([])
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([api.getDrains(), api.getHistory('DRAIN_001', 60)])
      .then(([d, h]) => { setDrains(d); setHistory(h) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  // Refresh drains list when live data comes in
  useEffect(() => {
    if (!dashboardData) return
    api.getDrains().then(setDrains).catch(() => {})
    api.getHistory('DRAIN_001', 60).then(setHistory).catch(() => {})
  }, [dashboardData])

  const d = dashboardData || {}

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
        <Spinner />
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Command Dashboard</h1>
        <p className="page-subtitle">Real-time drainage monitoring overview — BMSIT Prototype</p>
      </div>

      {/* Stat Summary */}
      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-label">Total Drains</span>
          <span className="stat-value">{d.total_drains ?? drains.length}</span>
          <span className="stat-icon">🚰</span>
        </div>
        <div className={`stat-card ${d.critical_drains > 0 ? 'critical' : ''}`}>
          <span className="stat-label">Critical</span>
          <span className={`stat-value ${d.critical_drains > 0 ? 'critical' : ''}`}>{d.critical_drains ?? 0}</span>
          <span className="stat-icon">🔴</span>
        </div>
        <div className={`stat-card ${d.high_drains > 0 ? 'high' : ''}`}>
          <span className="stat-label">High Risk</span>
          <span className={`stat-value ${d.high_drains > 0 ? 'high' : ''}`}>{d.high_drains ?? 0}</span>
          <span className="stat-icon">🟠</span>
        </div>
        <div className={`stat-card ${d.medium_drains > 0 ? 'medium' : ''}`}>
          <span className="stat-label">Medium Risk</span>
          <span className={`stat-value ${d.medium_drains > 0 ? 'medium' : ''}`}>{d.medium_drains ?? 0}</span>
          <span className="stat-icon">🟡</span>
        </div>
        <div className="stat-card low">
          <span className="stat-label">Normal</span>
          <span className="stat-value low">{d.low_drains ?? 0}</span>
          <span className="stat-icon">🟢</span>
        </div>
        <div className={`stat-card ${d.sensor_warnings > 0 ? 'warning' : ''}`}>
          <span className="stat-label">Sensor Warnings</span>
          <span className={`stat-value ${d.sensor_warnings > 0 ? 'warning' : ''}`}>{d.sensor_warnings ?? 0}</span>
          <span className="stat-icon">📡</span>
        </div>
        <div className={`stat-card ${d.active_incidents > 0 ? 'critical' : ''}`}>
          <span className="stat-label">Active Incidents</span>
          <span className={`stat-value ${d.active_incidents > 0 ? 'critical' : ''}`}>{d.active_incidents ?? 0}</span>
          <span className="stat-icon">🚨</span>
        </div>
      </div>

      {/* Drain List */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <span className="card-title">Monitored Drains</span>
          <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('drains')}>View All →</button>
        </div>
        {drains.length === 0 ? (
          <EmptyState icon="🚰" text="No drain data yet. Start sending telemetry or use Demo Control." />
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Drain ID</th>
                  <th>Location</th>
                  <th>Risk</th>
                  <th>Level %</th>
                  <th>Rain</th>
                  <th>Flow</th>
                  <th>Sensor</th>
                  <th>Last Update</th>
                </tr>
              </thead>
              <tbody>
                {drains.map(drain => {
                  const t = drain.latest_telemetry
                  return (
                    <tr key={drain.device_id} style={{ cursor: 'pointer' }}
                        onClick={() => onNavigate('drains')}>
                      <td><span className="mono" style={{ color: 'var(--text-accent)' }}>{drain.device_id}</span></td>
                      <td style={{ color: 'var(--text-primary)', maxWidth: 200 }}>{drain.location_name}</td>
                      <td>{t ? <RiskBadge level={t.risk_level} /> : '—'}</td>
                      <td>
                        {t?.water_level_percent != null
                          ? <span className="mono">{t.water_level_percent}%</span>
                          : '—'}
                      </td>
                      <td>{t?.rain_intensity ?? '—'}</td>
                      <td>{t?.flow_rate_lpm != null ? `${t.flow_rate_lpm.toFixed(1)} L/m` : '—'}</td>
                      <td>
                        {t ? (
                          <span className={`sensor-status ${t.sensor_status}`}>
                            {t.sensor_status}
                          </span>
                        ) : '—'}
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                        {t ? new Date(t.timestamp).toLocaleTimeString('en-IN') : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Chart */}
      {history.length > 1 && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">System Trend — Water Level & Risk Score</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Last 60 readings</span>
          </div>
          <MultiChart history={history} />
        </div>
      )}
    </div>
  )
}
