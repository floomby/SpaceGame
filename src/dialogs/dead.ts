import { horizontalCenter, pop } from "../dialog";
import { respawnKey } from "../globals";
import { sendRespawn } from "../net";

const deadDialog = horizontalCenter(["<h2>You are dead</h2>", "<button id='respawn'>Respawn</button>"]);

const setupDeadDialog = () => {
  document.getElementById("respawn")?.addEventListener("click", () => {
    if (respawnKey !== 0) {
      sendRespawn(respawnKey);
      pop();
    } else {
      console.error("No respawn key");
    }
  });
};

export { deadDialog, setupDeadDialog };
