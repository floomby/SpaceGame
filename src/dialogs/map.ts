import { horizontalCenter, pop } from "../dialog";
import { me } from "../globals";
import { sendWarp } from "../net";
import { domFromRest } from "../rest";

const mapPostRest = () => {
  const sectorList = document.getElementById("sectorList") as HTMLUListElement;
  if (sectorList) {
    for (let i = 0; i < sectorList.children.length; i++) {
      const button = sectorList.children[i].children[0] as HTMLButtonElement;
      button.addEventListener("click", () => {
        const sectorToWarpTo = button.id.split("-")[1];
        console.log(`Warping to ${sectorToWarpTo}`);
        sendWarp(me, parseInt(sectorToWarpTo));
        pop();
      });
    }
  }
};

const mapDialog = () => {
  return horizontalCenter([
    `<h1>Map</h1>`,
    domFromRest("sectorList", (list) => {
      let html = `<ul id="sectorList">`;
      for (const sector of list) {
        html += `<li><button id="sector-${sector}">Warp to ${sector}</button></li>`;
      }
      html += `</ul>`;
      return html;
    }, mapPostRest),
    `<br/><button id="closeMap">Close</button>`,
  ]);
};

const setupMapDialog = () => {
  document.getElementById("closeMap")?.addEventListener("click", () => {
    pop();
  });
};

export { mapDialog, setupMapDialog };
