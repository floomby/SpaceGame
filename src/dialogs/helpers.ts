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

export { disableTooExpensive };