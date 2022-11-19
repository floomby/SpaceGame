type Recipe = {
  name: string;
  ingredients: { [key: string]: number };
  isShip?: boolean;
  isArmament?: boolean;
};

let recipes: Recipe[] = [];

const recipeMap = new Map<string, { index: number; recipe: Recipe }>();

type RecipeDag = {
  above: RecipeDag[];
  below: RecipeDag[];
  recipe: Recipe;
  maxLevel?: number;
  minLevel?: number;
  drawLevel?: number;
  svgGroup?: any;
  isNaturalResource?: boolean;
  unsatisfied?: boolean;
  show?: boolean;
};

const recipeDagMap = new Map<string, RecipeDag>();
let recipeDagRoot: RecipeDag;
let drawsPerLevel: number[];
const naturalResources: RecipeDag[] = [];
const nodesAtBottom = new Set<RecipeDag>();

const initRecipes = () => {
  recipes = [
    {
      name: "Refined Prifetium",
      ingredients: {
        Prifecite: 3,
      },
    },
    {
      name: "Refined Russium",
      ingredients: {
        Russanite: 4,
      },
    },
    {
      name: "Spare Parts",
      ingredients: {
        "Refined Prifetium": 2,
        "Refined Russium": 2,
      },
    },
    {
      name: "Ferrecium",
      ingredients: {
        Hemacite: 5,
      },
    },
    {
      name: "Ferrecium Alloy",
      ingredients: {
        Ferrecium: 3,
        "Refined Prifetium": 2,
      },
    },
    {
      name: "Refined Zirathium",
      ingredients: {
        Aziracite: 6,
      },
    },
    {
      name: "Forward Fuselage",
      ingredients: {
        "Ferrecium Alloy": 12,
        "Refined Russium": 4,
      },
    },
    {
      name: "Aft Fuselage",
      ingredients: {
        "Ferrecium Alloy": 45,
        "Refined Russium": 5,
      },
    },
    {
      name: "Reinforced Plating",
      ingredients: {
        "Ferrecium Alloy": 10,
        "Refined Prifetium": 2,
        "Refined Zirathium": 1,
      },
    },
    {
      name: "Spartan",
      ingredients: {
        "Forward Fuselage": 1,
        "Aft Fuselage": 1,
        "Reinforced Plating": 10,
      },
      isShip: true,
    },
    {
      name: "Boson Incabulator",
      ingredients: {
        "Refined Zirathium": 2,
        "Spare Parts": 2,
      },
    },
    {
      name: "Refractive Plating",
      ingredients: {
        "Ferrecium Alloy": 2,
        "Refined Prifetium": 1,
        "Spare Parts": 1,
      },
    },
    {
      name: "Striker",
      ingredients: {
        "Forward Fuselage": 1,
        "Aft Fuselage": 1,
        "Refractive Plating": 3,
        "Boson Incabulator": 1,
        "Flux Modulator": 1,
      },
      isShip: true,
    },
    {
      name: "Flux Modulator",
      ingredients: {
        "Refined Prifetium": 3,
        "Refined Zirathium": 2,
      },
    },
    {
      name: "Light Warhead",
      ingredients: {
        "Refined Prifetium": 1,
        "Refined Russium": 1,
      },
    },
    {
      name: "Heavy Warhead",
      ingredients: {
        "Refined Prifetium": 2,
        "Refined Russium": 2,
      },
    },
    {
      name: "Javelin Missile",
      ingredients: {
        "Ferrecium Alloy": 1,
        "Light Warhead": 1,
      },
      isArmament: true,
    },
    {
      name: "Heavy Javelin Missile",
      ingredients: {
        "Spare Parts": 1,
        "Heavy Warhead": 1,
        "Javelin Missile": 1,
      },
      isArmament: true,
    },
  ];

  recipeDagRoot = {
    above: [],
    below: [],
    recipe: null,
  };

  recipes.forEach((recipe, index) => {
    recipeMap.set(recipe.name, { index, recipe });
    recipeDagMap.set(recipe.name, {
      above: [],
      below: [],
      recipe,
    });
  });

  recipes.forEach((recipe) => {
    const recipeDag = recipeDagMap.get(recipe.name);

    Object.keys(recipe.ingredients).forEach((ingredient) => {
      const ingredientDag = recipeDagMap.get(ingredient);
      if (ingredientDag) {
        ingredientDag.above.push(recipeDag);
        recipeDag.below.push(ingredientDag);
      } else {
        const newResource = {
          above: [recipeDag],
          below: [],
          recipe: {
            name: ingredient,
            ingredients: {},
          },
          isNaturalResource: true,
        };
        recipeDagMap.set(ingredient, newResource);
        recipeDag.below.push(newResource);
        naturalResources.push(newResource);
      }
    });
  });

  // Attach ships and weapons to the root
  for (const recipeDag of recipeDagMap.values()) {
    if (recipeDag.recipe.isShip || recipeDag.recipe.isArmament) {
      recipeDag.above.push(recipeDagRoot);
      recipeDagRoot.below.push(recipeDag);
    }
  }

  // Find all nodes that are at the bottom of the graph
  for (const recipeDag of recipeDagMap.values()) {
    if (recipeDag.below.length === 0) {
      nodesAtBottom.add(recipeDag);
    }
    recipeDag.show = true;
  }

  const setMinHeight = (recipeDag: RecipeDag, height: number) => {
    if (recipeDag.minLevel === undefined || recipeDag.minLevel < height) {
      recipeDag.minLevel = height;
      // Keep all weapons and ships at the level right below the root even if they feed into something else
      recipeDag.above.forEach((above) => {
        if (!(recipeDag.recipe?.isShip || recipeDag.recipe?.isArmament) || !(above.recipe?.isShip || above.recipe?.isArmament)) {
          setMinHeight(above, height + 1);
        }
      });
    }
  };

  for (const node of nodesAtBottom) {
    setMinHeight(node, 0);
  }

  clearShow();
  setShowShips();
  setShowArmaments();
  computeLevels();
};

const computeLevels = () => {
  const setMaxHeight = (recipeDag: RecipeDag, height: number) => {
    if (recipeDag.show) {
      if (recipeDag.maxLevel === undefined || recipeDag.maxLevel > height) {
        recipeDag.maxLevel = height;
        recipeDag.below.forEach((below) => {
          if (!(recipeDag.recipe?.isShip || recipeDag.recipe?.isArmament) || !(below.recipe?.isShip || below.recipe?.isArmament)) {
            setMaxHeight(below, height - 1);
          }
        });
      }
    }
  };

  setMaxHeight(recipeDagRoot, recipeDagRoot.minLevel);

  drawsPerLevel = new Array(recipeDagRoot.maxLevel + 1).fill(0);

  for (const recipeDag of recipeDagMap.values()) {
    if (recipeDag.show) {
      if (recipeDag.recipe.isArmament || recipeDag.recipe.isShip) {
        recipeDag.drawLevel = recipeDag.maxLevel;
      } else {
        recipeDag.drawLevel = recipeDag.below.length > 0 ? Math.floor((recipeDag.minLevel + recipeDag.maxLevel) / 2) : recipeDag.minLevel;
      }
      drawsPerLevel[recipeDag.drawLevel]++;
    }
  }
};

const computeTotalRequirements = (currentNode: RecipeDag, values: { [key: string]: number }, multiplier = 1) => {
  for (const ingredient of currentNode.below) {
    if (values[ingredient.recipe.name] === undefined) {
      values[ingredient.recipe.name] = 0;
    }
    values[ingredient.recipe.name] += currentNode.recipe.ingredients[ingredient.recipe.name] * multiplier;
    computeTotalRequirements(ingredient, values, currentNode.recipe.ingredients[ingredient.recipe.name] * multiplier);
  }
};

const maxManufacturable = (index: number, inventory: { [key: string]: number }) => {
  const recipe = recipes[index];
  let max = Infinity;
  for (const ingredient in recipe.ingredients) {
    const amount = inventory[ingredient] || 0;
    max = Math.min(max, Math.floor(amount / recipe.ingredients[ingredient]));
  }
  return max;
};

const computeUsedRequirementsShared = (
  currentNode: RecipeDag,
  inventoryObject: { [key: string]: number },
  existingInventory: { [key: string]: number },
  multiplier = 1,
  usage = new Map<RecipeDag, number>()
) => {
  for (const ingredient of currentNode.below) {
    const use = usage.get(ingredient);
    if (use === undefined) {
      usage.set(ingredient, 0);
    }
    if (inventoryObject[ingredient.recipe.name] === undefined) {
      inventoryObject[ingredient.recipe.name] = 0;
    }
    if (ingredient.isNaturalResource) {
      inventoryObject[ingredient.recipe.name] -= currentNode.recipe.ingredients[ingredient.recipe.name] * multiplier;
    } else {
      const amountToRemoveFromInventory = Math.min(
        inventoryObject[ingredient.recipe.name],
        currentNode.recipe.ingredients[ingredient.recipe.name] * multiplier
      );
      inventoryObject[ingredient.recipe.name] -= amountToRemoveFromInventory;
      computeUsedRequirementsShared(
        ingredient,
        inventoryObject,
        existingInventory,
        currentNode.recipe.ingredients[ingredient.recipe.name] * multiplier - amountToRemoveFromInventory,
        usage
      );
    }
    usage.set(ingredient, (existingInventory[ingredient.recipe.name] || 0) - inventoryObject[ingredient.recipe.name]);
  }
  return usage;
};

const markUnsatisfied = (currentNode: RecipeDag) => {
  if (currentNode.unsatisfied) {
    return;
  }
  currentNode.unsatisfied = true;
  currentNode.above.forEach((above) => markUnsatisfied(above));
};

const clearUnsatisfied = () => {
  for (const recipeDag of recipeDagMap.values()) {
    recipeDag.unsatisfied = false;
  }
};

const propagateShowDown = (currentNode: RecipeDag) => {
  if (currentNode.show) {
    return;
  }
  currentNode.show = true;
  currentNode.below.forEach((below) => propagateShowDown(below));
};

const clearShow = () => {
  for (const recipeDag of recipeDagMap.values()) {
    recipeDag.show = false;
  }
  recipeDagRoot.show = true;
};

const setShowShips = () => {
  for (const recipeDag of recipeDagMap.values()) {
    if (recipeDag.recipe.isShip) {
      propagateShowDown(recipeDag);
    }
  }
};

const setShowArmaments = () => {
  for (const recipeDag of recipeDagMap.values()) {
    if (recipeDag.recipe.isArmament) {
      propagateShowDown(recipeDag);
    }
  }
};

export {
  RecipeDag,
  initRecipes,
  recipes,
  recipeMap,
  maxManufacturable,
  recipeDagRoot,
  drawsPerLevel as recipesPerLevel,
  computeTotalRequirements,
  recipeDagMap,
  computeUsedRequirementsShared,
  naturalResources,
  markUnsatisfied,
  clearUnsatisfied,
  clearShow,
  setShowShips,
  setShowArmaments,
  computeLevels,
};
