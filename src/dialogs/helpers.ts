import { Player } from "../game";

const disableTooExpensive = (player: Player | undefined, cost: number, forceDisable = false) => {
  if (forceDisable) {
    return "disabled";
  }
  if (player) {
    if (player.credits < cost) {
      return "disabled";
    } else {
      return "";
    }
  } else {
    return "disabled";
  }
};

class Debouncer {
  private timeout: number | undefined;

  constructor(private delay: number) {}

  public debounce(func: () => void) {
    if (this.timeout) {
      clearTimeout(this.timeout);
    }
    this.timeout = setTimeout(func, this.delay) as any;
  }
}

class EagerDebouncer {
  constructor(private delay: number) {}

  private sent = false;

  public debounce(func: () => void) {
    if (this.sent) {
      return;
    }

    this.sent = true;
    func();

    setTimeout(() => {
      this.sent = false;
    }, this.delay);
  }
}

const sideBySideDivs = (content: string[], shrink = false) => {
  let ret = `<div style="display: flex; flex-direction: row; justify-content: left;"> ${content
    .map((c) => `<div style="flex: 1;">${c}</div>`)
    .join("")}</div>`;
  if (shrink) {
    return `<div style="display: inline-block;">${ret}</div>`;
  }
  return ret;
};

const stackedDivs = (content: string[]) => `<div style="display: flex; flex-direction: column; justify-content: left;">
  ${content.map((c) => `<div style="flex: 1;">${c}</div>`).join("")}</div>`;

export { disableTooExpensive, Debouncer, EagerDebouncer, sideBySideDivs, stackedDivs };
