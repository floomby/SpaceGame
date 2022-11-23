import { Player } from "./game";

type Position = { x: number; y: number };
type Circle = { position: Position; radius: number };
type Rectangle = { x: number; y: number; width: number; height: number };
type Line = { from: Position; to: Position };

enum CardinalDirection {
  Up,
  Right,
  Down,
  Left,
}

const maxDecimals = (num: number, decimals: number) => {
  const factor = Math.pow(10, decimals);
  return Math.round((num + Number.EPSILON) * factor) / factor;
};

const infinityNorm = (a: Position, b: Position) => {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
};

const l2NormSquared = (a: Position, b: Position) => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
};

const l2Norm = (a: Position, b: Position) => {
  return Math.sqrt(l2NormSquared(a, b));
};

const pointInCircle = (point: Position, circle: Circle) => {
  return l2NormSquared(point, circle.position) < circle.radius * circle.radius;
};

const circlesIntersect = (a: Circle, b: Circle) => {
  return l2NormSquared(a.position, b.position) < (a.radius + b.radius) * (a.radius + b.radius);
};

const positiveMod = (a: number, b: number) => {
  return ((a % b) + b) % b;
};

const findLinesTangentToCircleThroughPoint = (point: Position, circle: Circle) => {
  if (pointInCircle(point, circle)) {
    return undefined;
  }

  const dx = point.x - circle.position.x;
  const dy = point.y - circle.position.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  const theta = Math.atan2(dy, dx);
  const phi = Math.acos(circle.radius / d);
  const ret: Line[] = [];
  ret.push({
    from: point,
    to: {
      x: circle.position.x + circle.radius * Math.cos(theta + phi),
      y: circle.position.y + circle.radius * Math.sin(theta + phi),
    },
  });
  ret.push({
    from: point,
    to: {
      x: circle.position.x + circle.radius * Math.cos(theta - phi),
      y: circle.position.y + circle.radius * Math.sin(theta - phi),
    },
  });
  return ret;
};

const findHeadingBetween = (a: Position, b: Position) => {
  return Math.atan2(b.y - a.y, b.x - a.x);
};

const findLineHeading = (line: Line) => {
  return findHeadingBetween(line.from, line.to);
};

const isAngleBetween = (angle: number, start: number, end: number) => {
  // Normalize the angles
  angle = positiveMod(angle, 2 * Math.PI);
  start = positiveMod(start, 2 * Math.PI);
  end = positiveMod(end, 2 * Math.PI);
  if (start < end) {
    return angle >= start && angle <= end;
  } else {
    return angle >= start || angle <= end;
  }
};

const findSmallAngleBetween = (a: number, b: number) => {
  return positiveMod(b - a + Math.PI, 2 * Math.PI) - Math.PI;
};

const findInterceptAimingHeading = (from: Position, target: Player, projectileSpeed: number, maxRange: number) => {
  const targetHeading = Math.atan2(target.v.y, target.v.x);
  const targetSpeed2 = target.v.x * target.v.x + target.v.y * target.v.y;
  const targetSpeed = Math.sqrt(targetSpeed2);

  const heading = findHeadingBetween(from, target.position);
  const A = Math.PI - heading + targetHeading;

  const a = targetSpeed2 - projectileSpeed * projectileSpeed;
  const b = -2 * Math.cos(A) * targetSpeed * l2Norm(target.position, from);
  const c = l2NormSquared(target.position, from);
  const discriminate = b * b - 4 * a * c;

  const t = (-b - Math.sqrt(discriminate)) / (2 * a);
  const intercept = {
    x: target.position.x + target.v.x * t,
    y: target.position.y + target.v.y * t,
  };
  if (l2NormSquared(from, intercept) > maxRange * maxRange) {
    return undefined;
  }
  const interceptHeading = findHeadingBetween(from, intercept);
  return interceptHeading;
};

const pointInRectangle = (point: Position, rectangle: Rectangle) => {
  return (
    point.x >= rectangle.x &&
    point.x <= rectangle.x + rectangle.width &&
    point.y >= rectangle.y &&
    point.y <= rectangle.y + rectangle.height
  );
};

const pointOutsideRectangle = (point: Position, rectangle: Rectangle) => {
  if (point.x < rectangle.x) {
    return CardinalDirection.Left;
  }
  if (point.x > rectangle.x + rectangle.width) {
    return CardinalDirection.Right;
  }
  if (point.y < rectangle.y) {
    return CardinalDirection.Up;
  }
  if (point.y > rectangle.y + rectangle.height) {
    return CardinalDirection.Down;
  }
  return null;
};

const headingFromCardinalDirection = (direction: CardinalDirection) => {
  switch (direction) {
    case CardinalDirection.Up:
      return 3 * Math.PI / 2;
    case CardinalDirection.Right:
      return 0;
    case CardinalDirection.Down:
      return Math.PI / 2;
    case CardinalDirection.Left:
      return Math.PI;
  }
};

const mirrorAngleHorizontally = (angle: number) => {
  return -angle;
};

const mirrorAngleVertically = (angle: number) => {
  return Math.PI - angle;
};

export {
  Position,
  Circle,
  Rectangle,
  Line,
  CardinalDirection,
  positiveMod,
  maxDecimals,
  infinityNorm,
  l2NormSquared,
  l2Norm,
  pointInCircle,
  circlesIntersect,
  pointInRectangle,
  findLinesTangentToCircleThroughPoint,
  findHeadingBetween,
  findLineHeading,
  isAngleBetween,
  findSmallAngleBetween,
  findInterceptAimingHeading,
  pointOutsideRectangle,
  headingFromCardinalDirection,
  mirrorAngleHorizontally,
  mirrorAngleVertically,
};