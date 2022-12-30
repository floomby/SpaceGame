import { addLoadingText, getMusicVolumePref, getVolumePref } from "./globals";

let ctx: AudioContext;
let effectVolume: GainNode;
let musicVolume: GainNode;

const soundBuffers: AudioBuffer[] = [];

const sounds = [
  "fire0.wav",
  "explosion0.wav",
  "laser0.wav",
  "laser1.wav",
  "launch0.wav",
  "pop0.wav",
  "twinkle0.wav",
  "dullPew0.wav",
  "disabled0.wav",
  "mineDrop0.wav",
  "squishyPew0.wav",
  "squishyPew1.wav",
  "wigglyThud0.wav",
  "resonantPew0.wav",
  "tractor0.wav",
  "empWindup.wav",
  "empDetonation.wav",
  "music/combat.mp3",
  "music/peace.mp3",
  "music/peaceAlt.mp3",
];

const soundMap: Map<string, number> = new Map<string, number>();

for (let i = 0; i < sounds.length; i++) {
  soundMap.set(sounds[i], i);
}

// load a sound and return a promise
const loadSound = (url: string) => {
  return fetch(url)
    .then((response) => response.arrayBuffer())
    .then((arrayBuffer) => ctx.decodeAudioData(arrayBuffer));
};

let soundInitialized = false;
let soundsStartedInPeriod = 0;

const initSound = () => {
  if (soundInitialized) {
    return;
  }
  soundInitialized = true;
  setInterval(() => {
    soundsStartedInPeriod = 0;
  }, 100);

  ctx = new AudioContext();

  effectVolume = ctx.createGain();
  effectVolume.connect(ctx.destination);
  const volumePref = getVolumePref();
  effectVolume.gain.value = volumePref ?? 0.5;

  musicVolume = ctx.createGain();
  musicVolume.connect(ctx.destination);
  const musicVolumePref = getMusicVolumePref();
  musicVolume.gain.value = musicVolumePref ?? 0.5;

  const promises: Promise<AudioBuffer>[] = sounds.map((sound) => `resources/sounds/${sound}`).map(loadSound);

  Promise.all(promises).then((buffers) => {
    buffers.forEach((buffer) => soundBuffers.push(buffer));
    initMusic();
  }).catch((e) => {
    console.error(e);
  });
};

const setVolume = (value: number) => {
  localStorage.setItem("volume", JSON.stringify(value));
  effectVolume.gain.value = value;
};

const getVolume = () => {
  return effectVolume.gain.value;
};

const setMusicVolume = (value: number) => {
  localStorage.setItem("musicVolume", JSON.stringify(value));
  musicVolume.gain.value = value;
};

const getMusicVolume = () => {
  return musicVolume.gain.value;
};

const playSound = (index: number, gain = 1.0) => {
  if (!ctx || index < 0 || index >= soundBuffers.length) {
    console.log(ctx ? `Invalid sound index ${index}` : "Sound not initialized");
    return;
  }
  const source = ctx.createBufferSource();
  source.buffer = soundBuffers[index];

  const gainNode = ctx.createGain();
  gainNode.gain.value = gain * 4.0;
  gainNode.connect(effectVolume);

  source.connect(gainNode);
  source.start(0);
};

const play3dSound = (index: number, x: number, y: number, gain = 0.8, important = false) => {
  if (!ctx || index < 0 || index >= soundBuffers.length) {
    console.log(ctx ? `Invalid sound index ${index}` : "Sound not initialized");
    return undefined;
  }
  if (soundsStartedInPeriod > 5 && !important) {
    return undefined;
  }
  soundsStartedInPeriod++;

  const source = ctx.createBufferSource();
  source.buffer = soundBuffers[index];
  const panner = ctx.createPanner();
  panner.distanceModel = "exponential";

  panner.positionX.value = x;
  panner.positionY.value = y;
  panner.positionZ.value = 10;

  const gainNode = ctx.createGain();
  gainNode.gain.value = gain * 4.0;

  source.connect(gainNode);
  gainNode.connect(panner);
  panner.connect(effectVolume);
  source.start(0);
  return panner;
};

type Music = {
  source: AudioBufferSourceNode;
  gain: GainNode;
};

const createMusic = (index: number) => {
  const source = ctx.createBufferSource();
  source.buffer = soundBuffers[index];
  source.loop = true;
  const gain = ctx.createGain();
  gain.gain.value = 0.5;
  source.connect(gain);
  gain.connect(musicVolume);
  return { source, gain };
};

const fadeInMusic = (music: Music, duration: number) => {
  const start = ctx.currentTime;
  const end = start + duration;
  music.gain.gain.setValueAtTime(0, start);
  music.gain.gain.linearRampToValueAtTime(0.5, end);
};

const fadeOutMusic = (music: Music, duration: number) => {
  const start = ctx.currentTime;
  const end = start + duration;
  music.gain.gain.setValueAtTime(0.5, start);
  music.gain.gain.linearRampToValueAtTime(0, end);
  setInterval(() => {
    music.source.stop();
  }, duration * 1000);
};

const playMusic = (index: number) => {
  const music = createMusic(index);
  fadeInMusic(music, 1);
  music.source.start(0);
  return music;
};  

const stopMusic = (music: Music) => {
  music.source.stop();
};

let peace: Music;
let combat: Music;

let musicPoller = () => false;
let currentTrackState = false;

const setMusicAdaptationPollFunction = (fx: () => boolean) => {
  musicPoller = fx;
};

const initMusic = () => {
  peace = playMusic(soundMap.get("music/peace.mp3")!);
  setInterval(() => {
    const desired = musicPoller();
    if (desired === null) {
      return;
    }
    if (desired !== currentTrackState) {
      if (desired) {
        fadeOutMusic(peace, 1);
        combat = playMusic(soundMap.get("music/combat.mp3")!);
      } else {
        fadeOutMusic(combat, 1);
        if (Math.random() < 0.5) {
          peace = playMusic(soundMap.get("music/peace.mp3")!);
        } else {
          peace = playMusic(soundMap.get("music/peaceAlt.mp3")!);
        }
      }
    }
    currentTrackState = desired;
  }, 3000);
};

const getSound = (name: string) => {
  const ret = soundMap.get(name);
  if (ret === undefined) {
    console.log(`Sound ${name} not found`);
  }
  return ret;
};

const soundScale = 100;

export {
  initSound,
  playSound,
  play3dSound,
  soundScale,
  setVolume,
  getVolume,
  setMusicVolume,
  getMusicVolume,
  soundMap,
  getSound,
  setMusicAdaptationPollFunction,
};
