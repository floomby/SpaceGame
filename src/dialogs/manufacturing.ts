import { bindPostUpdater, horizontalCenter, pop } from "../dialog";
import { Player } from "../game";
import { inventory, ownId, recipesKnown } from "../globals";
import { sendManufacture } from "../net";
import { maxManufacturable, recipes } from "../recipes";

const manufacturingToolTipText = (index: number, amount: number) => {
  const recipe = recipes[index];
  return `<ul>` + Object.keys(recipe.ingredients).map((ingredient) => {
    const required = recipe.ingredients[ingredient] * amount;
    const have = inventory[ingredient] || 0;
    return `<li style="color: ${have >= required ? "green" : "red"};">${ingredient}: ${have} / ${required}</li>`;
  }).join("") + `</ul>`;
};

const manufacturingTableHtml = () => {
  let html = `<table style="width: 100%; text-align: left;">`;
  for (let i = 0; i < recipes.length; i++) {
    if (!recipesKnown.hasOwnProperty(recipes[i].name)) {
      continue;
    }
    html += `<tr><td>${recipes[i].name}</td>
<td>${inventory[recipes[i].name] || 0}</td>
<td><input value="1" id="manufactureAmount${i}"/></td>
<td>/${maxManufacturable(i, inventory)}</td>
<td><div class="tooltip">
  <button id="manufacture${i}">Manufacture</button>
  <span class="bigTooltipText" id="manufacturingTooltip${i}">${manufacturingToolTipText(i, 1)}</span>
<div></td></tr>`;
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
        const value = parseInt(amount.value);
          if (amount.value === "" || isNaN(value) || value <= 0 || value > maxManufacturable(i, inventory)) {
            amount.style.backgroundColor = "#ffaaaa";
            button.disabled = true;
          } else {
            amount.style.backgroundColor = "#aaffaa";
            button.disabled = false;
          }
        amount.addEventListener("keyup", (e) => {
          const value = parseInt(amount.value);
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
          const tooltip = document.getElementById(`manufacturingTooltip${i}`);
          if (tooltip) {
            if (amount.value !== "" && !isNaN(value) && value >= 0) {
              tooltip.innerHTML = manufacturingToolTipText(i, value);
            }
          }
        });
      }
      button.onclick = () => {
        const value = parseInt(amount.value);
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

const setupManufacturingBay = () => {
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
