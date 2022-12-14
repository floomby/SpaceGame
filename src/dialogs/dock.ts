// This file is messy and needs cleanup
// I wrote it before I had some of the dialog functionality implemented that makes many of the things it is doing easier

import { armDefs, defs, Faction, SlotKind, UnitDefinition, UnitKind } from "../defs";
import { CargoEntry, Player, ticksPerSecond } from "../game";
import { inventory, lastSelf, ownId, state } from "../globals";
import { sendDepositCargo, sendEquip, sendPurchase, sendSellCargo, sendUndock } from "../net";
import { bindPostUpdater, bindUpdater, horizontalCenter, pop, push, show as showDialog, shown as isDialogShown } from "../dialog";
import { disableTooExpensive } from "./helpers";
import { domFromRest, getRestRaw } from "../rest";
import { manufacturingBay, setupManufacturingBay } from "./manufacturing";
import { maxDecimals } from "../geometry";
import { inventoryDialog, setupInventory } from "./inventory";
import { requestShipPreview } from "../3dDrawing";

let docker = () => {};

const setDocker = (d: () => void) => {
  docker = d;
};

let showDocked = false;

const setShowDocked = (show: boolean) => {
  showDocked = show;
};

const creditsHtml = (credits: number | undefined) => {
  if (credits === undefined) {
    credits = 0;
  }
  return `<span class="credits">Credits: ${credits}</span>`;
};

const cargoHtml = (cargo?: CargoEntry[]) => {
  if (!cargo) {
    return "";
  }
  let html = `<table style="width: 100%; text-align: left;">
<colgroup>
  <col span="1" style="width: 49%;">
  <col span="1" style="width: 17%;">
  <col span="1" style="width: 17%;">
  <col span="1" style="width: 8%;">
  <col span="1" style="width: 9%;">
</colgroup>`;

  let index = 0;
  for (const entry of cargo) {
    html += `<tr>
  <td>${entry.what}</td>
  <td>${entry.amount}</td>
  <td><input type="text" id="sellCargoAmount${index}" value="${entry.amount}" size="6" style="color: black;"/></td>
  <td style="text-align: right;"><div class="tooltip">
    <button id="sellCargo${index}">Sell</button>
    <span class="tooltipText" id="sellCargoTooltip${entry.what}">${domFromRest(
      `/priceOf?what=${entry.what}`,
      (price) => `${price} Credits/Unit`,
      undefined,
      true
    )}</span>
  <div></td>
  <td style="text-align: right;"><button id="depositCargo${index}">Deposit</button></td>
</tr>`;
    index++;
  }
  html += "</table>";
  return html;
};

let lastActionSell = true;

const cargoPostUpdate = (cargo?: CargoEntry[]) => {
  if (cargo) {
    for (let i = 0; i < cargo.length; i++) {
      const button = document.getElementById(`sellCargo${i}`) as HTMLButtonElement;
      if (button) {
        const amount = document.getElementById(`sellCargoAmount${i}`) as HTMLInputElement;
        const seller = () => {
          if (amount) {
            lastActionSell = true;
            const value = parseFloat(amount.value);
            if (!isNaN(value)) {
              sendSellCargo(cargo[i].what, value);
            }
          }
        };
        const depositer = () => {
          lastActionSell = false;
          if (amount) {
            const value = parseFloat(amount.value);
            if (!isNaN(value)) {
              sendDepositCargo(cargo[i].what, value);
            }
          }
        };
        amount.addEventListener("keyup", (e) => {
          const value = parseFloat(amount.value);
          if (amount.value === "" || isNaN(value) || value > cargo[i].amount || value <= 0) {
            amount.style.backgroundColor = "#ffaaaa";
            button.disabled = true;
          } else {
            amount.style.backgroundColor = "#aaffaa";
            button.disabled = false;
          }
          if (e.key === "Enter") {
            if (lastActionSell) {
              seller();
            } else {
              depositer();
            }
          }
        });
        amount.style.backgroundColor = "#aaffaa";
        button.onclick = seller;
        const depositButton = document.getElementById(`depositCargo${i}`) as HTMLButtonElement;
        if (depositButton) {
          depositButton.onclick = depositer;
        }
      } else {
        console.log("button not found", `sellCargo${i}`);
      }
    }
  }
};

const armsHtml = (armIndices: number[]) => {
  let html = '<table style="width: 100%; text-align: left;">';
  // html += "<tr><th>Item</th><th></th><th></th></tr>";
  let index = 0;
  for (const entry of armIndices) {
    const armDef = armDefs[entry];
    html += `<tr>
  <td>${armDef.name}</td>
  <td style="text-align: right;"><button id="arm${index++}">Change</button></td></tr>`;
  }
  html += "</table>";
  return html;
};

const armsPostUpdate = (armIndices: number[]) => {
  for (let i = 0; i < armIndices.length; i++) {
    const button = document.getElementById(`arm${i}`);
    if (button) {
      button.addEventListener("click", () => {
        const slotIndex = i;
        const index = parseInt(button.id.substring(3));
        const self = state.players.get(ownId);
        if (self) {
          const def = defs[self.defIndex];
          if (def.slots.length > index) {
            const kind = def.slots[index];
            showDialog(equipMenu(kind, slotIndex));
            setupEquipMenu(kind, slotIndex);
          } else {
            console.log("no slot for index", index);
          }
        }
      });
    } else {
      console.log("button not found", `arm${i}`);
    }
  }
};

let equipMenu = (kind: SlotKind, slotIndex: number) => {
  let index = 0;
  let html = `<table style="width: 80vw; text-align: left;">
  <colgroup>
    <col span="1" style="width: 16vw;">
    <col span="1" style="width: 16vw;">
    <col span="1" style="width: 16vw;">
    <col span="1" style="width: 16vw;">
    <col span="1" style="width: 16vw;">
  </colgroup>`;
  html += '<tr><th>Armament</th><th></th><th style="text-align: left;">Price</th><th></th></tr>';
  for (const armDef of armDefs) {
    if (armDef.kind === kind) {
      html += `<tr>
  <td>${armDef.name}</td>
  <td><div class="tooltip">?<span class="tooltipText">&nbsp;${armDef.description}&nbsp;</span></div></td>
  <td>${armDef.cost}</td>
  <td style="text-align: right;">
    <button id="equipFromInventory${index}"${inventory.hasOwnProperty(armDef.name) ? "" : "disabled"}>Equip From Inventory</button>
  </td>
  <td style="text-align: right;"><button id="equip${index++}" ${disableTooExpensive(
        state.players.get(ownId),
        armDef.cost
      )}>Purchase</button></td></tr>`;
    }
  }
  html += "</table>";
  return horizontalCenter([html, '<button class="bottomButton" id="back">Back</button>']);
};

const shipViewer = () => {
  return `<div style="display: flex; flex-direction: row;">
  <div style="display: flex; flex-direction: column; margin-right: 5px;">
    <canvas id="shipView" width="800" height="800" style="width: 200px; height: 200px;"></canvas>
    <button id="changeShip" style="top: 0;">Change</button>
  </div>
  <div style="width: 60vw;">
    <div id="shipStats" style="width: 100%">
    </div>
  </div>
</div>`;
};

const shipPreviewer = (definitionIndex: number) => {
  const def = defs[definitionIndex];
  return `<div style="display: flex; flex-direction: row;">
  <canvas id="shipPreview" width="800" height="800" style="width: 200px; height: 200px;"></canvas>
  <div style="width: 60vw;">
    <div id="shipStatsPreview" style="width: 100%">
    </div>
  </div>
</div>`;
};

const shipShop = () => {
  const self = state.players.get(ownId);
  return horizontalCenter([shipPreviewer(self.defIndex), `<div id="shipList"></div>`, `<button class="bottomButton" id="back">Back</button>`]);
};

const populateShipList = (availableShips: { def: UnitDefinition; index: number; atStation: boolean }[], self: Player) => {
  const shipList = document.getElementById("shipList");
  if (shipList) {
    shipList.innerHTML = `<table style="width: 80vw; text-align: left;">
  <colgroup>
    <col span="1" style="width: 18vw;">
    <col span="1" style="width: 18vw;">
    <col span="1" style="width: 18vw;">
    <col span="1" style="width: 18vw;">
  </colgroup>
  <tbody>
    ${availableShips
      .map(
        ({ def, index, atStation }) => `<tr>
    <td>${def.name}</td>
    <td><button id="previewShip${index}">Preview</button></td>
    <td>${def.price}</td>
    <td style="text-align: right;">
      <button id="equipShipFromInventory${index}"${inventory.hasOwnProperty(def.name) ? "" : "disabled"}>Equip From Inventory</button>
    </td>
    <td><button id="purchase${index}" ${self.credits >= def.price && atStation ? "" : "disabled"}>Purchase</button></td></tr>`
      )
      .join("")}
  </tbody>
  </table>`;
  }
};

const shipViewerHelper = (defIndex: number, shipViewId: string, shipStatId: string) => {
  if (!isDialogShown) {
    return;
  }
  const def = defs[defIndex];
  // IDK why sometimes at start this is undefined??
  if (!def) {
    return;
  }
  requestShipPreview(shipViewId, defIndex);

  const stats = document.getElementById(shipStatId);
  if (stats) {
    const normalSlotCount = def.slots.filter((kind) => kind === SlotKind.Normal).length;
    const utilitySlotCount = def.slots.filter((kind) => kind === SlotKind.Utility).length;
    const mineSlotCount = def.slots.filter((kind) => kind === SlotKind.Mine).length;
    const largeSlotCount = def.slots.filter((kind) => kind === SlotKind.Large).length;

    stats.innerHTML = `<table style="width: 100%; text-align: left;">
  <tr><th>Name</th><td>${def.name}</td></tr>
  <tr><th>Speed</th><td>${maxDecimals(def.speed * ticksPerSecond, 2)} Units/sec</td></tr>
  <tr><th>Turn Rate</th><td>${maxDecimals(def.turnRate * ticksPerSecond, 2)} Radians/sec</td></tr>
  <tr><th>Acceleration</th><td>${maxDecimals(def.acceleration * ticksPerSecond, 2)} Units/sec<sup>2</sup></td></tr>
  <tr><th>Health</th><td>${maxDecimals(def.health, 2)}</td></tr>
  ${normalSlotCount > 0 ? `<tr><th>Normal Slots</th><td>${normalSlotCount}</td></tr>` : ""}
  ${utilitySlotCount > 0 ? `<tr><th>Utility Slots</th><td>${utilitySlotCount}</td></tr>` : ""}
  ${mineSlotCount > 0 ? `<tr><th>Mine Slots</th><td>${mineSlotCount}</td></tr>` : ""}
  ${largeSlotCount > 0 ? `<tr><th>Large Slots</th><td>${largeSlotCount}</td></tr>` : ""}
  <tr><th>Energy Regen</th><td>${maxDecimals(def.energyRegen * ticksPerSecond, 2)} Energy/sec</td></tr>
  <tr><th>Health Regen</th><td>${maxDecimals(def.healthRegen * ticksPerSecond, 2)} Health/sec</td></tr>
  <tr><th>Cargo Capacity</th><td>${maxDecimals(def.cargoCapacity, 2)}</td></tr>
  <tr><th>Scanner Range</th><td>${maxDecimals(def.scanRange, 2)} Units</td></tr>
</table>`;
  }
};

const populateShipPreviewer = (definitionIndex: number) => {
  shipViewerHelper(definitionIndex, "shipPreview", "shipStatsPreview");
};

const setupShipShop = (station: Player) => {
  const self = state.players.get(ownId);
  if (!self) {
    return;
  }
  const callback = (availability: { value: string[] }) => {
    const availableShips = defs
      .map((def, index) => {
        return { def, index, atStation: true };
      })
      .filter((ship) => {
        if (ship.def.kind === UnitKind.Ship && availability.value.includes(ship.def.name)) {
          return true;
        }
        if (inventory.hasOwnProperty(ship.def.name) && inventory[ship.def.name] > 0) {
          ship.atStation = false;
          return true;
        }
        return false;
      });

    populateShipList(availableShips.concat(), self);
    console.log("available ships", availableShips);
    for (const { def, index } of availableShips) {
      const button = document.getElementById(`purchase${index}`);
      if (button) {
        button.addEventListener("click", () => {
          sendPurchase(index);
          pop();
        });
      } else {
        console.log("button not found", `purchase${index}`);
      }
      const preview = document.getElementById(`previewShip${index}`);
      if (preview) {
        preview.addEventListener("click", () => {
          populateShipPreviewer(index);
        });
      } else {
        console.log("preview not found", `previewShip${index}`);
      }
      const equip = document.getElementById(`equipShipFromInventory${index}`);
      if (equip) {
        equip.addEventListener("click", () => {
          sendPurchase(index, true);
          pop();
        });
      }
    }
  };
  getRestRaw(`/shipsAvailable?id=${station.id}`, callback, true);
  document.getElementById("back")?.addEventListener("click", () => {
    pop();
  });
};

const dockDialog = (station: Player | undefined, self: Player) => {
  if (!station) {
    return `Docking error - station ${self.docked} not found`;
  }
  return horizontalCenter([
    domFromRest(`/stationName?id=${station.id}`, (name) => `<h2>Docked with ${name}</h2>`, undefined, true),
    `${shipViewer()}`,
    `<div id="credits">${creditsHtml(self.credits)}</div>`,
    `<div style="width: 80vw;">
  <div style="width: 45%; float: left;">
    <h3>Cargo</h3>
    <div id="cargo">${cargoHtml(self.cargo)}</div>
    <div style="display: flex; justify-content: center; flex-direction: row;">
    <button id="openInventory" style="margin-top: 10px; margin-right: 10px;">Inventory</button>
      <button id="openManufacturing" style="margin-top: 10px;">Manufacturing Bay</button>
    </div>
  </div>
  <div style="width: 45%; float: right;">
    <h3>Armaments</h3>
    <div id="arms">${armsHtml(self.arms)}</div>
  </div>
  <div style="clear: both;"></div>
</div>`,
    `<button class="bottomButton" id="undock">Undock</button>`,
  ]);
};

const shipPostUpdate = (defIndex: number) => {
  shipViewerHelper(defIndex, "shipView", "shipStats");
};

const setupDockingUI = (station: Player | undefined, self: Player | undefined) => {
  if (!station || !self) {
    return;
  }
  document.getElementById("undock")?.addEventListener("click", () => {
    sendUndock();
  });
  cargoPostUpdate(self.cargo);
  armsPostUpdate(self.arms);
  shipPostUpdate(self.defIndex);
  document.getElementById("changeShip")?.addEventListener("click", () => {
    push(shipShop(), () => setupShipShop(station));
  });
  document.getElementById("openManufacturing")?.addEventListener("click", () => {
    push(manufacturingBay(), () => setupManufacturingBay(), "manufacturing");
  });
  document.getElementById("openInventory")?.addEventListener("click", () => {
    push(inventoryDialog(), setupInventory);
  });
};

const setupEquipMenu = (kind: SlotKind, slotIndex: number) => {
  let index = 0;
  for (const armDef of armDefs) {
    if (armDef.kind === kind) {
      index++;
      const button = document.getElementById(`equip${index - 1}`);
      if (button) {
        button.addEventListener("click", () => {
          const idx = armDefs.indexOf(armDef);
          sendEquip(slotIndex, idx);
          const self = state.players.get(ownId);
          const station = state.players.get(self?.docked);
          showDialog(dockDialog(station, self));
          setupDockingUI(station, self);
        });
      } else {
        console.log("button not found", `equip${index - 1}`);
      }
      const equipFromInventory = document.getElementById(`equipFromInventory${index - 1}`);
      if (equipFromInventory) {
        equipFromInventory.addEventListener("click", () => {
          const idx = armDefs.indexOf(armDef);
          sendEquip(slotIndex, idx, true);
          const self = state.players.get(ownId);
          const station = state.players.get(self?.docked);
          showDialog(dockDialog(station, self));
          setupDockingUI(station, self);
        });
      }
    }
  }
  document.getElementById("back")?.addEventListener("click", () => {
    const self = state.players.get(ownId);
    const station = state.players.get(self?.docked);
    showDialog(dockDialog(station, self));
    setupDockingUI(station, self);
  });
};

const bindDockingUpdaters = () => {
  bindUpdater("cargo", cargoHtml);
  bindPostUpdater("cargo", cargoPostUpdate);
  bindUpdater("credits", creditsHtml);
  bindUpdater("arms", armsHtml);
  bindPostUpdater("arms", armsPostUpdate);
  bindPostUpdater("inventory", armsPostUpdate);
  bindPostUpdater("ship", shipPostUpdate);
  bindPostUpdater("inventory", shipPostUpdate);
};

export { docker, setDocker, showDocked, setShowDocked, dockDialog, setupDockingUI, bindDockingUpdaters };
