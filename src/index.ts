import { connect, bindAction, sendDock, sendTarget, sendSecondary, unbindAllActions } from "./net";
import {
  Player,
  Ballistic,
  setCanDock,
  findNextTarget,
  findPreviousTarget,
  Asteroid,
  findNextTargetAsteroid,
  findPreviousTargetAsteroid,
  TargetKind,
  Missile,
  ChatMessage,
} from "./game";
import {
  init as initDialog,
  show as showDialog,
  hide as hideDialog,
  clear as clearDialog,
  push as pushDialog,
  pop as popDialog,
  clearStack as clearDialogStack,
  horizontalCenter,
  updateDom,
  runPostUpdaterOnly,
  peekTag,
} from "./dialog";
import { defs, initDefs, Faction, getFactionString } from "./defs";
import { drawEverything, flashSecondary, initDrawing, initStars } from "./drawing";
import { applyEffects, clearEffects } from "./effects";
import { currentSector, initBlankState, keybind, ownId, selectedSecondary, setCurrentSector, setOwnId, setSelectedSecondary, state } from "./globals";
import { initSettings } from "./dialogs/settings";
import { deadDialog, setupDeadDialog } from "./dialogs/dead";
import { hideChat, initInputHandlers, input, selectedSecondaryChanged, setSelectedSecondaryChanged, targetEnemy } from "./input";
import { bindDockingUpdaters, dockDialog, docker, setDocker, setShowDocked, setupDockingUI, showDocked } from "./dialogs/dock";
import { displayLoginDialog } from "./dialogs/login";

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

  const self = state.players.get(ownId);

  const def = self ? defs[self.definitionIndex] : undefined;
  if (self && selectedSecondaryChanged) {
    if (selectedSecondary < def.slots.length) {
      lastValidSecondary = selectedSecondary;
      flashSecondary();
      sendSecondary(ownId, selectedSecondary);
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
    sendTarget(ownId, serverTarget);
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
      sendDock(ownId, self.canDock);
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

  drawEverything(state, self, target, targetAsteroid, ownId, selectedSecondary, keybind, sixtieths, lastChats);

  requestAnimationFrame(loop);
};

const run = () => {
  displayLoginDialog();

  initBlankState();

  bindAction("init", (data: { id: number; sector: number }) => {
    setOwnId(data.id);
    setCurrentSector(data.sector);
    initStars(data.sector);
    initSettings();
    clearDialogStack();
    clearDialog();
    hideDialog();
    initInputHandlers();
  });

  bindAction("loginFail", (data: { error: string }) => {
    if (peekTag() !== "loggingIn") {
      console.log("Expecting top of dialog stack to be loggingIn, but it is not");
    }
    popDialog();
    const errorSpot = document.getElementById("errorSpot") as HTMLDivElement;
    if (errorSpot) {
      errorSpot.innerHTML = `<h2 style="color: red;">Invalid login: ${data.error}<h2>`;
    }
  });

  bindAction("registerFail", (data: { error: string }) => {
    if (peekTag() !== "registering") {
      console.log("Expecting top of dialog stack to be registering, but it is not");
    }
    popDialog();
    const errorSpot = document.getElementById("registerErrorSpot") as HTMLDivElement;
    if (errorSpot) {
      errorSpot.innerHTML = `<h2 style="color: red;">Unable to register: ${data.error}<h2>`;
    }
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
    const self = state.players.get(ownId);
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
