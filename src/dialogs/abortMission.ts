import { clearStack, horizontalCenter, pop, push } from "../dialog";
import { isInMission } from "../globals";
import { sideBySideDivs } from "./helpers";

const abortHtml = `<div class="unselectable">${horizontalCenter([
  "<h1>Abort Mission?</h1>",
  "<p>Continuing will abort mission.</p>",
  sideBySideDivs([
    "<button class='bottomButton' id='backButton'>Back</button>",
    "<button class='bottomButton' id='continueButton'>Continue</button>",
  ]),
])}</div>`;

const setupAbort = (action: () => void) => {
  const backButton = document.getElementById("backButton");
  if (backButton) {
    backButton.onclick = () => {
      pop();
    };
  }
  const continueButton = document.getElementById("continueButton");
  if (continueButton) {
    continueButton.onclick = () => {
      pop();
      action();
    };
  }
};

const abortWrapper = (action: () => void) => {
  if (!isInMission()) {
    action();
  } else {
    push(abortHtml, () => setupAbort(action), "abortMission");
  }
};

export { abortWrapper };
