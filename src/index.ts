import {
  connect,
  bindAction,
  login,
  sendDock,
  sendUndock,
  sendTarget,
  sendSecondary,
  sendSellCargo,
  sendEquip,
  unbindAllActions,
  sendPurchase,
  register,
} from "./net";
import {
  GlobalState,
  Player,
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
  ticksPerSecond,
  maxDecimals,
  ChatMessage,
} from "./game";
import {
  init as initDialog,
  show as showDialog,
  hide as hideDialog,
  clear as clearDialog,
  pop as popDialog,
  push as pushDialog,
  clearStack as clearDialogStack,
  shown as isDialogShown,
  horizontalCenter,
  updateDom,
  bindUpdater,
  bindPostUpdater,
  setDialogBackground,
  runPostUpdaterOnly,
} from "./dialog";
import { defs, initDefs, Faction, getFactionString, armDefs, SlotKind, UnitKind, UnitDefinition } from "./defs";
import { drawEverything, flashSecondary, initDrawing, initStars, sprites } from "./drawing";
import { KeyBindings } from "./keybindings";
import { applyEffects, clearEffects } from "./effects";
import { initSound } from "./sound";
import { domFromRest } from "./rest";
import {
  allianceColor,
  confederationColor,
  currentSector,
  faction,
  initBlankState,
  keybind,
  me,
  selectedSecondary,
  setCurrentSector,
  setFaction,
  setMe,
  setSelectedSecondary,
  state,
} from "./globals";
import { initSettings } from "./dialogs/settings";
import { keylayoutSelector, keylayoutSelectorSetup } from "./dialogs/keyboardLayout";
import { deadDialog, setupDeadDialog } from "./dialogs/dead";
import { hideChat, initInputHandlers, input, selectedSecondaryChanged, setSelectedSecondaryChanged, targetEnemy } from "./input";
import { bindDockingUpdaters, dockDialog, docker, setDocker, setShowDocked, setupDockingUI, showDocked } from "./dialogs/dock";

let chats: ChatMessage[] = [];

let targetId = 0;
let targetAsteroidId = 0;

let lastValidSecondary = 0;
let serverTarget: [TargetKind, number] = [TargetKind.None, 0];

let lastFrameTime = Date.now();

const lastChats = new Map<number, ChatMessage>();

// TODO There is a bunch of business logic in here that should be refactored into better places
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
      setSelectedSecondary(lastValidSecondary);
    }
    setSelectedSecondaryChanged(false);
  }

  if (self && !self.docked) {
    if ((input.nextTarget || input.previousTarget) && !input.nextTargetAsteroid && !input.previousTargetAsteroid) {
      target = state.players.get(targetId);
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

  if (target?.inoperable) {
    target = undefined;
    targetId = 0;
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
    setShowDocked(false);
    clearDialog();
    hideDialog();
  }
  setCanDock(self, state);
  if (self && self.canDock) {
    setDocker(() => {
      sendDock(me, self.canDock);
    });
  } else {
    setDocker(() => {});
  }
  if (self && self.docked) {
    if (!showDocked) {
      setShowDocked(true);
      const station = state.players.get(self.docked);
      showDialog(dockDialog(station, self));
      hideChat();
      setupDockingUI(station, self);
    }
  }

  lastChats.clear();
  const newChats: ChatMessage[] = [];

  for (const chat of chats) {
    if (chat.showUntil < lastFrameTime) {
      continue;
    }
    const last = lastChats.get(chat.id);
    if (last && last.showUntil < chat.showUntil) {
      lastChats.set(chat.id, chat);
      newChats.push(chat);
    } else if (!last) {
      lastChats.set(chat.id, chat);
      newChats.push(chat);
    }
  }
  chats = newChats;

  drawEverything(state, self, target, targetAsteroid, me, selectedSecondary, keybind, sixtieths, lastChats);

  requestAnimationFrame(loop);
};

const loggingInDialog = horizontalCenter(["<h3>Logging in...</h3>"]);
const registeringDialog = horizontalCenter(["<h3>Registering...</h3>"]);

const doRegister = (username: string, password: string) => {
  register(username, password, faction);
  pushDialog(registeringDialog, () => {});
};

const doLogin = (username: string, password: string) => {
  login(username, password, faction);
  pushDialog(loggingInDialog, () => {});
};

const loginHandler = () => {
  // This is the first place that interacting with the page is guaranteed and so we setup the sound here
  // Is idempotent, so we can just call it even if we get kicked back to the login dialog due to invalid login
  initSound();

  const input = document.getElementById("username") as HTMLInputElement;
  const password = document.getElementById("password") as HTMLInputElement;
  const visited = localStorage.getItem("visited") !== null;
  if (visited) {
    doLogin(input.value, password.value);
  } else {
    // TODO Fix first time help
    // showFirstTimeHelp(input.value);
    console.log("TODO Fix first time help");
    doLogin(input.value, password.value);
  }
};

const registerHandler = () => {
  initSound();

  const input = document.getElementById("username") as HTMLInputElement;
  const password = document.getElementById("password") as HTMLInputElement;
  const visited = localStorage.getItem("visited") !== null;
  if (visited) {
    doRegister(input.value, password.value);
  } else {
    // TODO Fix first time help
    // showFirstTimeHelp(input.value);
    console.log("TODO Fix first time help");
    doRegister(input.value, password.value);
  }
};

const loginKeyHandler = (e: KeyboardEvent) => {
  if (e.key === "Enter") {
    loginHandler();
  }
};

const keybindingHelpText = (bindings: KeyBindings) => {
  let keys = { ...bindings };

  for (const [k, v] of Object.entries(keys)) {
    if (v === " ") {
      keys[k] = "Space";
    }
    if (v === "ArrowLeft") {
      keys[k] = "Left";
    }
    if (v === "ArrowRight") {
      keys[k] = "Right";
    }
    if (v === "ArrowUp") {
      keys[k] = "Up";
    }
    if (v === "ArrowDown") {
      keys[k] = "Down";
    }
  }

  return `<div style="width: 80vw;">
  <div style="width: 45%; float: left;">
    <table style="width: 100%; text-align: left; white-space: nowrap;">
      <tr><th>Key</th><th>Action</th></tr>
      <tr><td style="padding-right: 3vw;">${keys.dock}</td><td>Dock</td></tr>
      <tr><td style="padding-right: 3vw;">${keys.primary}</td><td>Fire primary</td></tr>
      <tr><td style="padding-right: 3vw;">${keys.secondary}</td><td>Fire secondary</td></tr>
      <tr><td style="padding-right: 3vw;">${keys.nextTarget}</td><td>Target next closest ship/station</td></tr>
      <tr><td style="padding-right: 3vw;">${keys.previousTarget}</td><td>Target next furthest ship/station</td></tr>
      <tr><td style="padding-right: 3vw;">Ctrl + ${keys.nextTarget}</td><td>Target next closest enemy</td></tr>
      <tr><td style="padding-right: 3vw;">Ctrl + ${keys.previousTarget}</td><td>Target next furthest enemy</td></tr>
      <tr><td style="padding-right: 3vw;">${keys.nextTargetAsteroid}</td><td>Target next closest asteroid</td></tr>
      <tr><td style="padding-right: 3vw;">${keys.previousTargetAsteroid}</td><td>Target next furthest asteroid</td></tr>
      <tr><td style="padding-right: 3vw;">${keys.up}</td><td>Accelerate</td></tr>
      <tr><td style="padding-right: 3vw;">${keys.down}</td><td>Decelerate</td></tr>
      <tr><td style="padding-right: 3vw;">${keys.left}</td><td>Rotate left</td></tr>
      <tr><td style="padding-right: 3vw;">${keys.right}</td><td>Rotate right</td></tr>
    </table>
  </div>
  <div style="width: 45%; float: right;">
    <table style="width: 100%; text-align: left; white-space: nowrap;">
      <tr><th>Key</th><th>Action</th></tr>
      <tr><td style="padding-right: 3vw;">${keys.selectSecondary0}</td><td>Select secondary 0</td></tr>
      <tr><td style="padding-right: 3vw;">${keys.selectSecondary1}</td><td>Select secondary 1</td></tr>
      <tr><td style="padding-right: 3vw;">${keys.selectSecondary2}</td><td>Select secondary 2</td></tr>
      <tr><td style="padding-right: 3vw;">${keys.selectSecondary3}</td><td>Select secondary 3</td></tr>
      <tr><td style="padding-right: 3vw;">${keys.selectSecondary4}</td><td>Select secondary 4</td></tr>
      <tr><td style="padding-right: 3vw;">${keys.selectSecondary5}</td><td>Select secondary 5</td></tr>
      <tr><td style="padding-right: 3vw;">${keys.selectSecondary6}</td><td>Select secondary 6</td></tr>
      <tr><td style="padding-right: 3vw;">${keys.selectSecondary7}</td><td>Select secondary 7</td></tr>
      <tr><td style="padding-right: 3vw;">${keys.selectSecondary8}</td><td>Select secondary 8</td></tr>
      <tr><td style="padding-right: 3vw;">${keys.selectSecondary9}</td><td>Select secondary 9</td></tr>
      <tr><td style="padding-right: 3vw;">${keys.chat}</td><td>Chat</td></tr>
    </table>
  </div>
</div>`;
};

const loginDialog = horizontalCenter([
  "<h2>Login</h2>",
  `<div id="errorSpot"></div>`,
  `<input type="text" placeholder="Username" id="username"/>`,
  `<input style="margin-top: 10px;" type="password" placeholder="Password" id="password"/>`,
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
  `<br/>${keylayoutSelector()}`,
  `<br/><button id="registerButton">Register</button>`,
  `<button style="margin-top: 10px;" id="loginButton">Login</button>`,
]);

const showFirstTimeHelp = (username: string, password: string) => {
  const help = horizontalCenter([
    "<h2>Welcome</h2>",
    "<h3>This appears to be your first time. Take a couple seconds to familiarize yourself with the controls.</h3>",
    keybindingHelpText(keybind),
    "<br/><button id='continue'>Continue</button>",
  ]);

  showDialog(help);
  document.getElementById("continue").addEventListener("click", () => {
    doLogin(username, password);
  });
  localStorage.setItem("visited", "true");
};

const setupLoginDialog = () => {
  const passwordInput = document.getElementById("password") as HTMLInputElement;
  const usernameInput = document.getElementById("username") as HTMLInputElement;
  usernameInput.addEventListener("keyup", (event) => {
    if (event.key === "Enter") {
      passwordInput.focus();
    }
  });
  passwordInput.addEventListener("keydown", loginKeyHandler);
  keylayoutSelectorSetup();
  const alliance = document.getElementById("alliance") as HTMLInputElement;
  const confederation = document.getElementById("confederation") as HTMLInputElement;
  alliance.addEventListener("change", () => {
    if (alliance.checked) {
      setFaction(Faction.Alliance);
      setDialogBackground(allianceColor);
    }
  });
  confederation.addEventListener("change", () => {
    if (confederation.checked) {
      setFaction(Faction.Confederation);
      setDialogBackground(confederationColor);
    }
  });
  document.getElementById("loginButton")?.addEventListener("click", loginHandler);
  document.getElementById("registerButton")?.addEventListener("click", registerHandler);
};

const run = () => {
  showDialog(loginDialog);
  setupLoginDialog();

  initBlankState();

  bindAction("init", (data: { id: number; sector: number }) => {
    setMe(data.id);
    setCurrentSector(data.sector);
    initStars(data.sector);
    initSettings();
    clearDialogStack();
    clearDialog();
    hideDialog();
    initInputHandlers();
  });

  bindAction("loginFail", (data: {}) => {
    const errorSpot = document.getElementById("errorSpot") as HTMLDivElement;
    if (errorSpot) {
      errorSpot.innerHTML = `<h2 style="color: red;">Invalid login<h2>`;
    }
    clearDialogStack();
  });

  bindAction("registerFail", (data: { error: string }) => {
    const errorSpot = document.getElementById("errorSpot") as HTMLDivElement;
    if (errorSpot) {
      errorSpot.innerHTML = `<h2 style="color: red;">Unable to register: ${data.error}<h2>`;
    }
    clearDialogStack();
  });

  bindAction("error", (data: { message: string }) => {
    console.error("Error from server: " + data.message);
  });

  bindDockingUpdaters();

  bindAction("state", (data: any) => {
    state.players.clear();
    state.projectiles.clear();
    state.missiles.clear();

    const players = data.players as Player[];

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
    const self = state.players.get(me);
    if (!self) {
      // The old assumption was that if we didn't have a self, we were dead.
      // This is no longer true (also this is wrong because it spams the dialog stack with dead dialogs)
      // targetId = 0;
      // targetAsteroidId = 0;
      // pushDialog(deadDialog, setupDeadDialog, "dead");
    }
    if (self) {
      updateDom("cargo", self.cargo);
      updateDom("credits", self.credits);
      updateDom("arms", self.armIndices);
      runPostUpdaterOnly("ship", self.definitionIndex);
      if (self.docked) {
        targetId = 0;
        targetAsteroidId = 0;
      }
    }
    applyEffects(data.effects);
  });

  bindAction("dead", (data: {}) => {
    // Not strictly necessary to clear the targets, but it avoids potential incorrect in yet to be written code
    targetId = 0;
    targetAsteroidId = 0;
    pushDialog(deadDialog, setupDeadDialog, "dead");
  });

  bindAction("warp", (data: { to: number }) => {
    console.log("Warping to sector " + data.to);
    // hideDialog();
    if (data.to !== currentSector) {
      state.asteroids.clear();
      initStars(data.to);
      clearEffects();
      setCurrentSector(data.to);
    }
    targetId = 0;
    targetAsteroidId = 0;
  });

  bindAction("win", (data: { faction: Faction }) => {
    showDialog(horizontalCenter([`<h2>${getFactionString(data.faction)} wins!</h2>`, '<button onclick="location.reload();">Play Again</button>']));
    unbindAllActions();
  });

  bindAction("chat", (data: { id: number; message: string }) => {
    chats.push({
      id: data.id,
      message: data.message,
      showUntil: Date.now() + 8000,
    });
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
