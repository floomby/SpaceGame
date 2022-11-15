import { armDefMap, Faction } from "./defs";
import { sectorNumberToXY } from "./dialogs/map";
import { pushMessage } from "./drawing";
import { mapSize, TutorialStage } from "./game";
import { currentSector, faction, keybind, lastSelf, selectedSecondary, state } from "./globals";

let promptInterval: number;
let promptTimeout: number;

const tutorialCheckers = new Map<TutorialStage, () => boolean>();

tutorialCheckers.set(TutorialStage.Move, () => {
  return lastSelf && lastSelf.speed > 0;
});

tutorialCheckers.set(TutorialStage.Strafe, () => {
  return lastSelf && lastSelf.side !== 0;
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
  pushMessage("Tutorial complete!", 600, "green");
  const fx = () => {
    if (currentSector > mapSize * mapSize) {
      pushMessage(`You may now open the map and warp to sector ${sectorNumberToXY(faction === Faction.Alliance ? 12 : 6)}`, 600, "green");
    } else {
      clearInterval(promptInterval);
    }
  };
  clearInterval(promptInterval);
  promptInterval = window.setInterval(fx, 1000 * 13);
  fx();
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
  const fx = () => pushMessage(`Use the number keys to switch to change your secondary`, 600, "green");
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

export { tutorialCheckers, tutorialPrompters, completeSwitchWeapon };
