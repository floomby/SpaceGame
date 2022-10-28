import { connect, bindAction, sendDock, sendTarget, sendSecondary, unbindAllActions, sendInput, sendAngle, sendRepair } from "./net";
import {
  Player,
  Ballistic,
  setCanDockOrRepair,
  findNextTarget,
  findPreviousTarget,
  Asteroid,
  findNextTargetAsteroid,
  findPreviousTargetAsteroid,
  TargetKind,
  Missile,
  ChatMessage,
  Collectable,
  findSmallAngleBetween,
  findClosestTarget,
  Position,
  findAllPlayersOverlappingPoint,
  findAllAsteroidsOverlappingPoint,
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
import { defs, initDefs, Faction, getFactionString, armDefs, SlotKind, EmptySlot } from "./defs";
import { drawEverything, fadeOutCollectable, initDrawing, initStars, pushMessage } from "./drawing";
import { applyEffects, clearEffects } from "./effects";
import {
  currentSector,
  initBlankState,
  keybind,
  lastSelf,
  ownId,
  selectedSecondary,
  setCurrentSector,
  setLastSelf,
  setOwnId,
  setSelectedSecondary,
  state,
} from "./globals";
import { initSettings } from "./dialogs/settings";
import { deadDialog, setupDeadDialog } from "./dialogs/dead";
import { hideChat, initInputHandlers, input, selectedSecondaryChanged, setSelectedSecondaryChanged, targetAngle, targetEnemy } from "./input";
import { bindDockingUpdaters, dockDialog, docker, setDocker, setShowDocked, setupDockingUI, showDocked } from "./dialogs/dock";
import { displayLoginDialog } from "./dialogs/login";

let chats: ChatMessage[] = [];

let targetId = 0;
let targetAsteroidId = 0;

let lastValidSecondary = 0;
let serverTarget: [TargetKind, number] = [TargetKind.None, 0];

let lastFrameTime = Date.now();

const lastChats = new Map<number, ChatMessage>();

let oldAngle = 0;

const selectFirstSecondary = (self: Player) => {
  let index = 1;
  // All the low arm defs are for empty slots
  while (index < self.armIndices.length && self.armIndices[index] < SlotKind.Mining) {
    index++;
  }
  if (index < self.armIndices.length) {
    setSelectedSecondary(index);
    setSelectedSecondaryChanged(true);
  }
};

let forceSetSecondary = false;

// TODO There is a bunch of business logic in here that should be refactored into better places
const loop = () => {
  const elapsed = Date.now() - lastFrameTime;
  lastFrameTime = Date.now();
  const sixtieths = elapsed / 16.666666666666666666666666666667;

  let target: Player | undefined = undefined;
  let targetAsteroid: Asteroid | undefined = undefined;

  const self = state.players.get(ownId);

  if (self && input.dock) {
    docker();
  }

  if (self && !self.docked) {
    if (oldAngle !== targetAngle) {
      oldAngle = targetAngle;
      const delta = findSmallAngleBetween(self.heading, targetAngle);
      if (delta > 0.01) {
        sendAngle(ownId, targetAngle);
      } else if (delta < -0.01) {
        sendAngle(ownId, targetAngle);
      }
    }
  }

  if (self && !self.docked) {
    const def = defs[self.definitionIndex];
    if (!input.quickTargetClosestEnemy) {
      if ((input.nextTarget || input.previousTarget) && !input.nextTargetAsteroid && !input.previousTargetAsteroid) {
        target = state.players.get(targetId);
        target = input.nextTarget
          ? findNextTarget(self, target, state, def.scanRange, targetEnemy)
          : findPreviousTarget(self, target, state, def.scanRange, targetEnemy);
        targetId = target?.id ?? 0;
        input.nextTarget = false;
        input.previousTarget = false;
        if (target) {
          targetAsteroidId = 0;
        }
      } else if (input.nextTargetAsteroid || input.previousTargetAsteroid) {
        targetAsteroid = state.asteroids.get(targetAsteroidId);
        targetAsteroid = input.nextTargetAsteroid
          ? findNextTargetAsteroid(self, targetAsteroid, state, def.scanRange)
          : findPreviousTargetAsteroid(self, targetAsteroid, state, def.scanRange);
        targetAsteroidId = targetAsteroid?.id ?? 0;
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
    } else {
      target = findClosestTarget(self, state, def.scanRange, true);
      targetId = target?.id ?? 0;
      targetAsteroid = undefined;
      targetAsteroidId = 0;
      input.quickTargetClosestEnemy = false;
      forceSetSecondary = true;
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

  if (forceSetSecondary && self && selectedSecondary === 0 && !targetAsteroid && target && target.team !== self.team) {
    selectFirstSecondary(self);
    forceSetSecondary = false;
  }

  if (
    forceSetSecondary &&
    self &&
    selectedSecondary !== 0 &&
    targetAsteroid &&
    self.armIndices.length > 0 &&
    self.armIndices[0] !== EmptySlot.Mining
  ) {
    setSelectedSecondary(0);
    setSelectedSecondaryChanged(true);
    forceSetSecondary = false;
  }

  const def = self ? defs[self.definitionIndex] : undefined;
  if (self && selectedSecondaryChanged) {
    if (selectedSecondary < def.slots.length) {
      lastValidSecondary = selectedSecondary;
      const armamentDef = armDefs[self.armIndices[selectedSecondary]];
      pushMessage(`${selectedSecondary} - ${armamentDef.name}`);
      sendSecondary(ownId, selectedSecondary);
    } else {
      setSelectedSecondary(lastValidSecondary);
    }
    setSelectedSecondaryChanged(false);
  }

  if (self && !self.docked && showDocked) {
    setShowDocked(false);
    clearDialog();
    hideDialog();
  }
  setCanDockOrRepair(self, state);
  if (self) {
    if (self.canDock) {
      setDocker(() => {
        sendDock(ownId, self.canDock);
      });
    }
    if (self.canRepair) {
      setDocker(() => {
        sendRepair(ownId, self.canRepair);
      });
    }
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

const targetAtCoords = (coords: Position) => {
  const possibleTargets = findAllPlayersOverlappingPoint(coords, state.players.values()).filter((p) => p.id !== ownId && !p.inoperable);
  if (possibleTargets.length) {
    const target = possibleTargets[Math.floor(Math.random() * possibleTargets.length)];
    targetId = target.id;
    targetAsteroidId = 0;
    forceSetSecondary = true;
  } else {
    const possibleAsteroids = findAllAsteroidsOverlappingPoint(coords, state.asteroids.values());
    if (possibleAsteroids.length) {
      const target = possibleAsteroids[Math.floor(Math.random() * possibleAsteroids.length)];
      targetId = 0;
      targetAsteroidId = target.id;
      forceSetSecondary = true;
    }
  }
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
    initInputHandlers(targetAtCoords);
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
      setLastSelf(self);
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
      state.collectables.clear();
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

  bindAction("serverMessage", (data: { message: string }) => {
    pushMessage(data.message);
  });

  bindAction("addCollectables", (data: Collectable[]) => {
    for (const collectable of data) {
      collectable.phase = 0;
      state.collectables.set(collectable.id, collectable);
    }
  });

  bindAction("removeCollectable", (data: { id: number; collected: boolean }) => {
    const collectable = state.collectables.get(data.id);
    state.collectables.delete(data.id);
    if (!data.collected) {
      fadeOutCollectable(collectable);
    }
  });

  bindAction("removeAsteroids", (data: { ids: number[] }) => {
    for (const id of data.ids) {
      state.asteroids.delete(id);
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
