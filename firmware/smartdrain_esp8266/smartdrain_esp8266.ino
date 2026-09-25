/**
 * SmartDrain ESP8266 Firmware
 * ===========================
 * Hardware: ESP8266 NodeMCU
 * Sensors:
 *   - US-100 ultrasonic (trigger/echo mode)  → D5 (TRIG), D6 (ECHO)
 *   - Rain sensor analog AO                  → A0
 *   - YF-S201 water flow sensor              → D1
 *   - Buzzer                                 → D2
 *
 * Pin mapping (NodeMCU):
 *   D1 = GPIO5   D2 = GPIO4   D5 = GPIO14   D6 = GPIO12   A0 = A0
 *
 * Configuration: Edit the CONFIG section below.
 * Do NOT change GPIO assignments without updating the physical wiring.
 */

#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>

// ═══════════════════════════════════════════════════════════════════════════
// USER CONFIGURATION — Edit these values
// ═══════════════════════════════════════════════════════════════════════════

// Wi-Fi credentials
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// Backend API
const char* BACKEND_HOST  = "192.168.1.100";  // LAN IP of the backend laptop
const int   BACKEND_PORT  = 3001;
const char* DEVICE_ID     = "DRAIN_001";

// Drain physical parameters
const float DRAIN_DEPTH_CM       = 15.0;   // Actual depth of your miniature drain
const float CRITICAL_LEVEL_PCT   = 80.0;   // Buzzer triggers at this % level

// Telemetry send interval (milliseconds)
const unsigned long SEND_INTERVAL_MS = 3000;   // Send every 3 seconds

// Wi-Fi retry interval
const unsigned long WIFI_RETRY_MS    = 10000;  // Retry Wi-Fi every 10 seconds

// ═══════════════════════════════════════════════════════════════════════════
// PIN ASSIGNMENTS — Do NOT change without updating hardware
// ═══════════════════════════════════════════════════════════════════════════
#define PIN_US100_TRIG  D5   // GPIO14
#define PIN_US100_ECHO  D6   // GPIO12
#define PIN_RAIN_AO     A0   // Analog input
#define PIN_FLOW        D1   // GPIO5 — flow pulse input (voltage-adapted)
#define PIN_BUZZER      D2   // GPIO4

// ═══════════════════════════════════════════════════════════════════════════
// FLOW SENSOR (YF-S201) — pulse counting
// YF-S201: ~7.5 pulses per liter, i.e. flow_lpm = pulse_count * 60 / (7.5 * interval_s)
// ═══════════════════════════════════════════════════════════════════════════
volatile unsigned long flowPulseCount = 0;
unsigned long lastFlowTime            = 0;
float flowRateLpm                     = 0.0;

void ICACHE_RAM_ATTR flowPulseISR() {
  flowPulseCount++;
}

// ═══════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════
unsigned long lastSendTime  = 0;
unsigned long lastWifiRetry = 0;
bool wifiConnected          = false;
bool localAlertActive       = false;

// ═══════════════════════════════════════════════════════════════════════════
// US-100 — Trigger/Echo distance measurement
// Returns distance in cm, or -1.0 on timeout/error
// ═══════════════════════════════════════════════════════════════════════════
float measureDistanceCm() {
  // Ensure TRIG is low before starting
  digitalWrite(PIN_US100_TRIG, LOW);
  delayMicroseconds(4);

  // Send 10 µs HIGH pulse on TRIG
  digitalWrite(PIN_US100_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_US100_TRIG, LOW);

  // Measure ECHO pulse width (timeout: 30 ms = ~5.1 m max range)
  long duration = pulseIn(PIN_US100_ECHO, HIGH, 30000UL);

  if (duration == 0) return -1.0;  // No echo / timeout

  float distanceCm = (duration / 2.0) / 29.1;  // Speed of sound: 29.1 µs/cm

  // US-100 valid range: 2 cm – 450 cm
  if (distanceCm < 2.0 || distanceCm > 400.0) return -1.0;

  return distanceCm;
}

// ═══════════════════════════════════════════════════════════════════════════
// Flow rate calculation
// ═══════════════════════════════════════════════════════════════════════════
float calculateFlowRate() {
  unsigned long now      = millis();
  unsigned long elapsed  = now - lastFlowTime;

  if (elapsed < 500) return flowRateLpm;  // Don't update too frequently

  noInterrupts();
  unsigned long pulses = flowPulseCount;
  flowPulseCount = 0;
  interrupts();

  float elapsedSeconds = elapsed / 1000.0;
  // YF-S201: ~7.5 pulses/litre = 7.5 pulses/min at 1 LPM
  // flowRateLpm = (pulses / 7.5) * (60 / elapsedSeconds)
  flowRateLpm   = (pulses / 7.5f) * (60.0f / elapsedSeconds);
  lastFlowTime  = now;

  return flowRateLpm;
}

// ═══════════════════════════════════════════════════════════════════════════
// Local risk assessment (simplified, for offline buzzer operation)
// ═══════════════════════════════════════════════════════════════════════════
bool isHighRiskLocally(float distanceCm) {
  if (distanceCm < 0) return false; // Sensor error — do not trigger

  float waterLevelCm      = DRAIN_DEPTH_CM - distanceCm;
  float waterLevelPercent = (waterLevelCm / DRAIN_DEPTH_CM) * 100.0;

  return waterLevelPercent >= CRITICAL_LEVEL_PCT;
}

// ═══════════════════════════════════════════════════════════════════════════
// Buzzer control
// ═══════════════════════════════════════════════════════════════════════════
void setBuzzer(bool on) {
  digitalWrite(PIN_BUZZER, on ? HIGH : LOW);
}

void beepPattern(int times, int onMs, int offMs) {
  for (int i = 0; i < times; i++) {
    setBuzzer(true);
    delay(onMs);
    setBuzzer(false);
    if (i < times - 1) delay(offMs);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Wi-Fi connection
// ═══════════════════════════════════════════════════════════════════════════
void connectWifi() {
  Serial.printf("[WiFi] Connecting to %s", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 10000) {
    delay(250);
    Serial.print(".");
  }
  if (WiFi.status() == WL_CONNECTED) {
    wifiConnected = true;
    Serial.printf("\n[WiFi] Connected! IP: %s\n", WiFi.localIP().toString().c_str());
    beepPattern(2, 100, 100);
  } else {
    wifiConnected = false;
    Serial.println("\n[WiFi] Connection failed — local monitoring mode");
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Send telemetry to backend
// ═══════════════════════════════════════════════════════════════════════════
bool sendTelemetry(float distanceCm, int rainValue, float flowLpm) {
  if (WiFi.status() != WL_CONNECTED) return false;

  WiFiClient client;
  HTTPClient http;

  String url = String("http://") + BACKEND_HOST + ":" + BACKEND_PORT + "/api/telemetry";

  // Build JSON payload
  String payload = "{";
  payload += "\"device_id\":\"" + String(DEVICE_ID) + "\",";

  if (distanceCm > 0) {
    payload += "\"water_distance_cm\":" + String(distanceCm, 2) + ",";
  } else {
    payload += "\"water_distance_cm\":null,";
  }

  payload += "\"rain_value\":" + String(rainValue) + ",";
  payload += "\"flow_rate_lpm\":" + String(flowLpm, 2) + ",";
  payload += "\"wifi_status\":\"ONLINE\"";
  payload += "}";

  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(5000);  // 5 s timeout

  int httpCode = http.POST(payload);

  if (httpCode == 200 || httpCode == 201) {
    Serial.printf("[HTTP] Telemetry sent OK (HTTP %d)\n", httpCode);
    http.end();
    return true;
  } else {
    Serial.printf("[HTTP] Send failed (HTTP %d)\n", httpCode);
    http.end();
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SETUP
// ═══════════════════════════════════════════════════════════════════════════
void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n\n🚰 SmartDrain Firmware starting...");

  // Pin modes
  pinMode(PIN_US100_TRIG, OUTPUT);
  pinMode(PIN_US100_ECHO, INPUT);
  pinMode(PIN_BUZZER,     OUTPUT);
  pinMode(PIN_FLOW,       INPUT_PULLUP);

  // Ensure buzzer off
  setBuzzer(false);

  // Attach flow pulse interrupt
  attachInterrupt(digitalPinToInterrupt(PIN_FLOW), flowPulseISR, RISING);
  lastFlowTime = millis();

  // Startup beep
  beepPattern(1, 200, 0);
  delay(300);

  // Connect to Wi-Fi
  connectWifi();

  lastSendTime  = millis();
  lastWifiRetry = millis();

  Serial.printf("[Config] Drain depth: %.1f cm, Critical: %.0f%%\n",
                DRAIN_DEPTH_CM, CRITICAL_LEVEL_PCT);
}

// ═══════════════════════════════════════════════════════════════════════════
// LOOP
// ═══════════════════════════════════════════════════════════════════════════
void loop() {
  unsigned long now = millis();

  // ── Wi-Fi retry (non-blocking) ─────────────────────────────────────────
  if (!wifiConnected && (now - lastWifiRetry >= WIFI_RETRY_MS)) {
    lastWifiRetry = now;
    Serial.println("[WiFi] Retrying connection...");
    connectWifi();
  }

  // ── Read sensors ───────────────────────────────────────────────────────
  float distanceCm = measureDistanceCm();
  int   rainValue  = analogRead(PIN_RAIN_AO);
  float flowLpm    = calculateFlowRate();

  // ── Local debug print ──────────────────────────────────────────────────
  float waterLevelCm  = (distanceCm > 0) ? max(0.0f, DRAIN_DEPTH_CM - distanceCm) : -1;
  float levelPct      = (waterLevelCm >= 0) ? (waterLevelCm / DRAIN_DEPTH_CM) * 100.0f : -1;

  Serial.printf("[Sensor] Dist: %.2f cm | Level: %.1f%% | Rain: %d | Flow: %.2f LPM | WiFi: %s\n",
                distanceCm, levelPct, rainValue, flowLpm,
                wifiConnected ? "ONLINE" : "OFFLINE");

  // ── Local risk + buzzer ────────────────────────────────────────────────
  bool highRisk = isHighRiskLocally(distanceCm);
  if (highRisk && !localAlertActive) {
    localAlertActive = true;
    Serial.println("[ALERT] HIGH RISK — Activating local buzzer!");
    beepPattern(3, 200, 100);
  } else if (!highRisk && localAlertActive) {
    localAlertActive = false;
    setBuzzer(false);
    Serial.println("[ALERT] Risk cleared — buzzer off");
  }

  // Continuous fast beep during active alert
  if (localAlertActive) {
    setBuzzer((millis() / 500) % 2 == 0);  // 500 ms on/off
  }

  // ── Send telemetry to backend ──────────────────────────────────────────
  if (now - lastSendTime >= SEND_INTERVAL_MS) {
    lastSendTime = now;
    bool sent = sendTelemetry(distanceCm, rainValue, flowLpm);
    if (!sent) {
      Serial.println("[HTTP] Failed to send — continuing local monitoring");
    }
  }

  delay(100);  // Yield to ESP8266 scheduler
}
