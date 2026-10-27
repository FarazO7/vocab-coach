/** Brief §7 barge-in: keep only what was heard, cut at a word boundary, by played-time fraction. */
export function truncatePlayed(text: string, fraction: number): string {
  if (fraction >= 0.97) return text;
  const words = text.split(/\s+/).filter(Boolean);
  const n = Math.max(0, Math.min(words.length, Math.round(words.length * fraction)));
  return n === 0 ? "" : `${words.slice(0, n).join(" ")}...`;
}

export interface PlayOutcome {
  stopped: boolean;
  fraction: number; // share of the audio that was played
}

export interface PlayerLike {
  unlock(): void;
  play(res: Response, rate: number, onFirstAudio: () => void): Promise<PlayOutcome>;
  replay(rate: number): Promise<PlayOutcome> | null;
  stop(): void;
}

// 0.05 s of silence, used to unlock the audio element inside the Start tap (iOS Safari autoplay rules).
function silentWav(): string {
  const samples = 1102;
  const buf = new DataView(new ArrayBuffer(44 + samples * 2));
  const str = (o: number, s: string) => [...s].forEach((c, i) => buf.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  buf.setUint32(4, 36 + samples * 2, true);
  str(8, "WAVEfmt ");
  buf.setUint32(16, 16, true);
  buf.setUint16(20, 1, true);
  buf.setUint16(22, 1, true);
  buf.setUint32(24, 22050, true);
  buf.setUint32(28, 44100, true);
  buf.setUint16(32, 2, true);
  buf.setUint16(34, 16, true);
  str(36, "data");
  buf.setUint32(40, samples * 2, true);
  return URL.createObjectURL(new Blob([buf.buffer], { type: "audio/wav" }));
}

type MediaSourceCtor = typeof MediaSource;

function streamingSource(): MediaSourceCtor | null {
  const w = window as unknown as { ManagedMediaSource?: MediaSourceCtor; MediaSource?: MediaSourceCtor };
  const ctor = w.ManagedMediaSource ?? w.MediaSource;
  return ctor && typeof ctor.isTypeSupported === "function" && ctor.isTypeSupported("audio/mpeg") ? ctor : null;
}

const appendChunk = (sb: SourceBuffer, chunk: Uint8Array) =>
  new Promise<void>((resolve, reject) => {
    sb.addEventListener("updateend", () => resolve(), { once: true });
    sb.addEventListener("error", () => reject(new Error("append failed")), { once: true });
    sb.appendBuffer(chunk as BufferSource);
  });

/**
 * One reused <audio> element. Audio starts as soon as the first MP3 bytes arrive (MediaSource,
 * or ManagedMediaSource on iOS 17.1+); elsewhere it falls back to playing the downloaded file.
 */
export class Player implements PlayerLike {
  private el: HTMLAudioElement | null = null;
  private last: Blob | null = null;
  private url: string | null = null;
  private finish: ((o: PlayOutcome) => void) | null = null;
  private cancelled = false;

  /** Created on first use, so constructing a Player is safe during server rendering. */
  private get audio(): HTMLAudioElement {
    if (!this.el) {
      this.el = new Audio();
      this.el.preload = "auto";
      this.el.addEventListener("ended", () => this.done({ stopped: false, fraction: 1 }));
    }
    return this.el;
  }

  unlock(): void {
    this.setSrc(silentWav());
    this.audio.play().catch((e: unknown) => console.warn("audio unlock refused:", e instanceof Error ? e.name : e));
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctx) {
      const ctx = new Ctx();
      void ctx.resume();
      const src = ctx.createBufferSource();
      src.buffer = ctx.createBuffer(1, 1, 22050);
      src.connect(ctx.destination);
      src.start(0);
    }
  }

  private setSrc(url: string): void {
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = url;
    this.audio.src = url;
  }

  private done(o: PlayOutcome): void {
    const f = this.finish;
    this.finish = null;
    f?.(o);
  }

  private begin(rate: number, onFirstAudio: () => void): void {
    this.audio.playbackRate = rate;
    this.audio.defaultPlaybackRate = rate;
    this.audio.addEventListener("playing", onFirstAudio, { once: true });
    this.audio.play().catch((e: unknown) => {
      console.warn("audio play refused:", e instanceof Error ? e.name : e);
      this.done({ stopped: true, fraction: 0 });
    });
  }

  async play(res: Response, rate: number, onFirstAudio: () => void): Promise<PlayOutcome> {
    this.stop();
    this.cancelled = false;
    const outcome = new Promise<PlayOutcome>((resolve) => (this.finish = resolve));
    const chunks: Uint8Array[] = [];
    const Source = streamingSource();
    if (Source && res.body) {
      const ms = new Source();
      this.audio.disableRemotePlayback = true; // required by ManagedMediaSource
      this.setSrc(URL.createObjectURL(ms));
      await new Promise((r) => ms.addEventListener("sourceopen", r, { once: true }));
      const sb = ms.addSourceBuffer("audio/mpeg");
      sb.mode = "sequence";
      const reader = res.body.getReader();
      let started = false;
      for (;;) {
        const { done, value } = await reader.read();
        if (done || this.cancelled) break;
        chunks.push(value);
        await appendChunk(sb, value);
        if (!started) {
          started = true;
          this.begin(rate, onFirstAudio);
        }
      }
      if (this.cancelled) void reader.cancel();
      else if (ms.readyState === "open") ms.endOfStream();
    } else {
      const blob = await res.blob();
      chunks.push(new Uint8Array(await blob.arrayBuffer()));
      if (!this.cancelled) {
        this.setSrc(URL.createObjectURL(blob));
        this.begin(rate, onFirstAudio);
      }
    }
    this.last = new Blob(chunks as BlobPart[], { type: "audio/mpeg" });
    return outcome;
  }

  /** Repeat slower (brief §7): the last reply again, no new API call. */
  replay(rate: number): Promise<PlayOutcome> | null {
    if (!this.last) return null;
    this.stop();
    this.cancelled = false;
    const outcome = new Promise<PlayOutcome>((resolve) => (this.finish = resolve));
    this.setSrc(URL.createObjectURL(this.last));
    this.begin(rate, () => undefined);
    return outcome;
  }

  /** Barge-in: stop at once and report how much was heard. */
  stop(): void {
    this.cancelled = true;
    const a = this.el;
    if (!a) return;
    const total = Number.isFinite(a.duration) && a.duration > 0 ? a.duration : a.buffered.length ? a.buffered.end(a.buffered.length - 1) : 0;
    const fraction = total > 0 ? Math.min(1, a.currentTime / total) : 0;
    a.pause();
    this.done({ stopped: true, fraction });
  }
}
