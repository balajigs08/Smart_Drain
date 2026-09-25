/**
 * SmartDrain — Main Express + Socket.IO Server
 * Database: MongoDB via Mongoose (no native compilation needed)
 */

require('dotenv').config();

const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');
const { v4: uuidv4 } = require('uuid');

const db = require('./db');
const {
  classifyRainIntensity,
  assessSensorHealth,
  calculateRisk,
  calculateRiseRate,
  waterLevelFromDistance,
} = require('./riskEngine');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

const PORT            = process.env.PORT || 3001;
const ALLOWED_DEVICES = (process.env.ALLOWED_DEVICES || 'DRAIN_001').split(',').map(s => s.trim());
const DEMO_MODE       = process.env.DEMO_MODE === 'true';

app.use(cors());
app.use(express.json());

// ─── State: last known reading per device ────────────────────────────────────
const lastReading = {}; // device_id → { water_distance_cm, timestamp }

// ─── Shared telemetry processing ─────────────────────────────────────────────
async function processTelemetry(body) {
  const device = await db.getDevice(body.device_id);
  if (!device) throw new Error('Device not registered');

  const drainDepthCm     = device.drain_depth_cm    || 15.0;
  const criticalLevelPct = device.critical_level_percent || 80.0;

  // Raw sensor values
  const waterDistanceCm  = body.water_distance_cm != null ? parseFloat(body.water_distance_cm) : null;
  const rainValue        = body.rain_value != null ? parseInt(body.rain_value, 10) : null;
  const flowRateLpm      = body.flow_rate_lpm != null ? parseFloat(body.flow_rate_lpm) : null;
  const wifiStatus       = body.wifi_status || 'ONLINE';
  const timestamp        = new Date();

  // Sensor health
  const prevReading  = lastReading[body.device_id] || null;
  const prevDistance = prevReading ? prevReading.water_distance_cm : null;

  const sensorHealth = assessSensorHealth({
    waterDistanceCm,
    drainDepthCm,
    rainValue,
    flowRateLpm,
    prevDistance,
  });

  // Derived values
  const isSensorValid = sensorHealth.status !== 'OFFLINE' && sensorHealth.status !== 'INVALID_READING';
  const waterLevelCm  = (isSensorValid && waterDistanceCm !== null)
    ? waterLevelFromDistance(waterDistanceCm, drainDepthCm)
    : null;

  const waterLevelPercent = waterLevelCm !== null
    ? Math.round((waterLevelCm / drainDepthCm) * 100)
    : null;

  const rainIntensity = classifyRainIntensity(rainValue);

  // Rise rate from recent history
  const recentReadings = await db.getRecentTelemetryForRise(body.device_id);
  let riseRateCmMin    = calculateRiseRate(recentReadings);

  if (waterLevelCm !== null && recentReadings.length > 0) {
    const syntheticRecent = [{ water_level_cm: waterLevelCm, timestamp }, ...recentReadings];
    riseRateCmMin = calculateRiseRate(syntheticRecent);
  }

  // Risk calculation
  const { riskLevel, riskScore, riskReasons, priority, predictedFailureMinutes } = calculateRisk({
    waterLevelCm,
    drainDepthCm,
    criticalLevelPct,
    rainIntensity,
    flowRateLpm,
    riseRateCmMin,
    sensorStatus: sensorHealth.status,
  });

  // Save telemetry
  await db.insertTelemetry({
    device_id:               body.device_id,
    timestamp,
    water_distance_cm:       waterDistanceCm,
    water_level_cm:          waterLevelCm,
    water_level_percent:     waterLevelPercent,
    rain_value:              rainValue,
    rain_intensity:          rainIntensity,
    flow_rate_lpm:           flowRateLpm,
    water_rise_rate_cm_min:  riseRateCmMin,
    risk_level:              riskLevel,
    risk_score:              riskScore,
    predicted_failure_minutes: predictedFailureMinutes,
    risk_reasons:            riskReasons,
    sensor_status:           sensorHealth.status,
    wifi_status:             wifiStatus,
  });

  // Update last reading cache
  lastReading[body.device_id] = { water_distance_cm: waterDistanceCm, timestamp };

  // Auto-create incident if HIGH/CRITICAL
  await handleIncidentLifecycle(body.device_id, device, riskLevel, riskScore, riskReasons, priority);

  // Build enriched payload for broadcast
  const enriched = {
    device_id:               body.device_id,
    location_name:           device.location_name,
    timestamp:               timestamp.toISOString(),
    water_distance_cm:       waterDistanceCm,
    water_level_cm:          waterLevelCm,
    water_level_percent:     waterLevelPercent,
    drain_depth_cm:          drainDepthCm,
    rain_value:              rainValue,
    rain_intensity:          rainIntensity,
    flow_rate_lpm:           flowRateLpm,
    water_rise_rate_cm_min:  riseRateCmMin,
    risk_level:              riskLevel,
    risk_score:              riskScore,
    predicted_failure_minutes: predictedFailureMinutes,
    risk_reasons:            riskReasons,
    priority,
    sensor_status:           sensorHealth.status,
    sensor_detail:           sensorHealth.detail,
    wifi_status:             wifiStatus,
  };

  // Broadcast via Socket.IO
  const summary = await db.getDashboardCounts();
  io.emit('telemetry', enriched);
  io.emit('dashboard_update', summary);

  return enriched;
}

// ─── Incident Lifecycle ───────────────────────────────────────────────────────
async function handleIncidentLifecycle(deviceId, device, riskLevel, riskScore, riskReasons, priority) {
  if (riskLevel !== 'HIGH' && riskLevel !== 'CRITICAL') return;

  const incidentId = `INC_${uuidv4().substring(0, 8).toUpperCase()}`;
  const now = new Date();

  const created = await db.insertIncident({
    incident_id:  incidentId,
    device_id:    deviceId,
    detected_at:  now,
    updated_at:   now,
    risk_level:   riskLevel,
    risk_score:   riskScore,
    risk_reasons: riskReasons,
    priority,
    status:       'DETECTED',
    authority_id: device.authority_id,
  });

  if (created) {
    io.emit('new_incident', { incidentId, deviceId, riskLevel, priority });
  }
}

// ─── Helper: enrich incidents with device/authority info ─────────────────────
async function enrichIncident(incident) {
  if (!incident) return null;
  const device    = await db.getDevice(incident.device_id);
  const authority = device ? await db.getAuthority(device.authority_id) : null;
  return {
    ...incident,
    location_name:  device?.location_name,
    ward:           device?.ward,
    authority_name: authority?.name,
    team_name:      authority?.team_name,
    contact_phone:  authority?.contact_phone,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/telemetry
// ═══════════════════════════════════════════════════════════════════════════
app.post('/api/telemetry', async (req, res) => {
  try {
    const body = req.body;
    if (!body.device_id || !ALLOWED_DEVICES.includes(body.device_id)) {
      return res.status(400).json({ error: 'Invalid or missing device_id' });
    }
    const enriched = await processTelemetry(body);
    return res.status(201).json({ success: true, processed: enriched });
  } catch (err) {
    console.error('[POST /api/telemetry]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/drains
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/drains', async (req, res) => {
  try {
    const devices  = await db.getAllDevices();
    const latestAll = await db.getAllLatestTelemetry();
    const latestMap = {};
    latestAll.forEach(t => { latestMap[t.device_id] = t; });

    const result = await Promise.all(devices.map(async d => {
      const auth = await db.getAuthority(d.authority_id);
      return {
        ...d,
        authority_name: auth?.name,
        team_name:      auth?.team_name,
        contact_phone:  auth?.contact_phone,
        contact_email:  auth?.contact_email,
        latest_telemetry: latestMap[d.device_id] || null,
      };
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/drains/:id
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/drains/:id', async (req, res) => {
  try {
    const device = await db.getDevice(req.params.id);
    if (!device) return res.status(404).json({ error: 'Device not found' });

    const auth   = await db.getAuthority(device.authority_id);
    const latest = await db.getLatestTelemetry(req.params.id);

    res.json({
      ...device,
      authority_name: auth?.name,
      team_name:      auth?.team_name,
      contact_phone:  auth?.contact_phone,
      contact_email:  auth?.contact_email,
      latest_telemetry: latest || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/drains/:id/history
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/drains/:id/history', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
    const rows  = await db.getHistory(req.params.id, limit);
    res.json(rows.reverse()); // oldest first for charting
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/incidents
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/incidents', async (req, res) => {
  try {
    const incidents = await db.getIncidents();
    const enriched  = await Promise.all(incidents.map(enrichIncident));
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/incidents/:id/acknowledge
// ═══════════════════════════════════════════════════════════════════════════
app.post('/api/incidents/:id/acknowledge', async (req, res) => {
  try {
    const now     = new Date();
    const updated = await db.updateIncident(req.params.id, {
      status:          'ACKNOWLEDGED',
      updated_at:      now,
      acknowledged_at: now,
      notes:           req.body.notes || null,
    });
    const enriched = await enrichIncident(updated);
    io.emit('incident_update', enriched);
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/incidents/:id/dispatch
// ═══════════════════════════════════════════════════════════════════════════
app.post('/api/incidents/:id/dispatch', async (req, res) => {
  try {
    const now     = new Date();
    const updated = await db.updateIncident(req.params.id, {
      status:       'DISPATCHED',
      updated_at:   now,
      dispatched_at: now,
      notes:        req.body.notes || null,
    });
    const enriched = await enrichIncident(updated);
    io.emit('incident_update', enriched);
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/incidents/:id/resolve
// ═══════════════════════════════════════════════════════════════════════════
app.post('/api/incidents/:id/resolve', async (req, res) => {
  try {
    const now     = new Date();
    const updated = await db.updateIncident(req.params.id, {
      status:      'RESOLVED',
      updated_at:  now,
      resolved_at: now,
      notes:       req.body.notes || null,
    });
    const enriched = await enrichIncident(updated);
    io.emit('incident_update', enriched);
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/dashboard
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/dashboard', async (req, res) => {
  try {
    res.json(await db.getDashboardCounts());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/priority-queue
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/priority-queue', async (req, res) => {
  try {
    const latestAll = await db.getAllLatestTelemetry();
    const devices   = await db.getAllDevices();
    const deviceMap = {};

    await Promise.all(devices.map(async d => {
      const auth = await db.getAuthority(d.authority_id);
      deviceMap[d.device_id] = { ...d, authority_name: auth?.name, team_name: auth?.team_name, contact_phone: auth?.contact_phone };
    }));

    const queue = await Promise.all(
      latestAll
        .filter(t => ['HIGH', 'CRITICAL', 'MEDIUM'].includes(t.risk_level))
        .map(async t => {
          const device   = deviceMap[t.device_id] || {};
          const incident = await db.getActiveIncidentForDevice(t.device_id);
          return {
            device_id:                 t.device_id,
            location_name:             device.location_name,
            ward:                      device.ward,
            risk_level:                t.risk_level,
            risk_score:                t.risk_score,
            priority:                  t.risk_level === 'CRITICAL' ? 'P1' : t.risk_level === 'HIGH' ? 'P2' : 'P3',
            predicted_failure_minutes: t.predicted_failure_minutes,
            authority_name:            device.authority_name,
            team_name:                 device.team_name,
            contact_phone:             device.contact_phone,
            incident_status:           incident?.status || null,
            incident_id:               incident?.incident_id || null,
            risk_reasons:              t.risk_reasons || [],
          };
        })
    );

    queue.sort((a, b) => {
      const pOrder = { P1: 0, P2: 1, P3: 2, P4: 3 };
      return (pOrder[a.priority] || 3) - (pOrder[b.priority] || 3);
    });

    res.json(queue);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// DEMO MODE
// ═══════════════════════════════════════════════════════════════════════════
if (DEMO_MODE) {
  const DEMO_SCENARIOS = {
    1: { water_distance_cm: 12.0, rain_value: 900, flow_rate_lpm: 6.5 },
    2: { water_distance_cm: 8.5,  rain_value: 420, flow_rate_lpm: 4.0 },
    3: { water_distance_cm: 3.2,  rain_value: 200, flow_rate_lpm: 0.8 },
    4: { water_distance_cm: 1.8,  rain_value: 150, flow_rate_lpm: 0.3 },
    5: { water_distance_cm: 9.0,  rain_value: 500, flow_rate_lpm: 5.5 },
  };

  app.post('/api/demo/simulate', async (req, res) => {
    try {
      const scenario = parseInt(req.body.scenario, 10);
      const data     = DEMO_SCENARIOS[scenario];
      if (!data) return res.status(400).json({ error: 'Invalid scenario (1–5)' });

      const body     = { device_id: 'DRAIN_001', ...data, wifi_status: 'ONLINE' };
      const enriched = await processTelemetry(body);
      res.json({ success: true, processed: enriched });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  let autoStreamInterval = null;

  app.post('/api/demo/autostream', async (req, res) => {
    const scenario  = parseInt(req.body.scenario, 10) || 1;
    const intervalMs = Math.max(1000, parseInt(req.body.interval_ms, 10) || 3000);

    if (autoStreamInterval) clearInterval(autoStreamInterval);

    autoStreamInterval = setInterval(async () => {
      const data = DEMO_SCENARIOS[scenario];
      if (!data) return;
      const body = { device_id: 'DRAIN_001', ...data, wifi_status: 'ONLINE' };
      try { await processTelemetry(body); } catch (e) { console.error('[Autostream]', e.message); }
    }, intervalMs);

    res.json({ success: true, message: `Auto-streaming scenario ${scenario} every ${intervalMs}ms` });
  });

  app.post('/api/demo/autostream/stop', (req, res) => {
    if (autoStreamInterval) { clearInterval(autoStreamInterval); autoStreamInterval = null; }
    res.json({ success: true, message: 'Auto-stream stopped' });
  });
}

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), demo_mode: DEMO_MODE });
});

// ─── Socket.IO ────────────────────────────────────────────────────────────────
io.on('connection', async (socket) => {
  console.log(`[Socket.IO] Client connected: ${socket.id}`);
  try {
    const summary = await db.getDashboardCounts();
    socket.emit('dashboard_update', summary);
  } catch (e) { /* ignore */ }

  socket.on('disconnect', () => {
    console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────
async function start() {
  console.log('\n🚰 SmartDrain Backend starting...');
  try {
    await db.connectDB();
  } catch (err) {
    console.error('[DB] Connection failed:', err.message);
    process.exit(1);
  }

  server.listen(PORT, () => {
    console.log(`\n✅ SmartDrain Backend running on http://localhost:${PORT}`);
    console.log(`   Demo mode: ${DEMO_MODE}`);
    console.log(`   Allowed devices: ${ALLOWED_DEVICES.join(', ')}\n`);
  });
}

start();
