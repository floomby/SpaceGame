import { bindPostUpdater, horizontalCenter, pop } from "../dialog";
import { Player } from "../game";
import { inventory, ownId } from "../globals";
import { sendManufacture } from "../net";
import { maxManufacturable, recipes } from "../recipes";

const manufacturingTableHtml = () => {
  let html = `<table style="width: 100%; text-align: left;">`;
  for (let i = 0; i < recipes.length; i++) {
    html += `<tr><td>${recipes[i].name}</td>
<td>${inventory[recipes[i].name] || 0}</td>
<td><input value="1" id="manufactureAmount${i}"/></td>
<td><button id="manufacture${i}">Manufacture</button></td></tr>`;
  }
  html += "</table>";
  return html;
};

const populateManufacturingTable = () => {
  const manufacturingTable = document.getElementById("manufacturingTable");
  if (manufacturingTable) {
    manufacturingTable.innerHTML = manufacturingTableHtml();
  }
  for (let i = 0; i < recipes.length; i++) {
    const button = document.getElementById(`manufacture${i}`) as HTMLButtonElement;
    if (button) {
      const amount = document.getElementById(`manufactureAmount${i}`) as HTMLInputElement;
      if (amount) {
        const value = parseFloat(amount.value);
          if (amount.value === "" || isNaN(value) || value <= 0 || value > maxManufacturable(i, inventory)) {
            amount.style.backgroundColor = "#ffaaaa";
            button.disabled = true;
          } else {
            amount.style.backgroundColor = "#aaffaa";
            button.disabled = false;
          }
        amount.addEventListener("keyup", (e) => {
          const value = parseFloat(amount.value);
          if (amount.value === "" || isNaN(value) || value <= 0 || value > maxManufacturable(i, inventory)) {
            amount.style.backgroundColor = "#ffaaaa";
            button.disabled = true;
          } else {
            amount.style.backgroundColor = "#aaffaa";
            button.disabled = false;
          }
          if (e.key === "Enter") {
            button.click();
          }
        });
      }
      button.onclick = () => {
        const value = parseFloat(amount.value);
        if (!isNaN(value)) {
          sendManufacture(ownId, recipes[i].name, value);
        }
      };
    }
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
