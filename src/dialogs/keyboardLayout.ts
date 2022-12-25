import { keybind, setKeybind } from "../globals";
import { azertyBindings, dvorakBindings, KeyBindings, qwertyBindings } from "../keybindings";

const keybindingTooltipText = (bindings: KeyBindings) => {
  let keys = { ...bindings };

  for (const [k, v] of Object.entries(keys)) {
    if (v === " ") {
      keys[k] = "Space";
    }
    if (v === "ArrowLeft") {
      keys[k] = "Left";
    }
    if (v === "ArrowRight") {
      keys[k] = "Right";
    }
    if (v === "ArrowUp") {
      keys[k] = "Up";
    }
    if (v === "ArrowDown") {
      keys[k] = "Down";
    }
  }

  return `<table style="width: 100%; text-align: left; white-space: nowrap;">
  <tr><th>Key</th><th>Action</th></tr>
  <tr><td style="padding-right: 3vw;">${keys.dock}</td><td>Dock</td></tr>
  <tr><td style="padding-right: 3vw;">${keys.secondary}</td><td>Fire secondary</td></tr>
  <tr><td style="padding-right: 3vw;">${keys.nextTarget}</td><td>Target next closest ship/station</td></tr>
  <tr><td style="padding-right: 3vw;">${keys.previousTarget}</td><td>Target next furthest ship/station</td></tr>
  <tr><td style="padding-right: 3vw;">Ctrl + ${keys.nextTarget}</td><td>Target next closest enemy</td></tr>
  <tr><td style="padding-right: 3vw;">Ctrl + ${keys.previousTarget}</td><td>Target next furthest enemy</td></tr>
  <tr><td style="padding-right: 3vw;">${keys.nextTargetAsteroid}</td><td>Target next closest asteroid</td></tr>
  <tr><td style="padding-right: 3vw;">${keys.previousTargetAsteroid}</td><td>Target next furthest asteroid</td></tr>
  <tr><td style="padding-right: 3vw;">${keys.selectSecondary0}</td><td>Select secondary 0</td></tr>
  <tr><td style="padding-right: 3vw;">${keys.selectSecondary1}</td><td>Select secondary 1</td></tr>
  <tr><td style="padding-right: 3vw;">${keys.selectSecondary2}</td><td>Select secondary 2</td></tr>
  <tr><td style="padding-right: 3vw;">${keys.selectSecondary3}</td><td>Select secondary 3</td></tr>
  <tr><td style="padding-right: 3vw;">${keys.selectSecondary4}</td><td>Select secondary 4</td></tr>
  <tr><td style="padding-right: 3vw;">${keys.selectSecondary5}</td><td>Select secondary 5</td></tr>
  <tr><td style="padding-right: 3vw;">${keys.selectSecondary6}</td><td>Select secondary 6</td></tr>
  <tr><td style="padding-right: 3vw;">${keys.selectSecondary7}</td><td>Select secondary 7</td></tr>
  <tr><td style="padding-right: 3vw;">${keys.selectSecondary8}</td><td>Select secondary 8</td></tr>
  <tr><td style="padding-right: 3vw;">${keys.selectSecondary9}</td><td>Select secondary 9</td></tr>
  <tr><td style="padding-right: 3vw;">${keys.up}</td><td>Accelerate</td></tr>
  <tr><td style="padding-right: 3vw;">${keys.down}</td><td>Decelerate</td></tr>
  <tr><td style="padding-right: 3vw;">${keys.left}</td><td>Strafe left</td></tr>
  <tr><td style="padding-right: 3vw;">${keys.right}</td><td>Strafe right</td></tr>
  <tr><td style="padding-right: 3vw;">${keys.chat}</td><td>Chat</td></tr>
</table>`;
};

const keylayoutSelector = () => `<fieldset style="margin-top: 10px;">
<legend>Keyboard Layout</legend>
<div style="text-align: left;">
  <input type="radio" id="qwerty" name="keyboard" value="qwerty">
  <label for="qwerty">QWERTY</label>
  <!--<div class="tooltip">?<span class="bigTooltipText">&nbsp;${keybindingTooltipText(qwertyBindings)}&nbsp;</span></div>-->
</div>
<div style="text-align: left;">
  <input type="radio" id="dvorak" name="keyboard" value="dvorak">
  <label for="dvorak">Dvorak</label>
  <!--<div class="tooltip">?<span class="bigTooltipText">&nbsp;${keybindingTooltipText(dvorakBindings)}&nbsp;</span></div>-->
</div>
<div style="text-align: left;">
  <input type="radio" id="azerty" name="keyboard" value="azerty">
  <label for="azerty">Azerty</label>
  <!--<div class="tooltip">?<span class="bigTooltipText">&nbsp;${keybindingTooltipText(azertyBindings)}&nbsp;</span></div>-->
</div>
</fieldset>`;

const keylayoutSelectorSetup = () => {
  const qwerty = document.getElementById("qwerty") as HTMLInputElement;
  const dvorak = document.getElementById("dvorak") as HTMLInputElement;
  const azerty = document.getElementById("azerty") as HTMLInputElement;
  qwerty?.addEventListener("change", () => {
    if (qwerty.checked) {
      setKeybind(qwertyBindings);
    }
  });
  dvorak?.addEventListener("change", () => {
    if (dvorak.checked) {
      setKeybind(dvorakBindings);
    }
  });
  azerty?.addEventListener("change", () => {
    if (azerty.checked) {
      setKeybind(azertyBindings);
    }
  });
  if (keybind === qwertyBindings) {
    qwerty.checked = true;
  } else if (keybind === dvorakBindings) {
    dvorak.checked = true;
  } else if (keybind === azertyBindings) {
    azerty.checked = true;
  }
};

export { keylayoutSelector, keylayoutSelectorSetup };
