import { bindPostUpdater, horizontalCenter, pop } from "../dialog";
import { Player } from "../game";
import { inventory, ownId, recipesKnown } from "../globals";
import { sendManufacture } from "../net";
import { maxManufacturable, recipes, recipeDagRoot, RecipeDag, recipesPerLevel } from "../recipes";

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
};

const bindManufacturingUpdaters = () => {
  // bindPostUpdater("inventory", populateManufacturingTable);
};

const drawConnectionSpline = (svg: SVGElement, x1: number, y1: number, x2: number, y2: number, highlight: boolean) => {
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", `M ${x1} ${y1} C ${x1} ${(y1 + y2) / 2} ${x2} ${(y1 + y2) / 2} ${x2} ${y2}`);
  path.setAttribute("stroke", highlight ? "green" : "black");
  path.setAttribute("stroke-width", "1");
  path.setAttribute("fill", "none");
  svg.appendChild(path);
};

const manufacturingBay = () => {
  return horizontalCenter([
    "<h2>Manufacturing Bay</h2>",
    `<div class="manufacturing"><svg id="manufacturingTree" height="1000" width="2000">
  <style>
    rect {
      cursor: pointer;
    }
    text {
      cursor: pointer;
    }
  </style>
  <g>
    <rect x="0" y="0" width="2000" height="1000" fill="#cccccccc" stroke="black" stroke-width="1" />
  </g>
</svg></div>`,
    "<br/>",
    '<button id="closeManufacturingBay">Close</button>',
    "<br/>",
  ]);
};

let selectedRecipe: RecipeDag = undefined

const drawDag = () => {
  const horizontalSpacing = 200;
  const verticalSpacing = 130;
  const ns = "http://www.w3.org/2000/svg";

  const manufacturingTree = document.getElementById("manufacturingTree") as unknown as SVGSVGElement;
  if (manufacturingTree) {
    const coordinates = new Map<RecipeDag, { x: number; y: number }>();
    const alreadyDrawn = new Set<RecipeDag>();
    const drawnPerLevel = new Array(recipeDagRoot.minLevel + 1).fill(0);
    // make a new group
    const nodeGroup = document.createElementNS(ns, "g");

    const marginX = 100;
    const marginY = 0;
    const centerX = manufacturingTree.clientWidth / 2;

    const drawEdges = (recipe: RecipeDag, highlight = false) => {
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
      if (recipe === selectedRecipe) {
        highlight = true;
      }
      for (const child of recipe.below) {
        const { x: x2, y: y2 } = coordinates.get(child)!;
        drawConnectionSpline(edgeGroup, x1 + 50, y1 + 50, x2 + 50, y2, highlight);
        drawEdges(child, highlight);
      }
    };

    const redrawEdges = () => {
      edgeGroup.innerHTML = "";
      drawnEdges.clear();
      drawEdges(recipeDagRoot);
    };

    const drawSvgElements = (recipe: RecipeDag) => {
      if (recipeDagRoot === recipe) {
        for (const child of recipe.below) {
          drawSvgElements(child);
        }
        return;
      }
      if (alreadyDrawn.has(recipe)) {
        return;
      }
      alreadyDrawn.add(recipe);
      const level = recipe.drawLevel;
      const levelOffset = (recipesPerLevel[level] * horizontalSpacing + 100) / 2;
      const x = drawnPerLevel[level] * horizontalSpacing + marginX + centerX - levelOffset;
      const y = (recipeDagRoot.minLevel + 1 - level) * verticalSpacing + marginY;
      console.log("drawing", recipe.recipe?.name, "at", x, y, drawnPerLevel[level]);
      coordinates.set(recipe, { x, y });
      drawnPerLevel[level] += 1;
      const rect = document.createElementNS(ns, "rect");
      rect.setAttribute("x", x.toString());
      rect.setAttribute("y", y.toString());
      rect.setAttribute("width", "100");
      rect.setAttribute("height", "50");
      rect.setAttribute("fill", "white");
      rect.setAttribute("stroke", "black");
      rect.setAttribute("stroke-width", "1");
      nodeGroup.appendChild(rect);
      const text = document.createElementNS(ns, "text");
      text.setAttribute("x", (x + 50).toString());
      text.setAttribute("y", (y + 25).toString());
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("alignment-baseline", "middle");
      text.setAttribute("font-size", "12");
      text.innerHTML = recipe.recipe?.name || "Root";
      nodeGroup.appendChild(text);

      const clickHandler = (e) => {
        console.log("clicked", recipe.recipe?.name);
      }

      rect.addEventListener("click", clickHandler);
      text.addEventListener("click", clickHandler);

      const highlightHandler = (e) => {
        selectedRecipe = recipe;
        redrawEdges();
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
  }
};

export { manufacturingBay, setupManufacturingBay, bindManufacturingUpdaters };
