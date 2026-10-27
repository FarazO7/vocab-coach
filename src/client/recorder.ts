import { DEFAULTS } from "../config/defaults";

const TYPES = ["audio/webm;codecs=opus", "audio/mp4"]; // brief §7, in order
const MIN_TAP_MS = 300;

export const IN_APP_REASON = "Open in Chrome or Safari for voice. Text mode works here.";

export function pickMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  return TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? null;
}

/** Null when voice can work here; otherwise the one-line reason to show (brief §7 in-app browsers). */
export function voiceUnsupportedReason(): string | null {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return IN_APP_REASON;
  return pickMimeType() ? null : IN_APP_REASON;
}

export function openMic(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
}

export function micErrorReason(e: unknown): string {
  const name = e instanceof Error ? e.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "Microphone access is blocked, so this session uses typing.";
  if (name === "NotFoundError") return "No microphone was found, so this session uses typing.";
  return "The microphone isn't available, so this session uses typing.";
}

/** Tap to start, tap to stop. Taps under 0.3 s are ignored; recording stops itself at 45 s. */
export class Recorder {
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private stream: MediaStream,
    private mimeType: string,
    private onAutoStop: () => void,
  ) {}

  get recording(): boolean {
    return this.rec?.state === "recording";
  }

  start(): void {
    this.chunks = [];
    this.rec = new MediaRecorder(this.stream, { mimeType: this.mimeType });
    this.rec.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.rec.start();
    this.startedAt = performance.now();
    this.timer = setTimeout(this.onAutoStop, DEFAULTS.maxRecordingS * 1000);
  }

  stop(): Promise<{ blob: Blob; ms: number } | null> {
    if (this.timer) clearTimeout(this.timer);
    const rec = this.rec;
    if (!rec || rec.state !== "recording") return Promise.resolve(null);
    return new Promise((resolve) => {
      rec.onstop = () => {
        const ms = performance.now() - this.startedAt;
        resolve(ms < MIN_TAP_MS ? null : { blob: new Blob(this.chunks, { type: rec.mimeType || this.mimeType }), ms });
      };
      rec.stop();
    });
  }

  /** Brief §7: stop the tracks at the end. */
  close(): void {
    if (this.timer) clearTimeout(this.timer);
    if (this.rec?.state === "recording") this.rec.stop();
    for (const t of this.stream.getTracks()) t.stop();
  }
}
