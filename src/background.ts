import { Debouncer } from "./dialogs/helpers";
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

// Probably want to use an array here, but until I decide how I am handling the overflow of the background I will leave it as a map
const backgroundChunks = new Map<number, Map<number, WebGLTexture | undefined>>();

let backgroundWorker: Worker;

const macroToChunkAndOffset = (position: Position) => {
  let x = Math.floor(position.x / 2048);
  let y = Math.floor(position.y / 2048);

  x = Math.min(Math.max(x, 0), 15);
  y = Math.min(Math.max(y, 0), 15);

  const chunk = backgroundChunks.get(x)?.get(y);
  const offset = { x: positiveMod(position.x, 2048), y: positiveMod(position.y, 2048) };
  const chunkCoords = [x, y];
  if (!chunk) {
    backgroundWorker.postMessage(chunkCoords);
  }
  return { chunk, offset, chunkCoords };
};

const debouncer = new Debouncer(1000);

const initBackgroundWorker = (gl: WebGLRenderingContext) => {
  const worker = new Worker("dist/workers.js");

  worker.onmessage = (e) => {
    const [x, y, imageBitmap] = e.data;

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imageBitmap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    const yMap = backgroundChunks.get(x);
    if (!yMap) {
      backgroundChunks.set(x, new Map([[y, texture]]));
    } else {
      yMap.set(y, texture);
    }

    debouncer.debounce(() => {
      console.log("backgroundChunks", backgroundChunks);
    });
  };

  backgroundWorker = worker;
};

export { loadBackgroundOld, initBackgroundWorker, macroToChunkAndOffset };
