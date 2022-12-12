import { Asteroid, EffectAnchor, EffectAnchorKind, EffectTrigger, findHeadingBetween, GlobalState, Missile, Player } from "./game";
import { ctx, canvas, effectSprites, sprites } from "./drawing";
import { getSound, play3dSound, playSound, soundMap, soundScale } from "./sound";
import { maxMissileLifetime } from "./defs";
import { Position, Circle, Rectangle } from "./geometry";
import { lastSelf, state } from "./globals";
import { pushExplosionEmitter, pushSmokeEmitter, pushTrailEmitter, pushWarpEmitter } from "./particle";
import { addLightSource, drawLine } from "./3dDrawing";

const resolveAnchor = (anchor: EffectAnchor, state: GlobalState) => {
  // This does not really make sense, I will fix it later though
  if (anchor.kind === EffectAnchorKind.Absolute) {
    return [anchor.value as Position, undefined as Circle];
  }
  if (anchor.kind === EffectAnchorKind.Player) {
    const player = state.players.get(anchor.value as number);
    if (!player) {
      // console.log("Invalid player id during anchor resolution: ", anchor.value);
      return [undefined, undefined];
    }
    return [player.position, player as Player];
  }
  if (anchor.kind === EffectAnchorKind.Asteroid) {
    const asteroid = state.asteroids.get(anchor.value as number);
    if (!asteroid) {
      // console.log("Invalid asteroid id during anchor resolution: ", anchor.value);
      return [undefined, undefined];
    }
    return [asteroid.position, asteroid as Asteroid];
  }
  if (anchor.kind === EffectAnchorKind.Missile) {
    const missile = state.missiles.get(anchor.value as number);
    if (!missile) {
      // console.log("Invalid missile id during anchor resolution: ", anchor.value);
      return [undefined, undefined];
    }
    return [missile.position, missile as Missile];
  }
};

type EffectDefinition = {
  frames: number;
  draw?: (effect: Effect, self: Player, state: GlobalState, framesLeft: number) => void;
  draw3?: (effect: Effect, self: Player, state: GlobalState, framesLeft: number) => void;
  initializer?: () => any;
};

// TODO Move effect definitions to a separate file
const effectDefs: EffectDefinition[] = [];

type EffectSpriteData = {
  sprite: Rectangle;
};

const effectSpriteDefs: EffectSpriteData[] = [];

type Effect = {
  frame: number;
  from: EffectAnchor;
  to?: EffectAnchor;
  definitionIndex: number;
  extra?: any;
};

const drawExplosion = (position: Position, def: EffectDefinition, framesLeft: number, spriteIndex: number) => {
  const scale = 1 - framesLeft / def.frames / 2;
  const sprite = effectSprites[spriteIndex];
  ctx.globalAlpha = 1 - scale;
  ctx.drawImage(
    sprite,
    position.x - (sprite.width / 2) * scale,
    position.y - (sprite.height / 2) * scale,
    sprite.width * scale,
    sprite.height * scale
  );
};

const initEffects = () => {
  // Get the sounds we need
  const explosionSound = getSound("explosion0.wav");
  const launchSound = getSound("launch0.wav");
  const laserSound = getSound("laser0.wav");
  const popSound = getSound("pop0.wav");
  const fireSound = getSound("fire0.wav");
  const miningLaserSound = getSound("laser1.wav");
  const twinkleSound = getSound("twinkle0.wav");
  const pewSound = getSound("dullPew0.wav");
  const disabledSound = getSound("disabled0.wav");
  const mineDropSound = getSound("mineDrop0.wav");
  const plasmaLaunchSound = getSound("squishyPew1.wav");
  const plasmaHitSound = getSound("wigglyThud0.wav");
  const impulseMissileHitSound = getSound("squishyPew0.wav");
  const disruptorLaunchSound = getSound("resonantPew0.wav");
  const tractorSound = getSound("tractor0.wav");

  // Mining laser effect - 0
  effectDefs.push({
    frames: 10,
    draw3: (effect, self, state, framesLeft) => {
      const [from] = resolveAnchor(effect.from, state) as Position[];
      const [to, toCircle] = resolveAnchor(effect.to, state) as [Position, Circle];
      if (!from || !to || !toCircle) {
        return;
      }

      if (self) {
        effect.extra.lastSelfX = self.position.x;
        effect.extra.lastSelfY = self.position.y;
      }

      if (effect.extra.needSound) {
        const midX = ((from as Position).x + (to as Position).x) / 2;
        const midY = ((from as Position).y + (to as Position).y) / 2;
        effect.extra.needSound = false;
        const panner = play3dSound(miningLaserSound, (midX - effect.extra.lastSelfX) / soundScale, (midY - effect.extra.lastSelfY) / soundScale, 0.6);
      }
      drawLine(
        [from.x, from.y],
        [to.x + effect.extra.offset.x * toCircle.radius * 0.8, to.y + effect.extra.offset.y * toCircle.radius * 0.8],
        0.3,
        [0.0, 1.0, 0.0, 1 - framesLeft / 10],
        1
      );
      const halfWay = {
        x: (from.x + to.x + effect.extra.offset.x * toCircle.radius * 0.8) / 2,
        y: (from.y + to.y + effect.extra.offset.y * toCircle.radius * 0.8) / 2,
      };
      addLightSource(halfWay, [0, 2 - framesLeft / 5, 0]);
    },
    initializer: () => {
      const r = Math.sqrt(Math.random());
      const theta = Math.random() * 2 * Math.PI;
      return {
        offset: { x: r * Math.cos(theta), y: r * Math.sin(theta) },
        needSound: true,
      };
    },
  });
  // Laser beam effect - 1
  effectDefs.push({
    frames: 15,
    draw3: (effect, self, state, framesLeft) => {
      const [from] = resolveAnchor(effect.from, state) as Position[];
      let [to, toCircle] = resolveAnchor(effect.to, state) as Position[];
      if (!from || !to) {
        return;
      }

      if (self) {
        effect.extra.lastSelfX = self.position.x;
        effect.extra.lastSelfY = self.position.y;
      }

      if (effect.extra.needSound) {
        const midX = ((from as Position).x + (to as Position).x) / 2;
        const midY = ((from as Position).y + (to as Position).y) / 2;
        effect.extra.needSound = false;
        play3dSound(laserSound, (midX - effect.extra.lastSelfX) / soundScale, (midY - effect.extra.lastSelfY) / soundScale, 0.6);
      }

      drawLine([from.x, from.y], [to.x, to.y], 2, [0.7, 0.2, 0.7, 1 - framesLeft / 15], 1);
      const halfWay = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
      addLightSource(halfWay, [15 - framesLeft, 0, 15 - framesLeft]);
    },
    initializer: () => {
      return { needSound: true };
    },
  });
  // Small explosion (missiles) - 2
  effectDefs.push({
    frames: 15,
    draw3: (effect, self, state, framesLeft) => {
      if (effect.extra.needSound) {
        const from = pushExplosionEmitter(effect.from);
        effect.extra.needSound = false;
        if (from) {
          play3dSound(popSound, (from.x - self.position.x) / soundScale, (from.y - self.position.y) / soundScale);
        }
      }
    },
    initializer: () => {
      return { needSound: true };
    },
  });
  // Medium explosion (ships) - 3
  effectDefs.push({
    frames: 50,
    draw3: (effect, self, state, framesLeft) => {
      if (effect.extra.needSound) {
        const from = pushExplosionEmitter(effect.from, 3);
        effect.extra.needSound = false;
        if (from) {
          play3dSound(explosionSound, (from.x - self.position.x) / soundScale, (from.y - self.position.y) / soundScale);
        }
      }
    },
    initializer: () => {
      return { needSound: true };
    },
  });
  // Large explosion (stations) - 4
  effectDefs.push({
    frames: 50,
    draw3: (effect, self, state, framesLeft) => {
      if (effect.extra.needSound) {
        const from = pushExplosionEmitter(effect.from, 7);
        effect.extra.needSound = false;
        if (from) {
          play3dSound(explosionSound, (from.x - self.position.x) / soundScale, (from.y - self.position.y) / soundScale);
        }
      }
    },
    initializer: () => {
      return { needSound: true };
    },
  });
  // Missile trail - 5
  effectDefs.push({
    frames: maxMissileLifetime,
    draw3: (effect, self, state, framesLeft) => {
      if (effect.extra.needSound) {
        const from = pushSmokeEmitter(effect.from);
        effect.extra.needSound = false;
        if (from) {
          play3dSound(fireSound, (from.x - self.position.x) / soundScale, (from.y - self.position.y) / soundScale);
        }
      }
    },
    initializer: () => {
      return { needSound: true };
    },
  });
  // Missile trail poof - 6
  // OBSOLETE
  effectDefs.push({
    frames: 50,
    draw: (effect, self, state, framesLeft) => {
      const [from] = resolveAnchor(effect.from, state);
      const spriteIdx = 3;
      // const width = effectSprites[spriteIdx].width;
      // const height = effectSprites[spriteIdx].height;
      // V8 profiler says the above lines of code are slow and this is a hot path
      const width = 64;
      const height = 64;
      if (Math.abs((from as Position).x - self.position.x) > canvas.width / 2 + width) {
        return;
      }
      if (Math.abs((from as Position).y - self.position.y) > canvas.height / 2 + height) {
        return;
      }

      ctx.save();
      ctx.translate((from as Position).x - self.position.x + canvas.width / 2, (from as Position).y - self.position.y + canvas.height / 2);
      ctx.rotate(effect.extra.heading);
      drawExplosion({ x: 0, y: 0 }, effectDefs[effect.definitionIndex], framesLeft, spriteIdx);
      ctx.restore();
    },
    initializer: () => {
      return { heading: Math.random() * Math.PI * 2 };
    },
  });
  // Warp effect - 7
  effectDefs.push({
    frames: 10,
    draw3: (effect, self, state, framesLeft) => {
      if (effect.extra.needSound) {
        const from = pushWarpEmitter(effect.from);
        effect.extra.needSound = false;
        play3dSound(twinkleSound, (from.x - self.position.x) / soundScale, (from.y - self.position.y) / soundScale);
      }
    },
    initializer: () => {
      return { needSound: true };
    },
  });
  // Primary pew sound - 8
  effectDefs.push({
    frames: 10,
    draw3: (effect, self, state, framesLeft) => {
      if (effect.extra.needSound) {
        const from = pushTrailEmitter(effect.from);
        effect.extra.needSound = false;
        if (from) {
          play3dSound(pewSound, (from.x - self.position.x) / soundScale, (from.y - self.position.y) / soundScale);
        }
      }
    },
    initializer: () => {
      return { needSound: true };
    },
  });
  // Advanced Mining Laser effect - 9
  effectDefs.push({
    frames: 10,
    draw3: (effect, self, state, framesLeft) => {
      const [from] = resolveAnchor(effect.from, state) as Position[];
      const [to, toCircle] = resolveAnchor(effect.to, state) as [Position, Circle];
      if (!from || !to || !toCircle) {
        return;
      }

      if (self) {
        effect.extra.lastSelfX = self.position.x;
        effect.extra.lastSelfY = self.position.y;
      }

      if (effect.extra.needSound) {
        const midX = ((from as Position).x + (to as Position).x) / 2;
        const midY = ((from as Position).y + (to as Position).y) / 2;
        effect.extra.needSound = false;
        const panner = play3dSound(miningLaserSound, (midX - effect.extra.lastSelfX) / soundScale, (midY - effect.extra.lastSelfY) / soundScale, 0.6);
      }
      drawLine(
        [from.x, from.y],
        [to.x + effect.extra.offset.x * toCircle.radius * 0.8, to.y + effect.extra.offset.y * toCircle.radius * 0.8],
        0.3,
        [0.0, 0.0, 1.0, 1 - framesLeft / 10],
        1
      );
      const halfWay = {
        x: (from.x + to.x + effect.extra.offset.x * toCircle.radius * 0.8) / 2,
        y: (from.y + to.y + effect.extra.offset.y * toCircle.radius * 0.8) / 2,
      };
      addLightSource(halfWay, [0, 0, 2 - framesLeft / 5]);
    },
    initializer: () => {
      const r = Math.sqrt(Math.random());
      const theta = Math.random() * 2 * Math.PI;
      return {
        offset: { x: r * Math.cos(theta), y: r * Math.sin(theta) },
        needSound: true,
      };
    },
  });
  // EMP Missile death effect - 10
  effectDefs.push({
    frames: 15,
    draw: (effect, self, state, framesLeft) => {
      const [from] = resolveAnchor(effect.from, state);

      if (self) {
        effect.extra.lastSelfX = self.position.x;
        effect.extra.lastSelfY = self.position.y;
      }

      if (effect.extra.needSound) {
        effect.extra.needSound = false;
        effect.extra.panner = play3dSound(
          popSound,
          ((from as Position).x - self.position.x) / soundScale,
          ((from as Position).y - self.position.y) / soundScale
        );
      } else if (effect.extra.panner && effect.extra.lastSelfX !== undefined && effect.extra.lastSelfY !== undefined) {
        effect.extra.panner.positionX.value = ((from as Position).x - effect.extra.lastSelfX) / soundScale;
        effect.extra.panner.positionY.value = ((from as Position).y - effect.extra.lastSelfY) / soundScale;
      }

      const spriteIdx = 5;
      const width = effectSprites[spriteIdx].width;
      const height = effectSprites[spriteIdx].height;

      if (Math.abs((from as Position).x - self.position.x) > canvas.width / 2 + width) {
        return;
      }
      if (Math.abs((from as Position).y - self.position.y) > canvas.height / 2 + height) {
        return;
      }

      ctx.save();
      ctx.translate((from as Position).x - self.position.x + canvas.width / 2, (from as Position).y - self.position.y + canvas.height / 2);
      ctx.rotate(effect.extra.heading);
      drawExplosion({ x: 0, y: 0 }, effectDefs[effect.definitionIndex], framesLeft, spriteIdx);
      ctx.restore();
    },
    initializer: () => {
      return { heading: Math.random() * Math.PI * 2, needSound: true };
    },
  });
  // Disabled effect - 11
  effectDefs.push({
    frames: 30,
    draw3: (effect, self, state) => {
      if (effect.extra.needSound) {
        effect.extra.needSound = false;
        playSound(disabledSound);
      }
    },
    initializer: () => {
      return { needSound: true };
    },
  });
  // Mine drop sound - 12
  effectDefs.push({
    frames: 10,
    draw3: (effect, self, state, framesLeft) => {
      const [from] = resolveAnchor(effect.from, state);
      if (!from) {
        return;
      }

      if (effect.extra.needSound) {
        effect.extra.needSound = false;
        play3dSound(mineDropSound, ((from as Position).x - self.position.x) / soundScale, ((from as Position).y - self.position.y) / soundScale);
      }
    },
    initializer: () => {
      return { needSound: true };
    },
  });
  // Plasma Cannon Launch Sound - 13
  effectDefs.push({
    frames: 10,
    draw3: (effect, self, state, framesLeft) => {
      const [from] = resolveAnchor(effect.from, state);
      if (!from) {
        return;
      }

      if (effect.extra.needSound) {
        effect.extra.needSound = false;
        play3dSound(plasmaLaunchSound, ((from as Position).x - self.position.x) / soundScale, ((from as Position).y - self.position.y) / soundScale);
      }
    },
    initializer: () => {
      return { needSound: true };
    },
  });
  // Plasma Cannon Hit - 14
  effectDefs.push({
    frames: 10,
    draw: (effect, self, state, framesLeft) => {
      const [from] = resolveAnchor(effect.from, state);
      if (!from) {
        return;
      }

      if (effect.extra.needSound) {
        effect.extra.needSound = false;
        play3dSound(plasmaHitSound, ((from as Position).x - self.position.x) / soundScale, ((from as Position).y - self.position.y) / soundScale);
      }

      const spriteIdx = 7;
      const width = effectSprites[spriteIdx].width;
      const height = effectSprites[spriteIdx].height;

      if (Math.abs((from as Position).x - self.position.x) > canvas.width / 2 + width) {
        return;
      }
      if (Math.abs((from as Position).y - self.position.y) > canvas.height / 2 + height) {
        return;
      }

      ctx.save();
      ctx.translate((from as Position).x - self.position.x + canvas.width / 2, (from as Position).y - self.position.y + canvas.height / 2);
      ctx.rotate(effect.extra.heading);
      drawExplosion({ x: 0, y: 0 }, effectDefs[effect.definitionIndex], framesLeft, spriteIdx);
      ctx.restore();
    },
    initializer: () => {
      return { heading: Math.random() * 2 * Math.PI, needSound: true };
    },
  });
  // Mine explosion - 15
  effectDefs.push({
    frames: 15,
    draw: (effect, self, state, framesLeft) => {
      const [from] = resolveAnchor(effect.from, state);

      if (self) {
        effect.extra.lastSelfX = self.position.x;
        effect.extra.lastSelfY = self.position.y;
      }

      if (effect.extra.needSound) {
        effect.extra.needSound = false;
        effect.extra.panner = play3dSound(
          popSound,
          ((from as Position).x - self.position.x) / soundScale,
          ((from as Position).y - self.position.y) / soundScale
        );
      } else if (effect.extra.panner && effect.extra.lastSelfX !== undefined && effect.extra.lastSelfY !== undefined) {
        effect.extra.panner.positionX.value = ((from as Position).x - effect.extra.lastSelfX) / soundScale;
        effect.extra.panner.positionY.value = ((from as Position).y - effect.extra.lastSelfY) / soundScale;
      }

      const spriteIdx = 6;
      const width = effectSprites[spriteIdx].width;
      const height = effectSprites[spriteIdx].height;

      if (Math.abs((from as Position).x - self.position.x) > canvas.width / 2 + width) {
        return;
      }
      if (Math.abs((from as Position).y - self.position.y) > canvas.height / 2 + height) {
        return;
      }

      ctx.save();
      ctx.translate((from as Position).x - self.position.x + canvas.width / 2, (from as Position).y - self.position.y + canvas.height / 2);
      ctx.rotate(effect.extra.heading);
      drawExplosion({ x: 0, y: 0 }, effectDefs[effect.definitionIndex], framesLeft, spriteIdx);
      ctx.restore();
    },
    initializer: () => {
      return { heading: Math.random() * Math.PI * 2, needSound: true };
    },
  });
  // Impulse Missile Death Effect - 16
  effectDefs.push({
    frames: 15,
    draw: (effect, self, state, framesLeft) => {
      const [from] = resolveAnchor(effect.from, state);

      if (self) {
        effect.extra.lastSelfX = self.position.x;
        effect.extra.lastSelfY = self.position.y;
      }

      if (effect.extra.needSound) {
        effect.extra.needSound = false;
        effect.extra.panner = play3dSound(
          impulseMissileHitSound,
          ((from as Position).x - self.position.x) / soundScale,
          ((from as Position).y - self.position.y) / soundScale
        );
      } else if (effect.extra.panner && effect.extra.lastSelfX !== undefined && effect.extra.lastSelfY !== undefined) {
        effect.extra.panner.positionX.value = ((from as Position).x - effect.extra.lastSelfX) / soundScale;
        effect.extra.panner.positionY.value = ((from as Position).y - effect.extra.lastSelfY) / soundScale;
      }

      const spriteIdx = 8;
      const width = effectSprites[spriteIdx].width;
      const height = effectSprites[spriteIdx].height;

      if (Math.abs((from as Position).x - self.position.x) > canvas.width / 2 + width) {
        return;
      }
      if (Math.abs((from as Position).y - self.position.y) > canvas.height / 2 + height) {
        return;
      }

      ctx.save();
      ctx.translate((from as Position).x - self.position.x + canvas.width / 2, (from as Position).y - self.position.y + canvas.height / 2);
      ctx.rotate(effect.extra.heading);
      drawExplosion({ x: 0, y: 0 }, effectDefs[effect.definitionIndex], framesLeft, spriteIdx);
      ctx.restore();
    },
    initializer: () => {
      return { heading: Math.random() * Math.PI * 2, needSound: true };
    },
  });
  // Disruptor Launch sound - 17
  effectDefs.push({
    frames: 10,
    draw3: (effect, self, state, framesLeft) => {
      const [from] = resolveAnchor(effect.from, state);
      if (!from) {
        return;
      }

      if (effect.extra.needSound) {
        effect.extra.needSound = false;
        play3dSound(
          disruptorLaunchSound,
          ((from as Position).x - self.position.x) / soundScale,
          ((from as Position).y - self.position.y) / soundScale
        );
      }
    },
    initializer: () => {
      return { needSound: true };
    },
  });
  // Tractor Beam - 18
  effectDefs.push({
    frames: 15,
    draw3: (effect, self, state, framesLeft) => {
      const [from] = resolveAnchor(effect.from, state) as Position[];
      let [to, toCircle] = resolveAnchor(effect.to, state) as Position[];
      if (!from || !to) {
        return;
      }

      if (self) {
        effect.extra.lastSelfX = self.position.x;
        effect.extra.lastSelfY = self.position.y;
      }

      if (effect.extra.needSound) {
        const midX = ((from as Position).x + (to as Position).x) / 2;
        const midY = ((from as Position).y + (to as Position).y) / 2;
        effect.extra.needSound = false;
        play3dSound(tractorSound, (midX - effect.extra.lastSelfX) / soundScale, (midY - effect.extra.lastSelfY) / soundScale, 0.6);
      }

      drawLine([from.x, from.y], [to.x, to.y], 2, [1.0, 0.65, 0.1, framesLeft / 10], 1);
      const halfWay = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
      addLightSource(halfWay, [framesLeft / 5, framesLeft / 8, framesLeft / 50]);
    },
    initializer: () => {
      return { needSound: true };
    },
  });

  // Consult the spreadsheet for understanding where things are on the spritesheet
  effectSpriteDefs.push({
    sprite: { x: 256, y: 64, width: 64, height: 64 },
  });
  effectSpriteDefs.push({
    sprite: { x: 256, y: 128, width: 128, height: 128 },
  });
  effectSpriteDefs.push({
    sprite: { x: 388, y: 0, width: 512, height: 512 },
  });
  effectSpriteDefs.push({
    sprite: { x: 320, y: 0, width: 64, height: 64 },
  });
  effectSpriteDefs.push({
    sprite: { x: 128, y: 0, width: 64, height: 32 },
  });
  effectSpriteDefs.push({
    sprite: { x: 256, y: 576, width: 64, height: 64 },
  });
  effectSpriteDefs.push({
    sprite: { x: 0, y: 800, width: 128, height: 128 },
  });
  effectSpriteDefs.push({
    sprite: { x: 128, y: 800, width: 128, height: 128 },
  });
  effectSpriteDefs.push({
    sprite: { x: 384, y: 512, width: 128, height: 128 },
  });
};

let effects: Effect[] = [];

const applyEffects = (triggers: EffectTrigger[]) => {
  for (const trigger of triggers) {
    if (trigger.effectIndex >= effectDefs.length) {
      console.log("Invalid effect definition index: ", trigger.effectIndex);
      continue;
    }
    const def = effectDefs[trigger.effectIndex];
    effects.push({
      frame: def.frames,
      from: trigger.from,
      to: trigger.to,
      definitionIndex: trigger.effectIndex,
    });
    if (def.initializer) {
      effects[effects.length - 1].extra = def.initializer();
    }
  }
};

const drawEffects = (sixtieths: number) => {
  effects = effects.filter((effect) => effect.frame > 0);

  // The effect culling is done in the draw functions (if we did it here it would be to inflexible)
  for (const effect of effects) {
    effect.frame -= sixtieths;
    if (effect.frame <= 0) {
      continue;
    }
    if (effect.definitionIndex >= effectDefs.length) {
      console.log("Invalid effect definition index: ", effect.definitionIndex);
      effect.frame = 0;
      continue;
    }
    if (
      effect.from !== undefined &&
      effect.from.kind === EffectAnchorKind.Absolute &&
      effect.from.heading !== undefined &&
      effect.from.speed !== undefined
    ) {
      (effect.from.value as Position).x += Math.cos(effect.from.heading) * effect.from.speed * sixtieths;
      (effect.from.value as Position).y += Math.sin(effect.from.heading) * effect.from.speed * sixtieths;
    }
    if (effect.to !== undefined && effect.to.kind === EffectAnchorKind.Absolute && effect.to.heading !== undefined && effect.to.speed !== undefined) {
      (effect.to.value as Position).x += Math.cos(effect.to.heading) * effect.to.speed * sixtieths;
      (effect.to.value as Position).y += Math.sin(effect.to.heading) * effect.to.speed * sixtieths;
    }
    const def = effectDefs[effect.definitionIndex];
    if (def.draw) {
      // def.draw(effect, lastSelf, state, effect.frame);
    }
    if (def.draw3) {
      def.draw3(effect, lastSelf, state, effect.frame);
    }
  }
};

const clearEffects = () => {
  effects.length = 0;
};

export { applyEffects, drawEffects, initEffects, clearEffects, effectSpriteDefs, resolveAnchor };
