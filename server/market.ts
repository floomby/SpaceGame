import { assert } from "console";
import { armDefs, defs } from "../src/defs";
import { computeUsedRequirementsShared, recipeDagMap, recipeDagRoot } from "../src/recipes";

const market = new Map<string, number>();

const initMarket = () => {
  market.set("Prifecite", 3);
  market.set("Russanite", 50);
  market.set("Hemacite", 10);
  market.set("Aziracite", 12);

  // Put the definition info into the marketplace
  for (let i = 0; i < defs.length; i++) {
    const def = defs[i];
    if (def.price !== undefined) {
      market.set(def.name, Math.round(def.price));
    }
  }

  for (let i = 0; i < armDefs.length; i++) {
    const def = armDefs[i];
    market.set(def.name, Math.round(def.cost));
  }

  for (const [_, recipe] of recipeDagMap) {
    if (recipe === recipeDagRoot) {
      continue;
    }
    if (recipe.isNaturalResource) {
      continue;
    }
    if (recipe.recipe.isInputOnly) {
      continue;
    }
    const inventory = {};
    const existingInventory = {};
    const { usage, recipesUsed } = computeUsedRequirementsShared(recipe, inventory, existingInventory);
    let total = 0;
    for (const [resource, amount] of usage) {
      if (amount === 0) {
        continue;
      }
      const price = market.get(resource.recipe.name);
      assert(price !== undefined, `No price for ${resource.recipe.name}`);
      total += price! * amount;
    }
    market.set(recipe.recipe.name, total);
  }
};

market.set("Spare Parts", 10);

export { market, initMarket };
