# Lulling Games – Android App

Native Android App (Kotlin + WebView), die die lokale Lulling Games Web-App anzeigt.

## Voraussetzungen

- Android Studio (Hedgehog oder neuer)
- Android SDK 34
- Kotlin 1.9+

## Bauen & Installieren

1. Ordner `android/` in Android Studio öffnen
2. Gradle sync abwarten
3. APK bauen: **Build → Build APK(s)**
4. APK auf Handy installieren (USB oder per Dateiübertragung)

## Erste Verwendung

Beim ersten Start fragt die App nach der **Server-IP** des PCs, auf dem der Node.js-Server läuft:

```
Server-IP:  192.168.1.100   ← IP des PCs im WLAN
Port:       3000             ← Standard-Port
```

Beide Geräte müssen im selben WLAN sein.

## Features

- Zeigt Regeln und Admin-Seite aus dem lokalen Server
- Toolbar mit Buttons: Regeln | Admin | Aktualisieren
- Pull-to-Refresh
- Fehlermeldung wenn Server nicht erreichbar
- Server-IP über Menü → "Server einstellen" änderbar
