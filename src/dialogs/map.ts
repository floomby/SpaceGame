import { horizontalCenter, pop } from "../dialog";
import { currentSector, ownId } from "../globals";
import { sendWarp } from "../net";
import { domFromRest } from "../rest";
import { mapSize } from "../game";

// const mapPostRest = () => {
//   const sectorList = document.getElementById("sectorList") as HTMLUListElement;
//   if (sectorList) {
//     for (let i = 0; i < sectorList.children.length; i++) {
//       const button = sectorList.children[i].children[0] as HTMLButtonElement;
//       button.addEventListener("click", () => {
//         const sectorToWarpTo = button.id.split("-")[1];
//         console.log(`Warping to ${sectorToWarpTo}`);
//         sendWarp(ownId, parseInt(sectorToWarpTo));
//         pop();
//       });
//     }
//   }
// };

const populateSectorInfo = (sector: number) => {
  const sectorInfo = document.getElementById("sectorInfo") as HTMLDivElement;
  if (sectorInfo) {
    const sectorX = sector % mapSize;
    const sectorY = Math.floor(sector / mapSize);
    sectorInfo.innerHTML = `<h3>Sector Information</h3>Name: Sector ${sectorX}-${sectorY}<br/><button id="warp-${sector}">Warp</button>`;
  } else {
    console.error("sectorInfo not found");
  }
  const warpButton = document.getElementById(`warp-${sector}`) as HTMLButtonElement;
  if (warpButton) {
    warpButton.addEventListener("click", () => {
      sendWarp(ownId, sector);
      pop();
    });
  }
};

const mapHtml = '<div class="grid">' + (new Array(mapSize * mapSize)).fill(0).map((_, i) => {
  const x = i % mapSize;
  const y = Math.floor(i / mapSize);
  return `<div class="square" id="sector-${i}">${x}-${y}</div>`;
}).join("") + "</div>";

const mapDialog = () => {
  return horizontalCenter([
    `<h1>Map</h1>`,
    `<h3>Current Sector: ${currentSector}</h3>`,
    `<div style="display: flex; flex-direction: row;">
  <div style="height: 50vh;">${mapHtml}</div>
  <div style="width: 4vw;"></div>
  <div id="sectorInfo" style="width: 30vw; text-align: left;"></div>
</div>`,
    `<br/><button id="closeMap">Close</button>`,
  ]);
};

const setupMapDialog = () => {
  document.getElementById("closeMap")?.addEventListener("click", () => {
    pop();
  });
  for (let i = 0; i < mapSize * mapSize; i++) {
    document.getElementById(`sector-${i}`)?.addEventListener("click", () => {
      console.log(`Clicked on sector ${i}`);
      populateSectorInfo(i);
    });
  }
};

export { mapDialog, setupMapDialog };
