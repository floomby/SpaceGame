import { gl, canvas, projectionMatrix, DrawType } from "./3dDrawing";
import { Position, Rectangle } from "./geometry";

type Vertex2D = {
  x: number;
  y: number;
  z: number;
  r: number;
  g: number;
  b: number;
  a: number;
};

const canvasCoordsToNDC = (x: number, y: number) => {
  return {
    x: (x / canvas.width) * 2 - 1,
    y: 1 - (y / canvas.height) * 2,
  };
};

const canvasPosToNDC = (position: Position) => {
  return {
    x: 1 - (position.x / canvas.width) * 2,
    y: (position.y / canvas.height) * 2 - 1,
  };
};

const canvasRectToNDC = (rect: Rectangle) => {
  const { x, y } = canvasCoordsToNDC(rect.x, rect.y);
  return {
    x,
    y,
    width: rect.width / canvas.width * 2,
    height: rect.height / canvas.height * 2,
  };
};

const zIndexMultiplier = -0.0001;

let hudVertexBuffer: number[] = [];
let hudColorBuffer: number[] = [];

// Takes NDC, zIndex
const appendRect = (rectangle: Rectangle, zIndex: number, color: [number, number, number, number]) => {
  if (zIndex > 0) {
    throw new Error("zIndex must be less than 0");
  }

  hudVertexBuffer.push(
    rectangle.x,
    rectangle.y,
    zIndex * zIndexMultiplier - 1,
    rectangle.x + rectangle.width,
    rectangle.y,
    zIndex * zIndexMultiplier - 1,
    rectangle.x + rectangle.width,
    rectangle.y - rectangle.height,
    zIndex * zIndexMultiplier - 1,
    rectangle.x,
    rectangle.y,
    zIndex * zIndexMultiplier - 1,
    rectangle.x + rectangle.width,
    rectangle.y - rectangle.height,
    zIndex * zIndexMultiplier - 1,
    rectangle.x,
    rectangle.y - rectangle.height,
    zIndex * zIndexMultiplier - 1
  );

  hudColorBuffer.push(
    color[0],
    color[1],
    color[2],
    color[3],
    color[0],
    color[1],
    color[2],
    color[3],
    color[0],
    color[1],
    color[2],
    color[3],
    color[0],
    color[1],
    color[2],
    color[3],
    color[0],
    color[1],
    color[2],
    color[3],
    color[0],
    color[1],
    color[2],
    color[3]
  );
};

const clear = () => {
  hudVertexBuffer.length = 0;
  hudColorBuffer.length = 0;
};

// This is not efficient, but I am just trying to get it working right now
const buildBuffers = () => {
  const vertexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(hudVertexBuffer), gl.STATIC_DRAW);

  const colorBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(hudColorBuffer), gl.STATIC_DRAW);

  return {
    vertexBuffer,
    colorBuffer,
    count: hudVertexBuffer.length / 3,
  };
};

const appendMinimap = (where: Rectangle, miniMapScaleFactor: number) => {
  const margin = 5;
  where.x -= margin;
  where.y -= margin;
  where.width -= 2 * margin;
  where.height -= 2 * margin;

  const center = { x: where.x + where.width / 2, y: where.y + where.height / 2 };

  const minimapRect = canvasRectToNDC(where);

  appendRect(minimapRect, -1, [0.3, 0.3, 0.3, 0.5]);

  // for (const [id, asteroid] of state.asteroids) {
  //   if (
  //     Math.abs(asteroid.position.x - self.position.x) * miniMapScaleFactor < width / 2 &&
  //     Math.abs(asteroid.position.y - self.position.y) * miniMapScaleFactor < height / 2
  //   ) {
  //     drawMiniMapAsteroid(center, asteroid, self, miniMapScaleFactor);
  //   }
  // }
  // for (const [id, player] of state.players) {
  //   if (player.docked) {
  //     continue;
  //   }
  //   if (
  //     Math.abs(player.position.x - self.position.x) * miniMapScaleFactor < width / 2 &&
  //     Math.abs(player.position.y - self.position.y) * miniMapScaleFactor < height / 2
  //   ) {
  //     if (player.team === self.team || player.cloak !== CloakedState.Cloaked) {
  //       drawMiniMapPlayer(center, player, self, miniMapScaleFactor);
  //     }
  //   }
  // }
};

const draw = (programInfo: any) => {
  let bufferData = buildBuffers();

  {
    const numComponents = 3;
    const type = gl.FLOAT;
    const normalize = false;
    const stride = 0;
    const offset = 0;
    gl.bindBuffer(gl.ARRAY_BUFFER, bufferData.vertexBuffer);
    gl.vertexAttribPointer(programInfo.attribLocations.vertexPosition, numComponents, type, normalize, stride, offset);
    gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition);
  }

  {
    const numComponents = 4;
    const type = gl.FLOAT;
    const normalize = false;
    const stride = 0;
    const offset = 0;
    gl.bindBuffer(gl.ARRAY_BUFFER, bufferData.colorBuffer);
    gl.vertexAttribPointer(programInfo.attribLocations.vertexColor, numComponents, type, normalize, stride, offset);
    gl.enableVertexAttribArray(programInfo.attribLocations.vertexColor);
  }

  gl.uniform1i(programInfo.uniformLocations.drawType, DrawType.Hud);

  gl.drawArrays(gl.TRIANGLES, 0, bufferData.count);
};

export { draw as draw2d, appendRect, appendMinimap, clear as clear2d };
