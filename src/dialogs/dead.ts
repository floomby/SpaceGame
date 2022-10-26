import { horizontalCenter, pop } from "../dialog";
import { ownId } from "../globals";
import { sendRespawn } from "../net";

const deadDialog = horizontalCenter(["<h2>You are dead</h2>", "<button id='respawn'>Respawn</button>"]);

const setupDeadDialog = () => {
  document.getElementById("respawn")?.addEventListener("click", () => {
    if (ownId !== 0) {
      sendRespawn(ownId);
      pop();
    } else {
      console.error("No respawn key");
    }
  });
};

export { deadDialog, setupDeadDialog };
