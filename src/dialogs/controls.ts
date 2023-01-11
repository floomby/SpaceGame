import { horizontalCenter, push, pop } from "../dialog";
import { keybind } from "../globals";
import { KeyBindings } from "../keybindings";

const controlsText = (bindings: KeyBindings) => {
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

  return `<div style="width: min(80vw, 1080px);">
  <div style="width: 45%; float: left;">
    <table style="width: 100%; text-align: left; white-space: nowrap;" id="controls">
      <tr><th>Key</th><th>Action</th></tr>
      <tr><td>Left Mouse</td><td>Fire primary</td></tr>
      <tr><td>Right Mouse</td><td>Target unit/asteroid under cursor</td></tr>
      <tr><td><kbd>${keys.quickTargetClosestEnemy}</kbd></td><td>Target closest enemy</td></tr>
      <tr><td><kbd>${keys.secondary}</kbd></td><td>Use secondary</td></tr>
      <tr><td><kbd>${keys.dock}</kbd></td><td>Dock/Repair</td></tr>
      <tr><td><kbd>${keys.up}</kbd></td><td>Accelerate</td></tr>
      <tr><td><kbd>${keys.down}</kbd></td><td>Decelerate</td></tr>
      <tr><td><kbd>${keys.left}</kbd></td><td>Strafe left</td></tr>
      <tr><td><kbd>${keys.right}</kbd></td><td>Strafe right</td></tr>
      <tr><td><kbd>${keys.selectSecondary9}</kbd></td><td>Select secondary 9</td></tr>
      <tr><td><kbd>${keys.nextTarget}</kbd></td><td>Target next closest ship/station</td></tr>
      <tr><td><kbd>${keys.previousTarget}</kbd></td><td>Target next furthest ship/station</td></tr>
      <tr><td><kbd>Ctrl</kbd> + <kbd>${keys.nextTarget}</kbd></td><td>Target next closest enemy</td></tr>
      <tr><td><kbd>Ctrl</kbd> + <kbd>${keys.previousTarget}</kbd></td><td>Target next furthest enemy</td></tr>
      <tr><td><kbd>${keys.nextTargetAsteroid}</kbd></td><td>Target next closest asteroid</td></tr>
      <tr><td><kbd>${keys.previousTargetAsteroid}</kbd></td><td>Target next furthest asteroid</td></tr>
    </table>
  </div>
  <div style="width: 45%; float: right;">
    <table style="width: 100%; text-align: left; white-space: nowrap;">
      <tr><th>Key</th><th>Action</th></tr>
      <tr><td><kbd>${keys.chat}</kbd></td><td>Chat</td></tr>
      <tr><td><kbd>${keys.map}</kbd></td><td>Map</td></tr>
      <tr><td><kbd>${keys.cargo}</kbd></td><td>Cargo</td></tr>
      <tr><td><kbd>${keys.selectSecondary0}</kbd></td><td>Select secondary 0</td></tr>
      <tr><td><kbd>${keys.selectSecondary1}</kbd></td><td>Select secondary 1</td></tr>
      <tr><td><kbd>${keys.selectSecondary2}</kbd></td><td>Select secondary 2</td></tr>
      <tr><td><kbd>${keys.selectSecondary3}</kbd></td><td>Select secondary 3</td></tr>
      <tr><td><kbd>${keys.selectSecondary4}</kbd></td><td>Select secondary 4</td></tr>
      <tr><td><kbd>${keys.selectSecondary5}</kbd></td><td>Select secondary 5</td></tr>
      <tr><td><kbd>${keys.selectSecondary6}</kbd></td><td>Select secondary 6</td></tr>
      <tr><td><kbd>${keys.selectSecondary7}</kbd></td><td>Select secondary 7</td></tr>
      <tr><td><kbd>${keys.selectSecondary8}</kbd></td><td>Select secondary 8</td></tr>
    </table>
    <p>Use the ctrl key modifier to use secondaries without switching to them.</p>
  </div>
  <div style="clear: both;"></div>
</div>`;
};

const showControls = () => {
  const help = horizontalCenter([
    "<h2>Controls</h2>",
    controlsText(keybind),
    `<button id="closeControls" class='bottomButton' class="secondary">Close</button>`,
  ]);

  push(
    `<div class="unselectable">${help}</div>`,
    () => {
      document.getElementById("closeControls").addEventListener("click", () => {
        pop();
      });
    },
    "controls"
  );
};

export { showControls };
