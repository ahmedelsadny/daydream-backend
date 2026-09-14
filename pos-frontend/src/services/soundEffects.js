/**
 * Web Audio Synthesizer for Authentic Supermarket POS Audio Feedback
 * Generates crisp scanner beeps, error buzzers, and cash register chimes
 * directly in code with 0ms latency and no external MP3 dependencies.
 */

class PosSoundEffects {
  constructor() {
    this.ctx = null;
  }

  initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  /**
   * Crisp High-Pitch Barcode Scanner Beep (1700Hz, 70ms)
   */
  playScanBeep() {
    try {
      this.initContext();
      if (!this.ctx) return;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1750, this.ctx.currentTime);

      gain.gain.setValueAtTime(0.18, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.07);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.07);
    } catch (e) {
      console.warn('Audio playback not allowed or supported:', e);
    }
  }

  /**
   * Double Low-Pitch Error / Unknown Item Buzzer (220Hz)
   */
  playErrorBuzz() {
    try {
      this.initContext();
      if (!this.ctx) return;

      const playTone = (timeOffset) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, this.ctx.currentTime + timeOffset);

        gain.gain.setValueAtTime(0.2, this.ctx.currentTime + timeOffset);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + timeOffset + 0.12);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(this.ctx.currentTime + timeOffset);
        osc.stop(this.ctx.currentTime + timeOffset + 0.12);
      };

      playTone(0);
      playTone(0.16);
    } catch (e) {
      console.warn('Audio playback error:', e);
    }
  }

  /**
   * Cash Register Drawer Opening Bell / Chime (Major Triad Chord: C5, E5, G5)
   */
  playCashChime() {
    try {
      this.initContext();
      if (!this.ctx) return;

      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
      notes.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime + idx * 0.05);

        gain.gain.setValueAtTime(0.15, this.ctx.currentTime + idx * 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + idx * 0.05 + 0.45);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(this.ctx.currentTime + idx * 0.05);
        osc.stop(this.ctx.currentTime + idx * 0.05 + 0.45);
      });
    } catch (e) {
      console.warn('Audio playback error:', e);
    }
  }
}

export const soundEffects = new PosSoundEffects();
