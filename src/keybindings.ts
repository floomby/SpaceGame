enum KeyLayouts {
  Qwerty,
  Dvorak,
  Azerty,
}

type KeyBindings = {
  up: string;
  down: string;
  left: string;
  right: string;
  secondary: string;
  dock: string;
  nextTarget: string;
  previousTarget: string;
  nextTargetAsteroid: string;
  previousTargetAsteroid: string;
  selectSecondary0: string;
  selectSecondary1: string;
  selectSecondary2: string;
  selectSecondary3: string;
  selectSecondary4: string;
  selectSecondary5: string;
  selectSecondary6: string;
  selectSecondary7: string;
  selectSecondary8: string;
  selectSecondary9: string;
  chat: string;
  map: string;
  cargo: string;
  // warp: string;
  quickTargetClosestEnemy: string;
};

const qwertyBindings: KeyBindings = {
  up: "w",
  down: "s",
  left: "a",
  right: "d",
  secondary: " ",
  dock: "r",
  nextTarget: "x",
  previousTarget: "z",
  nextTargetAsteroid: "v",
  previousTargetAsteroid: "c",
  selectSecondary0: "0",
  selectSecondary1: "1",
  selectSecondary2: "2",
  selectSecondary3: "3",
  selectSecondary4: "4",
  selectSecondary5: "5",
  selectSecondary6: "6",
  selectSecondary7: "7",
  selectSecondary8: "8",
  selectSecondary9: "9",
  chat: "Enter",
  map: "m",
  cargo: "q",
  quickTargetClosestEnemy: "e",
};

const dvorakBindings: KeyBindings = {
  up: ",",
  down: "o",
  left: "a",
  right: "e",
  secondary: " ",
  dock: "p",
  nextTarget: "q",
  previousTarget: ";",
  nextTargetAsteroid: "k",
  previousTargetAsteroid: "j",
  selectSecondary0: "0",
  selectSecondary1: "1",
  selectSecondary2: "2",
  selectSecondary3: "3",
  selectSecondary4: "4",
  selectSecondary5: "5",
  selectSecondary6: "6",
  selectSecondary7: "7",
  selectSecondary8: "8",
  selectSecondary9: "9",
  chat: "Enter",
  map: "m",
  cargo: "'",
  quickTargetClosestEnemy: ".",
};

const azertyBindings: KeyBindings = {
  up: "z",
  down: "s",
  left: "q",
  right: "d",
  secondary: " ",
  dock: "r",
  nextTarget: "x",
  previousTarget: "w",
  nextTargetAsteroid: "v",
  previousTargetAsteroid: "c",
  selectSecondary0: "0",
  selectSecondary1: "1",
  selectSecondary2: "2",
  selectSecondary3: "3",
  selectSecondary4: "4",
  selectSecondary5: "5",
  selectSecondary6: "6",
  selectSecondary7: "7",
  selectSecondary8: "8",
  selectSecondary9: "9",
  chat: "Enter",
  map: ",",
  cargo: "a",
  quickTargetClosestEnemy: "e",
};


const useKeybindings = (layout: KeyLayouts) => {
  switch (layout) {
    case KeyLayouts.Qwerty:
      return qwertyBindings;
    case KeyLayouts.Dvorak:
      return dvorakBindings;
    case KeyLayouts.Azerty:
      return azertyBindings;
    default:
      throw new Error("Unknown key layout " + layout);
  }
};

export { KeyBindings, KeyLayouts, qwertyBindings, dvorakBindings, azertyBindings, useKeybindings };
