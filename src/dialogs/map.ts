import { horizontalCenter, pop, push } from "../dialog";
import { currentSector, isInMission, sectorData } from "../globals";
import { sendWarp } from "../net";
import { selectedMissionsDialog, setupSelectedMissionsDialog } from "./selectedMissions";
import { abortWrapper } from "./abortMission";
import { sideBySideDivs } from "./helpers";
import { mapHeight, mapWidth } from "../mapLayout";

const populateSectorInfo = (sector: number) => {
  const sectorInfo = document.getElementById("sectorInfo") as HTMLDivElement;
  if (sectorInfo) {
    const sectorX = sector % mapWidth;
    const sectorY = Math.floor(sector / mapWidth);
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
  new Array(mapWidth * mapHeight)
    .fill(0)
    .map((_, i) => {
      const x = i % mapWidth;
      const y = Math.floor(i / mapWidth);
      return `<div class="square unselectable" id="sector-${i}">${x}-${y}</div>`;
    })
    .join("") +
  "</div>";

const sectorNumberToXY = (sector: number) => {
  if (sector > mapWidth * mapHeight) {
    return isInMission() ? "Mission Sector" : "Tutorial Sector";
  }
  const x = sector % mapWidth;
  const y = Math.floor(sector / mapWidth);
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
    `<div style="display: flex; flex-direction: row;">
  <div style="height: 40vh;">${mapHtml}</div>
  <div style="width: 2vw;"></div>
  <div id="sectorInfo" style="width: 30vw; text-align: left;"></div>
</div>`,
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
  for (let i = 0; i < mapWidth * mapHeight; i++) {
    document.getElementById(`sector-${i}`)?.addEventListener("click", () => {
      populateSectorInfo(i);
    });
  }
  // document.getElementById("warpButton")?.addEventListener("click", () => {
  //   try {
  //     const toSector = parseInt((document.getElementById("sectorInput") as HTMLInputElement)?.value);
  //     abortWrapper(() => {
  //       sendWarp(toSector);
  //       pop();
  //     });
  //   } catch (e) {
  //     console.log(e);
  //   }
  // });

  setCurrentSectorText();
};

export { mapDialog, setupMapDialog, sectorNumberToXY, setCurrentSectorText };
