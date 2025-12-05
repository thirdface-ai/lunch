/**
 * Sound System - Dieter Rams Inspired
 * 
 * "Less, but better."
 * 
 * Deep, warm, minimal sounds. Only when necessary.
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

const ensureAudioContext = async (): Promise<AudioContext | null> => {
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') {
    await ctx.resume();
  }
  return ctx;
};

/**
 * Soft click - deep, warm
 */
export const playSoftClick = async (): Promise<void> => {
  const ctx = await ensureAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  
  osc.type = 'sine';
  osc.frequency.setValueAtTime(180, now);
  osc.frequency.exponentialRampToValueAtTime(80, now + 0.04);
  
  gain.gain.setValueAtTime(0.08, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
  
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.06);
};

/**
 * Medium click - deeper thunk
 */
export const playMediumClick = async (): Promise<void> => {
  const ctx = await ensureAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  
  osc.type = 'sine';
  osc.frequency.setValueAtTime(120, now);
  osc.frequency.exponentialRampToValueAtTime(50, now + 0.05);
  
  filter.type = 'lowpass';
  filter.frequency.value = 300;
  
  gain.gain.setValueAtTime(0.12, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
  
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.08);
};

/**
 * Firm click - heavy, deep thunk
 */
export const playFirmClick = async (): Promise<void> => {
  const ctx = await ensureAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  
  // Deep body
  const bodyOsc = ctx.createOscillator();
  const bodyGain = ctx.createGain();
  
  bodyOsc.type = 'sine';
  bodyOsc.frequency.setValueAtTime(80, now);
  bodyOsc.frequency.exponentialRampToValueAtTime(35, now + 0.08);
  
  bodyGain.gain.setValueAtTime(0.15, now);
  bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
  
  bodyOsc.connect(bodyGain);
  bodyGain.connect(ctx.destination);
  bodyOsc.start(now);
  bodyOsc.stop(now + 0.12);
  
  // Subtle attack
  const attackOsc = ctx.createOscillator();
  const attackGain = ctx.createGain();
  
  attackOsc.type = 'sine';
  attackOsc.frequency.value = 200;
  
  attackGain.gain.setValueAtTime(0.06, now);
  attackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
  
  attackOsc.connect(attackGain);
  attackGain.connect(ctx.destination);
  attackOsc.start(now);
  attackOsc.stop(now + 0.03);
};

/**
 * Toggle on - deep ascending
 */
export const playToggleOn = async (): Promise<void> => {
  const ctx = await ensureAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  
  osc.type = 'sine';
  osc.frequency.setValueAtTime(60, now);
  osc.frequency.exponentialRampToValueAtTime(120, now + 0.06);
  
  gain.gain.setValueAtTime(0.1, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
  
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.1);
};

/**
 * Toggle off - deep descending
 */
export const playToggleOff = async (): Promise<void> => {
  const ctx = await ensureAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  
  osc.type = 'sine';
  osc.frequency.setValueAtTime(100, now);
  osc.frequency.exponentialRampToValueAtTime(45, now + 0.06);
  
  gain.gain.setValueAtTime(0.08, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
  
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.1);
};

/**
 * Hover - disabled/no-op (only used for special cases)
 */
export const playHover = async (): Promise<void> => {
  // No hover sounds
};

/**
 * Input focus - subtle deep click
 */
export const playInputFocus = async (): Promise<void> => {
  const ctx = await ensureAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  
  osc.type = 'sine';
  osc.frequency.value = 150;
  
  gain.gain.setValueAtTime(0.05, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
  
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.04);
};

/**
 * Input blur - very subtle
 */
export const playInputBlur = async (): Promise<void> => {
  const ctx = await ensureAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  
  osc.type = 'sine';
  osc.frequency.setValueAtTime(120, now);
  osc.frequency.exponentialRampToValueAtTime(70, now + 0.03);
  
  gain.gain.setValueAtTime(0.03, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
  
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.04);
};

/**
 * Select - deep confirmation
 */
export const playSelect = async (): Promise<void> => {
  const ctx = await ensureAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  
  osc.type = 'sine';
  osc.frequency.setValueAtTime(80, now);
  osc.frequency.setValueAtTime(120, now + 0.05);
  
  gain.gain.setValueAtTime(0.08, now);
  gain.gain.setValueAtTime(0.08, now + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
  
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.12);
};

/**
 * Success - deep two-note
 */
export const playSuccess = async (): Promise<void> => {
  const ctx = await ensureAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  
  const notes = [80, 120]; // Deep C and E
  
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.value = freq;
    
    const startTime = now + i * 0.1;
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.1, startTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.15);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + 0.15);
  });
};

/**
 * Error - deep descending
 */
export const playError = async (): Promise<void> => {
  const ctx = await ensureAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  
  const notes = [100, 60];
  
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.value = freq;
    
    const startTime = now + i * 0.12;
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.08, startTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.12);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + 0.12);
  });
};

/**
 * Init - deep warm-up
 */
export const playInit = async (): Promise<void> => {
  const ctx = await ensureAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  
  osc.type = 'sine';
  osc.frequency.setValueAtTime(30, now);
  osc.frequency.exponentialRampToValueAtTime(80, now + 0.2);
  
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(60, now);
  filter.frequency.exponentialRampToValueAtTime(200, now + 0.2);
  
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.12, now + 0.08);
  gain.gain.linearRampToValueAtTime(0.08, now + 0.2);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
  
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.3);
};

/**
 * Log entry - deep tick
 */
export const playLogEntry = async (): Promise<void> => {
  const ctx = await ensureAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  
  osc.type = 'sine';
  osc.frequency.value = 100 + Math.random() * 30;
  
  gain.gain.setValueAtTime(0.04, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);
  
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.025);
};

/**
 * Favorite - deep pulse
 */
export const playFavorite = async (add: boolean): Promise<void> => {
  const ctx = await ensureAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  
  osc.type = 'sine';
  
  if (add) {
    osc.frequency.setValueAtTime(60, now);
    osc.frequency.exponentialRampToValueAtTime(100, now + 0.06);
    gain.gain.setValueAtTime(0.1, now);
  } else {
    osc.frequency.setValueAtTime(90, now);
    osc.frequency.exponentialRampToValueAtTime(50, now + 0.06);
    gain.gain.setValueAtTime(0.07, now);
  }
  
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
  
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.1);
};

/**
 * Locate - deep pings
 */
export const playLocate = async (): Promise<void> => {
  const ctx = await ensureAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  
  [0, 0.1, 0.2].forEach((delay, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.value = 60 + i * 20;
    
    const startTime = now + delay;
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.07, startTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.08);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + 0.08);
  });
};

/**
 * Split-flap display - deep mechanical rattling
 */
export const playSplitFlap = async (): Promise<void> => {
  const ctx = await ensureAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  
  const clickCount = 12 + Math.floor(Math.random() * 8);
  const totalDuration = 0.4 + Math.random() * 0.2;
  const interval = totalDuration / clickCount;
  
  for (let i = 0; i < clickCount; i++) {
    const clickTime = now + i * interval;
    
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    
    osc.type = 'square';
    // Much deeper frequencies
    const basePitch = 80 + Math.random() * 40;
    osc.frequency.setValueAtTime(basePitch, clickTime);
    osc.frequency.exponentialRampToValueAtTime(basePitch * 0.5, clickTime + 0.015);
    
    filter.type = 'lowpass';
    filter.frequency.value = 200;
    
    const volumeMultiplier = i < clickCount - 3 ? 1 : (clickCount - i) / 3;
    gain.gain.setValueAtTime(0.06 * volumeMultiplier, clickTime);
    gain.gain.exponentialRampToValueAtTime(0.001, clickTime + 0.02);
    
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start(clickTime);
    osc.stop(clickTime + 0.02);
  }
  
  // Deep settling thunk
  const settleTime = now + totalDuration + 0.02;
  const settleOsc = ctx.createOscillator();
  const settleGain = ctx.createGain();
  
  settleOsc.type = 'sine';
  settleOsc.frequency.setValueAtTime(80, settleTime);
  settleOsc.frequency.exponentialRampToValueAtTime(40, settleTime + 0.04);
  
  settleGain.gain.setValueAtTime(0.1, settleTime);
  settleGain.gain.exponentialRampToValueAtTime(0.001, settleTime + 0.08);
  
  settleOsc.connect(settleGain);
  settleGain.connect(ctx.destination);
  settleOsc.start(settleTime);
  settleOsc.stop(settleTime + 0.08);
};

// Convenience aliases
export const playLightClick = playSoftClick;
export const playHeavyClick = playFirmClick;

export const playClick = async (variant: 'soft' | 'medium' | 'heavy' = 'medium'): Promise<void> => {
  switch (variant) {
    case 'soft':
      return playSoftClick();
    case 'heavy':
      return playFirmClick();
    default:
      return playMediumClick();
  }
};

export const playToggle = async (on: boolean): Promise<void> => {
  return on ? playToggleOn() : playToggleOff();
};

// Default export
const Sounds = {
  softClick: playSoftClick,
  mediumClick: playMediumClick,
  firmClick: playFirmClick,
  toggleOn: playToggleOn,
  toggleOff: playToggleOff,
  hover: playHover,
  inputFocus: playInputFocus,
  inputBlur: playInputBlur,
  select: playSelect,
  success: playSuccess,
  error: playError,
  init: playInit,
  logEntry: playLogEntry,
  favorite: playFavorite,
  locate: playLocate,
  splitFlap: playSplitFlap,
  lightClick: playSoftClick,
  heavyClick: playFirmClick,
  click: playClick,
  toggle: playToggle,
};

export default Sounds;
