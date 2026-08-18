type AudioListener = (state: {
  url: string | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
}) => void;

class GlobalAudioManager {
  private audio: HTMLAudioElement | null = null;
  private currentUrl: string | null = null;
  private listeners: Set<AudioListener> = new Set();

  constructor() {
    if (typeof window !== 'undefined') {
      this.audio = new Audio();
      this.audio.preload = 'auto';

      this.audio.addEventListener('timeupdate', () => this.notify());
      this.audio.addEventListener('loadedmetadata', () => this.notify());
      this.audio.addEventListener('durationchange', () => this.notify());
      this.audio.addEventListener('canplay', () => this.notify());
      this.audio.addEventListener('play', () => this.notify());
      this.audio.addEventListener('pause', () => this.notify());
      this.audio.addEventListener('ended', () => {
        if (this.audio) this.audio.currentTime = 0;
        this.notify();
      });
      this.audio.addEventListener('error', (e) => {
        console.warn('[GlobalAudio] Playback error:', e);
        this.notify();
      });
    }
  }

  public play(url: string) {
    if (!this.audio) return;

    if (this.currentUrl === url && !this.audio.paused && !this.audio.ended) {
      return;
    }

    if (this.currentUrl !== url) {
      this.currentUrl = url;
      this.audio.src = url;
      this.audio.load();
    } else if (this.audio.ended || (this.audio.duration && this.audio.currentTime >= this.audio.duration)) {
      this.audio.currentTime = 0;
    }

    this.audio.play().catch((err) => {
      console.warn('[GlobalAudio] Play error:', err);
    });
  }

  public pause() {
    if (this.audio && !this.audio.paused) {
      this.audio.pause();
    }
  }

  public toggle(url: string) {
    if (!this.audio) return;
    if (this.currentUrl === url && !this.audio.paused && !this.audio.ended) {
      this.pause();
    } else {
      this.play(url);
    }
  }

  public seek(seconds: number) {
    if (this.audio) {
      this.audio.currentTime = seconds;
      this.notify();
    }
  }

  public getState(forUrl?: string | null) {
    if (!this.audio || !this.currentUrl || (forUrl && this.currentUrl !== forUrl)) {
      return {
        url: this.currentUrl,
        isPlaying: false,
        currentTime: 0,
        duration: 0,
      };
    }

    return {
      url: this.currentUrl,
      isPlaying: !this.audio.paused && !this.audio.ended,
      currentTime: this.audio.currentTime || 0,
      duration: isFinite(this.audio.duration) ? this.audio.duration : 0,
    };
  }

  public subscribe(listener: AudioListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    const state = this.getState();
    this.listeners.forEach((l) => l(state));
  }
}

export const globalAudio = new GlobalAudioManager();
