import { clearStack, horizontalCenter, pop } from "../dialog";
import { lastSelf } from "../globals";
import { sendStartMission } from "../net";
import { getRestRaw } from "../rest";
import { ClientMission } from "./missions";

const selectedMissionsDialog = () => {
  return `<div class="unselectable">${horizontalCenter([
    `<h1>Selected Missions</h1>`,
    `<div id="selectedMissionsTable"></div>`,
    `<button class="bottomButton" id="closeSelectedMissions">Close</button>`,
  ])}</div>`;
};

const populateSelectedMissionTable = (value: ClientMission[]) => {
  const selectedMissionsTable = document.getElementById("selectedMissionsTable");
  if (!selectedMissionsTable) {
    return;
  }
  let html = "<table>";
  html += "<tr><th>Name</th><th>Type</th><th>Reward</th><th>Description</th></tr>";
  for (const mission of value) {
    html += `<tr>
  <td>${mission.name}</td>
  <td>${mission.type}</td>
  <td>${mission.reward}</td>
  <td>${mission.description}</td>
  <td><button id="startMission${mission.id}">Start</button></td>
</tr>`;
  }
  html += "</table>";
  selectedMissionsTable.innerHTML = html;
  for (const mission of value) {
    const button = document.getElementById(`startMission${mission.id}`);
    if (button) {
      button.onclick = () => {
        sendStartMission(mission.id);
        clearStack();
      };
    }
  }
};

const setupSelectedMissionsDialog = () => {
  document.getElementById("closeSelectedMissions")?.addEventListener("click", () => {
    pop();
  });
  getRestRaw(`/selectedMissions?id=${lastSelf.id}`, populateSelectedMissionTable);
};

export { selectedMissionsDialog, setupSelectedMissionsDialog };
