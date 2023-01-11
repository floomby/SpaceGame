import { addOnHide, addOnPush, addOnShow, bindPostUpdater, bindUpdater, horizontalCenter, peekTag, pop, push, shown } from "../dialog";
import { CargoEntry } from "../game";
import { lastSelf } from "../globals";
import { sendDumpCargo } from "../net";

const dumpCargoHtml = (cargo?: CargoEntry[]) => {
  if (!cargo) {
    return "";
  }
  let html = `<table style="width: min(100vw, 1080px); text-align: center;">
<colgroup>
  <col span="1" style="width: 40%;">
  <col span="1" style="width: 20%;">
  <col span="1" style="width: 20%;">
  <col span="1" style="width: 20%;">
</colgroup>`;
  let index = 0;
  for (const entry of cargo) {
    if (Math.floor(entry.amount) <= 0) {
      continue;
    }
    html += `<tr>
  <td>${entry.what}</td>
  <td>${Math.floor(entry.amount)}</td>
  <td><input type="text" id="dumpCargoAmount${index}" value="${Math.floor(entry.amount)}" size="7" style="color: black;"/></td>
  <td><button id="dumpCargo${index}">Dump</button></td></tr>`;
    index++;
  }
  html += "</table>";
  return html;
};

const dumpCargoPostUpdate = (cargo?: CargoEntry[]) => {
  if (!cargo) {
    return;
  }
  let div = document.getElementById("dumpCargo") as HTMLDivElement;
  if (!div) {
    return;
  }
  div.innerHTML = dumpCargoHtml(cargo);
  for (let i = 0; i < cargo.length; i++) {
    const button = document.getElementById(`dumpCargo${i}`) as HTMLButtonElement;
    if (button) {
      const amount = document.getElementById(`dumpCargoAmount${i}`) as HTMLInputElement;
      const dumper = () => {
        if (amount) {
          const value = parseInt(amount.value);
          if (!isNaN(value)) {
            sendDumpCargo(cargo[i].what, value);
          }
        }
      };
      amount.addEventListener("keyup", (e) => {
        const value = parseInt(amount.value);
        if (amount.value === "" || isNaN(value) || value > Math.floor(cargo[i].amount) || value <= 0) {
          amount.style.backgroundColor = "#ffaaaa";
          button.disabled = true;
        } else {
          amount.style.backgroundColor = "#aaffaa";
          button.disabled = false;
        }
        if (e.key === "Enter") {
          dumper();
        }
      });
      amount.style.backgroundColor = "#aaffaa";
      button.onclick = dumper;
    }
  } 
};

const dumpCargoDialog = `<div class="unselectable">${horizontalCenter([
  "<h2>Cargo</h2>",
  "<br/><div id='dumpCargo'></div>",
  "<button class='bottomButton' id='dumpCargoClose'>Close</button>",
])}</div>`;

const setupDumpCargoDialog = () => {
  dumpCargoPostUpdate(lastSelf?.cargo);
  const dumpCargoClose = document.getElementById("dumpCargoClose");
  if (dumpCargoClose) {
    dumpCargoClose.onclick = () => {
      pop();
    };
  }
  if (peekTag() === "dumpCargo") {
    const cargoIcon = document.getElementById("cargoIcon");
    if (cargoIcon) {
      cargoIcon.style.display = "flex";
    }
  }
};

const bindDumpCargoUpdaters = () => {
  bindUpdater("dumpCargo", dumpCargoHtml);
  bindPostUpdater("dumpCargo", dumpCargoPostUpdate);
  addOnShow(() => {
    const cargoIcon = document.getElementById("cargoIcon");
    if (cargoIcon && peekTag() !== "dumpCargo") {
      cargoIcon.style.display = "none";
    }
  });
  addOnPush(() => {
    const cargoIcon = document.getElementById("cargoIcon");
    if (cargoIcon && peekTag() !== "dumpCargo") {
      cargoIcon.style.display = "none";
    }
  });
  addOnHide(() => {
    const cargoIcon = document.getElementById("cargoIcon");
    if (cargoIcon) {
      cargoIcon.style.display = "flex";
    }
  });
};

const showDumpCargo = () => {
  if (!shown) {
    push(dumpCargoDialog, setupDumpCargoDialog, "dumpCargo");
  } else if (peekTag() === "dumpCargo") {
    pop();
  } else {
    console.log("Warning: dump cargo should be on the top of the stack or we should not be here");
  }
};

let initialized = false;

const initCargo = () => {
  if (initialized) {
    return;
  }

  initialized = true;

  const cargoIcon = document.getElementById("cargoIcon");
  if (cargoIcon) {
    cargoIcon.onclick = showDumpCargo;
  }

  bindDumpCargoUpdaters();
};

export { initCargo, dumpCargoDialog, setupDumpCargoDialog };
