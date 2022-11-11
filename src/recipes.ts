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
