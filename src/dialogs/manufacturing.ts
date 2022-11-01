import { horizontalCenter, pop } from "../dialog";
import { Player } from "../game";

const manufacturingBay = () => {
  return horizontalCenter([
    "<h2>Manufacturing Bay</h2>",
    "<br/>",
    `<h3>Coming soon!</h3>`,
    "<br/>",
    '<button id="closeManufacturingBay">Close</button>',
  ]);
};

const setupManufacturingBay = (station: Player) => {
  const closeManufacturingBay = document.getElementById("closeManufacturingBay");
  if (closeManufacturingBay) {
    closeManufacturingBay.onclick = () => {
      pop();
    };
  }
};

export { manufacturingBay, setupManufacturingBay };
