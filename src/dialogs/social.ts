import { addOnHide, addOnPush, addOnShow, bindPostUpdater, horizontalCenter, peekTag, pop, push, shown } from "../dialog";
import { ClientFriendRequest, SectorKind, SectorOfPlayerResult } from "../game";
import { ClientFriend, friendList, friendRequests, lastSelf, ownId } from "../globals";
import { sendFriendRequest, sendFriendWarp, sendRevokeFriendRequest, sendUnfriend } from "../net";
import { domFromRest, getRestRaw } from "../rest";
import { abortWrapper } from "./abortMission";
import { confirmation } from "./confirm";
import { Debouncer, sideBySideDivs, stackedDivs } from "./helpers";
import { sectorNumberToXY } from "./map";

let initialized = false;

const friendRequestForm = `<div>${stackedDivs([
  `<div id="friendList"></div>`,
  `<br/><div style="width: 100%; text-align: left;" id="friendRequester">
    </div>`,
  `<br/><div id="activeFriendRequests" style="width: 100%"></div>`,
])}</div>`;

const sectorLocationTemplate = (value: SectorOfPlayerResult) => {
  if (!value) {
    return "Offline";
  }
  if (value === "respawning") {
    return "Respawning";
  }
  if (value.sectorKind === SectorKind.Tutorial) {
    return "In Tutorial";
  }
  if (value.sectorKind === SectorKind.Mission) {
    return "In Mission";
  }
  // return sectorNumberToXY(value.sectorNumber);
  return value.sectorNumber.toString();
};

const warpIfNotDocked = (id: number) => {
  if (lastSelf?.docked) {
    return "";
  }
  return `<td style="text-align: right;"><button id="warpToFriend${id}">Warp to Friend</button></td>`;
};

const setupFriendWarp = (id: number) => {
  const button = document.getElementById(`warpToFriend${id}`);
  if (!button) {
    return;
  }
  button.addEventListener("click", () => {
    abortWrapper(() => {
      sendFriendWarp(id);
      pop();
    });
  });
};

const friendsColgroup = () =>
  lastSelf?.docked
    ? `<col style="width: 50%"><col style="width: 25%"><col style="width: 25%">`
    : `<col style="width: 40%"><col style="width: 20%"><col style="width: 20%"><col style="width: 20%;">`;

const populateFriendList = (friends: ClientFriend[]) => {
  const friendList = document.getElementById("friendList");
  if (friends.length === 0) {
    if (friendList) {
      friendList.innerHTML = "<h3>You have no friends.</h3>";
    }
    return;
  }
  if (friendList) {
    let html = `<table style="text-align: left; min-width: 40vw;" class="rowHoverNoHeading" cellspacing="0">
    <colgroup>${friendsColgroup()}</colgroup>
    <tr><th>Name</th><th>Location</th></tr>`;
    for (const friend of friends) {
      html += `<tr><td>${friend.name}</td><td>${domFromRest(
        `/currentSectorOfPlayer?id=${friend.id}`,
        sectorLocationTemplate
      )}</td><td style="${
        lastSelf?.docked ? "text-align: right;" : ""
      }"><button id="removeFriend${friend.id}">Unfriend</button></td>${warpIfNotDocked(friend.id)}</tr>`;
    }
    html += `</table>`;
    friendList.innerHTML = html;
    for (const friend of friends) {
      const removeFriendButton = document.getElementById(`removeFriend${friend.id}`);
      if (removeFriendButton) {
        removeFriendButton.onclick = () => {
          confirmation(() => sendUnfriend(friend.id));
        };
      }
      setupFriendWarp(friend.id);
    }
  }
};

const populateActiveFriendRequests = (requests: ClientFriendRequest[]) => {
  const activeFriendRequests = document.getElementById("activeFriendRequests");
  if (requests.length === 0) {
    if (activeFriendRequests) {
      activeFriendRequests.innerHTML = "<h3>You have no active friend requests.</h3>";
    }
    return;
  }
  if (activeFriendRequests) {
    let html = `<table style="text-align: left; min-width: 40vw;" class="rowHoverNoHeading" cellspacing="0">
    <colgroup><col style="width: 50%"><col style="width: 25%"><col style="width: 25%"></colgroup>
    <tr><th>Name</th><th>Status</th><th></th></tr>`;
    let index = 0;
    for (const request of requests) {
      const actionOn = request.outgoing
        ? `<td style="text-align: right;"><button id="actionOn${index}">Rescind</button></td>`
        : `<td style="text-align: right;"><button id="actionOn${index}">Accept</button></td>`;
      html += `<tr><td>${request.name}</td><td>${request.outgoing ? "Outgoing" : "Incoming"}</td>${actionOn}</tr>`;
      index++;
    }
    html += `</table>`;
    activeFriendRequests.innerHTML = html;
    index = 0;
    for (const request of requests) {
      const actionOnButton = document.getElementById(`actionOn${index}`);
      if (actionOnButton) {
        if (request.outgoing) {
          actionOnButton.onclick = () => {
            confirmation(() => sendRevokeFriendRequest(request.name));
          };
        } else {
          actionOnButton.onclick = () => {
            sendFriendRequest(request.name);
          };
        }
      }
      index++;
    }
  }
};

const setupFriendRequester = () => {
  const friendRequester = document.getElementById("friendRequester");
  if (friendRequester) {
    friendRequester.innerHTML = `<input type="text" id="friendRequestInput" placeholder="Friend's name" style="margin-right: 10px; color: black;" />
    <button id="friendRequestButton" disabled>Send Friend Request</button>`;
    const friendRequestInput = document.getElementById("friendRequestInput") as HTMLInputElement;
    if (friendRequestInput) {
      const validator = (value: string) => {
        getRestRaw(`/canFriendRequest?from=${ownId}&to=${value}`, (data: string) => {
          const available = JSON.parse(data) as boolean;
          if (friendRequestInput.value === value) {
            const friendRequestButton = document.getElementById("friendRequestButton") as HTMLButtonElement;
            if (available) {
              if (friendRequestButton) {
                friendRequestButton.disabled = false;
              }
              friendRequestInput.style.backgroundColor = "#aaffaacc";
            } else {
              if (friendRequestButton) {
                friendRequestButton.disabled = true;
              }
              friendRequestInput.style.backgroundColor = "#ffaaaacc";
            }
          }
        });
      };

      validator(friendRequestInput.value);

      const debouncer = new Debouncer(300);

      friendRequestInput.addEventListener("keyup", () => {
        debouncer.debounce(() => validator(friendRequestInput.value));
      });

      friendRequestInput.addEventListener("change", () => {
        validator(friendRequestInput.value);
      });

      friendRequestInput.addEventListener("paste", () => {
        debouncer.debounce(() => validator(friendRequestInput.value));
      });
    }
  }
};

const setupFriendRequestForm = () => {
  setupFriendRequester();
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
  populateActiveFriendRequests(friendRequests);
};

const socialDialog = `<div class="unselectable">${horizontalCenter([
  "<h2>Friends</h2>",
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
  bindPostUpdater("friendRequests", populateActiveFriendRequests);
};

export { initSocial, showSocial };
