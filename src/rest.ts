import { defs, UnitKind, clientUid } from "./defs";
import { Player } from "./game";

const restCache = new Map<string, any>();

// This function has a potential race (however it is incredibly unlikely, it would require the rest api to beat the render to the dom)
const domFromRest = (query: string, template: (value: string) => string, postCompletion?: () => void, cache = false) => {
  if ((window as any).restPostCallbacks === undefined) {
    (window as any).restPostCallbacks = new Map<number, () => void>();
  }

  const id = clientUid();
  if (cache) {
    const value = restCache.get(query);
    if (value) {
      if (postCompletion) {
        (window as any).restPostCallbacks.set(id, () => {
          postCompletion();
          (window as any).restPostCallbacks.delete(id);
        });
      }
      return `<div id="${id}">${template(value)}<img src onerror="if(window.restPostCallbacks.has(${id}))window.restPostCallbacks.get(${id})()"></div>`;
    }
  }

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
        if (cache) {
          restCache.set(query, data.value);
        }
        if (element) {
          element.innerHTML = template(data.value);
          if (postCompletion) {
            postCompletion();
          }
        } else {
          console.log("Warning: Unable to update dom (possible race condition: see src/rest.ts)");
        }
      }
    });
  return html;
};

const getRestRaw = (query: string, callback: (value: any) => void, cache = false) => {
  if (cache) {
    if (restCache.has(query)) {
      callback(restCache.get(query));
      return;
    }
  }

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
      if (cache) {
        restCache.set(query, data);
      }
      callback(data);
    });
};

const nameMap = new Map<number, string>();
const namesLookedUp = new Set<number>();

// Memoized name lookup from server for players and stations
const getNameOfPlayer = (player: Player) => {
  const def = defs[player.defIndex];
  if (!player.isPC || def.kind !== UnitKind.Station) {
    return undefined;
  }
  if (nameMap.has(player.id)) {
    return nameMap.get(player.id);
  }
  if (namesLookedUp.has(player.id)) {
    return undefined;
  }
  namesLookedUp.add(player.id);
  getRestRaw(`/${def.kind === UnitKind.Station ? "stationName" : "nameOf"}?id=${player.id}`, (data) => {
    if (data.error) {
      console.log("Rest error: " + data.error);
    } else {
      nameMap.set(player.id, data.value);
    }
  });
  return undefined;
};

export { domFromRest, getRestRaw, getNameOfPlayer };
