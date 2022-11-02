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
    }
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
