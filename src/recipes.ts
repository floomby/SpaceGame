type Recipe = {
  name: string;
  ingredients: { [key: string]: number };
};

let recipes: Recipe[] = [];

const recipeMap = new Map<string, { index: number; recipe: Recipe }>();

// TODO Move this type into only client code
type RecipeDag = {
  above: RecipeDag[];
  below: RecipeDag[];
  recipe: Recipe;
  maxLevel?: number;
  minLevel?: number;
  drawLevel?: number;
  svgGroup?: any;
};

const recipeDagMap = new Map<string, RecipeDag>();
let recipeDagRoot: RecipeDag;
let drawsPerLevel: number[];

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
    },
    {
      name: "Flux Modulator",
      ingredients: {
        "Refined Prifetium": 3,
        "Refined Zirathium": 2,
      },
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
      }
    });
  });

  for (const recipeDag of recipeDagMap.values()) {
    if (recipeDag.above.length === 0) {
      recipeDagRoot.below.push(recipeDag);
      recipeDag.above.push(recipeDagRoot);
    }
  }

  const nodesAtBottom = new Set<RecipeDag>();
  for (const recipeDag of recipeDagMap.values()) {
    if (recipeDag.below.length === 0) {
      nodesAtBottom.add(recipeDag);
    }
  }

  const setMinHeight = (recipeDag: RecipeDag, height: number) => {
    if (recipeDag.minLevel === undefined || recipeDag.minLevel < height) {
      recipeDag.minLevel = height;
      recipeDag.above.forEach((above) => setMinHeight(above, height + 1));
    }
  };

  for (const node of nodesAtBottom) {
    setMinHeight(node, 0);
  }

  const setMaxHeight = (recipeDag: RecipeDag, height: number) => {
    if (recipeDag.maxLevel === undefined || recipeDag.maxLevel > height) {
      recipeDag.maxLevel = height;
      recipeDag.below.forEach((below) => setMaxHeight(below, height - 1));
    }
  };

  setMaxHeight(recipeDagRoot, recipeDagRoot.minLevel);

  drawsPerLevel = new Array(recipeDagRoot.maxLevel + 1).fill(0);

  for (const recipeDag of recipeDagMap.values()) {
    recipeDag.drawLevel = recipeDag.below.length > 0 ? Math.floor((recipeDag.minLevel + recipeDag.maxLevel) / 2) : recipeDag.minLevel;
    drawsPerLevel[recipeDag.drawLevel]++;
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
};
