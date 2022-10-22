import { armDefs, ArmUsage, asteroidDefs, defs, missileDefs, UnitKind } from "./defs";
import { drawEffects, initEffects, effectSpriteDefs } from "./effects";
import {
  Asteroid,
  availableCargoCapacity,
  Ballistic,
  ChatMessage,
  Circle,
  findHeadingBetween,
  GlobalState,
  Missile,
  Player,
  Position,
  positiveMod,
  Rectangle,
} from "./game";
import { KeyBindings } from "./keybindings";
import { sfc32 } from "./prng";

let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
let sprites: ImageBitmap[] = [];
let asteroidSprites: ImageBitmap[] = [];
let missileSprites: ImageBitmap[] = [];
let effectSprites: ImageBitmap[] = [];

let stars: Circle[] = [];
let starTilingSize = { x: 5000, y: 5000 };

const initStars = (sector: number) => {
  stars.length = 0;
  const prng = sfc32(sector, 3437, 916, 3158);

  for (let i = 0; i < 1000; i++) {
    stars.push({
      position: { x: prng() * starTilingSize.x, y: prng() * starTilingSize.y },
      radius: prng() * 2 + 1,
    });
  }
};

// Arguably thing should be in effects.ts, but crosscutting is basically unavoidable and it is almost identical the the other loading functions
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

const initDrawing = (callback: () => void) => {
  initEffects();
  canvas = document.getElementById("canvas") as HTMLCanvasElement;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  window.addEventListener("resize", () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  });
  ctx = canvas.getContext("2d");
  const spriteSheet = new Image();
  spriteSheet.onload = () => {
    const spritePromises: Promise<ImageBitmap>[] = [];
    for (let i = 0; i < defs.length; i++) {
      spritePromises.push(createImageBitmap(spriteSheet, defs[i].sprite.x, defs[i].sprite.y, defs[i].sprite.width, defs[i].sprite.height));
    }
    Promise.all(spritePromises).then((completed) => {
      sprites = completed;
      loadAsteroidSprites(spriteSheet, () => {
        loadMissileSprites(spriteSheet, () => {
          loadEffectSprites(spriteSheet, callback);
        });
      });
    });
  };
  spriteSheet.src = "resources/sprites.png";
};

const clearCanvas = () => {
  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
};

const projectRayFromCenterOfRect = (rect: Rectangle, angle: number) => {
  const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  if (rect.width * Math.abs(sin) < rect.height * Math.abs(cos)) {
    const x = (rect.width / 2) * Math.sign(cos);
    const y = x * Math.tan(angle);
    return { x: center.x + x, y: center.y + y };
  } else {
    const y = (rect.height / 2) * Math.sign(sin);
    const x = y / Math.tan(angle);
    return { x: center.x + x, y: center.y + y };
  }
};

const drawBar = (position: Position, width: number, height: number, primary: string, secondary: string, amount: number) => {
  ctx.fillStyle = primary;
  ctx.fillRect(position.x, position.y, width * amount, height);
  ctx.fillStyle = secondary;
  ctx.fillRect(position.x + width * amount, position.y, width * (1 - amount), height);
};

const drawHUD = (player: Player, selectedSecondary: number) => {
  const def = defs[player.definitionIndex];
  const totalCargo = def.cargoCapacity - availableCargoCapacity(player);
  drawBar(
    { x: 10, y: canvas.height - 20 },
    canvas.width / 2 - 20,
    10,
    "#774422CC",
    "#333333CC",
    totalCargo / defs[player.definitionIndex].cargoCapacity
  );
  for (let i = 0; i < player.armIndices.length; i++) {
    let armDef = armDefs[player.armIndices[i]];
    ctx.fillStyle = i === selectedSecondary ? "yellow" : "white";
    ctx.font = "14px Arial";
    ctx.textAlign = "left";
    ctx.fillText(armDef.name, 10, canvas.height - 10 - (player.armIndices.length - i) * 20);
    if (i === selectedSecondary) {
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
  ctx.fillStyle = defs[player.definitionIndex].team ? "red" : "aqua";
  if (defs[player.definitionIndex].kind === UnitKind.Ship) {
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
      drawMiniMapPlayer(center, player, self, miniMapScaleFactor);
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
  let sprite = asteroidSprites[asteroid.definitionIndex];
  let def = asteroidDefs[asteroid.definitionIndex];
  if (asteroid.resources < def.resources) {
    drawBar({ x: -sprite.width / 2, y: -sprite.height / 2 - 10 }, sprite.width, 5, "#662222CC", "#333333CC", asteroid.resources / def.resources);
  }
  ctx.rotate(asteroid.heading);
  ctx.drawImage(sprite, -sprite.width / 2, -sprite.height / 2, sprite.width, sprite.height);
  ctx.restore();
};

const drawPlayer = (player: Player, self: Player) => {
  ctx.save();
  ctx.translate(player.position.x - self.position.x + canvas.width / 2, player.position.y - self.position.y + canvas.height / 2);
  let sprite = sprites[player.definitionIndex];
  if (player.inoperable) {
    ctx.filter = "grayscale(80%)";
    ctx.rotate(player.heading);
  } else {
    drawBar(
      { x: -sprite.width / 2, y: -sprite.height / 2 - 10 },
      sprite.width,
      5,
      "#00EE00CC",
      "#EE0000CC",
      Math.max(player.health, 0) / defs[player.definitionIndex].health
    );
    drawBar(
      { x: -sprite.width / 2, y: -sprite.height / 2 - 5 },
      sprite.width,
      5,
      "#0022FFCC",
      "#333333CC",
      player.energy / defs[player.definitionIndex].energy
    );
    ctx.rotate(player.heading);
  }
  // This effect is pretty bad, but I want something visual to indicate a warp is in progress
  if (player.warping) {
    const def = defs[player.definitionIndex];
    const warpAmount = player.warping / def.warpTime;
    ctx.filter = `hue-rotate(${warpAmount * Math.PI * 2}rad) saturate(${(1 - warpAmount) * 100}%)`;
  }
  ctx.drawImage(sprite, -sprite.width / 2, -sprite.height / 2, sprite.width, sprite.height);

  ctx.restore();
};

const drawMissile = (missile: Missile, self: Player) => {
  ctx.save();
  ctx.translate(missile.position.x - self.position.x + canvas.width / 2, missile.position.y - self.position.y + canvas.height / 2);
  ctx.rotate(missile.heading);
  const sprite = missileSprites[missile.definitionIndex];
  ctx.drawImage(sprite, -sprite.width / 2, -sprite.height / 2, sprite.width, sprite.height);
  ctx.restore();
};

const drawProjectile = (projectile: Ballistic, self: Player) => {
  ctx.save();
  ctx.translate(projectile.position.x - self.position.x + canvas.width / 2, projectile.position.y - self.position.y + canvas.height / 2);
  ctx.beginPath();
  ctx.arc(0, 0, projectile.radius, 0, 2 * Math.PI);
  ctx.fillStyle = "white";
  ctx.closePath();
  ctx.fill();

  // draw a tail
  const tailLength = 20;
  const tailEnd = { x: -Math.cos(projectile.heading) * tailLength, y: -Math.sin(projectile.heading) * tailLength };
  const gradient = ctx.createLinearGradient(0, 0, tailEnd.x, tailEnd.y);
  gradient.addColorStop(0, "#FFFFFFFF");
  gradient.addColorStop(1, "#FFFFFF00");
  ctx.strokeStyle = gradient;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(tailEnd.x, tailEnd.y);
  ctx.closePath();
  ctx.stroke();

  ctx.restore();
};

const drawDockText = (dockKey: string) => {
  ctx.fillStyle = "white";
  ctx.font = "30px Arial";
  ctx.textAlign = "center";
  ctx.fillText(`Press ${dockKey} to dock`, canvas.width / 2, canvas.height / 2 + 200);
};

let secondaryFlashTimeRemaining = 0;

const drawSecondaryText = (self: Player, selectedSecondary: number) => {
  ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(1, secondaryFlashTimeRemaining / 50)})`;
  ctx.font = "18px Arial";
  ctx.textAlign = "center";
  const armamentDef = armDefs[self.armIndices[selectedSecondary]];
  ctx.fillText(`${selectedSecondary} - ${armamentDef.name}`, canvas.width / 2, 20);
};

// This is only for drawing purposes (if we die we need to keep the last position)
let lastSelf: Player;

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
  const sprite = sprites[target.definitionIndex];
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
    target.health / defs[target.definitionIndex].health
  );
  drawBar(
    { x: -sprite.width / 2, y: -sprite.height / 2 - 5 },
    sprite.width,
    5 / scale,
    "#0022FFCC",
    "#333333CC",
    target.energy / defs[target.definitionIndex].energy
  );
  ctx.rotate(target.heading);
  ctx.drawImage(sprite, -sprite.width / 2, -sprite.height / 2, sprite.width, sprite.height);
  ctx.restore();
};

const drawTargetAsteroid = (where: Rectangle, self: Player, targetAsteroid: Asteroid) => {
  ctx.fillStyle = "#30303055";
  const margin = 5;
  ctx.fillRect(where.x - margin, where.y - margin, where.width + margin, where.height + margin);
  const sprite = asteroidSprites[targetAsteroid.definitionIndex];
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
    targetAsteroid.resources / asteroidDefs[targetAsteroid.definitionIndex].resources
  );
  ctx.rotate(targetAsteroid.heading);
  ctx.drawImage(sprite, -sprite.width / 2, -sprite.height / 2, sprite.width, sprite.height);
  ctx.restore();
};

const drawTargetArrow = (self: Player, target: Circle, fillStyle: string) => {
  const margin = 25;
  const heading = findHeadingBetween(self.position, target.position);
  const intersection = projectRayFromCenterOfRect({ x: 0, y: 0, width: canvas.width, height: canvas.height }, heading);
  const position = { x: intersection.x - Math.cos(heading) * margin, y: intersection.y - Math.sin(heading) * margin };
  ctx.save();
  ctx.translate(position.x, position.y);
  ctx.rotate(heading);
  ctx.fillStyle = fillStyle;
  ctx.beginPath();
  ctx.moveTo(14, 0);
  ctx.lineTo(-14, -8);
  ctx.lineTo(-14, 8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
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

const drawEverything = (
  state: GlobalState,
  self: Player,
  target: Player | undefined,
  targetAsteroid: Asteroid | undefined,
  me: number,
  selectedSecondary: number,
  keybind: KeyBindings,
  sixtieths: number,
  chats: Map<number, ChatMessage>,
) => {
  highlightPhase += 0.1 * sixtieths;
  if (highlightPhase > 2 * Math.PI) {
    highlightPhase -= 2 * Math.PI;
  }
  if (secondaryFlashTimeRemaining > 0) {
    secondaryFlashTimeRemaining -= sixtieths;
  }

  clearCanvas();
  if (self) {
    lastSelf = self;
  }
  if (lastSelf) {
    drawStars(lastSelf);
  }
  for (const [id, asteroid] of state.asteroids) {
    drawAsteroid(asteroid, lastSelf);
    if (targetAsteroid && targetAsteroid.id === id) {
      drawHighlight(lastSelf, asteroid);
    }
  }
  for (const [id, player] of state.players) {
    if (player.docked) {
      continue;
    }
    if (id !== me) {
      if (target && id === target.id) {
        drawHighlight(lastSelf, player);
      }
      drawPlayer(player, lastSelf);
    }
  }
  if (self && !self.docked) {
    drawPlayer(self, self);
  }
  for (const [id, missile] of state.missiles) {
    drawMissile(missile, lastSelf);
  }
  for (const [id, projectiles] of state.projectiles) {
    for (const projectile of projectiles) {
      drawProjectile(projectile, lastSelf);
    }
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
    if (secondaryFlashTimeRemaining > 0) {
      drawSecondaryText(self, selectedSecondary);
    }
    if (target) {
      drawTarget({ x: canvas.width - 210, y: 15, width: 200, height: 200 }, self, target);
      if (Math.abs(self.position.x - target.position.x) > canvas.width / 2 || Math.abs(self.position.y - target.position.y) > canvas.height / 2) {
        drawTargetArrow(self, target, defs[target.definitionIndex].team ? "red" : "aqua");
      }
    } else if (targetAsteroid) {
      drawTargetAsteroid({ x: canvas.width - 210, y: 15, width: 200, height: 200 }, self, targetAsteroid);
      if (
        Math.abs(self.position.x - targetAsteroid.position.x) > canvas.width / 2 ||
        Math.abs(self.position.y - targetAsteroid.position.y) > canvas.height / 2
      ) {
        drawTargetArrow(self, targetAsteroid, "white");
      }
    }
  }
};

const flashSecondary = () => {
  secondaryFlashTimeRemaining = 90;
};

export { drawEverything, initDrawing, flashSecondary, ctx, canvas, effectSprites, sprites, ChatMessage, initStars };
