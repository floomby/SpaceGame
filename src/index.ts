import {
  connect,
  bindAction,
  login,
  sendInput,
  sendDock,
  sendUndock,
  sendTarget,
  sendSecondary,
  sendSellCargo,
  sendEquip,
  unbindAllActions,
  sendChat,
  sendPurchase,
  register,
  sendWarp,
} from "./net";
import {
  GlobalState,
  Input,
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
  peekTag as peekDialogTag,
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
  keybind,
  me,
  setCurrentSector,
  setFaction,
  setMe,
} from "./globals";
import { initSettings } from "./dialogs/settings";
import { keylayoutSelector, keylayoutSelectorSetup } from "./dialogs/keyboardLayout";
import { mapDialog, setupMapDialog } from "./dialogs/map";
import { deadDialog, setupDeadDialog } from "./dialogs/dead";

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

let chatInput: HTMLInputElement;

const initInputHandlers = () => {
  chatInput = document.getElementById("chatInput") as HTMLInputElement;
  // if the chat is unfocused and empty we need to hide it
  chatInput.addEventListener("blur", () => {
    if (chatInput.value === "") {
      chatInput.style.display = "none";
    }
  });

  document.addEventListener("keydown", (e) => {
    if (chatInput === document.activeElement) {
      if (e.key === "Enter" && chatInput.value !== "") {
        sendChat(me, chatInput.value);
        chatInput.value = "";
        chatInput.blur();
        chatInput.style.display = "none";
      } else if (e.key === "Enter") {
        chatInput.blur();
        chatInput.style.display = "none";
      }
      return;
    }

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
      case keybind.chat:
        if (!isDialogShown) {
          chatInput.style.display = "block";
          chatInput.focus();
        }
        break;
      case keybind.map:
        if (!isDialogShown) {
          pushDialog(mapDialog(), setupMapDialog, "map");
        } else if (peekDialogTag() === "map") {
          popDialog();
        }
      // Temporary keybind for testing
      case keybind.warp:
        sendWarp(me, 2);
    }
    if (changed) {
      sendInput(input, me);
    }
    if (oldSecondary !== selectedSecondary) {
      selectedSecondaryChanged = true;
    }
  });
  document.addEventListener("keyup", (e) => {
    if (chatInput === document.activeElement) {
      return;
    }

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
let chats: ChatMessage[] = [];

let docker = () => {};
let showDocked = false;

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
  let html = '<table style="width: 100%; text-align: left;">';
  // html += "<tr><th>Item</th><th>Quantity</th><th>Sell</th></tr>";
  let index = 0;
  for (const entry of cargo) {
    html += `<tr>
  <td>${entry.what}</td>
  <td>${entry.amount}</td>
  <td style="text-align: right;"><button id="sellCargo${index}">Sell</button></td></tr>`;
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

const disableTooExpensive = (player: Player | undefined, cost: number) => {
  if (player) {
    if (player.credits < cost) {
      return "disabled";
    } else {
      return "";
    }
  } else {
    return "disabled";
  }
};

const armsHtml = (armIndices: number[]) => {
  let html = '<table style="width: 100%; text-align: left;">';
  // html += "<tr><th>Item</th><th></th><th></th></tr>";
  let index = 0;
  for (const entry of armIndices) {
    const armDef = armDefs[entry];
    html += `<tr>
  <td>${armDef.name}</td>
  <td style="text-align: right;"><button id="arm${index++}">Change</button></td></tr>`;
  }
  html += "</table>";
  return html;
};

const armsPostUpdate = (armIndices: number[]) => {
  for (let i = 0; i < armIndices.length; i++) {
    const button = document.getElementById(`arm${i}`);
    if (button) {
      button.addEventListener("click", () => {
        const slotIndex = i;
        const index = parseInt(button.id.substring(3));
        const self = state.players.get(me);
        if (self) {
          const def = defs[self.definitionIndex];
          if (def.slots.length > index) {
            const kind = def.slots[index];
            showDialog(equipMenu(kind, slotIndex));
            setupEquipMenu(kind, slotIndex);
          } else {
            console.log("no slot for index", index);
          }
        }
      });
    } else {
      console.log("button not found", `arm${i}`);
    }
  }
};

let equipMenu = (kind: SlotKind, slotIndex: number) => {
  let index = 0;
  let html = `<table style="width: 80vw; text-align: left;">
  <colgroup>
    <col span="1" style="width: 30vw;">
    <col span="1" style="width: 10vw;">
    <col span="1" style="width: 20vw;">
    <col span="1" style="width: 20vw;">
  </colgroup>`;
  html += '<tr><th>Armament</th><th></th><th style="text-align: left;">Price</th><th></th></tr>';
  for (const armDef of armDefs) {
    if (armDef.kind === kind) {
      html += `<tr>
  <td>${armDef.name}</td>
  <td><div class="tooltip">?<span class="tooltipText">&nbsp;${armDef.description}&nbsp;</span></div></td>
  <td>${armDef.cost}</td>
  <td style="text-align: right;"><button id="equip${index++}" ${disableTooExpensive(state.players.get(me), armDef.cost)}>Equip</button></td></tr>`;
    }
  }
  html += "</table>";
  return horizontalCenter([html, '<br><button id="back">Back</button>']);
};

const shipViewer = () => {
  return `<div style="display: flex; flex-direction: row;">
  <div>
    <canvas id="shipView" width="200" height="200"></canvas>
    <button id="changeShip" style="top: 0;">Change</button>
  </div>
  <div style="width: 60vw;">
    <div id="shipStats" style="width: 100%">
    </div>
  </div>
</div>`;
};

const shipPreviewer = (definitionIndex: number) => {
  const def = defs[definitionIndex];
  return `<div style="display: flex; flex-direction: row;">
  <canvas id="shipPreview" width="200" height="200"></canvas>
  <div style="width: 60vw;">
    <div id="shipStatsPreview" style="width: 100%">
    </div>
  </div>
</div>`;
};

const shipShop = () => {
  const self = state.players.get(me);
  return horizontalCenter([shipPreviewer(self.definitionIndex), `<div id="shipList"></div>`, `<button id="back">Back</button>`]);
};

const populateShipList = (availableShips: { def: UnitDefinition; index: number }[], self: Player) => {
  const shipList = document.getElementById("shipList");
  if (shipList) {
    shipList.innerHTML = `<table style="width: 80vw; text-align: left;">
  <colgroup>
    <col span="1" style="width: 30vw;">
    <col span="1" style="width: 10vw;">
    <col span="1" style="width: 20vw;">
    <col span="1" style="width: 20vw;">
  </colgroup>
  <tbody>
    ${availableShips
      .map(
        ({ def, index }) => `<tr>
    <td>${def.name}</td>
    <td><button id="previewShip${index}">Preview</button></td>
    <td>${def.price}</td>
    <td><button id="purchase${index}" ${self.credits >= def.price ? "" : "disabled"}>Purchase</button></td></tr>`
      )
      .join("")}
  </tbody>
  </table>`;
  }
};

const shipViewerHelper = (defIndex: number, shipViewId: string, shipStatId: string) => {
  if (!isDialogShown) {
    return;
  }
  const canvas = document.getElementById(shipViewId) as HTMLCanvasElement;
  if (!canvas) {
    console.log("no canvas for ship preview");
    return;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    console.log("no context for ship preview");
    return;
  }
  const def = defs[defIndex];
  const sprite = sprites[defIndex];
  if (!sprite) {
    console.log("no sprite for ship preview");
    return;
  }
  const widthScale = canvas.width / sprite.width;
  const heightScale = canvas.height / sprite.height;
  let scale = Math.min(widthScale, heightScale);
  if (scale > 1) {
    scale = 1;
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  ctx.drawImage(sprite, centerX - (sprite.width * scale) / 2, centerY - (sprite.height * scale) / 2, sprite.width * scale, sprite.height * scale);

  const stats = document.getElementById(shipStatId);
  if (stats) {
    const normalSlotCount = def.slots.filter((kind) => kind === SlotKind.Normal).length;
    const utilitySlotCount = def.slots.filter((kind) => kind === SlotKind.Utility).length;
    const mineSlotCount = def.slots.filter((kind) => kind === SlotKind.Mine).length;
    const largeSlotCount = def.slots.filter((kind) => kind === SlotKind.Large).length;

    stats.innerHTML = `<table style="width: 100%; text-align: left;">
  <tr><th>Name</th><td>${def.name}</td></tr>
  <tr><th>Speed</th><td>${maxDecimals(def.speed * ticksPerSecond, 2)} Units/sec</td></tr>
  <tr><th>Turn Rate</th><td>${maxDecimals(def.turnRate * ticksPerSecond, 2)} Radians/sec</td></tr>
  <tr><th>Acceleration</th><td>${maxDecimals(def.acceleration * ticksPerSecond, 2)} Units/sec<sup>2</sup></td></tr>
  <tr><th>Health</th><td>${maxDecimals(def.health, 2)}</td></tr>
  ${normalSlotCount > 0 ? `<tr><th>Normal Slots</th><td>${normalSlotCount}</td></tr>` : ""}
  ${utilitySlotCount > 0 ? `<tr><th>Utility Slots</th><td>${utilitySlotCount}</td></tr>` : ""}
  ${mineSlotCount > 0 ? `<tr><th>Mine Slots</th><td>${mineSlotCount}</td></tr>` : ""}
  ${largeSlotCount > 0 ? `<tr><th>Large Slots</th><td>${largeSlotCount}</td></tr>` : ""}
  <tr><th>Energy Regen</th><td>${maxDecimals(def.energyRegen * ticksPerSecond, 2)} Energy/sec</td></tr>
  <tr><th>Health Regen</th><td>${maxDecimals(def.healthRegen * ticksPerSecond, 2)} Health/sec</td></tr>
  <tr><th>Cargo Capacity</th><td>${maxDecimals(def.cargoCapacity, 2)}</td></tr>
</table>`;
  }
};

const populateShipPreviewer = (definitionIndex: number) => {
  shipViewerHelper(definitionIndex, "shipPreview", "shipStatsPreview");
};

const setupShipShop = () => {
  const self = state.players.get(me);
  const availableShips = defs
    .map((def, index) => {
      return { def, index };
    })
    .filter(({ def }) => {
      return def.kind === UnitKind.Ship && def.team === defs[self.definitionIndex].team;
    });
  populateShipList(availableShips, self);
  console.log("available ships", availableShips);
  for (const { def, index } of availableShips) {
    const button = document.getElementById(`purchase${index}`);
    if (button) {
      button.addEventListener("click", () => {
        sendPurchase(me, index);
        const self = state.players.get(me);
        const station = state.players.get(self?.docked);
        showDialog(dockDialog(station, self));
        setupDockingUI(station, self);
      });
    } else {
      console.log("button not found", `purchase${index}`);
    }
    const preview = document.getElementById(`previewShip${index}`);
    if (preview) {
      preview.addEventListener("click", () => {
        populateShipPreviewer(index);
      });
    } else {
      console.log("preview not found", `previewShip${index}`);
    }
  }
  document.getElementById("back")?.addEventListener("click", () => {
    popDialog();
  });
};

const dockDialog = (station: Player | undefined, self: Player) => {
  if (!station) {
    return `Docking error - station ${self.docked} not found`;
  }
  return horizontalCenter([
    domFromRest(`/stationName?id=${station.id}`, (name) => `<h2>Docked with station ${name}</h2>`),
    `${shipViewer()}`,
    `<div id="credits">${creditsHtml(self.credits)}</div>`,
    `<div style="width: 80vw;">
  <div style="width: 45%; float: left;">
    <h3>Cargo</h3>
    <div id="cargo">${cargoHtml(self.cargo)}</div>
  </div>
  <div style="width: 45%; float: right;">
    <h3>Armaments</h3>
    <div id="arms">${armsHtml(self.armIndices)}</div>
  </div>
</div>`,
    `<br/><button id="undock">Undock</button>`,
  ]);
};

const shipPostUpdate = (defIndex: number) => {
  shipViewerHelper(defIndex, "shipView", "shipStats");
};

const setupDockingUI = (station: Player | undefined, self: Player | undefined) => {
  if (!station || !self) {
    return;
  }
  document.getElementById("undock")?.addEventListener("click", () => {
    sendUndock(me);
  });
  cargoPostUpdate(self.cargo);
  armsPostUpdate(self.armIndices);
  shipPostUpdate(self.definitionIndex);
  document.getElementById("changeShip")?.addEventListener("click", () => {
    pushDialog(shipShop(), setupShipShop);
  });
};

const setupEquipMenu = (kind: SlotKind, slotIndex: number) => {
  let index = 0;
  for (const armDef of armDefs) {
    if (armDef.kind === kind) {
      const button = document.getElementById(`equip${index++}`);
      if (button) {
        button.addEventListener("click", () => {
          const idx = armDefs.indexOf(armDef);
          sendEquip(me, slotIndex, idx);
          const self = state.players.get(me);
          const station = state.players.get(self?.docked);
          showDialog(dockDialog(station, self));
          setupDockingUI(station, self);
        });
      } else {
        console.log("button not found", `equip${index}`);
      }
    }
  }
  document.getElementById("back")?.addEventListener("click", () => {
    const self = state.players.get(me);
    const station = state.players.get(self?.docked);
    showDialog(dockDialog(station, self));
    setupDockingUI(station, self);
  });
};

let lastValidSecondary = 0;
let serverTarget: [TargetKind, number] = [TargetKind.None, 0];

let lastFrameTime = Date.now();

const lastChats = new Map<number, ChatMessage>();

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
      chatInput.blur();
      chatInput.style.display = "none";
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

  state = {
    players: new Map(),
    projectiles: new Map(),
    asteroids: new Map(),
    missiles: new Map(),
  };

  bindAction("init", (data: { id: number; sector: number }) => {
    setMe(data.id);
    setCurrentSector(data.sector);
    initStars(data.sector);
    initSettings();
    clearDialogStack();
    clearDialog();
    hideDialog();
    initInputHandlers();
    chatInput.blur();
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

  bindUpdater("cargo", cargoHtml);
  bindPostUpdater("cargo", cargoPostUpdate);
  bindUpdater("credits", creditsHtml);
  bindUpdater("arms", armsHtml);
  bindPostUpdater("arms", armsPostUpdate);
  bindPostUpdater("ship", shipPostUpdate);

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
