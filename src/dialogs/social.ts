import { addOnHide, addOnPush, addOnShow, horizontalCenter, peekTag, pop, push, shown } from "../dialog";

let initialized = false;

const socialDialog = `<div class="unselectable">${horizontalCenter([
  "<h2>Social</h2>",
  "<br/><div id='social'></div>",
  "<button class='bottomButton' id='socialClose'>Close</button>",
])}</div>`;

const setupSocialDialog = () => {
  const socialClose = document.getElementById("socialClose");
  if (socialClose) {
    socialClose.onclick = () => {
      pop();
    };
  }
};

const showSocial = () => {
  if (!shown) {
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
    socialIcon.onclick = showSocial;
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
}

export { initSocial };
