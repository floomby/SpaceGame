import { horizontalCenter, pop } from "../dialog";
import { sendRespawn } from "../net";

const deadDialog = horizontalCenter(["<h2>You are dead</h2>", "<button id='respawn'>Respawn</button>"]);

const setupDeadDialog = () => {
  document.getElementById("respawn")?.addEventListener("click", () => {
    sendRespawn();
    pop();
  });
};

export { deadDialog, setupDeadDialog };
