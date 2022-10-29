import { Faction } from "../defs";
import { horizontalCenter, peekTag, setDialogBackground, shown } from "../dialog";
import { faction, teamColorsDark, teamColorsLight } from "../globals";
import { getVolume, setVolume } from "../sound";
import { pop as popDialog, push as pushDialog } from "../dialog";
import { keylayoutSelector, keylayoutSelectorSetup } from "./keyboardLayout";
import { showControls } from "./controls";

const settingsDialog = () =>
  horizontalCenter([
    `<h1>Settings</h1>`,
    `Volume:`,
    `<input type="range" min="0" max="1" value="${getVolume()}" class="slider" id="volumeSlider" step="0.05"><br/>`,
    keylayoutSelector(),
    `<button style="margin-top: 10px;" id="viewControls">View Controls</button>`,
    `<button style="margin-top: 10px;" id="closeSettings">Close</button>`,
  ]);

const setupSettingsDialog = () => {
  document.getElementById("closeSettings")?.addEventListener("click", () => {
    setDialogBackground(teamColorsLight[faction]);
    popDialog();
  });
  document.getElementById("viewControls")?.addEventListener("click", () => {
    showControls();
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
        setDialogBackground(teamColorsDark[faction]);
      } else if (shown) {
        setDialogBackground(teamColorsLight[faction]);
        popDialog();
      }
    });
    settingsIcon.style.display = "flex";
  }
};

export { initSettings, settingsDialog, setupSettingsDialog };
