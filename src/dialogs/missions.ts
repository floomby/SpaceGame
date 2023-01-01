import { horizontalCenter, pop } from "../dialog";
import { MissionType } from "../game";
import { lastSelf } from "../globals";
import { sendSelectMission } from "../net";
import { getRestRaw } from "../rest";

type ClientMission = { name: string; type: MissionType; reward: number; description: string; id: number };

const missionsDialog = () => {
  return `<div class="unselectable">${horizontalCenter([
    "<h1>Missions</h1>",
    "<div id='missionsTable'></div>",
    '<button class="bottomButton" id="closeMissions">Close</button>',
  ])}</div>`;
};

const populateMissionTable = (value: ClientMission[]) => {
  const missionsTable = document.getElementById("missionsTable");
  if (!missionsTable) {
    return;
  }
  let html = "<table>";
  html += "<tr><th>Name</th><th>Type</th><th>Reward</th><th>Description</th><th></th></tr>";
  for (const mission of value) {
    html += `<tr>
  <td>${mission.name}</td>
  <td>${mission.type}</td>
  <td>${mission.reward}</td>
  <td>${mission.description}</td>
  <td><button id="selectMission${mission.id}">Select</button></td>
</tr>`;
  }
  html += "</table>";
  missionsTable.innerHTML = html;
  for (const mission of value) {
    const button = document.getElementById(`selectMission${mission.id}`);
    if (button) {
      button.onclick = () => {
        sendSelectMission(mission.id);
        pop();
      };
    }
  }
};

const setupMissions = () => {
  getRestRaw(`/getMissions?id=${lastSelf.id}`, populateMissionTable);
  const closeMissions = document.getElementById("closeMissions");
  closeMissions.onclick = () => {
    pop();
  };
};

export { ClientMission, missionsDialog, setupMissions };
