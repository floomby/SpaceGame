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

  return `<div style="width: 80vw;">
  <div style="width: 45%; float: left;">
    <table style="width: 100%; text-align: left; white-space: nowrap;">
      <tr><th>Key</th><th>Action</th></tr>
      <tr><td style="padding-right: 3vw;">Left Mouse</td><td>Fire primary</td></tr>
      <tr><td style="padding-right: 3vw;">Right Mouse</td><td>Target unit/asteroid under cursor</td></tr>
      <tr><td style="padding-right: 3vw;">${keys.quickTargetClosestEnemy}</td><td>Target closest enemy</td></tr>
      <tr><td style="padding-right: 3vw;">${keys.secondary}</td><td>Fire secondary</td></tr>
      <tr><td style="padding-right: 3vw;">${keys.dock}</td><td>Dock/Repair</td></tr>
      <tr><td style="padding-right: 3vw;">${keys.up}</td><td>Accelerate</td></tr>
      <tr><td style="padding-right: 3vw;">${keys.down}</td><td>Decelerate</td></tr>
      <tr><td style="padding-right: 3vw;">${keys.left}</td><td>Strafe left</td></tr>
      <tr><td style="padding-right: 3vw;">${keys.right}</td><td>Strafe right</td></tr>
      <tr><td style="padding-right: 3vw;">${keys.selectSecondary9}</td><td>Select secondary 9</td></tr>
      <tr><td style="padding-right: 3vw;">${keys.nextTarget}</td><td>Target next closest ship/station</td></tr>
      <tr><td style="padding-right: 3vw;">${keys.previousTarget}</td><td>Target next furthest ship/station</td></tr>
      <tr><td style="padding-right: 3vw;">Ctrl + ${keys.nextTarget}</td><td>Target next closest enemy</td></tr>
      <tr><td style="padding-right: 3vw;">Ctrl + ${keys.previousTarget}</td><td>Target next furthest enemy</td></tr>
      <tr><td style="padding-right: 3vw;">${keys.nextTargetAsteroid}</td><td>Target next closest asteroid</td></tr>
      <tr><td style="padding-right: 3vw;">${keys.previousTargetAsteroid}</td><td>Target next furthest asteroid</td></tr>
    </table>
  </div>
  <div style="width: 45%; float: right;">
    <table style="width: 100%; text-align: left; white-space: nowrap;">
      <tr><th>Key</th><th>Action</th></tr>
      <tr><td style="padding-right: 3vw;">${keys.chat}</td><td>Chat</td></tr>
      <tr><td style="padding-right: 3vw;">${keys.map}</td><td>Map</td></tr>
      <tr><td style="padding-right: 3vw;">${keys.cargo}</td><td>Cargo</td></tr>
      <tr><td style="padding-right: 3vw;">${keys.selectSecondary0}</td><td>Select secondary 0</td></tr>
      <tr><td style="padding-right: 3vw;">${keys.selectSecondary1}</td><td>Select secondary 1</td></tr>
      <tr><td style="padding-right: 3vw;">${keys.selectSecondary2}</td><td>Select secondary 2</td></tr>
      <tr><td style="padding-right: 3vw;">${keys.selectSecondary3}</td><td>Select secondary 3</td></tr>
      <tr><td style="padding-right: 3vw;">${keys.selectSecondary4}</td><td>Select secondary 4</td></tr>
      <tr><td style="padding-right: 3vw;">${keys.selectSecondary5}</td><td>Select secondary 5</td></tr>
      <tr><td style="padding-right: 3vw;">${keys.selectSecondary6}</td><td>Select secondary 6</td></tr>
      <tr><td style="padding-right: 3vw;">${keys.selectSecondary7}</td><td>Select secondary 7</td></tr>
      <tr><td style="padding-right: 3vw;">${keys.selectSecondary8}</td><td>Select secondary 8</td></tr>
    </table>
    <p>Use the alt key modifier to fire secondaries without switching to them.</p> 
  </div>
</div>`;
};

const showControls = () => {
  const help = horizontalCenter(["<h2>Controls</h2>", controlsText(keybind), "<br/><button id='closeControls'>Close</button>"]);

  push(
    help,
    () => {
      document.getElementById("closeControls").addEventListener("click", () => {
        pop();
      });
    },
    "controls"
  );
};

export { showControls };
