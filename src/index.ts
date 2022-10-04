import { connect, bindAction, register } from "./net";
import { GlobalState, Position, Circle, Input, Player, update, applyInputs, Ballistic, positiveMod, ticksPerSecond, fractionalUpdate } from "./game";
import { init as initDialog, show as showDialog, hide as hideDialog } from "./dialog";

// TODO Move this to a separate file
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
    for (let i = 0; i < 2; i++) {
      spritePromises.push(createImageBitmap(spriteSheet, i * 32, 0, 32, 32));
    }
    Promise.all(spritePromises).then((completed) => {
      sprites = completed;
      callback();
    });
  };
  spriteSheet.src = "sprites/sprites.png";
};

const clearCanvas = () => {
  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
};

// Probably an indication that the sync is not amazing, but this makes things less jarring
let starAntiJitter = { x: 0, y: 0 };

const drawStars = (self: Player) => {
  const topLeft = { x: self.position.x - starAntiJitter.x - canvas.width / 2, y: self.position.y - starAntiJitter.y - canvas.height / 2 };
  // topLeft.x /= 2;
  // topLeft.y /= 2;
  topLeft.x = positiveMod(topLeft.x, starTilingSize.x);
  topLeft.y = positiveMod(topLeft.y, starTilingSize.y);
  // console.log(topLeft);
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
  ctx.rotate(player.heading);
  // ctx.beginPath();
  // ctx.moveTo(10, 0);
  // ctx.lineTo(-10, -7);
  // ctx.lineTo(-10, 7);
  // ctx.closePath();
  ctx.drawImage(
    sprites[player.sprite],
    -sprites[player.sprite].width / 2,
    -sprites[player.sprite].height / 2,
    sprites[player.sprite].width,
    sprites[player.sprite].height
  );
  ctx.fillStyle = player.team === 0 ? "lightblue" : "red";
  ctx.fill();
  ctx.restore();
};

const drawProjectile = (projectile: Ballistic, self: Player) => {
  ctx.save();
  ctx.translate(projectile.position.x - self.position.x + canvas.width / 2, projectile.position.y - self.position.y + canvas.height / 2);
  ctx.beginPath();
  ctx.arc(0, 0, projectile.radius, 0, 2 * Math.PI);
  // ctx.fillStyle = projectile.team === 0 ? "lightblue" : "red";
  ctx.fillStyle = "white";
  ctx.closePath();
  ctx.fill();

  // draw a tail
  const tailLength = 20;
  const tailEnd = { x: -Math.cos(projectile.heading) * tailLength, y: -Math.sin(projectile.heading) * tailLength };
  const gradient = ctx.createLinearGradient(0, 0, tailEnd.x, tailEnd.y);
  gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
  gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.strokeStyle = gradient;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(tailEnd.x, tailEnd.y);
  ctx.closePath();
  ctx.stroke();

  ctx.restore();
};

let lastSelf: Player;

const drawEverything = (state: GlobalState, frameNumber: number) => {
  clearCanvas();
  const self = state.players.get(me);
  if (self) {
    lastSelf = self;
  }
  if (lastSelf) {
    drawStars(lastSelf);
  }
  for (const [id, player] of state.players) {
    drawShip(player, lastSelf);
  }
  let drawCount = 0;
  for (const [id, projectiles] of state.projectiles) {
    for (const projectile of projectiles) {
      drawProjectile(projectile, lastSelf);
      drawCount++;
    }
  }
  // console.log(drawCount, "projectiles");
};

let state: GlobalState;

let frame: number;

let syncTarget: number;
let syncPosition: number;

let input: Input = {
  up: false,
  down: false,
  left: false,
  right: false,
  primary: false,
};

const initInputHandlers = () => {
  document.addEventListener("keydown", (e) => {
    switch (e.key) {
      case "ArrowUp":
        input.up = true;
        break;
      case "ArrowDown":
        input.down = true;
        break;
      case "ArrowLeft":
        input.left = true;
        break;
      case "ArrowRight":
        input.right = true;
        break;
      case " ":
        input.primary = true;
        break;
    }
  });
  document.addEventListener("keyup", (e) => {
    switch (e.key) {
      case "ArrowUp":
        input.up = false;
        break;
      case "ArrowDown":
        input.down = false;
        break;
      case "ArrowLeft":
        input.left = false;
        break;
      case "ArrowRight":
        input.right = false;
        break;
      case " ":
        input.primary = false;
        break;
    }
  });
};

const sendPlayerInfo = (socket: WebSocket, player: Player) => {
  socket.send(
    JSON.stringify({
      type: "player",
      payload: player,
    })
  );
};

const sendInput = (socket: WebSocket, input: Input, id: number) => {
  socket.send(
    JSON.stringify({
      type: "input",
      payload: { input, id },
    })
  );
};

let lastUpdate = Date.now();
let serverSocket: WebSocket;
let died = false;

const me = Math.floor(Math.random() * 1000000);

const loop = () => {
  const self = state.players.get(me);
  // console.log("State", state);
  if (self) {
    // console.log("Updating self");
    sendInput(serverSocket, input, me);
  }
  // TODO calculate fractional update state and draw from that so that it feels smoother
  drawEverything(fractionalUpdate(state, (Date.now() - lastUpdate) / 1000 * 60), syncPosition);
  frame = requestAnimationFrame(loop);
};

let frameTargetInterval: number;

const run = (socket: WebSocket) => {
  console.log("Running game");
  serverSocket = socket;

  console.log("Initialized locals");
  register(socket, me);
  initInputHandlers();

  state = {
    players: new Map(),
    projectiles: new Map(),
  };

  bindAction(socket, "init", (data: any) => {
    console.log("Got init", data);
    const self = {
      position: { x: 100, y: 100 },
      radius: 13,
      speed: 0,
      heading: 0,
      health: 100,
      id: me,
      team: me % 2,
      sprite: me % 2,
      sinceLastShot: 10000,
      projectileId: 0,
    };
    state.players.set(me, self);
    // We send this now, but it should really be the servers job to send this to everyone and to actually add the player to the state
    sendPlayerInfo(serverSocket, self);
    syncPosition = data.frame;
    syncTarget = data.frame;
    console.log("Init on frame: " + syncPosition);
    clearInterval(frameTargetInterval);
    frameTargetInterval = setInterval(() => {
      syncTarget++;
      // console.log(`On frame ${frame}, syncing to ${syncTarget} at ${syncPosition}`);
      const self = state.players.get(me);
      while (syncPosition < syncTarget) {
        syncPosition++;
        if (self) {
          applyInputs(input, self);
        } else if (!died) {
          died = true;
          // console.log("You are dead");
          showDialog("You are dead");
        }
        update(state, syncPosition, () => {});
        lastUpdate = Date.now();
      }
    }, 1000 / ticksPerSecond);
  });

  bindAction(socket, "removed", (data: any) => {
    state.players.delete(data);
  });

  bindAction(socket, "state", (data: any) => {
    const players = data.players as Player[];
    syncTarget = data.frame;
    const self = state.players.get(me);
    for (const player of players) {
      if (self && player.id === me) {
        starAntiJitter = { x: player.position.x - self.position.x, y: player.position.y - self.position.y };
      }
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
  });

  bindAction(socket, "input", (data: any) => {
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
