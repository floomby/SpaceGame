import { peekTag, pop, push } from "./dialog";
import { mapDialog, setupMapDialog } from "./dialogs/map";
import { Input, Position } from "./game";
import { keybind, ownId, selectedSecondary, setSelectedSecondary } from "./globals";
import { sendChat, sendInput } from "./net";
import { shown as isDialogShown } from "./dialog";
import { canvas, canvasCoordsToGameCoords } from "./drawing";

let chatInput: HTMLInputElement;

let input: Input = {
  up: false,
  down: false,
  left: false,
  right: false,
  primary: false,
  secondary: false,
  dock: false,
  nextTarget: false,
  previousTarget: false,
  nextTargetAsteroid: false,
  previousTargetAsteroid: false,
  quickTargetClosestEnemy: false,
};

let targetAngle = 0;
let selectedSecondaryChanged = false;

const setSelectedSecondaryChanged = (state: boolean) => {
  selectedSecondaryChanged = state;
};

let targetEnemy = false;

const initInputHandlers = (targetAtCoords: (coords: Position) => void) => {
  chatInput = document.getElementById("chatInput") as HTMLInputElement;
  // if the chat is unfocused and empty we need to hide it
  chatInput.addEventListener("blur", () => {
    if (chatInput.value === "") {
      chatInput.style.display = "none";
    }
  });

  document.addEventListener("keydown", (e) => {
    if (chatInput === document.activeElement) {
      if (e.key === "Enter" && chatInput.value !== "") {
        sendChat(ownId, chatInput.value);
        chatInput.value = "";
        chatInput.blur();
        chatInput.style.display = "none";
      } else if (e.key === "Enter") {
        chatInput.blur();
        chatInput.style.display = "none";
      }
      return;
    }

    let changed = false;
    const oldSecondary = selectedSecondary;
    switch (e.key) {
      case keybind.up:
        changed = !input.up;
        input.up = true;
        break;
      case keybind.down:
        changed = !input.down;
        input.down = true;
        break;
      case keybind.left:
        changed = !input.left;
        input.left = true;
        break;
      case keybind.right:
        changed = !input.right;
        input.right = true;
        break;
      case keybind.secondary:
        changed = !input.secondary;
        input.secondary = true;
        break;
      case keybind.dock:
        input.dock = true;
        break;
      case keybind.nextTarget:
        input.nextTarget = true;
        targetEnemy = e.getModifierState("Control");
        break;
      case keybind.previousTarget:
        input.previousTarget = true;
        targetEnemy = e.getModifierState("Control");
        break;
      case keybind.nextTargetAsteroid:
        input.nextTargetAsteroid = true;
        break;
      case keybind.previousTargetAsteroid:
        input.previousTargetAsteroid = true;
        break;
      case keybind.selectSecondary0:
        setSelectedSecondary(0);
        break;
      case keybind.selectSecondary1:
        setSelectedSecondary(1);
        break;
      case keybind.selectSecondary2:
        setSelectedSecondary(2);
        break;
      case keybind.selectSecondary3:
        setSelectedSecondary(3);
        break;
      case keybind.selectSecondary4:
        setSelectedSecondary(4);
        break;
      case keybind.selectSecondary5:
        setSelectedSecondary(5);
        break;
      case keybind.selectSecondary6:
        setSelectedSecondary(6);
        break;
      case keybind.selectSecondary7:
        setSelectedSecondary(7);
        break;
      case keybind.selectSecondary8:
        setSelectedSecondary(8);
        break;
      case keybind.selectSecondary9:
        setSelectedSecondary(9);
        break;
      case keybind.chat:
        if (!isDialogShown) {
          chatInput.style.display = "block";
          chatInput.focus();
        }
        break;
      case keybind.map:
        if (!isDialogShown) {
          push(mapDialog(), setupMapDialog, "map");
        } else if (peekTag() === "map") {
          pop();
        }
        break;
      case keybind.quickTargetClosestEnemy:
        input.quickTargetClosestEnemy = true;
        break;
    }
    if (changed) {
      sendInput(input, ownId);
    }
    if (oldSecondary !== selectedSecondary) {
      selectedSecondaryChanged = true;
    }
  });
  document.addEventListener("keyup", (e) => {
    if (chatInput === document.activeElement) {
      return;
    }

    let changed = false;
    switch (e.key) {
      case keybind.up:
        changed = input.up;
        input.up = false;
        break;
      case keybind.down:
        changed = input.down;
        input.down = false;
        break;
      case keybind.left:
        changed = input.left;
        input.left = false;
        break;
      case keybind.right:
        changed = input.right;
        input.right = false;
        break;
      case keybind.secondary:
        changed = input.secondary;
        input.secondary = false;
        break;
      case keybind.dock:
        input.dock = false;
        break;
      case keybind.nextTarget:
        input.nextTarget = false;
        break;
      case keybind.previousTarget:
        input.previousTarget = false;
        break;
      case keybind.nextTargetAsteroid:
        input.nextTargetAsteroid = false;
        break;
      case keybind.previousTargetAsteroid:
        input.previousTargetAsteroid = false;
        break;
    }
    if (changed) {
      sendInput(input, ownId);
    }
  });

  document.addEventListener("mousemove", (e) => {
    if (isDialogShown) {
      if (input.primary) {
        input.primary = false;
        sendInput(input, ownId);
      }
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const dx = x - canvas.width / 2;
    const dy = y - canvas.height / 2;
    targetAngle = Math.atan2(dy, dx);
  });

  document.onmousedown = (e) => {
    if (e.button === 0) {
      if (!isDialogShown) {
        const oldPrimary = input.primary;
        input.primary = true;
        if (oldPrimary !== input.primary) {
          sendInput(input, ownId);
        }
      }
    }
    if (e.button === 2) {
      if (isDialogShown) {
        return;
      }
      // get canvas position
      const rect = canvas.getBoundingClientRect();
      const coords = canvasCoordsToGameCoords(e.clientX - rect.left, e.clientY - rect.top);
      if (coords) {
        targetAtCoords(coords);
      }
    }
  };
  document.onmouseup = (e) => {
    if (e.button === 0) {
      input.primary = false;
      sendInput(input, ownId);
    }
  };

  canvas.oncontextmenu = (e) => {
    e.preventDefault();
  };

  chatInput.blur();
};

const hideChat = () => {
  chatInput.blur();
  chatInput.style.display = "none";
};

export { initInputHandlers, hideChat, input, selectedSecondaryChanged, setSelectedSecondaryChanged, targetEnemy, targetAngle };
