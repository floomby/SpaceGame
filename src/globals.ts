import { rasterizePrompts } from "./2dDrawing";
import { allowBackgroundFlash } from "./3dDrawing";
import { defaultKeyLayout } from "./config";
import { Faction } from "./defs";
import { runPostUpdaterOnly, updateDom } from "./dialog";
import { redrawTip } from "./dialogs/dead";
import { ClientFriendRequest, GlobalState, mapSize, Player, SectorInfo, TutorialStage } from "./game";
import { azertyBindings, dvorakBindings, KeyBindings, KeyLayouts, qwertyBindings, useKeybindings } from "./keybindings";
import { getRestRaw } from "./rest";
import { tutorialPrompters } from "./tutorial";

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

const scourgeColor = "rgba(60, 255, 5, 0.431)";
const scourgeColorDark = "rgba(60, 255, 5, 0.8)";
const scourgeColorOpaque = "rgba(60, 255, 5, 1)";

const rgbaToFloatRGB = (rgba: string) => {
  let stripped = rgba.replace("rgba(", "").replace(")", "");
  let [r, g, b] = stripped.split(",").map((x) => parseFloat(x));
  return new Float32Array([r / 255, g / 255, b / 255]);
};

const teamColorsLight = [allianceColor, confederationColor, rogueColor, scourgeColor];
const teamColorsDark = [allianceColorDark, confederationColorDark, rogueColorDark, scourgeColorDark];
const teamColorsOpaque = [allianceColorOpaque, confederationColorOpaque, rogueColorOpaque, scourgeColorOpaque];
const teamColorsFloat = [
  [0 / 255, 255 / 255, 255 / 255],
  [255 / 255, 0 / 255, 0 / 255],
  [255 / 255, 140 / 255, 0 / 255],
  [60 / 255, 255 / 255, 5 / 255,]
];

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

const getMusicVolumePref = () => {
  const volume = localStorage.getItem("musicVolume");
  if (volume) {
    return JSON.parse(volume);
  }
  return null;
};

const getParticlePref = () => {
  const particles = localStorage.getItem("particles");
  if (particles) {
    return JSON.parse(particles);
  }
  return null;
};

const setParticlePref = (newCount: number) => {
  localStorage.setItem("particles", JSON.stringify(newCount));
};

let keybind = useKeybindings(getKeybindPref() ?? defaultKeyLayout);

const setKeybind = (newKeybind: KeyBindings) => {
  if (newKeybind === qwertyBindings) {
    localStorage.setItem("layout", JSON.stringify(KeyLayouts.Qwerty));
  } else if (newKeybind === dvorakBindings) {
    localStorage.setItem("layout", JSON.stringify(KeyLayouts.Dvorak));
  } else if (newKeybind === azertyBindings) {
    localStorage.setItem("layout", JSON.stringify(KeyLayouts.Azerty));
  }
  keybind = newKeybind;
  rasterizePrompts();
  redrawTip();
};

// The id that the players ship is
let ownId: number;

const setOwnId = (newOwnId: number) => {
  ownId = newOwnId;
};

let currentSector: number;

const setCurrentSector = (newCurrentSector: number) => {
  currentSector = newCurrentSector;
  allowBackgroundFlash();
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

let recipesKnown: Set<string> = new Set();

let sectorData = new Map<number, SectorInfo>();

const addLoadingText = (text: string) => {
  document.getElementById("loadingText")!.innerHTML += text + "<br/>";
}

const hideLoadingText = () => {
  document.getElementById("loadingText")!.style.display = "none";
}

let tutorialStage: TutorialStage = TutorialStage.Done;

const setTutorialStage = (newTutorialStage: TutorialStage) => {
  tutorialStage = newTutorialStage;
  const prompter = tutorialPrompters.get(tutorialStage);
  if (prompter) {
    prompter();
  } else {
    console.log("No tutorial prompter for stage " + tutorialStage);
  }
};

const isInMission = () => {
  return tutorialStage === TutorialStage.Done && currentSector >= mapSize * mapSize;
}

let missionComplete = false;

const clearMissionStatus = () => {
  missionComplete = false;
}

const setMissionComplete = () => {
  missionComplete = true;
}

let useAlternativeBackgrounds = false;

const setUseAlternativeBackgrounds = (newUseAlternativeBackgrounds: boolean) => {
  if (newUseAlternativeBackgrounds !== useAlternativeBackgrounds) {
    localStorage.setItem("useAlternativeBackgrounds", JSON.stringify(newUseAlternativeBackgrounds));
    useAlternativeBackgrounds = newUseAlternativeBackgrounds;
  };
};

const getUseAlternativeBackgroundsPref = () => {
  return JSON.parse(localStorage.getItem("useAlternativeBackgrounds") ?? "false");
};

const isFirefox = navigator.userAgent.toLowerCase().indexOf("firefox") > -1;

type ClientFriend = {
  name: string;
  id: number;
};

let friendList: ClientFriend[] = [];

const updateFriendList = () => {
  getRestRaw(`/friendsOf?id=${ownId}`, (friends: ClientFriend[]) => {
    friendList = friends;
    runPostUpdaterOnly("friends", friendList);
  });
};

let friendRequests: ClientFriendRequest[] = [];

const updateFriendRequests = () => {
  getRestRaw(`/activeFriendRequests?id=${ownId}`, (requests: ClientFriendRequest[]) => {
    friendRequests = requests;
    runPostUpdaterOnly("friendRequests", friendRequests);
  });
};

export {
  ClientFriend,
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
  scourgeColor,
  scourgeColorDark,
  scourgeColorOpaque,
  teamColorsFloat,
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
  getMusicVolumePref,
  inventory,
  clearInventory,
  recipesKnown,
  sectorData,
  addLoadingText,
  tutorialStage,
  setTutorialStage,
  hideLoadingText,
  isFirefox,
  getParticlePref,
  setParticlePref,
  useAlternativeBackgrounds,
  setUseAlternativeBackgrounds,
  getUseAlternativeBackgroundsPref,
  isInMission,
  missionComplete,
  clearMissionStatus,
  setMissionComplete,
  updateFriendList,
  friendList,
  updateFriendRequests,
  friendRequests,
};
