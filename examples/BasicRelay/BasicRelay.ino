/*
 * Esp-BleDeck - demo sketch using EspBleDeck.
 *
 * Per-widget callbacks make the sketch self-contained: each widget
 * declares what it does inline. No global string-parsing handler.
 *
 *   relay1   ON / OFF        (digital)
 *   relay2   ON / OFF        (digital)
 *   led      0..255 dimmer   (analog / PWM)
 *   timer1   20-min auto-off for relay1
 *   BOOT     on-board button toggles relay1; the app follows along
 */

#include <EspBleDeck.h>

#define DEVICE_NAME    "ESP32-BleDeck"
#define ACTIVE_LEVEL   LOW          // active-low relay (safe on power-up)

#define RELAY1_PIN     26
#define RELAY2_PIN     25
#define LED_PIN        2            // on-board LED for the dimmer demo
#define BOOT_PIN       0            // on-board BOOT button (active-low)

EspBleDeck ble;

// MARK: per-widget handlers

void setRelay(uint8_t pin, bool on) {
  digitalWrite(pin, on ? ACTIVE_LEVEL : !ACTIVE_LEVEL);
}

void onRelay1(bool on)       { setRelay(RELAY1_PIN, on); }
void onRelay2(bool on)       { setRelay(RELAY2_PIN, on); }
void onBrightness(int value) { analogWrite(LED_PIN, value); }   // 0..255

// MARK: Arduino lifecycle

void setup() {
  Serial.begin(115200);

  pinMode(RELAY1_PIN, OUTPUT); setRelay(RELAY1_PIN, false);
  pinMode(RELAY2_PIN, OUTPUT); setRelay(RELAY2_PIN, false);
  pinMode(LED_PIN,    OUTPUT); analogWrite(LED_PIN, 0);
  pinMode(BOOT_PIN,   INPUT_PULLUP);

  // Catalog lines are broadcast in insertion order, so separators
  // visually group widgets in the PWA.
  ble.addSeparator("sec1", "Relays");
  ble.addSwitch   ("relay1", "Lamp", onRelay1);
  ble.addSwitch   ("relay2", "Fan",  onRelay2);

  ble.addSeparator("sec2", "Dimmer");
  ble.addSlider   ("led", "Brightness", 0, 255, 0, onBrightness);

  ble.addSeparator("sec3", "Timers");
  ble.addTimer    ("timer1", "Auto-off", 20 * 60, "relay1:TOGGLE");

  ble.begin(DEVICE_NAME);   // after the widgets, so the log shows the real count
}

void loop() {
  // Arduino loop() is already a FreeRTOS task on ESP32; just service
  // the BLE bus and yield with vTaskDelay (never blocking delay()).
  ble.loop();

  // Physical button -> same path as an app write, so the UI stays in sync.
  // ponytail: falling-edge only; the 50 ms loop period is the debounce.
  static bool wasUp = true;
  bool up = digitalRead(BOOT_PIN);
  if (wasUp && !up) ble.command("relay1:TOGGLE");
  wasUp = up;

  vTaskDelay(pdMS_TO_TICKS(50));
}
