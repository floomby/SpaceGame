import { Faction } from "../defs";
import { horizontalCenter, peekTag, setDialogBackground, shown } from "../dialog";
import { faction, getParticlePref, getUseAlternativeBackgroundsPref, setParticlePref, setUseAlternativeBackgrounds, teamColorsDark, teamColorsLight } from "../globals";
import { getMusicVolume, getVolume, setMusicVolume, setVolume } from "../sound";
import { pop as popDialog, push as pushDialog } from "../dialog";
import { keylayoutSelector, keylayoutSelectorSetup } from "./keyboardLayout";
import { showControls } from "./controls";
import { particleCount as particles, reinitializeParticleSystem } from "../particle";

const settingsDialog = () =>
  horizontalCenter([
    `<h1 class="unselectable">Settings</h1>`,
    `<span class="labeledSlider unselectable"><label for="volumeSlider">Effect volume:</label>
<input type="range" min="0" max="1" value="${getVolume()}" class="slider" id="volumeSlider" step="0.05"></span>`,
    `<span class="labeledSlider unselectable"><label for="musicVolumeSlider">Music volume:</label>
<input type="range" min="0" max="1" value="${getMusicVolume()}" class="slider" id="musicVolumeSlider" step="0.05"></span>`,
    `<span>Particle Count: <input id="particleCount" style="margin-bottom: 10px;"></input></span>`,
    `<span>Use alternate background (can be laggy): <input id="useAltBackground" type="checkbox" style="margin-top: 10px; margin-bot: 10px;"></input></span>`,
    keylayoutSelector(),
    `<button style="margin-top: 10px;" id="viewControls">View Controls</button>`,
    `<button style="margin-top: 10px;" class="bottomButton" id="closeSettings" class="secondary">Close</button>`,
  ]);

const setupSettingsDialog = () => {
  document.getElementById("closeSettings")?.addEventListener("click", () => {
    setDialogBackground(teamColorsLight[faction]);
    popDialog();
    reinitializeParticleSystem(getParticlePref() ?? particles);
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
  const particleCount = document.getElementById("particleCount") as HTMLInputElement;
  particleCount.value = localStorage.getItem("particleCount") || particles.toString();
  particleCount.addEventListener("input", () => {
    const count = parseInt(particleCount.value);
    if (count > 0) {
      setParticlePref(count);
    }
  });
  const useAltBackground = document.getElementById("useAltBackground") as HTMLInputElement;
  useAltBackground.checked = getUseAlternativeBackgroundsPref();
  useAltBackground.addEventListener("input", () => {
    setUseAlternativeBackgrounds(useAltBackground.checked);
  });
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
        reinitializeParticleSystem(getParticlePref() ?? particles);
        return;
      }
      if (peekTag() !== "settings") {
        pushDialog(settingsDialog(), setupSettingsDialog, "settings");
        setDialogBackground(teamColorsDark[faction]);
      } else if (shown) {
        setDialogBackground(teamColorsLight[faction]);
        popDialog();
        reinitializeParticleSystem(getParticlePref() ?? particles);
      }
    });
    settingsIcon.style.display = "flex";
  }
};

export { initSettings, settingsDialog, setupSettingsDialog };
