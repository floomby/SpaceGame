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
    this.timeout = setTimeout(func, this.delay);
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

export { disableTooExpensive, Debouncer, EagerDebouncer };
