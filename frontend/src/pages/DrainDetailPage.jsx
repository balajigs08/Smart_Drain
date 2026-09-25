import React, { useEffect, useState } from 'react'
import { api } from '../api'
import {
  RiskBadge, SensorStatusBadge, LevelBar,
  DataRow, EtaWarning, RiskReasons, AlertBanner, Spinner, EmptyState,
} from '../components/Shared'
import { WaterLevelChart, FlowChart, RiseRateChart } from '../components/Charts'

export default function DrainDetailPage({ lastTelemetry }) {
  const DRAIN_ID = 'DRAIN_001'
  const [drain,   setDrain]   = useState(null)
  const [history, setHistory] = useState([])
  const [tab,     setTab]     = useState('overview')
  const [loading, setLoading] = useState(true)

  const loadData = () => {
    Promise.all([api.getDrain(DRAIN_ID), api.getHistory(DRAIN_ID, 100)])
      .then(([d, h]) => { setDrain(d); setHistory(h) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadData() }, [])

  useEffect(() => {
    if (!lastTelemetry || lastTelemetry.device_id !== DRAIN_ID) return
    // Optimistic update
    setDrain(prev => prev ? { ...prev, latest_telemetry: lastTelemetry } : prev)
    setHistory(prev => [...prev.slice(-199), lastTelemetry].sort(
      (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
    ))
  }, [lastTelemetry])

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><Spinner /></div>
  if (!drain)  return <EmptyState icon="🚰" text="Drain not found" />

  const t = drain.latest_telemetry
  const risk = t?.risk_level || 'UNKNOWN'

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 className="page-title">
            <span className="mono" style={{ color: 'var(--text-accent)', marginRight: 12 }}>{drain.device_id}</span>
            Drain Monitor
          </h1>
          <p className="page-subtitle">{drain.location_name} · Ward {drain.ward}</p>
        </div>
        {t && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <RiskBadge level={risk} />
            <SensorStatusBadge status={t.sensor_status} />
          </div>
        )}
      </div>

      {/* Alert banners */}
      {risk === 'CRITICAL' && t && (
        <AlertBanner
          level="CRITICAL"
          title={`⚠️ CRITICAL RISK — ${drain.device_id}`}
          message={`Water level at ${t.water_level_percent}% · ${t.predicted_failure_minutes != null ? `Estimated ${t.predicted_failure_minutes} min to critical` : 'Rising rapidly'} · Assigned: ${drain.team_name}`}
        />
      )}
      {risk === 'HIGH' && t && (
        <AlertBanner
          level="HIGH"
          title={`HIGH RISK — Intervention may be required`}
          message={`Water level: ${t.water_level_percent}% · Rain: ${t.rain_intensity} · Outflow: ${t.flow_rate_lpm?.toFixed(1) ?? '—'} L/min`}
        />
      )}

      {/* Tabs */}
      <div className="tabs">
        {['overview', 'charts', 'authority', 'alerts'].map(tab_id => (
          <div key={tab_id} className={`tab ${tab === tab_id ? 'active' : ''}`}
               onClick={() => setTab(tab_id)}>
            {tab_id.charAt(0).toUpperCase() + tab_id.slice(1)}
          </div>
        ))}
      </div>

      {tab === 'overview' && t && (
        <div>
          {/* Level Bar */}
          <div className="card" style={{ marginBottom: 20 }}>
            <LevelBar percent={t.water_level_percent} riskLevel={risk} />
            {t.predicted_failure_minutes != null && (
              <div style={{ marginTop: 14 }}>
                <EtaWarning minutes={t.predicted_failure_minutes} />
              </div>
            )}
          </div>

          <div className="section-grid">
            {/* Sensor Readings */}
            <div className="card">
              <div className="card-header">
                <span className="card-title">Live Sensor Readings</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {new Date(t.timestamp).toLocaleTimeString('en-IN')}
                </span>
              </div>
              <div className="metric-grid" style={{ marginBottom: 16 }}>
                <div className="metric-item">
                  <span className="metric-label">Water Level</span>
                  <span className="metric-value">{t.water_level_cm?.toFixed(1) ?? '—'}</span>
                  <span className="metric-unit">cm</span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">Level %</span>
                  <span className="metric-value" style={{ color: risk === 'CRITICAL' ? 'var(--risk-critical)' : risk === 'HIGH' ? 'var(--risk-high)' : 'inherit' }}>
                    {t.water_level_percent ?? '—'}
                  </span>
                  <span className="metric-unit">%</span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">Flow Rate</span>
                  <span className="metric-value">{t.flow_rate_lpm?.toFixed(1) ?? '—'}</span>
                  <span className="metric-unit">L/min</span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">Rise Rate</span>
                  <span className="metric-value" style={{ color: (t.water_rise_rate_cm_min || 0) > 0.5 ? 'var(--risk-high)' : 'inherit' }}>
                    {t.water_rise_rate_cm_min?.toFixed(2) ?? '—'}
                  </span>
                  <span className="metric-unit">cm/min</span>
                </div>
              </div>
              <DataRow label="Distance Reading" value={t.water_distance_cm?.toFixed(2)} unit="cm" />
              <DataRow label="Drain Depth" value={drain.drain_depth_cm?.toFixed(1)} unit="cm" />
              <DataRow label="Rain Sensor Value" value={t.rain_value} />
              <DataRow label="Rain Intensity" value={t.rain_intensity} mono={false} />
              <DataRow label="Risk Score" value={t.risk_score} unit="/ 100" />
              <DataRow label="Wi-Fi" value={t.wifi_status} mono={false} />
            </div>

            {/* Risk Assessment */}
            <div className="card">
              <div className="card-header">
                <span className="card-title">Risk Assessment</span>
                <RiskBadge level={risk} />
              </div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 48, fontWeight: 800, color:
                  risk === 'CRITICAL' ? 'var(--risk-critical)' :
                  risk === 'HIGH'     ? 'var(--risk-high)'     :
                  risk === 'MEDIUM'   ? 'var(--risk-medium)'   :
                  risk === 'LOW'      ? 'var(--risk-low)'      : 'var(--text-muted)',
                  fontVariantNumeric: 'tabular-nums',
                  lineHeight: 1,
                }}>
                  {t.risk_score ?? 0}
                  <span style={{ fontSize: 16, color: 'var(--text-muted)', marginLeft: 4 }}>/100</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Risk Score</div>
              </div>
              <RiskReasons reasons={t.risk_reasons} riskLevel={risk} />
            </div>
          </div>
        </div>
      )}

      {tab === 'overview' && !t && (
        <EmptyState icon="📡" text="No telemetry received yet. Connect the ESP8266 or use Demo Control." />
      )}

      {tab === 'charts' && (
        <div>
          {history.length < 2 ? (
            <EmptyState icon="📈" text="Need at least 2 readings to show charts. Send more telemetry." />
          ) : (
            <>
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-header"><span className="card-title">Water Level History</span></div>
                <WaterLevelChart history={history} />
              </div>
              <div className="section-grid">
                <div className="card">
                  <div className="card-header"><span className="card-title">Flow Rate</span></div>
                  <FlowChart history={history} />
                </div>
                <div className="card">
                  <div className="card-header"><span className="card-title">Rise Rate</span></div>
                  <RiseRateChart history={history} />
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'authority' && (
        <div className="card">
          <div className="card-header"><span className="card-title">Responsible Authority</span></div>
          <DataRow label="Ward" value={drain.ward} mono={false} />
          <DataRow label="Authority" value={drain.authority_name} mono={false} />
          <DataRow label="Team" value={drain.team_name} mono={false} />
          <DataRow label="Contact" value={drain.contact_phone} mono={false} />
          <DataRow label="Email" value={drain.contact_email} mono={false} />
          <div style={{ marginTop: 20, padding: '14px', background: 'var(--bg-deep)', borderRadius: 8, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Public Alert Message
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              ⚠️ Drainage flooding risk detected near <strong>{drain.location_name}</strong>.
              Please avoid the affected area and use alternate routes.
              Contact: {drain.authority_name}
            </div>
          </div>
        </div>
      )}

      {tab === 'alerts' && t && (
        <div className="card">
          <div className="card-header"><span className="card-title">Authority Technical Alert</span></div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, background: 'var(--bg-deep)', padding: 16, borderRadius: 8, border: '1px solid var(--border)', lineHeight: 2, color: 'var(--text-secondary)' }}>
            <div><strong style={{ color: 'var(--text-primary)' }}>SMARTDRAIN ALERT — {new Date().toLocaleString('en-IN')}</strong></div>
            <div>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</div>
            <div>Drain ID       : {drain.device_id}</div>
            <div>Location       : {drain.location_name}</div>
            <div>Ward           : {drain.ward}</div>
            <div>Risk Level     : {t.risk_level}</div>
            <div>Risk Score     : {t.risk_score}/100</div>
            <div>Water Level    : {t.water_level_cm?.toFixed(1)} cm ({t.water_level_percent}%)</div>
            <div>Rise Rate      : {t.water_rise_rate_cm_min?.toFixed(2) ?? '—'} cm/min</div>
            <div>Rain Intensity : {t.rain_intensity}</div>
            <div>Flow Rate      : {t.flow_rate_lpm?.toFixed(2) ?? '—'} L/min</div>
            <div>ETA to Critical: {t.predicted_failure_minutes != null ? `~${t.predicted_failure_minutes} min (ESTIMATE)` : 'N/A'}</div>
            <div>Sensor Health  : {t.sensor_status}</div>
            <div>Priority       : {t.risk_level === 'CRITICAL' ? 'P1' : t.risk_level === 'HIGH' ? 'P2' : 'P3'}</div>
            <div>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</div>
            <div><strong style={{ color: 'var(--text-primary)' }}>Risk Reasons:</strong></div>
            {(t.risk_reasons || []).map((r, i) => <div key={i}>  • {r}</div>)}
            <div>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</div>
            <div>Assigned Team  : {drain.team_name}</div>
            <div>Contact        : {drain.contact_phone}</div>
            <div>Authority      : {drain.authority_name}</div>
          </div>
        </div>
      )}
    </div>
  )
}
