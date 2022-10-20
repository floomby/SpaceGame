import {
  connect,
  bindAction,
  register,
  sendInput,
  sendDock,
  sendUndock,
  sendRespawn,
  sendTarget,
  sendSecondary,
  sendSellCargo,
  sendEquip,
  unbindAllActions,
  sendChat,
} from "./net";
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
  isShown as isDialogShown,
  horizontalCenter,
  updateDom,
  bindUpdater,
  bindPostUpdater,
  setDialogBackground,
  runPostUpdaterOnly,
} from "./dialog";
import { defs, initDefs, Faction, getFactionString, armDefs, SlotKind } from "./defs";
import { canvas, drawEverything, flashSecondary, initDrawing, sprites } from "./drawing";
import { dvorakBindings, KeyBindings, qwertyBindings, useKeybindings } from "./keybindings";
import { applyEffects } from "./effects";
import { initSound, setVolume, getVolume } from "./sound";
import { defaultKeyLayout } from "./config";

// The server will assign our id after we register
let me: number;

let keybind = useKeybindings(defaultKeyLayout);

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
        if (!isDialogShown()) {
          chatInput.style.display = "block";
          chatInput.focus();
        }
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

const shipViewer = (definitionIndex: number) => {
  const def = defs[definitionIndex];
  return `<div style=" display: flex; flex-direction: row;">
  <canvas id="shipView" width="200" height="200"></canvas>
  <div style="width: 60vw;">
    <div id="shipStats" style="width: 100%">
    </div>
  </div>
</div>`;
};

const dockDialog = (station: Player | undefined, self: Player) => {
  if (!station) {
    return `Docking error - station ${self.docked} not found`;
  }
  return horizontalCenter([
    `<h2>Docked with ${station.name}</h2>`,
    `${shipViewer(self.definitionIndex)}`,
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
  const canvas = document.getElementById("shipView") as HTMLCanvasElement;
  if (!canvas) {
    console.log("no canvas for ship view");
    return;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    console.log("no context for ship view");
    return;
  }
  const def = defs[defIndex];
  const sprite = sprites[defIndex];
  if (!sprite) {
    console.log("no sprite for ship view");
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

  const stats = document.getElementById("shipStats");
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

let faction: Faction = Faction.Alliance;

const registerer = (username: string) => {
  register(username, faction);
  clearDialog();
  hideDialog();
  initInputHandlers();
};

const keylayoutSelector = () => `<fieldset>
<legend>Keyboard Layout</legend>
<div style="text-align: left;">
  <input type="radio" id="qwerty" name="keyboard" value="qwerty">
  <label for="qwerty">QWERTY</label>
  <div class="tooltip">?<span class="bigTooltipText">&nbsp;${keybindingTooltipText(qwertyBindings)}&nbsp;</span></div>
</div>
<div style="text-align: left;">
  <input type="radio" id="dvorak" name="keyboard" value="dvorak">
  <label for="dvorak">Dvorak</label>
  <div class="tooltip">?<span class="bigTooltipText">&nbsp;${keybindingTooltipText(dvorakBindings)}&nbsp;</span></div>
</div>
</fieldset>`;

const keylayoutSelectorSetup = () => {
  const qwerty = document.getElementById("qwerty") as HTMLInputElement;
  const dvorak = document.getElementById("dvorak") as HTMLInputElement;
  qwerty?.addEventListener("change", () => {
    if (qwerty.checked) {
      keybind = qwertyBindings;
    }
  });
  dvorak?.addEventListener("change", () => {
    if (dvorak.checked) {
      keybind = dvorakBindings;
    }
  });
  if (keybind === qwertyBindings) {
    qwerty.checked = true;
  } else {
    dvorak.checked = true;
  }
};

const allianceColor = "rgba(22, 45, 34, 0.341)";
const confederationColor = "rgba(49, 25, 25, 0.341)";
const allianceColorDark = "rgba(22, 45, 34, 0.8)";
const confederationColorDark = "rgba(49, 25, 25, 0.8)";

const settingsDialog = () =>
  horizontalCenter([
    `<h1>Settings</h1>`,
    `Volume:`,
    `<input type="range" min="0" max="1" value="${getVolume()}" class="slider" id="volumeSlider" step="0.05"><br/>`,
    keylayoutSelector(),
    `<br/><button id="closeSettings">Close</button>`,
  ]);

let settingShown = false;

const setupSettingsDialog = () => {
  document.getElementById("closeSettings")?.addEventListener("click", () => {
    settingShown = false;
    setDialogBackground(faction === Faction.Alliance ? allianceColor : confederationColor);
    popDialog();
  });
  const volumeSlider = document.getElementById("volumeSlider") as HTMLInputElement;
  volumeSlider?.addEventListener("input", () => {
    setVolume(parseFloat(volumeSlider.value));
  });
  volumeSlider.value = getVolume().toString();
  keylayoutSelectorSetup();
};

const initSettings = () => {
  const settingsIcon = document.getElementById("settingsIcon");
  if (settingsIcon) {
    settingsIcon.addEventListener("click", () => {
      if (!settingShown) {
        pushDialog(settingsDialog(), setupSettingsDialog);
        settingShown = true;
        setDialogBackground(faction === Faction.Alliance ? allianceColorDark : confederationColorDark);
      }
    });
    settingsIcon.style.display = "flex";
  }
};

const doRegister = () => {
  // Sound init and setting menu init feel strange being here (we need sound somewhere after page interaction since autoplay is not allowed)
  // and this is the first place that page interaction is guaranteed to have happened. Setting menu should be drawn after the game starts which
  // is after the registration.
  initSound();
  initSettings();
  const input = document.getElementById("username") as HTMLInputElement;
  const visited = localStorage.getItem("visited") !== null;
  if (visited) {
    registerer(input.value);
  } else {
    showFirstTimeHelp(input.value);
  }
};

const registerHandler = (e: KeyboardEvent) => {
  if (e.key === "Enter") {
    doRegister();
  }
};

const keybindingTooltipText = (bindings: KeyBindings) => {
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

  return `<table style="width: 100%; text-align: left; white-space: nowrap;">
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
  <tr><td style="padding-right: 3vw;">${keys.up}</td><td>Accelerate</td></tr>
  <tr><td style="padding-right: 3vw;">${keys.down}</td><td>Decelerate</td></tr>
  <tr><td style="padding-right: 3vw;">${keys.left}</td><td>Rotate left</td></tr>
  <tr><td style="padding-right: 3vw;">${keys.right}</td><td>Rotate right</td></tr>
  <tr><td style="padding-right: 3vw;">${keys.chat}</td><td>Chat</td></tr>
</table>`;
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
  `<br/>${keylayoutSelector()}`,
  '<br/><button id="register">Play</button>',
]);

const showFirstTimeHelp = (username: string) => {
  const help = horizontalCenter([
    "<h2>Welcome</h2>",
    "<h3>This appears to be your first time. Take a couple seconds to familiarize yourself with the controls.</h3>",
    keybindingHelpText(keybind),
    "<br/><button id='continue'>Continue</button>",
  ]);

  showDialog(help);
  document.getElementById("continue").addEventListener("click", () => {
    registerer(username);
  });
  localStorage.setItem("visited", "true");
};

const setupRegisterDialog = () => {
  const usernameInput = document.getElementById("username") as HTMLInputElement;
  usernameInput.addEventListener("keydown", registerHandler);
  keylayoutSelectorSetup();
  const alliance = document.getElementById("alliance") as HTMLInputElement;
  const confederation = document.getElementById("confederation") as HTMLInputElement;
  alliance.addEventListener("change", () => {
    if (alliance.checked) {
      faction = Faction.Alliance;
      setDialogBackground(allianceColor);
    }
  });
  confederation.addEventListener("change", () => {
    if (confederation.checked) {
      faction = Faction.Confederation;
      setDialogBackground(confederationColor);
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
    chatInput.blur();
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
      updateDom("arms", self.armIndices);
      runPostUpdaterOnly("ship", self.definitionIndex);
      didDie = false;
      if (self.docked) {
        targetId = 0;
        targetAsteroidId = 0;
      }
    }
    applyEffects(data.effects);
  });

  // bindAction("input", (data: any) => {
  //   const { input, id } = data;
  //   const player = state.players.get(id);
  //   if (player) {
  //     applyInputs(input, player);
  //   }
  // });

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
