# Prompt für Claude Code: Reybex-KI-Promo-Video (Motion Design)

Erstelle mit **Remotion** (React + TypeScript) ein ca. 15 Sekunden langes Promo-Video im Motion-Design-Stil für **Reybex KI-ERP** (https://www.reybex.com/ki-erp/).
Das Video zeigt, wie ein Nutzer der Reybex KI eine Anweisung in natürlicher Sprache gibt und die KI daraus einen fertigen ERP-Workflow (KI-Agenten) baut.

## 0. Vorbereitung
1. Lade https://www.reybex.com/ki-erp/ (und bei Bedarf https://www.reybex.com/) und hole dir:
   - die Claims und Headlines zur KI (wörtlich übernehmen, nichts erfinden)
   - die genannten KI-Funktionen und Use-Cases
   - Markenfarben (aus dem CSS: Primär-, Akzentfarbe), Schriftart und das Logo (SVG, falls vorhanden)
   Leg die Ergebnisse in `src/brand.ts` (Farben, Fonts) und `src/content.ts` (alle Texte) ab, damit man sie zentral ändern kann.
2. Wenn du die Seite nicht erreichst, nimm Platzhalter (Primärfarbe `#0A5CFF`, Akzent `#00C2FF`, Font „Inter“), markiere sie mit `// TODO: Brand prüfen` und schreib mir am Ende, was noch fehlt.
3. Setz das Projekt mit `npx create-video@latest` auf (Blank-Template). Komposition: **1920×1080, 30 fps, 450 Frames (15 s)**. Lege zusätzlich eine 9:16-Variante (1080×1920) für Social Media an, die dieselben Szenen mit angepasstem Layout nutzt.

## 1. Look & Feel (Referenzstil)
- Tiefschwarzer Hintergrund. Dazu ein großes, weich geblurrtes, fließendes **Licht-Band** in der Reybex-Markenfarbe, das sich langsam bewegt (SVG-Pfad oder Gradient-Blobs mit `filter: blur(80–120px)`, über `interpolate`/`noise` animiert).
- **Glassmorphism-UI:** halbtransparente Karten und Pills mit 1px hellem Rand, innerem Glow und `backdrop-filter: blur`.
- **Kamera-Bewegungen:** ständige, sanfte Zooms und Pans, 3D-Tilts (`perspective` + `rotateX/rotateY`) und schnelle Whip-Pans mit **Motion Blur** zwischen den Szenen (`@remotion/motion-blur` oder CSS-Blur abhängig von der Geschwindigkeit).
- **Text-Animationen:** Typewriter-Effekt mit blinkendem Cursor. Schlüsselwörter werden in der Akzentfarbe hervorgehoben. Neue Elemente blenden mit „Blur-in“ ein (Blur 20px → 0, Opacity 0 → 1, Scale 0.96 → 1).
- Für alle Bewegungen `spring()` mit `damping` ca. 18–22, nichts linear. Das Tempo ist schnell, aber ruhig, ähnlich wie bei Apple- oder Linear-Promos.
- Font: Reybex-Markenschrift, ersatzweise Inter/Geist. Alle Texte im Video auf **Deutsch**.

## 2. Storyboard (Frames bei 30 fps)

**Szene 1: Intro (0–45)**
Licht-Band fließt ins Bild. In der Mitte pulsiert das Reybex-Logo mit Glow. Daneben baut sich der Schriftzug „Reybex KI“ Buchstabe für Buchstabe mit Blur-in auf.

**Szene 2: Modul-Auswahl (45–90)**
Das Logo morpht in eine Reihe von Glass-Pills, die gestaffelt einfliegen (Stagger 3 Frames). Pill-Labels sind Reybex-Bereiche, z. B. `Verkauf` · `Einkauf` · `Lager` · `Buchhaltung` · `KI-Agenten` (wenn möglich durch Begriffe von der Website ersetzen), jeweils mit einem kleinen Line-Icon. Ein animierter Mauszeiger fährt zu „KI-Agenten“ und klickt: Die Pill leuchtet auf, ein kurzer Ripple läuft durch, dann ein Zoom in die Pill hinein als Übergang.

**Szene 3: Prompt (90–165)**
Schwarzer Screen, groß getippt: „Finde alle überfälligen Rechnungen und bereite Zahlungserinnerungen vor.“ Die Wörter „überfälligen Rechnungen“ und „Zahlungserinnerungen“ erscheinen in der Akzentfarbe. Dann Zoom-out: Der Text sitzt jetzt in einem Glass-Chat-Eingabefeld mit „+“-Button links sowie Mikrofon-Icon, animierter Audio-Waveform und Senden-Button in der Akzentfarbe rechts. Der Mauszeiger klickt auf Senden.

**Szene 4: Die KI baut (165–210)**
Whip-Pan mit Motion Blur. In 3D-Perspektive scrollen schnell die „Bausteine“ des Agenten durchs Bild, gestaltet als syntax-gehighlightete Code- bzw. Step-Liste, z. B.:
```
step: sql        → Offene Posten > 14 Tage überfällig laden
step: llm        → Mahnstufe je Kunde bewerten
step: confirm    → Freigabe durch Buchhaltung
step: email      → Zahlungserinnerung (HTML) senden
step: notify     → Bericht im KI-Aktivitätscenter
```

**Szene 5: Ergebnis (210–285)**
Die Kamera landet auf einer leicht gekippten 3D-Glass-Karte mit Gradient in Markenfarbe, die sich langsam flach dreht. Inhalt ist ein Reybex-Dashboard-Mockup:
- Topbar mit Reybex-Logo und Tabs `Übersicht · Rechnungen · Kunden · Agenten`
- Headline: „Mahnwesen-Agent“, Status-Badge „Bereit zur Freigabe“
- 3 Mini-KPIs, die hochzählen (eindeutige Beispieldaten, z. B. „12 überfällige Rechnungen“, „8 Kunden“, „3 Mahnstufen“)
- Button „Freigeben“

**Szene 6: Nachschärfen (285–360)**
Die Kamera pannt nach unten zum Chat-Feld unter der Karte. Getippt wird: „Schick mir jeden Montag einen Bericht.“ Klick auf Senden. Ein Lichtschweif fährt über die Karte, und es kommt eine neue Zeile mit Kalender-Icon dazu: „Jeden Montag, 08:00 · Bericht an Buchhaltung“. Gleichzeitig wechselt der Gradient der Karte sanft in eine zweite Markenfarbe, mit kurzem Light-Leak-Glow seitlich.

**Szene 7: Outro (360–450)**
Fade auf Schwarz, das Reybex-Logo pulsiert. Die Buchstaben des Claims „Gebaut mit Reybex KI.“ fliegen einzeln auf einer geschwungenen Bahn ein und rasten ein. Darunter blenden der Website-Claim und die URL `reybex.com/ki-erp` ein. Licht-Band klingt aus.

## 3. Technische Anforderungen
- Jede Szene als eigene Komponente in `src/scenes/`, zusammengesetzt über `<Series>` bzw. `<TransitionSeries>` (`@remotion/transitions`).
- Wiederverwendbare Komponenten: `GlowBackground`, `GlassCard`, `GlassPill`, `Typewriter`, `ChatInput`, `Cursor`, `CameraRig` (Wrapper für Zoom, Pan, Tilt und Motion Blur).
- Alle Texte, Farben und Timings zentral in `content.ts` / `brand.ts`.
- Optional: Sounddesign-Platzhalter (`public/sfx/`) für Klick, Whoosh und Tippen, die per `<Audio>` getriggert werden. Leise Musikspur, wenn eine lizenzfreie Datei vorhanden ist.
- Keine fremden Marken, Logos oder Wasserzeichen verwenden (kein TikTok-Outro, keine fremden Logos). Nur Reybex-Branding.
- Render-Befehle bereitstellen: `npx remotion render Main out/reybex-ki-16x9.mp4` und `npx remotion render Vertical out/reybex-ki-9x16.mp4`.

## 4. Ablauf
1. Website auslesen → `brand.ts` und `content.ts` anlegen.
2. Grundgerüst und Hintergrund bauen, dann die Szenen nacheinander.
3. Von jeder Szene ein Standbild rendern (`npx remotion still`), prüfen und nachbessern, bis Timing, Glow und Lesbarkeit passen.
4. Final rendern und eine kurze Liste schreiben: welche Texte von der Website stammen und welche Platzhalter noch zu prüfen sind.
