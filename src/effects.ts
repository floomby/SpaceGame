import { EffectAnchor, EffectAnchorKind, EffectTrigger, findHeadingBetween, GlobalState, Player, Position, Rectangle } from "./game";
import { ctx, canvas, effectSprites } from "./drawing";

const resolveAnchor = (anchor: EffectAnchor, state: GlobalState) => {
  if (anchor.kind === EffectAnchorKind.Absolute) {
    return anchor.value as Position;
  }
  if (anchor.kind === EffectAnchorKind.Player) {
    const player = state.players.get(anchor.value as number);
    if (!player) {
      console.log("Invalid player id during anchor resolution: ", anchor.value);
      return undefined;
    }
    return player.position;
  }
  if (anchor.kind === EffectAnchorKind.Asteroid) {
    const asteroid = state.asteroids.get(anchor.value as number);
    if (!asteroid) {
      console.log("Invalid asteroid id during anchor resolution: ", anchor.value);
      return undefined;
    }
    return asteroid.position;
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
      const from = resolveAnchor(effect.from, state);
      const to = resolveAnchor(effect.to, state);
      if (!from || !to) {
        return;
      }
      ctx.save();
      ctx.translate(from.x - self.position.x + canvas.width / 2, from.y - self.position.y + canvas.height / 2);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(to.x - from.x, to.y - from.y);
      ctx.strokeStyle = "green";
      ctx.stroke();
      ctx.restore();
    },
  });
  effectDefs.push({
    frames: 15,
    draw: (effect, self, state, framesLeft) => {
      const from = resolveAnchor(effect.from, state);
      const to = resolveAnchor(effect.to, state);
      if (!from || !to) {
        return;
      }
      const heading = findHeadingBetween(from, to);
      const cos = Math.cos(heading);
      const sin = Math.sin(heading);
      const halfBeamWidth = 2.5;
      const offsets = [
        { x: -halfBeamWidth * sin, y: halfBeamWidth * cos },
        { x: halfBeamWidth * sin, y: -halfBeamWidth * cos },
      ];

      const color = `rgba(255, 40, 155, ${Math.min(framesLeft / 10, 1)})`;

      ctx.save();
      ctx.translate(from.x - self.position.x + canvas.width / 2, from.y - self.position.y + canvas.height / 2);
      ctx.shadowBlur = 30;
      ctx.shadowColor = color;
      ctx.beginPath();
      ctx.moveTo(to.x - from.x + offsets[1].x, to.y - from.y + offsets[1].y);
      ctx.moveTo(offsets[1].x, offsets[1].y);
      ctx.arc(0, 0, halfBeamWidth, heading - Math.PI / 2, heading + Math.PI / 2, true);
      ctx.lineTo(offsets[0].x, offsets[0].y);
      ctx.arc(to.x - from.x, to.y - from.y, halfBeamWidth, heading + Math.PI / 2, heading - Math.PI / 2, true);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.restore();
    },
  });
  effectDefs.push({
    frames: 15,
    draw: (effect, self, state, framesLeft) => {
      const from = resolveAnchor(effect.from, state);
      ctx.save();
      ctx.translate(from.x - self.position.x + canvas.width / 2, from.y - self.position.y + canvas.height / 2);
      ctx.rotate(effect.extra.heading);
      drawExplosion({ x: 0, y: 0 }, effectDefs[effect.definitionIndex], framesLeft, 0);
      ctx.restore();
    },
    initializer: () => {
      return { heading: Math.random() * Math.PI * 2 };
    },
  });

  effectSpriteDefs.push({
    sprite: { x: 256, y: 64, width: 64, height: 64 },
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

const drawEffects = (self: Player, state: GlobalState) => {
  effects = effects.filter((effect) => effect.frame > 0);

  // TODO Culling if the effect is offscreen
  for (const effect of effects) {
    const def = effectDefs[effect.definitionIndex];
    def.draw(effect, self, state, effect.frame);
    effect.frame--;
  }
};

export { applyEffects, drawEffects, initEffects, effectSpriteDefs };
