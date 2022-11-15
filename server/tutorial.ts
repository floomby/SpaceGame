import { TutorialStage } from "../src/game";
import { WebSocket } from "ws";
import { clients, sectors, uid } from "./state";
import { Faction } from "../src/defs";
import { addTutorialRoamingVenture, NPC } from "../src/npc";

const advanceTutorialStage = (id: number, stage: TutorialStage, ws: WebSocket) => {
  const client = clients.get(ws);
  switch (stage) {
    case TutorialStage.Move:
      return TutorialStage.Strafe;
    case TutorialStage.Strafe:
      return TutorialStage.Shoot;
    case TutorialStage.Shoot:
      {
        const client = clients.get(ws);
        if (client) {
          const state = sectors.get(client.currentSector);
          if (state) {
            const npc = addTutorialRoamingVenture(state, uid());
            (npc as NPC).killed = () => {
              sendTutorialStage(ws, TutorialStage.SwitchSecondary);
            };
          }
        }
      }
      return TutorialStage.Kill;
    case TutorialStage.SwitchSecondary:
      {
        if (client) {
          const player = sectors.get(client.currentSector)?.players.get(id);
          if (player) {
            client.sectorsVisited.add(player.team === Faction.Alliance ? 12 : 15);
          }
        }
      }
      return TutorialStage.Done;
    case TutorialStage.Done:
      console.log("Warning: Tutorial already complete");
      return TutorialStage.Done;
    default:
      console.log("Warning: Unexpected tutorial stage " + stage);
      return stage;
  }
};

const sendTutorialStage = (ws: WebSocket, stage: TutorialStage) => {
  ws.send(JSON.stringify({ type: "tutorialStage", payload: stage }));
};

export { advanceTutorialStage, sendTutorialStage };
