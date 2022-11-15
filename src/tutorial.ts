import { Faction } from "./defs";
import { sectorNumberToXY } from "./dialogs/map";
import { pushMessage } from "./drawing";
import { TutorialStage } from "./game";
import { faction, keybind, lastSelf, selectedSecondary, state } from "./globals";

let promptInterval: number;

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

let currentWeapon: number;

const tutorialPrompters = new Map<TutorialStage, () => void>();

tutorialPrompters.set(TutorialStage.Move, () => {
  const fx = () => pushMessage(`Press ${keybind.up} to accelerate and ${keybind.down} to decelerate`);
  promptInterval = window.setInterval(fx, 1000 * 15);
  fx();
});

tutorialPrompters.set(TutorialStage.Strafe, () => {
  const fx = () => pushMessage(`Press ${keybind.left} to strafe left and ${keybind.right} to strafe right`);
  clearInterval(promptInterval);
  promptInterval = window.setInterval(fx, 1000 * 15);
  fx();
});

tutorialPrompters.set(TutorialStage.Done, () => {
  pushMessage("Tutorial complete!");
  const fx = () => pushMessage(`You may now open the map and warp to sector ${sectorNumberToXY(faction === Faction.Alliance ? 12 : 15)}`);
  clearInterval(promptInterval);
  promptInterval = window.setInterval(fx, 1000 * 15);
  fx();
});

tutorialPrompters.set(TutorialStage.Shoot, () => {
  const fx = () => pushMessage(`Use left mouse button to fire primary weapon`);
  clearInterval(promptInterval);
  promptInterval = window.setInterval(fx, 1000 * 15);
  fx();
});

tutorialPrompters.set(TutorialStage.Kill, () => {
  const fx = () => pushMessage(`Use your primary weapon to destroy the enemy`);
  clearInterval(promptInterval);
  promptInterval = window.setInterval(fx, 1000 * 20);
  fx();
});

tutorialPrompters.set(TutorialStage.SwitchSecondary, () => {
  const fx = () => {
    pushMessage(`Use the number keys to switch to change your secondary`);
    currentWeapon = selectedSecondary;
  }
  clearInterval(promptInterval);
  promptInterval = window.setInterval(fx, 1000 * 15);
  fx();
});

export { tutorialCheckers, tutorialPrompters };