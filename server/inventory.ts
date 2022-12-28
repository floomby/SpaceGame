import { addCargo, availableCargoCapacity, Player, removeAtMostCargo } from "../src/game";
import { User } from "./dataModels";
import { WebSocket } from "ws";
import { market } from "./market";
import { computeUsedRequirementsShared, naturalResources, recipeDagMap, recipeMap } from "../src/recipes";
import { inspect } from "util";
import { isFreeArm } from "../src/defs/armaments";

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

const discoverRecipe = (ws: WebSocket, id: number, what: string) => {
  User.findOne({ id }, (err, user) => {
    if (err) {
      console.log(err);
      try {
        ws.send(JSON.stringify({ type: "error", payload: { message: "Error finding user for recipe discovery" } }));
      } catch (e) {
        console.trace(e);
      }
    } else {
      try {
        if (user) {
          if (recipeMap.has(what)) {
            if (!user.recipesKnown.includes(what)) {
              user.recipesKnown.push(what);
              user.save();
              ws.send(JSON.stringify({ type: "recipe", payload: [what] }));
            }
          } else {
            console.log(`Warning: recipe ${what} not found in discoverRecipe`);
          }
        } else {
          console.log("Warning: user not found in discoverRecipe");
        }
      } catch (e) {
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

const updateClientRecipes = (ws: WebSocket, id: number) => {
  User.findOne({ id }, (err, user) => {
    if (err) {
      console.log(err);
      try {
        ws.send(JSON.stringify({ type: "error", payload: { message: "Error finding user for recipe update" } }));
      } catch (e) {
        console.trace(e);
      }
    } else {
      try {
        if (user) {
          ws.send(JSON.stringify({ type: "recipe", payload: user.recipesKnown }));
        } else {
          console.log("Warning: user not found in updateClientRecipes");
        }
      } catch (e) {
        console.log(e);
        try {
          ws.send(JSON.stringify({ type: "error", payload: { message: "Error sending recipes" } }));
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
                ws.send(JSON.stringify({ type: "error", payload: { message: "You don't have that much to sell" } }));
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
              ws.send(JSON.stringify({ type: "error", payload: { message: "You don't have that to sell" } }));
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

const manufacture = (ws: WebSocket, player: Player, what: string, amount: number, flashServerMessage: (id: number, message: string) => void) => {
  const recipe = recipeMap.get(what);
  if (recipe) {
    amount = Math.round(amount);
    if (amount <= 0) {
      return;
    }
    User.findOne({ id: player.id }, (err, user) => {
      if (err) {
        console.log(err);
        try {
          ws.send(JSON.stringify({ type: "error", payload: { message: "Error finding user" } }));
        } catch (e) {
          console.trace(e);
        }
      } else {
        try {
          if (user) {
            if (!user.recipesKnown.includes(what)) {
              try {
                flashServerMessage(player.id, `You don't know how to make ${what}`);
                return;
              } catch (e) {
                console.trace(e);
              }
            }
            for (const [ingredient, quantity] of Object.entries(recipe.recipe.ingredients)) {
              const inventory = user.inventory.find((inventory) => inventory.what === ingredient);
              if (inventory) {
                inventory.amount -= quantity * amount;
                if (inventory.amount < 0) {
                  try {
                    ws.send(JSON.stringify({ type: "error", payload: { message: `You don't have enough ${ingredient}` } }));
                  } catch (e) {
                    console.trace(e);
                  }
                  return;
                }
              } else {
                try {
                  ws.send(JSON.stringify({ type: "error", payload: { message: `You don't have ${ingredient}` } }));
                } catch (e) {
                  console.trace(e);
                }
                return;
              }
            }
            user.inventory = user.inventory.filter((inventory) => inventory.amount > 0);
            const newInventory = user.inventory.find((inventory) => inventory.what === what);
            if (newInventory) {
              newInventory.amount += amount;
            } else {
              user.inventory.push({
                what,
                amount,
              });
            }
            user.save();
            try {
              ws.send(JSON.stringify({ type: "inventory", payload: user.inventory }));
            } catch (e) {
              console.trace(e);
            }
          }
        } catch (e) {
          console.log(e);
          try {
            ws.send(JSON.stringify({ type: "error", payload: { message: `Error manufacturing ${what}` } }));
          } catch (e) {
            console.trace(e);
          }
        }
      }
    });
  } else {
    try {
      ws.send(JSON.stringify({ type: "error", payload: { message: `No recipe for ${what}` } }));
    } catch (e) {
      console.trace(e);
    }
  }
};

const compositeManufacture = (
  ws: WebSocket,
  player: Player,
  what: string,
  amount: number,
  flashServerMessage: (id: number, message: string) => void
) => {
  const recipeDag = recipeDagMap.get(what);
  if (recipeDag) {
    User.findOne({ id: player.id }, (err, user) => {
      if (err) {
        console.log(err);
        try {
          ws.send(JSON.stringify({ type: "error", payload: { message: "Error finding user" } }));
        } catch (e) {
          console.trace(e);
        }
      } else {
        try {
          if (user) {
            const inventory: { [key: string]: number } = {};
            for (const entry of user.inventory) {
              inventory[entry.what] = entry.amount;
            }
            const inventoryObject = JSON.parse(JSON.stringify(inventory));
            const { usage, recipesUsed } = computeUsedRequirementsShared(recipeDag, inventoryObject, inventory, amount);

            let unsatisfied = false;
            for (const resource of naturalResources) {
              const use = usage.get(resource);
              if (use) {
                if (use > (inventory[resource.recipe.name] || 0)) {
                  unsatisfied = true;
                  break;
                }
              }
            }

            let unknowledgeable = false;
            for (const recipe of recipesUsed) {
              if (!user.recipesKnown.includes(recipe.recipe.name) && !recipe.recipe.isInputOnly) {
                unknowledgeable = true;
                break;
              }
            }

            if (unsatisfied) {
              try {
                flashServerMessage(
                  player.id,
                  `You don't have enough resources to make ${user.recipesKnown.includes(recipeDag.recipe.name) ? what : "???"}`
                );
                return;
              } catch (e) {
                console.trace(e);
              }
            }

            if (unknowledgeable) {
              try {
                flashServerMessage(player.id, `Requisite knowledge missing`);
                return;
              } catch (e) {
                console.trace(e);
              }
            }

            for (const [use, amount] of usage.entries()) {
              const inventory = user.inventory.find((inventory) => inventory.what === use.recipe.name);
              if (inventory && amount) {
                inventory.amount -= amount;
              }
            }
            user.inventory = user.inventory.filter((inventory) => inventory.amount > 0);
            const newInventory = user.inventory.find((inventory) => inventory.what === what);
            if (newInventory) {
              newInventory.amount += amount;
            } else {
              user.inventory.push({
                what,
                amount,
              });
            }
            try {
              user.save();
              try {
                ws.send(JSON.stringify({ type: "inventory", payload: user.inventory }));
              } catch (e) {
                console.trace(e);
              }
            } catch (e) {
              console.trace(e);
            }
          }
        } catch (e) {
          console.log(e);
          try {
            ws.send(JSON.stringify({ type: "error", payload: { message: `Error manufacturing ${what}` } }));
          } catch (e) {
            console.trace(e);
          }
        }
      }
    });
  } else {
    try {
      ws.send(JSON.stringify({ type: "error", payload: { message: `No recipe for ${what}` } }));
    } catch (e) {
      console.trace(e);
    }
  }
};

const transferToShip = (ws: WebSocket, player: Player, what: string, amount: number, flashServerMessage: (id: number, message: string) => void) => {
  if (amount <= 0) {
    return;
  }
  const availableCapacity = availableCargoCapacity(player);
  const amountToTransfer = Math.min(amount, availableCapacity);
  if (amountToTransfer === 0) {
    flashServerMessage(player.id, "No cargo capacity available");
    return;
  }
  User.findOne({ id: player.id }, (err, user) => {
    if (err) {
      console.log(err);
      try {
        ws.send(JSON.stringify({ type: "error", payload: { message: "Error finding user" } }));
      } catch (e) {
        console.trace(e);
      }
    } else {
      try {
        if (user) {
          const inventory = user.inventory.find((inventory) => inventory.what === what);
          if (inventory) {
            inventory.amount -= amountToTransfer;
            if (inventory.amount < 0) {
              try {
                ws.send(JSON.stringify({ type: "error", payload: { message: "You don't have that much to transfer" } }));
              } catch (e) {
                console.trace(e);
              }
            } else {
              user.inventory = user.inventory.filter((inventory) => inventory.amount > 0);
              user.save();
              try {
                ws.send(JSON.stringify({ type: "inventory", payload: user.inventory }));
              } catch (e) {
                console.trace(e);
              }
              if (player.cargo === undefined) {
                player.cargo = [];
              }
              const amountTransferred = addCargo(player, what, amountToTransfer);
              if (amountTransferred < amount) {
                flashServerMessage(player.id, `Only ${amountTransferred} of ${amount} transferred (cargo full)`);
              }
            }
          } else {
            try {
              ws.send(JSON.stringify({ type: "error", payload: { message: "You don't have that to transfer" } }));
            } catch (e) {
              console.trace(e);
            }
          }
        } else {
          console.log("Warning: user not found in transferToShip");
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

const depositItemsIntoInventory = (
  ws: WebSocket,
  player: Player,
  whats: string[],
  take: string[],
  flashServerMessage: (id: number, message: string) => void,
  playerReverterForErrors: () => void
) => {
  take = take.filter((what) => !isFreeArm(what));
  whats = whats.filter((what) => !isFreeArm(what));
  if (whats.length === 0 && take.length === 0) {
    return;
  }
  User.findOne({ id: player.id }, (err, user) => {
    if (err) {
      console.log(err);
      playerReverterForErrors();
      try {
        ws.send(JSON.stringify({ type: "error", payload: { message: "Error finding user" } }));
      } catch (e) {
        console.trace(e);
      }
    }
    if (user) {
      for (const what of whats) {
        const inventoryEntry = user.inventory.find((inventory) => inventory.what === what);
        if (inventoryEntry) {
          inventoryEntry.amount++;
        } else {
          user.inventory.push({
            what,
            amount: 1,
          });
        }
      }
      for (const what of take) {
        const inventoryEntry = user.inventory.find((inventory) => inventory.what === what);
        if (inventoryEntry) {
          inventoryEntry.amount--;
        } else {
          playerReverterForErrors();
          return;
        }
      }
      user.inventory = user.inventory.filter((inventory) => inventory.amount > 0);

      try {
        user.save();
        if (whats.length > 0) {
          try {
            flashServerMessage(player.id, `Deposited ${whats.length === 1 ? whats[0] : "items"} into inventory`);
          } catch (e) {
            console.trace(e);
          }
        }
      } catch (e) {
        console.log(e);
        playerReverterForErrors();
      }
      try {
        ws.send(JSON.stringify({ type: "inventory", payload: user.inventory }));
      } catch (e) {
        console.trace(e);
      }
    }
  });
};

export {
  depositCargo,
  sendInventory,
  sellInventory,
  manufacture,
  transferToShip,
  depositItemsIntoInventory,
  discoverRecipe,
  updateClientRecipes,
  compositeManufacture,
};
