// Procedural Web Audio API Sound Synthesizer (Zero external audio files required)

class SoundSynth {
    constructor() {
        this.ctx = null;
        this.muted = false;
        this.noiseBuffer = null;
        this.lastImpactAt = 0;
    }

    ensureContext() {
        if (this.muted) return null;
        if (!this.ctx) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return null;
            this.ctx = new AudioCtx();
            this.noiseBuffer = this.createNoiseBuffer(1.5);
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume().catch(() => {});
        }
        return this.ctx;
    }

    createNoiseBuffer(seconds) {
        const rate = this.ctx.sampleRate;
        const length = Math.floor(rate * seconds);
        const buf = this.ctx.createBuffer(1, length, rate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < length; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        return buf;
    }

    toggleMute() {
        this.muted = !this.muted;
        return this.muted;
    }

    uiClick() {
        const ctx = this.ensureContext();
        if (!ctx) return;
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(680, now);
        osc.frequency.exponentialRampToValueAtTime(240, now + 0.045);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.05);
    }

    fireWeapon(wepId = 0) {
        const ctx = this.ensureContext();
        if (!ctx) return;
        const now = ctx.currentTime;

        if (wepId === 2) {
            // Singularity plasma launch
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(190, now);
            osc.frequency.exponentialRampToValueAtTime(640, now + 0.14);
            osc.frequency.exponentialRampToValueAtTime(110, now + 0.32);
            gain.gain.setValueAtTime(0.16, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);
            osc.connect(gain).connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 0.35);
            return;
        }

        // Cannon sub punch
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        const startFreq = wepId === 3 ? 130 : 175;
        osc.frequency.setValueAtTime(startFreq, now);
        osc.frequency.exponentialRampToValueAtTime(34, now + 0.24);
        gain.gain.setValueAtTime(0.28, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.27);

        // Breech transient burst
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(wepId === 1 ? 750 : 1100, now);
        filter.Q.value = 1.2;
        const nGain = ctx.createGain();
        nGain.gain.setValueAtTime(0.2, now);
        nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        src.connect(filter).connect(nGain).connect(ctx.destination);
        src.start(now);
        src.stop(now + 0.15);
    }

    explode(intensity = 1.0) {
        const ctx = this.ensureContext();
        if (!ctx) return;
        const now = ctx.currentTime;
        const dur = Math.min(0.85, 0.42 + intensity * 0.25);

        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(520 * Math.min(1.4, intensity), now);
        filter.frequency.exponentialRampToValueAtTime(55, now + dur);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(Math.min(0.38, 0.24 * intensity), now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
        src.connect(filter).connect(gain).connect(ctx.destination);
        src.start(now);
        src.stop(now + dur + 0.02);

        const sub = ctx.createOscillator();
        const subGain = ctx.createGain();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(95, now);
        sub.frequency.exponentialRampToValueAtTime(24, now + dur * 0.85);
        subGain.gain.setValueAtTime(Math.min(0.35, 0.25 * intensity), now);
        subGain.gain.exponentialRampToValueAtTime(0.001, now + dur * 0.85);
        sub.connect(subGain).connect(ctx.destination);
        sub.start(now);
        sub.stop(now + dur);
    }

    singularityVortex(durationSec = 2.0) {
        const ctx = this.ensureContext();
        if (!ctx) return;
        const now = ctx.currentTime;

        const osc = ctx.createOscillator();
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        const mainGain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(72, now);
        osc.frequency.exponentialRampToValueAtTime(195, now + durationSec);

        lfo.type = 'sine';
        lfo.frequency.setValueAtTime(9, now);
        lfo.frequency.linearRampToValueAtTime(22, now + durationSec);
        lfoGain.gain.value = 26;

        mainGain.gain.setValueAtTime(0.01, now);
        mainGain.gain.linearRampToValueAtTime(0.16, now + 0.25);
        mainGain.gain.setValueAtTime(0.16, now + Math.max(0.26, durationSec - 0.18));
        mainGain.gain.exponentialRampToValueAtTime(0.001, now + durationSec);

        lfo.connect(lfoGain).connect(osc.frequency);
        osc.connect(mainGain).connect(ctx.destination);

        osc.start(now);
        lfo.start(now);
        osc.stop(now + durationSec + 0.02);
        lfo.stop(now + durationSec + 0.02);
    }

    impact(material = 'stone', speed = 6) {
        const ctx = this.ensureContext();
        if (!ctx) return;
        const perfNow = performance.now();
        if (perfNow - this.lastImpactAt < 38) return;
        this.lastImpactAt = perfNow;

        const now = ctx.currentTime;
        const vol = Math.min(0.22, Math.max(0.03, (speed - 3.5) * 0.018));

        if (material === 'steel' || material === 'bumper') {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            const base = material === 'bumper' ? 320 : 820;
            osc.frequency.setValueAtTime(base, now);
            osc.frequency.exponentialRampToValueAtTime(material === 'bumper' ? 660 : 410, now + 0.12);
            gain.gain.setValueAtTime(vol, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
            osc.connect(gain).connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 0.15);
            return;
        }

        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = material === 'wood' ? 420 : 210;
        filter.Q.value = material === 'wood' ? 3.2 : 1.5;

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(vol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
        src.connect(filter).connect(gain).connect(ctx.destination);
        src.start(now);
        src.stop(now + 0.1);
    }

    coreShatter() {
        const ctx = this.ensureContext();
        if (!ctx) return;
        const now = ctx.currentTime;
        const freqs = [880, 1174, 1568, 523];
        freqs.forEach((f, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(f, now + idx * 0.03);
            osc.frequency.exponentialRampToValueAtTime(f * 0.45, now + idx * 0.03 + 0.24);
            gain.gain.setValueAtTime(0.11, now + idx * 0.03);
            gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.03 + 0.25);
            osc.connect(gain).connect(ctx.destination);
            osc.start(now + idx * 0.03);
            osc.stop(now + idx * 0.03 + 0.26);
        });
    }

    victory() {
        const ctx = this.ensureContext();
        if (!ctx) return;
        const now = ctx.currentTime;
        const notes = [440, 554.37, 659.25, 880];
        notes.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            const t = now + i * 0.085;
            osc.frequency.setValueAtTime(freq, t);
            gain.gain.setValueAtTime(0.13, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.36);
            osc.connect(gain).connect(ctx.destination);
            osc.start(t);
            osc.stop(t + 0.38);
        });
    }
}

export const sound = new SoundSynth();
