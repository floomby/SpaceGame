import { connect, bindAction, register, sendInput } from "./net";
import { GlobalState, Position, Circle, Input, Player, update, applyInputs, Ballistic, positiveMod, ticksPerSecond, fractionalUpdate } from "./game";
import { init as initDialog, show as showDialog, hide as hideDialog, clear as clearDialog, horizontalCenter } from "./dialog";

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
  ctx.rotate(player.heading);
  ctx.drawImage(
    sprites[player.sprite],
    -sprites[player.sprite].width / 2,
    -sprites[player.sprite].height / 2,
    sprites[player.sprite].width,
    sprites[player.sprite].height
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

const drawEverything = (state: GlobalState) => {
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
  for (const [id, projectiles] of state.projectiles) {
    for (const projectile of projectiles) {
      drawProjectile(projectile, lastSelf);
    }
  }
};

let state: GlobalState;
let frame: number;
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
    sendInput(input, me);
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
    sendInput(input, me);
  });
};

let lastUpdate = Date.now();

// The server will decide this for us
let me: number;

const loop = () => {
  drawEverything(fractionalUpdate(state, ((Date.now() - lastUpdate) * ticksPerSecond) / 1000));
  frame = requestAnimationFrame(loop);
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

const run = () => {
  console.log("Running game");

  showDialog(registerDialog);
  const usernameInput = document.getElementById("username") as HTMLInputElement;
  usernameInput.addEventListener("keydown", registerHandler);

  state = {
    players: new Map(),
    projectiles: new Map(),
  };

  bindAction("init", (data: { id: number }) => {
    me = data.id;
  });

  bindAction("removed", (data: any) => {
    console.log("Got removed", data);
    state.players.delete(data);
  });

  bindAction("state", (data: any) => {
    state.players = new Map();
    state.projectiles = new Map();

    const players = data.players as Player[];
    syncPosition = data.frame;

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
    if (!self) {
      showDialog("<h3>You are dead</h3>");
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
