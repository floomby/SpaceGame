type KeyBindings = {
  up: string;
  down: string;
  left: string;
  right: string;
  primary: string;
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
};

const qwertyBindings: KeyBindings = {
  up: "ArrowUp",
  down: "ArrowDown",
  left: "ArrowLeft",
  right: "ArrowRight",
  primary: " ",
  secondary: "c",
  dock: "v",
  nextTarget: "x",
  previousTarget: "z",
  nextTargetAsteroid: "s",
  previousTargetAsteroid: "a",
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
};

const dvorakBindings: KeyBindings = {
  up: "ArrowUp",
  down: "ArrowDown",
  left: "ArrowLeft",
  right: "ArrowRight",
  primary: " ",
  secondary: "j",
  dock: "k",
  nextTarget: "q",
  previousTarget: ";",
  nextTargetAsteroid: "o",
  previousTargetAsteroid: "a",
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
};

export { KeyBindings, qwertyBindings, dvorakBindings };
