import { armDefs, ArmUsage, asteroidDefs, collectableDefs, defs, Faction, missileDefs, UnitKind } from "./defs";
import { shown } from "./dialog";
import { drawEffects, initEffects, effectSpriteDefs } from "./effects";
import {
  Asteroid,
  availableCargoCapacity,
  Ballistic,
  ChatMessage,
  Collectable,
  findHeadingBetween,
  GlobalState,
  Mine,
  Missile,
  Player,
  TargetKind,
  sectorBounds,
  CloakedState,
} from "./game";
import { Circle, Position, Rectangle, positiveMod, Line, infinityNorm, l2Norm, CardinalDirection, projectRayFromCenterOfRect } from "./geometry";
import {
  addLoadingText,
  allianceColorOpaque,
  confederationColorOpaque,
  lastSelf,
  rogueColorOpaque,
  scourgeColor,
  scourgeColorOpaque,
  teamColorsOpaque,
} from "./globals";
import { KeyBindings } from "./keybindings";
import { sfc32 } from "./prng";
import { drawProjectile } from "./projectileDrawing";
import { getNameOfPlayer } from "./rest";

let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
let sprites: ImageBitmap[] = [];
let perspectiveSprites: (ImageBitmap | void)[] = [];
let asteroidSprites: ImageBitmap[] = [];
let missileSprites: ImageBitmap[] = [];
let effectSprites: ImageBitmap[] = [];
let collectableSprites: ImageBitmap[] = [];

let stars: Circle[] = [];
let starTilingSize = { x: 5000, y: 5000 };

let perspectiveRescaling: Position[] = [];

// This is slower than snails but it only runs during loading
const foreshortenImage = (image: ImageBitmap, amount: number) => {
  const inputCanvas = document.createElement("canvas");
  inputCanvas.width = image.width;
  inputCanvas.height = image.height;
  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = image.width;
  outputCanvas.height = image.height;
  const inCtx = inputCanvas.getContext("2d", { willReadFrequently: true })!;
  const outCtx = outputCanvas.getContext("2d")!;
  inCtx.drawImage(image, 0, 0);

  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const data = inCtx.getImageData(x, y, 1, 1).data;
      const newX = (x - image.width / 2) * (1 - (amount * y) / image.height) + image.width / 2;
      // const newY = (y - image.height / 2) * (1 - (amount * x) / image.height) + image.height / 2;
      outCtx.putImageData(new ImageData(new Uint8ClampedArray(data), 1, 1), newX, y);
    }
  }

  return createImageBitmap(outputCanvas);
};

const initStars = (sector: number) => {
  stars.length = 0;
  const prng = sfc32(sector, 3437, 916, 3158);

  for (let i = 0; i < 1000; i++) {
    stars.push({
      position: { x: prng() * starTilingSize.x, y: prng() * starTilingSize.y },
      radius: prng() + 0.5,
    });
  }
};

const loadCollectableSprites = (spriteSheet: HTMLImageElement, callback: () => void) => {
  const spritePromises: Promise<ImageBitmap>[] = [];
  for (let i = 0; i < collectableDefs.length; i++) {
    const sprite = collectableDefs[i].sprite;
    spritePromises.push(createImageBitmap(spriteSheet, sprite.x, sprite.y, sprite.width, sprite.height));
  }
  Promise.all(spritePromises).then((completed) => {
    collectableSprites = completed;
    callback();
  });
};

// Arguably this should be in effects.ts, but crosscutting is basically unavoidable and it is almost identical the the other loading functions
const loadEffectSprites = (spriteSheet: HTMLImageElement, callback: () => void) => {
  const spritePromises: Promise<ImageBitmap>[] = [];
  for (let i = 0; i < effectSpriteDefs.length; i++) {
    const sprite = effectSpriteDefs[i].sprite;
    spritePromises.push(createImageBitmap(spriteSheet, sprite.x, sprite.y, sprite.width, sprite.height));
  }
  Promise.all(spritePromises).then((completed) => {
    effectSprites = completed;
    callback();
  });
};

const loadMissileSprites = (spriteSheet: HTMLImageElement, callback: () => void) => {
  const spritePromises: Promise<ImageBitmap>[] = [];
  for (let i = 0; i < missileDefs.length; i++) {
    const sprite = missileDefs[i].sprite;
    const spritePromise = createImageBitmap(spriteSheet, sprite.x, sprite.y, sprite.width, sprite.height);
    spritePromises.push(spritePromise);
  }
  Promise.all(spritePromises).then((sprites) => {
    missileSprites = sprites;
    callback();
  });
};

const loadAsteroidSprites = (spriteSheet: HTMLImageElement, callback: () => void) => {
  const spritePromises: Promise<ImageBitmap>[] = [];
  for (let i = 0; i < asteroidDefs.length; i++) {
    const sprite = asteroidDefs[i].sprite;
    spritePromises.push(createImageBitmap(spriteSheet, sprite.x, sprite.y, sprite.width, sprite.height));
  }
  Promise.all(spritePromises).then((completed) => {
    asteroidSprites = completed;
    callback();
  });
};

const loadPerspectiveSprites = (callback: () => void) => {
  const thetas = [1, 2, 3, 4, 5].map((i) => (i * Math.PI) / 16);

  thetas.forEach((theta) => {
    perspectiveRescaling.push({ x: (1 - Math.cos(theta)) / 2, y: Math.sin(theta) });
  });

  const spritePromises: Promise<ImageBitmap | void>[] = [];
  for (let i = 0; i < defs.length; i++) {
    for (let j = 0; j < thetas.length; j++) {
      if (defs[i].sideThrustMaxSpeed === undefined) {
        spritePromises.push(Promise.resolve());
      } else {
        spritePromises.push(foreshortenImage(sprites[i], 1 - Math.cos(thetas[j])));
      }
    }
  }
  Promise.all(spritePromises).then((completed) => {
    perspectiveSprites = completed;
    console.log("Loaded perspective sprites", perspectiveSprites.length);
    callback();
  });
};

let composited: ImageBitmap[] = [];

// Without offscreen precompositing drawing would be very complex and slower
const doPreCompositing = (stencils: ImageBitmap[], callback: () => void) => {
  addLoadingText("Precompositing");
  const compositePromises: Promise<ImageBitmap>[] = [];
  for (let i = 0; i < defs.length; i++) {
    for (let j = 0; j < Faction.Count; j++) {
      const stencil = stencils[i];
      const canvas = new OffscreenCanvas(stencil.width, stencil.height);
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(stencil, 0, 0);
      ctx.fillStyle = teamColorsOpaque[j];
      ctx.globalCompositeOperation = "source-in";
      ctx.fillRect(0, 0, stencil.width, stencil.height);
      ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(sprites[i], 0, 0);
      compositePromises.push(createImageBitmap(canvas));
    }
  }
  Promise.all(compositePromises).then((completed) => {
    composited = completed;
    callback();
  });
};

const loadStencilSprites = (stencilSheet: HTMLImageElement, callback: () => void) => {
  const spritePromises: Promise<ImageBitmap>[] = [];
  for (let i = 0; i < defs.length; i++) {
    spritePromises.push(createImageBitmap(stencilSheet, defs[i].sprite.x, defs[i].sprite.y, defs[i].sprite.width, defs[i].sprite.height));
  }
  Promise.all(spritePromises).then((completed) => {
    doPreCompositing(completed, callback);
  });
};

// let dockedMessage: HTMLDivElement;
// let dockedMessageText: HTMLHeadingElement;

// Temporary to allow the 3d code to function in the project
const adapter = () => {
  // dockedMessage = document.getElementById("dockedMessage") as HTMLHeadingElement;
  // dockedMessageText = document.getElementById("dockedMessageText") as HTMLHeadingElement;
}

const initDrawing = (callback: () => void) => {
  // dockedMessage = document.getElementById("dockedMessage") as HTMLHeadingElement;
  // dockedMessageText = document.getElementById("dockedMessageText") as HTMLHeadingElement;
  // Defs need to be initialized before effects
  initEffects();
  canvas = document.getElementById("canvas") as HTMLCanvasElement;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  window.addEventListener("resize", () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  });
  ctx = canvas.getContext("2d");
  addLoadingText("Loading sprites");
  const spriteSheet = new Image();
  spriteSheet.onload = () => {
    const stencilSheet = new Image();
    stencilSheet.onload = () => {
      const spritePromises: Promise<ImageBitmap>[] = [];
      for (let i = 0; i < defs.length; i++) {
        spritePromises.push(createImageBitmap(spriteSheet, defs[i].sprite.x, defs[i].sprite.y, defs[i].sprite.width, defs[i].sprite.height));
      }
      Promise.all(spritePromises).then((completed) => {
        sprites = completed;
        loadAsteroidSprites(spriteSheet, () => {
          loadMissileSprites(spriteSheet, () => {
            loadEffectSprites(spriteSheet, () => {
              loadCollectableSprites(spriteSheet, () => {
                // loadPerspectiveSprites(callback);
                loadStencilSprites(stencilSheet, callback);
              });
            });
          });
        });
      });
    };
    stencilSheet.src = "resources/stencil.png";
  };
  spriteSheet.src = "resources/sprites.png";
};

const clearCanvas = () => {
  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
};

const drawBar = (position: Position, width: number, height: number, primary: string, secondary: string, amount: number) => {
  ctx.fillStyle = primary;
  ctx.fillRect(position.x, position.y, width * amount, height);
  ctx.fillStyle = secondary;
  ctx.fillRect(position.x + width * amount, position.y, width * (1 - amount), height);
};

const drawHUD = (player: Player, selectedSecondary: number) => {
  const def = defs[player.defIndex];
  const totalCargo = def.cargoCapacity - availableCargoCapacity(player);
  drawBar({ x: 10, y: canvas.height - 20 }, canvas.width / 2 - 20, 10, "#774422CC", "#333333CC", totalCargo / defs[player.defIndex].cargoCapacity);
  for (let i = 1; i <= player.arms.length; i++) {
    let armDef = armDefs[player.arms[i % player.arms.length]];
    let slotData = player.slotData[i % player.arms.length];
    ctx.fillStyle = (i % player.arms.length) === selectedSecondary ? (slotData?.active ? "#9ACD32" : "yellow") : slotData?.active ? "green" : "white";
    ctx.font = "14px Arial";
    ctx.textAlign = "left";
    ctx.fillText(`${i % player.arms.length}: ${armDef.name}`, 10, canvas.height - 10 - (player.arms.length - i + 1) * 20);
    if (i % player.arms.length === selectedSecondary) {
      if (armDef.usage === ArmUsage.Energy && armDef.energyCost !== undefined) {
        const color = armDef.energyCost > player.energy ? "#EE2200CC" : "#0022FFCC";
        drawBar({ x: canvas.width / 2 + 10, y: canvas.height - 20 }, canvas.width / 2 - 20, 10, color, "#333333CC", player.energy / def.energy);
      } else if (armDef.usage === ArmUsage.Ammo && armDef.maxAmmo !== undefined) {
        drawBar(
          { x: canvas.width / 2 + 10, y: canvas.height - 20 },
          canvas.width / 2 - 20,
          10,
          "#AAAAAACC",
          "#333333CC",
          player.slotData[selectedSecondary].ammo / armDef.maxAmmo
        );
      }
    }
  }
};

const drawMiniMapPlayer = (center: Position, player: Player, self: Player, miniMapScaleFactor: number) => {
  ctx.save();
  ctx.translate(
    (player.position.x - self.position.x) * miniMapScaleFactor + center.x,
    (player.position.y - self.position.y) * miniMapScaleFactor + center.y
  );
  ctx.fillStyle = teamColorsOpaque[player.team];
  if (defs[player.defIndex].kind === UnitKind.Ship) {
    ctx.rotate(player.heading);
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-7, -4);
    ctx.lineTo(-7, 4);
    ctx.closePath();
  } else {
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, 2 * Math.PI);
  }
  if (player.inoperable) {
    ctx.filter = "grayscale(60%)";
  }
  ctx.fill();
  ctx.restore();
};

const drawMiniMapAsteroid = (center: Position, asteroid: Asteroid, self: Player, miniMapScaleFactor: number) => {
  ctx.save();
  ctx.translate(
    (asteroid.position.x - self.position.x) * miniMapScaleFactor + center.x,
    (asteroid.position.y - self.position.y) * miniMapScaleFactor + center.y
  );
  ctx.fillStyle = "grey";
  ctx.beginPath();
  ctx.arc(0, 0, 2, 0, 2 * Math.PI);
  ctx.fill();
  ctx.restore();
};

const drawMiniMap = (position: Position, width: number, height: number, self: Player, state: GlobalState, miniMapScaleFactor: number) => {
  ctx.fillStyle = "#30303055";
  const margin = 5;
  ctx.fillRect(position.x - margin, position.y - margin, width + margin, height + margin);
  const center = { x: position.x + width / 2, y: position.y + height / 2 };
  for (const [id, asteroid] of state.asteroids) {
    if (
      Math.abs(asteroid.position.x - self.position.x) * miniMapScaleFactor < width / 2 &&
      Math.abs(asteroid.position.y - self.position.y) * miniMapScaleFactor < height / 2
    ) {
      drawMiniMapAsteroid(center, asteroid, self, miniMapScaleFactor);
    }
  }
  for (const [id, player] of state.players) {
    if (player.docked) {
      continue;
    }
    if (
      Math.abs(player.position.x - self.position.x) * miniMapScaleFactor < width / 2 &&
      Math.abs(player.position.y - self.position.y) * miniMapScaleFactor < height / 2
    ) {
      if (player.team === self.team || player.cloak !== CloakedState.Cloaked) {
        drawMiniMapPlayer(center, player, self, miniMapScaleFactor);
      }
    }
  }
};

const drawStars = (self: Player) => {
  const topLeft = { x: self.position.x - canvas.width / 2, y: self.position.y - canvas.height / 2 };
  topLeft.x /= 2;
  topLeft.y /= 2;
  topLeft.x = positiveMod(topLeft.x, starTilingSize.x);
  topLeft.y = positiveMod(topLeft.y, starTilingSize.y);
  const wrapBottom = topLeft.y + canvas.height > starTilingSize.y;
  const wrapRight = topLeft.x + canvas.width > starTilingSize.x;

  ctx.fillStyle = "white";
  for (const star of stars) {
    if (
      star.position.x + 3 >= topLeft.x &&
      star.position.x - 3 <= topLeft.x + canvas.width &&
      star.position.y + 3 >= topLeft.y &&
      star.position.y - 3 <= topLeft.y + canvas.height
    ) {
      ctx.beginPath();
      ctx.arc(star.position.x - topLeft.x, star.position.y - topLeft.y, star.radius, 0, 2 * Math.PI);
      ctx.fill();
    }

    if (
      wrapRight &&
      star.position.x + starTilingSize.x + 3 >= topLeft.x &&
      star.position.x + starTilingSize.x - 3 <= topLeft.x + canvas.width &&
      star.position.y + 3 >= topLeft.y &&
      star.position.y - 3 <= topLeft.y + canvas.height
    ) {
      ctx.beginPath();
      ctx.arc(star.position.x + starTilingSize.x - topLeft.x, star.position.y - topLeft.y, star.radius, 0, 2 * Math.PI);
      ctx.fill();
    }

    if (
      wrapBottom &&
      star.position.x + 3 >= topLeft.x &&
      star.position.x - 3 <= topLeft.x + canvas.width &&
      star.position.y + starTilingSize.y + 3 >= topLeft.y &&
      star.position.y + starTilingSize.y - 3 <= topLeft.y + canvas.height
    ) {
      ctx.beginPath();
      ctx.arc(star.position.x - topLeft.x, star.position.y + starTilingSize.y - topLeft.y, star.radius, 0, 2 * Math.PI);
      ctx.fill();
    }

    if (
      wrapBottom &&
      wrapRight &&
      star.position.x + starTilingSize.x + 3 >= topLeft.x &&
      star.position.x + starTilingSize.x - 3 <= topLeft.x + canvas.width &&
      star.position.y + starTilingSize.y + 3 >= topLeft.y &&
      star.position.y + starTilingSize.y - 3 <= topLeft.y + canvas.height
    ) {
      ctx.beginPath();
      ctx.arc(star.position.x + starTilingSize.x - topLeft.x, star.position.y + starTilingSize.y - topLeft.y, star.radius, 0, 2 * Math.PI);
      ctx.fill();
    }
  }
};

const drawAsteroid = (asteroid: Asteroid, self: Player) => {
  ctx.save();
  ctx.translate(asteroid.position.x - self.position.x + canvas.width / 2, asteroid.position.y - self.position.y + canvas.height / 2);
  let sprite = asteroidSprites[asteroid.defIndex];
  let def = asteroidDefs[asteroid.defIndex];
  if (asteroid.resources < def.resources) {
    drawBar({ x: -sprite.width / 2, y: -sprite.height / 2 - 10 }, sprite.width, 5, "#662222CC", "#333333CC", asteroid.resources / def.resources);
  }
  ctx.rotate(asteroid.heading);
  ctx.drawImage(sprite, -sprite.width / 2, -sprite.height / 2, sprite.width, sprite.height);
  ctx.restore();
};

const drawPlayer = (player: Player, self: Player) => {
  const cloakedAmount = !player.cloak ? 0 : player.cloak / CloakedState.Cloaked;
  if (cloakedAmount === 1 && player.team !== self.team) {
    return;
  }

  const def = defs[player.defIndex];
  ctx.save();

  const cloakOpacity = player.team === self.team ? 0.5 * cloakedAmount : cloakedAmount;
  const cloakFilterString = `blur(${cloakedAmount * 2}px) opacity(${1 - cloakOpacity})`;
  if (cloakedAmount > 0) {
    ctx.filter = cloakFilterString;
  }

  let sprite = composited[player.defIndex * Faction.Count + player.team];
  // let sprite = sprites[player.definitionIndex];

  // const steps = perspectiveRescaling.length;
  // let perspectiveIndex: number;

  // if (player.side && Math.abs(player.side) > def.sideThrustMaxSpeed / steps) {
  //   perspectiveIndex = Math.floor((Math.abs(player.side) / def.sideThrustMaxSpeed) * steps) - 1;
  //   sprite = perspectiveSprites[player.definitionIndex * steps + perspectiveIndex] as ImageBitmap;
  // }

  // if (!sprite) {
  //   sprite = sprites[player.definitionIndex];
  // }

  ctx.translate(player.position.x - self.position.x + canvas.width / 2, player.position.y - self.position.y + canvas.height / 2);

  if (player.inoperable) {
    ctx.filter = "grayscale(80%)";
  } else {
    drawBar({ x: -sprite.width / 2, y: -sprite.height / 2 - 10 }, sprite.width, 5, "#00EE00CC", "#EE0000CC", Math.max(player.health, 0) / def.health);
    drawBar({ x: -sprite.width / 2, y: -sprite.height / 2 - 5 }, sprite.width, 5, "#0022FFCC", "#333333CC", player.energy / def.energy);
  }
  // This effect is pretty bad, but I want something visual to indicate a warp is in progress
  ctx.rotate(player.heading);
  if (player.warping) {
    const warpAmount = Math.abs(player.warping / def.warpTime);
    const warpFramesLeft = def.warpTime - Math.abs(player.warping);
    ctx.filter = `drop-shadow(0 0 ${warpAmount * 10}px #FFFFFF) ${cloakFilterString}`;
    ctx.transform(Math.max(1, 10 / (warpFramesLeft + 3)), 0, 0, Math.min(1, warpFramesLeft / 10), 0, 0);
  }
  // if (sprite !== sprites[player.definitionIndex]) {
  //   ctx.transform(1 + perspectiveRescaling[perspectiveIndex].x, 0, 0, Math.sign(player.side), 0, 0);
  // }
  // ctx.drawImage(stencilSprites[player.definitionIndex], -sprite.width / 2, -sprite.height / 2, sprite.width, sprite.height);
  // ctx.globalCompositeOperation = "source-in";
  // ctx.fillStyle = teamColorsOpaque[player.team];
  // ctx.fillRect(-sprite.width / 2, -sprite.height / 2, sprite.width, sprite.height);
  // ctx.globalCompositeOperation = "source-over";
  // ctx.drawImage(sprite, -sprite.width / 2, -sprite.height / 2, sprite.width, sprite.height);
  if (player.disabled) {
    ctx.filter = `saturate(${Math.sin(player.id / 1000 + highlightPhase * 3.3) * 50 + 50}%)`;
  }

  ctx.drawImage(sprite, -sprite.width / 2, -sprite.height / 2, sprite.width, sprite.height);

  if (player.disabled) {
    ctx.filter = `saturate(0%) ${cloakFilterString}`;
  }

  ctx.rotate(-player.heading);
  if (!player.inoperable) {
    // drawBar({ x: -sprite.width / 2, y: -sprite.height / 2 - 10 }, sprite.width, 5, "#00EE00CC", "#EE0000CC", Math.max(player.health, 0) / def.health);
    // drawBar({ x: -sprite.width / 2, y: -sprite.height / 2 - 5 }, sprite.width, 5, "#0022FFCC", "#333333CC", player.energy / def.energy);
  } else {
    // TODO Make this not care about how many teams there are
    ctx.filter = "grayscale(0%)";
    ctx.globalAlpha = 0.9;
    drawBar({ x: -sprite.width * 0.4, y: -27 }, sprite.width * 0.8, 12, allianceColorOpaque, "#333333DD", player.repairs[0] / def.repairsRequired);
    drawBar(
      { x: -sprite.width * 0.4, y: -13 },
      sprite.width * 0.8,
      12,
      confederationColorOpaque,
      "#333333DD",
      player.repairs[1] / def.repairsRequired
    );
    drawBar({ x: -sprite.width * 0.4, y: 1 }, sprite.width * 0.8, 12, rogueColorOpaque, "#333333DD", player.repairs[2] / def.repairsRequired);
    drawBar({ x: -sprite.width * 0.4, y: 15 }, sprite.width * 0.8, 12, scourgeColorOpaque, "#333333DD", player.repairs[3] / def.repairsRequired);
  }
  ctx.restore();
};

const drawMissile = (missile: Missile, self: Player) => {
  ctx.save();
  ctx.translate(missile.position.x - self.position.x + canvas.width / 2, missile.position.y - self.position.y + canvas.height / 2);
  ctx.rotate(missile.heading);
  const sprite = missileSprites[missile.defIndex];
  ctx.drawImage(sprite, -sprite.width / 2, -sprite.height / 2, sprite.width, sprite.height);
  ctx.restore();
};

const drawDockText = (dockKey: string) => {
  ctx.fillStyle = "white";
  ctx.font = "30px Arial";
  ctx.textAlign = "center";
  ctx.fillText(`Press ${dockKey} to dock`, canvas.width / 2, canvas.height / 2 + 200);
};

const drawRepairText = (repairKey: string) => {
  ctx.fillStyle = "white";
  ctx.font = "30px Arial";
  ctx.textAlign = "center";
  ctx.fillText(`Press ${repairKey} to repair`, canvas.width / 2, canvas.height / 2 + 200);
};

let highlightPhase = 0;

const drawHighlight = (self: Player, player: Circle) => {
  ctx.save();
  ctx.translate(player.position.x - self.position.x + canvas.width / 2, player.position.y - self.position.y + canvas.height / 2);
  const amount = Math.cos(highlightPhase) * 0.3 + 0.3;
  ctx.fillStyle = `rgba(255, 255, 255, ${amount})`;
  ctx.beginPath();
  ctx.arc(0, 0, player.radius + 5, 0, 2 * Math.PI);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
};

const drawTarget = (where: Rectangle, self: Player, target: Player) => {
  ctx.fillStyle = "#30303055";
  const margin = 5;
  ctx.fillRect(where.x - margin, where.y - margin, where.width + margin, where.height + margin);
  const sprite = composited[target.defIndex * Faction.Count + target.team];
  const maxDimension = Math.max(sprite.width, sprite.height);
  let scale = (where.width - margin * 2) / maxDimension / 2;
  if (scale > 1) {
    scale = 1;
  }
  ctx.save();
  ctx.translate(where.x + where.width / 2, where.y + where.height / 2);
  ctx.scale(scale, scale);
  drawBar(
    { x: -sprite.width / 2, y: -sprite.height / 2 - 10 },
    sprite.width,
    5 / scale,
    "#00EE00CC",
    "#EE0000CC",
    target.health / defs[target.defIndex].health
  );
  drawBar(
    { x: -sprite.width / 2, y: -sprite.height / 2 - 5 },
    sprite.width,
    5 / scale,
    "#0022FFCC",
    "#333333CC",
    target.energy / defs[target.defIndex].energy
  );
  ctx.rotate(target.heading);
  ctx.drawImage(sprite, -sprite.width / 2, -sprite.height / 2, sprite.width, sprite.height);
  ctx.restore();
  const name = getNameOfPlayer(target);
  ctx.textAlign = "center";
  ctx.fillStyle = "white";
  if (name) {
    ctx.font = "18px Arial";
    ctx.fillText(name, where.x + where.width / 2, where.y + where.height - 20);
  }
  const def = defs[target.defIndex];
  ctx.font = "12px Arial";
  ctx.fillText(def.name, where.x + where.width / 2, where.y + 15);
};

const drawTargetAsteroid = (where: Rectangle, self: Player, targetAsteroid: Asteroid) => {
  ctx.fillStyle = "#30303055";
  const margin = 5;
  ctx.fillRect(where.x - margin, where.y - margin, where.width + margin, where.height + margin);
  const sprite = asteroidSprites[targetAsteroid.defIndex];
  const maxDimension = Math.max(sprite.width, sprite.height);
  let scale = (where.width - margin * 2) / maxDimension / 2;
  if (scale > 1) {
    scale = 1;
  }
  ctx.save();
  ctx.translate(where.x + where.width / 2, where.y + where.height / 2);
  ctx.scale(scale, scale);
  drawBar(
    { x: -sprite.width / 2, y: -sprite.height / 2 - 10 },
    sprite.width,
    5 / scale,
    "#662222CC",
    "#333333CC",
    targetAsteroid.resources / asteroidDefs[targetAsteroid.defIndex].resources
  );
  ctx.rotate(targetAsteroid.heading);
  ctx.drawImage(sprite, -sprite.width / 2, -sprite.height / 2, sprite.width, sprite.height);
  ctx.restore();
  const def = asteroidDefs[targetAsteroid.defIndex];
  ctx.font = "12px Arial";
  ctx.fillText(def.mineral, where.x + where.width / 2, where.y + 15);
};

const drawArrow = (self: Player, targetPosition: Position, fillStyle: string, highlight: boolean, distance: number) => {
  const margin = 25;
  const heading = findHeadingBetween(self.position, targetPosition);
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
  ctx.font = "12px Arial";
  ctx.textAlign = "center";
  ctx.fillText(`${Math.round(distance)}`, 0, 0);
  ctx.restore();
};

const drawName = (self: Player, player: Player) => {
  const name = getNameOfPlayer(player);
  if (name) {
    ctx.save();
    ctx.translate(player.position.x - self.position.x + canvas.width / 2, player.position.y - self.position.y + canvas.height / 2);
    ctx.fillStyle = "white";
    ctx.font = "14px Arial";
    ctx.textAlign = "center";
    ctx.fillText(name, 0, -player.radius - 32);
    ctx.restore();
  }
};

const drawChat = (self: Player, player: Player, chat: ChatMessage) => {
  ctx.save();
  ctx.translate(player.position.x - self.position.x + canvas.width / 2, player.position.y - self.position.y + canvas.height / 2);
  // TODO Maybe draw a cute little chat bubble
  ctx.fillStyle = "white";
  ctx.font = "12px Arial";
  ctx.textAlign = "center";
  ctx.fillText(chat.message, 0, -player.radius - 15);
  ctx.restore();
};

const drawChats = (self: Player, players: Map<number, Player>, chats: IterableIterator<ChatMessage>) => {
  for (const chat of chats) {
    const player = players.get(chat.id);
    if (player && !player.docked) {
      drawChat(self, player, chat);
    }
  }
};

type Message = {
  what: string;
  framesRemaining: number;
  whileDocked: boolean;
  color: string;
};

let messages: Message[] = [];

// const pushMessage = (what: string, framesRemaining: number = 240, color = "white") => {
//   messages.push({ what, framesRemaining, whileDocked: !!lastSelf?.docked, color });
// };

const reduceMessageTimeRemaining = (sixtieths: number) => {
  messages = messages.filter((message) => {
    message.framesRemaining -= sixtieths;
    return message.framesRemaining > 0;
  });
};

const drawMessages = () => {
  // draw all the messages at the top of the screen
  ctx.font = "20px Arial";
  ctx.textAlign = "center";
  let y = 30;
  for (const message of messages) {
    const savedAlpha = ctx.globalAlpha;
    const alpha = Math.min(message.framesRemaining / 60, 1);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = message.color;
    ctx.fillText(message.what, canvas.width / 2, y);
    y += 30 * alpha;
    ctx.globalAlpha = savedAlpha;
  }
};

// let lastDockedMessage: Message | undefined = undefined;

// let dockingTextNotificationTimeout: number | undefined = undefined;

// const displayDockedMessages = () => {
//   const filteredMessages = messages.filter((message) => message.whileDocked);

//   // No messages to display
//   if (filteredMessages.length === 0 && lastDockedMessage) {
//     dockedMessage.classList.remove("fadeIn");
//     dockedMessage.classList.add("fadeOut");
//     lastDockedMessage = undefined;
//     return;
//   }
//   const messageToDisplay = filteredMessages[filteredMessages.length - 1];

//   if (filteredMessages.length && (!lastDockedMessage || lastDockedMessage !== messageToDisplay)) {
//     dockedMessageText.innerText = messageToDisplay.what;
//     if (!lastDockedMessage) {
//       // New message to show
//       dockedMessage.classList.add("fadeIn");
//       dockedMessage.style.display = "block";
//     } else {
//       // New message to show, but we're already showing a message
//       dockedMessageText.classList.add("notifyChanged");
//       if (dockingTextNotificationTimeout) {
//         clearTimeout(dockingTextNotificationTimeout);
//       }
//       dockingTextNotificationTimeout = window.setTimeout(() => {
//         dockedMessageText.classList.remove("notifyChanged");
//       }, 500);
//     }
//     lastDockedMessage = messageToDisplay;
//   }
// };

const drawLine = (self: Player, line: Line) => {
  const to = { x: line.to.x - self.position.x + canvas.width / 2, y: line.to.y - self.position.y + canvas.height / 2 };
  const from = { x: line.from.x - self.position.x + canvas.width / 2, y: line.from.y - self.position.y + canvas.height / 2 };
  ctx.save();
  ctx.strokeStyle = "green";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
};

type FadingCollectable = Collectable & { framesRemaining: number };
type FadingMine = Mine & { framesRemaining: number };

let fadingCollectables: FadingCollectable[] = [];
let fadingMines: FadingMine[] = [];

const fadeOutCollectable = (collectable: Collectable) => {
  fadingCollectables.push({ ...collectable, framesRemaining: 180 });
};

const fadeOutMine = (mine: Mine) => {
  fadingMines.push({ ...mine, framesRemaining: 180 });
};

const reduceCollectableTimeRemaining = (sixtieths: number) => {
  fadingCollectables = fadingCollectables.filter((fadingCollectable) => {
    fadingCollectable.framesRemaining -= sixtieths;
    return fadingCollectable.framesRemaining > 0;
  });
};

const reduceMineTimeRemaining = (sixtieths: number) => {
  fadingMines = fadingMines.filter((fadingMine) => {
    fadingMine.framesRemaining -= sixtieths;
    return fadingMine.framesRemaining > 0;
  });
};

const drawCollectable = (self: Player, collectable: Collectable) => {
  if (infinityNorm(collectable.position, self.position) > Math.max(canvas.width, canvas.height) / 2 + collectable.radius) {
    return;
  }
  ctx.save();
  const scale = 0.85 + 0.15 * Math.sin(collectable.phase);
  ctx.translate(collectable.position.x - self.position.x + canvas.width / 2, collectable.position.y - self.position.y + canvas.height / 2);
  ctx.rotate(collectable.heading);
  const sprite = collectableSprites[collectable.index];
  ctx.drawImage(sprite, (-sprite.width * scale) / 2, (-sprite.height * scale) / 2, sprite.width * scale, sprite.height * scale);
  ctx.restore();
};

const drawCollectables = (self: Player, collectables: IterableIterator<Collectable>, sixtieths: number) => {
  for (const collectable of collectables) {
    collectable.phase += sixtieths * 0.03;
    collectable.heading += sixtieths * 0.04;
    drawCollectable(self, collectable);
  }
};

const drawFadingCollectable = (self: Player, fadingCollectable: FadingCollectable) => {
  if (
    !fadingCollectable?.position ||
    infinityNorm(fadingCollectable.position, self.position) > Math.max(canvas.width, canvas.height) / 2 + fadingCollectable.radius
  ) {
    return;
  }
  ctx.save();
  ctx.filter = `grayscale(100%)`;
  const scale = (0.85 + 0.15 * Math.sin(fadingCollectable.phase)) * Math.min(fadingCollectable.framesRemaining / 90, 1);
  ctx.translate(
    fadingCollectable.position.x - self.position.x + canvas.width / 2,
    fadingCollectable.position.y - self.position.y + canvas.height / 2
  );
  ctx.rotate(fadingCollectable.heading);
  const sprite = collectableSprites[fadingCollectable.index];
  ctx.drawImage(sprite, (-sprite.width * scale) / 2, (-sprite.height * scale) / 2, sprite.width * scale, sprite.height * scale);
  ctx.restore();
};

const drawFadingCollectables = (self: Player) => {
  for (const fadingCollectable of fadingCollectables) {
    drawFadingCollectable(self, fadingCollectable);
  }
};

const drawMines = (self: Player, mines: IterableIterator<Mine>, sixtieths: number) => {
  for (const mine of mines) {
    mine.phase += sixtieths * 0.03;
    mine.heading += sixtieths * 0.04;
    if (infinityNorm(mine.position, self.position) > Math.max(canvas.width, canvas.height) / 2 + mine.radius) {
      continue;
    }
    ctx.save();
    ctx.translate(mine.position.x - self.position.x + canvas.width / 2, mine.position.y - self.position.y + canvas.height / 2);
    ctx.rotate(mine.heading);
    ctx.fillStyle = "gray";
    // draw a plus shape
    ctx.fillRect(-30 / 2, -30 / 8, 30, 30 / 4);
    ctx.fillRect(-30 / 8, -30 / 2, 30 / 4, 30);
    ctx.closePath();
    ctx.beginPath();
    ctx.fillStyle = `rgb(255, 0, 0, ${0.5 + 0.5 * Math.sin(mine.phase)})`;
    ctx.arc(0, 0, 4, 0, 2 * Math.PI);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
};

const drawFadingMines = (self: Player) => {
  for (const fadingMine of fadingMines) {
    if (infinityNorm(fadingMine.position, self.position) > Math.max(canvas.width, canvas.height) / 2 + fadingMine.radius) {
      continue;
    }
    ctx.save();
    ctx.translate(fadingMine.position.x - self.position.x + canvas.width / 2, fadingMine.position.y - self.position.y + canvas.height / 2);
    ctx.rotate(fadingMine.heading);
    ctx.scale(Math.min(fadingMine.framesRemaining / 90, 1), Math.min(fadingMine.framesRemaining / 90, 1));
    ctx.globalAlpha = Math.min(fadingMine.framesRemaining / 90, 1);
    ctx.fillStyle = "gray";
    // draw a plus shape
    ctx.fillRect(-30 / 2, -30 / 8, 30, 30 / 4);
    ctx.fillRect(-30 / 8, -30 / 2, 30 / 4, 30);
    ctx.closePath();
    ctx.restore();
  }
};

let closestEdgeDistance = 0;

const drawSectorBounds = (self: Player) => {
  let closestEdgeDirection: CardinalDirection | null = null;

  const distanceToLeft = self.position.x - sectorBounds.x;
  const distanceToRight = sectorBounds.x + sectorBounds.width - self.position.x;
  const distanceToTop = self.position.y - sectorBounds.y;
  const distanceToBottom = sectorBounds.y + sectorBounds.height - self.position.y;

  const distances = [distanceToLeft, distanceToRight, distanceToTop, distanceToBottom];
  closestEdgeDistance = Math.min(...distances);
  if (closestEdgeDistance === distanceToLeft) {
    closestEdgeDirection = CardinalDirection.Left;
  } else if (closestEdgeDistance === distanceToRight) {
    closestEdgeDirection = CardinalDirection.Right;
  } else if (closestEdgeDistance === distanceToTop) {
    closestEdgeDirection = CardinalDirection.Up;
  } else if (closestEdgeDistance === distanceToBottom) {
    closestEdgeDirection = CardinalDirection.Down;
  }

  if (distanceToBottom <= canvas.height / 2) {
    ctx.save();
    ctx.setLineDash([10, 10]);
    ctx.strokeStyle = "green";
    ctx.beginPath();
    ctx.moveTo(0, canvas.height / 2 + distanceToBottom);
    ctx.lineTo(canvas.width, canvas.height / 2 + distanceToBottom);
    ctx.stroke();
    ctx.closePath();
    ctx.restore();
  }
  if (distanceToTop <= canvas.height / 2) {
    ctx.save();
    ctx.setLineDash([10, 10]);
    ctx.strokeStyle = "green";
    ctx.beginPath();
    ctx.moveTo(0, canvas.height / 2 - distanceToTop);
    ctx.lineTo(canvas.width, canvas.height / 2 - distanceToTop);
    ctx.stroke();
    ctx.closePath();
    ctx.restore();
  }
  if (distanceToLeft <= canvas.width / 2) {
    ctx.save();
    ctx.setLineDash([10, 10]);
    ctx.strokeStyle = "green";
    ctx.beginPath();
    ctx.moveTo(canvas.width / 2 - distanceToLeft, 0);
    ctx.lineTo(canvas.width / 2 - distanceToLeft, canvas.height);
    ctx.stroke();
    ctx.closePath();
    ctx.restore();
  }
  if (distanceToRight <= canvas.width / 2) {
    ctx.save();
    ctx.setLineDash([10, 10]);
    ctx.strokeStyle = "green";
    ctx.beginPath();
    ctx.moveTo(canvas.width / 2 + distanceToRight, 0);
    ctx.lineTo(canvas.width / 2 + distanceToRight, canvas.height);
    ctx.stroke();
    ctx.closePath();
    ctx.restore();
  }

  return closestEdgeDirection;
};

const drawEdgeArrow = (closestEdgeDirection: CardinalDirection) => {
  switch (closestEdgeDirection) {
    case CardinalDirection.Up:
      if (closestEdgeDistance < canvas.height / 2) {
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
      if (closestEdgeDistance < canvas.height / 2) {
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
      if (closestEdgeDistance < canvas.width / 2) {
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
      if (closestEdgeDistance < canvas.width / 2) {
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

type ArrowData = {
  kind: TargetKind;
  position: Position;
  team?: Faction;
  target: boolean;
  distance: number;
  depleted?: boolean;
  inoperable?: boolean;
};

const drawEverything = (
  state: GlobalState,
  self: Player,
  target: Player | undefined,
  targetAsteroid: Asteroid | undefined,
  me: number,
  selectedSecondary: number,
  keybind: KeyBindings,
  sixtieths: number,
  chats: Map<number, ChatMessage>
) => {
  try {
    highlightPhase += 0.1 * sixtieths;
    if (highlightPhase > 2 * Math.PI) {
      highlightPhase -= 2 * Math.PI;
    }

    reduceMessageTimeRemaining(sixtieths);
    reduceMineTimeRemaining(sixtieths);
    reduceCollectableTimeRemaining(sixtieths);

    clearCanvas();
    if (!self && !lastSelf) {
      // We can't draw anything without being initialized yet
      return;
    }

    let closestEdgeDirection: CardinalDirection | null = null;

    if (lastSelf) {
      drawStars(lastSelf);
      closestEdgeDirection = drawSectorBounds(lastSelf);
    }

    const arrows: ArrowData[] = [];

    for (const [id, asteroid] of state.asteroids) {
      if (infinityNorm(asteroid.position, lastSelf.position) < Math.max(canvas.width, canvas.height) / 2 + asteroid.radius) {
        drawAsteroid(asteroid, lastSelf);
        if (targetAsteroid && targetAsteroid.id === id) {
          drawHighlight(lastSelf, asteroid);
        }
      }
      if (self && (selectedSecondary === 0 || targetAsteroid)) {
        const def = defs[self.defIndex];
        const distance = l2Norm(asteroid.position, self.position);
        if (
          distance < def.scanRange &&
          (Math.abs(self.position.x - asteroid.position.x) > canvas.width / 2 || Math.abs(self.position.y - asteroid.position.y) > canvas.height / 2)
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

    drawFadingMines(lastSelf);
    drawMines(lastSelf, state.mines.values(), sixtieths);

    for (const [id, player] of state.players) {
      if (player.docked) {
        continue;
      }
      if (id !== me) {
        if (infinityNorm(player.position, lastSelf.position) < Math.max(canvas.width, canvas.height) / 2 + player.radius) {
          if (target && id === target.id) {
            drawHighlight(lastSelf, player);
          }
          drawPlayer(player, lastSelf);
          if (player.team === lastSelf.team || player.cloak !== CloakedState.Cloaked) {
            drawName(lastSelf, player);
          }
        }
      }
      if (self) {
        const def = defs[self.defIndex];
        const distance = l2Norm(player.position, self.position);
        const playerDef = defs[player.defIndex];
        if (
          player !== self &&
          (distance < def.scanRange || playerDef.kind === UnitKind.Station) &&
          (player.team === self.team || !player.cloak) &&
          !player.docked &&
          (Math.abs(self.position.x - player.position.x) > canvas.width / 2 || Math.abs(self.position.y - player.position.y) > canvas.height / 2)
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
    }

    drawFadingCollectables(lastSelf);
    drawCollectables(lastSelf, state.collectables.values(), sixtieths);

    if (self && !self.docked) {
      drawPlayer(self, self);
    }
    for (const [id, missile] of state.missiles) {
      drawMissile(missile, lastSelf);
    }
    for (const projectile of state.projectiles.values()) {
      drawProjectile(projectile, lastSelf);
    }
    drawEffects(lastSelf, state, sixtieths);
    if (self) {
      drawChats(self, state.players, chats.values());
    }
    if (self && !self.docked) {
      drawMiniMap({ x: canvas.width - 210, y: canvas.height - 230 }, 200, 200, self, state, 0.03);
      drawHUD(self, selectedSecondary);
      if (self.canDock) {
        drawDockText(keybind.dock);
      }
      if (self.canRepair) {
        drawRepairText(keybind.dock);
      }
      if (target) {
        drawTarget({ x: canvas.width - 210, y: 15, width: 200, height: 200 }, self, target);
      }
      if (targetAsteroid) {
        drawTargetAsteroid({ x: canvas.width - 210, y: 15, width: 200, height: 200 }, self, targetAsteroid);
      }
      for (const arrow of arrows) {
        if (arrow.team !== undefined) {
          drawArrow(self, arrow.position, arrow.inoperable ? "grey" : teamColorsOpaque[arrow.team], arrow.target, arrow.distance);
        } else {
          drawArrow(self, arrow.position, arrow.depleted ? "#331111" : "#662222", arrow.target, arrow.distance);
        }
      }
      if (closestEdgeDistance < 3000) {
        drawEdgeArrow(closestEdgeDirection);
      }
      drawMessages();
    } else if (self) {
      // displayDockedMessages();
    }
  } catch (e) {
    console.error(e);
  }
};

const canvasCoordsToGameCoords = (x: number, y: number) => {
  if (!lastSelf) {
    return undefined;
  }
  return {
    x: x - canvas.width / 2 + lastSelf.position.x,
    y: y - canvas.height / 2 + lastSelf.position.y,
  };
};

export {
  drawEverything,
  initDrawing,
  ctx,
  canvas,
  effectSprites,
  sprites,
  composited,
  // dockedMessage,
  ChatMessage,
  initStars,
  // pushMessage,
  fadeOutCollectable,
  fadeOutMine,
  canvasCoordsToGameCoords,
  adapter,
};
