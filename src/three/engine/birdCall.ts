/**
 * The birds' "cui-cui", synthesised rather than loaded: two short rising
 * chirps from an oscillator pair. A couple of hundred bytes of code
 * instead of an audio asset to fetch, decode and cache — and it can be
 * detuned slightly per call so repeats don't sound like the same sample
 * played twice.
 */

/** Seconds between the two chirps of one call. */
const CHIRP_GAP_S = 0.13;
const CHIRP_LENGTH_S = 0.1;
/** Deliberately quiet: this is ambience under a page, not a notification. */
const PEAK_GAIN = 0.045;
const BASE_FREQUENCY_HZ = 2150;

export interface BirdCall {
  /** No-ops silently until audio is available and unlocked. */
  play: () => void;
  dispose: () => void;
}

/**
 * Browsers refuse to start audio before the user has interacted with the
 * page, so the context is created on the first real gesture and every
 * call before that is simply dropped — a chirp is ambience, never worth
 * warning about or retrying. `play()` is likewise a no-op if the context
 * isn't running (a background tab suspends it), so nothing queues up to
 * fire in a burst when the tab comes back.
 */
export function createBirdCall(): BirdCall {
  let context: AudioContext | null = null;
  let disposed = false;

  const unlock = () => {
    if (disposed || context) return;
    if (typeof window.AudioContext !== "function") return;
    context = new window.AudioContext();
    void context.resume().catch(() => {});
  };

  const events = ["pointerdown", "touchstart", "keydown"] as const;
  for (const event of events) {
    window.addEventListener(event, unlock, { passive: true });
  }

  return {
    play: () => {
      if (!context || context.state !== "running") return;
      const start = context.currentTime;
      // Two notes a beat apart, the second a touch higher — "cui-cui".
      chirp(context, start, BASE_FREQUENCY_HZ * detune());
      chirp(context, start + CHIRP_GAP_S, BASE_FREQUENCY_HZ * 1.08 * detune());
    },
    dispose: () => {
      disposed = true;
      for (const event of events) window.removeEventListener(event, unlock);
      void context?.close().catch(() => {});
      context = null;
    },
  };
}

/** ±6%, so no two calls are quite identical. */
function detune(): number {
  return 0.94 + Math.random() * 0.12;
}

function chirp(context: AudioContext, start: number, frequency: number): void {
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = "triangle";
  // Swoop up then settle — the shape that reads as a bird rather than a
  // beep. Exponential ramps throughout, so they can never target zero:
  // hence the tiny non-zero floor either side of the envelope.
  oscillator.frequency.setValueAtTime(frequency * 0.82, start);
  oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.22, start + 0.035);
  oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.96, start + CHIRP_LENGTH_S);

  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(PEAK_GAIN, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + CHIRP_LENGTH_S);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + CHIRP_LENGTH_S + 0.02);
}
