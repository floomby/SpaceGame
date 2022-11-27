import { Faction } from "../defs";
import { horizontalCenter, peekTag, setDialogBackground, shown } from "../dialog";
import { faction, teamColorsDark, teamColorsLight } from "../globals";
import { getMusicVolume, getVolume, setMusicVolume, setVolume } from "../sound";
import { pop as popDialog, push as pushDialog } from "../dialog";
import { keylayoutSelector, keylayoutSelectorSetup } from "./keyboardLayout";
import { showControls } from "./controls";

const settingsDialog = () =>
  horizontalCenter([
    `<h1>Settings</h1>`,
    `<span class="labeledSlider"><label for="volumeSlider">Effect volume:</label>
<input type="range" min="0" max="1" value="${getVolume()}" class="slider" id="volumeSlider" step="0.05"></span>`,
    `<span class="labeledSlider"><label for="musicVolumeSlider">Music volume:</label>
<input type="range" min="0" max="1" value="${getMusicVolume()}" class="slider" id="musicVolumeSlider" step="0.05"></span>`,
    keylayoutSelector(),
    `<button style="margin-top: 10px;" id="viewControls">View Controls</button>`,
    `<button style="margin-top: 10px;" class="bottomButton" id="closeSettings" class="secondary">Close</button>`,
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
  const musicVolumeSlider = document.getElementById("musicVolumeSlider") as HTMLInputElement;
  musicVolumeSlider?.addEventListener("input", () => {
    setMusicVolume(parseFloat(musicVolumeSlider.value));
  });
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
      if (peekTag() === "controls") {
        setDialogBackground(teamColorsLight[faction]);
        popDialog();
        return;
      }
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
