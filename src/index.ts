import { connect, bindAction, register, sendInput, sendDock, sendUndock, sendRespawn } from "./net";
import {
  GlobalState,
  Position,
  Circle,
  Rectangle,
  Input,
  Player,
  update,
  applyInputs,
  Ballistic,
  positiveMod,
  ticksPerSecond,
  fractionalUpdate,
  setCanDock,
  findNextTarget,
  findPreviousTarget,
  findHeadingBetween,
} from "./game";
import { init as initDialog, show as showDialog, hide as hideDialog, clear as clearDialog, horizontalCenter } from "./dialog";
import { defs, initDefs } from "./defs";

// TODO Move drawing to a separate file
let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
let sprites: ImageBitmap[] = [];

let stars: Circle[] = [];
let starTilingSize = { x: 5000, y: 5000 };

const initStars = () => {
  for (let i = 0; i < 1000; i++) {
    stars.push({
      position: { x: Math.random() * starTilingSize.x, y: Math.random() * starTilingSize.y },
      radius: Math.random() * 2 + 1,
    });
  }
};

const initLocals = (callback: () => void) => {
  initDefs();
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
      callback();
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

const drawHUD = (player: Player) => {
  // drawBar({ x: 10, y: canvas.height - 20 }, canvas.width / 2 - 20, 10, "#0022FFCC", "#333333CC", player.energy / defs[player.definitionIndex].energy);
};

const drawMiniMapShip = (center: Position, player: Player, self: Player, miniMapScaleFactor: number) => {
  ctx.save();
  ctx.translate(
    (player.position.x - self.position.x) * miniMapScaleFactor + center.x,
    (player.position.y - self.position.y) * miniMapScaleFactor + center.y
  );
  ctx.rotate(player.heading);
  ctx.fillStyle = defs[player.definitionIndex].team ? "red" : "aqua";
  ctx.beginPath();
  ctx.moveTo(7, 0);
  ctx.lineTo(-7, -4);
  ctx.lineTo(-7, 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
};

const drawMiniMap = (position: Position, width: number, height: number, self: Player, state: GlobalState, miniMapScaleFactor: number) => {
  ctx.fillStyle = "#30303055";
  const margin = 5;
  ctx.fillRect(position.x - margin, position.y - margin, width + margin, height + margin);
  const center = { x: position.x + width / 2, y: position.y + height / 2 };
  for (const [id, player] of state.players) {
    if (
      Math.abs(player.position.x - self.position.x) * miniMapScaleFactor < width / 2 &&
      Math.abs(player.position.y - self.position.y) * miniMapScaleFactor < height / 2
    ) {
      drawMiniMapShip(center, player, self, miniMapScaleFactor);
    }
  }
};

// I may want to go back to using this if I change to have the update (not just the fractional update) being run on the clients
// let starAntiJitter = { x: 0, y: 0 };

const drawStars = (self: Player) => {
  // const topLeft = { x: self.position.x - starAntiJitter.x - canvas.width / 2, y: self.position.y - starAntiJitter.y - canvas.height / 2 };
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

const drawShip = (player: Player, self: Player) => {
  ctx.save();
  ctx.translate(player.position.x - self.position.x + canvas.width / 2, player.position.y - self.position.y + canvas.height / 2);
  let sprite = sprites[player.definitionIndex];
  drawBar(
    { x: -sprite.width / 2, y: -sprite.height / 2 - 10 },
    sprite.width,
    5,
    "#00EE00CC",
    "#EE0000CC",
    player.health / defs[player.definitionIndex].health
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
  ctx.drawImage(
    sprite,
    -sprite.width / 2,
    -sprite.height / 2,
    sprite.width,
    sprite.height
  );
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

const drawDockText = () => {
  ctx.fillStyle = "white";
  ctx.font = "30px Arial";
  ctx.textAlign = "center";
  ctx.fillText("Press m to dock", canvas.width / 2, canvas.height / 2 + 200);
};

// This is only for drawing purposes (if we die we need to keep the last position)
let lastSelf: Player;

let highlightPhase = 0;

const drawHighlight = (self: Player, player: Player) => {
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
  ctx.drawImage(
    sprite,
    -sprite.width / 2,
    -sprite.height / 2,
    sprite.width,
    sprite.height
  );
  ctx.restore();
};

const drawTargetArrow = (self: Player, target: Player) => {
  const margin = 25;
  const heading = findHeadingBetween(self.position, target.position);
  const intersection = projectRayFromCenterOfRect({ x: 0, y: 0, width: canvas.width, height: canvas.height }, heading);
  const position = { x: intersection.x - Math.cos(heading) * margin, y: intersection.y - Math.sin(heading) * margin };
  ctx.save();
  ctx.translate(position.x, position.y);
  ctx.rotate(heading);
  ctx.fillStyle = defs[target.definitionIndex].team ? "red" : "aqua";
  ctx.beginPath();
  ctx.moveTo(14, 0);
  ctx.lineTo(-14, -8);
  ctx.lineTo(-14, 8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
};

const drawEverything = (state: GlobalState, self: Player, target: Player | undefined) => {
  clearCanvas();
  if (self) {
    lastSelf = self;
  }
  if (lastSelf) {
    drawStars(lastSelf);
  }
  for (const [id, player] of state.players) {
    if (player.docked) {
      continue;
    }
    if (id !== me) {
      if (id === targetId) {
        drawHighlight(lastSelf, player);
      }
      drawShip(player, lastSelf);
    }
  }
  if (self && !self.docked) {
    drawShip(self, self);
  }
  for (const [id, projectiles] of state.projectiles) {
    for (const projectile of projectiles) {
      drawProjectile(projectile, lastSelf);
    }
  }
  if (self && !self.docked) {
    drawMiniMap({ x: canvas.width - 210, y: canvas.height - 210 }, 200, 200, self, state, 0.03);
    // drawHUD(self);
    if (self.canDock) {
      drawDockText();
    }
    if (target) {
      drawTarget({ x: canvas.width - 210, y: 15, width: 200, height: 200 }, self, target);
      if (Math.abs(self.position.x - target.position.x) > canvas.width / 2 || Math.abs(self.position.y - target.position.y) > canvas.height / 2) {
        drawTargetArrow(self, target);
      }
    }
  }
};

let state: GlobalState;
// let syncPosition: number;

let docker = () => {};
let showDocked = false;

let input: Input = {
  up: false,
  down: false,
  left: false,
  right: false,
  primary: false,
  secondary: false,
  dock: false,
  nextTarget: false,
  previousTarget: false,
};

const initInputHandlers = () => {
  document.addEventListener("keydown", (e) => {
    let changed = false;
    switch (e.key) {
      case "ArrowUp":
        changed = !input.up;
        input.up = true;
        break;
      case "ArrowDown":
        changed = !input.down;
        input.down = true;
        break;
      case "ArrowLeft":
        changed = !input.left;
        input.left = true;
        break;
      case "ArrowRight":
        changed = !input.right;
        input.right = true;
        break;
      case " ":
        changed = !input.primary;
        input.primary = true;
        break;
      case "m":
        input.dock = true;
        break;
      case "v":
        input.nextTarget = true;
        break;
      case "w":
        input.previousTarget = true;
        break;
    }
    if (changed) {
      sendInput(input, me);
    }
  });
  document.addEventListener("keyup", (e) => {
    let changed = false;
    switch (e.key) {
      case "ArrowUp":
        changed = input.up;
        input.up = false;
        break;
      case "ArrowDown":
        changed = input.down;
        input.down = false;
        break;
      case "ArrowLeft":
        changed = input.left;
        input.left = false;
        break;
      case "ArrowRight":
        changed = input.right;
        input.right = false;
        break;
      case " ":
        changed = input.primary;
        input.primary = false;
        break;
      case "m":
        input.dock = false;
        break;
      case "v":
        input.nextTarget = false;
        break;
      case "w":
        input.previousTarget = false;
        break;
    }
    if (changed) {
      sendInput(input, me);
    }
  });
};

let lastUpdate = Date.now();

// The server will assign our id when we connect
let me: number;
let targetId: number;

const dockDialog = (station: Player | undefined, stationId: number) => {
  if (!station) {
    return `Docking error - station ${stationId} not found`;
  }
  return horizontalCenter([`<h3>Docked with ${station.name}</h3>`, `<button id="undock">Undock</button>`]);
};

const setupDockingUI = (station: Player | undefined) => {
  if (!station) {
    return;
  }
  document.getElementById("undock")?.addEventListener("click", () => {
    sendUndock(me);
  });
};

const loop = () => {
  highlightPhase += 0.1;
  if (highlightPhase > 2 * Math.PI) {
    highlightPhase -= 2 * Math.PI;
  }

  if (input.dock) {
    docker();
  }

  let target: Player | undefined = undefined;

  // const drawState = fractionalUpdate(state, ((Date.now() - lastUpdate) * ticksPerSecond) / 1000);
  const self = state.players.get(me);

  if (self && !self.docked && (input.nextTarget || input.previousTarget)) {
    target = state.players.get(targetId);
    [target, targetId] = input.nextTarget ? findNextTarget(self, target, state) : findPreviousTarget(self, target, state);
    input.nextTarget = false;
    input.previousTarget = false;
  } else if (self && !self.docked) {
    target = state.players.get(targetId);
  }

  if (target?.docked) {
    target = undefined;
    targetId = 0;
  }


  if (self && !self.docked && showDocked) {
    showDocked = false;
    clearDialog();
    hideDialog();
  }
  setCanDock(self, state);
  if (self && self.canDock) {
    docker = () => {
      sendDock(me, self.canDock);
    };
  } else {
    docker = () => {};
  }
  if (self && self.docked) {
    if (!showDocked) {
      showDocked = true;
      const station = state.players.get(self.docked);
      showDialog(dockDialog(station, self.docked));
      setupDockingUI(station);
    }
  }

  drawEverything(state, self, target);
  requestAnimationFrame(loop);
};

const registerHandler = (e: KeyboardEvent) => {
  if (e.key === "Enter") {
    const input = document.getElementById("username") as HTMLInputElement;
    register(input.value);
    clearDialog();
    hideDialog();
    initInputHandlers();
  }
};

const registerDialog = horizontalCenter(["<h3>Input username</h3>", '<input type="text" placeholder="Username" id="username"/>']);

let respawnKey = 0;
let didDie = false;

const deadDialog = horizontalCenter(['<h3 style="color: white;">You are dead</h3>', "<button id='respawn'>Respawn</button>"]);
const setupDeadDialog = () => {
  didDie = true;
  document.getElementById("respawn")?.addEventListener("click", () => {
    if (respawnKey !== 0) {
      sendRespawn(respawnKey);
      clearDialog();
      hideDialog();
    } else {
      console.error("No respawn key");
    }
  });
};

const run = () => {
  console.log("Running game");

  showDialog(registerDialog);
  const usernameInput = document.getElementById("username") as HTMLInputElement;
  usernameInput.addEventListener("keydown", registerHandler);

  state = {
    players: new Map(),
    projectiles: new Map(),
  };

  bindAction("init", (data: { id: number; respawnKey: number }) => {
    me = data.id;
    respawnKey = data.respawnKey;
  });

  // bindAction("removed", (data: any) => {
  //   console.log("Got removed", data);
  //   state.players.delete(data);
  // });

  bindAction("state", (data: any) => {
    state.players = new Map();
    state.projectiles = new Map();

    const players = data.players as Player[];
    // syncPosition = data.frame;

    for (const player of players) {
      state.players.set(player.id, player);
    }
    const projectiles = data.projectiles as Ballistic[];
    while (projectiles.length) {
      let parentId = projectiles[0].parent;
      let projectileGroup = [] as Ballistic[];
      while (projectiles.length && projectiles[0].parent === parentId) {
        projectileGroup.push(projectiles.shift());
      }
      state.projectiles.set(parentId, projectileGroup);
    }
    lastUpdate = Date.now();
    const self = state.players.get(me);
    if (!self && !didDie) {
      targetId = 0;
      showDialog(deadDialog);
      setupDeadDialog();
    }
    if (self) {
      didDie = false;
    }
  });

  bindAction("input", (data: any) => {
    const { input, id } = data;
    const player = state.players.get(id);
    if (player) {
      applyInputs(input, player);
    }
  });

  loop();
};

const toRun = () => {
  initDialog();
  initStars();
  initLocals(() => {
    connect(run);
  });
};

if (document.readyState === "complete") {
  toRun();
} else {
  document.addEventListener("DOMContentLoaded", toRun);
}
