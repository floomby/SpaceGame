import {
  addCargo,
  Asteroid,
  availableCargoCapacity,
  CloakedState,
  EffectAnchorKind,
  EffectTrigger,
  findAllPlayersOverlappingCircle,
  GlobalState,
  Mine,
  Missile,
  Mutated,
  Player,
  TargetKind,
} from "../game";
import { findHeadingBetween, l2Norm, l2NormSquared, Position, Rectangle } from "../geometry";
import { defs, SlotKind, UnitKind } from "./shipsAndStations";
import { clientUid as uid } from "../defs";
import { asteroidDefs } from "./asteroids";
import { projectileDefs } from "./projectiles";

enum ArmUsage {
  Empty,
  Energy,
  Ammo,
}

enum TargetedKind {
  Empty,
  Targeted,
  Untargeted,
}

type ArmamentDef = {
  name: string;
  description: string;
  kind: SlotKind;
  usage: ArmUsage;
  targeted: TargetedKind;
  energyCost?: number;
  maxAmmo?: number;
  cost: number;
  stateMutator?: (
    state: GlobalState,
    player: Player,
    targetKind: TargetKind,
    target: Player | Asteroid,
    applyEffect: (trigger: EffectTrigger) => void,
    slotIndex: number,
    flashServerMessage: (id: number, message: string) => void,
    whatMutated: Mutated
  ) => void;
  // effectMutator?: (state: GlobalState, slotIndex: number, player: Player, target: Player | undefined) => void;
  equipMutator?: (player: Player, slotIndex: number) => void;
  // I will change the return type as needed, but right now the only thing that we need is energy gained
  frameMutator?: (player: Player, slotIndex: number, state: GlobalState, flashServerMessage: (id: number, message: string) => void) => void | number;
};

// Idk if this needs a more efficient implementation or not
type MineDef = {
  explosionEffectIndex: number;
  explosionMutator: (mine: Mine, state: GlobalState) => void;
};

type MissileDef = {
  sprite: Rectangle;
  speed: number;
  damage: number;
  radius: number;
  lifetime: number;
  acceleration: number;
  // TODO this should be easier to use (having all these indices is error prone)
  deathEffect: number;
  turnRate?: number;
  hitMutator?: (player: Player, state: GlobalState, applyEffect: (effectTrigger: EffectTrigger) => void, missile: Missile) => void;
};

const armDefs: ArmamentDef[] = [];
const armDefMap = new Map<string, { index: number; def: ArmamentDef }>();

const mineDefs: MineDef[] = [];
const missileDefs: MissileDef[] = [];

let maxMissileLifetime = 0;

const initArmaments = () => {
  // Empty normal slot - 0
  armDefs.push({
    name: "Empty normal slot",
    description: "Empty normal slot (dock with a station to buy armaments)",
    kind: SlotKind.Normal,
    usage: ArmUsage.Empty,
    targeted: TargetedKind.Empty,
    cost: 0,
  });
  // Empty utility slot - 1
  armDefs.push({
    name: "Empty utility slot",
    description: "Empty utility slot (dock with a station to buy armaments)",
    kind: SlotKind.Utility,
    usage: ArmUsage.Empty,
    targeted: TargetedKind.Empty,
    cost: 0,
  });
  // Empty mine slot - 2
  armDefs.push({
    name: "Empty mine slot",
    description: "Empty mine slot (dock with a station to buy armaments)",
    kind: SlotKind.Mine,
    usage: ArmUsage.Empty,
    targeted: TargetedKind.Empty,
    cost: 0,
  });
  // Empty large slot - 3
  armDefs.push({
    name: "Empty large slot",
    description: "Empty large slot (dock with a station to buy armaments)",
    kind: SlotKind.Large,
    usage: ArmUsage.Empty,
    targeted: TargetedKind.Empty,
    cost: 0,
  });
  // Empty mining slot - 4
  armDefs.push({
    name: "Empty mining slot",
    description: "Empty mining slot (dock with a station to buy armaments)",
    kind: SlotKind.Mining,
    usage: ArmUsage.Empty,
    targeted: TargetedKind.Empty,
    cost: 0,
  });
  // Basic Mining Laser - 5
  armDefs.push({
    name: "Basic Mining Laser",
    description: "A low powered mining laser",
    kind: SlotKind.Mining,
    usage: ArmUsage.Energy,
    targeted: TargetedKind.Targeted,
    energyCost: 0.5,
    stateMutator: (state, player, targetKind, target, applyEffect, slotId, flashServerMessage, whatMutated) => {
      if (targetKind === TargetKind.Asteroid && player.energy > 0.3) {
        target = target as Asteroid;
        if (l2NormSquared(player.position, target.position) < 500 * 500) {
          if (availableCargoCapacity(player) <= 0) {
            flashServerMessage(player.id, "Cargo bay full");
            return;
          }
          if (target.resources <= 0) {
            flashServerMessage(player.id, "Asteroid depleted");
            return;
          }
          const asteroidDef = asteroidDefs[target.defIndex];
          let amount = Math.min(target.resources, 1 / asteroidDef.difficulty);
          if (amount < 1) {
            flashServerMessage(player.id, `Mining laser is insufficiently powerful to mine ${asteroidDef.mineral}`);
            return;
          }
          amount = Math.round(amount);
          player.energy -= 0.3;
          whatMutated.asteroids.add(target);
          target.resources -= amount;
          addCargo(player, asteroidDef.mineral, amount);
          applyEffect({
            effectIndex: 0,
            // Fine to just use the reference here
            from: { kind: EffectAnchorKind.Player, value: player.id },
            to: { kind: EffectAnchorKind.Asteroid, value: target.id },
          });
        }
      }
    },
    cost: 0,
  });
  // Laser Beam - 6
  armDefs.push({
    name: "Laser Beam",
    description: "Strong but energy hungry laser beam",
    kind: SlotKind.Normal,
    usage: ArmUsage.Energy,
    targeted: TargetedKind.Targeted,
    energyCost: 35,
    stateMutator: (state, player, targetKind, target, applyEffect, slotIndex) => {
      const slotData = player.slotData[slotIndex];
      if (targetKind === TargetKind.Player && player.energy > 35 && slotData.sinceFired > 45) {
        if ((target as Player).inoperable) {
          return;
        }
        target = target as Player;
        if (l2NormSquared(player.position, target.position) < 700 * 700) {
          player.energy -= 35;
          target.health -= 30;
          slotData.sinceFired = 0;
          const to =
            target.health > 0
              ? { kind: EffectAnchorKind.Player, value: target.id }
              : { kind: EffectAnchorKind.Absolute, value: target.position, heading: target.heading, speed: target.speed };
          applyEffect({
            effectIndex: 1,
            from: { kind: EffectAnchorKind.Player, value: player.id },
            to,
          });
        }
      }
    },
    equipMutator: (player, slotIndex) => {
      player.slotData[slotIndex] = { sinceFired: 46 };
    },
    frameMutator: (player, slotIndex) => {
      const slotData = player.slotData[slotIndex];
      slotData.sinceFired++;
    },
    cost: 100,
  });

  missileDefs.push({
    sprite: { x: 64, y: 0, width: 32, height: 16 },
    radius: 8,
    speed: 15,
    damage: 13,
    acceleration: 0.2,
    lifetime: 600,
    deathEffect: 2,
  });
  const javelinIndex = missileDefs.length - 1;
  // Javelin Missile - 7
  armDefs.push({
    name: "Javelin Missile",
    description: "An quick firing, unguided missile",
    kind: SlotKind.Normal,
    usage: ArmUsage.Ammo,
    targeted: TargetedKind.Untargeted,
    maxAmmo: 50,
    stateMutator: (state, player, targetKind, target, applyEffect, slotId) => {
      const slotData = player.slotData[slotId];
      if (player.energy > 1 && slotData.sinceFired > 25 && slotData.ammo > 0) {
        player.energy -= 1;
        slotData.sinceFired = 0;
        slotData.ammo--;
        const id = uid();
        const missile: Missile = {
          id,
          position: { x: player.position.x, y: player.position.y },
          speed: player.speed + 1,
          heading: player.heading,
          radius: missileDefs[javelinIndex].radius,
          team: player.team,
          damage: missileDefs[javelinIndex].damage,
          target: 0,
          defIndex: javelinIndex,
          lifetime: missileDefs[javelinIndex].lifetime,
        };
        state.missiles.set(id, missile);
      }
    },
    equipMutator: (player, slotIndex) => {
      player.slotData[slotIndex] = { sinceFired: 1000, ammo: 50 };
    },
    frameMutator: (player, slotIndex) => {
      const slotData = player.slotData[slotIndex];
      slotData.sinceFired++;
    },
    cost: 100,
  });

  missileDefs.push({
    sprite: { x: 64, y: 16, width: 32, height: 16 },
    radius: 8,
    speed: 5,
    damage: 150,
    acceleration: 0.2,
    lifetime: 600,
    deathEffect: 2,
  });
  const heavyJavelinIndex = missileDefs.length - 1;
  // Heavy Javelin Missile - 8
  armDefs.push({
    name: "Heavy Javelin Missile",
    description: "A high damage, slow, unguided missile",
    kind: SlotKind.Normal,
    usage: ArmUsage.Ammo,
    targeted: TargetedKind.Untargeted,
    maxAmmo: 20,
    stateMutator: (state, player, targetKind, target, applyEffect, slotId) => {
      const slotData = player.slotData[slotId];
      if (player.energy > 1 && slotData.sinceFired > 45 && slotData.ammo > 0) {
        player.energy -= 1;
        slotData.sinceFired = 0;
        slotData.ammo--;
        const id = uid();
        const missile: Missile = {
          id,
          position: { x: player.position.x, y: player.position.y },
          speed: player.speed + 1,
          heading: player.heading,
          radius: missileDefs[heavyJavelinIndex].radius,
          team: player.team,
          damage: missileDefs[heavyJavelinIndex].damage,
          target: 0,
          defIndex: heavyJavelinIndex,
          lifetime: missileDefs[heavyJavelinIndex].lifetime,
        };
        state.missiles.set(id, missile);
      }
    },
    equipMutator: (player, slotIndex) => {
      player.slotData[slotIndex] = { sinceFired: 1000, ammo: 20 };
    },
    frameMutator: (player, slotIndex) => {
      const slotData = player.slotData[slotIndex];
      slotData.sinceFired++;
    },
    cost: 800,
  });

  missileDefs.push({
    sprite: { x: 96, y: 0, width: 32, height: 16 },
    radius: 8,
    speed: 15,
    damage: 10,
    acceleration: 0.2,
    lifetime: 600,
    deathEffect: 2,
    turnRate: 0.1,
  });
  const tomahawkIndex = missileDefs.length - 1;
  // Tomahawk Missile - 9
  armDefs.push({
    name: "Tomahawk Missile",
    description: "A guided missile",
    kind: SlotKind.Normal,
    usage: ArmUsage.Ammo,
    targeted: TargetedKind.Targeted,
    maxAmmo: 30,
    stateMutator: (state, player, targetKind, target, applyEffect, slotId) => {
      const slotData = player.slotData[slotId];
      if (player.energy > 1 && slotData.sinceFired > 45 && slotData.ammo > 0 && targetKind === TargetKind.Player && target) {
        if ((target as Player).inoperable) {
          return;
        }
        player.energy -= 1;
        slotData.sinceFired = 0;
        slotData.ammo--;
        const id = uid();
        const missile: Missile = {
          id,
          position: { x: player.position.x, y: player.position.y },
          speed: player.speed + 1,
          heading: player.heading,
          radius: missileDefs[tomahawkIndex].radius,
          team: player.team,
          damage: missileDefs[tomahawkIndex].damage,
          target: target.id,
          defIndex: tomahawkIndex,
          lifetime: missileDefs[tomahawkIndex].lifetime,
        };
        state.missiles.set(id, missile);
      }
    },
    equipMutator: (player, slotIndex) => {
      player.slotData[slotIndex] = { sinceFired: 1000, ammo: 30 };
    },
    frameMutator: (player, slotIndex) => {
      const slotData = player.slotData[slotIndex];
      slotData.sinceFired++;
    },
    cost: 200,
  });
  // Advanced Mining Laser - 10
  armDefs.push({
    name: "Advanced Mining Laser",
    description: "A high powered mining laser",
    kind: SlotKind.Mining,
    usage: ArmUsage.Energy,
    targeted: TargetedKind.Targeted,
    energyCost: 0.5,
    stateMutator: (state, player, targetKind, target, applyEffect, slotId, flashServerMessage, whatMutated) => {
      if (targetKind === TargetKind.Asteroid && player.energy > 0.8) {
        target = target as Asteroid;
        if (l2NormSquared(player.position, target.position) < 800 * 800) {
          if (availableCargoCapacity(player) <= 0) {
            flashServerMessage(player.id, "Cargo bay full");
            return;
          }
          if (target.resources <= 0) {
            flashServerMessage(player.id, "Asteroid depleted");
            return;
          }
          const asteroidDef = asteroidDefs[target.defIndex];
          let amount = Math.min(target.resources, 3.5 / asteroidDef.difficulty);
          if (amount < 1) {
            flashServerMessage(player.id, `Mining laser is insufficiently powerful to mine ${asteroidDef.mineral}`);
            return;
          }
          amount = Math.round(amount);
          whatMutated.asteroids.add(target);
          player.energy -= 0.8;
          target.resources -= amount;
          addCargo(player, asteroidDef.mineral, amount);
          applyEffect({
            effectIndex: 9,
            from: { kind: EffectAnchorKind.Player, value: player.id },
            to: { kind: EffectAnchorKind.Asteroid, value: target.id },
          });
        }
      }
    },
    cost: 250,
  });

  missileDefs.push({
    sprite: { x: 96, y: 16, width: 32, height: 16 },
    radius: 10,
    speed: 20,
    damage: 0,
    acceleration: 0.1,
    lifetime: 800,
    deathEffect: 10,
    turnRate: 0.1,
    hitMutator: (player, state, applyEffect) => {
      player.disabled = 240;
    },
  });
  const empMissileIndex = missileDefs.length - 1;
  // EMP Missile - 9
  armDefs.push({
    name: "EMP Missile",
    description: "A guided emp missile which disables enemy systems and has a long reload time",
    kind: SlotKind.Normal,
    usage: ArmUsage.Ammo,
    targeted: TargetedKind.Targeted,
    maxAmmo: 4,
    stateMutator: (state, player, targetKind, target, applyEffect, slotId) => {
      const slotData = player.slotData[slotId];
      if (player.energy > 1 && slotData.sinceFired > 300 && slotData.ammo > 0 && targetKind === TargetKind.Player && target) {
        if ((target as Player).inoperable) {
          return;
        }
        player.energy -= 1;
        slotData.sinceFired = 0;
        slotData.ammo--;
        const id = uid();
        const missile: Missile = {
          id,
          position: { x: player.position.x, y: player.position.y },
          speed: player.speed + 1,
          heading: player.heading,
          radius: missileDefs[empMissileIndex].radius,
          team: player.team,
          damage: missileDefs[empMissileIndex].damage,
          target: target.id,
          defIndex: empMissileIndex,
          lifetime: missileDefs[empMissileIndex].lifetime,
        };
        state.missiles.set(id, missile);
      }
    },
    equipMutator: (player, slotIndex) => {
      player.slotData[slotIndex] = { sinceFired: 1000, ammo: 4 };
    },
    frameMutator: (player, slotIndex) => {
      const slotData = player.slotData[slotIndex];
      slotData.sinceFired++;
    },
    cost: 1200,
  });

  mineDefs.push({
    explosionEffectIndex: 15,
    explosionMutator(mine, state) {
      // reuse the mine as the circle object for the collision detection for the explosion
      mine.radius = 50;
      const players = findAllPlayersOverlappingCircle(mine, state.players.values());
      for (let i = 0; i < players.length; i++) {
        players[i].health -= 80;
      }
    },
  });
  const proximityMineIndex = mineDefs.length - 1;
  // Proximity Mine - 11
  armDefs.push({
    name: "Proximity Mine",
    description: "A quick deploying proximity mine",
    kind: SlotKind.Mine,
    usage: ArmUsage.Ammo,
    targeted: TargetedKind.Untargeted,
    maxAmmo: 50,
    stateMutator: (state, player, targetKind, target, applyEffect, slotId, flashServerMessage, whatMutated) => {
      const slotData = player.slotData[slotId];
      if (player.energy > 1 && slotData.sinceFired > 33 && slotData.ammo > 0) {
        player.energy -= 1;
        slotData.sinceFired = 0;
        slotData.ammo--;
        const id = uid();
        const mine: Mine = {
          id,
          position: { x: player.position.x, y: player.position.y },
          speed: 0,
          heading: Math.random() * 2 * Math.PI,
          radius: 15,
          team: player.team,
          defIndex: proximityMineIndex,
          left: 1400,
          deploying: 30,
        };
        state.mines.set(id, mine);
        whatMutated.mines.push(mine);
        applyEffect({ effectIndex: 12, from: { kind: EffectAnchorKind.Absolute, value: player.position } });
      }
    },
    equipMutator: (player, slotIndex) => {
      player.slotData[slotIndex] = { sinceFired: 1000, ammo: 50 };
    },
    frameMutator: (player, slotIndex) => {
      const slotData = player.slotData[slotIndex];
      slotData.sinceFired++;
    },
    cost: 200,
  });

  // Plasma Cannon - 12
  armDefs.push({
    name: "Plasma Cannon",
    description: "A rapid firing, forward facing cannon which fires twin plasma bolts",
    kind: SlotKind.Normal,
    usage: ArmUsage.Energy,
    targeted: TargetedKind.Untargeted,
    energyCost: 15,
    stateMutator: (state, player, targetKind, target, applyEffect, slotId) => {
      const slotData = player.slotData[slotId];
      if (player.energy > 15 && slotData.sinceFired > 10) {
        player.energy -= 15;
        slotData.sinceFired = 0;
        const cos = Math.cos(player.heading);
        const sin = Math.sin(player.heading);
        const hardPoints: Position[] = [
          { x: player.position.x - 10 * sin, y: player.position.y + 10 * cos },
          { x: player.position.x + 10 * sin, y: player.position.y - 10 * cos },
        ];
        const projectileDef = projectileDefs[1];
        for (let i = 0; i < hardPoints.length; i++) {
          const projectile = {
            position: hardPoints[i],
            radius: projectileDef.radius,
            speed: projectileDef.speed + player.speed,
            heading: player.heading,
            damage: 20,
            team: player.team,
            id: state.projectileId,
            parent: player.id,
            frameTillEXpire: projectileDef.framesToExpire,
            idx: 1,
          };
          state.projectiles.set(state.projectileId, projectile);
          state.projectileId++;
        }
        applyEffect({ effectIndex: projectileDef.fireEffect, from: { kind: EffectAnchorKind.Absolute, value: player.position } });
      }
    },
    equipMutator: (player, slotIndex) => {
      player.slotData[slotIndex] = { sinceFired: 1000 };
    },
    frameMutator: (player, slotIndex) => {
      const slotData = player.slotData[slotIndex];
      slotData.sinceFired++;
    },
    cost: 1500,
  });

  // Cloaking Generator - 13
  armDefs.push({
    name: "Cloaking Generator",
    description: "A cloaking generator which renders the ship invisible to enemy sensors",
    kind: SlotKind.Utility,
    usage: ArmUsage.Energy,
    targeted: TargetedKind.Untargeted,
    // Thirty cloaking energy plus the 10 for cloaking energy margin
    energyCost: 40,
    stateMutator: (state, player, targetKind, target, applyEffect, slotId) => {
      const slotData = player.slotData[slotId];
      if (slotData.sinceFired > 60) {
        if (player.cloak === 0) {
          player.cloak = 1;
        } else {
          player.cloak = 0;
        }
      }
    },
    equipMutator: (player, slotIndex) => {
      player.cloak = 0;
      player.slotData[slotIndex] = { sinceFired: 1000 };
    },
    // NOTE right now you can equip and use multiple cloaking generators to get faster cloaking (probably fine to leave it like this)
    frameMutator: (player, slotIndex) => {
      if (player.cloak > CloakedState.Uncloaked && player.cloak < CloakedState.Cloaked) {
        player.cloak++;
        // Make cloaking take energy
        // This works out to 30 energy being drained during the cloaking process
        player.energy = Math.max(0, player.energy - 10 / CloakedState.Cloaked);
      }
      const slotData = player.slotData[slotIndex];
      if (slotData.sinceFired === undefined) {
        slotData.sinceFired = 1000;
      }
      slotData.sinceFired++;
      if (player.energy < 10) {
        player.cloak = CloakedState.Uncloaked;
      }
      if (player.cloak) {
        const def = defs[player.defIndex];
        if (def.isCloaky) {
          player.energy = Math.max(0, player.energy - 0.0006 * def.mass);
        } else {
          player.energy = Math.max(0, player.energy - 0.006 * def.mass);
        }
      }
      slotData.active = !!player.cloak;
    },
    cost: 2000,
  });

  // Impulse Missile - 14
  missileDefs.push({
    sprite: { x: 192, y: 0, width: 32, height: 16 },
    radius: 11,
    speed: 30,
    damage: 0,
    acceleration: 0.3,
    lifetime: 300,
    deathEffect: 16,
    turnRate: 0.2,
    hitMutator: (player, state, applyEffect, missile) => {
      missile.radius = 110;
      const players = findAllPlayersOverlappingCircle(missile, state.players.values());
      for (let i = 0; i < players.length; i++) {
        const def = defs[players[i].defIndex];
        if (def.kind === UnitKind.Station) {
          continue;
        }
        const heading = findHeadingBetween(missile.position, players[i].position);
        const dist = Math.max(l2Norm(missile.position, players[i].position) - player.radius, 11);
        const impulse = 2500 / dist / def.mass;
        players[i].iv.x += impulse * Math.cos(heading);
        players[i].iv.y += impulse * Math.sin(heading);
        players[i].ir += Math.random() * 0.09;
      }
    },
  });
  const impulseMissileIndex = missileDefs.length - 1;
  armDefs.push({
    name: "Impulse Missile",
    description: "A guided missile you can use to knock around your enemies",
    kind: SlotKind.Utility,
    usage: ArmUsage.Ammo,
    targeted: TargetedKind.Targeted,
    maxAmmo: 30,
    stateMutator: (state, player, targetKind, target, applyEffect, slotId) => {
      const slotData = player.slotData[slotId];
      if (player.energy > 1 && slotData.sinceFired > 30 && slotData.ammo > 0 && targetKind === TargetKind.Player && target) {
        if ((target as Player).inoperable) {
          return;
        }
        player.energy -= 1;
        slotData.sinceFired = 0;
        slotData.ammo--;
        const id = uid();
        const missile: Missile = {
          id,
          position: { x: player.position.x, y: player.position.y },
          speed: player.speed + 1,
          heading: player.heading,
          radius: missileDefs[impulseMissileIndex].radius,
          team: player.team,
          damage: missileDefs[impulseMissileIndex].damage,
          target: target.id,
          defIndex: impulseMissileIndex,
          lifetime: missileDefs[impulseMissileIndex].lifetime,
        };
        state.missiles.set(id, missile);
      }
    },
    equipMutator: (player, slotIndex) => {
      player.slotData[slotIndex] = { sinceFired: 1000, ammo: 30 };
    },
    frameMutator: (player, slotIndex) => {
      const slotData = player.slotData[slotIndex];
      slotData.sinceFired++;
    },
    cost: 300,
  });

  // Hull Regenerator - 15
  armDefs.push({
    name: "Hull Regenerator",
    description: "Uses energy to rapidly regenerate a ships hull",
    kind: SlotKind.Utility,
    usage: ArmUsage.Energy,
    targeted: TargetedKind.Untargeted,
    energyCost: 0.3,
    stateMutator: (state, player, targetKind, target, applyEffect, slotId) => {
      const slotData = player.slotData[slotId];
      if (slotData.sinceFired > 60) {
        slotData.active = !slotData.active;
      }
    },
    equipMutator: (player, slotIndex) => {
      player.slotData[slotIndex] = { active: false, sinceFired: 1000 };
    },
    frameMutator: (player, slotIndex) => {
      const slotData = player.slotData[slotIndex];
      const def = defs[player.defIndex];
      if (slotData.active) {
        if (player.energy > 0.3 && player.health < def.health) {
          player.health = Math.min(def.health, player.health + 0.3);
          player.energy -= 0.3;
        }
      }
    },
    cost: 500,
  });

  // Disruptor - 16
  const disruptorTimes = [5, 5, 5, 40];
  armDefs.push({
    name: "Disruptor Cannon",
    description: "Fires projectiles that reduce the enemy's energy",
    kind: SlotKind.Normal,
    usage: ArmUsage.Energy,
    targeted: TargetedKind.Untargeted,
    energyCost: 8,
    stateMutator: (state, player, targetKind, target, applyEffect, slotId) => {
      const slotData = player.slotData[slotId];
      if (slotData.sinceFired > disruptorTimes[disruptorTimes.length - 1]) {
        slotData.idx = 0;
      }
      const time = disruptorTimes[slotData.idx];
      if (player.energy > 8 && slotData.sinceFired > time) {
        slotData.idx = (slotData.idx + 1) % disruptorTimes.length;
        player.energy -= 8;
        slotData.sinceFired = 0;
        const cos = Math.cos(player.heading);
        const sin = Math.sin(player.heading);
        const projectileDef = projectileDefs[2];

        const projectile = {
          position: {
            x: player.position.x + cos * 0.8 * player.radius,
            y: player.position.y + sin * 0.8 * player.radius,
          },
          radius: projectileDef.radius,
          speed: projectileDef.speed + player.speed,
          heading: player.heading,
          damage: 20,
          team: player.team,
          id: state.projectileId,
          parent: player.id,
          frameTillEXpire: projectileDef.framesToExpire,
          idx: 2,
        };
        state.projectiles.set(state.projectileId++, projectile);
        state.projectileId++;
        applyEffect({ effectIndex: projectileDef.fireEffect, from: { kind: EffectAnchorKind.Absolute, value: player.position } });
      }
    },
    equipMutator: (player, slotIndex) => {
      player.slotData[slotIndex] = { sinceFired: 1000, idx: 0 };
    },
    frameMutator: (player, slotIndex) => {
      const slotData = player.slotData[slotIndex];
      slotData.sinceFired++;
    },
    cost: 1500,
  });

  // Shotgun - 17
  armDefs.push({
    name: "Shotgun",
    description: "A gun that shoots in a wide direction",
    kind: SlotKind.Normal,
    usage: ArmUsage.Energy,
    energyCost: 11,
    targeted: TargetedKind.Untargeted,
    stateMutator: (state, player, targetKind, target, applyEffect, slotIndex) => {
      const slotData = player.slotData[slotIndex];
      const projectileDef = projectileDefs[0];

      if (player.energy > 11 && slotData.sinceFired > 25) {
        slotData.sinceFired = 0;
        player.energy -= 11;

        for (let i = 0; i < 10; i++) {
          const projectile = {
            position: { x: player.position.x, y: player.position.y },
            radius: projectileDef.radius,
            speed: projectileDef.speed + player.speed,
            heading: player.heading + (i - 5) * 0.15,
            damage: 20,
            team: player.team,
            id: state.projectileId,
            parent: player.id,
            frameTillEXpire: projectileDef.framesToExpire,
            idx: 0,
          };
          state.projectiles.set(state.projectileId, projectile);
          state.projectileId++;
        }
      }
      applyEffect({ effectIndex: projectileDef.fireEffect, from: { kind: EffectAnchorKind.Absolute, value: player.position } });
    },
    equipMutator: (player, slotIndex) => {
      player.slotData[slotIndex] = { sinceFired: 26 };
    },
    frameMutator: (player, slotIndex) => {
      const slotData = player.slotData[slotIndex];
      slotData.sinceFired++;
    },
    cost: 1300,
  });

  // Tractor Beam - 18
  armDefs.push({
    name: "Tractor Beam",
    description: "A beam that stops the movement of your target",
    kind: SlotKind.Utility,
    usage: ArmUsage.Energy,
    targeted: TargetedKind.Targeted,
    energyCost: 15,
    stateMutator: (state, player, targetKind, target, applyEffect, slotIndex, flashServerMessage, whatMutated) => {
      const slotData = player.slotData[slotIndex];

      if (targetKind === TargetKind.Player && player.energy > 15 && slotData.sinceFired > 10 && l2Norm(player.position, target.position) < 1200) {
        const targetDef = defs[target.defIndex];
        if (targetDef.kind === UnitKind.Station) {
          return;
        }
        slotData.sinceFired = 0;
        applyEffect({
          effectIndex: 18,
          from: { kind: EffectAnchorKind.Player, value: player.id },
          to: { kind: EffectAnchorKind.Player, value: target.id },
        });

        slotData.targets.push({ time: 30, id: target.id });
        player.energy -= 15;
      }
    },
    equipMutator: (player, slotIndex) => {
      player.slotData[slotIndex] = { sinceFired: 46, targets: [] };
    },
    frameMutator: (player, slotIndex, state) => {
      const slotData = player.slotData[slotIndex];
      slotData.sinceFired++;
      for (let i = 0; i < slotData.targets.length; i++) {
        const target = state.players.get(slotData.targets[i].id);
        if (!target || slotData.targets[i].time < 0) {
          slotData.targets.splice(i, 1);
          i--;
        } else {
          slotData.targets[i].time--;
          const mass = defs[target.defIndex].mass;
          const heading = findHeadingBetween(player.position, target.position);
          target.speed = Math.max(0, target.speed - 8 / mass);
          target.side = Math.max(0, Math.abs(target.side) - 3 / mass) * Math.sign(target.side);
          target.iv.x -= (Math.cos(heading) * 4) / mass;
          target.iv.y -= (Math.sin(heading) * 4) / mass;
        }
      }
    },
    cost: 1000,
  });

  // Energy Cell - 19
  armDefs.push({
    name: "Energy Cell",
    description: "Disposable energy cells boost your ships energy production for a short time",
    kind: SlotKind.Utility,
    usage: ArmUsage.Ammo,
    targeted: TargetedKind.Untargeted,
    maxAmmo: 3,
    stateMutator: (state, player, targetKind, target, applyEffect, slotIndex, flashServerMessage, whatMutated) => {
      const slotData = player.slotData[slotIndex];
      if (slotData.active) {
        return;
      }
      if (slotData.ammo > 0) {
        slotData.ammo--;
        slotData.active = 900;
      }
    },
    frameMutator: (player, slotIndex, state, flashServerMessage) => {
      const slotData = player.slotData[slotIndex];
      if (slotData.active) {
        const def = defs[player.defIndex];
        slotData.active--;
        player.energy = Math.min(def.energy, player.energy + 0.4);
        if (slotData.active === 0) {
          flashServerMessage(player.id, "Energy cell depleted!");
        }
        return 0.4;
      }
    },
    equipMutator: (player, slotIndex) => {
      player.slotData[slotIndex] = { ammo: 3, active: 0 };
    },
    cost: 400,
  });

  for (let i = 0; i < armDefs.length; i++) {
    const def = armDefs[i];
    armDefMap.set(def.name, { index: i, def });
  }

  for (let i = 0; i < missileDefs.length; i++) {
    if (missileDefs[i].lifetime > maxMissileLifetime) {
      maxMissileLifetime = missileDefs[i].lifetime;
    }
  }
};

const isFreeArm = (name: string) => {
  const armDef = armDefMap.get(name);
  return armDef && armDef.def.cost === 0;
};

const isEmptySlot = (armIndex: number) => {
  return armIndex < 5;
};

const hasArm = (player: Player, name: string) => {
  const armDef = armDefMap.get(name);
  if (!armDef) {
    return false;
  }
  for (let i = 0; i < player.arms.length; i++) {
    if (player.arms[i] === armDef.index) {
      return true;
    }
  }
  return false;
};

export {
  ArmUsage,
  TargetedKind,
  ArmamentDef,
  armDefs,
  armDefMap,
  missileDefs,
  mineDefs,
  maxMissileLifetime,
  initArmaments,
  isFreeArm,
  isEmptySlot,
  hasArm,
};
