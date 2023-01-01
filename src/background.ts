import { gameToMacro, mapSize } from "./game";
import { Position, positiveMod } from "./geometry";
import { currentSector, lastSelf } from "./globals";

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

const selfChunk = () => {
  if (!lastSelf) {
    return [null, null];
  }

  const macro = gameToMacro(lastSelf.position, currentSector);
  return [Math.floor(macro.x / 1024), Math.floor(macro.y / 1024)];
};

const keyToXY = (key: string) => {
  const [x, y] = key.split(",");
  return [parseInt(x), parseInt(y)];
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
      const [x, y] = selfChunk();
      for (const [key, value] of backgroundChunks) {
        if (Math.random() > 0.5) {
          const [chunkX, chunkY] = keyToXY(key);
          if (Math.abs(chunkX - x) > 1 || Math.abs(chunkY - y) > 1) {
            gl.deleteTexture(value);
            backgroundChunks.delete(key);
          }
        }
      }
    }
  };

  backgroundWorker = worker;
};

const doPrefetch = () => {
  const [x, y] = selfChunk();
  if (x === null || y === null) {
    return;
  }

  preFetchChunks(x - 1, y - 1);
  preFetchChunks(x - 1, y);
  preFetchChunks(x - 1, y + 1);
  preFetchChunks(x, y - 1);
  preFetchChunks(x, y);
  preFetchChunks(x, y + 1);
  preFetchChunks(x + 1, y - 1);
  preFetchChunks(x + 1, y);
  preFetchChunks(x + 1, y + 1);

  if (lastSelf?.warping > 0 && lastSelf?.warpTo < mapSize * mapSize) {
    const macro = gameToMacro(lastSelf.position, lastSelf.warpTo);
    const warpX = Math.floor(macro.x / 1024);
    const warpY = Math.floor(macro.y / 1024);
    preFetchChunks(warpX - 1, warpY - 1);
    preFetchChunks(warpX - 1, warpY);
    preFetchChunks(warpX - 1, warpY + 1);
    preFetchChunks(warpX, warpY - 1);
    preFetchChunks(warpX, warpY);
    preFetchChunks(warpX, warpY + 1);
    preFetchChunks(warpX + 1, warpY - 1);
    preFetchChunks(warpX + 1, warpY);
    preFetchChunks(warpX + 1, warpY + 1);
  }
}

export { loadBackgroundOld, initBackgroundWorker, macroToChunkAndOffset, getChunk, doPrefetch };
