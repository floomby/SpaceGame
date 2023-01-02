import { horizontalCenter, pop, push } from "../dialog";
import { sideBySideDivs } from "./helpers";

const confirmationHtml = `<div class="unselectable">${horizontalCenter([
  "<h2>Are you sure?</h2>",
  sideBySideDivs([`<button class="bottomButton" id="confirmNo">No</button>`, `<button class="bottomButton" id="confirmYes">Yes</button>`]),
])}</div>`;

const setupConfirmation = (action: () => void) => {
  const confirmNo = document.getElementById("confirmNo");
  if (confirmNo) {
    confirmNo.onclick = () => {
      pop();
    };
  }
  const confirmYes = document.getElementById("confirmYes");
  if (confirmYes) {
    confirmYes.onclick = () => {
      action();
      pop();
    };
  }
};

const confirmation = (action: () => void) => {
  push(confirmationHtml, () => setupConfirmation(action), "confirmation");
};

export { confirmation };
