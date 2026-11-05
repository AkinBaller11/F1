"""Synthetisiert Hintergrundmusik und Soundeffekte für das Reybex-KI-Video.

Alles wird per Code erzeugt (keine Samples, keine Lizenzfragen).
Aufruf:  python3 audio/generate.py public/audio
Benötigt: numpy, scipy
"""
import os
import sys

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, fftconvolve, sawtooth, sosfilt

SR = 44100
rng = np.random.default_rng(7)
OUT = sys.argv[1] if len(sys.argv) > 1 else 'public/audio'
os.makedirs(OUT, exist_ok=True)


# ---------- Helfer ----------
def tt(d):
    return np.arange(int(round(d * SR))) / SR


def filt(x, fc, kind='low', order=2):
    sos = butter(order, fc, kind, fs=SR, output='sos')
    return sosfilt(sos, x, axis=0)


def noise(n):
    return rng.uniform(-1, 1, n)


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def stereo(x, pan=0.0):
    l = np.cos((pan + 1) * np.pi / 4)
    r = np.sin((pan + 1) * np.pi / 4)
    return np.stack([x * l * 1.414, x * r * 1.414], axis=1)


def as_stereo(x):
    return x if x.ndim == 2 else stereo(x)


_IR = {}


def reverb(x, dur=2.4, decay=3.2, mix=0.3, tone=6000):
    x = as_stereo(x)
    key = (dur, decay, tone)
    if key not in _IR:
        t = tt(dur)
        ir = np.stack([noise(len(t)), noise(len(t))], axis=1) * np.exp(-decay * t)[:, None]
        ir = filt(ir, tone)
        ir[: int(0.012 * SR)] = 0  # Pre-Delay
        ir /= np.sqrt((ir ** 2).sum(axis=0, keepdims=True))
        _IR[key] = ir
    ir = _IR[key]
    wet = np.stack([fftconvolve(x[:, c], ir[:, c])[: len(x)] for c in range(2)], axis=1)
    return x * (1 - mix) + wet * mix * 1.6


def pad_tail(x, sec):
    x = as_stereo(x)
    return np.concatenate([x, np.zeros((int(sec * SR), 2))])


def svf_sweep(x, f0, f1, q=0.7, curve=1.0):
    """Bandpass mit exponentiell wanderndem Zentrum (Chamberlin-SVF)."""
    n = len(x)
    p = (np.arange(n) / max(1, n - 1)) ** curve
    fc = f0 * (f1 / f0) ** p
    f = 2 * np.sin(np.pi * np.minimum(fc, SR / 6) / SR)
    low = band = 0.0
    out = np.empty(n)
    for i in range(n):
        low += f[i] * band
        high = x[i] - low - q * band
        band += f[i] * high
        out[i] = band
    return out


def save(name, x, peak=0.89):
    x = as_stereo(x)
    fade = min(len(x), int(0.004 * SR))
    x[-fade:] *= np.linspace(1, 0, fade)[:, None]
    m = np.max(np.abs(x)) or 1
    x = x / m * peak
    wavfile.write(os.path.join(OUT, name), SR, (x * 32767).astype(np.int16))


def sine_sweep(t, f_start, f_end, k):
    f = f_end + (f_start - f_end) * np.exp(-t * k)
    return np.sin(2 * np.pi * np.cumsum(f) / SR)


# ---------- Soundeffekte ----------
def sfx_click():
    t = tt(0.06)
    x = filt(noise(len(t)), 2500, 'high') * np.exp(-t * 320) * 0.5
    x += np.sin(2 * np.pi * 3100 * t) * np.exp(-t * 420) * 0.35
    x += np.sin(2 * np.pi * 170 * t) * np.exp(-t * 110) * 0.35
    return reverb(x, mix=0.12)


def sfx_key(k):
    t = tt(0.06)
    lo = 1400 + 350 * k
    x = filt(filt(noise(len(t)), lo, 'high'), 7000) * np.exp(-t * 520) * 0.7
    x += np.sin(2 * np.pi * (115 + 18 * k) * t) * np.exp(-t * 220) * 0.3
    return stereo(x, pan=[-0.25, 0.1, 0.3][k])


def sfx_pop():
    t = tt(0.18)
    x = sine_sweep(t, 1050, 480, 45) * np.exp(-t * 32) * (1 - np.exp(-t * 3000))
    return reverb(x, mix=0.2)


def sfx_whoosh(dur, f0, f1, pan0=-0.6, pan1=0.6, amp_curve=0.7):
    t = tt(dur)
    p = t / dur
    x = svf_sweep(noise(len(t)), f0, f1, q=0.55)
    x += svf_sweep(noise(len(t)), f0 * 1.5, f1 * 1.3, q=0.9) * 0.4
    env = np.sin(np.pi * p ** amp_curve) ** 2
    x = filt(x, 8000) * env
    pan = pan0 + (pan1 - pan0) * p
    st = np.stack([x * np.cos((pan + 1) * np.pi / 4), x * np.sin((pan + 1) * np.pi / 4)], axis=1) * 1.414
    return reverb(pad_tail(st, 0.6), mix=0.25)


def sfx_riser():
    d = 1.5
    t = tt(d)
    p = t / d
    x = svf_sweep(noise(len(t)), 250, 7000, q=0.45, curve=1.6) * p ** 2 * 0.8
    f = 180 * (4 ** p ** 1.4)
    tone = np.sin(2 * np.pi * np.cumsum(f * (1 + 0.006 * np.sin(2 * np.pi * 6 * t))) / SR)
    x += tone * p ** 2.2 * 0.25
    x[-int(0.02 * SR):] *= np.linspace(1, 0, int(0.02 * SR))
    return reverb(stereo(x), mix=0.3)


def sfx_impact():
    t = tt(2.8)
    x = sine_sweep(t, 95, 36, 6) * np.exp(-t * 1.5) * 1.0
    x += filt(noise(len(t)), 1400) * np.exp(-t * 14) * 0.7
    x += filt(noise(len(t)), 5000, 'high') * np.exp(-t * 30) * 0.15
    x = np.tanh(x * 1.6)
    return reverb(x, dur=3.0, decay=2.2, mix=0.35)


def sfx_shimmer():
    t = tt(2.4)
    x = np.zeros(len(t))
    for i, f in enumerate([1174.7, 1568.0, 1760.0, 2349.3, 2637.0, 3520.0]):
        trem = 0.75 + 0.25 * np.sin(2 * np.pi * (5 + i * 0.7) * t + i)
        x += np.sin(2 * np.pi * f * t + i) * trem * np.exp(-t * (1.6 + 0.3 * i)) / (1 + i * 0.4)
    x *= 1 - np.exp(-t * 40)
    return reverb(x * 0.4, dur=3.0, decay=1.8, mix=0.55)


def sfx_blip(f):
    t = tt(0.09)
    x = (np.sin(2 * np.pi * f * t) + 0.25 * np.sin(4 * np.pi * f * t)) * np.exp(-t * 55) * (1 - np.exp(-t * 2500))
    return reverb(x * 0.6, mix=0.25)


def sfx_tick():
    t = tt(0.035)
    x = np.sin(2 * np.pi * 3300 * t) * np.exp(-t * 520) + filt(noise(len(t)), 6000, 'high') * np.exp(-t * 600) * 0.3
    return stereo(x * 0.5)


def sfx_chime():
    t = tt(2.6)
    base = 880.0
    x = np.zeros(len(t))
    for r, a, d in [(1, 1, 2.0), (2.76, 0.45, 3.2), (5.4, 0.22, 4.6), (8.93, 0.1, 6.5)]:
        x += a * np.sin(2 * np.pi * base * r * t) * np.exp(-t * d)
    x *= 1 - np.exp(-t * 600)
    return reverb(x * 0.5, dur=3.0, decay=2.0, mix=0.45)


# ---------- Musik ----------
DUR = 15.0
N = int(DUR * SR)
T = np.arange(N) / SR
BEAT = 0.5  # 120 BPM
DROP = 7.0
OUTRO = 362 / 30  # Outro-Szene

CHORDS = [  # (start, ende, MIDI-Noten)
    (0.0, 2.0, [50, 57, 60, 64, 65]),   # Dm9
    (2.0, 4.0, [46, 53, 57, 62, 65]),   # Bbmaj7
    (4.0, 6.0, [48, 53, 57, 60, 64]),   # Fmaj7/C
    (6.0, 6.5, [45, 52, 57, 62, 64]),   # Asus4
    (6.5, 7.0, [45, 52, 57, 61, 64]),   # A
    (7.0, 9.0, [50, 57, 60, 64, 65]),   # Dm9
    (9.0, 11.0, [46, 53, 57, 62, 65]),  # Bbmaj7
    (11.0, OUTRO, [43, 50, 53, 57, 58]),  # Gm9
    (OUTRO, DUR, [50, 57, 64, 65, 69]),   # Dm(add9)
]
BASS = [(DROP, 9.0, 38), (9.0, 11.0, 34), (11.0, OUTRO, 31)]


def place(buf, x, at, gain=1.0):
    x = as_stereo(x)
    i = int(round(at * SR))
    if i >= len(buf):
        return
    j = min(len(buf), i + len(x))
    buf[i:j] += x[: j - i] * gain


def render_pad():
    dark = np.zeros((N, 2))
    for s, e, notes in CHORDS:
        dur = e - s + 0.8
        t = tt(dur)
        env = np.minimum(1, t / 0.35) * np.where(t > e - s, np.exp(-(t - (e - s)) * 5), 1)
        for m in notes:
            f = midi(m)
            for ch, det in ((0, -0.0045), (1, 0.0045)):
                v = sum(sawtooth(2 * np.pi * f * (1 + det * k) * t + rng.uniform(0, 6)) for k in (-1, 0, 1)) / 3
                i = int(s * SR)
                j = min(N, i + len(t))
                dark[i:j, ch] += (v * env)[: j - i] * 0.1
    bright = filt(dark, 3600)
    dark = filt(dark, 850)
    b = np.interp(T, [0, 2.5, 5.5, 6.95, 7.0, 12.0, OUTRO, 15], [0.15, 0.3, 0.55, 1.0, 0.75, 0.8, 0.45, 0.3])[:, None]
    return dark * (1 - b) + bright * b


def kick():
    t = tt(0.45)
    x = sine_sweep(t, 160, 46, 28) * np.exp(-t * 7)
    x += filt(noise(len(t)), 3000, 'high') * np.exp(-t * 250) * 0.2
    return np.tanh(x * 1.5)


def hat(open_=False):
    t = tt(0.12 if open_ else 0.05)
    return filt(noise(len(t)), 7500, 'high') * np.exp(-t * (25 if open_ else 80))


def clap():
    t = tt(0.3)
    e = np.zeros(len(t))
    for o in (0, 0.011, 0.022):
        e += np.where(t >= o, np.exp(-(t - o) * 90), 0)
    e += np.exp(-t * 14) * 0.4
    return filt(filt(noise(len(t)), 900, 'high'), 4000) * e


def snare(g):
    t = tt(0.18)
    x = filt(noise(len(t)), 1800, 'high') * np.exp(-t * 30) * 0.8 + np.sin(2 * np.pi * 190 * t) * np.exp(-t * 40) * 0.5
    return x * g


def pluck(f):
    t = tt(0.35)
    x = (np.sin(2 * np.pi * f * t) + 0.35 * np.sin(4 * np.pi * f * t) + 0.12 * np.sin(6 * np.pi * f * t))
    return x * np.exp(-t * 16) * (1 - np.exp(-t * 1500))


def render_music():
    mix = np.zeros((N, 2))
    pad = render_pad()

    # Sidechain-Hüllkurve für den Drop
    sc = np.ones(N)
    kicks = np.arange(DROP, OUTRO - 0.01, BEAT)
    for k in kicks:
        m = T >= k
        sc[m] = np.minimum(sc[m], 1 - 0.75 * np.exp(-(T[m] - k) * 9))
    duck = np.where((T >= DROP) & (T < OUTRO), sc, 1)[:, None]
    mix += pad * (0.55 + 0.45 * duck)

    # Arpeggio ab Szene 3
    arp = np.zeros((N, 2))
    pattern = [0, 2, 1, 3, 2, 4, 3, 1]
    step = 0.125
    t0 = 92 / 30
    i = 0
    for s in np.arange(t0, OUTRO - 0.01, step):
        notes = next(n for a, b, n in CHORDS if a <= s < b)
        m = notes[pattern[i % 8] % len(notes)] + 12
        g = 0.75 if (T[int(s * SR)] < DROP) else 1.0
        place(arp, stereo(pluck(midi(m)), pan=0.35 * np.sin(i * 0.9)), s, 0.07 * g)
        i += 1
    arp = filt(arp, 5200)
    # Ping-Pong-Delay (3/16)
    d = int(0.375 * SR)
    for rep, g in ((1, 0.35), (2, 0.15)):
        sh = np.zeros_like(arp)
        sh[d * rep:] = arp[: -d * rep]
        arp += sh[:, ::-1] * g if rep == 1 else sh * g
    mix += arp * np.interp(T, [t0, t0 + 1.5], [0.0, 1.0])[:, None]

    # Hi-Hats
    for s in np.arange(t0 + 0.25, OUTRO - 0.01, BEAT):
        place(mix, stereo(hat(), 0.3), s, 0.045 if s < DROP else 0.07)
    for s in np.arange(DROP, OUTRO - 0.01, 0.125):
        place(mix, stereo(hat(), -0.3), s, 0.022)

    # Snare-Roll im Build
    times = list(np.arange(5.5, 6.25, 0.25)) + list(np.arange(6.25, 6.75, 0.125)) + list(np.arange(6.75, 7.0, 0.0625))
    for s in times:
        g = 0.05 + 0.18 * ((s - 5.5) / 1.5) ** 1.5
        place(mix, stereo(snare(1.0), 0.05), s, g)

    # Drop: Kick, Clap, Bass
    for k in kicks:
        place(mix, stereo(kick()), k, 0.36)
    for s in np.arange(DROP + BEAT, OUTRO - 0.01, 2 * BEAT):
        place(mix, reverb(clap(), mix=0.3), s, 0.12)
    bass = np.zeros(N)
    for s, e, m in BASS:
        msk = (T >= s) & (T < e)
        tl = T[msk] - s
        f = midi(m)
        v = np.sin(2 * np.pi * f * tl) + 0.3 * np.sin(4 * np.pi * f * tl) + 0.15 * sawtooth(2 * np.pi * f * tl)
        env = np.minimum(1, tl / 0.01) * np.minimum(1, (e - s - tl) / 0.03)
        bass[msk] += v * env
    bass = filt(bass, 320) * sc * 0.2
    mix += stereo(bass)

    mix = reverb(mix, dur=2.6, decay=2.6, mix=0.18)
    mix = np.tanh(mix * 1.3) / np.tanh(1.3)
    fin = int(0.05 * SR)
    mix[:fin] *= np.linspace(0, 1, fin)[:, None]
    fout = int(1.2 * SR)
    mix[-fout:] *= np.linspace(1, 0, fout)[:, None] ** 1.5
    return mix


if __name__ == '__main__':
    save('music.wav', render_music(), peak=0.9)
    save('click.wav', sfx_click())
    for k in range(3):
        save(f'key{k}.wav', sfx_key(k), peak=0.6)
    save('pop.wav', sfx_pop(), peak=0.7)
    save('whoosh.wav', sfx_whoosh(0.7, 250, 3500))
    save('whip.wav', sfx_whoosh(0.4, 400, 6000, pan0=0.7, pan1=-0.7, amp_curve=0.5))
    save('send.wav', sfx_whoosh(0.32, 700, 6500, pan0=0, pan1=0.2, amp_curve=0.6), peak=0.7)
    save('pan.wav', sfx_whoosh(0.75, 180, 1800, pan0=0, pan1=0, amp_curve=0.8), peak=0.75)
    save('riser.wav', sfx_riser())
    save('impact.wav', sfx_impact())
    save('shimmer.wav', sfx_shimmer(), peak=0.7)
    for i, f in enumerate([1174.7, 1396.9, 1568.0, 1760.0, 2093.0]):
        save(f'blip{i}.wav', sfx_blip(f), peak=0.5)
    save('tick.wav', sfx_tick(), peak=0.45)
    save('chime.wav', sfx_chime(), peak=0.75)
    print('ok:', sorted(os.listdir(OUT)))
