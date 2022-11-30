import { gl, canvas, projectionMatrix, DrawType } from "./3dDrawing";
import { defs, UnitKind } from "./defs";
import { CloakedState } from "./game";
import { Position, Rectangle } from "./geometry";
import { lastSelf, state, teamColorsFloat } from "./globals";

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
    x: (position.x / canvas.width) * 2 - 1,
    y: 1 - (position.y / canvas.height) * 2,
  };
};

const canvasRectToNDC = (rect: Rectangle) => {
  const { x, y } = canvasCoordsToNDC(rect.x, rect.y);
  return {
    x,
    y,
    width: (rect.width / canvas.width) * 2,
    height: (rect.height / canvas.height) * 2,
  };
};

const zIndexMultiplier = -0.0001;

let hudVertexBuffer: number[] = [];
let hudColorBuffer: number[] = [];

// Takes NDC, zIndex
const appendRect = (rectangle: Rectangle, zIndex: number, color: [number, number, number, number]) => {
  if (zIndex > 0) {
    throw new Error("zIndex must not be greater than 0");
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

const appendCanvasCircle = (center: Position, radius: number, zIndex: number, color: [number, number, number, number], segments = 10) => {
  if (zIndex > 0) {
    throw new Error("zIndex must not be greater than 0");
  }

  const centerNDC = canvasPosToNDC(center);
  for (let i = 0; i < segments; i++) {
    const angle1 = (i / segments) * Math.PI * 2;
    const angle2 = ((i + 1) / segments) * Math.PI * 2;
    const point1 = canvasCoordsToNDC(center.x + Math.cos(angle1) * radius, center.y + Math.sin(angle1) * radius);
    const point2 = canvasCoordsToNDC(center.x + Math.cos(angle2) * radius, center.y + Math.sin(angle2) * radius);
    hudVertexBuffer.push(
      centerNDC.x,
      centerNDC.y,
      zIndex * zIndexMultiplier - 1,
      point1.x,
      point1.y,
      zIndex * zIndexMultiplier - 1,
      point2.x,
      point2.y,
      zIndex * zIndexMultiplier - 1
    );
    hudColorBuffer.push(color[0], color[1], color[2], color[3], color[0], color[1], color[2], color[3], color[0], color[1], color[2], color[3]);
  }
};

const appendCanvasTriangle = (p1: Position, p2: Position, p3: Position, zIndex: number, color: [number, number, number, number]) => {
  if (zIndex > 0) {
    throw new Error("zIndex must not be greater than 0");
  }

  const p1NDC = canvasPosToNDC(p1);
  const p2NDC = canvasPosToNDC(p2);
  const p3NDC = canvasPosToNDC(p3);
  hudVertexBuffer.push(
    p1NDC.x,
    p1NDC.y,
    zIndex * zIndexMultiplier - 1,
    p2NDC.x,
    p2NDC.y,
    zIndex * zIndexMultiplier - 1,
    p3NDC.x,
    p3NDC.y,
    zIndex * zIndexMultiplier - 1
  );
  hudColorBuffer.push(color[0], color[1], color[2], color[3], color[0], color[1], color[2], color[3], color[0], color[1], color[2], color[3]);
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

  // Work in canvas coords and then convert to NDC for writing to the buffer
  const center = { x: where.x + where.width / 2, y: where.y + where.height / 2 };

  const minimapRect = canvasRectToNDC(where);

  appendRect(minimapRect, -1, [0.3, 0.3, 0.3, 0.5]);

  for (const [id, asteroid] of state.asteroids) {
    if (
      Math.abs(asteroid.position.x - lastSelf.position.x) * miniMapScaleFactor < where.width / 2 &&
      Math.abs(asteroid.position.y - lastSelf.position.y) * miniMapScaleFactor < where.height / 2
    ) {
      const asteroidCenter = {
        x: (asteroid.position.x - lastSelf.position.x) * miniMapScaleFactor + center.x,
        y: (asteroid.position.y - lastSelf.position.y) * miniMapScaleFactor + center.y,
      };
      appendCanvasCircle(asteroidCenter, 2, 0, [0.5, 0.5, 0.5, 1]);
      // drawMiniMapAsteroid(center, asteroid, self, miniMapScaleFactor);
    }
  }
  for (const [id, player] of state.players) {
    if (player.docked) {
      continue;
    }
    if (
      Math.abs(player.position.x - lastSelf.position.x) * miniMapScaleFactor < where.width / 2 &&
      Math.abs(player.position.y - lastSelf.position.y) * miniMapScaleFactor < where.height / 2
    ) {
      if (player.team === lastSelf.team || player.cloak !== CloakedState.Cloaked) {
        const def = defs[player.defIndex];
        const teamColor = teamColorsFloat[player.team];

        const playerCenter = {
          x: (player.position.x - lastSelf.position.x) * miniMapScaleFactor + center.x,
          y: (player.position.y - lastSelf.position.y) * miniMapScaleFactor + center.y,
        };
        if (def.kind === UnitKind.Ship) {
          const playerX = {
            x: Math.cos(player.heading),
            y: Math.sin(player.heading),
          };
          const playerY = {
            x: Math.cos(player.heading + Math.PI / 2),
            y: Math.sin(player.heading + Math.PI / 2),
          };

          const p1 = {
            x: playerCenter.x + playerX.x * 7,
            y: playerCenter.y + playerX.y * 7,
          };

          const p2 = {
            x: playerCenter.x - playerX.x * 7 - playerY.x * 4,
            y: playerCenter.y - playerX.y * 7 - playerY.y * 4,
          };

          const p3 = {
            x: playerCenter.x - playerX.x * 7 + playerY.x * 4,
            y: playerCenter.y - playerX.y * 7 + playerY.y * 4,
          };
          
          appendCanvasTriangle(p1, p2, p3, 0, [teamColor[0], teamColor[1], teamColor[2], 1]);
        } else {
          appendCanvasCircle(playerCenter, 5, 0, [teamColor[0], teamColor[1], teamColor[2], 1]);
        }
      }
    }
  }
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
