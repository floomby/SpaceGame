import { bindPostUpdater, bindUpdater, horizontalCenter, pop } from "../dialog";
import { inventory, lastSelf, ownId } from "../globals";
import { sendSellInventory } from "../net";

const inventoryTableHtml = () => {
  let html = `<table style="width: 100%; text-align: left;">
<colgroup>
  <col span="1" style="width: 49%;">
  <col span="1" style="width: 17%;">
  <col span="1" style="width: 17%;">
  <col span="1" style="width: 8%;">
  <col span="1" style="width: 9%;">
</colgroup>`;

  for (const [what, amount] of Object.entries(inventory)) {
    html += `<tr>
  <td>${what}</td>
  <td>${amount}</td>
  <td><input type="text" id="sellInventoryAmount${what}" value="${amount}" size="6" /></td>
  <td style="text-align: right;"><button id="sellInventory${what}">Sell</button></td>
</tr>`;
  }
  html += "</table>";
  return html;
};

const populateInventoryTable = () => {
  const inventoryTable = document.getElementById("inventoryTable");
  if (inventoryTable) {
    inventoryTable.innerHTML = inventoryTableHtml();
  }
  for (const key of Object.keys(inventory)) {
    const button = document.getElementById(`sellInventory${key}`) as HTMLButtonElement;
    if (button) {
      const amount = document.getElementById(`sellInventoryAmount${key}`) as HTMLInputElement;
      const seller = () => {
        if (amount) {
          const value = parseFloat(amount.value);
          if (!isNaN(value)) {
            sendSellInventory(ownId, key, value);
          }
        }
      };
      amount.addEventListener("keyup", (e) => {
        const value = parseFloat(amount.value);
        if (amount.value === "" || isNaN(value) || value > inventory[key] || value <= 0) {
          amount.style.backgroundColor = "#ffaaaa";
          button.disabled = true;
        } else {
          amount.style.backgroundColor = "#aaffaa";
          button.disabled = false;
        }
        if (e.key === "Enter") {
          seller();
        }
      });
      amount.style.backgroundColor = "#aaffaa";
      button.onclick = seller;
    }
  }
};

const inventoryDialog = () => {
  return horizontalCenter([
    "<h2>Inventory</h2>",
    "<br/>",
    `Credits: <span id='inventoryCredits'>${lastSelf.credits}</span>`,
    "<br/>",
    "<div id='inventoryTable'></div>",
    "<br/>",
    '<button id="closeInventory">Close</button>',
  ]);
};

const setupInventory = () => {
  const closeInventory = document.getElementById("closeInventory");
  if (closeInventory) {
    closeInventory.onclick = () => {
      pop();
    };
  }
  populateInventoryTable();
};

const bindInventoryUpdaters = () => {
  bindUpdater("inventoryCredits", x => x);
  bindPostUpdater("inventory", populateInventoryTable);
};

export { inventoryDialog, setupInventory, bindInventoryUpdaters };
