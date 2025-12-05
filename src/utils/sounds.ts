/**
 * Mechanical Sound System
 * 
 * Heavy, industrial sounds inspired by machinery, relays, and mechanical switches.
 * Each sound type corresponds to UI element weight/importance.
 * Uses Web Audio API for synthesized sounds - no external files needed.
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
 * Create a noise buffer for mechanical texture
 */
const createNoiseBuffer = (ctx: AudioContext, duration: number, type: 'white' | 'pink' | 'brown' = 'white'): AudioBuffer => {
  const sampleRate = ctx.sampleRate;
  const bufferSize = Math.floor(sampleRate * duration);
  const buffer = ctx.createBuffer(1, bufferSize, sampleRate);
  const data = buffer.getChannelData(0);
  
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  
  for (let i = 0; i < bufferSize; i++) {
    const white = Math.random() * 2 - 1;
    
    if (type === 'white') {
      data[i] = white;
    } else if (type === 'pink') {
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    } else { // brown
      data[i] = (b0 = (b0 + (0.02 * white)) / 1.02) * 3.5;
    }
  }
  
  return buffer;
};

/**
 * Heavy mechanical click - like a relay or large switch engaging
 * For large buttons, main actions
 */
export const playHeavyClick = async (): Promise<void> => {
  const ctx = await ensureAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  
  // Initial impact thunk (low frequency)
  const impactOsc = ctx.createOscillator();
  const impactGain = ctx.createGain();
  const impactFilter = ctx.createBiquadFilter();
  
  impactOsc.type = 'sine';
  impactOsc.frequency.setValueAtTime(120, now);
  impactOsc.frequency.exponentialRampToValueAtTime(40, now + 0.08);
  
  impactFilter.type = 'lowpass';
  impactFilter.frequency.value = 200;
  
  impactGain.gain.setValueAtTime(0.3, now);
  impactGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
  
  impactOsc.connect(impactFilter);
  impactFilter.connect(impactGain);
  impactGain.connect(ctx.destination);
  impactOsc.start(now);
  impactOsc.stop(now + 0.1);
  
  // Metal contact sound (high frequency click)
  const contactOsc = ctx.createOscillator();
  const contactGain = ctx.createGain();
  const contactFilter = ctx.createBiquadFilter();
  
  contactOsc.type = 'square';
  contactOsc.frequency.setValueAtTime(2800, now);
  contactOsc.frequency.exponentialRampToValueAtTime(800, now + 0.015);
  
  contactFilter.type = 'bandpass';
  contactFilter.frequency.value = 2000;
  contactFilter.Q.value = 2;
  
  contactGain.gain.setValueAtTime(0.12, now);
  contactGain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
  
  contactOsc.connect(contactFilter);
  contactFilter.connect(contactGain);
  contactGain.connect(ctx.destination);
  contactOsc.start(now);
  contactOsc.stop(now + 0.03);
  
  // Mechanical rattle noise
  const noiseBuffer = createNoiseBuffer(ctx, 0.06, 'brown');
  const noiseSource = ctx.createBufferSource();
  const noiseGain = ctx.createGain();
  const noiseFilter = ctx.createBiquadFilter();
  
  noiseSource.buffer = noiseBuffer;
  noiseFilter.type = 'bandpass';
  noiseFilter.frequency.value = 400;
  noiseFilter.Q.value = 3;
  
  noiseGain.gain.setValueAtTime(0.15, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
  
  noiseSource.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(ctx.destination);
  noiseSource.start(now);
};

/**
 * Medium mechanical click - like a button or smaller switch
 * For standard buttons and selectors
 */
export const playMediumClick = async (): Promise<void> => {
  const ctx = await ensureAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  
  // Click body
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  
  osc.type = 'square';
  osc.frequency.setValueAtTime(1200, now);
  osc.frequency.exponentialRampToValueAtTime(400, now + 0.025);
  
  filter.type = 'lowpass';
  filter.frequency.value = 3000;
  filter.Q.value = 1;
  
  gain.gain.setValueAtTime(0.15, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
  
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.04);
  
  // Light mechanical texture
  const noiseBuffer = createNoiseBuffer(ctx, 0.03, 'pink');
  const noiseSource = ctx.createBufferSource();
  const noiseGain = ctx.createGain();
  const noiseFilter = ctx.createBiquadFilter();
  
  noiseSource.buffer = noiseBuffer;
  noiseFilter.type = 'highpass';
  noiseFilter.frequency.value = 1500;
  
  noiseGain.gain.setValueAtTime(0.06, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);
  
  noiseSource.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(ctx.destination);
  noiseSource.start(now);
};

/**
 * Light mechanical click - small tactile buttons
 * For small UI elements, chips, tags
 */
export const playLightClick = async (): Promise<void> => {
  const ctx = await ensureAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(2200, now);
  osc.frequency.exponentialRampToValueAtTime(1000, now + 0.015);
  
  filter.type = 'bandpass';
  filter.frequency.value = 2500;
  filter.Q.value = 2;
  
  gain.gain.setValueAtTime(0.08, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);
  
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.025);
};

/**
 * Toggle switch ON - heavy industrial switch engaging
 */
export const playToggleOn = async (): Promise<void> => {
  const ctx = await ensureAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  
  // Switch mechanism sound
  const mechOsc = ctx.createOscillator();
  const mechGain = ctx.createGain();
  
  mechOsc.type = 'sawtooth';
  mechOsc.frequency.setValueAtTime(150, now);
  mechOsc.frequency.exponentialRampToValueAtTime(80, now + 0.04);
  
  mechGain.gain.setValueAtTime(0.12, now);
  mechGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
  
  mechOsc.connect(mechGain);
  mechGain.connect(ctx.destination);
  mechOsc.start(now);
  mechOsc.stop(now + 0.05);
  
  // Contact engage (higher pitched)
  const contactOsc = ctx.createOscillator();
  const contactGain = ctx.createGain();
  const contactFilter = ctx.createBiquadFilter();
  
  contactOsc.type = 'square';
  contactOsc.frequency.setValueAtTime(2400, now + 0.015);
  contactOsc.frequency.exponentialRampToValueAtTime(1200, now + 0.04);
  
  contactFilter.type = 'bandpass';
  contactFilter.frequency.value = 2000;
  contactFilter.Q.value = 4;
  
  contactGain.gain.setValueAtTime(0, now);
  contactGain.gain.linearRampToValueAtTime(0.1, now + 0.016);
  contactGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
  
  contactOsc.connect(contactFilter);
  contactFilter.connect(contactGain);
  contactGain.connect(ctx.destination);
  contactOsc.start(now + 0.015);
  contactOsc.stop(now + 0.05);
  
  // Metallic ping
  const pingOsc = ctx.createOscillator();
  const pingGain = ctx.createGain();
  
  pingOsc.type = 'sine';
  pingOsc.frequency.value = 1800;
  
  pingGain.gain.setValueAtTime(0, now + 0.02);
  pingGain.gain.linearRampToValueAtTime(0.04, now + 0.025);
  pingGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
  
  pingOsc.connect(pingGain);
  pingGain.connect(ctx.destination);
  pingOsc.start(now + 0.02);
  pingOsc.stop(now + 0.1);
};

/**
 * Toggle switch OFF - switch releasing
 */
export const playToggleOff = async (): Promise<void> => {
  const ctx = await ensureAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  
  // Switch mechanism (lower pitch for disengage)
  const mechOsc = ctx.createOscillator();
  const mechGain = ctx.createGain();
  
  mechOsc.type = 'sawtooth';
  mechOsc.frequency.setValueAtTime(100, now);
  mechOsc.frequency.exponentialRampToValueAtTime(50, now + 0.05);
  
  mechGain.gain.setValueAtTime(0.1, now);
  mechGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
  
  mechOsc.connect(mechGain);
  mechGain.connect(ctx.destination);
  mechOsc.start(now);
  mechOsc.stop(now + 0.06);
  
  // Contact release (descending)
  const contactOsc = ctx.createOscillator();
  const contactGain = ctx.createGain();
  
  contactOsc.type = 'square';
  contactOsc.frequency.setValueAtTime(1600, now + 0.01);
  contactOsc.frequency.exponentialRampToValueAtTime(600, now + 0.04);
  
  contactGain.gain.setValueAtTime(0, now);
  contactGain.gain.linearRampToValueAtTime(0.08, now + 0.012);
  contactGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
  
  contactOsc.connect(contactGain);
  contactGain.connect(ctx.destination);
  contactOsc.start(now + 0.01);
  contactOsc.stop(now + 0.05);
};

/**
 * Hover sound - subtle mechanical servo/motor whir
 */
export const playHover = async (): Promise<void> => {
  const ctx = await ensureAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  
  // Subtle servo whir
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(80, now);
  osc.frequency.linearRampToValueAtTime(120, now + 0.02);
  osc.frequency.linearRampToValueAtTime(90, now + 0.04);
  
  filter.type = 'bandpass';
  filter.frequency.value = 300;
  filter.Q.value = 8;
  
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.02, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
  
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.05);
};

/**
 * Input focus - electrical relay engaging
 */
export const playInputFocus = async (): Promise<void> => {
  const ctx = await ensureAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  
  // Electrical buzz/click
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  
  osc.type = 'square';
  osc.frequency.setValueAtTime(100, now);
  
  filter.type = 'lowpass';
  filter.frequency.value = 400;
  
  gain.gain.setValueAtTime(0.06, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
  
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.03);
  
  // High click
  const clickOsc = ctx.createOscillator();
  const clickGain = ctx.createGain();
  
  clickOsc.type = 'triangle';
  clickOsc.frequency.value = 3000;
  
  clickGain.gain.setValueAtTime(0.04, now);
  clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.015);
  
  clickOsc.connect(clickGain);
  clickGain.connect(ctx.destination);
  clickOsc.start(now);
  clickOsc.stop(now + 0.015);
};

/**
 * Input blur - relay disengaging
 */
export const playInputBlur = async (): Promise<void> => {
  const ctx = await ensureAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  
  osc.type = 'square';
  osc.frequency.setValueAtTime(80, now);
  osc.frequency.exponentialRampToValueAtTime(40, now + 0.03);
  
  gain.gain.setValueAtTime(0.04, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
  
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.04);
};

/**
 * Keystroke - typewriter key sound
 */
export const playKeystroke = async (): Promise<void> => {
  const ctx = await ensureAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  
  // Key strike
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  
  osc.type = 'square';
  osc.frequency.setValueAtTime(1800 + Math.random() * 400, now);
  osc.frequency.exponentialRampToValueAtTime(600, now + 0.01);
  
  filter.type = 'highpass';
  filter.frequency.value = 800;
  
  gain.gain.setValueAtTime(0.05, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.02);
  
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.02);
};

/**
 * Selection sound - like selecting an item from a mechanical display
 */
export const playSelect = async (): Promise<void> => {
  const ctx = await ensureAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  
  // Mechanical latch sound
  const latchOsc = ctx.createOscillator();
  const latchGain = ctx.createGain();
  
  latchOsc.type = 'square';
  latchOsc.frequency.setValueAtTime(800, now);
  latchOsc.frequency.exponentialRampToValueAtTime(300, now + 0.03);
  
  latchGain.gain.setValueAtTime(0.1, now);
  latchGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
  
  latchOsc.connect(latchGain);
  latchGain.connect(ctx.destination);
  latchOsc.start(now);
  latchOsc.stop(now + 0.04);
  
  // Confirmation tone
  const toneOsc = ctx.createOscillator();
  const toneGain = ctx.createGain();
  
  toneOsc.type = 'sine';
  toneOsc.frequency.value = 660;
  
  toneGain.gain.setValueAtTime(0, now + 0.02);
  toneGain.gain.linearRampToValueAtTime(0.06, now + 0.03);
  toneGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
  
  toneOsc.connect(toneGain);
  toneGain.connect(ctx.destination);
  toneOsc.start(now + 0.02);
  toneOsc.stop(now + 0.1);
};

/**
 * Success/Complete - heavy mechanical confirmation
 */
export const playSuccess = async (): Promise<void> => {
  const ctx = await ensureAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  
  // Heavy thunk
  const thunkOsc = ctx.createOscillator();
  const thunkGain = ctx.createGain();
  const thunkFilter = ctx.createBiquadFilter();
  
  thunkOsc.type = 'sine';
  thunkOsc.frequency.setValueAtTime(150, now);
  thunkOsc.frequency.exponentialRampToValueAtTime(60, now + 0.08);
  
  thunkFilter.type = 'lowpass';
  thunkFilter.frequency.value = 200;
  
  thunkGain.gain.setValueAtTime(0.25, now);
  thunkGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
  
  thunkOsc.connect(thunkFilter);
  thunkFilter.connect(thunkGain);
  thunkGain.connect(ctx.destination);
  thunkOsc.start(now);
  thunkOsc.stop(now + 0.12);
  
  // Ascending confirmation tones
  const tones = [440, 554, 659];
  tones.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.value = freq;
    
    const startTime = now + 0.05 + i * 0.06;
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.08, startTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.12);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + 0.12);
  });
};

/**
 * Error/Warning - mechanical alarm/buzzer
 */
export const playError = async (): Promise<void> => {
  const ctx = await ensureAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  
  // Harsh buzz
  const buzzOsc = ctx.createOscillator();
  const buzzGain = ctx.createGain();
  const buzzFilter = ctx.createBiquadFilter();
  
  buzzOsc.type = 'sawtooth';
  buzzOsc.frequency.value = 180;
  
  buzzFilter.type = 'bandpass';
  buzzFilter.frequency.value = 400;
  buzzFilter.Q.value = 5;
  
  buzzGain.gain.setValueAtTime(0.15, now);
  buzzGain.gain.setValueAtTime(0.02, now + 0.08);
  buzzGain.gain.setValueAtTime(0.15, now + 0.1);
  buzzGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
  
  buzzOsc.connect(buzzFilter);
  buzzFilter.connect(buzzGain);
  buzzGain.connect(ctx.destination);
  buzzOsc.start(now);
  buzzOsc.stop(now + 0.18);
};

/**
 * System init - machinery starting up
 */
export const playInit = async (): Promise<void> => {
  const ctx = await ensureAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  
  // Low rumble startup
  const rumbleOsc = ctx.createOscillator();
  const rumbleGain = ctx.createGain();
  const rumbleFilter = ctx.createBiquadFilter();
  
  rumbleOsc.type = 'sawtooth';
  rumbleOsc.frequency.setValueAtTime(30, now);
  rumbleOsc.frequency.linearRampToValueAtTime(60, now + 0.3);
  
  rumbleFilter.type = 'lowpass';
  rumbleFilter.frequency.value = 150;
  
  rumbleGain.gain.setValueAtTime(0, now);
  rumbleGain.gain.linearRampToValueAtTime(0.1, now + 0.1);
  rumbleGain.gain.linearRampToValueAtTime(0.05, now + 0.3);
  rumbleGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
  
  rumbleOsc.connect(rumbleFilter);
  rumbleFilter.connect(rumbleGain);
  rumbleGain.connect(ctx.destination);
  rumbleOsc.start(now);
  rumbleOsc.stop(now + 0.4);
  
  // Relay clicks sequence
  const clickTimes = [0.15, 0.22, 0.28, 0.33];
  clickTimes.forEach((time) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'square';
    osc.frequency.setValueAtTime(1500, now + time);
    osc.frequency.exponentialRampToValueAtTime(500, now + time + 0.02);
    
    gain.gain.setValueAtTime(0.08, now + time);
    gain.gain.exponentialRampToValueAtTime(0.001, now + time + 0.025);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now + time);
    osc.stop(now + time + 0.025);
  });
  
  // Final power-on tone
  const powerOsc = ctx.createOscillator();
  const powerGain = ctx.createGain();
  
  powerOsc.type = 'sine';
  powerOsc.frequency.value = 880;
  
  powerGain.gain.setValueAtTime(0, now + 0.35);
  powerGain.gain.linearRampToValueAtTime(0.1, now + 0.4);
  powerGain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
  
  powerOsc.connect(powerGain);
  powerGain.connect(ctx.destination);
  powerOsc.start(now + 0.35);
  powerOsc.stop(now + 0.6);
};

/**
 * Log entry sound - teletype/dot matrix printer
 */
export const playLogEntry = async (): Promise<void> => {
  const ctx = await ensureAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  
  // Quick mechanical tick
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  
  osc.type = 'square';
  osc.frequency.setValueAtTime(1000 + Math.random() * 500, now);
  osc.frequency.exponentialRampToValueAtTime(400, now + 0.008);
  
  filter.type = 'bandpass';
  filter.frequency.value = 1200;
  filter.Q.value = 3;
  
  gain.gain.setValueAtTime(0.04, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.015);
  
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.015);
};

/**
 * Scroll/wheel sound - like turning a mechanical dial
 */
export const playScroll = async (): Promise<void> => {
  const ctx = await ensureAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  
  // Detent click
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(600, now);
  osc.frequency.exponentialRampToValueAtTime(300, now + 0.01);
  
  gain.gain.setValueAtTime(0.03, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.015);
  
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.015);
};

/**
 * Favorite/heart toggle sound
 */
export const playFavorite = async (add: boolean): Promise<void> => {
  const ctx = await ensureAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  
  if (add) {
    // Stamp/punch sound for adding
    const punchOsc = ctx.createOscillator();
    const punchGain = ctx.createGain();
    
    punchOsc.type = 'square';
    punchOsc.frequency.setValueAtTime(200, now);
    punchOsc.frequency.exponentialRampToValueAtTime(80, now + 0.05);
    
    punchGain.gain.setValueAtTime(0.15, now);
    punchGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    
    punchOsc.connect(punchGain);
    punchGain.connect(ctx.destination);
    punchOsc.start(now);
    punchOsc.stop(now + 0.08);
    
    // Satisfying click
    const clickOsc = ctx.createOscillator();
    const clickGain = ctx.createGain();
    
    clickOsc.type = 'sine';
    clickOsc.frequency.value = 1200;
    
    clickGain.gain.setValueAtTime(0.08, now + 0.02);
    clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    
    clickOsc.connect(clickGain);
    clickGain.connect(ctx.destination);
    clickOsc.start(now + 0.02);
    clickOsc.stop(now + 0.06);
  } else {
    // Release/spring sound for removing
    const springOsc = ctx.createOscillator();
    const springGain = ctx.createGain();
    
    springOsc.type = 'sine';
    springOsc.frequency.setValueAtTime(400, now);
    springOsc.frequency.exponentialRampToValueAtTime(150, now + 0.04);
    
    springGain.gain.setValueAtTime(0.08, now);
    springGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    
    springOsc.connect(springGain);
    springGain.connect(ctx.destination);
    springOsc.start(now);
    springOsc.stop(now + 0.06);
  }
};

/**
 * GPS/Location acquire sound
 */
export const playLocate = async (): Promise<void> => {
  const ctx = await ensureAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  
  // Scanning/seeking sound
  for (let i = 0; i < 3; i++) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.value = 800 + i * 200;
    
    const startTime = now + i * 0.08;
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.06, startTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.06);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + 0.06);
  }
};

// Legacy compatibility wrapper
export const playClick = async (variant: 'soft' | 'medium' | 'heavy' = 'medium'): Promise<void> => {
  switch (variant) {
    case 'soft':
      return playLightClick();
    case 'heavy':
      return playHeavyClick();
    default:
      return playMediumClick();
  }
};

export const playToggle = async (on: boolean): Promise<void> => {
  return on ? playToggleOn() : playToggleOff();
};

// Export a default object for convenience
const Sounds = {
  // New mechanical sounds
  heavyClick: playHeavyClick,
  mediumClick: playMediumClick,
  lightClick: playLightClick,
  toggleOn: playToggleOn,
  toggleOff: playToggleOff,
  hover: playHover,
  inputFocus: playInputFocus,
  inputBlur: playInputBlur,
  keystroke: playKeystroke,
  select: playSelect,
  success: playSuccess,
  error: playError,
  init: playInit,
  logEntry: playLogEntry,
  scroll: playScroll,
  favorite: playFavorite,
  locate: playLocate,
  // Legacy compatibility
  click: playClick,
  toggle: playToggle,
};

export default Sounds;
