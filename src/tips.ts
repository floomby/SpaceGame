import { keybind } from "./globals";

const tips: (() => string)[] = [];

// prettier-ignore
{
tips.push(() => `You can hold down <kbd>${keybind.dock}</kbd> while approaching a station to dock immediately when you are in range.`);
tips.push(() => `You can use "Spare Parts" to repair disabled stations. This includes enemy stations, which will then become friendly.`);
tips.push(() => `Tier 2 weapons are only available through manufacturing. Keep your eyes peeled for blueprints.`);
tips.push(() => `Ships with greater mass will consume energy more rapidly when cloaked.`);
tips.push(() => `By combining forward motion with strafing you can achieve a slightly greater velocity`);
tips.push(() => `Some ships are cloak optimized. This dramatically reduces their energy consumption while cloaked.`);
tips.push(() => `You can use the <kbd>${keybind.nextTarget}</kbd> and <kbd>${keybind.previousTarget}</kbd> keys to cycle through available targets.`);
tips.push(() => `You can use <ctrl> + <kbd>${keybind.nextTarget}</kbd> and <ctrl> + <kbd>${keybind.previousTarget}</kbd> to cycle through available enemy targets.`);
tips.push(() => `Stations always show up on your scanners even if they exceed your scanner range, but you can only target them if they are within range.`);
tips.push(() => `You can use the <kbd>${keybind.nextTargetAsteroid}</kbd> and <kbd>${keybind.previousTargetAsteroid}</kbd> keys to cycle through available asteroids.`);
tips.push(() => `Right clicking on an asteroid automatically switches your secondary weapon to the mining laser.`);
tips.push(() => `Ues the <kbd>${keybind.quickTargetClosestEnemy}</kbd> key to quickly target the closest enemy. This will also switch your selected secondary away from the mining laser and to a combat weapon if one is equipped.`);
tips.push(() => `You can use the <kbd>${keybind.selectSecondary0}</kbd> through <kbd>${keybind.selectSecondary9}</kbd> keys to change your selected secondary weapon.`);
tips.push(() => `You can use the <kbd>${keybind.map}</kbd> key to open the map.`);
tips.push(() => `You can use the <kbd>${keybind.cargo}</kbd> key to open the cargo screen.`);
tips.push(() => `You can use the <kbd>${keybind.chat}</kbd> key to open the chat.`);
tips.push(() => `By using <ctrl> + <secondary weapon key> you can fire your secondary weapon without switching to it.`);
tips.push(() => `Ships with greater mass are more resistant to being displaced. This renders tractor beams less effective against them.`);
tips.push(() => `Being EMPed will stop warping or cloaking.`);
tips.push(() => `Some weapons are togglable such as the hull regenerator and the cloaking generator. They show as green when active.`);
tips.push(() => `The primary weapons damage is ship dependant. Larger and more advanced ships have more a more powerful primary weapon.`);
tips.push(() => `While your teams mine will not be detonated by you or your allies, they will still damage you if you are nearby when they explode.`);
tips.push(() => `After a sector has been visited for the first time you can freely warp to it`);
tips.push(() => `Specific minerals are only found certain sectors. Look at the sector info on the map to see if what you are seeking is present in a given sector.`);
tips.push(() => `Warping requires energy. If your energy falls too low your warp sequence will be terminated.`);
tips.push(() => `Even armaments that use ammo require a small amount of energy to fire.`);
tips.push(() => `The hull regenerator uses energy to repair your hull, however it aggressively consumes energy. Consider toggling it off if your energy is low.`);
}

export { tips };
