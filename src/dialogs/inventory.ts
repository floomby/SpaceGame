import { bindPostUpdater, bindUpdater, horizontalCenter, pop } from "../dialog";
import { availableCargoCapacity } from "../game";
import { inventory, lastSelf } from "../globals";
import { sendSellInventory, sendTransferToShip } from "../net";
import { domFromRest } from "../rest";

const inventoryTableHtml = () => {
  let html = `<table style="width: 100%; text-align: left;">`;

  for (const [what, amount] of Object.entries(inventory)) {
    html += `<tr>
  <td>${what}</td>
  <td>${amount}</td>
  <td><input type="text" id="sellInventoryAmount${what}" value="${amount}" size="6" style="color: black;"/></td>
  <td style="text-align: right;"><div class="tooltip">
    <button id="sellInventory${what}">Sell</button>
    <span class="tooltipText" id="sellInventoryTooltip${what}">${domFromRest(
      `/priceOf?what=${what}`,
      (price) => `${price} Credits/Unit`,
      undefined,
      true
    )}</span>
  <div></td>
  <td style="text-align: right;"><button id="transferToShip${what}">Transfer to Ship</button></td>
</tr>`;
  }
  html += "</table>";
  return html;
};

let lastActionSell = true;

const populateInventoryTable = () => {
  const inventoryTable = document.getElementById("inventoryTable");
  if (inventoryTable) {
    inventoryTable.innerHTML = inventoryTableHtml();
  }
  for (const key of Object.keys(inventory)) {
    const button = document.getElementById(`sellInventory${key}`) as HTMLButtonElement;
    const transferButton = document.getElementById(`transferToShip${key}`) as HTMLButtonElement;
    if (button && transferButton) {
      const amount = document.getElementById(`sellInventoryAmount${key}`) as HTMLInputElement;
      const seller = () => {
        lastActionSell = true;
        if (amount) {
          const value = parseInt(amount.value);
          if (!isNaN(value)) {
            sendSellInventory(key, value);
          }
        }
      };
      const transferer = () => {
        lastActionSell = false;
        if (amount) {
          const value = parseInt(amount.value);
          if (!isNaN(value)) {
            sendTransferToShip(key, value);
          }
        }
      };
      amount.addEventListener("keyup", (e) => {
        const value = parseInt(amount.value);
        if (amount.value === "" || isNaN(value) || value > inventory[key] || value <= 0) {
          amount.style.backgroundColor = "#ffaaaa";
          button.disabled = true;
          transferButton.disabled = true;
        } else {
          amount.style.backgroundColor = "#aaffaa";
          button.disabled = false;
          transferButton.disabled = false;
        }
        if (availableCargoCapacity(lastSelf) === 0) {
          transferButton.disabled = true;
        }
        if (e.key === "Enter") {
          if (lastActionSell) {
            seller();
          } else {
            transferer();
          }
        }
      });
      amount.style.backgroundColor = "#aaffaa";
      button.onclick = seller;
      transferButton.onclick = transferer;
      if (availableCargoCapacity(lastSelf) === 0) {
        transferButton.disabled = true;
      }
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
    '<button class="bottomButton" id="closeInventory">Close</button>',
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
  bindUpdater("inventoryCredits", (x) => x);
  bindPostUpdater("inventory", populateInventoryTable);
};

export { inventoryDialog, setupInventory, bindInventoryUpdaters };
