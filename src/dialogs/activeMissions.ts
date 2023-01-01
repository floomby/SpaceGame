import { clearStack, horizontalCenter, pop } from "../dialog";
import { lastSelf } from "../globals";
import { sendStartMission } from "../net";
import { getRestRaw } from "../rest";
import { ClientMission } from "./missions";

const activeMissionsDialog = () => {
  return `<div class="unselectable">${horizontalCenter([
    `<h1>Active Missions</h1>`,
    `<div id="activeMissionsTable"></div>`,
    `<button class="bottomButton" id="closeActiveMissions">Close</button>`,
  ])}</div>`;
};

const populateActiveMissionTable = (value: ClientMission[]) => {
  const activeMissionsTable = document.getElementById("activeMissionsTable");
  if (!activeMissionsTable) {
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
  activeMissionsTable.innerHTML = html;
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

const setupActiveMissionsDialog = () => {
  document.getElementById("closeActiveMissions")?.addEventListener("click", () => {
    pop();
  });
  getRestRaw(`/activeMissions?id=${lastSelf.id}`, populateActiveMissionTable);
};

export { activeMissionsDialog, setupActiveMissionsDialog };
