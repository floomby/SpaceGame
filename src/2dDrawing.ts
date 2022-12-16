import { vec4 } from "gl-matrix";
import {
  gl,
  canvas,
  projectionMatrix,
  DrawType,
  gamePlaneZ,
  ctx,
  overlayCanvas,
  mapGameYToWorld,
  mapGameXToWorld,
  canvasGameTopLeft,
  canvasGameBottomRight,
  drawLine,
} from "./3dDrawing";
import { armDefs, ArmUsage, defs, Faction, UnitKind } from "./defs";
import { Asteroid, availableCargoCapacity, ChatMessage, CloakedState, Player, sectorBounds, TargetKind } from "./game";
import { CardinalDirection, findHeadingBetween, l2Norm, Position, Position3, positiveMod, projectRayFromCenterOfRect, Rectangle } from "./geometry";
import { keybind, lastSelf, selectedSecondary, state, teamColorsFloat, teamColorsOpaque } from "./globals";

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

const appendCanvasRect = (rect: Rectangle, zIndex: number, color: [number, number, number, number]) => {
  appendRect(canvasRectToNDC(rect), zIndex, color);
};

const clear = () => {
  hudVertexBuffer.length = 0;
  hudColorBuffer.length = 0;
  ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
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

const appendCanvasBar = (
  where: Rectangle,
  value: number,
  colorRight: [number, number, number, number],
  colorLeft: [number, number, number, number]
) => {
  const barWidth = where.width * value;
  const barRect = {
    x: where.x,
    y: where.y,
    width: barWidth,
    height: where.height,
  };
  appendCanvasRect(barRect, 0, colorRight);
  barRect.x += barWidth;
  barRect.width = where.width - barWidth;
  appendCanvasRect(barRect, 0, colorLeft);
};

const appendBottomBars = () => {
  const def = defs[lastSelf.defIndex];
  let totalCargo = def.cargoCapacity - availableCargoCapacity(lastSelf);
  totalCargo = Math.min(def.cargoCapacity, totalCargo);
  appendCanvasBar(
    { x: 10, y: canvas.height - 20, width: canvas.width / 2 - 20, height: 10 },
    totalCargo / def.cargoCapacity,
    [0.6, 0.3, 0.15, 0.8],
    [0.3, 0.3, 0.3, 0.8]
  );
  if (lastSelf.arms.length > selectedSecondary) {
    const armDef = armDefs[lastSelf.arms[selectedSecondary]];
    if (armDef.usage === ArmUsage.Energy && armDef.energyCost !== undefined) {
      const color: [number, number, number, number] = armDef.energyCost > lastSelf.energy ? [1.0, 0.0, 0.0, 0.8] : [0.0, 0.15, 1.0, 0.8];
      appendCanvasBar(
        { x: canvas.width / 2 + 10, y: canvas.height - 20, width: canvas.width / 2 - 20, height: 10 },
        lastSelf.energy / def.energy,
        color,
        [0.3, 0.3, 0.3, 0.8]
      );
    } else if (armDef.usage === ArmUsage.Ammo && armDef.maxAmmo !== undefined) {
      appendCanvasBar(
        { x: canvas.width / 2 + 10, y: canvas.height - 20, width: canvas.width / 2 - 20, height: 10 },
        lastSelf.slotData[selectedSecondary].ammo / armDef.maxAmmo,
        [0.7, 0.7, 0.7, 0.8],
        [0.3, 0.3, 0.3, 0.8]
      );
    }
  }
};

const nameDataFont = "24px Arial";
const nameDataCache = new Map<string, ImageBitmap>();
const classDataFont = "20px Arial";
const classDataCache = new Map<string, ImageBitmap>();

const blitImageDataCentered = (image: ImageData, x: number, y: number) => {
  x -= image.width / 2;
  y -= image.height / 2;
  ctx.putImageData(image, x, y, 0, 0, image.width, image.width);
};

const putBitmapCenteredUnderneath = (bitmap: ImageBitmap, x: number, y: number) => {
  ctx.save();
  ctx.globalCompositeOperation = "destination-over";
  ctx.drawImage(bitmap, x - bitmap.width / 2, y - bitmap.height / 2);
  ctx.restore();
};

const blitImageDataTopLeft = (image: ImageData, x: number, y: number) => {
  ctx.putImageData(image, x, y, 0, 0, image.width, image.width);
};

const blitImageDataToOverlayCenteredFromGame = (image: ImageData, gameCoords: Position, offset: Position3) => {
  const pos = vec4.create();
  vec4.set(pos, mapGameXToWorld(gameCoords.x) + offset.x, -mapGameYToWorld(gameCoords.y) + offset.y, gamePlaneZ + offset.z, 1);
  vec4.transformMat4(pos, pos, projectionMatrix);

  const x = ((pos[0] / pos[3] + 1) * canvas.width) / 2 - image.width / 2;
  const y = ((pos[1] / pos[3] + 1) * canvas.height) / 2 - image.height / 2;

  // Check if the image is on screen
  if (x > canvas.width || y > canvas.height || x + image.width < 0 || y + image.height < 0) {
    return;
  }

  ctx.putImageData(image, x, y, 0, 0, image.width, image.height);
};

const putBitmapCenteredUnderneathFromGame = (bitmap: ImageBitmap, gameCoords: Position, offset: Position3) => {
  const pos = vec4.create();
  vec4.set(pos, mapGameXToWorld(gameCoords.x) + offset.x, -mapGameYToWorld(gameCoords.y) + offset.y, gamePlaneZ + offset.z, 1);
  vec4.transformMat4(pos, pos, projectionMatrix);

  const x = ((pos[0] / pos[3] + 1) * canvas.width) / 2 - bitmap.width / 2;
  const y = ((pos[1] / pos[3] + 1) * canvas.height) / 2 - bitmap.height / 2;

  // Check if the image is on screen
  if (x > canvas.width || y > canvas.height || x + bitmap.width < 0 || y + bitmap.height < 0) {
    return;
  }

  ctx.save();
  ctx.globalCompositeOperation = "destination-over";
  ctx.drawImage(bitmap, x, y);
  ctx.restore();
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

let rasterizerContext: OffscreenCanvasRenderingContext2D | null = null;
let rasterizerCanvas: OffscreenCanvas | null = null;

const initRasterizer = (size: Position) => {
  rasterizerCanvas = new OffscreenCanvas(size.x, size.y);
  rasterizerContext = rasterizerCanvas.getContext("2d", { willReadFrequently: true });
  rasterizerContext.textAlign = "left";
  rasterizerContext.textBaseline = "top";
};

const rasterizeText = (text: string, font: string, color: [number, number, number, number], filter = "none", padding = 0) => {
  if (rasterizerContext === null) {
    return;
  }
  rasterizerContext.clearRect(0, 0, rasterizerContext.canvas.width, rasterizerContext.canvas.height);
  rasterizerContext.font = font;
  rasterizerContext.fillStyle = `rgba(${color[0] * 255}, ${color[1] * 255}, ${color[2] * 255}, ${color[3]})`;
  rasterizerContext.filter = filter;
  rasterizerContext.fillText(text, padding, padding);
  let metric = rasterizerContext.measureText(text);
  return rasterizerContext.getImageData(
    0,
    0,
    Math.min(metric.width + padding * 2, rasterizerCanvas.width),
    Math.min(metric.actualBoundingBoxAscent + 2 * metric.actualBoundingBoxDescent + padding * 2, rasterizerCanvas.height)
  );
};

const rasterizeTextMultiline = (text: string[], font: string, color: [number, number, number, number], filter = "none", padding = 0) => {
  if (rasterizerContext === null) {
    return;
  }
  rasterizerContext.clearRect(0, 0, rasterizerContext.canvas.width, rasterizerContext.canvas.height);
  rasterizerContext.font = font;
  rasterizerContext.fillStyle = `rgba(${color[0] * 255}, ${color[1] * 255}, ${color[2] * 255}, ${color[3]})`;
  rasterizerContext.filter = filter;
  let height = padding;
  let maxLineWidth = 0;
  for (let i = 0; i < text.length; i++) {
    rasterizerContext.fillText(text[i], padding, height);
    let metric = rasterizerContext.measureText(text[i]);
    height += metric.actualBoundingBoxAscent + 2 * metric.actualBoundingBoxDescent;
    maxLineWidth = Math.max(maxLineWidth, metric.width);
  }
  return rasterizerContext.getImageData(
    0,
    0,
    Math.min(maxLineWidth + padding * 2, rasterizerCanvas.width),
    Math.min(height + padding * 2, rasterizerCanvas.height)
  );
};

const rasterizeTextMultilineBitmap = (text: string[], font: string, color: [number, number, number, number], filter = "none", padding = 0) => {
  if (rasterizerContext === null) {
    return;
  }
  rasterizerContext.clearRect(0, 0, rasterizerContext.canvas.width, rasterizerContext.canvas.height);
  rasterizerContext.font = font;
  rasterizerContext.fillStyle = `rgba(${color[0] * 255}, ${color[1] * 255}, ${color[2] * 255}, ${color[3]})`;
  rasterizerContext.filter = filter;
  let height = padding;
  let maxLineWidth = 0;
  for (let i = 0; i < text.length; i++) {
    rasterizerContext.fillText(text[i], padding, height);
    let metric = rasterizerContext.measureText(text[i]);
    height += metric.actualBoundingBoxAscent + 2 * metric.actualBoundingBoxDescent;
    maxLineWidth = Math.max(maxLineWidth, metric.width);
  }
  return createImageBitmap(
    rasterizerCanvas,
    0,
    0,
    Math.min(maxLineWidth + padding * 2, rasterizerCanvas.width),
    Math.min(height + padding * 2, rasterizerCanvas.height)
  );
};

const rasterizeTextBitmap = (text: string, font: string, color: [number, number, number, number], filter = "none", padding = 0) => {
  if (rasterizerContext === null) {
    return;
  }
  rasterizerContext.clearRect(0, 0, rasterizerContext.canvas.width, rasterizerContext.canvas.height);
  rasterizerContext.font = font;
  rasterizerContext.fillStyle = `rgba(${color[0] * 255}, ${color[1] * 255}, ${color[2] * 255}, ${color[3]})`;
  rasterizerContext.filter = filter;
  rasterizerContext.fillText(text, padding, padding);
  let metric = rasterizerContext.measureText(text);
  return createImageBitmap(
    rasterizerCanvas,
    0,
    0,
    Math.min(metric.width + padding * 2, rasterizerCanvas.width),
    Math.min(metric.actualBoundingBoxAscent + 2 * metric.actualBoundingBoxDescent + padding * 2, rasterizerCanvas.height)
  );
};

const drawChats = (chats: IterableIterator<ChatMessage>) => {
  for (const chat of chats) {
    const player = state.players.get(chat.id);
    if (player && !player.docked) {
      if (chat.rasterizationData) {
        drawChat(player, chat.rasterizationData);
      }
    }
  }
};

const drawChat = (player: Player, data: ImageBitmap) => {
  putBitmapCenteredUnderneathFromGame(data, player.position, { x: 0, y: -2, z: 2 });
};

type ArrowData = {
  kind: TargetKind;
  position: Position;
  team?: Faction;
  target: boolean;
  distance: number;
  depleted?: boolean;
  inoperable?: boolean;
};

const computeArrows = (target: Player, targetAsteroid: Asteroid) => {
  const arrows: ArrowData[] = [];

  const def = defs[lastSelf.defIndex];
  if (selectedSecondary === 0 || targetAsteroid) {
    for (const asteroid of state.asteroids.values()) {
      const distance = l2Norm(asteroid.position, lastSelf.position);
      if (
        distance < def.scanRange &&
        (asteroid.position.x < canvasGameTopLeft.x ||
          asteroid.position.x > canvasGameBottomRight.x ||
          asteroid.position.y < canvasGameTopLeft.y ||
          asteroid.position.y > canvasGameBottomRight.y)
      ) {
        arrows.push({
          kind: TargetKind.Asteroid,
          position: asteroid.position,
          target: targetAsteroid === asteroid,
          distance,
          depleted: asteroid.resources === 0,
        });
      }
    }
  }

  for (const player of state.players.values()) {
    const distance = l2Norm(player.position, lastSelf.position);
    const playerDef = defs[player.defIndex];
    if (
      player.id !== lastSelf.id &&
      (distance < def.scanRange || playerDef.kind === UnitKind.Station) &&
      (player.team === lastSelf.team || !player.cloak) &&
      !player.docked &&
      (player.position.x < canvasGameTopLeft.x ||
        player.position.x > canvasGameBottomRight.x ||
        player.position.y < canvasGameTopLeft.y ||
        player.position.y > canvasGameBottomRight.y)
    ) {
      arrows.push({
        kind: TargetKind.Player,
        position: player.position,
        team: player.team,
        target: target === player,
        distance,
        inoperable: player.inoperable,
      });
    }
  }

  return arrows;
};

const drawArrow = (targetPosition: Position, fillStyle: string, highlight: boolean, distance: number) => {
  const margin = 25;
  const heading = findHeadingBetween(lastSelf.position, targetPosition);
  const intersection = projectRayFromCenterOfRect({ x: 0, y: 0, width: canvas.width, height: canvas.height }, heading);
  const position = { x: intersection.x - Math.cos(heading) * margin, y: intersection.y - Math.sin(heading) * margin };
  ctx.save();
  ctx.translate(position.x, position.y);
  ctx.rotate(heading);
  if (highlight) {
    ctx.filter = "drop-shadow(0 0 10px #FFFFFF)";
  }
  ctx.fillStyle = fillStyle;
  ctx.beginPath();
  ctx.moveTo(14, 0);
  ctx.lineTo(-14, -8);
  ctx.lineTo(-14, 8);
  ctx.closePath();
  ctx.fill();
  ctx.rotate(-heading);
  // draw the distance text
  ctx.fillStyle = "white";
  ctx.font = "16px Arial";
  ctx.textAlign = "center";
  ctx.fillText(`${Math.round(distance)}`, 0, 0);
  ctx.restore();
};

const drawArrows = (arrows: ArrowData[]) => {
  for (const arrow of arrows) {
    if (arrow.team !== undefined) {
      drawArrow(arrow.position, arrow.inoperable ? "grey" : teamColorsOpaque[arrow.team], arrow.target, arrow.distance);
    } else {
      drawArrow(arrow.position, arrow.depleted ? "#331111" : "#662222", arrow.target, arrow.distance);
    }
  }
};

const drawSectorArrowAndLines = () => {
  let closestEdgeDirection: CardinalDirection | null = null;

  const distanceToLeft = lastSelf.position.x - sectorBounds.x;
  const distanceToRight = sectorBounds.x + sectorBounds.width - lastSelf.position.x;
  const distanceToTop = lastSelf.position.y - sectorBounds.y;
  const distanceToBottom = sectorBounds.y + sectorBounds.height - lastSelf.position.y;

  const distances = [distanceToLeft, distanceToRight, distanceToTop, distanceToBottom];
  let closestEdgeDistance = Math.min(...distances);
  if (closestEdgeDistance === distanceToLeft) {
    closestEdgeDirection = CardinalDirection.Left;
  } else if (closestEdgeDistance === distanceToRight) {
    closestEdgeDirection = CardinalDirection.Right;
  } else if (closestEdgeDistance === distanceToTop) {
    closestEdgeDirection = CardinalDirection.Up;
  } else if (closestEdgeDistance === distanceToBottom) {
    closestEdgeDirection = CardinalDirection.Down;
  }

  if (closestEdgeDistance > 3500) {
    return;
  }

  const canvasGameHeight = canvasGameBottomRight.y - canvasGameTopLeft.y;
  const canvasGameWidth = canvasGameBottomRight.x - canvasGameTopLeft.x;

  if (distanceToBottom <= canvasGameHeight / 2) {
    drawLine(
      [canvasGameTopLeft.x, sectorBounds.y + sectorBounds.height],
      [canvasGameBottomRight.x, sectorBounds.y + sectorBounds.height],
      1,
      [0, 1.0, 0, 0.5],
      1
    );
  }
  if (distanceToTop <= canvasGameHeight / 2) {
    drawLine([canvasGameTopLeft.x, sectorBounds.y], [canvasGameBottomRight.x, sectorBounds.y], 1, [0, 1.0, 0, 0.5], 1);
  }
  if (distanceToLeft <= canvasGameWidth / 2) {
    drawLine([sectorBounds.x, canvasGameTopLeft.y], [sectorBounds.x, canvasGameBottomRight.y], 1, [0, 1.0, 0, 0.5], 1);
  }
  if (distanceToRight <= canvasGameWidth / 2) {
    drawLine(
      [sectorBounds.x + sectorBounds.width, canvasGameTopLeft.y],
      [sectorBounds.x + sectorBounds.width, canvasGameBottomRight.y],
      1,
      [0, 1.0, 0, 0.5],
      1
    );
  }

  switch (closestEdgeDirection) {
    case CardinalDirection.Up:
      if (closestEdgeDistance < canvasGameHeight / 2) {
        return;
      }
      ctx.save();
      ctx.translate(canvas.width / 2, 0);
      ctx.fillStyle = "green";
      ctx.beginPath();
      ctx.moveTo(0, 10);
      ctx.lineTo(8, 38);
      ctx.lineTo(-8, 38);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "white";
      ctx.font = "20px Arial";
      ctx.textAlign = "center";
      ctx.fillText(`${Math.round(closestEdgeDistance)}`, 0, 60);
      ctx.restore();
      break;
    case CardinalDirection.Down:
      if (closestEdgeDistance < canvasGameHeight / 2) {
        return;
      }
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height);
      ctx.fillStyle = "green";
      ctx.beginPath();
      ctx.moveTo(0, -10);
      ctx.lineTo(8, -38);
      ctx.lineTo(-8, -38);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "white";
      ctx.font = "20px Arial";
      ctx.textAlign = "center";
      ctx.fillText(`${Math.round(closestEdgeDistance)}`, 0, -40);
      ctx.restore();
      break;
    case CardinalDirection.Left:
      if (closestEdgeDistance < canvasGameWidth / 2) {
        return;
      }
      ctx.save();
      ctx.translate(0, canvas.height / 2);
      ctx.fillStyle = "green";
      ctx.beginPath();
      ctx.moveTo(10, 0);
      ctx.lineTo(38, 8);
      ctx.lineTo(38, -8);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "white";
      ctx.font = "20px Arial";
      ctx.textAlign = "center";
      ctx.fillText(`${Math.round(closestEdgeDistance)}`, 50, 0);
      ctx.restore();
      break;
    case CardinalDirection.Right:
      if (closestEdgeDistance < canvasGameWidth / 2) {
        return;
      }
      ctx.save();
      ctx.translate(canvas.width, canvas.height / 2);
      ctx.fillStyle = "green";
      ctx.beginPath();
      ctx.moveTo(-10, 0);
      ctx.lineTo(-38, 8);
      ctx.lineTo(-38, -8);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "white";
      ctx.font = "20px Arial";
      ctx.textAlign = "center";
      ctx.fillText(`${Math.round(closestEdgeDistance)}`, -50, 0);
      ctx.restore();
      break;
  }
};

type Message = {
  framesRemaining: number;
  whileDocked: boolean;
  textData: ImageBitmap;
  what: string;
};

let messages: Message[] = [];

const pushMessage = async (what: string, framesRemaining: number = 240, color: [number, number, number, number] = [1.0, 1.0, 1.0, 1.0]) => {
  messages.push({ framesRemaining, whileDocked: !!lastSelf?.docked, textData: await rasterizeTextBitmap(what, "22px Arial", color), what });
};

const drawMessages = (sixtieths: number) => {
  // draw all the messages at the top of the screen
  let y = 30;
  for (let i = 0; i < messages.length; i++) {
    messages[i].framesRemaining -= sixtieths;
    if (messages[i].framesRemaining <= 0) {
      messages.splice(i, 1);
      i--;
      continue;
    }
    const savedAlpha = ctx.globalAlpha;
    const alpha = Math.min(messages[i].framesRemaining / 60, 1);
    ctx.globalAlpha = alpha;
    // ctx.fillStyle = message.color;
    // ctx.fillText(message.what, canvas.width / 2, y);
    ctx.drawImage(messages[i].textData, canvas.width / 2 - messages[i].textData.width / 2, y);
    y += 30 * alpha;
    ctx.globalAlpha = savedAlpha;
  }
};

let dockedMessage: HTMLDivElement;
let dockedMessageText: HTMLHeadingElement;

const initDockingMessages = () => {
  dockedMessage = document.getElementById("dockedMessage") as HTMLHeadingElement;
  dockedMessageText = document.getElementById("dockedMessageText") as HTMLHeadingElement;
};

let lastDockedMessage: Message | undefined = undefined;
let dockingTextNotificationTimeout: number | undefined = undefined;

const displayDockedMessages = (sixtieths) => {
  const filteredMessages = messages.filter((message) => {
    message.framesRemaining -= sixtieths;
    return message.whileDocked;
  });

  // No messages to display
  if (filteredMessages.length === 0 && lastDockedMessage) {
    dockedMessage.classList.remove("fadeIn");
    dockedMessage.classList.add("fadeOut");
    lastDockedMessage = undefined;
    return;
  }
  const messageToDisplay = filteredMessages[filteredMessages.length - 1];

  if (filteredMessages.length && (!lastDockedMessage || lastDockedMessage !== messageToDisplay)) {
    dockedMessageText.innerText = messageToDisplay.what;
    if (!lastDockedMessage) {
      // New message to show
      dockedMessage.classList.add("fadeIn");
      dockedMessage.style.display = "block";
    } else {
      // New message to show, but we're already showing a message
      dockedMessageText.classList.add("notifyChanged");
      if (dockingTextNotificationTimeout) {
        clearTimeout(dockingTextNotificationTimeout);
      }
      dockingTextNotificationTimeout = window.setTimeout(() => {
        dockedMessageText.classList.remove("notifyChanged");
      }, 500);
    }
    lastDockedMessage = messageToDisplay;
  }
};

const promptTexts = {
  docking: (ImageData = null),
  repair: (ImageData = null),
};

const rasterizePrompts = async () => {
  promptTexts.docking = rasterizeTextMultiline([`Press ${keybind.dock}`, "to dock."], "22px Arial", [1.0, 1.0, 1.0, 1.0]);
  promptTexts.repair = rasterizeTextMultiline([`Press ${keybind.dock}`, "to repair."], "22px Arial", [1.0, 1.0, 1.0, 1.0]);
};

const drawPrompts = () => {
  if (lastSelf.canDock) {
    blitImageDataTopLeft(promptTexts.docking, canvas.width / 2, canvas.height / 2);
  }
  if (lastSelf.canRepair) {
    blitImageDataTopLeft(promptTexts.repair, canvas.width / 2, canvas.height / 2);
  }
};

type WeaponTextData = {
  default: ImageData;
  selected: ImageData;
  active?: ImageData;
  activeAndSelected?: ImageData;
};

const weaponTexts: WeaponTextData[] = [];
let weaponTextInitialized = false;

const rasterizeWeaponText = () => {
  console.log("rasterizing weapon text");
  if (!lastSelf) {
    return;
  }
  weaponTextInitialized = true;
  weaponTexts.length = 0;
  for (let i = 1; i <= lastSelf.arms.length; i++) {
    let armDef = armDefs[lastSelf.arms[i % lastSelf.arms.length]];
    let slotData = lastSelf.slotData[i % lastSelf.arms.length];
    const indexToShow = i % lastSelf.arms.length;
    const weaponTextData = {
      default: rasterizeText(`${indexToShow}: ${armDef.name}`, "14px Arial", [1.0, 1.0, 1.0, 1.0]),
      selected: rasterizeText(`${indexToShow}: ${armDef.name}`, "14px Arial", [1.0, 1.0, 0.0, 1.0]),
    } as WeaponTextData;
    if (slotData && slotData.hasOwnProperty("active")) {
      weaponTextData.active = rasterizeText(`${indexToShow}: ${armDef.name}`, "14px Arial", [0.0, 1.0, 0.0, 1.0]);
      weaponTextData.activeAndSelected = rasterizeText(`${indexToShow}: ${armDef.name}`, "14px Arial", [0.6, 0.8, 0.2, 1.0]);
    }
    weaponTexts.push(weaponTextData);
  }
};

const drawWeaponText = () => {
  for (let i = 0; i < weaponTexts.length; i++) {
    let weaponTextData = weaponTexts[i];
    let slotData = lastSelf.slotData[(i + 1) % lastSelf.arms.length];
    let imageData = weaponTextData.default;
    const selected = positiveMod(selectedSecondary - 1, lastSelf.arms.length) === i;
    if (selected) {
      imageData = weaponTextData.selected;
    }
    if (slotData && slotData.hasOwnProperty("active") && slotData.active) {
      if (selected) {
        if (weaponTextData.activeAndSelected) {
          imageData = weaponTextData.activeAndSelected;
        }
      } else {
        if (weaponTextData.active) {
          imageData = weaponTextData.active;
        }
      }
    }
    blitImageDataTopLeft(imageData, 10, overlayCanvas.height - 30 - (weaponTexts.length - i) * 20);
  }
};

const insertPromise = async <T, U>(promise: Promise<U>, map: Map<T, U>, key: T) => {
  const data = await promise;
  map.set(key, data);
};

export {
  ArrowData,
  draw as draw2d,
  appendRect,
  appendMinimap,
  clear as clear2d,
  appendBottomBars,
  appendCanvasRect,
  canvasRectToNDC,
  blitImageDataToOverlayCenteredFromGame,
  initRasterizer,
  rasterizeText,
  rasterizeTextBitmap,
  drawChats,
  blitImageDataCentered,
  nameDataCache,
  nameDataFont,
  classDataCache,
  classDataFont,
  computeArrows,
  drawArrows,
  drawSectorArrowAndLines,
  pushMessage,
  drawMessages,
  initDockingMessages,
  displayDockedMessages,
  dockedMessage,
  rasterizePrompts,
  drawPrompts,
  rasterizeWeaponText,
  drawWeaponText,
  weaponTextInitialized,
  putBitmapCenteredUnderneath,
  insertPromise,
  putBitmapCenteredUnderneathFromGame,
};
