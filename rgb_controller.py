#!/usr/bin/env python3
"""
RGB LED strip controller for Lulling Games (Raspberry Pi 5).

Polls /api/rgb/state from the game server and drives a 3-channel analog
RGB strip via PWM on GPIO pins.

IMPORTANT — Raspberry Pi 5 note:
  RPi.GPIO does NOT support PWM on Pi 5 (new RP1 GPIO chip).
  This script uses gpiozero (backed by lgpio), which works on Pi 4 AND Pi 5.

──────────────────────────────────────────────────────────────────────────────
WIRING — 5V common-cathode strip (most USB/PC strips)
  Your strip pins: R  G  B  GND (the GND/- is the common pin)

  You need 3x NPN transistors (e.g. BC547, 2N2222) and 3x 1kΩ resistors:

    GPIO 17 (Pin 11) ──1kΩ──► BC547 Base        ┐
                               BC547 Emitter ──► GND (shared with Pi GND)
                               BC547 Collector ► Strip R pin
    GPIO 27 (Pin 13) ──1kΩ──► BC547 Base   (same for G)
    GPIO 22 (Pin 15) ──1kΩ──► BC547 Base   (same for B)
    Strip V+ (red wire) ──────────────────► Pi 5V (Pin 2 or 4)
    Pi GND (Pin 6) ────────────────────────► shared GND

  Common-anode 12V strip (V+, R, G, B):
    Use N-channel MOSFETs (IRLZ44N) instead of NPN transistors.
    Strip V+ → 12V external supply.
    12V supply GND → Pi GND (shared).
    Change active_high=True to active_high=False in the script below.
──────────────────────────────────────────────────────────────────────────────

QUICK IDENTIFICATION — is your strip common anode or cathode?
  - 4 pins and one is labelled "+12V" or "12V" → common anode (12V)
  - 4 pins and one is GND/"-" → common cathode (usually 5V)
  - Look at the end connector: the longest/widest pin is usually the common

Setup:
  sudo apt install python3-gpiozero python3-lgpio
  pip install requests
  python3 rgb_controller.py [--server http://GAME_SERVER_IP:3000]

  # If server runs on the same Pi:
  python3 rgb_controller.py

Autostart (systemd):
  Create /etc/systemd/system/rgb-lulling.service — see bottom of this file.
"""

import argparse
import math
import sys
import threading
import time

try:
    import requests
except ImportError:
    sys.exit("Missing: pip install requests")

try:
    from gpiozero import RGBLED
    from gpiozero.pins.lgpio import LGPIOFactory
    from gpiozero import Device
    Device.pin_factory = LGPIOFactory()
except ImportError:
    sys.exit("Missing: sudo apt install python3-gpiozero python3-lgpio")


# ── Configuration ─────────────────────────────────────────────────────────────

PIN_R = 17   # BCM / GPIO number (not physical pin number)
PIN_G = 27
PIN_B = 22

# active_high=True  → common cathode (NPN transistors, 5V strip)
# active_high=False → common anode  (N-MOSFET,  12V strip)
ACTIVE_HIGH = True

DEFAULT_SERVER = "http://localhost:3000"
POLL_INTERVAL  = 0.5   # seconds between server polls


# ── LED setup ─────────────────────────────────────────────────────────────────

led = RGBLED(red=PIN_R, green=PIN_G, blue=PIN_B, active_high=ACTIVE_HIGH)


def set_color(r, g, b):
    """Set LED color. Values 0–255."""
    led.color = (r / 255, g / 255, b / 255)


def cleanup():
    led.off()
    led.close()


# ── Effect engine ─────────────────────────────────────────────────────────────

_state_lock = threading.Lock()
_current    = {"effect": "pulse", "r": 80, "g": 0, "b": 180, "speed": 0.5}
_stop_event = threading.Event()


def effect_loop():
    t = 0.0
    flash_on    = True
    flash_timer = 0.0

    while not _stop_event.is_set():
        with _state_lock:
            effect = _current["effect"]
            r, g, b = _current["r"], _current["g"], _current["b"]
            speed   = _current["speed"]

        if effect == "solid":
            set_color(r, g, b)
            time.sleep(0.05)

        elif effect == "pulse":
            brightness = (math.sin(t * speed * 2 * math.pi) + 1) / 2
            set_color(int(r * brightness), int(g * brightness), int(b * brightness))
            t += 0.02
            time.sleep(0.02)

        elif effect == "flash":
            flash_timer += 0.02
            period = 1.0 / (speed * 2)
            if flash_timer >= period:
                flash_timer = 0.0
                flash_on = not flash_on
            set_color(r if flash_on else 0, g if flash_on else 0, b if flash_on else 0)
            time.sleep(0.02)

        elif effect == "rainbow":
            hue = (t * speed) % 1.0
            rc, gc, bc = _hsv_to_rgb(hue, 1.0, 1.0)
            set_color(int(rc * 255), int(gc * 255), int(bc * 255))
            t += 0.02
            time.sleep(0.02)

        else:
            set_color(r, g, b)
            time.sleep(0.05)


def _hsv_to_rgb(h, s, v):
    if s == 0:
        return v, v, v
    i = int(h * 6)
    f = h * 6 - i
    p, q, t_ = v * (1 - s), v * (1 - f * s), v * (1 - (1 - f) * s)
    return [(v, t_, p), (q, v, p), (p, v, t_), (p, q, v), (t_, p, v), (v, p, q)][i % 6]


# ── Server poller ─────────────────────────────────────────────────────────────

def poll_server(server_url):
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

    threading.Thread(target=effect_loop, daemon=True).start()
    threading.Thread(target=poll_server, args=(args.server,), daemon=True).start()

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


# ── Systemd service (copy to /etc/systemd/system/rgb-lulling.service) ─────────
#
# [Unit]
# Description=Lulling Games RGB strip controller
# After=network.target
#
# [Service]
# ExecStart=/usr/bin/python3 /home/user/Lulling_games/rgb_controller.py --server http://localhost:3000
# Restart=always
# User=root
#
# [Install]
# WantedBy=multi-user.target
#
# Then run:
#   sudo systemctl enable rgb-lulling
#   sudo systemctl start rgb-lulling
