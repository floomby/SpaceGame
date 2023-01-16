import { EffectTrigger, GlobalState } from "../game"

type DelayedAction = {
  frames: number;
  action: string;
  data: any;
};

const delayedActionDefMap = new Map<string, (state: GlobalState, applyEffect: (trigger: EffectTrigger) => void, data: any) => void>();

delayedActionDefMap.set("emp", (state: GlobalState, applyEffect: (trigger: EffectTrigger) => void, data: any) => {
  applyEffect({ effectIndex: 22 });
  for (const otherPlayer of state.players.values()) {
    if (otherPlayer.id === data) {
      continue;
    }
    otherPlayer.disabled = (otherPlayer.disabled ?? 0) + 1200;
  }
});

export { DelayedAction, delayedActionDefMap };
