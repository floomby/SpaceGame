import { bindPostUpdater, horizontalCenter, pop } from "../dialog";
import { Player } from "../game";
import { inventory } from "../globals";

const manufacturingTableHtml = () => {
  let html = `<table style="width: 100%; text-align: left;">`;
  for (const [what, amount] of Object.entries(inventory)) {
    html += `<tr><td>${what}</td><td>${amount}</td></tr>`;
  }
  html += "</table>";
  // return html;
  return "<h3>Coming Soon!</h3>";
};

const populateManufacturingTable = () => {
  const manufacturingTable = document.getElementById("manufacturingTable");
  if (manufacturingTable) {
    manufacturingTable.innerHTML = manufacturingTableHtml();
  }
};

const manufacturingBay = () => {
  return horizontalCenter([
    "<h2>Manufacturing Bay</h2>",
    "<br/>",
    "<div id='manufacturingTable'></div>",
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
  populateManufacturingTable();
};

const bindManufacturingUpdaters = () => {
  bindPostUpdater("inventory", populateManufacturingTable);
};

export { manufacturingBay, setupManufacturingBay, bindManufacturingUpdaters };
