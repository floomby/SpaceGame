import { connect, bindAction, sendDock, sendTarget, sendSecondary, sendAngle, sendRepair, sendTutorialStageComplete } from "./net";
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
  findAllPlayersOverlappingPoint,
  findAllAsteroidsOverlappingPoint,
  CargoEntry,
  Mine,
  SectorInfo,
  CloakedState,
  TutorialStage,
} from "./game";
import {
  init as initDialog,
  show as showDialog,
  hide as hideDialog,
  clear as clearDialog,
  push as pushDialog,
  pop as popDialog,
  clearStack as clearDialogStack,
  updateDom,
  runPostUpdaterOnly,
  peekTag,
  setDialogBackground,
  clearStack,
  bindPostUpdater,
} from "./dialog";
import { defs, initDefs, Faction, armDefs, SlotKind, EmptySlot } from "./defs";
import { applyEffects, clearEffects } from "./effects";
import {
  addLoadingText,
  clearInventory,
  clearMissionStatus,
  currentSector,
  hideLoadingText,
  initBlankState,
  inventory,
  keybind,
  lastSelf,
  ownId,
  recipesKnown,
  sectorData,
  selectedSecondary,
  setCurrentSector,
  setFaction,
  setLastSelf,
  setMissionComplete,
  setMissionTargetId,
  setOwnId,
  setSelectedSecondary,
  setTutorialStage,
  state,
  teamColorsLight,
  tutorialStage,
  updateFriendList,
  updateFriendRequests,
} from "./globals";
import { initSettings } from "./dialogs/settings";
import { deadDialog, setupDeadDialog } from "./dialogs/dead";
import { hideChat, initInputHandlers, input, selectedSecondaryChanged, setSelectedSecondaryChanged, targetAngle, targetEnemy } from "./input";
import { bindDockingUpdaters, dockDialog, docker, setDocker, setShowDocked, setupDockingUI, showDocked } from "./dialogs/dock";
import { displayLoginDialog } from "./dialogs/login";
import { initCargo } from "./dialogs/cargo";
import { Position } from "./geometry";
import { bindManufacturingUpdaters } from "./dialogs/manufacturing";
import { bindInventoryUpdaters } from "./dialogs/inventory";
import { tutorialCheckers } from "./tutorial";
import { setMusicAdaptationPollFunction } from "./sound";
import { init3dDrawing, drawEverything as drawEverything3, fadeOutMine, fadeOutCollectable, allowBackgroundFlash } from "./3dDrawing";
import { rasterizeText, rasterizeTextBitmap, rasterizeWeaponText, weaponTextInitialized } from "./2dDrawing";
import { pushMessage } from "./2dDrawing";
import { setCurrentSectorText } from "./dialogs/map";
import { initSocial } from "./dialogs/social";

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
  while (index < self.arms.length && self.arms[index] < SlotKind.Mining) {
    index++;
  }
  if (index < self.arms.length) {
    setSelectedSecondary(index);
    setSelectedSecondaryChanged(true);
  }
};

let forceSetSecondary = false;
let wasDisabled = false;

// TODO There is a bunch of business logic in here that should be refactored into better places

let lastEnergyWarning = Date.now();

const loop = () => {
  const elapsed = Date.now() - lastFrameTime;
  lastFrameTime = Date.now();
  const sixtieths = elapsed / 16.666666666666666666666666666667;

  if (loop) {
    if (tutorialStage !== TutorialStage.Done) {
      const checker = tutorialCheckers.get(tutorialStage);
      if (checker) {
        if (checker()) {
          sendTutorialStageComplete(tutorialStage);
        }
      } else {
        console.log("No tutorial checker for stage", tutorialStage);
      }
    }
  }

  let target: Player | undefined = undefined;
  let targetAsteroid: Asteroid | undefined = undefined;

  const self = state.players.get(ownId);

  if (self && input.dock) {
    docker();
  }

  if (self && self.disabled && !wasDisabled) {
    wasDisabled = true;
    applyEffects([{ effectIndex: 11 }]);
  } else if (self && !self.disabled && wasDisabled) {
    wasDisabled = false;
  }

  if (self && !self.docked) {
    if (oldAngle !== targetAngle) {
      oldAngle = targetAngle;
      const delta = findSmallAngleBetween(self.heading, targetAngle);
      if (delta > 0.01) {
        sendAngle(targetAngle);
      } else if (delta < -0.01) {
        sendAngle(targetAngle);
      }
    }
  }

  if (self && !self.docked) {
    const def = defs[self.defIndex];
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

  if (target?.inoperable || (target?.team !== self?.team && target?.cloak === CloakedState.Cloaked)) {
    target = undefined;
    targetId = 0;
  }

  const unifiedTargetId = targetId || targetAsteroidId;
  const unifiedTargetKind = targetId ? TargetKind.Player : targetAsteroidId ? TargetKind.Asteroid : TargetKind.None;

  if (unifiedTargetId !== serverTarget[1] || unifiedTargetKind !== serverTarget[0]) {
    serverTarget = [unifiedTargetKind, unifiedTargetId];
    sendTarget(serverTarget);
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
    self.arms.length > 0 &&
    self.arms[0] !== EmptySlot.Mining
  ) {
    setSelectedSecondary(0);
    setSelectedSecondaryChanged(true);
    forceSetSecondary = false;
  }

  const def = self ? defs[self.defIndex] : undefined;
  if (self && selectedSecondaryChanged) {
    if (selectedSecondary < def.slots.length) {
      lastValidSecondary = selectedSecondary;
      const armamentDef = armDefs[self.arms[selectedSecondary]];
      pushMessage(`${selectedSecondary} - ${armamentDef.name}`);
      sendSecondary(selectedSecondary);
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
    if (self.energy < 10 && Date.now() - lastEnergyWarning > 3000) {
      lastEnergyWarning = Date.now();
      pushMessage("Warning: Low energy!");
    }

    if (self.canDock) {
      setDocker(() => {
        sendDock(self.canDock);
      });
    }
    if (self.canRepair) {
      setDocker(() => {
        sendRepair(self.canRepair);
      });
    }
  } else {
    setDocker(() => {});
  }
  if (self && self.docked) {
    if (!showDocked) {
      // TODO This is ugly and terrible (I need to refactor the docking dialogs to use the dialog stack)
      clearStack();
      setDialogBackground(teamColorsLight[self.team]);
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

  // drawEverything(state, self, target, targetAsteroid, ownId, selectedSecondary, keybind, sixtieths, lastChats);

  drawEverything3(target, targetAsteroid, lastChats, sixtieths);

  requestAnimationFrame(loop);
};

const targetAtCoords = (coords: Position) => {
  let possibleTargets = findAllPlayersOverlappingPoint(coords, state.players.values()).filter((p) => p.id !== ownId && !p.inoperable);
  if (lastSelf) {
    possibleTargets = possibleTargets.filter((p) => {
      if (p.team === lastSelf.team) {
        return true;
      }
      if (p.cloak && p.cloak === CloakedState.Cloaked) {
        return false;
      }
      return true;
    });
  }
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

const initAsteroid = (asteroid: Asteroid) => {
  asteroid.pitch = Math.random() * Math.PI * 2;
  asteroid.roll = Math.random() * Math.PI * 2;
  asteroid.rotationRate = Math.random() * 0.01 - 0.005;
}

const initMine = (mine: Mine) => {
  mine.heading = Math.random() * Math.PI * 2;
  mine.pitch = Math.random();
};

const run = () => {
  addLoadingText("Initializing client game state");
  initBlankState();

  addLoadingText("Binding network handlers");

  bindAction(
    "init",
    (data: {
      id: number;
      sector: number;
      faction: Faction;
      asteroids: Asteroid[];
      collectables: Collectable[];
      mines: Mine[];
      sectorInfos: SectorInfo[];
      recipes: string[];
    }) => {
      setOwnId(data.id);
      updateFriendList();
      updateFriendRequests();
      setCurrentSector(data.sector);
      initSettings();
      initCargo();
      initSocial();
      clearDialogStack();
      clearDialog();
      hideDialog();
      hideLoadingText();
      initInputHandlers(targetAtCoords);
      setFaction(data.faction);
      for (const asteroid of data.asteroids) {
        initAsteroid(asteroid);
        state.asteroids.set(asteroid.id, asteroid);
      }
      for (const collectable of data.collectables) {
        collectable.phase = Math.random() * Math.PI * 2;
        state.collectables.set(collectable.id, collectable);
      }
      for (const mine of data.mines) {
        initMine(mine);
        state.mines.set(mine.id, mine);
      }
      for (const sectorInfo of data.sectorInfos) {
        sectorData.set(sectorInfo.sector, sectorInfo);
      }
      for (const recipe of data.recipes) {
        recipesKnown.add(recipe);
      }
    }
  );

  bindAction("loginFail", (data: { error: string }) => {
    if (peekTag() !== "loggingIn") {
      console.log("Expecting top of dialog stack to be loggingIn, but it is not");
    }
    popDialog();
    const errorSpot = document.getElementById("errorSpot") as HTMLDivElement;
    if (errorSpot) {
      errorSpot.innerText = `Invalid login: ${data.error}`;
    }
  });

  bindAction("registerFail", (data: { error: string }) => {
    if (peekTag() !== "registering") {
      console.log("Expecting top of dialog stack to be registering, but it is not");
    }
    popDialog();
    const errorSpot = document.getElementById("registerErrorSpot") as HTMLDivElement;
    if (errorSpot) {
      errorSpot.innerText = `Unable to register: ${data.error}`;
    }
  });

  bindAction("error", (data: { message: string }) => {
    console.error("Error from server: " + data.message);
  });

  bindDockingUpdaters();

  bindAction("state", (data: any) => {
    state.players.clear();
    state.projectiles.clear();

    const players = data.players as Player[];

    for (const player of players) {
      state.players.set(player.id, player);
    }
    for (const asteroid of data.asteroids as Asteroid[]) {
      const existing = state.asteroids.get(asteroid.id);
      if (existing) {
        asteroid.pitch = existing.pitch;
        asteroid.roll = existing.roll;
        asteroid.rotationRate = existing.rotationRate;
      } else {
        initAsteroid(asteroid);
      }
      state.asteroids.set(asteroid.id, asteroid);
    }
    for (const missile of state.missiles.values()) {
      missile.stale = true;
    }
    for (const missile of data.missiles as Missile[]) {
      const existing = state.missiles.get(missile.id);
      if (existing) {
        missile.roll = existing.roll;
      }
      state.missiles.set(missile.id, missile);
    }
    for (const [id, missile] of state.missiles) {
      if (missile.stale) {
        state.missiles.delete(id);
      }
    }
    for (const mine of data.mines as Mine[]) {
      const existing = state.mines.get(mine.id);
      if (existing) {
        mine.heading = existing.heading;
        mine.pitch = existing.pitch;
      } else {
        initMine(mine);
        state.mines.set(mine.id, mine);
      }
    }
    for (const projectile of data.projectiles as Ballistic[]) {
      state.projectiles.set(projectile.id, projectile);
    }
    const self = state.players.get(ownId);
    if (self) {
      setLastSelf(self);
      if (!weaponTextInitialized) {
        rasterizeWeaponText();
      }
      // These redundancies are stupid (minimal impact on performance though) and I should fix how this is done
      updateDom("cargo", self.cargo);
      updateDom("dumpCargo", self.cargo);
      updateDom("credits", self.credits);
      updateDom("inventoryCredits", self.credits);
      updateDom("arms", self.arms);
      runPostUpdaterOnly("ship", self.defIndex);
      if (self.docked) {
        targetId = 0;
        targetAsteroidId = 0;
      }
    }
    applyEffects(data.effects);

    for (const collectable of data.collectables) {
      collectable.phase = 0;
      state.collectables.set(collectable.id, collectable);
    }
  });

  bindAction("dead", (data: {}) => {
    // Not strictly necessary to clear the targets, but it avoids potential incorrect behavior in yet to be written code
    targetId = 0;
    targetAsteroidId = 0;
    pushDialog(deadDialog, setupDeadDialog, "dead");
  });

  bindAction("warp", (data: { to: number; asteroids: Asteroid[]; collectables: Collectable[]; mines: Mine[]; sectorInfos: SectorInfo[] }) => {
    if (data.to !== currentSector) {
      state.asteroids.clear();
      for (const asteroid of data.asteroids) {
        initAsteroid(asteroid);
        state.asteroids.set(asteroid.id, asteroid);
      }
      state.collectables.clear();
      for (const collectable of data.collectables) {
        collectable.phase = Math.random() * Math.PI * 2;
        state.collectables.set(collectable.id, collectable);
      }
      state.mines.clear();
      for (const mine of data.mines) {
        initMine(mine);
        state.mines.set(mine.id, mine);
      }
      // initStars(data.to);
      clearEffects();
      setCurrentSector(data.to);
      setCurrentSectorText();
    }

    for (const sectorInfo of data.sectorInfos) {
      sectorData.set(sectorInfo.sector, sectorInfo);
    }
    targetId = 0;
    targetAsteroidId = 0;
    clearMissionStatus();
  });

  bindAction("chat", async (data: { id: number; message: string }) => {
    chats.push({
      id: data.id,
      message: data.message,
      showUntil: Date.now() + 8000,
      rasterizationData: await rasterizeTextBitmap(data.message, "18px Arial", [1.0, 1.0, 1.0, 1.0]),
    });
  });

  bindAction("serverMessage", (data: { message: string, color: [number, number, number, number] }) => {
    pushMessage(data.message, 240, data.color);
  });

  bindAction("removeCollectable", (data: { id: number; collected: boolean }) => {
    const collectable = state.collectables.get(data.id);
    state.collectables.delete(data.id);
    if (!data.collected) {
      fadeOutCollectable(collectable);
    }
  });

  bindAction("removeMine", (data: { id: number; detonated: boolean }) => {
    const mine = state.mines.get(data.id);
    state.mines.delete(data.id);
    if (!data.detonated) {
      fadeOutMine(mine);
    }
  });

  bindAction("removeAsteroids", (data: { ids: number[] }) => {
    for (const id of data.ids) {
      state.asteroids.delete(id);
    }
  });

  bindManufacturingUpdaters();
  bindInventoryUpdaters();

  bindAction("inventory", (entries: CargoEntry[]) => {
    clearInventory();
    for (const entry of entries) {
      inventory[entry.what] = entry.amount;
    }
    runPostUpdaterOnly("inventory", inventory);
  });

  bindAction("recipe", (recipes: string[]) => {
    for (const recipe of recipes) {
      recipesKnown.add(recipe);
      // Suppress the message for the recipe discovered in the tutorial
      if (recipe === "Refined Prifetium") {
        continue;
      }
      pushMessage(`Discovered blueprint for ${recipe}`);
    }

    // We don't need a separate post updater for this, since it's only used in the manufacturing dialog and inventory already redraws the needed elements
    runPostUpdaterOnly("inventory", inventory);
  });

  bindAction("tutorialStage", (stage: TutorialStage) => {
    setTutorialStage(stage);
  });

  bindAction("missionComplete", (message: string) => {
    setMissionComplete();
    pushMessage(message, 240, [0.0, 1.0, 0.0, 1.0]);
  });

  bindAction("friendRequestChange", () => {
    updateFriendRequests();
  });

  bindAction("friendChange", () => {
    updateFriendList();
  });

  bindAction("setMissionTarget", (targetId) => {
    setMissionTargetId(targetId);
  });
  
  bindPostUpdater("arms", rasterizeWeaponText);

  addLoadingText("Launching...");
  displayLoginDialog();

  loop();
};

const toRun = () => {
  addLoadingText("Initializing dialog subsystem");
  initDialog();
  addLoadingText("Initializing game data");
  initDefs();
  addLoadingText("Initializing drawing subsystem");
  init3dDrawing(() => {
    connect(run);
  });

  setMusicAdaptationPollFunction(() => {
    if (!lastSelf) {
      return null;
    }
    let enemyCount = 0;
    for (const player of state.players.values()) {
      if (player.team !== lastSelf.team && !player.inoperable) {
        enemyCount++;
      }
    }
    return enemyCount > 0;
  });
};

if (document.readyState === "complete") {
  toRun();
} else {
  document.addEventListener("DOMContentLoaded", toRun);
}

// Breaking my own rule of not exporting out of this file... (it's for the tutorial, which hooks into half the client stuff)
export { targetAsteroidId, targetId };
