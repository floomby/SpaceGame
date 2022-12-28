import { bindPostUpdater, horizontalCenter, peekTag, pop } from "../dialog";
import { inventory, recipesKnown } from "../globals";
import { sendCompositeManufacture } from "../net";
import {
  recipeDagRoot,
  RecipeDag,
  recipesPerLevel,
  recipeDagMap,
  computeUsedRequirementsShared,
  clearUnsatisfied,
  naturalResources,
  markUnsatisfied,
  clearShow,
  setShowShips,
  setShowArmaments,
  computeLevels,
} from "../recipes";

const setupManufacturingBay = () => {
  const closeManufacturingBay = document.getElementById("closeManufacturingBay");
  if (closeManufacturingBay) {
    closeManufacturingBay.onclick = () => {
      pop();
    };
  }
  const manufacturingTree = document.getElementById("manufacturingTree");
  if (manufacturingTree) {
    manufacturingTree.onresize = () => {
      console.log("resize");
    };
  }
  drawDag();
  setupFilterButtons("Ships");
  setupFilterButtons("Weapons");
};

let redrawInfo = () => {};

const redrawInfoWrapper = () => {
  redrawInfo();
};

const bindManufacturingUpdaters = () => {
  bindPostUpdater("inventory", redrawInfoWrapper);
};

const drawConnectionSpline = (svg: SVGElement, x1: number, y1: number, x2: number, y2: number, stroke: string, terminate = false) => {
  if (y2 < y1 && !terminate) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", `M ${x1} ${y1} C ${x1} ${y1 + 100} ${x2} ${y2 - 100} ${x2} ${y2}`);
    path.setAttribute("stroke", stroke);
    path.setAttribute("stroke-width", "1");
    path.setAttribute("fill", "none");
    svg.appendChild(path);
  } else {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", `M ${x1} ${y1} C ${x1} ${(y1 + y2) / 2} ${x2} ${(y1 + y2) / 2} ${x2} ${y2}`);
    path.setAttribute("stroke", stroke);
    path.setAttribute("stroke-width", "1");
    path.setAttribute("fill", "none");
    svg.appendChild(path);
  }
};

const filterButton = (what: string) => {
  return `<div id="${what}Filter" class="checkAsText checkAsTextChecked unselectable">${what}</div>`;
};

let showShips = true;
let showWeapons = true;

const setupFilterButtons = (what: string) => {
  const filter = document.getElementById(`${what}Filter`) as HTMLInputElement;
  if (filter) {
    filter.onclick = () => {
      const selected = filter.classList.contains("checkAsTextChecked");
      if (selected) {
        filter.classList.remove("checkAsTextChecked");
        if (what === "Ships") {
          showShips = false;
        } else if (what === "Weapons") {
          showWeapons = false;
        }
      } else {
        filter.classList.add("checkAsTextChecked");
        if (what === "Ships") {
          showShips = true;
        } else if (what === "Weapons") {
          showWeapons = true;
        }
      }
      clearShow();
      if (showShips) {
        setShowShips();
      }
      if (showWeapons) {
        setShowArmaments();
      }
      computeLevels();
      drawDag();
    };
  }
};

const manufacturingBay = () => {
  return horizontalCenter([
    "<h2 class='unselectable'>Manufacturing Bay</h2>",
    `<div style="display: flex; flex-direction: row; justify-content: left; width: 100%; margin-left: 2rem;">
      ${filterButton("Ships")}
      ${filterButton("Weapons")}
    </div>`,
    `<div class="manufacturing"><svg id="manufacturingTree" height="2000" width="2000"></svg></div>`,
    '<button class="bottomButton" id="closeManufacturingBay">Close</button>',
  ]);
};

let selectedRecipe: RecipeDag = undefined;
let clickedRecipe: RecipeDag = undefined;
let inventoryUsage: Map<RecipeDag, number>;
let manufacturable = false;
let manufactureQuantity = 1;

const computeTotalRequirements = (currentNode: RecipeDag, values: { [key: string]: number }, multiplier = 1) => {
  for (const ingredient of currentNode.below) {
    if (values[ingredient.recipe.name] === undefined) {
      values[ingredient.recipe.name] = 0;
    }
    values[ingredient.recipe.name] += currentNode.recipe.ingredients[ingredient.recipe.name] * multiplier;
    computeTotalRequirements(ingredient, values, currentNode.recipe.ingredients[ingredient.recipe.name] * multiplier);
  }
};

const computeUsedRequirements = (currentNode: RecipeDag, count: number) => {
  const inventoryObject = JSON.parse(JSON.stringify(inventory));
  return computeUsedRequirementsShared(currentNode, inventoryObject, inventory, count);
};

const drawDag = () => {
  const manufacturingTree = document.getElementById("manufacturingTree") as unknown as SVGSVGElement;
  if (manufacturingTree) {
    manufacturingTree.innerHTML = `<style>
  rect {
    cursor: pointer;
  }
  text {
    cursor: pointer;
  }
  /* Firefox renders text differently than Chrome */
  @-moz-document url-prefix(){
    text {
      /* If we start having multiple font sizes this fix will not work */
      transform: translate(0, 3px);
    }
  }
  .highlighted {
    bounding-box: 2px solid green;
  }
</style>
<g>
  <rect x="0" y="0" width="2000" height="2000" fill="#cccccccc" stroke="black" stroke-width="1" />
</g>`;
  }

  if (!selectedRecipe?.show) {
    selectedRecipe = undefined;
  }
  clickedRecipe = undefined;

  const horizontalSpacing = 200;
  const verticalSpacing = 160;
  const ns = "http://www.w3.org/2000/svg";

  if (manufacturingTree) {
    const coordinates = new Map<RecipeDag, { x: number; y: number }>();
    const alreadyDrawn = new Set<RecipeDag>();
    const drawnPerLevel = new Array(recipeDagRoot.minLevel + 1).fill(0);
    const nodeGroup = document.createElementNS(ns, "g");
    const edgeGroup = document.createElementNS(ns, "g");

    manufacturingTree.appendChild(edgeGroup);
    manufacturingTree.appendChild(nodeGroup);

    nodeGroup.setAttribute("z-index", "1");
    edgeGroup.setAttribute("z-index", "0");

    const marginX = 100;
    const marginY = 0;
    const nodeWidth = 100;
    const centerX = manufacturingTree.clientWidth / 2;

    let manufacturingPopup: SVGElement = undefined;

    // Also populates the amount texts
    const drawEdges = (recipe: RecipeDag, highlight = false) => {
      if (!recipe.show) {
        return;
      }
      if (recipeDagRoot === recipe) {
        for (const child of recipe.below) {
          drawEdges(child);
        }
        return;
      }
      if (drawnEdges.has(recipe)) {
        return;
      }
      drawnEdges.add(recipe);
      const { x: x1, y: y1 } = coordinates.get(recipe)!;
      for (const child of recipe.below) {
        drawEdges(child, highlight);
        if (highlight) {
          const amount = inventoryUsage.get(child) ?? 0;
          const have = inventory[child.recipe.name] || 0;
          ((child.svgGroup as SVGElement).childNodes[2] as SVGTextElement).innerHTML = `${amount}/${have}`;
          ((child.svgGroup as SVGElement).childNodes[0] as SVGRectElement).setAttribute("stroke", child.unsatisfied ? "red" : "green");
          ((child.svgGroup as SVGElement).childNodes[0] as SVGRectElement).setAttribute("fill", child.unsatisfied ? "#ffcccc" : "white");
        }
        const { x: x2, y: y2 } = coordinates.get(child)!;
        drawConnectionSpline(edgeGroup, x1 + 50, y1 + 60, x2 + 50, y2, highlight ? (child.unsatisfied ? "red" : "green") : "black");
      }
      if (highlight) {
        ((recipe.svgGroup as SVGElement).childNodes[0] as SVGRectElement).setAttribute("stroke", recipe.unsatisfied ? "red" : "green");
      }
    };

    // Checks if there are sufficient resources to manufacture the recipe and if the required recipes are discovered
    const computeManufacturable = (dagNode: RecipeDag, pure = false, count = 1) => {
      const { usage, recipesUsed } = computeUsedRequirements(dagNode, count);
      inventoryUsage = usage;

      if (!pure) {
        clearUnsatisfied();
      }
      for (const resource of naturalResources) {
        if (inventoryUsage.get(resource) > (inventory[resource.recipe.name] || 0)) {
          if (!pure) {
            markUnsatisfied(resource);
          } else {
            return false;
          }
        }
      }

      for (const recipe of recipesUsed) {
        if (!recipesKnown.has(recipe.recipe.name) && !recipe.recipe.isInputOnly) {
          if (!pure) {
            markUnsatisfied(recipe);
          } else {
            return false;
          }
        }
      }

      return true;
    };

    // Draws the edges and handles the highlighting returning if the current quantity of the selected recipe is manufacturable
    const redrawEdges = () => {
      computeManufacturable(selectedRecipe, false, manufactureQuantity);

      for (const dagNode of recipeDagMap.values()) {
        if (dagNode.svgGroup) {
          (dagNode.svgGroup as SVGElement).children[2].innerHTML = `0/${inventory[dagNode.recipe.name] || 0}`;
          (dagNode.svgGroup as SVGElement).children[0].setAttribute("stroke", "black");
          (dagNode.svgGroup as SVGElement).children[0].setAttribute("fill", "white");
        }
      }
      edgeGroup.innerHTML = "";
      drawnEdges.clear();
      drawEdges(selectedRecipe, true);
      drawEdges(recipeDagRoot);

      return !recipeDagRoot.unsatisfied;
    };

    const drawSvgElements = (recipe: RecipeDag) => {
      if (recipeDagRoot === recipe) {
        for (const child of recipe.below) {
          drawSvgElements(child);
        }
        return;
      }
      if (!recipe.show) {
        return;
      }
      if (alreadyDrawn.has(recipe)) {
        return;
      }
      const container = document.createElementNS(ns, "g");
      recipe.svgGroup = container;
      alreadyDrawn.add(recipe);
      const level = recipe.drawLevel;
      const levelOffset = (recipesPerLevel[level] * horizontalSpacing + 100) / 2;
      const x = drawnPerLevel[level] * horizontalSpacing + marginX + centerX - levelOffset;
      const y = (recipeDagRoot.minLevel + 1 - level) * verticalSpacing + marginY;
      coordinates.set(recipe, { x, y });
      drawnPerLevel[level] += 1;

      const text = document.createElementNS(ns, "text");
      text.setAttribute("x", (x + 50).toString());
      text.setAttribute("y", (y + 20).toString());
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("alignment-baseline", "middle");
      text.setAttribute("font-size", "12");
      text.classList.add("unselectable");
      text.innerHTML =
        recipesKnown.has(recipe.recipe?.name || "Root") || recipe.isNaturalResource || recipe.recipe.isInputOnly
          ? recipe.recipe?.name || "Root"
          : "???";
      container.appendChild(text);

      const amount = document.createElementNS(ns, "text");
      amount.setAttribute("x", (x + 50).toString());
      amount.setAttribute("y", (y + 40).toString());
      amount.setAttribute("text-anchor", "middle");
      amount.setAttribute("alignment-baseline", "middle");
      amount.setAttribute("font-size", "12");
      amount.classList.add("unselectable");
      amount.innerHTML = "";
      container.appendChild(amount);

      nodeGroup.appendChild(container);

      const width = Math.max(text.getComputedTextLength() + 10, nodeWidth);

      const rect = document.createElementNS(ns, "rect");
      rect.setAttribute("x", (x + Math.min(0, nodeWidth / 2 - width / 2)).toString());
      rect.setAttribute("y", y.toString());
      rect.setAttribute("width", width.toString());
      rect.setAttribute("height", "60");
      rect.setAttribute("rx", "10");
      rect.setAttribute("ry", "10");
      rect.setAttribute("fill", "white");
      rect.setAttribute("stroke", "black");
      rect.setAttribute("stroke-width", "1");
      container.prepend(rect);

      const clickHandler = (e) => {
        if (manufacturingPopup) {
          manufacturingTree.removeChild(manufacturingPopup);
          manufacturingPopup = null;
        }
        if (selectedRecipe !== recipe) {
          selectedRecipe = recipe;
          manufactureQuantity = 1;
          manufacturable = redrawEdges();
        }
        if (recipe.recipe.isInputOnly) {
          return;
        }
        manufacturingPopup = document.createElementNS(ns, "g");
        manufacturingPopup.setAttribute("id", "manufacturingPopup");
        manufacturingPopup.setAttribute("transform", `translate(${x + width + Math.min(0, nodeWidth / 2 - width / 2)}, ${y})`);
        const rect = document.createElementNS(ns, "rect");
        rect.setAttribute("x", "0");
        rect.setAttribute("y", "0");
        rect.setAttribute("width", "200");
        rect.setAttribute("height", "100");
        rect.setAttribute("rx", "10");
        rect.setAttribute("ry", "10");
        rect.setAttribute("fill", "white");
        rect.setAttribute("stroke", "black");
        rect.setAttribute("stroke-width", "1");
        manufacturingPopup.appendChild(rect);
        const text = document.createElementNS(ns, "text");
        text.setAttribute("x", "100");
        text.setAttribute("y", "20");
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("alignment-baseline", "middle");
        text.setAttribute("font-size", "12");
        text.classList.add("unselectable");
        text.innerHTML = recipesKnown.has(recipe.recipe?.name || "Root") ? recipe.recipe?.name || "Root" : "???";
        manufacturingPopup.appendChild(text);
        // Add a manufacturing button
        const button = document.createElementNS(ns, "rect");
        button.setAttribute("x", "50");
        button.setAttribute("y", "70");
        button.setAttribute("width", "100");
        button.setAttribute("height", "20");
        button.setAttribute("rx", "5");
        button.setAttribute("ry", "5");
        button.setAttribute("fill", manufacturable ? "green" : "red");
        button.setAttribute("stroke", "black");
        button.setAttribute("stroke-width", "1");
        manufacturingPopup.appendChild(button);
        const buttonText = document.createElementNS(ns, "text");
        buttonText.setAttribute("x", "100");
        buttonText.setAttribute("y", "80");
        buttonText.setAttribute("text-anchor", "middle");
        buttonText.setAttribute("alignment-baseline", "middle");
        buttonText.setAttribute("font-size", "12");
        buttonText.classList.add("unselectable");
        buttonText.innerHTML = "Manufacture";
        manufacturingPopup.appendChild(buttonText);

        // Add an input field for the amount
        const input = document.createElementNS(ns, "foreignObject");
        input.setAttribute("x", "40");
        input.setAttribute("y", "40");
        input.setAttribute("width", "120");
        input.setAttribute("height", "28");
        const inputField = document.createElement("input");
        inputField.setAttribute("type", "number");
        inputField.setAttribute("value", "1");
        inputField.setAttribute("min", "1");
        inputField.setAttribute("max", "1000000");
        inputField.setAttribute("step", "1");
        inputField.classList.add("manufacturingInput");
        input.appendChild(inputField);
        manufacturingPopup.appendChild(input);
        manufactureQuantity = 1;

        const inputChangeHandler = () => {
          let amount = parseInt(inputField.value);
          if (inputField.value === "") {
            amount = 1;
          }
          if (amount > 0) {
            manufactureQuantity = amount;
            manufacturable = redrawEdges();
            button.setAttribute("fill", manufacturable ? "green" : "red");
          } else {
            inputField.value = "1";
            manufactureQuantity = 1;
            manufacturable = redrawEdges();
            button.setAttribute("fill", manufacturable ? "green" : "red");
          }
        };

        inputField.onchange = inputChangeHandler;
        inputField.onkeyup = inputChangeHandler;

        // Add a close button
        const closeButton = document.createElementNS(ns, "rect");
        closeButton.setAttribute("x", "180");
        closeButton.setAttribute("y", "0");
        closeButton.setAttribute("width", "20");
        closeButton.setAttribute("height", "20");
        closeButton.setAttribute("rx", "5");
        closeButton.setAttribute("ry", "5");
        closeButton.setAttribute("fill", "red");
        closeButton.setAttribute("stroke", "black");
        closeButton.setAttribute("stroke-width", "1");
        manufacturingPopup.appendChild(closeButton);
        const closeButtonText = document.createElementNS(ns, "text");
        closeButtonText.setAttribute("x", "190");
        closeButtonText.setAttribute("y", "10");
        closeButtonText.setAttribute("text-anchor", "middle");
        closeButtonText.setAttribute("alignment-baseline", "middle");
        closeButtonText.setAttribute("font-size", "12");
        closeButtonText.classList.add("unselectable");
        closeButtonText.innerHTML = "X";
        manufacturingPopup.appendChild(closeButtonText);

        const closeHandler = (e) => {
          if (manufacturingPopup) {
            manufacturingTree.removeChild(manufacturingPopup);
            manufacturingPopup = null;
          }
        };

        closeButton.addEventListener("click", closeHandler);
        closeButtonText.addEventListener("click", closeHandler);

        const click = (e) => {
          // Just let the server tell us if we cannot manufacture this
          sendCompositeManufacture(recipe.recipe.name, manufactureQuantity);
        };
        button.addEventListener("click", click);
        buttonText.addEventListener("click", click);

        manufacturingTree.appendChild(manufacturingPopup);
      };

      if (!recipe.isNaturalResource) {
        rect.addEventListener("click", clickHandler);
        text.addEventListener("click", clickHandler);
        amount.addEventListener("click", clickHandler);
      }

      const highlightHandler = (e) => {
        try {
          if (selectedRecipe !== recipe) {
            if (selectedRecipe !== clickedRecipe) {
              if (manufacturingPopup) {
                manufacturingTree.removeChild(manufacturingPopup);
                manufacturingPopup = null;
                manufactureQuantity = 1;
              }
            }
            selectedRecipe = recipe;
            manufacturable = redrawEdges();
          }
        } catch (e) {
          console.error(e);
        }
      };
      rect.addEventListener("mouseover", highlightHandler);
      text.addEventListener("mouseover", highlightHandler);

      for (const child of recipe.below) {
        drawSvgElements(child);
      }
    };

    drawSvgElements(recipeDagRoot);

    const drawnEdges = new Set<RecipeDag>();

    drawEdges(recipeDagRoot);

    // Change the dom update binding to the closure we just created
    redrawInfo = () => {
      if (peekTag() === "manufacturing" && manufacturingPopup) {
        manufacturingTree.removeChild(manufacturingPopup);
        manufacturingPopup = null;
      } else {
        manufacturingPopup = null;
      }
      manufacturable = redrawEdges();
    };
  }
};

export { manufacturingBay, setupManufacturingBay, bindManufacturingUpdaters };
