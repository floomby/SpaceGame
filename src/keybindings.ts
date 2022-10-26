enum KeyLayouts {
  Qwerty,
  Dvorak,
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
  // warp: string;
  quickTargetClosestEnemy: string;
};

const qwertyBindings: KeyBindings = {
  up: "w",
  down: "s",
  left: "a",
  right: "d",
  // primary: " ",
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
  // warp: "w",
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
  // warp: ",",
  quickTargetClosestEnemy: ".",
};

const useKeybindings = (layout: KeyLayouts) => {
  return layout === KeyLayouts.Qwerty ? qwertyBindings : dvorakBindings;
};

export { KeyBindings, KeyLayouts, qwertyBindings, dvorakBindings, useKeybindings };
