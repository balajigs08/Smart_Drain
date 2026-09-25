import React, { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet'
import L from 'leaflet'
import { api } from '../api'
import { RiskBadge } from '../components/Shared'

// Fix leaflet default icon issue
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const RISK_COLORS = {
  CRITICAL: '#ef4444',
  HIGH:     '#f97316',
  MEDIUM:   '#f59e0b',
  LOW:      '#22c55e',
  UNKNOWN:  '#6b7280',
}

function createColoredIcon(color) {
  return L.divIcon({
    html: `
      <div style="
        width: 20px; height: 20px;
        background: ${color};
        border: 3px solid white;
        border-radius: 50%;
        box-shadow: 0 0 8px ${color}80;
      "></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    className: '',
  })
}

export default function MapPage({ dashboardData }) {
  const [drains, setDrains] = useState([])

  useEffect(() => {
    api.getDrains().then(setDrains).catch(console.error)
  }, [dashboardData])

  const center = drains[0]
    ? [drains[0].latitude || 13.1276, drains[0].longitude || 77.5696]
    : [13.1276, 77.5696]

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Live Drainage Map</h1>
        <p className="page-subtitle">Real-time risk visualization — risk-colored markers</p>
      </div>

      {/* Legend */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Legend:</span>
          {Object.entries(RISK_COLORS).map(([level, color]) => (
            <div key={level} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 14, height: 14, borderRadius: '50%', background: color, border: '2px solid white', boxShadow: `0 0 6px ${color}80` }} />
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{level}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="map-container">
        <MapContainer
          center={center}
          zoom={15}
          style={{ width: '100%', height: '100%' }}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />
          {drains.map(drain => {
            const t     = drain.latest_telemetry
            const risk  = t?.risk_level || 'UNKNOWN'
            const color = RISK_COLORS[risk] || RISK_COLORS.UNKNOWN
            const lat   = drain.latitude  || 13.1276
            const lng   = drain.longitude || 77.5696

            return (
              <React.Fragment key={drain.device_id}>
                {/* Risk radius circle */}
                <Circle
                  center={[lat, lng]}
                  radius={t?.risk_level === 'CRITICAL' ? 80 : t?.risk_level === 'HIGH' ? 50 : 30}
                  pathOptions={{
                    color,
                    fillColor: color,
                    fillOpacity: 0.15,
                    weight: 2,
                    opacity: 0.6,
                  }}
                />
                <Marker position={[lat, lng]} icon={createColoredIcon(color)}>
                  <Popup>
                    <div style={{ minWidth: 200, fontFamily: 'Inter, sans-serif' }}>
                      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>
                        {drain.device_id}
                      </div>
                      <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
                        {drain.location_name}
                      </div>
                      {t ? (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, display: 'inline-block' }} />
                            <strong>{risk}</strong>
                          </div>
                          <div style={{ fontSize: 12, lineHeight: 1.8 }}>
                            <div>Water Level: <strong>{t.water_level_percent}%</strong></div>
                            <div>Rain: <strong>{t.rain_intensity}</strong></div>
                            <div>Flow: <strong>{t.flow_rate_lpm?.toFixed(1)} L/min</strong></div>
                            {t.predicted_failure_minutes != null && (
                              <div style={{ color: '#ef4444', fontWeight: 600 }}>
                                ⏱ ETA to critical: ~{t.predicted_failure_minutes} min
                              </div>
                            )}
                          </div>
                          <div style={{ marginTop: 8, fontSize: 11, color: '#999' }}>
                            Ward: {drain.ward}<br />
                            Team: {drain.team_name}
                          </div>
                        </>
                      ) : (
                        <div style={{ fontSize: 12, color: '#999' }}>No data yet</div>
                      )}
                    </div>
                  </Popup>
                </Marker>
              </React.Fragment>
            )
          })}
        </MapContainer>
      </div>
    </div>
  )
}
