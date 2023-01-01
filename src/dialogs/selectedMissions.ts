import { clearStack, horizontalCenter, pop } from "../dialog";
import { lastSelf } from "../globals";
import { sendStartMission } from "../net";
import { getRestRaw } from "../rest";
import { abortWrapper } from "./abortMission";
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
  let html = `<table style="width: 80vw; text-align: left;" class="rowHoverNoHeading" cellspacing="0"><colgroup>
  <col span="1" style="width: 15%;">
  <col span="1" style="width: 10%;">
  <col span="1" style="width: 10%;">
  <col span="1" style="width: 55%;">
  <col span="1" style="width: 10%;">
</colgroup>`;
  html += "<tr><th>Name</th><th>Type</th><th>Reward</th><th>Description</th></tr>";
  for (const mission of value) {
    html += `<tr>
  <td>${mission.name}</td>
  <td>${mission.type}</td>
  <td>${mission.reward}</td>
  <td>${mission.description}</td>
  <td style="text-align: right;"><button id="startMission${mission.id}">Start</button></td>
</tr>`;
  }
  html += "</table>";
  selectedMissionsTable.innerHTML = html;
  for (const mission of value) {
    const button = document.getElementById(`startMission${mission.id}`);
    if (button) {
      button.onclick = () => {
        abortWrapper(() => {
          sendStartMission(mission.id)
          clearStack();
        });
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
