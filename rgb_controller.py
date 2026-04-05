#!/usr/bin/env python3
"""
RGB LED strip controller for Lulling Games (Raspberry Pi 4).

Polls /api/rgb/state from the game server and drives a 3-channel analog
RGB strip via PWM on GPIO pins.

Wiring (common-anode 12V strip with N-channel MOSFETs e.g. IRLZ44N):
  GPIO 17 (Pin 11) → 10kΩ → MOSFET gate → strip R pin (MOSFET drain)
  GPIO 27 (Pin 13) → 10kΩ → MOSFET gate → strip G pin (MOSFET drain)
  GPIO 22 (Pin 15) → 10kΩ → MOSFET gate → strip B pin (MOSFET drain)
  All MOSFET sources → shared GND ← Pi GND (Pin 6) ← 12V PSU GND
  Strip V+ → 12V PSU +

  Common-cathode / 5V strip: same GPIO pins, use NPN transistors instead,
  connect strip GND to transistor collector → emitter → Pi GND. No inversion needed.

Usage:
  pip install RPi.GPIO requests
  python3 rgb_controller.py [--server http://GAME_SERVER_IP:3000]

  Run at startup: add to /etc/rc.local or create a systemd service.
"""

import argparse
import math
import sys
import threading
import time

try:
    import requests
except ImportError:
    sys.exit("Install requests first:  pip install requests")

try:
    import RPi.GPIO as GPIO
except ImportError:
    sys.exit("Install RPi.GPIO first:  pip install RPi.GPIO")


# ── Configuration ────────────────────────────────────────────────────────────

PIN_R = 17   # BCM numbering
PIN_G = 27
PIN_B = 22

PWM_FREQ = 1000  # Hz — high enough to avoid visible flicker

DEFAULT_SERVER = "http://localhost:3000"
POLL_INTERVAL  = 0.5   # seconds between server polls


# ── GPIO setup ────────────────────────────────────────────────────────────────

GPIO.setmode(GPIO.BCM)
GPIO.setwarnings(False)
GPIO.setup(PIN_R, GPIO.OUT)
GPIO.setup(PIN_G, GPIO.OUT)
GPIO.setup(PIN_B, GPIO.OUT)

pwm_r = GPIO.PWM(PIN_R, PWM_FREQ)
pwm_g = GPIO.PWM(PIN_G, PWM_FREQ)
pwm_b = GPIO.PWM(PIN_B, PWM_FREQ)
pwm_r.start(0)
pwm_g.start(0)
pwm_b.start(0)


def set_color(r, g, b):
    """Set LED color. Values 0-255."""
    pwm_r.ChangeDutyCycle(r / 255 * 100)
    pwm_g.ChangeDutyCycle(g / 255 * 100)
    pwm_b.ChangeDutyCycle(b / 255 * 100)


def cleanup():
    pwm_r.stop()
    pwm_g.stop()
    pwm_b.stop()
    GPIO.cleanup()


# ── Effect engine ─────────────────────────────────────────────────────────────

# Shared state between poller thread and effect thread
_state_lock  = threading.Lock()
_current     = {"effect": "solid", "r": 0, "g": 0, "b": 0, "speed": 1.0}
_stop_event  = threading.Event()


def effect_loop():
    """Runs in a dedicated thread, renders the current effect in real time."""
    t = 0.0
    flash_on = True
    flash_timer = 0.0

    while not _stop_event.is_set():
        with _state_lock:
            effect = _current["effect"]
            r = _current["r"]
            g = _current["g"]
            b = _current["b"]
            speed = _current["speed"]

        if effect == "solid":
            set_color(r, g, b)
            time.sleep(0.05)

        elif effect == "pulse":
            # Sinusoidal brightness — one full cycle every (1/speed) seconds
            brightness = (math.sin(t * speed * 2 * math.pi) + 1) / 2
            set_color(int(r * brightness), int(g * brightness), int(b * brightness))
            t += 0.02
            time.sleep(0.02)

        elif effect == "flash":
            # Toggle on/off at (speed * 2) Hz
            flash_timer += 0.02
            period = 1.0 / (speed * 2)
            if flash_timer >= period:
                flash_timer = 0.0
                flash_on = not flash_on
            set_color(r if flash_on else 0,
                      g if flash_on else 0,
                      b if flash_on else 0)
            time.sleep(0.02)

        elif effect == "rainbow":
            # Cycle through hue at 'speed' rotations per second
            hue = (t * speed) % 1.0
            rc, gc, bc = _hsv_to_rgb(hue, 1.0, 1.0)
            set_color(int(rc * 255), int(gc * 255), int(bc * 255))
            t += 0.02
            time.sleep(0.02)

        else:
            # Unknown effect — treat as solid
            set_color(r, g, b)
            time.sleep(0.05)


def _hsv_to_rgb(h, s, v):
    """Convert HSV (0-1 each) to RGB (0-1 each)."""
    if s == 0:
        return v, v, v
    i = int(h * 6)
    f = h * 6 - i
    p, q, t_ = v * (1 - s), v * (1 - f * s), v * (1 - (1 - f) * s)
    return [(v, t_, p), (q, v, p), (p, v, t_), (p, q, v), (t_, p, v), (v, p, q)][i % 6]


# ── Server poller ─────────────────────────────────────────────────────────────

def poll_server(server_url):
    """Continuously fetches /api/rgb/state and updates _current."""
    url = server_url.rstrip("/") + "/api/rgb/state"
    print(f"[RGB] Polling {url} every {POLL_INTERVAL}s")

    while not _stop_event.is_set():
        try:
            resp = requests.get(url, timeout=3)
            resp.raise_for_status()
            data = resp.json()

            with _state_lock:
                _current["effect"] = data.get("effect", "solid")
                _current["r"]      = int(data.get("r", 0))
                _current["g"]      = int(data.get("g", 0))
                _current["b"]      = int(data.get("b", 0))
                _current["speed"]  = float(data.get("speed", 1.0))

        except requests.exceptions.ConnectionError:
            print("[RGB] Server unreachable — keeping last state")
        except Exception as e:
            print(f"[RGB] Poll error: {e}")

        time.sleep(POLL_INTERVAL)


# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Lulling Games RGB strip controller")
    parser.add_argument("--server", default=DEFAULT_SERVER,
                        help="Game server URL (default: %(default)s)")
    args = parser.parse_args()

    effect_thread = threading.Thread(target=effect_loop, daemon=True)
    effect_thread.start()

    poll_thread = threading.Thread(target=poll_server, args=(args.server,), daemon=True)
    poll_thread.start()

    print("[RGB] Controller running. Press Ctrl+C to stop.")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n[RGB] Shutting down…")
        _stop_event.set()
        time.sleep(0.1)
        cleanup()


if __name__ == "__main__":
    main()
