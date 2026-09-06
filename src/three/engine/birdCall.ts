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
 * warning about or retrying.
 *
 * Every gesture retries, rather than only the first. A context created
 * during a gesture is not guaranteed to end up *running*: mobile
 * browsers routinely hand back a suspended one, and any browser suspends
 * it when the page goes to the background and leaves it suspended on
 * return. The original one-shot version created the context on the first
 * touch, and if that one came back suspended nothing ever tried again —
 * so the birds were silent on mobile for the rest of the visit while
 * working on the first click on desktop.
 */
export function createBirdCall(): BirdCall {
  let context: AudioContext | null = null;
  let disposed = false;

  const unlock = () => {
    if (disposed) return;
    if (typeof window.AudioContext !== "function") return;
    if (!context) context = new window.AudioContext();
    // Cheap and safe to call on an already-running context.
    if (context.state !== "running") void context.resume().catch(() => {});
  };

  // touchend/click as well as the down events: on mobile the reliable
  // activation point is the end of a tap, not its beginning — a touch
  // that turns into a pan or a pinch (which is most of them here, see
  // CameraController) may never settle into the tap the browser counts
  // as a deliberate interaction.
  const events = ["pointerdown", "touchstart", "touchend", "click", "keydown"] as const;
  for (const event of events) {
    window.addEventListener(event, unlock, { passive: true });
  }

  // Coming back to a backgrounded tab needs no fresh gesture — the
  // earlier activation still counts — but it does need someone to ask.
  const handleVisibility = () => {
    if (document.visibilityState === "visible") unlock();
  };
  document.addEventListener("visibilitychange", handleVisibility);

  return {
    play: () => {
      if (!context) return;
      if (context.state !== "running") {
        // Nudge it, and let the next flock be the one that's heard
        // rather than firing into a suspended context.
        void context.resume().catch(() => {});
        return;
      }
      const start = context.currentTime;
      // Two notes a beat apart, the second a touch higher — "cui-cui".
      chirp(context, start, BASE_FREQUENCY_HZ * detune());
      chirp(context, start + CHIRP_GAP_S, BASE_FREQUENCY_HZ * 1.08 * detune());
    },
    dispose: () => {
      disposed = true;
      for (const event of events) window.removeEventListener(event, unlock);
      document.removeEventListener("visibilitychange", handleVisibility);
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
