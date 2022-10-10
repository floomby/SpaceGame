import { connect, bindAction, register, sendInput, sendDock, sendUndock, sendRespawn, sendTarget, sendSecondary, sendSellCargo } from "./net";
import {
  GlobalState,
  Input,
  Player,
  applyInputs,
  Ballistic,
  setCanDock,
  findNextTarget,
  findPreviousTarget,
  Asteroid,
  findNextTargetAsteroid,
  findPreviousTargetAsteroid,
  TargetKind,
  CargoEntry,
  Missile,
} from "./game";
import {
  init as initDialog,
  show as showDialog,
  hide as hideDialog,
  clear as clearDialog,
  horizontalCenter,
  updateDom,
  bindUpdater,
  bindPostUpdater,
} from "./dialog";
import { defs, initDefs, Faction, getFactionString } from "./defs";
import { drawEverything, flashSecondary, initDrawing } from "./drawing";
import { dvorakBindings, qwertyBindings } from "./keybindings";
import { applyEffects } from "./effects";

// The server will assign our id when we connect
let me: number;

// let keybind = qwertyBindings;
let keybind = dvorakBindings;

let targetEnemy = false;
let selectedSecondary = 0;
let selectedSecondaryChanged = false;

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
  nextTargetAsteroid: false,
  previousTargetAsteroid: false,
};

const initInputHandlers = () => {
  document.addEventListener("keydown", (e) => {
    let changed = false;
    const oldSecondary = selectedSecondary;
    switch (e.key) {
      case keybind.up:
        changed = !input.up;
        input.up = true;
        break;
      case keybind.down:
        changed = !input.down;
        input.down = true;
        break;
      case keybind.left:
        changed = !input.left;
        input.left = true;
        break;
      case keybind.right:
        changed = !input.right;
        input.right = true;
        break;
      case keybind.primary:
        changed = !input.primary;
        input.primary = true;
        break;
      case keybind.secondary:
        changed = !input.secondary;
        input.secondary = true;
        break;
      case keybind.dock:
        input.dock = true;
        break;
      case keybind.nextTarget:
        input.nextTarget = true;
        targetEnemy = e.getModifierState("Control");
        break;
      case keybind.previousTarget:
        input.previousTarget = true;
        targetEnemy = e.getModifierState("Control");
        break;
      case keybind.nextTargetAsteroid:
        input.nextTargetAsteroid = true;
        break;
      case keybind.previousTargetAsteroid:
        input.previousTargetAsteroid = true;
        break;
      case keybind.selectSecondary0:
        selectedSecondary = 0;
        break;
      case keybind.selectSecondary1:
        selectedSecondary = 1;
        break;
      case keybind.selectSecondary2:
        selectedSecondary = 2;
        break;
      case keybind.selectSecondary3:
        selectedSecondary = 3;
        break;
      case keybind.selectSecondary4:
        selectedSecondary = 4;
        break;
      case keybind.selectSecondary5:
        selectedSecondary = 5;
        break;
      case keybind.selectSecondary6:
        selectedSecondary = 6;
        break;
      case keybind.selectSecondary7:
        selectedSecondary = 7;
        break;
      case keybind.selectSecondary8:
        selectedSecondary = 8;
        break;
      case keybind.selectSecondary9:
        selectedSecondary = 9;
        break;
    }
    if (changed) {
      sendInput(input, me);
    }
    if (oldSecondary !== selectedSecondary) {
      selectedSecondaryChanged = true;
    }
  });
  document.addEventListener("keyup", (e) => {
    let changed = false;
    switch (e.key) {
      case keybind.up:
        changed = input.up;
        input.up = false;
        break;
      case keybind.down:
        changed = input.down;
        input.down = false;
        break;
      case keybind.left:
        changed = input.left;
        input.left = false;
        break;
      case keybind.right:
        changed = input.right;
        input.right = false;
        break;
      case keybind.primary:
        changed = input.primary;
        input.primary = false;
        break;
      case keybind.secondary:
        changed = input.secondary;
        input.secondary = false;
        break;
      case keybind.dock:
        input.dock = false;
        break;
      case keybind.nextTarget:
        input.nextTarget = false;
        break;
      case keybind.previousTarget:
        input.previousTarget = false;
        break;
      case keybind.nextTargetAsteroid:
        input.nextTargetAsteroid = false;
        break;
      case keybind.previousTargetAsteroid:
        input.previousTargetAsteroid = false;
        break;
    }
    if (changed) {
      sendInput(input, me);
    }
  });
};

let state: GlobalState;
// let syncPosition: number;

let docker = () => {};
let showDocked = false;

// let lastUpdate = Date.now();

let targetId = 0;
let targetAsteroidId = 0;

const creditsHtml = (credits: number | undefined) => {
  if (credits === undefined) {
    credits = 0;
  }
  return `<span class="credits">Credits: ${credits}</span>`;
};

const cargoHtml = (cargo?: CargoEntry[]) => {
  if (!cargo) {
    return "";
  }
  let html = "<table>";
  // html += "<tr><th>Item</th><th>Quantity</th><th>Sell</th></tr>";
  let index = 0;
  for (const entry of cargo) {
    html += `<tr>
  <td>${entry.what}</td>
  <td>${entry.amount}</td>
  <td><button id="sellCargo${index}">Sell</button></td></tr>`;
    index++;
  }
  html += "</table>";
  return html;
};

const cargoPostUpdate = (cargo?: CargoEntry[]) => {
  if (cargo) {
    for (let i = 0; i < cargo.length; i++) {
      const button = document.getElementById(`sellCargo${i}`);
      if (button) {
        button.addEventListener("click", () => {
          sendSellCargo(me, cargo[i].what);
        });
      } else {
        console.log("button not found", `sellCargo${i}`);
      }
    }
  }
};

const dockDialog = (station: Player | undefined, self: Player) => {
  if (!station) {
    return `Docking error - station ${self.docked} not found`;
  }
  return horizontalCenter([
    `<h2>Docked with ${station.name}</h2>`,
    `<div id="credits">${creditsHtml(self.credits)}</div>`,
    `<div>
  <div style="width: 50%; float: left;">
    <h3>Cargo</h3>
    <div id="cargo">${cargoHtml(self.cargo)}</div>
  </div>
  <div style="width: 50%; float: left;">
    <h3>Something else here</h3>
    <p>The menus need a lot of work</p>
  </div>
</div>`,
    `<br/><button id="undock">Undock</button>`,
  ]);
};

const setupDockingUI = (station: Player | undefined, self: Player) => {
  if (!station) {
    return;
  }
  document.getElementById("undock")?.addEventListener("click", () => {
    sendUndock(me);
  });
  cargoPostUpdate(self.cargo);
};

let lastValidSecondary = 0;
let serverTarget: [TargetKind, number] = [TargetKind.None, 0];

let lastFrameTime = Date.now();

const loop = () => {
  const elapsed = Date.now() - lastFrameTime;
  lastFrameTime = Date.now();
  const sixtieths = elapsed / 16.666666666666666666666666666667;

  if (input.dock) {
    docker();
  }

  let target: Player | undefined = undefined;
  let targetAsteroid: Asteroid | undefined = undefined;

  const self = state.players.get(me);

  const def = self ? defs[self.definitionIndex] : undefined;
  if (self && selectedSecondaryChanged) {
    if (selectedSecondary < def.slots.length) {
      lastValidSecondary = selectedSecondary;
      flashSecondary();
      sendSecondary(me, selectedSecondary);
    } else {
      selectedSecondary = lastValidSecondary;
    }
    selectedSecondaryChanged = false;
  }

  if (self && !self.docked) {
    if ((input.nextTarget || input.previousTarget) && !input.nextTargetAsteroid && !input.previousTargetAsteroid) {
      target = state.players.get(targetId);
      console.log(targetEnemy);
      [target, targetId] = input.nextTarget ? findNextTarget(self, target, state, targetEnemy) : findPreviousTarget(self, target, state, targetEnemy);
      input.nextTarget = false;
      input.previousTarget = false;
      if (target) {
        targetAsteroidId = 0;
      }
    } else if (input.nextTargetAsteroid || input.previousTargetAsteroid) {
      targetAsteroid = state.asteroids.get(targetAsteroidId);
      [targetAsteroid, targetAsteroidId] = input.nextTargetAsteroid
        ? findNextTargetAsteroid(self, targetAsteroid, state)
        : findPreviousTargetAsteroid(self, targetAsteroid, state);
      input.nextTargetAsteroid = false;
      input.previousTargetAsteroid = false;
      if (targetAsteroidId) {
        target = undefined;
        targetId = 0;
      }
    } else {
      target = state.players.get(targetId);
      targetAsteroid = state.asteroids.get(targetAsteroidId);
    }
  }

  const unifiedTargetId = targetId || targetAsteroidId;
  const unifiedTargetKind = targetId ? TargetKind.Player : targetAsteroidId ? TargetKind.Asteroid : TargetKind.None;

  if (unifiedTargetId !== serverTarget[1] || unifiedTargetKind !== serverTarget[0]) {
    serverTarget = [unifiedTargetKind, unifiedTargetId];
    sendTarget(me, serverTarget);
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
      showDialog(dockDialog(station, self));
      setupDockingUI(station, self);
    }
  }

  // const drawState = fractionalUpdate(state, ((Date.now() - lastUpdate) * ticksPerSecond) / 1000);
  drawEverything(state, self, target, targetAsteroid, me, selectedSecondary, keybind, sixtieths);
  requestAnimationFrame(loop);
};

let faction: Faction = Faction.Alliance;

const doRegister = () => {
  const input = document.getElementById("username") as HTMLInputElement;
  register(input.value, faction);
  clearDialog();
  hideDialog();
  initInputHandlers();
};

const registerHandler = (e: KeyboardEvent) => {
  if (e.key === "Enter") {
    doRegister();
  }
};

const registerDialog = horizontalCenter([
  "<h3>Input username</h3>",
  '<input type="text" placeholder="Username" id="username"/>',
  `<br/>
<fieldset>
  <legend>Select Faction</legend>
  <div style="text-align: left;">
    <input type="radio" id="alliance" name="faction" value="alliance" checked>
    <label for="alliance">${getFactionString(Faction.Alliance)}</label>
  </div>
  <div style="text-align: left;">
    <input type="radio" id="confederation" name="faction" value="confederation">
    <label for="confederation">${getFactionString(Faction.Confederation)}</label>
</fieldset>`,
  `<br/>
<fieldset>
  <legend>Keyboard Layout</legend>
  <div style="text-align: left;">
    <input type="radio" id="qwerty" name="keyboard" value="qwerty">
    <label for="qwerty">QWERTY</label>
  </div>
  <div style="text-align: left;">
    <input type="radio" id="dvorak" name="keyboard" value="dvorak" checked>
    <label for="dvorak">Dvorak</label>
  </div>
</fieldset>`,
  '<br/><button id="register">Register</button>',
]);

const setupRegisterDialog = () => {
  const usernameInput = document.getElementById("username") as HTMLInputElement;
  usernameInput.addEventListener("keydown", registerHandler);
  const qwerty = document.getElementById("qwerty") as HTMLInputElement;
  const dvorak = document.getElementById("dvorak") as HTMLInputElement;
  qwerty.addEventListener("change", () => {
    if (qwerty.checked) {
      keybind = qwertyBindings;
    }
  });
  dvorak.addEventListener("change", () => {
    if (dvorak.checked) {
      keybind = dvorakBindings;
    }
  });
  const alliance = document.getElementById("alliance") as HTMLInputElement;
  const confederation = document.getElementById("confederation") as HTMLInputElement;
  alliance.addEventListener("change", () => {
    if (alliance.checked) {
      faction = Faction.Alliance;
      const dialog = document.getElementById("dialog");
      if (dialog) {
        dialog.style.backgroundColor = "rgba(22, 45, 34, 0.341)";
      }
    }
  });
  confederation.addEventListener("change", () => {
    if (confederation.checked) {
      faction = Faction.Confederation;
      const dialog = document.getElementById("dialog");
      if (dialog) {
        dialog.style.backgroundColor = "rgba(49, 25, 25, 0.341)";
      }
    }
  });
  document.getElementById("register")?.addEventListener("click", doRegister);
};

let respawnKey = 0;
let didDie = false;

const deadDialog = horizontalCenter(["<h2>You are dead</h2>", "<button id='respawn'>Respawn</button>"]);
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
  setupRegisterDialog();

  state = {
    players: new Map(),
    projectiles: new Map(),
    asteroids: new Map(),
    missiles: new Map(),
  };

  bindAction("init", (data: { id: number; respawnKey: number }) => {
    me = data.id;
    respawnKey = data.respawnKey;
  });

  bindUpdater("cargo", cargoHtml);
  bindPostUpdater("cargo", cargoPostUpdate);
  bindUpdater("credits", creditsHtml);

  bindAction("state", (data: any) => {
    state.players = new Map();
    state.projectiles = new Map();
    state.missiles = new Map();

    const players = data.players as Player[];
    // syncPosition = data.frame;

    for (const player of players) {
      state.players.set(player.id, player);
    }
    for (const asteroid of data.asteroids as Asteroid[]) {
      state.asteroids.set(asteroid.id, asteroid);
    }
    for (const missile of data.missiles as Missile[]) {
      state.missiles.set(missile.id, missile);
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
    // lastUpdate = Date.now();
    const self = state.players.get(me);
    if (!self && !didDie) {
      targetId = 0;
      showDialog(deadDialog);
      setupDeadDialog();
    }
    if (self) {
      updateDom("cargo", self.cargo);
      updateDom("credits", self.credits);
      didDie = false;
      if (self.docked) {
        targetId = 0;
        targetAsteroidId = 0;
      }
    }
    applyEffects(data.effects);
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
  initDefs();
  initDrawing(() => {
    connect(run);
  });
};

if (document.readyState === "complete") {
  toRun();
} else {
  document.addEventListener("DOMContentLoaded", toRun);
}
