# Apex GP 25

Browser-Rennspiel im Stil von F1 25: Cockpit-Ansicht mit Halo, Spiegeln und Lenkrad-Display, Barcelona-ähnliche Strecke, 20 Autos mit KI, Regen mit Gischt und Tropfen auf dem Visier, HUD wie im Spiel (Positionsturm, Sektoren, ERS, Gang, DRS).

Läuft ohne Build-Schritt mit Three.js vom CDN:

```bash
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```

Steuerung: W/S Gas/Bremse, A/D lenken, Leertaste ERS Overtake, F DRS, C/V Kamera, B Rückblick, R Zurücksetzen, Esc Pause. Controller wird unterstützt.

**iPad & Handy:** Touch-Steuerung mit Joystick, Tasten oder Neigen, Gas/Bremse-Pedale, Auto-Gas und Bremshilfe. Über „Zum Home-Bildschirm“ lässt sich das Spiel als Vollbild-App installieren (Querformat).

**Wetter:** Wechselhaft, Regen oder Trocken. Bei „Wechselhaft“ setzt Regen während des Rennens ein und hört wieder auf; die Strecke wird nass und trocknet ab, mit Vorhersage im HUD.

Inoffizielles Fan-Projekt, nicht mit der Formel 1 oder EA verbunden.
