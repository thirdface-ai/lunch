/**
 * Sound System - Dieter Rams Inspired
 * 
 * "Less, but better."
 * 
 * These sounds follow Rams' principles:
 * - Unobtrusive: Just enough feedback, nothing more
 * - Honest: Sound matches the action's actual weight
 * - Aesthetic: Warm, precise, not harsh
 * - Thorough: Every detail considered
 * - Minimal: As little as possible, but no less
 * 
 * Inspired by the tactile feedback of Braun products:
 * calculators, radios, clocks, hi-fi equipment.
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
 * Soft click - like a quality button on a Braun calculator
 * For small UI elements: tags, small buttons, list items
 */
export const playSoftClick = async (): Promise<void> => {
  const ctx = await ensureAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  
  // Warm, soft click - sine wave for smoothness
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  
  osc.type = 'sine';
  osc.frequency.setValueAtTime(1800, now);
  osc.frequency.exponentialRampToValueAtTime(1200, now + 0.015);
  
  // Very gentle - just enough to notice
  gain.gain.setValueAtTime(0.04, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);
  
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.025);
};

/**
 * Medium click - like a dial detent on a Braun radio
 * For standard buttons, selections
 */
export const playMediumClick = async (): Promise<void> => {
  const ctx = await ensureAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  
  // Clean click with slight warmth
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  
  osc.type = 'triangle'; // Softer than square, more character than sine
  osc.frequency.setValueAtTime(1400, now);
  osc.frequency.exponentialRampToValueAtTime(800, now + 0.02);
  
  // Gentle lowpass to remove harshness
  filter.type = 'lowpass';
  filter.frequency.value = 3000;
  
  gain.gain.setValueAtTime(0.06, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
  
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.035);
};

/**
 * Firm click - like pressing power on a Braun device
 * For primary actions, important buttons
 */
export const playFirmClick = async (): Promise<void> => {
  const ctx = await ensureAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  
  // Two-layer sound: body + attack
  
  // Body - warm low-mid tone
  const bodyOsc = ctx.createOscillator();
  const bodyGain = ctx.createGain();
  
  bodyOsc.type = 'sine';
  bodyOsc.frequency.setValueAtTime(400, now);
  bodyOsc.frequency.exponentialRampToValueAtTime(200, now + 0.04);
  
  bodyGain.gain.setValueAtTime(0.08, now);
  bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
  
  bodyOsc.connect(bodyGain);
  bodyGain.connect(ctx.destination);
  bodyOsc.start(now);
  bodyOsc.stop(now + 0.06);
  
  // Attack - clean high click
  const attackOsc = ctx.createOscillator();
  const attackGain = ctx.createGain();
  
  attackOsc.type = 'sine';
  attackOsc.frequency.value = 1600;
  
  attackGain.gain.setValueAtTime(0.05, now);
  attackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.02);
  
  attackOsc.connect(attackGain);
  attackGain.connect(ctx.destination);
  attackOsc.start(now);
  attackOsc.stop(now + 0.02);
};

/**
 * Toggle on - like engaging a Braun switch
 * Ascending tone suggests activation
 */
export const playToggleOn = async (): Promise<void> => {
  const ctx = await ensureAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  
  osc.type = 'sine';
  // Gentle ascending pitch
  osc.frequency.setValueAtTime(600, now);
  osc.frequency.exponentialRampToValueAtTime(900, now + 0.04);
  
  gain.gain.setValueAtTime(0.05, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
  
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.06);
};

/**
 * Toggle off - switch disengaging
 * Descending tone suggests deactivation
 */
export const playToggleOff = async (): Promise<void> => {
  const ctx = await ensureAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  
  osc.type = 'sine';
  // Gentle descending pitch
  osc.frequency.setValueAtTime(800, now);
  osc.frequency.exponentialRampToValueAtTime(500, now + 0.04);
  
  gain.gain.setValueAtTime(0.04, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
  
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.05);
};

/**
 * Hover - barely perceptible, like feeling a texture
 * Should be felt more than heard
 */
export const playHover = async (): Promise<void> => {
  const ctx = await ensureAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  
  osc.type = 'sine';
  osc.frequency.value = 2000;
  
  // Extremely subtle
  gain.gain.setValueAtTime(0.012, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.02);
  
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.02);
};

/**
 * Input focus - subtle acknowledgment
 * Like the quiet click when touching a precision instrument
 */
export const playInputFocus = async (): Promise<void> => {
  const ctx = await ensureAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  
  osc.type = 'sine';
  osc.frequency.value = 1200;
  
  gain.gain.setValueAtTime(0.03, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);
  
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.025);
};

/**
 * Input blur - even more subtle
 */
export const playInputBlur = async (): Promise<void> => {
  const ctx = await ensureAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  
  osc.type = 'sine';
  osc.frequency.setValueAtTime(1000, now);
  osc.frequency.exponentialRampToValueAtTime(800, now + 0.02);
  
  gain.gain.setValueAtTime(0.02, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);
  
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.025);
};

/**
 * Select - confirming a choice
 * Clean, satisfying, not celebratory
 */
export const playSelect = async (): Promise<void> => {
  const ctx = await ensureAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  
  // Simple two-tone confirmation
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  
  osc.type = 'sine';
  osc.frequency.setValueAtTime(800, now);
  osc.frequency.setValueAtTime(1000, now + 0.04);
  
  gain.gain.setValueAtTime(0.05, now);
  gain.gain.setValueAtTime(0.05, now + 0.04);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
  
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.08);
};

/**
 * Success - task completed
 * Understated satisfaction, not fanfare
 */
export const playSuccess = async (): Promise<void> => {
  const ctx = await ensureAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  
  // Simple ascending two-note motif
  const notes = [523, 659]; // C5, E5 - a pleasant third
  
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.value = freq;
    
    const startTime = now + i * 0.08;
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.06, startTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.12);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + 0.12);
  });
};

/**
 * Error - something went wrong
 * Informative, not alarming
 */
export const playError = async (): Promise<void> => {
  const ctx = await ensureAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  
  // Descending two notes - signals "no" without being harsh
  const notes = [440, 349]; // A4, F4
  
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.value = freq;
    
    const startTime = now + i * 0.1;
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.05, startTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.1);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + 0.1);
  });
};

/**
 * Init - system starting
 * Like powering on a Braun device - quiet confidence
 */
export const playInit = async (): Promise<void> => {
  const ctx = await ensureAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  
  // Gentle warm-up tone
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  
  osc.type = 'sine';
  osc.frequency.setValueAtTime(200, now);
  osc.frequency.exponentialRampToValueAtTime(400, now + 0.15);
  
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(300, now);
  filter.frequency.exponentialRampToValueAtTime(1200, now + 0.15);
  
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.06, now + 0.05);
  gain.gain.linearRampToValueAtTime(0.04, now + 0.15);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
  
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.25);
  
  // Subtle "ready" click at the end
  const clickOsc = ctx.createOscillator();
  const clickGain = ctx.createGain();
  
  clickOsc.type = 'sine';
  clickOsc.frequency.value = 1000;
  
  clickGain.gain.setValueAtTime(0, now + 0.18);
  clickGain.gain.linearRampToValueAtTime(0.04, now + 0.19);
  clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
  
  clickOsc.connect(clickGain);
  clickGain.connect(ctx.destination);
  clickOsc.start(now + 0.18);
  clickOsc.stop(now + 0.22);
};

/**
 * Log entry - like a soft printer tick or clock tick
 * Regular, rhythmic, unobtrusive
 */
export const playLogEntry = async (): Promise<void> => {
  const ctx = await ensureAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  
  osc.type = 'sine';
  // Slight variation for organic feel
  osc.frequency.value = 1000 + Math.random() * 100;
  
  gain.gain.setValueAtTime(0.025, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.015);
  
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.015);
};

/**
 * Favorite - adding something to collection
 * Warm, personal, not dramatic
 */
export const playFavorite = async (add: boolean): Promise<void> => {
  const ctx = await ensureAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  
  osc.type = 'sine';
  
  if (add) {
    // Warm ascending
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(800, now + 0.05);
    gain.gain.setValueAtTime(0.05, now);
  } else {
    // Gentle descending
    osc.frequency.setValueAtTime(700, now);
    osc.frequency.exponentialRampToValueAtTime(500, now + 0.04);
    gain.gain.setValueAtTime(0.04, now);
  }
  
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
  
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.06);
};

/**
 * Split-flap display - airport departure board rattling
 * Rapid clicking like mechanical letter cards flipping
 */
export const playSplitFlap = async (): Promise<void> => {
  const ctx = await ensureAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  
  // Create rapid clicking sequence like split-flap letters rotating
  const clickCount = 12 + Math.floor(Math.random() * 8); // 12-20 clicks
  const totalDuration = 0.4 + Math.random() * 0.2; // 400-600ms total
  const interval = totalDuration / clickCount;
  
  for (let i = 0; i < clickCount; i++) {
    const clickTime = now + i * interval;
    
    // Each flap is a quick mechanical tick
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    
    osc.type = 'square';
    // Slight pitch variation for organic feel
    const basePitch = 800 + Math.random() * 400;
    osc.frequency.setValueAtTime(basePitch, clickTime);
    osc.frequency.exponentialRampToValueAtTime(basePitch * 0.5, clickTime + 0.008);
    
    // Bandpass for that plastic/mechanical character
    filter.type = 'bandpass';
    filter.frequency.value = 1200 + Math.random() * 600;
    filter.Q.value = 2;
    
    // Quick attack, fast decay
    // Volume decreases slightly toward the end (settling)
    const volumeMultiplier = i < clickCount - 3 ? 1 : (clickCount - i) / 3;
    gain.gain.setValueAtTime(0.035 * volumeMultiplier, clickTime);
    gain.gain.exponentialRampToValueAtTime(0.001, clickTime + 0.012);
    
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start(clickTime);
    osc.stop(clickTime + 0.012);
  }
  
  // Final settling click (the letter landing in place)
  const settleTime = now + totalDuration + 0.02;
  const settleOsc = ctx.createOscillator();
  const settleGain = ctx.createGain();
  
  settleOsc.type = 'triangle';
  settleOsc.frequency.setValueAtTime(600, settleTime);
  settleOsc.frequency.exponentialRampToValueAtTime(300, settleTime + 0.025);
  
  settleGain.gain.setValueAtTime(0.05, settleTime);
  settleGain.gain.exponentialRampToValueAtTime(0.001, settleTime + 0.04);
  
  settleOsc.connect(settleGain);
  settleGain.connect(ctx.destination);
  settleOsc.start(settleTime);
  settleOsc.stop(settleTime + 0.04);
};

/**
 * Locate - acquiring position
 * Three gentle pings, like sonar but softer
 */
export const playLocate = async (): Promise<void> => {
  const ctx = await ensureAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  
  // Three ascending pings
  [0, 0.08, 0.16].forEach((delay, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.value = 600 + i * 100;
    
    const startTime = now + delay;
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.04, startTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.05);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + 0.05);
  });
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
  // Primary sounds
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
  // Aliases
  lightClick: playSoftClick,
  heavyClick: playFirmClick,
  click: playClick,
  toggle: playToggle,
};

export default Sounds;
