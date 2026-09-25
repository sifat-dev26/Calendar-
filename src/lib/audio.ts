import { NotificationTone } from '../types';

export const NOTIFICATION_TONES: { id: NotificationTone; name: string }[] = [
  { id: 'chime', name: 'Standard Chime' },
  { id: 'beep', name: 'Digital Beep' },
  { id: 'zen', name: 'Zen Bell' },
  { id: 'arcade', name: 'Retro Arcade' },
  { id: 'pulse', name: 'Soft Pulse' },
  { id: 'ping', name: 'Cosmic Ping' },
  { id: 'double', name: 'Double Alert' },
  { id: 'chirp', name: 'Morning Chirp' },
  { id: 'click', name: 'Minimal Click' },
  { id: 'siren', name: 'Urgent Siren' },
];

let globalAudioContext: AudioContext | null = null;

function getAudioContext() {
  if (!globalAudioContext) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      globalAudioContext = new AudioContextClass();
    }
  }
  return globalAudioContext;
}

/**
 * Unlocks the audio context by playing a silent sound.
 * This must be called from a user-initiated event (click, touch, etc.).
 */
export function unlockAudio() {
  const ctx = getAudioContext();
  if (!ctx) return;

  if (ctx.state === 'suspended') {
    ctx.resume();
  }

  // Play silence to fully unlock on iOS
  const buffer = ctx.createBuffer(1, 1, 22050);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.start(0);
}

export function playNotificationSound(tone: NotificationTone) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    // Always try to resume if suspended (some browsers might re-suspend)
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const playOscillator = (
      type: OscillatorType,
      freq: number,
      startTime: number,
      duration: number,
      startGain: number,
      endGain: number = 0.001,
      rampType: 'linear' | 'exponential' = 'exponential'
    ) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(startGain, startTime);
      if (rampType === 'exponential') {
        gain.gain.exponentialRampToValueAtTime(endGain, startTime + duration);
      } else {
        gain.gain.linearRampToValueAtTime(endGain, startTime + duration);
      }
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + duration + 0.05);
      return { osc, gain };
    };

    switch (tone) {
      case 'chime': // Standard Chime (Dual high-pitch sine)
        playOscillator('sine', 880.00, ctx.currentTime, 0.4, 0.08);
        playOscillator('sine', 1174.66, ctx.currentTime + 0.12, 0.6, 0.08);
        break;

      case 'beep': // Digital Beep (Quick square wave)
        playOscillator('square', 440, ctx.currentTime, 0.1, 0.03);
        break;

      case 'zen': // Zen Bell (Slow decaying sine wave)
        playOscillator('sine', 329.63, ctx.currentTime, 2.0, 0.1);
        playOscillator('sine', 659.25, ctx.currentTime, 1.5, 0.05);
        break;

      case 'arcade': // Retro Arcade (Arpeggio effect)
        [440, 554, 659, 880].forEach((f, i) => {
          playOscillator('square', f, ctx.currentTime + i * 0.08, 0.1, 0.03);
        });
        break;

      case 'pulse': // Soft Pulse (Low-frequency gentle beep)
        playOscillator('sine', 220, ctx.currentTime, 0.3, 0.1, 0.001, 'linear');
        break;

      case 'ping': // Cosmic Ping (High frequency echo)
        playOscillator('sine', 1760, ctx.currentTime, 0.1, 0.05);
        playOscillator('sine', 1760, ctx.currentTime + 0.2, 0.05, 0.02);
        playOscillator('sine', 1760, ctx.currentTime + 0.4, 0.05, 0.01);
        break;

      case 'double': // Double Alert (Two rapid short pulses)
        playOscillator('triangle', 523.25, ctx.currentTime, 0.08, 0.08);
        playOscillator('triangle', 523.25, ctx.currentTime + 0.15, 0.08, 0.08);
        break;

      case 'chirp': // Morning Chirp (Frequency modulation sweep)
        {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(800, ctx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(1600, ctx.currentTime + 0.2);
          gain.gain.setValueAtTime(0.05, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 0.25);
        }
        break;

      case 'click': // Minimal Click (Ultra-short transient pop)
        playOscillator('sine', 2000, ctx.currentTime, 0.01, 0.05);
        break;

      case 'siren': // Urgent Siren (Alternating pitch loop)
        for (let i = 0; i < 3; i++) {
          const start = ctx.currentTime + i * 0.4;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(400, start);
          osc.frequency.linearRampToValueAtTime(600, start + 0.2);
          osc.frequency.linearRampToValueAtTime(400, start + 0.4);
          gain.gain.setValueAtTime(0.05, start);
          gain.gain.linearRampToValueAtTime(0.05, start + 0.35);
          gain.gain.linearRampToValueAtTime(0.001, start + 0.4);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(start);
          osc.stop(start + 0.45);
        }
        break;

      default:
        playOscillator('sine', 880, ctx.currentTime, 0.4, 0.08);
    }
  } catch (err) {
    console.error("Audio Context playback failed:", err);
  }
}
