import { defs, UnitKind, clientUid } from "./defs";
import { Player } from "./game";

const domFromRest = (query: string, template: (value: string) => string, postCompletion?: () => void) => {
  const id = clientUid();
  const html = `<div id="${id}"></div>`;
  fetch(query)
    .catch((error) => {
      console.error(error);
    })
    .then((response) => {
      if (response && response.ok) {
        return response.json();
      }
    })
    ?.then((data) => {
      if (data.error) {
        console.log("Rest error: " + data.error);
      } else {
        const element = document.getElementById(id.toString());
        if (element) {
          element.innerHTML = template(data.value);
          if (postCompletion) {
            postCompletion();
          }
        }
      }
    });
  return html;
};

const getRestRaw = (query: string, callback: (value: any) => void) => {
  fetch(query)
    .catch((error) => {
      console.error(error);
    })
    .then((response) => {
      if (response && response.ok) {
        return response.json();
      }
    })
    ?.then(callback);
};

const nameMap = new Map<number, string>();
const namesLookedUp = new Set<number>();

// Memoized name lookup from server
const getNameOfPlayer = (player: Player) => {
  const def = defs[player.defIndex];
  if (!player.isPC || def.kind === UnitKind.Station) {
    return undefined
  }
  if (nameMap.has(player.id)) {
    return nameMap.get(player.id);
  }
  if (namesLookedUp.has(player.id)) {
    return undefined;
  }
  namesLookedUp.add(player.id);
  getRestRaw(`/nameOf?id=${player.id}`, (data) => {
    if (data.error) {
      console.log("Rest error: " + data.error);
    } else {
      nameMap.set(player.id, data.value);
    }
  });
  return undefined;
};

export { domFromRest, getRestRaw, getNameOfPlayer };
