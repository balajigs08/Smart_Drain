import React, { useState, useEffect } from 'react'
import { useSocket } from './hooks/useSocket'

import Sidebar        from './components/Sidebar'
import DashboardPage  from './pages/DashboardPage'
import DrainDetailPage from './pages/DrainDetailPage'
import MapPage        from './pages/MapPage'
import PriorityQueuePage from './pages/PriorityQueuePage'
import IncidentsPage  from './pages/IncidentsPage'
import SensorHealthPage from './pages/SensorHealthPage'
import DemoControlPage from './pages/DemoControlPage'

export default function App() {
  const [page, setPage] = useState('dashboard')
  const {
    connected,
    lastTelemetry,
    dashboardUpdate,
    newIncident,
    incidentUpdate,
  } = useSocket()

  const [criticalCount, setCriticalCount] = useState(0)

  // Track critical incidents for sidebar badge
  useEffect(() => {
    if (dashboardUpdate) {
      setCriticalCount((dashboardUpdate.critical_drains || 0) + (dashboardUpdate.active_incidents || 0))
    }
  }, [dashboardUpdate])

  // Flash notification on new incident
  const [notification, setNotification] = useState(null)
  useEffect(() => {
    if (!newIncident) return
    setNotification(newIncident)
    const t = setTimeout(() => setNotification(null), 8000)
    return () => clearTimeout(t)
  }, [newIncident])

  return (
    <div className="app-layout">
      {/* Top Bar */}
      <header className="topbar">
        <div className="topbar-logo">
          <div className="topbar-logo-icon">🚰</div>
          <div>
            <div className="topbar-title">SmartDrain</div>
            <div className="topbar-subtitle">Predictive Drainage Command Center</div>
          </div>
        </div>

        <div className="topbar-status">
          <span className="live-badge">LIVE</span>
          <div className={`status-pill ${connected ? 'online' : 'offline'}`}>
            <span className="pulse-dot" />
            {connected ? 'Backend Connected' : 'Backend Offline'}
          </div>
          {lastTelemetry && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Last:{' '}
              <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                {new Date(lastTelemetry.timestamp).toLocaleTimeString('en-IN')}
              </span>
            </div>
          )}
        </div>
      </header>

      <div className="app-body">
        <Sidebar
          currentPage={page}
          onNavigate={setPage}
          criticalCount={criticalCount}
        />

        <main className="main-content">
          {/* Floating notification for new incidents */}
          {notification && (
            <div style={{
              position: 'fixed', top: 80, right: 24, zIndex: 1000,
              background: 'var(--bg-card)',
              border: '1px solid rgba(239,68,68,0.4)',
              borderRadius: 10,
              padding: '14px 20px',
              boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
              display: 'flex', alignItems: 'center', gap: 12,
              animation: 'slide-in 0.3s ease',
              maxWidth: 360,
            }}>
              <span style={{ fontSize: 24 }}>🚨</span>
              <div>
                <div style={{ fontWeight: 700, color: 'var(--risk-critical)', fontSize: 13 }}>
                  NEW INCIDENT — {notification.priority}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                  {notification.deviceId} · {notification.riskLevel} risk detected
                </div>
                <button
                  style={{ marginTop: 6, fontSize: 11, background: 'none', border: 'none',
                           color: 'var(--text-accent)', cursor: 'pointer', padding: 0 }}
                  onClick={() => { setPage('incidents'); setNotification(null) }}
                >
                  View Incidents →
                </button>
              </div>
              <button
                style={{ marginLeft: 'auto', background: 'none', border: 'none',
                         color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18 }}
                onClick={() => setNotification(null)}
              >×</button>
            </div>
          )}

          {/* Pages */}
          {page === 'dashboard' && (
            <DashboardPage dashboardData={dashboardUpdate} onNavigate={setPage} />
          )}
          {page === 'drains' && (
            <DrainDetailPage lastTelemetry={lastTelemetry} />
          )}
          {page === 'map' && (
            <MapPage dashboardData={dashboardUpdate} />
          )}
          {page === 'priority' && (
            <PriorityQueuePage dashboardData={dashboardUpdate} />
          )}
          {page === 'incidents' && (
            <IncidentsPage incidentUpdate={incidentUpdate} />
          )}
          {page === 'sensors' && (
            <SensorHealthPage lastTelemetry={lastTelemetry} />
          )}
          {page === 'demo' && (
            <DemoControlPage />
          )}
        </main>
      </div>
    </div>
  )
}
