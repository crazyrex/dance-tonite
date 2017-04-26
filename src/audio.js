import fetch from 'unfetch';
import emitter from 'mitt';
import audioPool from './utils/audio-pool';
import feature from './utils/feature';

let context;
let source;
let gainNode;
let loopCount;
let duration = 0;
let lastTime = 0;
let startTime;
let audioElement;
const ZERO = 1e-25;
let request;
let onPlay;

const audio = Object.assign(emitter(), {
  fill() {
    audioPool.fill();
  },

  tick() {
    const currentTime = audioElement
      ? audioElement.currentTime
      : (context.currentTime - startTime);
    const time = this.time = (currentTime) % duration;
    const { loopDuration } = this;

    // The position within the track as a multiple of loopDuration:
    this.progress = time / loopDuration;

    // The position within the individual loop as a value between 0 - 1:
    this.loopProgress = (time % loopDuration) / loopDuration;

    // True when the audio looped, false otherwise:
    this.looped = time < lastTime;

    if (this.looped) {
      // The index of the loop, used when the audio has more than one loops:
      this.loopIndex = Math.floor(this.progress * loopCount);
      this.loopCount++;
    }

    this.totalProgress = this.loopCount * loopCount + this.progress;
    lastTime = time;
  },

  async load(param, callback) {
    context = new AudioContext();
    gainNode = context.createGain();

    // Reset time, set loop count
    lastTime = 0;
    loopCount = param.loops === undefined
      ? 1
      : param.loops;
    this.loopCount = 0;
    const canPlay = () => {
      this.loopDuration = duration / loopCount;
      startTime = context.currentTime;

      context.suspend();

      if (callback) callback(null, param.src);

      audio.emit('load', param.src);
    };

    if (param.progressive) {
      audioElement = audioPool.get();
      source = context.createMediaElementSource(audioElement);
      audioElement.src = param.src;
      audioElement.loop = true;
      onPlay = () => {
        duration = audioElement.duration;
        audioElement.play();
        canPlay();
      };
      if (feature.isMobile) {
        audioElement.play();
      }
      audioElement.addEventListener('canplaythrough', onPlay);
    } else {
      source = context.createBufferSource();

      let response;
      try {
        response = await fetch(param.src);
      } catch (err) {
        callback(err);
      }
      const buffer = await response.arrayBuffer();

      context.decodeAudioData(
        buffer,
        decodedBuffer => {
          source.buffer = decodedBuffer;
          duration = source.buffer.duration;
          source.loop = true;
          source.start(0);
          canPlay();
        }
      );
    }

    source.connect(gainNode);
    gainNode.connect(context.destination);
  },

  play() {
    if (context) context.resume();
  },

  pause() {
    if (context) context.suspend();
  },

  reset() {
    if (context) {
      context.close();
      context = null;
    }
    // Cancel loading of audioElement:
    if (audioElement) {
      audioElement.removeEventListener('canplaythrough', onPlay);
      audioPool.release(audioElement);
      audioElement = null;
      onPlay = null;
    }
    if (request) {
      request.abort();
      request.onload = null;
      request = null;
    }
  },

  rewind() {
    if (audioElement) {
      audioElement.currentTime = 0;
      gainNode.gain.value = 1;
    }
  },

  fadeOut(callback) {
    if (!context) return;
    const fadeDuration = 2;
    // Fade out the music in 2 seconds
    gainNode.gain.exponentialRampToValueAtTime(
      ZERO,
      context.currentTime + fadeDuration,
    );

    if (callback) {
      setTimeout(callback, fadeDuration * 1000);
    }
    audio.emit('faded-out');
  },

  time: 0,
  loopIndex: 0,
});

export default audio;
