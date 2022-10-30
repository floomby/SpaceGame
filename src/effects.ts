import {
  Asteroid,
  Circle,
  EffectAnchor,
  EffectAnchorKind,
  EffectTrigger,
  findHeadingBetween,
  GlobalState,
  infinityNorm,
  Missile,
  Player,
  Position,
  Rectangle,
} from "./game";
import { ctx, canvas, effectSprites } from "./drawing";
import { getSound, play3dSound, playSound, soundMap, soundScale } from "./sound";

const resolveAnchor = (anchor: EffectAnchor, state: GlobalState) => {
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
  draw: (effect: Effect, self: Player, state: GlobalState, framesLeft: number) => void;
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

  // Mining laser effect - 0
  effectDefs.push({
    frames: 10,
    draw: (effect, self, state) => {
      const [from] = resolveAnchor(effect.from, state) as (Position | undefined)[];
      const [to, toCircle] = resolveAnchor(effect.to, state);
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
        // panner.positionZ.value = 10;
      }

      ctx.save();
      ctx.translate(from.x - self.position.x + canvas.width / 2, from.y - self.position.y + canvas.height / 2);
      ctx.filter = "blur(1px)";
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(
        (to as Position).x - from.x + effect.extra.offset.x * (toCircle as Circle).radius,
        (to as Position).y - from.y + effect.extra.offset.y * (toCircle as Circle).radius
      );
      ctx.strokeStyle = "green";
      ctx.stroke();
      ctx.restore();
    },
    initializer: () => {
      return {
        offset: { x: Math.random() - 0.5, y: Math.random() - 0.5 },
        needSound: true,
      };
    },
  });
  // Laser beam effect - 1
  effectDefs.push({
    frames: 15,
    draw: (effect, self, state, framesLeft) => {
      const [from] = resolveAnchor(effect.from, state);
      let [to, toCircle] = resolveAnchor(effect.to, state);
      if (!from || !to) {
        return;
      }

      const heading = findHeadingBetween(from as Position, to as Position);
      if (toCircle) {
        to = {
          x: (to as Position).x - Math.cos(heading) * (toCircle as Circle).radius * 0.9,
          y: (to as Position).y - Math.sin(heading) * (toCircle as Circle).radius * 0.9,
        };
      }

      if (self) {
        effect.extra.lastSelfX = self.position.x;
        effect.extra.lastSelfY = self.position.y;
      }

      if (effect.extra.needSound) {
        const midX = ((from as Position).x + (to as Position).x) / 2;
        const midY = ((from as Position).y + (to as Position).y) / 2;
        effect.extra.needSound = false;
        play3dSound(laserSound, (midX - effect.extra.lastSelfX) / soundScale, (midY - effect.extra.lastSelfY) / soundScale, 0.8);
      }

      const cos = Math.cos(heading);
      const sin = Math.sin(heading);
      const halfBeamWidth = 2.5;
      const offsets = [
        { x: -halfBeamWidth * sin, y: halfBeamWidth * cos },
        { x: halfBeamWidth * sin, y: -halfBeamWidth * cos },
      ];

      const alpha = Math.min(framesLeft / 10, 1);
      const color = `rgba(255, 40, 155, ${alpha})`;

      ctx.save();
      ctx.translate((from as Position).x - self.position.x + canvas.width / 2, (from as Position).y - self.position.y + canvas.height / 2);
      ctx.shadowBlur = 4;
      ctx.shadowColor = "red";
      ctx.beginPath();
      ctx.moveTo((to as Position).x - (from as Position).x + offsets[1].x, (to as Position).y - (from as Position).y + offsets[1].y);
      ctx.moveTo(offsets[1].x, offsets[1].y);
      ctx.arc(0, 0, halfBeamWidth, heading - Math.PI / 2, heading + Math.PI / 2, true);
      ctx.lineTo(offsets[0].x, offsets[0].y);
      ctx.arc(
        (to as Position).x - (from as Position).x,
        (to as Position).y - (from as Position).y,
        halfBeamWidth,
        heading + Math.PI / 2,
        heading - Math.PI / 2,
        true
      );
      ctx.fillStyle = color;
      ctx.fill();

      ctx.filter = "blur(20px)";
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc((to as Position).x - (from as Position).x, (to as Position).y - (from as Position).y, 30, 0, Math.PI * 2);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    },
    initializer: () => {
      return { needSound: true };
    },
  });
  // Small explosion (missiles) - 2
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

      const spriteIdx = 0;
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
  // Medium explosion (ships) - 3
  effectDefs.push({
    frames: 50,
    draw: (effect, self, state, framesLeft) => {
      const [from] = resolveAnchor(effect.from, state);

      if (self) {
        effect.extra.lastSelfX = self.position.x;
        effect.extra.lastSelfY = self.position.y;
      }

      if (effect.extra.needSound) {
        effect.extra.needSound = false;
        effect.extra.panner = play3dSound(
          explosionSound,
          ((from as Position).x - self.position.x) / soundScale,
          ((from as Position).y - self.position.y) / soundScale
        );
      } else if (effect.extra.panner && effect.extra.lastSelfX !== undefined && effect.extra.lastSelfY !== undefined) {
        effect.extra.panner.positionX.value = ((from as Position).x - effect.extra.lastSelfX) / soundScale;
        effect.extra.panner.positionY.value = ((from as Position).y - effect.extra.lastSelfY) / soundScale;
      }

      const spriteIdx = 1;
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
  // Large explosion (stations) - 4
  effectDefs.push({
    frames: 50,
    draw: (effect, self, state, framesLeft) => {
      const [from] = resolveAnchor(effect.from, state);
      if (!from) {
        return;
      }

      if (self) {
        effect.extra.lastSelfX = self.position.x;
        effect.extra.lastSelfY = self.position.y;
      }

      if (effect.extra.needSound) {
        effect.extra.needSound = false;
        effect.extra.panner = play3dSound(
          explosionSound,
          ((from as Position).x - self.position.x) / soundScale,
          ((from as Position).y - self.position.y) / soundScale
        );
      } else if (effect.extra.panner && effect.extra.lastSelfX !== undefined && effect.extra.lastSelfY !== undefined) {
        effect.extra.panner.positionX.value = ((from as Position).x - effect.extra.lastSelfX) / soundScale;
        effect.extra.panner.positionY.value = ((from as Position).y - effect.extra.lastSelfY) / soundScale;
      }

      const spriteIdx = 2;
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
  // Missile trail - 5
  effectDefs.push({
    frames: 1500,
    draw: (effect, self, state, framesLeft) => {
      const [from, fromPlayer] = resolveAnchor(effect.from, state);
      if (!from || !fromPlayer) {
        effect.frame = 0;
        return;
      }
      if (effect.frame > 1400 && effect.extra.needSound) {
        effect.extra.needSound = false;
        play3dSound(fireSound, ((from as Position).x - self.position.x) / soundScale, ((from as Position).y - self.position.y) / soundScale);
      }

      if (effect.frame < effect.extra.lastPoof - 5) {
        effect.extra.lastPoof = effect.frame;
        const heading = (fromPlayer as Missile).heading;
        const speed = (fromPlayer as Missile).speed / 2;
        const trigger = {
          effectIndex: 6,
          from: {
            kind: EffectAnchorKind.Absolute,
            value: {
              x: (from as Position).x + Math.random() * 8 - 4 - Math.cos((fromPlayer as Missile).heading) * 8,
              y: (from as Position).y + Math.random() * 8 - 4 - Math.sin((fromPlayer as Missile).heading) * 8,
            },
            heading,
            speed,
          },
        };
        applyEffects([trigger]);
      }
    },
    initializer: () => {
      return { lastPoof: 1500, needSound: true };
    },
  });
  // Missile trail poof - 6
  effectDefs.push({
    frames: 50,
    draw: (effect, self, state, framesLeft) => {
      const [from] = resolveAnchor(effect.from, state);
      const spriteIdx = 3;
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
      return { heading: Math.random() * Math.PI * 2 };
    },
  });
  // Warp effect - 7
  effectDefs.push({
    frames: 50,
    draw: (effect, self, state, framesLeft) => {
      const [from] = resolveAnchor(effect.from, state);
      if (!from) {
        return;
      }

      if (self) {
        effect.extra.lastSelfX = self.position.x;
        effect.extra.lastSelfY = self.position.y;
      }

      if (effect.extra.needSound) {
        effect.extra.needSound = false;
        effect.extra.panner = play3dSound(
          twinkleSound,
          ((from as Position).x - self.position.x) / soundScale,
          ((from as Position).y - self.position.y) / soundScale
        );
      } else if (effect.extra.panner && effect.extra.lastSelfX !== undefined && effect.extra.lastSelfY !== undefined) {
        effect.extra.panner.positionX.value = ((from as Position).x - effect.extra.lastSelfX) / soundScale;
        effect.extra.panner.positionY.value = ((from as Position).y - effect.extra.lastSelfY) / soundScale;
      }

      const spriteIdx = 4;
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
      ctx.rotate(effect.from.heading);
      drawExplosion({ x: 0, y: 0 }, effectDefs[effect.definitionIndex], framesLeft, spriteIdx);
      ctx.restore();
    },
    initializer: () => {
      return { needSound: true };
    },
  });
  // Primary pew sound - 8
  effectDefs.push({
    frames: 10,
    draw: (effect, self, state, framesLeft) => {
      const [from] = resolveAnchor(effect.from, state);
      if (!from) {
        return;
      }

      if (effect.extra.needSound) {
        effect.extra.needSound = false;
        play3dSound(pewSound, ((from as Position).x - self.position.x) / soundScale, ((from as Position).y - self.position.y) / soundScale);
      }
    },
    initializer: () => {
      return { needSound: true };
    },
  });
  // Advanced mining laser effect - 9
  effectDefs.push({
    frames: 10,
    draw: (effect, self, state) => {
      const [from] = resolveAnchor(effect.from, state) as (Position | undefined)[];
      const [to, toCircle] = resolveAnchor(effect.to, state);
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
        play3dSound(miningLaserSound, (midX - effect.extra.lastSelfX) / soundScale, (midY - effect.extra.lastSelfY) / soundScale, 0.6);        
      }

      ctx.save();
      ctx.translate(from.x - self.position.x + canvas.width / 2, from.y - self.position.y + canvas.height / 2);
      ctx.filter = "blur(1px)";
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(
        (to as Position).x - from.x + effect.extra.offset.x * (toCircle as Circle).radius,
        (to as Position).y - from.y + effect.extra.offset.y * (toCircle as Circle).radius
      );
      ctx.strokeStyle = "blue";
      ctx.stroke();
      ctx.restore();
    },
    initializer: () => {
      return {
        offset: { x: Math.random() - 0.5, y: Math.random() - 0.5 },
        needSound: true,
      };
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

const drawEffects = (self: Player, state: GlobalState, sixtieths: number) => {
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
    if (effect.from.kind === EffectAnchorKind.Absolute && effect.from.heading !== undefined && effect.from.speed !== undefined) {
      (effect.from.value as Position).x += Math.cos(effect.from.heading) * effect.from.speed * sixtieths;
      (effect.from.value as Position).y += Math.sin(effect.from.heading) * effect.from.speed * sixtieths;
    }
    if (effect.to !== undefined && effect.to.kind === EffectAnchorKind.Absolute && effect.to.heading !== undefined && effect.to.speed !== undefined) {
      (effect.to.value as Position).x += Math.cos(effect.to.heading) * effect.to.speed * sixtieths;
      (effect.to.value as Position).y += Math.sin(effect.to.heading) * effect.to.speed * sixtieths;
    }
    const def = effectDefs[effect.definitionIndex];
    def.draw(effect, self, state, effect.frame);
  }
};

const clearEffects = () => {
  effects.length = 0;
};

export { applyEffects, drawEffects, initEffects, clearEffects, effectSpriteDefs };
