"use strict";
exports.__esModule = true;
exports.getFactionString = exports.initDefs = exports.missileDefs = exports.armDefMap = exports.armDefs = exports.asteroidDefs = exports.defMap = exports.defs = exports.TargetedKind = exports.ArmUsage = exports.EmptySlot = exports.Faction = exports.SlotKind = exports.UnitKind = void 0;
var game_1 = require("../src/game");
var Faction;
(function (Faction) {
    Faction[Faction["Alliance"] = 0] = "Alliance";
    Faction[Faction["Confederation"] = 1] = "Confederation";
})(Faction || (Faction = {}));
exports.Faction = Faction;
var getFactionString = function (faction) {
    switch (faction) {
        case Faction.Alliance:
            return "Alliance";
        case Faction.Confederation:
            return "Confederation";
    }
};
exports.getFactionString = getFactionString;
var UnitKind;
(function (UnitKind) {
    UnitKind[UnitKind["Ship"] = 0] = "Ship";
    UnitKind[UnitKind["Station"] = 1] = "Station";
})(UnitKind || (UnitKind = {}));
exports.UnitKind = UnitKind;
var SlotKind;
(function (SlotKind) {
    SlotKind[SlotKind["Normal"] = 0] = "Normal";
    SlotKind[SlotKind["Utility"] = 1] = "Utility";
    SlotKind[SlotKind["Mine"] = 2] = "Mine";
    SlotKind[SlotKind["Large"] = 3] = "Large";
    SlotKind[SlotKind["Mining"] = 4] = "Mining";
})(SlotKind || (SlotKind = {}));
exports.SlotKind = SlotKind;
var ArmUsage;
(function (ArmUsage) {
    ArmUsage[ArmUsage["Empty"] = 0] = "Empty";
    ArmUsage[ArmUsage["Energy"] = 1] = "Energy";
    ArmUsage[ArmUsage["Ammo"] = 2] = "Ammo";
})(ArmUsage || (ArmUsage = {}));
exports.ArmUsage = ArmUsage;
var TargetedKind;
(function (TargetedKind) {
    TargetedKind[TargetedKind["Empty"] = 0] = "Empty";
    TargetedKind[TargetedKind["Targeted"] = 1] = "Targeted";
    TargetedKind[TargetedKind["Untargeted"] = 2] = "Untargeted";
})(TargetedKind || (TargetedKind = {}));
exports.TargetedKind = TargetedKind;
var defs = [];
exports.defs = defs;
var defMap = new Map();
exports.defMap = defMap;
var armDefs = [];
exports.armDefs = armDefs;
var armDefMap = new Map();
exports.armDefMap = armDefMap;
var asteroidDefs = [];
exports.asteroidDefs = asteroidDefs;
var missileDefs = [];
exports.missileDefs = missileDefs;
var initDefs = function () {
    defs.push({
        name: "Fighter",
        description: "A basic fighter",
        sprite: { x: 0, y: 0, width: 32, height: 32 },
        health: 100,
        speed: 10,
        energy: 100,
        energyRegen: 0.1,
        primaryReloadTime: 20,
        primaryDamage: 10,
        team: 0,
        radius: 16,
        kind: UnitKind.Ship,
        slots: [SlotKind.Mining, SlotKind.Normal],
        cargoCapacity: 100,
        deathEffect: 3
    });
    defs.push({
        name: "Drone",
        description: "A basic drone",
        sprite: { x: 32, y: 0, width: 32, height: 32 },
        health: 100,
        speed: 10,
        energy: 100,
        energyRegen: 0.1,
        primaryReloadTime: 20,
        primaryDamage: 10,
        team: 1,
        radius: 16,
        kind: UnitKind.Ship,
        slots: [SlotKind.Mining, SlotKind.Normal],
        cargoCapacity: 100,
        deathEffect: 3
    });
    defs.push({
        name: "Alliance Starbase",
        description: "Alliance starbase",
        sprite: { x: 0, y: 32, width: 256, height: 256 },
        health: 1000,
        speed: 0,
        energy: 1000,
        energyRegen: 0.5,
        primaryReloadTime: 10,
        primaryDamage: 15,
        team: 0,
        radius: 120,
        kind: UnitKind.Station,
        hardpoints: [
            { x: -86, y: -70 },
            { x: -86, y: 70 },
            { x: 86, y: -70 },
            { x: 86, y: 70 },
        ],
        dockable: true,
        slots: [],
        deathEffect: 4
    });
    defs.push({
        name: "Confederacy Starbase",
        description: "Confederacy starbase",
        sprite: { x: 0, y: 288, width: 256, height: 256 },
        health: 1000,
        speed: 0,
        energy: 1100,
        energyRegen: 0.5,
        primaryReloadTime: 10,
        primaryDamage: 15,
        team: 1,
        radius: 144,
        kind: UnitKind.Station,
        hardpoints: [
            { x: -93, y: -93 },
            { x: -93, y: 93 },
            { x: 93, y: -93 },
            { x: 93, y: 93 },
        ],
        dockable: true,
        slots: [],
        deathEffect: 4
    });
    for (var i = 0; i < defs.length; i++) {
        var def = defs[i];
        defMap.set(def.name, { index: i, def: def });
    }
    var missileIndex = 0;
    armDefs.push({
        name: "Empty normal slot",
        description: "Empty normal slot (dock with a station to buy armaments)",
        kind: SlotKind.Normal,
        usage: ArmUsage.Empty,
        targeted: TargetedKind.Empty,
        cost: 0
    });
    armDefs.push({
        name: "Empty utility slot",
        description: "Empty utility slot (dock with a station to buy armaments)",
        kind: SlotKind.Utility,
        usage: ArmUsage.Empty,
        targeted: TargetedKind.Empty,
        cost: 0
    });
    armDefs.push({
        name: "Empty mine slot",
        description: "Empty mine slot (dock with a station to buy armaments)",
        kind: SlotKind.Mine,
        usage: ArmUsage.Empty,
        targeted: TargetedKind.Empty,
        cost: 0
    });
    armDefs.push({
        name: "Empty large slot",
        description: "Empty large slot (dock with a station to buy armaments)",
        kind: SlotKind.Large,
        usage: ArmUsage.Empty,
        targeted: TargetedKind.Empty,
        cost: 0
    });
    armDefs.push({
        name: "Empty mining slot",
        description: "Empty mining slot (dock with a station to buy armaments)",
        kind: SlotKind.Mining,
        usage: ArmUsage.Empty,
        targeted: TargetedKind.Empty,
        cost: 0
    });
    armDefs.push({
        name: "Basic mining laser",
        description: "A low powered mining laser",
        kind: SlotKind.Mining,
        usage: ArmUsage.Energy,
        targeted: TargetedKind.Targeted,
        energyCost: 0.5,
        stateMutator: function (state, player, targetKind, target, applyEffect, slotId) {
            if (targetKind === game_1.TargetKind.Asteroid && player.energy > 0.5) {
                target = target;
                if (target.resources > 0 && (0, game_1.l2NormSquared)(player.position, target.position) < 500 * 500 && (0, game_1.availableCargoCapacity)(player) > 0) {
                    player.energy -= 0.3;
                    var amount = Math.min(target.resources, 0.5);
                    target.resources -= amount;
                    (0, game_1.addCargo)(player, "Minerals", amount);
                    applyEffect({
                        effectIndex: 0,
                        // Fine to just use the reference here
                        from: { kind: game_1.EffectAnchorKind.Player, value: player.id },
                        to: { kind: game_1.EffectAnchorKind.Asteroid, value: target.id }
                    });
                }
            }
        },
        cost: 50
    });
    armDefs.push({
        name: "Laser Beam",
        description: "Strong but energy hungry laser beam",
        kind: SlotKind.Normal,
        usage: ArmUsage.Energy,
        targeted: TargetedKind.Targeted,
        energyCost: 35,
        stateMutator: function (state, player, targetKind, target, applyEffect, slotIndex) {
            var slotData = player.slotData[slotIndex];
            if (targetKind === game_1.TargetKind.Player && player.energy > 35 && slotData.sinceFired > 45) {
                target = target;
                if ((0, game_1.l2NormSquared)(player.position, target.position) < 700 * 700) {
                    player.energy -= 35;
                    target.health -= 30;
                    slotData.sinceFired = 0;
                    applyEffect({
                        effectIndex: 1,
                        from: { kind: game_1.EffectAnchorKind.Player, value: player.id },
                        to: { kind: game_1.EffectAnchorKind.Player, value: target.id }
                    });
                }
            }
        },
        equipMutator: function (player, slotIndex) {
            player.slotData[slotIndex] = { sinceFired: 46 };
        },
        frameMutator: function (player, slotIndex) {
            var slotData = player.slotData[slotIndex];
            slotData.sinceFired++;
        },
        cost: 100
    });
    armDefs.push({
        name: "Javelin Missile",
        description: "An unguided missile",
        kind: SlotKind.Normal,
        usage: ArmUsage.Ammo,
        targeted: TargetedKind.Untargeted,
        maxAmmo: 30,
        missileIndex: missileIndex++,
        stateMutator: function (state, player, targetKind, target, applyEffect, slotId) {
            var slotData = player.slotData[slotId];
            if (player.energy > 1 && slotData.sinceFired > 45 && slotData.ammo > 0) {
                player.energy -= 1;
                slotData.sinceFired = 0;
                slotData.ammo--;
                var id = (0, game_1.uid)();
                var def = defs[player.definitionIndex];
                var missile = {
                    id: id,
                    position: { x: player.position.x, y: player.position.y },
                    speed: player.speed + 1,
                    heading: player.heading,
                    radius: 8,
                    team: def.team,
                    damage: 10,
                    target: 0,
                    definitionIndex: missileIndex - 1,
                    lifetime: 600
                };
                state.missiles.set(id, missile);
            }
        },
        equipMutator: function (player, slotIndex) {
            player.slotData[slotIndex] = { sinceFired: 1000, ammo: 20 };
        },
        frameMutator: function (player, slotIndex) {
            var slotData = player.slotData[slotIndex];
            slotData.sinceFired++;
        },
        cost: 100
    });
    for (var i = 0; i < armDefs.length; i++) {
        var def = armDefs[i];
        armDefMap.set(def.name, { index: i, def: def });
    }
    asteroidDefs.push({
        resources: 500,
        sprite: { x: 256, y: 0, width: 64, height: 64 },
        radius: 24
    });
    missileDefs.push({
        sprite: { x: 64, y: 0, width: 32, height: 16 },
        radius: 8,
        speed: 15,
        damage: 10,
        acceleration: 0.2,
        lifetime: 600,
        deathEffect: 2
    });
};
exports.initDefs = initDefs;
var EmptySlot;
(function (EmptySlot) {
    EmptySlot[EmptySlot["Normal"] = 0] = "Normal";
    EmptySlot[EmptySlot["Utility"] = 1] = "Utility";
    EmptySlot[EmptySlot["Mine"] = 2] = "Mine";
    EmptySlot[EmptySlot["Large"] = 3] = "Large";
    EmptySlot[EmptySlot["Mining"] = 4] = "Mining";
})(EmptySlot || (EmptySlot = {}));
exports.EmptySlot = EmptySlot;
