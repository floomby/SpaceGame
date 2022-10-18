let ctx: AudioContext;
let volume: GainNode;

const soundBuffers: AudioBuffer[] = [];

// load a sound and return a promise
const loadSound = (url: string) => {
  return fetch(url)
    .then((response) => response.arrayBuffer())
    .then((arrayBuffer) => ctx.decodeAudioData(arrayBuffer));
};

const initSound = () => {
  ctx = new AudioContext();
  volume = ctx.createGain();
  volume.connect(ctx.destination);
  volume.gain.value = 0.5;

  // load the sounds, returning promises
  const promises: Promise<AudioBuffer>[] = [loadSound("resources/sounds/fire.wav"), loadSound("resources/sounds/explosion.wav")];

  // when all sounds have loaded, call the callback
  Promise.all(promises).then((buffers) => {
    buffers.forEach((buffer) => soundBuffers.push(buffer));
  });
};

const setVolume = (value: number) => {
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

const play3dSound = (index: number, x: number, y: number) => {
  if (!ctx || index < 0 || index >= soundBuffers.length) {
    console.log(ctx ? `Invalid sound index ${index}` : "Sound not initialized");
    return undefined;
  }
  const source = ctx.createBufferSource();
  source.buffer = soundBuffers[index];
  const panner = ctx.createPanner();
  panner.positionX.value = x;
  panner.positionY.value = y;
  panner.positionZ.value = 1;
  source.connect(panner);
  panner.connect(volume);
  source.start(0);
  return panner;
};

const soundScale = 500;

export { initSound, playSound, play3dSound, soundScale, setVolume, getVolume };
