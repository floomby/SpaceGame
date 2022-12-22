import { Position, positiveMod } from "./geometry";

const loadBackgroundOld = (gl: WebGLRenderingContext): Promise<WebGLTexture> => {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.src = "resources/background.png";
    image.onload = () => {
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
      // Enable tiling
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      resolve(texture);
    };
    image.onerror = reject;
  });
};

const maxChunksInMemory = 100;

// Probably want to use an array here, but until I decide how I am handling the overflow of the background I will leave it as a map
const backgroundChunks = new Map<string, WebGLTexture | undefined>();

let backgroundWorker: Worker;

const macroToChunkAndOffset = (position: Position) => {
  let x = Math.floor(position.x / 1024);
  let y = Math.floor(position.y / 1024);

  x = positiveMod(x, 16);
  y = positiveMod(y, 16);

  const key = `${x},${y}`;
  const chunk = backgroundChunks.get(key);
  const offset = { x: positiveMod(position.x, 1024), y: positiveMod(position.y, 1024) };
  const chunkCoords = [x, y];
  if (!chunk) {
    backgroundWorker.postMessage(chunkCoords);
  }
  return { chunk, offset, chunkCoords };
};

const getChunk = (x: number, y: number) => {
  x = positiveMod(x, 16);
  y = positiveMod(y, 16);

  const key = `${x},${y}`;
  const chunk = backgroundChunks.get(key);
  if (!chunk) {
    backgroundWorker.postMessage([x, y]);
  }
  return chunk;
};

const preFetchChunks = (x: number, y: number) => {
  const key = `${x},${y}`;
  const chunk = backgroundChunks.get(key);
  if (!chunk) {
    backgroundWorker.postMessage([x, y]);
  }
};

const initBackgroundWorker = (gl: WebGLRenderingContext) => {
  const worker = new Worker("dist/workers.js");

  worker.onmessage = (e) => {
    const [x, y, imageBitmap] = e.data;

    const key = `${x},${y}`;
    if (backgroundChunks.has(key)) {
      return;
    }

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imageBitmap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    backgroundChunks.set(key, texture);

    // This is faster and better than an MRU (the only thing we care about is not exhausting vram)
    // A little worse for the network, but should be fine (I can add something to the header from the server to have the browser strongly prefer to cache)
    if (backgroundChunks.size > maxChunksInMemory) {
      for (const [key, value] of backgroundChunks) {
        if (Math.random() > 0.5) {
          gl.deleteTexture(value);
          backgroundChunks.delete(key);
          break;
        }
      }
    }
  };

  backgroundWorker = worker;
};

export { loadBackgroundOld, initBackgroundWorker, macroToChunkAndOffset, getChunk };
