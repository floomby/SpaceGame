import { EffectAnchor, EffectAnchorKind, EffectTrigger, GlobalState, Player, Position } from "./game";
import { ctx, canvas } from "./drawing";

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
  draw: (effect: Effect, self: Player, state: GlobalState) => void;
};

const effectDefs: EffectDefinition[] = [];

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
};

type Effect = {
  frame: number;
  from: EffectAnchor;
  to: EffectAnchor;
  definitionIndex: number;
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
  }
};

const drawEffects = (self: Player, state: GlobalState) => {
  effects = effects.filter((effect) => effect.frame > 0);

  // TODO Culling if the effect is offscreen
  for (const effect of effects) {
    const def = effectDefs[effect.definitionIndex];
    def.draw(effect, self, state);
    effect.frame--;
  }
};

export { applyEffects, drawEffects, initEffects };
