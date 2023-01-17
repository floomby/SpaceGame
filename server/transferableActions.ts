import { equip, GlobalState, TutorialStage } from "../src/game";
import { clients, idToWebsocket, sectors } from "./state";
import { sendTutorialStage } from "./tutorial";

const transferableActionsMap = new Map<string, number>();

const transferableActions: ((state: GlobalState, sector: number, data: any) => boolean)[] = [];

transferableActions.push((state: GlobalState, sector: number, data: { id: number }) => {
  let hasNPCs = false;
  for (const player of state.players.values()) {
    if (player.npc) {
      hasNPCs = true;
      break;
    }
  }
  if (!hasNPCs) {
    const ws = idToWebsocket.get(data.id);
    if (ws) {
      const client = clients.get(ws);
      if (client) {
        client.inTutorial = TutorialStage.SwitchSecondary;
        sendTutorialStage(ws, TutorialStage.SwitchSecondary);
        const state = sectors.get(client.currentSector);
        if (state) {
          const player = state.players.get(client.id);
          if (player) {
            state.players.set(client.id, equip(player, 1, "Javelin Missile", true));
            return true;
          }
        }
      }
    }
  }
  return false;
});
transferableActionsMap.set("tutorialVenture", transferableActions.length - 1);

export { transferableActions, transferableActionsMap };
