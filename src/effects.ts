import { Circle, EffectAnchor, EffectAnchorKind, EffectTrigger, findHeadingBetween, GlobalState, Player, Position, Rectangle } from "./game";
import { ctx, canvas, effectSprites } from "./drawing";

const resolveAnchor = (anchor: EffectAnchor, state: GlobalState) => {
  if (anchor.kind === EffectAnchorKind.Absolute) {
    return [anchor.value as Position, undefined as Circle];
  }
  if (anchor.kind === EffectAnchorKind.Player) {
    const player = state.players.get(anchor.value as number);
    if (!player) {
      console.log("Invalid player id during anchor resolution: ", anchor.value);
      return [undefined, undefined];
    }
    return [player.position, player as Circle];
  }
  if (anchor.kind === EffectAnchorKind.Asteroid) {
    const asteroid = state.asteroids.get(anchor.value as number);
    if (!asteroid) {
      console.log("Invalid asteroid id during anchor resolution: ", anchor.value);
      return [undefined, undefined];
    }
    return [asteroid.position, asteroid as Circle];
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
  const scale = 1 - framesLeft / def.frames;
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
  effectDefs.push({
    frames: 10,
    draw: (effect, self, state) => {
      const [from] = resolveAnchor(effect.from, state) as (Position | undefined)[];
      const [to, toCircle] = resolveAnchor(effect.to, state);
      if (!from || !to || !toCircle) {
        return;
      }

      ctx.save();
      ctx.translate(from.x - self.position.x + canvas.width / 2, from.y - self.position.y + canvas.height / 2);
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
      };
    },
  });
  effectDefs.push({
    frames: 15,
    draw: (effect, self, state, framesLeft) => {
      const [from] = resolveAnchor(effect.from, state);
      let [to, toCircle] = resolveAnchor(effect.to, state);
      if (!from || !to || !toCircle) {
        return;
      }

      const heading = findHeadingBetween(from as Position, to as Position);
      to = {
        x: (to as Position).x - Math.cos(heading) * (toCircle as Circle).radius * 0.9,
        y: (to as Position).y - Math.sin(heading) * (toCircle as Circle).radius * 0.9,
      };

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
      ctx.moveTo(to.x - (from as Position).x + offsets[1].x, to.y - (from as Position).y + offsets[1].y);
      ctx.moveTo(offsets[1].x, offsets[1].y);
      ctx.arc(0, 0, halfBeamWidth, heading - Math.PI / 2, heading + Math.PI / 2, true);
      ctx.lineTo(offsets[0].x, offsets[0].y);
      ctx.arc(to.x - (from as Position).x, to.y - (from as Position).y, halfBeamWidth, heading + Math.PI / 2, heading - Math.PI / 2, true);
      ctx.fillStyle = color;
      ctx.fill();

      ctx.filter = "blur(20px)";
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(to.x - (from as Position).x, to.y - (from as Position).y, 30, 0, Math.PI * 2);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    },
  });
  effectDefs.push({
    frames: 15,
    draw: (effect, self, state, framesLeft) => {
      const [from] = resolveAnchor(effect.from, state);
      ctx.save();
      ctx.translate((from as Position).x - self.position.x + canvas.width / 2, (from as Position).y - self.position.y + canvas.height / 2);
      ctx.rotate(effect.extra.heading);
      drawExplosion({ x: 0, y: 0 }, effectDefs[effect.definitionIndex], framesLeft, 0);
      ctx.restore();
    },
    initializer: () => {
      return { heading: Math.random() * Math.PI * 2 };
    },
  });
  effectDefs.push({
    frames: 50,
    draw: (effect, self, state, framesLeft) => {
      const [from] = resolveAnchor(effect.from, state);
      ctx.save();
      ctx.translate((from as Position).x - self.position.x + canvas.width / 2, (from as Position).y - self.position.y + canvas.height / 2);
      ctx.rotate(effect.extra.heading);
      drawExplosion({ x: 0, y: 0 }, effectDefs[effect.definitionIndex], framesLeft, 1);
      ctx.restore();
    },
    initializer: () => {
      return { heading: Math.random() * Math.PI * 2 };
    },
  });

  effectSpriteDefs.push({
    sprite: { x: 256, y: 64, width: 64, height: 64 },
  });
  effectSpriteDefs.push({
    sprite: { x: 256, y: 128, width: 128, height: 128 },
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

  // TODO Culling if the effect is offscreen
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
    if (effect.to.kind === EffectAnchorKind.Absolute && effect.to.heading !== undefined && effect.to.speed !== undefined) {
      (effect.to.value as Position).x += Math.cos(effect.to.heading) * effect.to.speed * sixtieths;
      (effect.to.value as Position).y += Math.sin(effect.to.heading) * effect.to.speed * sixtieths;
    }
    const def = effectDefs[effect.definitionIndex];
    def.draw(effect, self, state, effect.frame);
  }
};

export { applyEffects, drawEffects, initEffects, effectSpriteDefs };
