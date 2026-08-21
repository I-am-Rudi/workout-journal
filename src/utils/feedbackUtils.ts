import { Platform } from "obsidian";

/**
 * Best-effort vibration + beep feedback shared by the session views.
 * Owns a lazily created AudioContext that must be released with `dispose()`.
 */
export class FeedbackPlayer {
  private audioContext: AudioContext | null = null;

  trigger(
    vibrateEnabled: boolean,
    soundEnabled: boolean,
    vibrationPattern: number | number[],
    frequency: number,
    gainPeak: number,
    durationSeconds: number
  ): void {
    if (
      vibrateEnabled &&
      Platform.isMobile &&
      typeof navigator !== "undefined" &&
      "vibrate" in navigator
    ) {
      navigator.vibrate(vibrationPattern);
    }

    if (!soundEnabled || typeof window === "undefined") {
      return;
    }

    try {
      const AudioContextClass: typeof AudioContext | undefined = window.AudioContext;
      if (!AudioContextClass) {
        return;
      }
      if (!this.audioContext || this.audioContext.state === "closed") {
        this.audioContext = new AudioContextClass();
      }
      const audioContext = this.audioContext;
      if (audioContext.state === "suspended") {
        void audioContext.resume();
      }
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      const minGainValue = 0.0001;
      const attackTimeSeconds = 0.01;
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
      gainNode.gain.setValueAtTime(minGainValue, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(
        gainPeak,
        audioContext.currentTime + attackTimeSeconds
      );
      gainNode.gain.exponentialRampToValueAtTime(
        minGainValue,
        audioContext.currentTime + durationSeconds
      );
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + durationSeconds);
    } catch {
      // no-op: feedback is best-effort only
    }
  }

  dispose(): void {
    if (this.audioContext) {
      void this.audioContext.close();
      this.audioContext = null;
    }
  }
}
