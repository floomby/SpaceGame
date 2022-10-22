import { horizontalCenter, pop as popDialog } from "../dialog";
import { domFromRest } from "../rest";

const mapDialog = () => {
  return horizontalCenter([`<h1>Map</h1>`, domFromRest("sectorList", (list) => list.toString()), `<br/><button id="closeMap">Close</button>`]);
};

const setupMapDialog = () => {
  document.getElementById("closeMap")?.addEventListener("click", () => {
    popDialog();
  });
};

export { mapDialog, setupMapDialog };
