type Recipe = {
  name: string;
  ingredients: { [key: string]: number };
};

let recipes: Recipe[] = [];

let recipeMap = new Map<string, { index: number, recipe: Recipe }>();

const initRecipes = () => {
  recipes = [
    {
      name: "Refined Prifetium",
      ingredients: {
        "Prifetium Ore": 3,
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