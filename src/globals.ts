import { defaultKeyLayout } from "./config";
import { Faction } from "./defs";
import { GlobalState } from "./game";
import { useKeybindings } from "./keybindings";

let faction: Faction = Faction.Alliance;

const allianceColor = "rgba(22, 45, 34, 0.341)";
const confederationColor = "rgba(49, 25, 25, 0.341)";
const allianceColorDark = "rgba(22, 45, 34, 0.8)";
const confederationColorDark = "rgba(49, 25, 25, 0.8)";

const setFaction = (newFaction: Faction) => {
  faction = newFaction;
};

let keybind = useKeybindings(defaultKeyLayout);

const setKeybind = (newKeybind: typeof keybind) => {
  keybind = newKeybind;
};

// The id that the players ship is
let ownId: number;

const setOwnId = (newOwnId: number) => {
  ownId = newOwnId;
};

let currentSector: number;

const setCurrentSector = (newCurrentSector: number) => {
  currentSector = newCurrentSector;
};

let selectedSecondary = 0;

const setSelectedSecondary = (newSelectedSecondary: number) => {
  selectedSecondary = newSelectedSecondary;
};

let state: GlobalState;

const initBlankState = () => {
  state = {
    players: new Map(),
    projectiles: new Map(),
    asteroids: new Map(),
    missiles: new Map(),
  };
};

export {
  faction,
  setFaction,
  allianceColor,
  confederationColor,
  allianceColorDark,
  confederationColorDark,
  keybind,
  setKeybind,
  ownId,
  setOwnId,
  currentSector,
  setCurrentSector,
  selectedSecondary,
  setSelectedSecondary,
  state,
  initBlankState,
};
