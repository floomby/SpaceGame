import { addCargo, Player, removeAtMostCargo } from "../src/game";
import { User } from "./dataModels";
import { WebSocket } from "ws";
import { market } from "./market";
import { inspect } from "util";

// You cannot deposit cargo and then die before encountering
const depositCargo = (player: Player, what: string, amount: number, ws: WebSocket) => {
  if (amount <= 0) {
    return;
  }
  User.findOne({ id: player.id }, (err, user) => {
    if (err) {
      console.log(err);
      try {
        ws.send(JSON.stringify({ type: "error", payload: { message: "Error finding user for cargo deposit" } }));
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
          } else {
            user.inventory.push({
              what,
              amount,
            });
          }
          user.save();
          ws.send(JSON.stringify({ type: "inventory", payload: user.inventory }));
        } else {
          console.log("Warning: user not found in depositCargo");
        }
      } catch (e) {
        addCargo(player, what, delta);
        console.log(e);
        try {
          ws.send(JSON.stringify({ type: "error", payload: { message: "Error saving user" } }));
        } catch (e) {
          console.trace(e);
        }
      }
    }
  });
};

const sendInventory = (ws: WebSocket, id: number) => {
  User.findOne({ id }, (err, user) => {
    if (err) {
      console.log(err);
      try {
        ws.send(JSON.stringify({ type: "error", payload: { message: "Error finding user for inventory population" } }));
      } catch (e) {
        console.trace(e);
      }
    } else {
      try {
        if (user) {
          ws.send(JSON.stringify({ type: "inventory", payload: user.inventory }));
        } else {
          console.log("Warning: user not found in sendInventory");
        }
      } catch (e) {
        console.log(e);
        try {
          ws.send(JSON.stringify({ type: "error", payload: { message: "Error sending inventory" } }));
        } catch (e) {
          console.trace(e);
        }
      }
    }
  });
};

const sellInventory = (ws: WebSocket, player: Player, what: string, amount: number) => {
  if (amount <= 0) {
    return;
  }
  User.findOne({ id: player.id }, (err, user) => {
    if (err) {
      console.log(err);
      try {
        ws.send(JSON.stringify({ type: "error", payload: { message: "Error finding user for inventory population" } }));
      } catch (e) {
        console.trace(e);
      }
    } else {
      try {
        if (user) {
          const inventory = user.inventory.find((inventory) => inventory.what === what);
          if (inventory) {
            inventory.amount -= amount;
            if (inventory.amount < 0) {
              try {
                ws.send(JSON.stringify({ type: "error", payload: { message: "You don't have that much to sell" }}));
              } catch (e) {
                console.trace(e);
              }
            } else {
              user.inventory = user.inventory.filter((inventory) => inventory.amount > 0);
              user.save();
              if (player.credits === undefined) {
                player.credits = 0;
              }
              const price = market.get(what);
              if (price) {
                player.credits += amount * price;
              }
              ws.send(JSON.stringify({ type: "inventory", payload: user.inventory }));
            }
          } else {
            try {
              ws.send(JSON.stringify({ type: "error", payload: { message: "You don't have that to sell" }}));
            } catch (e) {
              console.trace(e);
            }
          }
        } else {
          console.log("Warning: user not found in sendInventory");
        }
      } catch (e) {
        console.log(e);
        try {
          ws.send(JSON.stringify({ type: "error", payload: { message: "Error sending inventory" } }));
        } catch (e) {
          console.trace(e);
        }
      }
    }
  });
};

const manufacture = (ws: WebSocket, player: Player, what: string, amount: number) => {
};

export { depositCargo, sendInventory, sellInventory, manufacture };
