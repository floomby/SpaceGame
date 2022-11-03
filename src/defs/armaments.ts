import {
  addCargo,
  Asteroid,
  availableCargoCapacity,
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
import { l2NormSquared, Rectangle } from "../geometry";
import { SlotKind } from "./shipsAndStations";
import { clientUid as uid } from "../defs";
import { asteroidDefs } from "./asteroids";

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
  frameMutator?: (player: Player, slotIndex: number) => void;
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
  hitMutator?: (player: Player, state: GlobalState, applyEffect: (effectTrigger: EffectTrigger) => void) => void;
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
  // Basic mining laser - 5
  armDefs.push({
    name: "Basic mining laser",
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
    cost: 50,
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
    cost: 100,
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
    cost: 100,
  });
  // Advanced mining laser - 10
  armDefs.push({
    name: "Advanced mining laser",
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
    cost: 150,
  });

  missileDefs.push({
    sprite: { x: 96, y: 16, width: 32, height: 16 },
    radius: 10,
    speed: 20,
    damage: 0,
    acceleration: 0.1,
    lifetime: 800,
    deathEffect: 10,
    turnRate: 0.3,
    hitMutator: (player, state, applyEffect) => {
      player.disabled = 600;
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
    explosionEffectIndex: 2,
    explosionMutator(mine, state) {
      // reuse the mine as the circle object for the collision detection for the explosion
      mine.radius = 50;
      const players = findAllPlayersOverlappingCircle(mine, state.players.values());
      for (let i = 0; i < players.length; i++) {
        players[i].health -= 50;
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
    maxAmmo: 10,
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
          left: 600,
          deploying: 30,
        };
        state.mines.set(id, mine);
        whatMutated.mines.push(mine);
        applyEffect({ effectIndex: 12, from: { kind: EffectAnchorKind.Absolute, value: player.position } });
      }
    },
    equipMutator: (player, slotIndex) => {
      player.slotData[slotIndex] = { sinceFired: 1000, ammo: 10 };
    },
    frameMutator: (player, slotIndex) => {
      const slotData = player.slotData[slotIndex];
      slotData.sinceFired++;
    },
    cost: 200,
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

export { ArmUsage, TargetedKind, ArmamentDef, armDefs, armDefMap, missileDefs, mineDefs, maxMissileLifetime, initArmaments };