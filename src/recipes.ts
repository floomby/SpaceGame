type Recipe = {
  name: string;
  ingredients: { [key: string]: number };
};

let recipes: Recipe[] = [];

let recipeMap = new Map<string, { index: number; recipe: Recipe }>();

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
      name: "Forward Fuselage",
      ingredients: {
        "Ferrecium Alloy": 12,
        "Refined Russium": 4,
      },
    },
    {
      name: "Aft Fuselage",
      ingredients: {
        "Ferrecium Alloy": 15,
        "Refined Russium": 5,
      },
    },
    {
      name: "Spartan",
      ingredients: {
        "Forward Fuselage": 1,
        "Aft Fuselage": 1,
        "Spare Parts": 10,
      },
    },
    {
      name: "Refined Zirathium",
      ingredients: {
        Aziracite: 6,
      },
    },
  ];

  recipes.forEach((recipe, index) => {
    recipeMap.set(recipe.name, { index, recipe });
  });
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

export { initRecipes, recipes, recipeMap, maxManufacturable };
