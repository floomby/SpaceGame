import { clearStack, horizontalCenter, peekTag, pop, push } from "../dialog";
import { currentSector, isInMission, missionComplete, ownId } from "../globals";
import { getRestRaw } from "../rest";
import { sideBySideDivs } from "./helpers";

const abortHtml = `<div class="unselectable">${horizontalCenter([
  "<h1>Abort Mission?</h1>",
  "<p>Continuing will potentially abort the mission.</p>",
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
      clearStack();
      action();
    };
  }
};

const abortWrapper = (action: () => void) => {
  if (!isInMission() || missionComplete) {
    action();
  } else {
    const context = peekTag();
    getRestRaw(`/missionAssigneesFromSector?sector=${currentSector}`, (assignees: number[]) => {
      if (context === peekTag()) {
        if (assignees.includes(ownId)) {
          push(abortHtml, () => setupAbort(action), "abortMission");
        } else {
          action();
        }
      }
    });
  }
};

export { abortWrapper };
