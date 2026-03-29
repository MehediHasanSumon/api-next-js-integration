"use client";

type CallToneMode = "incoming" | "outgoing";

export interface CallToneController {
  play: (mode: CallToneMode) => void;
  stop: () => void;
  close: () => void;
}

interface TonePattern {
  frequency: number;
  durationMs: number;
  intervalMs: number;
}

const patterns: Record<CallToneMode, TonePattern> = {
  incoming: {
    frequency: 780,
    durationMs: 240,
    intervalMs: 1100,
  },
  outgoing: {
    frequency: 460,
    durationMs: 180,
    intervalMs: 1600,
  },
};

export const createCallToneController = (): CallToneController => {
  let audioContext: AudioContext | null = null;
  let activeMode: CallToneMode | null = null;
  let patternIntervalId: ReturnType<typeof setInterval> | null = null;
  let activeOscillator: OscillatorNode | null = null;
  let activeGainNode: GainNode | null = null;

  const ensureAudioContext = (): AudioContext | null => {
    if (typeof window === "undefined") {
      return null;
    }

    const BrowserAudioContext = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!BrowserAudioContext) {
      return null;
    }

    if (!audioContext) {
      audioContext = new BrowserAudioContext();
    }

    if (audioContext.state === "suspended") {
      void audioContext.resume().catch(() => undefined);
    }

    return audioContext;
  };

  const stopOscillator = () => {
    if (activeOscillator) {
      try {
        activeOscillator.stop();
      } catch {
        // Ignore stop errors for already-finished oscillators.
      }
      activeOscillator.disconnect();
      activeOscillator = null;
    }

    if (activeGainNode) {
      activeGainNode.disconnect();
      activeGainNode = null;
    }
  };

  const stop = () => {
    activeMode = null;

    if (patternIntervalId) {
      clearInterval(patternIntervalId);
      patternIntervalId = null;
    }

    stopOscillator();
  };

  const beep = (mode: CallToneMode) => {
    const context = ensureAudioContext();
    if (!context) {
      return;
    }

    stopOscillator();

    const pattern = patterns[mode];
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();

    oscillator.type = "sine";
    oscillator.frequency.value = pattern.frequency;
    gainNode.gain.value = mode === "incoming" ? 0.045 : 0.035;

    oscillator.connect(gainNode);
    gainNode.connect(context.destination);
    oscillator.start();

    activeOscillator = oscillator;
    activeGainNode = gainNode;

    window.setTimeout(() => {
      if (activeOscillator === oscillator) {
        stopOscillator();
      }
    }, pattern.durationMs);
  };

  return {
    play: (mode) => {
      if (activeMode === mode && patternIntervalId) {
        return;
      }

      stop();
      activeMode = mode;
      beep(mode);
      patternIntervalId = setInterval(() => {
        if (activeMode !== mode) {
          return;
        }

        beep(mode);
      }, patterns[mode].intervalMs);
    },
    stop,
    close: () => {
      stop();
      if (audioContext) {
        void audioContext.close().catch(() => undefined);
        audioContext = null;
      }
    },
  };
};
