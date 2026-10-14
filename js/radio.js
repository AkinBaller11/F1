// Team radio: the race engineer's calls as a radio box, optionally spoken (German speech synthesis)
export class Radio {
  constructor(hud, mode, audio) {
    this.hud = hud; this.mode = mode; this.audio = audio; // mode(): 'voice' | 'text' | 'off'
    this.queue = []; this.busyT = 0; this.gapT = 0;
    this.voice = null;
    if (typeof speechSynthesis !== 'undefined') {
      const pick = () => {
        const vs = speechSynthesis.getVoices().filter((v) => /^de/i.test(v.lang));
        this.voice = vs.find((v) => /male|mann|stefan|markus|yannick|conrad/i.test(v.name)) || vs[0] || null;
      };
      pick(); speechSynthesis.onvoiceschanged = pick;
    }
  }

  // priority calls jump the queue; routine ones are dropped when the channel is busy
  say(text, dur = 3, priority = false) {
    if (this.mode() === 'off') return;
    if (priority) this.queue.unshift({ text, dur });
    else if (this.queue.length < 2) this.queue.push({ text, dur });
  }

  update(dt) {
    this.busyT -= dt; this.gapT -= dt;
    if (this.busyT > 0 || this.gapT > 0 || !this.queue.length) return;
    const m = this.queue.shift();
    const dur = Math.max(m.dur, 1.2 + m.text.length * 0.055);
    this.hud.radioMsg(m.text, dur);
    this.busyT = dur; this.gapT = dur + 1.5;
    this.audio && this.audio.radioClick && this.audio.radioClick();
    if (this.mode() === 'voice' && typeof speechSynthesis !== 'undefined') {
      try {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(m.text);
        u.lang = 'de-DE'; if (this.voice) u.voice = this.voice;
        u.rate = 1.12; u.pitch = 0.92; u.volume = 0.9;
        speechSynthesis.speak(u);
      } catch (_) { /* speech unavailable */ }
    }
  }

  stop() { this.queue = []; try { typeof speechSynthesis !== 'undefined' && speechSynthesis.cancel(); } catch (_) { /* ignore */ } }

  // iOS only speaks after a user gesture: call this from a tap
  static unlock() { try { if (typeof speechSynthesis !== 'undefined') { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } } catch (_) { /* ignore */ } }
}
