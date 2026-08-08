// 🔊 REAL WEB AUDIO SFX SOUND ENGINE FOR MOTION GRAPHICS
// Loads and plays real MP3/OGG files from the assets folder.

class MotionSFXEngine {
  constructor() {
    this.masterVolume = 0.7;
    this.muted = false;
    this.audioCache = {};
  }

  setVolume(vol) {
    this.masterVolume = Math.max(0, Math.min(1, vol));
  }

  // Preload audio so there's no delay on play
  preload(filename) {
    if (!this.audioCache[filename]) {
      const audio = new Audio(`assets/sfx/${filename}`);
      audio.preload = 'auto';
      this.audioCache[filename] = audio;
    }
  }

  // Play a specific real sound file
  play(filename) {
    if (this.muted) return;
    this.preload(filename);
    const audio = this.audioCache[filename].cloneNode();
    audio.volume = this.masterVolume;
    audio.play().catch(e => console.warn('SFX play prevented:', e));
  }

  // Legacy compat methods mapping to real sounds
  playWhoosh() { this.play('drop_001.ogg'); }
  playPop() { this.play('click1.ogg'); }
  playGlitch() { this.play('error_001.ogg'); }
  playChime() { this.play('confirmation_001.ogg'); }
  playClick() { this.play('click2.ogg'); }

  // Play SFX by key name. `clipVolume` (0..1) is the individual clip's level from the
  // timeline inspector; it scales the master volume for this one hit only. Without it
  // every effect played at the master level and the per-clip slider was decorative.
  playSFX(sfxType, clipVolume) {
    const master = this.masterVolume;
    if (clipVolume != null && !isNaN(clipVolume)) {
      this.masterVolume = master * Math.max(0, Math.min(1, clipVolume));
    }
    try {
      if (sfxType === 'whoosh') this.playWhoosh();
      else if (sfxType === 'pop') this.playPop();
      else if (sfxType === 'glitch') this.playGlitch();
      else if (sfxType === 'chime') this.playChime();
      else if (sfxType === 'click') this.playClick();
    } finally {
      // The play* methods read masterVolume synchronously when scheduling their envelope,
      // so restoring here cannot clip a sound that is still sounding.
      this.masterVolume = master;
    }
  }
}

window.sfxEngine = new MotionSFXEngine();
