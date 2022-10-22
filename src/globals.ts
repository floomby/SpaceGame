import { defaultKeyLayout } from "./config";
import { Faction } from "./defs";
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
let me: number;

const setMe = (newMe: number) => {
  me = newMe;
};

let respawnKey = 0;

const setRespawnKey = (newRespawnKey: number) => {
  respawnKey = newRespawnKey;
};

let currentSector: number;

const setCurrentSector = (newCurrentSector: number) => {
  currentSector = newCurrentSector;
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
  me,
  setMe,
  respawnKey,
  setRespawnKey,
  currentSector,
  setCurrentSector,
};
