let div: HTMLDivElement;

let shown = false;

const init = () => {
  div = document.getElementById("dialog") as HTMLDivElement;
  div.style.display = "none";
};

const show = (html: string) => {
  div.style.display = "flex";
  div.innerHTML = `<div class="center">${html}</div>`;
  shown = true;
};

const hide = () => {
  div.style.display = "none";
  shown = false;
};

const clear = () => {
  div.innerHTML = "";
};

const horizontalCenter = (html: string[]) => {
  return `<div style="text-align: center;">${html.map(html => `<div style="display: inline-block;">${html}</div>`).join("<br/>")}</div>`;
};

const updaters: Map<string, (value: any) => string> = new Map();
const postUpdaters: Map<string, (value: any) => void> = new Map();
const lastStates: Map<string, string> = new Map();

// NOTE value must be serializable with JSON.stringify
const updateDom = (id: string, value: any) => {
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

  const element = document.getElementById(id);
  const updater = updaters.get(id);
  if (element && updater) {
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

export { init, show, hide, clear, horizontalCenter, bindUpdater, updateDom, bindPostUpdater, unbindKey };
