import { horizontalCenter, pop } from "../dialog";
import { sendRespawn } from "../net";
import { tips } from "../tips";

const deadDialog = `<div class="unselectable">${horizontalCenter([
  "<h2>You are dead</h2>",
  "<br/>",
  "<div id='tipText'></div>",
  "<br/>",
  "<button id='respawn'>Respawn</button>",
])}</div>`;

let tipIndex = 0;

const redrawTip = () => {
  const tipText = document.getElementById("tipText");
  if (tipText) {
    tipText.innerHTML = tips[tipIndex]();
  }
};

const setupDeadDialog = () => {
  const tipText = document.getElementById("tipText");
  tipIndex = Math.floor(Math.random() * tips.length);
  if (tipText) {
    tipText.innerHTML = tips[tipIndex]();
  }

  document.getElementById("respawn")?.addEventListener("click", () => {
    sendRespawn();
    pop();
  });
};

export { deadDialog, setupDeadDialog, redrawTip };
