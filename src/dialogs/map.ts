import { horizontalCenter, pop, push } from "../dialog";
import { currentSector, isInMission, sectorData } from "../globals";
import { sendWarp } from "../net";
import { mapSize } from "../game";
import { selectedMissionsDialog, setupSelectedMissionsDialog } from "./selectedMissions";
import { abortWrapper } from "./abortMission";
import { sideBySideDivs } from "./helpers";

const populateSectorInfo = (sector: number) => {
  const sectorInfo = document.getElementById("sectorInfo") as HTMLDivElement;
  if (sectorInfo) {
    const sectorX = sector % mapSize;
    const sectorY = Math.floor(sector / mapSize);
    if (sectorData.has(sector)) {
      const data = sectorData.get(sector);
      if (data) {
        sectorInfo.innerHTML = `<h3>Sector Information</h3>Name: Sector ${sectorX}-${sectorY}<br/>Resources: <ul>${data.resources
          .map((resource) => `<li>${resource}</li>`)
          .join("")}</ul>`;
      }
    } else {
      sectorInfo.innerHTML = `<h3>Sector Information</h3>Name: Sector ${sectorX}-${sectorY}<br/>Unknown<br/>`;
    }
  }
  const warpButton = document.getElementById(`warpButton`) as HTMLButtonElement;
  warpButton.disabled = sector === currentSector;
  if (warpButton) {
    warpButton.addEventListener("click", () => {
      abortWrapper(() => {
        sendWarp(sector);
        pop();
      });
    });
  }
};

const mapHtml =
  '<div class="grid">' +
  new Array(mapSize * mapSize)
    .fill(0)
    .map((_, i) => {
      const x = i % mapSize;
      const y = Math.floor(i / mapSize);
      return `<div class="square unselectable" id="sector-${i}">${x}-${y}</div>`;
    })
    .join("") +
  "</div>";

const sectorNumberToXY = (sector: number) => {
  if (sector > mapSize * mapSize) {
    return isInMission() ? "Mission Sector" : "Tutorial Sector";
  }
  const x = sector % mapSize;
  const y = Math.floor(sector / mapSize);
  return `${x}-${y}`;
};

const setCurrentSectorText = () => {
  const currentSectorText = document.getElementById("currentSectorText");
  if (currentSectorText) {
    // currentSectorText.innerText = `Current Sector: ${sectorNumberToXY(currentSector)}`;
    currentSectorText.innerText = `Current Sector: ${currentSector}`;
  }
};

const mapDialog = () => {
  return `<div class="unselectable">${horizontalCenter([
    `<h1>Map</h1>`,
    `<h3 id="currentSectorText"></h3>`,
    `<input type="text" id="sectorInput" placeholder="Sector Number" />`,
    sideBySideDivs([
      `<button class="bottomButton" id="seeActiveMissions">See Active Missions</button>`,
      `<button id="warpButton" class="bottomButton">Warp</button>`,
    ], true),
    `<button class="bottomButton" id="closeMap">Close</button>`,
  ])}</div>`;
};

const setupMapDialog = () => {
  document.getElementById("closeMap")?.addEventListener("click", () => {
    pop();
  });
  document.getElementById("seeActiveMissions")?.addEventListener("click", () => {
    push(selectedMissionsDialog(), setupSelectedMissionsDialog, "selectedMissions");
  });
  // for (let i = 0; i < mapSize * mapSize; i++) {
  //   document.getElementById(`sector-${i}`)?.addEventListener("click", () => {
  //     populateSectorInfo(i);
  //   });
  // }
  document.getElementById("warpButton")?.addEventListener("click", () => {
    try {
      const toSector = parseInt((document.getElementById("sectorInput") as HTMLInputElement)?.value);
      abortWrapper(() => {
        sendWarp(toSector);
        pop();
      });
    } catch (e) {
      console.log(e);
    }
  });

  setCurrentSectorText();
};

export { mapDialog, setupMapDialog, sectorNumberToXY, setCurrentSectorText };
