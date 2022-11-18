import { bindPostUpdater, horizontalCenter, peekTag, pop } from "../dialog";
import { Player } from "../game";
import { inventory, ownId, recipesKnown } from "../globals";
import { sendCompositeManufacture, sendManufacture } from "../net";
import {
  maxManufacturable,
  recipes,
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

const manufacturingToolTipText = (index: number, amount: number) => {
  const recipe = recipes[index];
  return (
    `<ul>` +
    Object.keys(recipe.ingredients)
      .map((ingredient) => {
        const required = recipe.ingredients[ingredient] * amount;
        const have = inventory[ingredient] || 0;
        return `<li style="color: ${have >= required ? "green" : "red"};">${ingredient}: ${have} / ${required}</li>`;
      })
      .join("") +
    `</ul>`
  );
};

const manufacturingTableHtml = () => {
  let html = `<table style="width: 100%; text-align: left;">`;
  for (let i = 0; i < recipes.length; i++) {
    if (!recipesKnown.has(recipes[i].name)) {
      continue;
    }
    html += `<tr><td>${recipes[i].name}</td>
<td>${inventory[recipes[i].name] || 0}</td>
<td><input value="1" id="manufactureAmount${i}" style="color: black;"/></td>
<td>/${maxManufacturable(i, inventory)}</td>
<td><div class="tooltip">
  <button id="manufacture${i}">Manufacture</button>
  <span class="bigTooltipText" id="manufacturingTooltip${i}">${manufacturingToolTipText(i, 1)}</span>
<div></td></tr>`;
  }
  html += "</table>";
  return html;
};

const populateManufacturingTable = () => {
  const manufacturingTable = document.getElementById("manufacturingTable");
  if (manufacturingTable) {
    manufacturingTable.innerHTML =
      recipesKnown.size > 0 ? manufacturingTableHtml() : "<h3>No blueprints collected. Kill enemies to find blueprints.<h3>";
  }
  for (let i = 0; i < recipes.length; i++) {
    const button = document.getElementById(`manufacture${i}`) as HTMLButtonElement;
    if (button) {
      const amount = document.getElementById(`manufactureAmount${i}`) as HTMLInputElement;
      if (amount) {
        const value = parseInt(amount.value);
        if (amount.value === "" || isNaN(value) || value <= 0 || value > maxManufacturable(i, inventory)) {
          amount.style.backgroundColor = "#ffaaaa";
          button.disabled = true;
        } else {
          amount.style.backgroundColor = "#aaffaa";
          button.disabled = false;
        }
        amount.addEventListener("keyup", (e) => {
          const value = parseInt(amount.value);
          if (amount.value === "" || isNaN(value) || value <= 0 || value > maxManufacturable(i, inventory)) {
            amount.style.backgroundColor = "#ffaaaa";
            button.disabled = true;
          } else {
            amount.style.backgroundColor = "#aaffaa";
            button.disabled = false;
          }
          if (e.key === "Enter") {
            button.click();
          }
          const tooltip = document.getElementById(`manufacturingTooltip${i}`);
          if (tooltip) {
            if (amount.value !== "" && !isNaN(value) && value >= 0) {
              tooltip.innerHTML = manufacturingToolTipText(i, value);
            }
          }
        });
      }
      button.onclick = () => {
        const value = parseInt(amount.value);
        if (!isNaN(value)) {
          sendManufacture(ownId, recipes[i].name, value);
        }
      };
    }
  }
};

const manufacturingBayOld = () => {
  return horizontalCenter([
    "<h2>Manufacturing Bay</h2>",
    "<br/>",
    "<div id='manufacturingTable'></div>",
    "<br/>",
    '<button id="closeManufacturingBay">Close</button>',
    "<br/>",
  ]);
};

const setupManufacturingBay = () => {
  const closeManufacturingBay = document.getElementById("closeManufacturingBay");
  if (closeManufacturingBay) {
    closeManufacturingBay.onclick = () => {
      pop();
    };
  }
  // populateManufacturingTable();
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
  return `<div id="${what}Filter" class="checkAsText checkAsTextChecked">${what}</div>`;
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
    "<h2>Manufacturing Bay</h2>",
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

const computeTotalRequirements = (currentNode: RecipeDag, values: { [key: string]: number }, multiplier = 1) => {
  for (const ingredient of currentNode.below) {
    if (values[ingredient.recipe.name] === undefined) {
      values[ingredient.recipe.name] = 0;
    }
    values[ingredient.recipe.name] += currentNode.recipe.ingredients[ingredient.recipe.name] * multiplier;
    computeTotalRequirements(ingredient, values, currentNode.recipe.ingredients[ingredient.recipe.name] * multiplier);
  }
};

const computeUsedRequirements = (currentNode: RecipeDag) => {
  const inventoryObject = JSON.parse(JSON.stringify(inventory));
  return computeUsedRequirementsShared(currentNode, inventoryObject, inventory);
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

    const marginX = 100;
    const marginY = 0;
    const centerX = manufacturingTree.clientWidth / 2;

    let manufacturingPopup: SVGElement = undefined;

    // Also populates the amount texts (returns if the selected node is missing resources for manufacturing)
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

    const redrawEdges = () => {
      inventoryUsage = computeUsedRequirements(selectedRecipe);
      clearUnsatisfied();
      for (const resource of naturalResources) {
        if (inventoryUsage.get(resource) > (inventory[resource.recipe.name] || 0)) {
          markUnsatisfied(resource);
        }
      }

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
      const rect = document.createElementNS(ns, "rect");
      rect.setAttribute("x", x.toString());
      rect.setAttribute("y", y.toString());
      rect.setAttribute("width", "100");
      rect.setAttribute("height", "60");
      rect.setAttribute("rx", "10");
      rect.setAttribute("ry", "10");
      rect.setAttribute("fill", "white");
      rect.setAttribute("stroke", "black");
      rect.setAttribute("stroke-width", "1");
      container.appendChild(rect);
      const text = document.createElementNS(ns, "text");
      text.setAttribute("x", (x + 50).toString());
      text.setAttribute("y", (y + 20).toString());
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("alignment-baseline", "middle");
      text.setAttribute("font-size", "12");
      text.innerHTML = recipe.recipe?.name || "Root";
      container.appendChild(text);

      const amount = document.createElementNS(ns, "text");
      amount.setAttribute("x", (x + 50).toString());
      amount.setAttribute("y", (y + 40).toString());
      amount.setAttribute("text-anchor", "middle");
      amount.setAttribute("alignment-baseline", "middle");
      amount.setAttribute("font-size", "12");
      amount.innerHTML = "";
      container.appendChild(amount);

      nodeGroup.appendChild(container);

      const clickHandler = (e) => {
        if (manufacturingPopup) {
          manufacturingTree.removeChild(manufacturingPopup);
          manufacturingPopup = null;
        }
        if (selectedRecipe !== recipe) {
          selectedRecipe = recipe;
          manufacturable = redrawEdges();
        }
        manufacturingPopup = document.createElementNS(ns, "g");
        manufacturingPopup.setAttribute("id", "manufacturingPopup");
        manufacturingPopup.setAttribute("transform", `translate(${x + 100}, ${y})`);
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
        text.innerHTML = recipe.recipe?.name || "Root";
        manufacturingPopup.appendChild(text);
        // Add a manufacturing button
        const button = document.createElementNS(ns, "rect");
        button.setAttribute("x", "50");
        button.setAttribute("y", "40");
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
        buttonText.setAttribute("y", "50");
        buttonText.setAttribute("text-anchor", "middle");
        buttonText.setAttribute("alignment-baseline", "middle");
        buttonText.setAttribute("font-size", "12");
        buttonText.innerHTML = "Manufacture";
        manufacturingPopup.appendChild(buttonText);

        const click = (e) => {
          // if (manufacturable) {
          sendCompositeManufacture(ownId, recipe.recipe.name, 1);
          // }
        };
        button.addEventListener("click", click);
        buttonText.addEventListener("click", click);

        manufacturingTree.appendChild(manufacturingPopup);
      };

      rect.addEventListener("click", clickHandler);
      text.addEventListener("click", clickHandler);
      amount.addEventListener("click", clickHandler);

      const highlightHandler = (e) => {
        try {
          if (selectedRecipe !== recipe) {
            if (selectedRecipe !== clickedRecipe) {
              if (manufacturingPopup) {
                manufacturingTree.removeChild(manufacturingPopup);
                manufacturingPopup = null;
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

    const edgeGroup = document.createElementNS(ns, "g");
    const drawnEdges = new Set<RecipeDag>();

    drawEdges(recipeDagRoot);

    manufacturingTree.appendChild(edgeGroup);
    manufacturingTree.appendChild(nodeGroup);

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
