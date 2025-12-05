/**
 * Sound System - Dieter Rams Inspired
 * 
 * Minimal, purposeful sounds that enhance the user experience
 * without being distracting. Uses Web Audio API for synthesized
 * sounds - no external files needed.
 */

// Audio context singleton
let audioContext: AudioContext | null = null;

const getAudioContext = (): AudioContext | null => {
  if (typeof window === 'undefined') return null;
  
  if (!audioContext) {
    try {
      audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch (e) {
      console.warn('Web Audio API not supported');
      return null;
    }
  }
  return audioContext;
};

// Resume audio context on user interaction (required by browsers)
const ensureAudioContext = async (): Promise<AudioContext | null> => {
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') {
    await ctx.resume();
  }
  return ctx;
};

/**
 * Play a subtle, satisfying click sound
 * Inspired by mechanical keyboard switches and Braun product interfaces
 */
export const playClick = async (variant: 'soft' | 'medium' | 'heavy' = 'medium'): Promise<void> => {
  const ctx = await ensureAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  
  // Create oscillator for the click
  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  
  // Configure based on variant
  const config = {
    soft: { freq: 1800, gain: 0.08, decay: 0.04, filterFreq: 2500 },
    medium: { freq: 1400, gain: 0.12, decay: 0.06, filterFreq: 3000 },
    heavy: { freq: 1000, gain: 0.15, decay: 0.08, filterFreq: 3500 },
  }[variant];
  
  // Set up filter for warmth
  filter.type = 'lowpass';
  filter.frequency.value = config.filterFreq;
  filter.Q.value = 1;
  
  // Oscillator settings - square wave for that mechanical feel
  osc.type = 'square';
  osc.frequency.setValueAtTime(config.freq, now);
  osc.frequency.exponentialRampToValueAtTime(config.freq * 0.5, now + config.decay);
  
  // Gain envelope - quick attack, fast decay
  gainNode.gain.setValueAtTime(0, now);
  gainNode.gain.linearRampToValueAtTime(config.gain, now + 0.002);
  gainNode.gain.exponentialRampToValueAtTime(0.001, now + config.decay);
  
  // Connect nodes
  osc.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(ctx.destination);
  
  // Play
  osc.start(now);
  osc.stop(now + config.decay + 0.01);
};

/**
 * Play a success/confirmation sound
 * Two-tone ascending sound for positive feedback
 */
export const playSuccess = async (): Promise<void> => {
  const ctx = await ensureAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  
  // First tone
  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.type = 'sine';
  osc1.frequency.value = 880;
  gain1.gain.setValueAtTime(0, now);
  gain1.gain.linearRampToValueAtTime(0.1, now + 0.01);
  gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
  osc1.connect(gain1);
  gain1.connect(ctx.destination);
  osc1.start(now);
  osc1.stop(now + 0.15);
  
  // Second tone (higher, delayed)
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = 'sine';
  osc2.frequency.value = 1320;
  gain2.gain.setValueAtTime(0, now + 0.08);
  gain2.gain.linearRampToValueAtTime(0.1, now + 0.09);
  gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
  osc2.connect(gain2);
  gain2.connect(ctx.destination);
  osc2.start(now + 0.08);
  osc2.stop(now + 0.25);
};

/**
 * Play a toggle/switch sound
 * Snappy, mechanical switch feel
 */
export const playToggle = async (on: boolean): Promise<void> => {
  const ctx = await ensureAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const freq = on ? 1600 : 1200;
  
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  filter.Q.value = 5;
  
  // Noise burst for mechanical feel
  const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.03, ctx.sampleRate);
  const noiseData = noiseBuffer.getChannelData(0);
  for (let i = 0; i < noiseData.length; i++) {
    noiseData[i] = (Math.random() * 2 - 1) * 0.3;
  }
  
  const noiseSource = ctx.createBufferSource();
  noiseSource.buffer = noiseBuffer;
  
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.08, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
  
  noiseSource.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(ctx.destination);
  
  noiseSource.start(now);
  noiseSource.stop(now + 0.03);
  
  // Tonal component
  osc.type = 'triangle';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.06, now + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
  
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.05);
};

/**
 * Play a hover sound (very subtle)
 */
export const playHover = async (): Promise<void> => {
  const ctx = await ensureAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  
  osc.type = 'sine';
  osc.frequency.value = 2400;
  
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.02, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
  
  osc.connect(gain);
  gain.connect(ctx.destination);
  
  osc.start(now);
  osc.stop(now + 0.04);
};

/**
 * Play initialization/startup sound
 * Futuristic boot sequence feel
 */
export const playInit = async (): Promise<void> => {
  const ctx = await ensureAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const frequencies = [440, 554, 659, 880];
  
  frequencies.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.value = freq;
    
    const startTime = now + i * 0.08;
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.08, startTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.15);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start(startTime);
    osc.stop(startTime + 0.15);
  });
};

// Export a default object for convenience
const Sounds = {
  click: playClick,
  success: playSuccess,
  toggle: playToggle,
  hover: playHover,
  init: playInit,
};

export default Sounds;
