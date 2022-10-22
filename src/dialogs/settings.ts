import { Faction } from "../defs";
import { horizontalCenter, peekTag, setDialogBackground } from "../dialog";
import { allianceColor, allianceColorDark, confederationColor, confederationColorDark, faction } from "../globals";
import { getVolume, setVolume } from "../sound";
import { pop as popDialog, push as pushDialog } from "../dialog";
import { keylayoutSelector, keylayoutSelectorSetup } from "./keyboardLayout";

const settingsDialog = () =>
  horizontalCenter([
    `<h1>Settings</h1>`,
    `Volume:`,
    `<input type="range" min="0" max="1" value="${getVolume()}" class="slider" id="volumeSlider" step="0.05"><br/>`,
    keylayoutSelector(),
    `<br/><button id="closeSettings">Close</button>`,
  ]);

const setupSettingsDialog = () => {
  document.getElementById("closeSettings")?.addEventListener("click", () => {
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

let settingsInitialized = false;

const initSettings = () => {
  if (settingsInitialized) {
    return;
  }
  settingsInitialized = true;

  const settingsIcon = document.getElementById("settingsIcon");
  if (settingsIcon) {
    settingsIcon.addEventListener("click", () => {
      if (peekTag() !== "settings") {
        pushDialog(settingsDialog(), setupSettingsDialog, "settings");
        setDialogBackground(faction === Faction.Alliance ? allianceColorDark : confederationColorDark);
      }
    });
    settingsIcon.style.display = "flex";
  }
};

export { initSettings, settingsDialog, setupSettingsDialog };
