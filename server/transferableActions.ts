import { equip, GlobalState, TutorialStage } from "../src/game";
import { clients, idToWebsocket, sectors } from "./state";
import { sendTutorialStage, spawnTutorialStation } from "./tutorial";

const transferableActionsMap = new Map<string, number>();

const transferableActions: ((state: GlobalState, sector: number, data: any) => boolean)[] = [];

// There is technically a bug with this, if the npc hits the boundary of the sector it will not be in the sector for one server tick
// If the check is run in that tick, the tutorial will advance when it shouldn't
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

// This has the same bug as above
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
        client.inTutorial = TutorialStage.Dock;
        sendTutorialStage(ws, TutorialStage.Dock);
        spawnTutorialStation(ws);
        return true;
      }
    }
  }
  return false;
});
transferableActionsMap.set("tutorialStrafer", transferableActions.length - 1);

export { transferableActions, transferableActionsMap };
