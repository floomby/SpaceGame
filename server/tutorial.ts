import { TutorialStage } from "../src/game";
import { WebSocket } from "ws";
import { clients, sectors } from "./state";
import { Faction } from "../src/defs";

const advanceTutorialStage = (id: number, stage: TutorialStage, ws: WebSocket) => {
  switch (stage) {
    case TutorialStage.Move:
      return TutorialStage.Strafe;
    case TutorialStage.Strafe:
      const client = clients.get(ws);
      if (client) {
        const player = sectors.get(client.currentSector)?.players.get(id);
        if (player) {
          client.sectorsVisited.add(player.team === Faction.Alliance ? 12 : 15);
        }
      }
      return TutorialStage.Done;
    case TutorialStage.Done:
      console.log("Warning: Tutorial already complete");
      return TutorialStage.Done;
    default:
      console.log("Warning: Unknown tutorial stage " + stage);
      return stage;
  }
};

const sendTutorialStage = (ws: WebSocket, stage: TutorialStage) => {
  ws.send(JSON.stringify({ type: "tutorialStage", payload: stage }));
};

export { advanceTutorialStage, sendTutorialStage };
