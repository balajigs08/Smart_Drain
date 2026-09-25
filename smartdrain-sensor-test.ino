/*
  SmartDrain — sensor test sketch (ESP8266 / NodeMCU)

  Purpose: verify wiring and readings for each sensor BEFORE running the
  full networked firmware. No Wi-Fi, no backend — just prints to Serial
  every second so you can watch the numbers as you move things by hand
  (e.g. wave a hand in front of the ultrasonic sensor, blow on the flow
  sensor's wheel, drip water on the rain sensor).

  Open Tools -> Serial Monitor in the Arduino IDE, set baud to 115200,
  after uploading.

  Wiring (same as the full firmware — see smartdrain-esp8266-firmware.ino
  for notes on voltage dividers etc.):
    Ultrasonic TRIG -> D5   ECHO -> D6
    Flow sensor SIGNAL -> D2
    Rain sensor DO -> D7
    (Works the same on ESP32: swap D5/D6/D2/D7 for GPIO 5/18/4/15.)
*/

#define TRIG_PIN   D5
#define ECHO_PIN   D6
#define FLOW_PIN   D2
#define RAIN_PIN   D7
#define PIPE_DEPTH_CM 100.0

volatile unsigned long pulseCount = 0;
void ICACHE_RAM_ATTR onFlowPulse() { pulseCount++; }

float readUltrasonicCm() {
  digitalWrite(TRIG_PIN, LOW);  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH); delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  long duration = pulseIn(ECHO_PIN, HIGH, 30000); // 30 ms timeout
  if (duration == 0) return -1; // no echo — check wiring or out of range
  return duration * 0.0343 / 2.0;
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\nSmartDrain sensor test — watch the values as you test each sensor by hand.\n");

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(RAIN_PIN, INPUT);
  pinMode(FLOW_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(FLOW_PIN), onFlowPulse, RISING);
}

void loop() {
  // --- Ultrasonic ---
  float distance = readUltrasonicCm();
  float level = (distance > 0) ? (PIPE_DEPTH_CM - distance) : -1;

  // --- Flow (pulses accumulated since last print, ~1s window) ---
  noInterrupts();
  unsigned long pulses = pulseCount;
  pulseCount = 0;
  interrupts();
  float flowLps = (pulses / 7.5) / 60.0; // YF-S201 constant — adjust for your sensor's datasheet

  // --- Rain ---
  bool raining = (digitalRead(RAIN_PIN) == LOW); // most modules: LOW = wet, check yours

  // --- Print ---
  Serial.print("Ultrasonic: ");
  if (distance < 0) {
    Serial.print("NO ECHO (check wiring/power)");
  } else {
    Serial.print("distance="); Serial.print(distance); Serial.print(" cm");
    Serial.print("  ->  level="); Serial.print(level); Serial.print(" cm");
  }
  Serial.print("   |   Flow: "); Serial.print(pulses); Serial.print(" pulses/s = ");
  Serial.print(flowLps); Serial.print(" L/s");
  Serial.print("   |   Rain: "); Serial.println(raining ? "WET" : "dry");

  delay(1000);
}
