import { addOnHide, addOnPush, addOnShow, bindPostUpdater, horizontalCenter, peekTag, pop, push, shown } from "../dialog";
import { ClientFriendRequest } from "../game";
import { ClientFriend, friendList, lastSelf } from "../globals";
import { sendFriendRequest } from "../net";
import { getRestRaw } from "../rest";
import { sideBySideDivs, stackedDivs } from "./helpers";

let initialized = false;

const friendRequestForm = `<div>${
  stackedDivs([
    `<div id="friendList"></div>`,
    `<input type="text" id="friendRequestInput" placeholder="Friend's name" /><button id="friendRequestButton">Send</button>`,
    `<div id="activeFriendRequests"></div>`,
  ])}</div>`;

const populateFriendList = (friends: ClientFriend[]) => {
  const friendList = document.getElementById("friendList");
  if (friendList) {
    friendList.innerHTML = friends.map((friend) => `<div>${friend.name}</div>`).join("");
  }
};

const populateActiveFriendRequests = (requests: ClientFriendRequest[]) => {
  const activeFriendRequests = document.getElementById("activeFriendRequests");
  if (activeFriendRequests) {
    activeFriendRequests.innerHTML = requests
      .map((request) => {
        return `<div>${request.name} - ${request.outgoing ? "Outgoing" : "Incoming"}</div>`;
      })
      .join("");
  }
};

const setupFriendRequestForm = () => {
  const friendRequestButton = document.getElementById("friendRequestButton");
  if (friendRequestButton) {
    friendRequestButton.onclick = () => {
      const friendRequestInput = document.getElementById("friendRequestInput") as HTMLInputElement;
      if (friendRequestInput) {
        const friendName = friendRequestInput.value;
        if (friendName) {
          sendFriendRequest(friendName);
        }
      }
    };
  }
  getRestRaw(`/activeFriendRequests?id=${lastSelf.id}`, populateActiveFriendRequests);
};

const repopulateFriendRequests = () => {
  getRestRaw(`/activeFriendRequests?id=${lastSelf.id}`, populateActiveFriendRequests);
};

const socialDialog = `<div class="unselectable">${horizontalCenter([
  "<h2>Social</h2>",
  sideBySideDivs([friendRequestForm]),
  "<button class='bottomButton' id='socialClose'>Close</button>",
])}</div>`;

const setupSocialDialog = () => {
  const socialClose = document.getElementById("socialClose");
  if (socialClose) {
    socialClose.onclick = () => {
      pop();
    };
  }
  setupFriendRequestForm();
  populateFriendList(friendList);
};

const showSocial = (bypassCheck = false) => {
  if (!shown || bypassCheck) {
    push(socialDialog, setupSocialDialog, "social");
  } else if (peekTag() === "social") {
    pop();
  } else {
    console.log("Warning: social should be on the top of the stack or we should not be here");
  }
};

const initSocial = () => {
  if (initialized) {
    return;
  }

  initialized = true;

  const socialIcon = document.getElementById("socialIcon");
  if (socialIcon) {
    socialIcon.style.display = "flex";
    socialIcon.onclick = () => showSocial();
  }
  addOnShow(() => {
    const socialIcon = document.getElementById("socialIcon");
    if (socialIcon && peekTag() !== "social") {
      socialIcon.style.display = "none";
    }
  });
  addOnPush(() => {
    const socialIcon = document.getElementById("socialIcon");
    if (socialIcon && peekTag() !== "social") {
      socialIcon.style.display = "none";
    }
  });
  addOnHide(() => {
    const socialIcon = document.getElementById("socialIcon");
    if (socialIcon) {
      socialIcon.style.display = "flex";
    }
  });
  bindPostUpdater("friends", populateFriendList);
};

export { initSocial, showSocial, repopulateFriendRequests };
