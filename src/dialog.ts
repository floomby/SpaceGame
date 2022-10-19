let div: HTMLDivElement;

let shown = false;

const init = () => {
  div = document.getElementById("dialog") as HTMLDivElement;
  div.style.display = "none";
};

const setDialogBackground = (color: string) => {
  div.style.backgroundColor = color;
};

let staged: HTMLDivElement;
let stackPlace: HTMLDivElement;

const show = (html: string) => {
  div.style.display = "flex";
  div.innerHTML = `<div class="center" id="staged">${html}</div>
    <div id="stackPlace"></div>`;
  staged = document.getElementById("staged") as HTMLDivElement;
  stackPlace = document.getElementById("stackPlace") as HTMLDivElement;
  stackPlace.style.display = "none";
  stackPlace.style.position = "absolute";
  stackPlace.style.top = "0";
  stackPlace.style.left = "0";
  stackPlace.style.width = "100%";
  stackPlace.style.height = "100%";
  shown = true;
};

const hide = () => {
  div.style.display = "none";
  shown = false;
};

const clear = () => {
  div.innerHTML = "";
};

let shownFromStack = false;

const stack: { html: string; callback: () => void }[] = [];

const showStack = () => {
  if (stack.length > 0) {
    if (!shown) {
      show("");
      shown = true;
      shownFromStack = true;
    }
    staged.style.display = "none";
    const { html, callback } = stack[stack.length - 1];
    stackPlace.innerHTML = `<div class="center">${html}</div>`;
    stackPlace.style.display = "flex";
    callback();
  } else {
    if (shownFromStack) {
      clear();
      hide();
      shownFromStack = false;
      shown = false;
    } else {
      stackPlace.innerHTML = "";
      stackPlace.style.display = "none";
      staged.style.display = "flex";
    }
  }
};

const push = (html: string, callback: () => void) => {
  stack.push({ html, callback });
  showStack();
};

const pop = () => {
  stack.pop();
  showStack();
};

const horizontalCenter = (html: string[]) => {
  return `<div style="text-align: center;">${html.map((html) => `<div style="display: inline-block;">${html}</div>`).join("<br/>")}</div>`;
};

const updaters: Map<string, (value: any) => string> = new Map();
const postUpdaters: Map<string, (value: any) => void> = new Map();
const lastStates: Map<string, string> = new Map();

// NOTE value must be serializable with JSON.stringify
const updateDom = (id: string, value: any) => {
  if (!shown) {
    return;
  }
  const element = document.getElementById(id);
  if (!element) {
    return;
  }
  const lastState = lastStates.get(id);
  let thisState: string | undefined = undefined;
  if (lastState) {
    thisState = JSON.stringify(value);
    if (lastState === thisState) {
      return;
    }
  }

  const updater = updaters.get(id);
  if (updater) {
    if (!thisState) {
      thisState = JSON.stringify(value);
    }
    lastStates.set(id, thisState);
    element.innerHTML = updater(value);
    const postUpdater = postUpdaters.get(id);
    if (postUpdater) {
      postUpdater(value);
    }
  }
};

const runPostUpdaterOnly = (id: string, value: any) => {
  if (!shown) {
    return;
  }
  const lastState = lastStates.get(id);
  let thisState: string | undefined = undefined;
  if (lastState) {
    thisState = JSON.stringify(value);
    if (lastState === thisState) {
      return;
    }
  }

  const postUpdater = postUpdaters.get(id);
  if (postUpdater) {
    if (!thisState) {
      thisState = JSON.stringify(value);
    }
    lastStates.set(id, thisState);
    console.log("runPostUpdaterOnly", id, value);
    postUpdater(value);
  }
};

const bindUpdater = (id: string, updater: (value: any) => string) => {
  updaters.set(id, updater);
};

const bindPostUpdater = (id: string, updater: (value: any) => void) => {
  postUpdaters.set(id, updater);
};

const unbindKey = (key: string) => {
  updaters.delete(key);
  postUpdaters.delete(key);
  lastStates.delete(key);
};

export {
  init,
  show,
  hide,
  clear,
  horizontalCenter,
  bindUpdater,
  updateDom,
  bindPostUpdater,
  unbindKey,
  push,
  pop,
  setDialogBackground,
  runPostUpdaterOnly,
};
