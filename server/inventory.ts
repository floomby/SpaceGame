import { addCargo, Player, removeAtMostCargo } from "../src/game";
import { User } from "./dataModels";
import { WebSocket } from "ws";

// You cannot deposit cargo and then die before encountering
const depositCargo = (player: Player, what: string, amount: number, ws: WebSocket) => {
  if (amount <= 0) {
    return;
  }
  User.findOne({ id: player.id }, (err, user) => {
    if (err) {
      console.log(err);
      try {
        ws.send(JSON.stringify({ type: "error", payload: "Error finding user" }));
      } catch (e) {
        console.trace(e);
      }
    } else {
      const delta = removeAtMostCargo(player, what, amount);
      try {
        if (user) {
          const cargo = user.inventory.find((cargo) => cargo.what === what);
          if (cargo) {
            cargo.amount += amount;
            user.save();
          } else {
            user.inventory.push({
              what,
              amount,
            });
            user.save();
          }
        } else {
          console.log("Warning: user not found in depositCargo");
        }
      } catch (e) {
        addCargo(player, what, delta);
        console.log(e);
        try {
          ws.send(JSON.stringify({ type: "error", payload: "Error saving user" }));
        } catch (e) {
          console.trace(e);
        }
      }
    }
  });
};

export { depositCargo };
