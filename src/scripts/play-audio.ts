/**
 * Sound for /play. Everything is synthesised in the browser with the Web Audio API:
 * no audio files, nothing to license. Layers fade in and out with where the player stands.
 */
type Layer = { gain: GainNode; vol: number };

export function createAudio() {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let muted = false;
  const layers: Record<string, Layer> = {};
  let honkIn = 5;
  let clinkIn = 2;
  let droneG: GainNode | null = null;
  let droneO: OscillatorNode[] = [];

  const noise = (c: AudioContext, brown: boolean) => {
    const len = c.sampleRate * 3;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else d[i] = w;
    }
    return buf;
  };

  const layer = (name: string, buf: AudioBuffer, type: BiquadFilterType, freq: number, q: number, lfo = 0) => {
    if (!ctx || !master) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(f).connect(gain).connect(master);
    if (lfo) {
      const o = ctx.createOscillator();
      o.frequency.value = lfo;
      const og = ctx.createGain();
      og.gain.value = freq * 0.35;
      o.connect(og).connect(f.frequency);
      o.start();
    }
    src.start();
    layers[name] = { gain, vol: 0 };
  };

  const tone = (freq: number, dur: number, type: OscillatorType, vol: number, delay = 0, slideTo?: number) => {
    if (!ctx || !master || muted) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2600;
    o.connect(lp).connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.05);
  };

  const tick = (vol: number, freq: number, dur = 0.04) => {
    if (!ctx || !master || muted) return;
    const src = ctx.createBufferSource();
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = 1.4;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(master);
    src.start();
  };

  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

  return {
    get muted() {
      return muted;
    },
    /** Must be called from a click or key press. */
    start() {
      if (ctx) {
        void ctx.resume();
        return;
      }
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.7;
      master.connect(ctx.destination);
      const brown = noise(ctx, true);
      const white = noise(ctx, false);
      layer('street', brown, 'lowpass', 260, 0.4);
      layer('nile', white, 'bandpass', 700, 0.5, 0.13);
      layer('wind', white, 'bandpass', 420, 0.7, 0.07);
      layer('cafe', white, 'bandpass', 1700, 0.9, 0.5);
    },
    setMuted(m: boolean) {
      muted = m;
      if (ctx && master) master.gain.setTargetAtTime(m ? 0 : 0.7, ctx.currentTime, 0.05);
    },
    /** Called every frame with the player position. */
    update(x: number, z: number, dt: number, night: number) {
      if (!ctx) return;
      const street = clamp01(1 - Math.abs(z + 7) / 24) * (x > -54 && x < 46 ? 1 : 0.25) * (1 - night * 0.5);
      const want: Record<string, number> = {
        street: street * 0.5,
        nile: clamp01(1 - Math.abs(z + 31) / 15) * 0.16,
        wind: clamp01((-46 - x) / 16) * 0.1 + night * 0.02,
        cafe: clamp01(1 - Math.hypot(x + 14, z - 8) / 11) * 0.05,
      };
      for (const k in layers) layers[k].gain.gain.setTargetAtTime(want[k] ?? 0, ctx.currentTime, 0.4);
      if ((honkIn -= dt) <= 0) {
        honkIn = 5 + Math.random() * 9;
        if (street > 0.25) this.honk(0.03 + street * 0.03, Math.random() > 0.5);
      }
      if ((clinkIn -= dt) <= 0) {
        clinkIn = 1.2 + Math.random() * 2.6;
        if (want.cafe > 0.015) tick(0.05, 3200 + Math.random() * 1500, 0.03);
      }
    },
    /** Trailer sounds for the opening. */
    drone(on: boolean) {
      if (!ctx || !master) return;
      if (on && !droneG) {
        droneG = ctx.createGain();
        droneG.gain.value = 0;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 180;
        lp.connect(droneG).connect(master);
        droneO = [55, 55.4, 82.4, 110.3].map((f) => {
          const o = ctx!.createOscillator();
          o.type = 'sawtooth';
          o.frequency.value = f;
          o.connect(lp);
          o.start();
          return o;
        });
        droneG.gain.setTargetAtTime(0.16, ctx.currentTime, 1.2);
        lp.frequency.setTargetAtTime(520, ctx.currentTime, 6);
      } else if (!on && droneG) {
        const g = droneG;
        const os = droneO;
        g.gain.cancelScheduledValues(ctx.currentTime);
        g.gain.setTargetAtTime(0, ctx.currentTime, 0.015);
        setTimeout(() => {
          os.forEach((o) => o.stop());
          g.disconnect();
        }, 200);
        droneG = null;
        droneO = [];
      }
    },
    braam(big = false) {
      const v = big ? 0.2 : 0.13;
      tone(big ? 49 : 55, big ? 2.6 : 1.8, 'sawtooth', v);
      tone(big ? 73.4 : 82.4, big ? 2.6 : 1.8, 'sawtooth', v * 0.7);
      tone(big ? 98 : 110, big ? 2.2 : 1.5, 'square', v * 0.35);
      tick(big ? 0.5 : 0.3, 90, 0.5);
    },
    scratch() {
      tone(900, 0.22, 'sawtooth', 0.12, 0, 70);
      tick(0.25, 2400, 0.12);
    },
    honk(vol = 0.06, double = false) {
      const base = 370 + Math.random() * 60;
      tone(base, 0.16, 'square', vol);
      tone(base * 1.26, 0.16, 'square', vol * 0.8);
      if (double) {
        tone(base, 0.2, 'square', vol, 0.22);
        tone(base * 1.26, 0.2, 'square', vol * 0.8, 0.22);
      }
    },
    chime() {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 0.5, 'triangle', 0.09, i * 0.075));
    },
    fanfare() {
      [392, 523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => tone(f, 0.9, 'triangle', 0.1, i * 0.13));
    },
    blip() {
      tone(880, 0.14, 'sine', 0.08, 0, 1500);
    },
    meow() {
      tone(700, 0.28, 'sawtooth', 0.035, 0, 420);
    },
    pop() {
      tone(240, 0.09, 'sine', 0.1, 0, 90);
    },
    step() {
      tick(0.035, 900 + Math.random() * 500, 0.035);
    },
  };
}

export type GameAudio = ReturnType<typeof createAudio>;
