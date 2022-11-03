import { defaultKeyLayout } from "./config";
import { Faction } from "./defs";
import { GlobalState, Player } from "./game";
import { KeyBindings, KeyLayouts, qwertyBindings, useKeybindings } from "./keybindings";

let faction: Faction = Faction.Alliance;

const allianceColor = "rgba(22, 45, 34, 0.341)";
const allianceColorDark = "rgba(22, 45, 34, 0.8)";
const allianceColorOpaque = "aqua";

const confederationColor = "rgba(49, 25, 25, 0.341)";
const confederationColorDark = "rgba(49, 25, 25, 0.8)";
const confederationColorOpaque = "red";

const rogueColor = "rgba(255, 153, 0, 0.341)";
const rogueColorDark = "rgba(255, 153, 0, 0.8)";
const rogueColorOpaque = "darkorange";


const teamColorsLight = [allianceColor, confederationColor, rogueColor];
const teamColorsDark = [allianceColorDark, confederationColorDark, rogueColorDark];
const teamColorsOpaque = [allianceColorOpaque, confederationColorOpaque, rogueColorOpaque];

const setFaction = (newFaction: Faction) => {
  faction = newFaction;
};

const getKeybindPref = () => {
  const layout = localStorage.getItem("layout");
  if (layout !== undefined) {
    return JSON.parse(layout);
  }
  return null;
};

const getVolumePref = () => {
  const volume = localStorage.getItem("volume");
  if (volume) {
    return JSON.parse(volume);
  }
  return null;
};

let keybind = useKeybindings(getKeybindPref() ?? defaultKeyLayout);

const setKeybind = (newKeybind: KeyBindings) => {
  if (newKeybind === qwertyBindings) {
    localStorage.setItem("layout", JSON.stringify(KeyLayouts.Qwerty));
  } else {
    localStorage.setItem("layout", JSON.stringify(KeyLayouts.Dvorak));
  }
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
    collectables: new Map(),
    mines: new Map(),
  };
};

let lastSelf: Player | undefined;

const setLastSelf = (newLastSelf: Player | undefined) => {
  lastSelf = newLastSelf;
};

let inventory: { [key: string]: number } = {};

// ... and we do things the bad, but simple way
const clearInventory = () => {
  inventory = {};
};

export {
  faction,
  setFaction,
  allianceColor,
  confederationColor,
  allianceColorDark,
  confederationColorDark,
  allianceColorOpaque,
  confederationColorOpaque,
  teamColorsLight,
  teamColorsDark,
  teamColorsOpaque,
  rogueColor,
  rogueColorDark,
  rogueColorOpaque,
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
  lastSelf,
  setLastSelf,
  getVolumePref,
  inventory,
  clearInventory,
};
