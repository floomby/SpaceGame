import { armDefMap, defs, Faction } from "./defs";
import { sectorNumberToXY } from "./dialogs/map";
import { pushMessage } from "./drawing";
import { availableCargoCapacity, mapSize, TutorialStage } from "./game";
import { currentSector, faction, keybind, lastSelf, selectedSecondary, state } from "./globals";
import { targetAsteroidId, targetId } from "./index";

let promptInterval: number;
let promptTimeout: number;

const tutorialCheckers = new Map<TutorialStage, () => boolean>();

tutorialCheckers.set(TutorialStage.Move, () => {
  return lastSelf && lastSelf.speed > 4;
});

tutorialCheckers.set(TutorialStage.Strafe, () => {
  return lastSelf && Math.abs(lastSelf.side) > 2;
});

tutorialCheckers.set(TutorialStage.Shoot, () => {
  return state.projectiles.size > 0;
});

tutorialCheckers.set(TutorialStage.Kill, () => {
  // Server will check this condition
  return false;
});

let switchWeaponComplete = false;

const completeSwitchWeapon = () => {
  switchWeaponComplete = true;
};

tutorialCheckers.set(TutorialStage.SwitchSecondary, () => {
  return switchWeaponComplete;
});

tutorialCheckers.set(TutorialStage.FireJavelin, () => {
  return lastSelf && lastSelf.slotData[1] && lastSelf.slotData[1].ammo < armDefMap.get("Javelin Missile").def.maxAmmo;
});

tutorialCheckers.set(TutorialStage.SelectAsteroid, () => {
  return state.asteroids.has(targetAsteroidId);
});

tutorialCheckers.set(TutorialStage.CollectResources, () => {
  if (lastSelf) {
    const def = defs[lastSelf.defIndex];
    return def.cargoCapacity - availableCargoCapacity(lastSelf) > 50;
  }
  return false;
});

tutorialCheckers.set(TutorialStage.TargetEnemy, () => {
  return state.players.has(targetId);
});

tutorialCheckers.set(TutorialStage.LaserBeam, () => {
  return false;
});

tutorialCheckers.set(TutorialStage.Map, () => {
  return currentSector < mapSize * mapSize;
});

const tutorialPrompters = new Map<TutorialStage, () => void>();

tutorialPrompters.set(TutorialStage.Move, () => {
  const fx = () => pushMessage(`Press ${keybind.up} to accelerate and ${keybind.down} to decelerate`, 600, "green");
  promptInterval = window.setInterval(fx, 1000 * 13);
  fx();
});

tutorialPrompters.set(TutorialStage.Strafe, () => {
  const fx = () => pushMessage(`Press ${keybind.left} to strafe left and ${keybind.right} to strafe right`, 600, "green");
  clearInterval(promptInterval);
  promptInterval = window.setInterval(fx, 1000 * 13);
  fx();
});

tutorialPrompters.set(TutorialStage.Done, () => {
  clearInterval(promptInterval);
  clearTimeout(promptTimeout);
  pushMessage("Tutorial complete!", 600, "green");
});

tutorialPrompters.set(TutorialStage.Shoot, () => {
  const fx = () => pushMessage(`Use left mouse button to fire primary weapon`, 600, "green");
  clearInterval(promptInterval);
  promptInterval = window.setInterval(fx, 1000 * 13);
  fx();
});

tutorialPrompters.set(TutorialStage.Kill, () => {
  const fx = () => pushMessage(`Use your primary weapon to destroy the enemy`, 600, "green");
  clearInterval(promptInterval);
  promptInterval = window.setInterval(fx, 1000 * 13);
  fx();
});

tutorialPrompters.set(TutorialStage.SwitchSecondary, () => {
  const fx = () => pushMessage(`Use the number keys to change your selected secondary`, 600, "green");
  clearInterval(promptInterval);
  promptInterval = window.setInterval(fx, 1000 * 13);
  fx();
});

tutorialPrompters.set(TutorialStage.FireJavelin, () => {
  const fx = () => {
    pushMessage(`Javelin missiles have been equipped in secondary slot 1`, 600, "green");
    promptTimeout = window.setTimeout(() => {
      pushMessage(`Switch to slot 1 and use the Space Bar to fire the Javelin Missiles`, 600, "green");
    }, 1000);
  };
  clearInterval(promptInterval);
  promptInterval = window.setInterval(fx, 1000 * 13);
  fx();
});

tutorialPrompters.set(TutorialStage.SelectAsteroid, () => {
  const fx = () => {
    pushMessage(`A mining laser has been equipped in slot 0`, 600, "green");
    promptTimeout = window.setTimeout(() => {
      pushMessage(`Select an asteroid with the right mouse button`, 600, "green");
    }, 2000);
  };
  clearTimeout(promptTimeout);
  clearInterval(promptInterval);
  promptInterval = window.setInterval(fx, 1000 * 13);
  fx();
});

tutorialPrompters.set(TutorialStage.CollectResources, () => {
  const fx = () => pushMessage(`Now activate your mining laser with Space to gather resources`, 600, "green");
  clearTimeout(promptTimeout);
  clearInterval(promptInterval);
  promptInterval = window.setInterval(fx, 1000 * 13);
  fx();
});

tutorialPrompters.set(TutorialStage.TargetEnemy, () => {
  const fx = () => {
    pushMessage(`Some enemies are fast`, 600, "green");
    promptTimeout = window.setTimeout(() => {
      pushMessage(`Use ${keybind.quickTargetClosestEnemy} to target the nearest enemy`, 600, "green");
    }, 2000);
  };
  clearTimeout(promptTimeout);
  clearInterval(promptInterval);
  promptInterval = window.setInterval(fx, 1000 * 13);
  fx();
});

tutorialPrompters.set(TutorialStage.LaserBeam, () => {
  const fx = () => {
    pushMessage(`Targeted weapons can be powerful against evasive enemies`, 600, "green");
    promptTimeout = window.setTimeout(() => {
      pushMessage(`A Laser Beam has been equipped in slot 2`, 600, "green");
    }, 2000);
  };
  clearTimeout(promptTimeout);
  clearInterval(promptInterval);
  promptInterval = window.setInterval(fx, 1000 * 13);
  fx();
});

tutorialPrompters.set(TutorialStage.Map, () => {
  const fx = () => pushMessage(`Press ${keybind.map} to open the map and warp to sector ${sectorNumberToXY(faction === Faction.Alliance ? 12 : 15)}`, 600, "green");
  clearTimeout(promptTimeout);
  clearInterval(promptInterval);
  promptInterval = window.setInterval(fx, 1000 * 13);
  fx();
});

export { tutorialCheckers, tutorialPrompters, completeSwitchWeapon };
