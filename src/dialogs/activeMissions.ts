import { horizontalCenter, pop } from "../dialog";

const activeMissionsDialog = () => {
  return `<div class="unselectable">${horizontalCenter([
    `<h1>Active Missions</h1>`,
    `<button class="bottomButton" id="closeActiveMissions">Close</button>`,
  ])}</div>`;
};

const setupActiveMissionsDialog = () => {
  document.getElementById("closeActiveMissions")?.addEventListener("click", () => {
    pop();
  });
};

export { activeMissionsDialog, setupActiveMissionsDialog };
