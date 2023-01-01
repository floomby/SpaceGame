import { horizontalCenter, pop } from "../dialog";
import { MissionType } from "../game";
import { lastSelf } from "../globals";
import { getRestRaw } from "../rest";

const missionsDialog = () => {
  return `<div class="unselectable">${horizontalCenter([
    "<h1>Missions</h1>",
    "<div id='missionsTable'></div>",
    '<button class="bottomButton" id="closeMissions">Close</button>',
  ])}</div>`;
};

const populateMissionTable = (value: { name: string; type: MissionType; reward: number; description: string }[]) => {
  const missionsTable = document.getElementById("missionsTable");
  if (!missionsTable) {
    return;
  }
  let html = "<table>";
  html += "<tr><th>Name</th><th>Type</th><th>Reward</th><th>Description</th></tr>";
  for (const mission of value) {
    html += `<tr><td>${mission.name}</td><td>${mission.type}</td><td>${mission.reward}</td><td>${mission.description}</td></tr>`;
  }
  html += "</table>";
  missionsTable.innerHTML = html;
};

const setupMissions = () => {
  getRestRaw(`/getMissions?faction=${lastSelf.team}`, populateMissionTable);
  const closeMissions = document.getElementById("closeMissions");
  closeMissions.onclick = () => {
    pop();
  };
};

export { missionsDialog, setupMissions };
