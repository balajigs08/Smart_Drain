import React, { useState } from 'react'
import { api } from '../api'

const SCENARIOS = [
  {
    num: 1,
    name: 'Normal Drainage',
    desc: 'Water entering and draining normally. Rain dry. Flow healthy.',
    risk: 'LOW',
    color: 'var(--risk-low)',
    details: 'Distance: 12 cm → Level: 3 cm (20%) · Rain: DRY · Flow: 6.5 L/min',
  },
  {
    num: 2,
    name: 'Rising Water',
    desc: 'Rain increases. Water begins rising. Flow still adequate.',
    risk: 'MEDIUM',
    color: 'var(--risk-medium)',
    details: 'Distance: 8.5 cm → Level: 6.5 cm (43%) · Rain: MODERATE · Flow: 4.0 L/min',
  },
  {
    num: 3,
    name: 'Partial Blockage',
    desc: 'Outlet partially blocked. Water rises. Flow decreasing.',
    risk: 'HIGH',
    color: 'var(--risk-high)',
    details: 'Distance: 3.2 cm → Level: 11.8 cm (79%) · Rain: HEAVY · Flow: 0.8 L/min',
  },
  {
    num: 4,
    name: 'Critical Failure',
    desc: 'Drain nearly full. Heavy rain. Outflow minimal. Failure imminent.',
    risk: 'CRITICAL',
    color: 'var(--risk-critical)',
    details: 'Distance: 1.8 cm → Level: 13.2 cm (88%) · Rain: HEAVY · Flow: 0.3 L/min',
  },
  {
    num: 5,
    name: 'Recovery',
    desc: 'Blockage cleared. Water falling. Flow restored. Risk decreasing.',
    risk: 'MEDIUM→LOW',
    color: 'var(--risk-low)',
    details: 'Distance: 9 cm → Level: 6 cm (40%) · Rain: MODERATE · Flow: 5.5 L/min',
  },
]

export default function DemoControlPage() {
  const [activeScenario, setActiveScenario] = useState(null)
  const [streaming,      setStreaming]       = useState(false)
  const [streamScenario, setStreamScenario] = useState(null)
  const [lastResult,     setLastResult]     = useState(null)
  const [loading,        setLoading]        = useState(false)
  const [interval,       setInterval_]      = useState(3000)

  const simulate = async (num) => {
    setLoading(true)
    setActiveScenario(num)
    try {
      const result = await api.simulate(num)
      setLastResult(result)
    } catch (err) {
      console.error('Simulate error:', err)
      setLastResult({ error: err.message })
    } finally {
      setLoading(false)
    }
  }

  const startStream = async (num) => {
    try {
      await api.startAutoStream(num, interval)
      setStreaming(true)
      setStreamScenario(num)
    } catch (err) {
      console.error(err)
    }
  }

  const stopStream = async () => {
    try {
      await api.stopAutoStream()
      setStreaming(false)
      setStreamScenario(null)
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Demo Control</h1>
        <p className="page-subtitle">
          Simulate hackathon demo scenarios — inject test telemetry to demonstrate the platform
        </p>
      </div>

      {/* Auto-stream status */}
      {streaming && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px',
          background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)',
          borderRadius: 10, marginBottom: 20,
        }}>
          <span style={{ animation: 'pulse-anim 1s infinite', color: 'var(--accent)', fontSize: 18 }}>⏵</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 13 }}>
              Auto-streaming Scenario {streamScenario} every {interval / 1000}s
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Dashboard and charts will update automatically via Socket.IO
            </div>
          </div>
          <button className="btn btn-danger btn-sm" onClick={stopStream}>⏹ Stop Stream</button>
        </div>
      )}

      {/* Scenario Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 24 }}>
        {SCENARIOS.map(s => (
          <div
            key={s.num}
            className="card"
            style={{
              borderColor: activeScenario === s.num ? s.color : 'var(--border)',
              boxShadow: activeScenario === s.num ? `0 0 16px ${s.color}30` : 'none',
              transition: 'all 0.2s',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 8,
                background: `${s.color}20`,
                border: `2px solid ${s.color}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 800, fontSize: 16, color: s.color,
              }}>
                {s.num}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>{s.name}</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: s.color, textTransform: 'uppercase' }}>
                  Risk: {s.risk}
                </div>
              </div>
            </div>

            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10, lineHeight: 1.5 }}>
              {s.desc}
            </p>

            <div style={{
              padding: '8px 10px',
              background: 'var(--bg-deep)',
              borderRadius: 6,
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-muted)',
              marginBottom: 14,
              lineHeight: 1.7,
            }}>
              {s.details}
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn btn-primary btn-sm"
                disabled={loading}
                onClick={() => simulate(s.num)}
                style={{ flex: 1 }}
              >
                ▶ Single Shot
              </button>
              <button
                className="btn btn-ghost btn-sm"
                disabled={streaming && streamScenario !== s.num}
                onClick={() => streaming && streamScenario === s.num ? stopStream() : startStream(s.num)}
                style={{ flex: 1 }}
              >
                {streaming && streamScenario === s.num ? '⏹ Stop' : '⏵ Auto-stream'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Stream Interval Control */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header"><span className="card-title">Stream Settings</span></div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flex: 1, alignItems: 'center', gap: 12 }}>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
              Auto-stream interval:
            </label>
            <input
              type="range" min="1000" max="10000" step="500"
              value={interval}
              onChange={e => setInterval_(Number(e.target.value))}
              style={{ flex: 1, accentColor: 'var(--accent)' }}
            />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-primary)', minWidth: 50 }}>
              {interval / 1000}s
            </span>
          </div>
        </div>
      </div>

      {/* Last Result */}
      {lastResult && (
        <div className="card">
          <div className="card-header"><span className="card-title">Last Simulation Result</span></div>
          {lastResult.error ? (
            <div style={{ color: 'var(--risk-critical)', fontSize: 12 }}>Error: {lastResult.error}</div>
          ) : lastResult.processed ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
              {[
                ['Risk Level',    lastResult.processed.risk_level],
                ['Risk Score',    `${lastResult.processed.risk_score}/100`],
                ['Water Level',   `${lastResult.processed.water_level_percent}%`],
                ['Rain',          lastResult.processed.rain_intensity],
                ['Flow',          `${lastResult.processed.flow_rate_lpm?.toFixed(1)} L/min`],
                ['Sensor',        lastResult.processed.sensor_status],
                ['ETA to Critical', lastResult.processed.predicted_failure_minutes
                  ? `~${lastResult.processed.predicted_failure_minutes} min` : 'N/A'],
                ['Priority',      lastResult.processed.priority],
              ].map(([k, v]) => (
                <div key={k} style={{
                  padding: '10px 12px',
                  background: 'var(--bg-deep)',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 3 }}>{k}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{v ?? '—'}</div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}

      {/* Instructions */}
      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-header"><span className="card-title">Demo Flow for Judges</span></div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 2 }}>
          {[
            ['1', 'Start with Scenario 1', 'Show normal LOW risk state. All green on dashboard.'],
            ['2', 'Switch to Scenario 2', 'Rain begins. Risk rises to MEDIUM. Chart shows upward trend.'],
            ['3', 'Auto-stream Scenario 3/4', 'Water rises rapidly. CRITICAL alert. Incident auto-creates. P1 in queue.'],
            ['4', 'Go to Incidents page', 'Acknowledge the incident → Dispatch team. Show lifecycle timeline.'],
            ['5', 'Switch to Scenario 5', 'Blockage cleared. Water drops. Risk falls back to LOW. Resolve incident.'],
          ].map(([num, title, desc]) => (
            <div key={num} style={{ display: 'flex', gap: 16, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%',
                background: 'var(--accent-glow)', border: '1px solid var(--accent)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700, color: 'var(--text-accent)', flexShrink: 0,
              }}>{num}</div>
              <div>
                <strong style={{ color: 'var(--text-primary)' }}>{title}</strong>
                <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
