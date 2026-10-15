# Apex GP 25

Browser-Rennspiel im Stil von F1 26 mit allen 24 Strecken des Kalenders 2026 im echten Verlauf (plus die Fantasie-Strecke Neon City) und vier Tageszeiten (Morgen, Mittag, Abend, Nacht): Cockpit-Ansicht mit Halo, Spiegeln und Lenkrad-Display, 22 Autos (11 Teams) mit KI, Regen mit Gischt und Tropfen auf dem Visier, HUD wie im Spiel (Positionsturm, Sektoren, ERS, Gang, DRS).

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

**Auto:** Modell nach dem Reglement 2026, komplett im Code gebaut (keine externen 3D-Dateien): lange schmale Nase, Seitenkästen mit Schlitz-Einlass und tiefem Unterschnitt, schmale Motorabdeckung mit Airbox, Unterboden mit Leitblechen und Diffusor, Frontflügel mit vier Elementen und Tauchflügeln, Heckflügel mit beweglicher Klappe (aktive Aerodynamik) und LED-Regenlichtern an den Endplatten, Halo, verkleidete Aufhängung und Bremsbelüftungen. Lack mit Klarlack-Reflexen, Kohlefaser-Teile, Partner-Schriftzüge. Standard-Lackierung des Spielers: „Giallo“ in Schwarz-Gelb mit roten Akzenten (unter „Lackierung & Helm“ abschaltbar oder änderbar).

**Mehr Modi:** Karriere (eigener Fahrer, Upgrades, Teamduell, Vertragsangebote), Sprint-Wochenende, Fahrschule mit Medaillen, 20 Erfolge, Lackierungs- und Helm-Editor (auch im Multiplayer sichtbar), Zuschauermodus und Liga im Multiplayer.

**Bestenliste online:** In der Claude-Artifact-Version teilen alle Spieler eine Bestenliste. Auf Vercel braucht sie einen Redis-Speicher: im Vercel-Projekt unter *Storage* (Marketplace) „Upstash for Redis“ verbinden, dann setzt Vercel `KV_REST_API_URL` und `KV_REST_API_TOKEN` automatisch und `api/board.js` nutzt sie. Ohne Speicher werden Bestzeiten nur auf dem Gerät gespeichert.

Inoffizielles Fan-Projekt, nicht mit der Formel 1 oder EA verbunden.

## Show

Vor jedem Rennen ein TV-Intro: Kameraflug über die Startaufstellung mit Einblendung von Großem Preis, Länge, Wetter, Pole und deinem Startplatz (Gas oder Tippen überspringt; im Multiplayer sehen alle das ganze Intro). Im Rennen TV-Einblendungen für die schnellste Runde (lila) und Überholmanöver an der Spitze oder mit menschlichen Fahrern, blinkende Rücklichter beim Energie-Laden, Emojis im Multiplayer steigen über dem Auto des Absenders auf, Konfetti bei der Siegerehrung.

## Multiplayer

Rennen erstellen, Code oder Einladungslink teilen (auf dem Handy über das Teilen-Menü), Mitspieler melden sich „Bereit“. Der Gastgeber wählt Strecke (Liste aller 24), Regeln (Einfach / Realistisch), Kollisionen (an oder Geisterautos), KI-Gegner und Liga; alle fahren mit den Regeln des Gastgebers. Weitere Gastgeber-Optionen: Startaufstellung (zufällig, Spieler vorne, Spieler hinten, Liga umgekehrt), KI-Gegner bis +16 mit eigener KI-Stärke, „Alle gleich schnell“ statt echter Teamleistung, Fahrhilfen für alle begrenzen oder verbieten, jede Regel einzeln, private Rennen (nicht in der Liste) und 1 bis 20 Runden. Die Autos der anderen werden mit ihrem eigenen Zeitstempel zwischen echten Positionen interpoliert (flüssig auch bei schwankender Verbindung) und tragen ein Namensschild.

## Streckendaten

Streckengeometrie, zwei Qualitätsstufen:

**Vermessen (12 Strecken):** Spa, Monza, Silverstone, Spielberg, Budapest, Suzuka, Shanghai, Bahrain, Montreal, Austin, Mexiko-Stadt, São Paulo. Mittellinie und Fahrbahnbreite stammen aus der [TUMFTM racetrack-database](https://github.com/TUMFTM/racetrack-database) (LGPL-3.0, Lehrstuhl für Fahrzeugtechnik der TU München; Mittellinien aus OpenStreetMap, © OpenStreetMap-Mitwirkende, ODbL; Breiten per Bildverarbeitung aus Satellitenbildern). Die Linie wird auf die echte Fahrbahnmitte verschoben, ohne Skalierung per Rotation und Verschiebung auf die unabhängige f1-circuits-Linie gelegt (mittlere Abweichung 1–3 m) und alle 5 m gespeichert. Die gemessene Rundenlänge weicht höchstens 0,06 % von der offiziellen ab. Die Breite variiert entlang der Runde (z. B. Spa 8–16 m, Silverstone 11–17 m); Physik, KI, Ideallinie, Randsteine, Kies und Gelände richten sich nach ihr.

**Geschätzt (12 Strecken):** Melbourne, Dschidda, Miami, Monaco, Barcelona, Zandvoort, Madrid, Baku, Singapur, Las Vegas, Katar, Abu Dhabi. Hier gibt es keine passenden Messdaten: Die TUM-Daten fehlen oder zeigen ein altes Layout (Melbourne und Abu Dhabi vor 2021, Barcelona mit der 2023 entfernten Schikane, Zandvoort nur DTM). Diese Strecken nutzen die GPS-Linien aus [f1-circuits](https://github.com/bacinger/f1-circuits) von Tomislav Bacinger (MIT-Lizenz), alle 20 m neu abgetastet, leicht geglättet und auf die offizielle Rundenlänge skaliert, mit einheitlich 14 m Fahrbahnbreite.

Bei allen Strecken geschätzt: Randsteine, Kiesbetten, Auslaufzonen, Mauern und Leitplanken werden aus der Kurvenkrümmung abgeleitet. Für sie gibt es keine frei nutzbaren Messdaten. Start-Ziel liegt wie im Original, Nachtrennen (Bahrain, Dschidda, Singapur, Las Vegas, Katar) starten bei Nacht. An Suzukas Kreuzung gibt es statt der Brücke eine ebene Kreuzung ohne Kollisionen zwischen den beiden Ästen.

An der Küste liegen die Strecken am Wasser (Monaco und Baku mit Yachten, Dschidda, Singapur, Abu Dhabi, Zandvoort, Montreal), Melbourne um den Albert-Park-See; Stadtkurse haben je nach Ort Hochhäuser (Singapur, Las Vegas) oder mittelhohe Bebauung (Monaco, Baku).

Höhenprofile: echte Höhen aus den offenen AWS Terrain Tiles (SRTM und nationale Höhenmodelle, Raster ca. 10–30 m) entlang jeder Strecke, gegen Bäume und Dächer geglättet (Höhenunterschied Spa 104 m, Spielberg 63 m, Monaco 45 m, Interlagos und Suzuka 43 m, Silverstone 12 m). Kurze Steilstücke werden dadurch flacher: In Spa ergibt das Höhenmodell am Raidillon im 55-m-Mittel 13 % Steigung, genannt werden meist etwa 17–18 %. Die ganze Welt wird im Shader um diese Höhe angehoben, Kamera und Fahrphysik lesen dieselbe Höhenkarte: bergauf bremst die Schwerkraft, bergab schiebt sie.

Formula 1, F1 und verwandte Marken gehören der Formula One Licensing B.V.; dies ist ein inoffizielles Fan-Projekt.

## Fahrphysik

Das Spielerauto ist ein Zweispurmodell mit Reifen, Aerodynamik und Federung (`js/physics.js`, Parameter in `js/vehicle.js`). Die KI und das Geschwindigkeitsprofil der Strecke nutzen dieselben Reifen-, Aero- und Massendaten als quasistationäre Grenzen (g-g-Diagramm), damit Spieler und KI nach denselben Regeln fahren.

- **Zustand:** Längs- und Quergeschwindigkeit, Gierrate, Roll- und Nickwinkel des Aufbaus. Gerechnet wird mit 480 Hz: das Spiel ruft die Physik mit 120 Hz auf, jeder Aufruf hat 4 Unterschritte. Das Ergebnis hängt praktisch nicht vom Bildtakt ab.
- **Reifen:** Seitenkraft über Schräglaufwinkel (vereinfachte Magic Formula, Maximum bei etwa 5°, voll rutschend etwa 80 %), mit Einlauflänge 0,45 m. Lastabhängiger Reibwert: 1,75 bei 3 kN, je kN mehr 0,05 weniger. Längs- und Seitenkraft teilen sich einen Reibkreis.
- **Radlasten:** Gewicht, Abtrieb (40 % vorne) und Lastverlagerung über die Federn (Roll- und Nickfedern mit Dämpfung 0,7, 55 % der Rollsteifigkeit vorne). Dazu kommt die vertikale Krümmung der Fahrbahn: In Senken wird das Auto schwerer, auf Kuppen leichter.
- **Antrieb:** Motorleistung an der Hinterachse. Die Traktion hängt von den Hinterradlasten und der Differenzialsperre ab. Die Sperre erzeugt ein untersteuerndes Giermoment unter Last.
- **Bremsen:** Bremsbalance verteilt die Bremskraft auf die Achsen. Motorbremse und Rekuperation gehören zum Hinterachsanteil (Brake-by-Wire). Ohne ABS blockiert eine überlastete Achse: blockierte Vorderräder schieben geradeaus, blockierte Hinterräder drehen das Auto.
- **Untergrund:** Haftungsfaktor und Rollwiderstand je Untergrund. Das Kiesbett verzögert mit etwa 0,5 × Radlast.
- **Kontakte:** Mauern und Autos wirken als Kraftstoß auf einen Starrkörper (Stoßzahl 0,15, Wandreibung 0,3). Ein Treffer an der Nase dreht das Auto über das Trägheitsmoment.
- **Fahrhilfen:** ABS und volle Traktionskontrolle halten die Längskraft jeder Achse so klein, dass die Seitenkraft der Kurve erhalten bleibt. Der Lenkbereich umfasst den Winkel der engsten bei dieser Geschwindigkeit fahrbaren Kurve plus den Spitzen-Schräglaufwinkel. Mit der Tastatur lenkt eine gedrückte Taste nur so weit, wie die aktuelle Drehung plus der Spitzen-Schräglauf braucht; mehr Einschlag würde die Vorderreifen nur über ihr Maximum treiben. Gamepad und Lenkrad haben den vollen Bereich.

**Annahmen:**
- 800 kg Masse, 3,40 m Radstand (Reglement 2026).
- 45,5 % der Masse auf der Vorderachse, Schwerpunkthöhe 0,28 m, Gierträgheit 1000 kg·m².
- Luftwiderstand CdA 1,35 m², Auftrieb ClA 5,2 m².
- Leistung 600 kW plus ERS.
- Rollgradient 0,25°/g, Nickgradient 0,12°/g.

Die Reifendaten von Pirelli sind nicht öffentlich. Reibwert und Lastempfindlichkeit sind deshalb Schätzungen in der für Rennslicks üblichen Größenordnung. Jede Annahme ist in `js/vehicle.js` mit Herkunft kommentiert.

**Reproduzierbare Fahrtests** (`tests/vehicle-tests.js`, im Browser auf einer ebenen Testfläche mit festem Zeitschritt): Beschleunigung, Bremsen mit und ohne ABS, Kreisfahrt, Lenkwinkelsprung bei drei Zeitschritten, Hochgeschwindigkeit, Bremsen in der Kurve, Kiesbett, Kuppe und Volleinschlag. Aufruf auf der geladenen Spielseite in der Browser-Konsole:

```js
const { runAll } = await import('/tests/vehicle-tests.js'); console.table(await runAll());
```

## Öffentliche Bestenliste (Vercel)

Ohne Datenspeicher bleiben die Zeiten nur auf dem jeweiligen Gerät. So wird die Bestenliste für alle sichtbar:

1. Im Vercel-Dashboard das Projekt öffnen → **Storage** → **Create Database** → **Upstash for Redis** (kostenloser Plan).
2. Die Datenbank mit dem Projekt verbinden (**Connect Project**). Vercel setzt dabei die Umgebungsvariablen `KV_REST_API_URL` und `KV_REST_API_TOKEN` automatisch.
3. Einmal neu deployen (**Deployments** → **Redeploy**).

Danach zeigt das Spiel im Zeitfahren den Rekord und nach jeder gültigen Runde deinen Platz weltweit. Im Claude-Artifact ist die Bestenliste für alle sichtbar, mit denen die Seite geteilt ist.
