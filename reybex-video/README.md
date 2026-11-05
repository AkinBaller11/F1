# Reybex KI – Promo-Video (Remotion)

15 Sekunden, 30 fps, in zwei Formaten: `Main` (1920×1080) und `Vertical` (1080×1920).

```bash
npm install
npm run studio            # Vorschau im Browser
npm run render            # out/reybex-ki-16x9.mp4
npm run render:vertical   # out/reybex-ki-9x16.mp4
```

## Anpassen
- `src/brand.ts`: Farben (Orange), Schriften
- `src/content.ts`: alle Texte (Pills, Prompts, Karte, Claim, URL)
- `public/reybex-logo.png`: Reybex-Bildmarke (weiß, transparent), Glow kommt aus `src/components/Logo.tsx`
- `src/timeline.ts`: Szenen-Timing

## Szenen
1. Intro: Logo und Wortmarke mit Blur-in
2. Modul-Pills: Klick auf „KI-Agenten“, dann Zoom hinein
3. Prompt: Typewriter, Zoom-out auf das Chat-Feld, Senden
4. Build: Agenten-Schritte scrollen in 3D, mit Motion Blur
5. Ergebnis: Dashboard-Karte (Beispieldaten), zweiter Prompt, Zeitplan-Zeile, Farbwechsel
6. Outro: „Gebaut mit Reybex KI.“, Buchstaben fliegen ein

Hinweis: Firmen mit mehr als 3 Mitarbeitenden brauchen für Remotion eine Company License (remotion.pro).
