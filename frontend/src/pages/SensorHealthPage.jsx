import React, { useEffect, useState } from 'react'
import { api } from '../api'
import { SensorStatusBadge, Spinner } from '../components/Shared'

function SensorCard({ icon, name, status, detail, value, unit }) {
  return (
    <div className="sensor-item">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span className="sensor-icon">{icon}</span>
        <SensorStatusBadge status={status} />
      </div>
      <span className="sensor-name">{name}</span>
      {value != null && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>
          {value}
          {unit && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 3 }}>{unit}</span>}
        </div>
      )}
      {detail && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.4 }}>{detail}</div>
      )}
    </div>
  )
}

export default function SensorHealthPage({ lastTelemetry }) {
  const [drain,   setDrain]   = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getDrain('DRAIN_001')
      .then(setDrain)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  // Update when new telemetry arrives
  useEffect(() => {
    if (!lastTelemetry || lastTelemetry.device_id !== 'DRAIN_001') return
    setDrain(prev => prev ? {
      ...prev,
      latest_telemetry: { ...prev.latest_telemetry, ...lastTelemetry },
    } : prev)
  }, [lastTelemetry])

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><Spinner /></div>

  const t = drain?.latest_telemetry

  // Derive individual sensor statuses
  const us100Status = !t ? 'OFFLINE'
    : t.sensor_status === 'INVALID_READING' || t.sensor_status === 'OFFLINE' ? t.sensor_status
    : t.sensor_status === 'POSSIBLE_OBSTRUCTION' ? 'POSSIBLE_OBSTRUCTION'
    : 'OK'

  const rainStatus = !t ? 'OFFLINE'
    : (t.rain_value === null || t.rain_value === undefined) ? 'OFFLINE'
    : t.rain_value < 0 || t.rain_value > 1023 ? 'WARNING'
    : 'OK'

  const flowStatus = !t ? 'OFFLINE'
    : t.flow_rate_lpm === null ? 'OFFLINE'
    : t.flow_rate_lpm < 0 ? 'WARNING'
    : 'OK'

  const espStatus  = t ? 'OK' : 'OFFLINE'
  const wifiStatus = t?.wifi_status === 'ONLINE' ? 'OK' : 'OFFLINE'

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Sensor Health</h1>
        <p className="page-subtitle">Hardware status for {drain?.device_id || 'DRAIN_001'} — {drain?.location_name}</p>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header"><span className="card-title">Sensor Overview</span></div>
        <div className="sensor-grid">
          <SensorCard
            icon="📏"
            name="US-100 Ultrasonic"
            status={us100Status}
            value={t?.water_distance_cm?.toFixed(2)}
            unit="cm"
            detail={t?.sensor_detail || (us100Status === 'POSSIBLE_OBSTRUCTION' ? 'Possible obstruction detected' : null)}
          />
          <SensorCard
            icon="🌧"
            name="Rain Sensor (AO)"
            status={rainStatus}
            value={t?.rain_value}
            detail={`Intensity: ${t?.rain_intensity || '—'}`}
          />
          <SensorCard
            icon="💧"
            name="YF-S201 Flow"
            status={flowStatus}
            value={t?.flow_rate_lpm?.toFixed(2)}
            unit="L/min"
            detail="Pulse-based outflow measurement"
          />
          <SensorCard
            icon="🔌"
            name="ESP8266 NodeMCU"
            status={espStatus}
            value={t ? 'Online' : 'Offline'}
            detail={t ? `Last seen: ${new Date(t.timestamp).toLocaleTimeString('en-IN')}` : 'No data received'}
          />
          <SensorCard
            icon="📶"
            name="Wi-Fi / Connectivity"
            status={wifiStatus}
            value={t?.wifi_status || 'OFFLINE'}
            detail={wifiStatus === 'OK' ? 'Connected to backend' : 'Local monitoring mode active'}
          />
        </div>
      </div>

      {/* Sensor Health Rules Explanation */}
      <div className="card">
        <div className="card-header"><span className="card-title">Sensor Fault Detection Rules</span></div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 2 }}>
          {[
            ['US-100 OFFLINE', 'No echo pulse received (timeout). Sensor may be disconnected or obstructed.'],
            ['US-100 INVALID_READING', 'Distance ≤ 0 cm or > 400 cm — outside valid range.'],
            ['US-100 POSSIBLE_OBSTRUCTION', 'Sudden distance jump > 80% of drain depth in a single reading cycle.'],
            ['Rain Sensor WARNING', 'Analog value outside 0–1023 ADC range.'],
            ['Flow Sensor WARNING', 'Negative flow rate reported (sensor fault).'],
            ['Sensor Fault ≠ Drainage Failure', 'A sensor fault does NOT automatically trigger a HIGH/CRITICAL risk. Risk is capped and reasons are flagged separately.'],
          ].map(([rule, desc], i) => (
            <div key={i} style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-accent)', minWidth: 220, flexShrink: 0 }}>{rule}</span>
              <span>{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
