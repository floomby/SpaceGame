import { Player } from "../game";

const disableTooExpensive = (player: Player | undefined, cost: number) => {
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

export { disableTooExpensive, Debouncer };