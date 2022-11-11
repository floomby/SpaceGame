import { defs } from "./defs";
import { Entity, Input, Player } from "./game";
import {
  Circle,
  findHeadingBetween,
  findLineHeading,
  findLinesTangentToCircleThroughPoint,
  isAngleBetween,
  l2Norm,
  pointInCircle,
  Position,
  positiveMod,
} from "./geometry";

const seek = (entity: Entity, target: Entity, maxTurn: number) => {
  const heading = findHeadingBetween(entity.position, target.position);
  let diff = heading - entity.heading;
  diff = positiveMod(diff, 2 * Math.PI);
  if (diff > Math.PI) {
    diff -= 2 * Math.PI;
  }
  if (Math.abs(diff) < maxTurn) {
    entity.heading = heading;
  } else if (diff > 0) {
    entity.heading += maxTurn;
  } else {
    entity.heading -= maxTurn;
  }
};

const seekPosition = (player: Player, position: Position, input: Input) => {
  const heading = findHeadingBetween(player.position, position);
  let headingMod = positiveMod(heading - player.heading, 2 * Math.PI);
  if (headingMod > Math.PI) {
    headingMod -= 2 * Math.PI;
  }
  if (headingMod > 0) {
    input.right = true;
    input.left = false;
  } else if (headingMod < 0) {
    input.left = true;
    input.right = false;
  } else {
    input.left = false;
    input.right = false;
  }
  input.up = true;
  input.down = false;
};

// Does not use angle
const arrivePosition = (player: Player, position: Position, input: Input, epsilon = 10) => {
  const def = defs[player.defIndex];
  const heading = findHeadingBetween(player.position, position);
  let headingMod = positiveMod(heading - player.heading, 2 * Math.PI);
  if (headingMod > Math.PI) {
    headingMod -= 2 * Math.PI;
  }

  const distance = l2Norm(player.position, position);

  let targetSpeed: number;
  if (distance > def.brakeDistance!) {
    targetSpeed = def.speed;
  } else {
    targetSpeed = (def.speed * distance) / def.brakeDistance!;
  }

  if (headingMod > 0 && player.speed > 0) {
    input.right = true;
    input.left = false;
  } else if (headingMod < 0 && player.speed > 0) {
    input.left = true;
    input.right = false;
  } else {
    input.left = false;
    input.right = false;
  }

  if (distance < epsilon && player.speed < (def.speed * distance) / (def.brakeDistance! + epsilon)) {
    if (player.speed > 0) {
      input.down = true;
      input.up = false;
      return false;
    } else {
      input.down = false;
      input.up = false;
      return true;
    }
  }

  if (player.speed === targetSpeed) {
    input.up = false;
    input.down = false;
  } else if (player.speed < targetSpeed) {
    input.up = true;
    input.down = false;
  } else {
    input.up = false;
    input.down = true;
  }
  return false;
};

const stopPlayer = (player: Player, input: Input, stopRotation = true) => {
  input.up = false;
  if (player.speed > 0) {
    input.down = true;
  } else {
    input.down = false;
  }
  if (stopRotation) {
    input.left = false;
    input.right = false;
  }
};

// This function is not exactly optimal
const currentlyFacing = (entity: Entity, circle: Circle) => {
  if (pointInCircle(entity.position, circle)) {
    return true;
  }
  const lines = findLinesTangentToCircleThroughPoint(entity.position, circle)!;
  const heading = entity.heading;
  const angleA = findLineHeading(lines[0]);
  const angleB = findLineHeading(lines[1]);
  const diff = positiveMod(angleA - angleB, 2 * Math.PI);
  if (diff > Math.PI) {
    return isAngleBetween(heading, angleA, angleB);
  } else {
    return isAngleBetween(heading, angleB, angleA);
  }
};

// This is a faster version that should work most of the time
// THIS IS BROKEN
const currentlyFacingApprox = (entity: Entity, circle: Circle) => {
  if (pointInCircle(entity.position, circle)) {
    return true;
  }
  const distance = l2Norm(entity.position, circle.position);
  const heading = findHeadingBetween(entity.position, circle.position);
  const arcLength = Math.abs(entity.heading - heading) * distance;
  return arcLength < circle.radius;
};

export { seek, seekPosition, arrivePosition, stopPlayer, currentlyFacing };
