import { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'

const SOCKET_URL = import.meta.env.VITE_BACKEND_URL || ''

let globalSocket = null

export function useSocket() {
  const [connected, setConnected] = useState(false)
  const [lastTelemetry, setLastTelemetry] = useState(null)
  const [dashboardUpdate, setDashboardUpdate] = useState(null)
  const [newIncident, setNewIncident] = useState(null)
  const [incidentUpdate, setIncidentUpdate] = useState(null)

  useEffect(() => {
    if (!globalSocket) {
      globalSocket = io(SOCKET_URL, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: Infinity,
      })
    }

    const socket = globalSocket

    const onConnect    = () => setConnected(true)
    const onDisconnect = () => setConnected(false)
    const onTelemetry  = (data) => setLastTelemetry(data)
    const onDashboard  = (data) => setDashboardUpdate(data)
    const onNewIncident   = (data) => setNewIncident(data)
    const onIncidentUpdate = (data) => setIncidentUpdate(data)

    socket.on('connect',         onConnect)
    socket.on('disconnect',      onDisconnect)
    socket.on('telemetry',       onTelemetry)
    socket.on('dashboard_update', onDashboard)
    socket.on('new_incident',    onNewIncident)
    socket.on('incident_update', onIncidentUpdate)

    setConnected(socket.connected)

    return () => {
      socket.off('connect',         onConnect)
      socket.off('disconnect',      onDisconnect)
      socket.off('telemetry',       onTelemetry)
      socket.off('dashboard_update', onDashboard)
      socket.off('new_incident',    onNewIncident)
      socket.off('incident_update', onIncidentUpdate)
    }
  }, [])

  return { connected, lastTelemetry, dashboardUpdate, newIncident, incidentUpdate }
}
