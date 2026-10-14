# Apex GP 25

Browser-Rennspiel im Stil von F1 26 mit allen 24 Strecken des Kalenders 2026 im echten Verlauf (plus die Fantasie-Strecke Neon City) und vier Tageszeiten (Morgen, Mittag, Abend, Nacht): Cockpit-Ansicht mit Halo, Spiegeln und Lenkrad-Display, 20 Autos mit KI, Regen mit Gischt und Tropfen auf dem Visier, HUD wie im Spiel (Positionsturm, Sektoren, ERS, Gang, DRS).

Läuft ohne Build-Schritt mit Three.js vom CDN:

**Vercel:** Repo importieren, Framework „Other“ – Build-Befehl und Cache-Regeln kommen aus `vercel.json`. Bei jedem Deploy wird die Commit-ID als Version eingetragen; installierte Homebildschirm-Apps erkennen so neue Versionen und laden sie automatisch.

```bash
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```

Steuerung: W/S Gas/Bremse, A/D lenken, Leertaste ERS Overtake, F DRS, C/V Kamera, B Rückblick, R Zurücksetzen, Enter/I Boxenstopp, O Reifen für den Stopp, Esc Pause. Im Multiplayer schicken die Tasten 1–8 Emojis. Controller wird unterstützt.

**iPad & Handy:** Touch-Steuerung mit Joystick, Tasten oder Neigen, Gas/Bremse-Pedale, Auto-Gas und Bremshilfe. Über „Zum Home-Bildschirm“ lässt sich das Spiel als Vollbild-App installieren (Querformat).

**Multiplayer:** Online-Rennen gegen Freunde (bis 20 Autos, auf Wunsch mit KI aufgefüllt). Einer erstellt ein Rennen und gibt den 4-stelligen Code weiter, die anderen treten bei. In der Claude-Artifact-Version läuft das über den Echtzeit-„room“, als normale Webseite (z. B. Vercel) über direkte WebRTC-Verbindungen mit PeerJS – ohne eigenen Server oder Konto.

**Steuerung:** Profile Einfach / Normal / Profi, einzelne Fahrhilfen (Auto-Gas, Bremshilfe, Lenkhilfe, Getriebe, Ideallinie), Lenkempfindlichkeit, frei belegbare Tasten, Touch-Lenkrad in drei Größen und Pedale links oder rechts.

**Wetter:** Wechselhaft, Regen oder Trocken. Bei „Wechselhaft“ setzt Regen während des Rennens ein und hört wieder auf; die Strecke wird nass und trocknet ab, mit Vorhersage im HUD.

**Spielweise:** *Einfach* (Standard) ohne Verschleiß, Schäden, Strafen und Einführungsrunde, mit automatischem Start – oder *Realistisch* mit allem. Einzelne Regeln lassen sich unter „Rennen einrichten“ → „Regeln, Fahrhilfen & Anzeige“ anpassen. Kollisionen rechnen mit der echten Autoform: leichte Berührungen bleiben harmlos, harte Treffer drehen das Auto, das danach wendet und weiterfährt.

**Rennen:** Reifen Soft/Medium/Hard/Intermediate/Regen mit Verschleiß, Boxenstopps mit Boxengasse und Reifenwechsel, KI mit eigener Strategie, Schäden (Frontflügel bricht ab, Trümmerteile), 5-Sekunden-Strafen, gelbe Flaggen, Safety Car und virtuelles Safety Car, Boxenfunk mit Sprachausgabe, Siegerehrung und Replay mit TV-, Verfolger-, Heli- und Onboard-Kamera.

**Menü:** Kacheln wie in den offiziellen F1-Spielen: Schnelles Rennen, Grand Prix (Format: nur Rennen, Qualifying + Rennen oder Sprint-Wochenende), Karriere, Meisterschaft, Zeitfahren mit Geist-Auto, Multiplayer; darunter Fahrschule, Erfolge, Bestenliste, Steuerung und Einstellungen.

**KI-Fahrer:** Jeder Fahrer hat eine eigene Wertung für Tempo, Angriffslust und Konstanz (wie im offiziellen Spiel). Die KI nutzt DRS und Windschatten auf den Geraden, verliert in Kurven hinter einem anderen Auto Grip (schmutzige Luft), verteidigt mit einer Bewegung vor der Bremszone, macht bei blauen Flaggen Platz und leistet sich ab und zu einen Verbremser.

**Fahrhilfen:** Profile Einfach / Normal / Profi, dazu Traktionskontrolle (Voll / Mittel / Aus: durchdrehende Räder, das Heck kommt), ABS (aus: blockierende Räder, längerer Bremsweg), Brems- und Lenkhilfe, Ideallinie, Automatik oder manuell schalten. Fahrzeug-Setup mit Flügeln, Bremsbalance und Differenzial.

**Atmosphäre:** Funken aus dem Unterboden, glühende Bremsen, Gummispur auf der Ideallinie mit Gummikrümeln daneben, Reifen- und Bremstemperaturen, Einführungsrunde mit Kupplungsstart, Wetter auch als Gewitter, Nebel oder Regen nur auf einem Teil der Strecke. Fotomodus mit Tiefenunschärfe und Filtern.

**Mehr Modi:** Karriere (eigener Fahrer, Upgrades, Teamduell, Vertragsangebote), Sprint-Wochenende, Fahrschule mit Medaillen, 20 Erfolge, Lackierungs- und Helm-Editor (auch im Multiplayer sichtbar), Zuschauermodus und Liga im Multiplayer.

**Bestenliste online:** In der Claude-Artifact-Version teilen alle Spieler eine Bestenliste. Auf Vercel braucht sie einen Redis-Speicher: im Vercel-Projekt unter *Storage* (Marketplace) „Upstash for Redis“ verbinden, dann setzt Vercel `KV_REST_API_URL` und `KV_REST_API_TOKEN` automatisch und `api/board.js` nutzt sie. Ohne Speicher werden Bestzeiten nur auf dem Gerät gespeichert.

Inoffizielles Fan-Projekt, nicht mit der Formel 1 oder EA verbunden.

## Streckendaten

Die echten Streckenverläufe stammen aus [f1-circuits](https://github.com/bacinger/f1-circuits) von Tomislav Bacinger (MIT-Lizenz). Die GPS-Linien werden alle 20 m neu abgetastet, leicht geglättet und auf die offizielle Rundenlänge skaliert. Start-Ziel liegt wie im Original, Nachtrennen (Bahrain, Dschidda, Singapur, Las Vegas, Katar) starten bei Nacht. Höhenunterschiede und die Umgebung sind nachempfunden; an Suzukas Kreuzung gibt es statt der Brücke eine ebene Kreuzung ohne Kollisionen zwischen den beiden Ästen.

Formula 1, F1 und verwandte Marken gehören der Formula One Licensing B.V.; dies ist ein inoffizielles Fan-Projekt.
