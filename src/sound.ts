import { getVolumePref } from "./globals";

let ctx: AudioContext;
let volume: GainNode;

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
  volume = ctx.createGain();
  volume.connect(ctx.destination);
  const volumePref = getVolumePref();
  volume.gain.value = volumePref ?? 0.5;

  const promises: Promise<AudioBuffer>[] = sounds.map((sound) => `resources/sounds/${sound}`).map(loadSound);

  Promise.all(promises).then((buffers) => {
    buffers.forEach((buffer) => soundBuffers.push(buffer));
  });
};

const setVolume = (value: number) => {
  localStorage.setItem("volume", JSON.stringify(value));
  volume.gain.value = value;
};

const getVolume = () => {
  return volume.gain.value;
};

const playSound = (index: number) => {
  if (!ctx || index < 0 || index >= soundBuffers.length) {
    console.log(ctx ? `Invalid sound index ${index}` : "Sound not initialized");
    return;
  }
  const source = ctx.createBufferSource();
  source.buffer = soundBuffers[index];
  source.connect(volume);
  source.start(0);
};

const play3dSound = (index: number, x: number, y: number, gain = 1.0, important = false) => {
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

  panner.positionX.value = x;
  panner.positionY.value = y;
  panner.positionZ.value = 1;

  const gainNode = ctx.createGain();
  gainNode.gain.value = gain;

  source.connect(gainNode);
  gainNode.connect(panner);
  panner.connect(volume);
  source.start(0);
  return panner;
};

const getSound = (name: string) => {
  const ret = soundMap.get(name);
  if (ret === undefined) {
    console.log(`Sound ${name} not found`);
  }
  return ret;
};

const soundScale = 800;

export { initSound, playSound, play3dSound, soundScale, setVolume, getVolume, soundMap, getSound };
