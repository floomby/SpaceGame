"use strict";
// This is shared by the server and the client
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __read = (this && this.__read) || function (o, n) {
    var m = typeof Symbol === "function" && o[Symbol.iterator];
    if (!m) return o;
    var i = m.call(o), r, ar = [], e;
    try {
        while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
    }
    catch (error) { e = { error: error }; }
    finally {
        try {
            if (r && !r.done && (m = i["return"])) m.call(i);
        }
        finally { if (e) throw e.error; }
    }
    return ar;
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
var __values = (this && this.__values) || function(o) {
    var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
    if (m) return m.call(o);
    if (o && typeof o.length === "number") return {
        next: function () {
            if (o && i >= o.length) o = void 0;
            return { value: o && o[i++], done: !o };
        }
    };
    throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
};
exports.__esModule = true;
exports.maxNameLength = exports.ticksPerSecond = exports.equip = exports.addCargo = exports.availableCargoCapacity = exports.l2NormSquared = exports.l2Norm = exports.findPreviousTargetAsteroid = exports.findNextTargetAsteroid = exports.randomAsteroids = exports.uid = exports.findHeadingBetween = exports.findPreviousTarget = exports.findNextTarget = exports.copyPlayer = exports.setCanDock = exports.canDock = exports.fractionalUpdate = exports.positiveMod = exports.infinityNorm = exports.applyInputs = exports.update = exports.EffectAnchorKind = exports.TargetKind = void 0;
var defs_1 = require("./defs");
var infinityNorm = function (a, b) {
    return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
};
exports.infinityNorm = infinityNorm;
var l2NormSquared = function (a, b) {
    var dx = a.x - b.x;
    var dy = a.y - b.y;
    return dx * dx + dy * dy;
};
exports.l2NormSquared = l2NormSquared;
var l2Norm = function (a, b) {
    return Math.sqrt(l2NormSquared(a, b));
};
exports.l2Norm = l2Norm;
var pointInCircle = function (point, circle) {
    return l2NormSquared(point, circle.position) < circle.radius * circle.radius;
};
var circlesIntersect = function (a, b) {
    return l2NormSquared(a.position, b.position) < (a.radius + b.radius) * (a.radius + b.radius);
};
var positiveMod = function (a, b) {
    return ((a % b) + b) % b;
};
exports.positiveMod = positiveMod;
var TargetKind;
(function (TargetKind) {
    TargetKind[TargetKind["None"] = 0] = "None";
    TargetKind[TargetKind["Player"] = 1] = "Player";
    TargetKind[TargetKind["Asteroid"] = 2] = "Asteroid";
})(TargetKind || (TargetKind = {}));
exports.TargetKind = TargetKind;
var availableCargoCapacity = function (player) {
    var _a;
    var def = defs_1.defs[player.definitionIndex];
    var capacity = 0;
    if (def.cargoCapacity) {
        capacity = def.cargoCapacity;
    }
    var carrying = ((_a = player.cargo) === null || _a === void 0 ? void 0 : _a.reduce(function (acc, curr) { return acc + curr.amount; }, 0)) || 0;
    return capacity - carrying;
};
exports.availableCargoCapacity = availableCargoCapacity;
var addCargo = function (player, what, amount) {
    if (!player.cargo) {
        player.cargo = [];
    }
    var maxAmount = availableCargoCapacity(player);
    var existing = player.cargo.find(function (c) { return c.what === what; });
    if (existing) {
        existing.amount += Math.min(amount, maxAmount);
    }
    else {
        player.cargo.push({ what: what, amount: Math.min(amount, maxAmount) });
    }
};
exports.addCargo = addCargo;
var copyPlayer = function (player) {
    var _a;
    var ret = __assign({}, player);
    ret.sinceLastShot = __spreadArray([], __read(player.sinceLastShot), false);
    ret.armIndices = __spreadArray([], __read(player.armIndices), false);
    ret.slotData = player.slotData.map(function (data) { return (__assign({}, data)); });
    player.position = __assign({}, player.position);
    player.cargo = (_a = player.cargo) === null || _a === void 0 ? void 0 : _a.map(function (cargo) { return (__assign({}, cargo)); });
    return ret;
};
exports.copyPlayer = copyPlayer;
var canDock = function (player, station, strict) {
    if (strict === void 0) { strict = true; }
    if (!player || !station) {
        return false;
    }
    var stationDef = defs_1.defs[station.definitionIndex];
    var distance = l2Norm(player.position, station.position);
    if (strict) {
        return distance < stationDef.radius;
    }
    else {
        return distance < stationDef.radius * 2;
    }
};
exports.canDock = canDock;
// Primary laser stats (TODO put this in a better place)
var primaryRange = 1500;
var primaryRangeSquared = primaryRange * primaryRange;
var primarySpeed = 20;
var primaryFramesToExpire = primaryRange / primarySpeed;
var primaryRadius = 1;
var EffectAnchorKind;
(function (EffectAnchorKind) {
    EffectAnchorKind[EffectAnchorKind["Absolute"] = 0] = "Absolute";
    EffectAnchorKind[EffectAnchorKind["Player"] = 1] = "Player";
    EffectAnchorKind[EffectAnchorKind["Asteroid"] = 2] = "Asteroid";
})(EffectAnchorKind || (EffectAnchorKind = {}));
exports.EffectAnchorKind = EffectAnchorKind;
var setCanDock = function (player, state) {
    if (player) {
        if (player.docked) {
            player.canDock = undefined;
            return;
        }
        var playerDef_1 = defs_1.defs[player.definitionIndex];
        player.canDock = undefined;
        state.players.forEach(function (otherPlayer) {
            var def = defs_1.defs[otherPlayer.definitionIndex];
            if (def.kind === defs_1.UnitKind.Station && playerDef_1.team === def.team) {
                if (canDock(player, otherPlayer)) {
                    player.canDock = otherPlayer.id;
                    return;
                }
            }
        });
    }
};
exports.setCanDock = setCanDock;
// For smoothing the animations
var fractionalUpdate = function (state, fraction) {
    var e_1, _a, e_2, _b;
    var ret = { players: new Map(), projectiles: new Map(), asteroids: new Map(), missiles: new Map() };
    try {
        for (var _c = __values(state.players), _d = _c.next(); !_d.done; _d = _c.next()) {
            var _e = __read(_d.value, 2), id = _e[0], player = _e[1];
            if (player.docked) {
                ret.players.set(id, player);
                continue;
            }
            ret.players.set(id, __assign(__assign({}, player), { position: {
                    x: player.position.x + player.speed * Math.cos(player.heading) * fraction,
                    y: player.position.y + player.speed * Math.sin(player.heading) * fraction
                } }));
        }
    }
    catch (e_1_1) { e_1 = { error: e_1_1 }; }
    finally {
        try {
            if (_d && !_d.done && (_a = _c["return"])) _a.call(_c);
        }
        finally { if (e_1) throw e_1.error; }
    }
    try {
        for (var _f = __values(state.projectiles), _g = _f.next(); !_g.done; _g = _f.next()) {
            var _h = __read(_g.value, 2), id = _h[0], projectiles = _h[1];
            ret.projectiles.set(id, projectiles.map(function (projectile) { return (__assign(__assign({}, projectile), { position: {
                    x: projectile.position.x + projectile.speed * Math.cos(projectile.heading) * fraction,
                    y: projectile.position.y + projectile.speed * Math.sin(projectile.heading) * fraction
                } })); }));
        }
    }
    catch (e_2_1) { e_2 = { error: e_2_1 }; }
    finally {
        try {
            if (_g && !_g.done && (_b = _f["return"])) _b.call(_f);
        }
        finally { if (e_2) throw e_2.error; }
    }
    return ret;
};
exports.fractionalUpdate = fractionalUpdate;
var findHeadingBetween = function (a, b) {
    return Math.atan2(b.y - a.y, b.x - a.x);
};
exports.findHeadingBetween = findHeadingBetween;
var findClosestTarget = function (player, state, onlyEnemy) {
    var e_3, _a;
    if (onlyEnemy === void 0) { onlyEnemy = false; }
    var ret = [undefined, 0];
    var minDistance = Infinity;
    var def;
    if (onlyEnemy) {
        def = defs_1.defs[player.definitionIndex];
    }
    try {
        for (var _b = __values(state.players), _c = _b.next(); !_c.done; _c = _b.next()) {
            var _d = __read(_c.value, 2), id = _d[0], otherPlayer = _d[1];
            if (otherPlayer.docked) {
                continue;
            }
            if (onlyEnemy && def.team === defs_1.defs[otherPlayer.definitionIndex].team) {
                continue;
            }
            if (player === otherPlayer) {
                continue;
            }
            var distanceSquared = l2NormSquared(player.position, otherPlayer.position);
            if (distanceSquared < minDistance) {
                minDistance = distanceSquared;
                ret = [otherPlayer, id];
            }
        }
    }
    catch (e_3_1) { e_3 = { error: e_3_1 }; }
    finally {
        try {
            if (_c && !_c.done && (_a = _b["return"])) _a.call(_b);
        }
        finally { if (e_3) throw e_3.error; }
    }
    return ret;
};
var findFurthestTarget = function (player, state, onlyEnemy) {
    var e_4, _a;
    if (onlyEnemy === void 0) { onlyEnemy = false; }
    var ret = [undefined, 0];
    var maxDistance = 0;
    var def;
    if (onlyEnemy) {
        def = defs_1.defs[player.definitionIndex];
    }
    try {
        for (var _b = __values(state.players), _c = _b.next(); !_c.done; _c = _b.next()) {
            var _d = __read(_c.value, 2), id = _d[0], otherPlayer = _d[1];
            if (otherPlayer.docked) {
                continue;
            }
            if (onlyEnemy && def.team === defs_1.defs[otherPlayer.definitionIndex].team) {
                continue;
            }
            if (player === otherPlayer) {
                continue;
            }
            var distanceSquared = l2NormSquared(player.position, otherPlayer.position);
            if (distanceSquared > maxDistance) {
                maxDistance = distanceSquared;
                ret = [otherPlayer, id];
            }
        }
    }
    catch (e_4_1) { e_4 = { error: e_4_1 }; }
    finally {
        try {
            if (_c && !_c.done && (_a = _b["return"])) _a.call(_b);
        }
        finally { if (e_4) throw e_4.error; }
    }
    return ret;
};
var findNextTarget = function (player, current, state, onlyEnemy) {
    var e_5, _a;
    if (onlyEnemy === void 0) { onlyEnemy = false; }
    if (!current) {
        return findClosestTarget(player, state, onlyEnemy);
    }
    var ret = [current, (current === null || current === void 0 ? void 0 : current.id) || 0];
    var currentDistanceSquared = l2NormSquared(player.position, current.position);
    var minDistanceGreaterThanCurrent = Infinity;
    var foundFurther = false;
    var def;
    if (onlyEnemy) {
        def = defs_1.defs[player.definitionIndex];
    }
    try {
        for (var _b = __values(state.players), _c = _b.next(); !_c.done; _c = _b.next()) {
            var _d = __read(_c.value, 2), id = _d[0], otherPlayer = _d[1];
            if (otherPlayer.docked) {
                continue;
            }
            if (onlyEnemy && def.team === defs_1.defs[otherPlayer.definitionIndex].team) {
                continue;
            }
            if (player === otherPlayer) {
                continue;
            }
            var distanceSquared = l2NormSquared(player.position, otherPlayer.position);
            if (distanceSquared > currentDistanceSquared && distanceSquared < minDistanceGreaterThanCurrent) {
                minDistanceGreaterThanCurrent = distanceSquared;
                ret = [otherPlayer, id];
                foundFurther = true;
            }
        }
    }
    catch (e_5_1) { e_5 = { error: e_5_1 }; }
    finally {
        try {
            if (_c && !_c.done && (_a = _b["return"])) _a.call(_b);
        }
        finally { if (e_5) throw e_5.error; }
    }
    if (!foundFurther) {
        return findClosestTarget(player, state, onlyEnemy);
    }
    return ret;
};
exports.findNextTarget = findNextTarget;
var findPreviousTarget = function (player, current, state, onlyEnemy) {
    var e_6, _a;
    if (onlyEnemy === void 0) { onlyEnemy = false; }
    if (!current) {
        return findClosestTarget(player, state, onlyEnemy);
    }
    var ret = [current, (current === null || current === void 0 ? void 0 : current.id) || 0];
    var currentDistanceSquared = l2NormSquared(player.position, current.position);
    var maxDistanceLessThanCurrent = 0;
    var foundCloser = false;
    var def;
    if (onlyEnemy) {
        def = defs_1.defs[player.definitionIndex];
    }
    try {
        for (var _b = __values(state.players), _c = _b.next(); !_c.done; _c = _b.next()) {
            var _d = __read(_c.value, 2), id = _d[0], otherPlayer = _d[1];
            if (otherPlayer.docked) {
                continue;
            }
            if (onlyEnemy && def.team === defs_1.defs[otherPlayer.definitionIndex].team) {
                continue;
            }
            if (player === otherPlayer) {
                continue;
            }
            var distanceSquared = l2NormSquared(player.position, otherPlayer.position);
            if (distanceSquared < currentDistanceSquared && distanceSquared > maxDistanceLessThanCurrent) {
                maxDistanceLessThanCurrent = distanceSquared;
                ret = [otherPlayer, id];
                foundCloser = true;
            }
        }
    }
    catch (e_6_1) { e_6 = { error: e_6_1 }; }
    finally {
        try {
            if (_c && !_c.done && (_a = _b["return"])) _a.call(_b);
        }
        finally { if (e_6) throw e_6.error; }
    }
    if (!foundCloser) {
        return findFurthestTarget(player, state, onlyEnemy);
    }
    return ret;
};
exports.findPreviousTarget = findPreviousTarget;
var hardpointPositions = function (player, def) {
    var ret = [];
    for (var i = 0; i < def.hardpoints.length; i++) {
        var hardpoint = def.hardpoints[i];
        ret.push({
            x: player.position.x + hardpoint.x * Math.cos(player.heading) - hardpoint.y * Math.sin(player.heading),
            y: player.position.y + hardpoint.x * Math.sin(player.heading) + hardpoint.y * Math.cos(player.heading)
        });
    }
    return ret;
};
// Like usual the update function is a monstrosity
var update = function (state, frameNumber, onDeath, serverTargets, serverSecondaries, applyEffect) {
    var e_7, _a, e_8, _b, e_9, _c, e_10, _d, e_11, _e;
    var _loop_1 = function (id, player) {
        var e_12, _w;
        if (player.docked) {
            return "continue";
        }
        var def = defs_1.defs[player.definitionIndex];
        if (player.health <= 0) {
            state.players["delete"](id);
            applyEffect({
                effectIndex: def.deathEffect,
                from: { kind: EffectAnchorKind.Absolute, value: player.position, heading: player.heading, speed: player.speed }
            });
            onDeath(id);
        }
        if (def.kind === defs_1.UnitKind.Ship) {
            player.position.x += player.speed * Math.cos(player.heading);
            player.position.y += player.speed * Math.sin(player.heading);
            if (player.toFirePrimary && player.energy > 10) {
                var projectile = {
                    position: { x: player.position.x, y: player.position.y },
                    radius: primaryRadius,
                    speed: primarySpeed,
                    heading: player.heading,
                    damage: def.primaryDamage,
                    team: def.team,
                    id: player.projectileId,
                    parent: id,
                    frameTillEXpire: primaryFramesToExpire
                };
                var projectiles = state.projectiles.get(id) || [];
                projectiles.push(projectile);
                state.projectiles.set(id, projectiles);
                player.projectileId++;
                player.toFirePrimary = false;
                player.energy -= 10;
            }
            player.armIndices.forEach(function (armament, index) {
                var armDef = defs_1.armDefs[armament];
                if (armDef.frameMutator) {
                    armDef.frameMutator(player, index);
                }
            });
            if (player.toFireSecondary) {
                var slotId = serverSecondaries.get(id);
                var armDef = defs_1.armDefs[player.armIndices[slotId]];
                if (armDef.targeted === defs_1.TargetedKind.Targeted) {
                    var _x = __read(serverTargets.get(id) || [TargetKind.None, 0], 2), targetKind = _x[0], targetId = _x[1];
                    if (slotId !== undefined && targetKind && slotId < player.armIndices.length) {
                        if (armDef.stateMutator) {
                            var target = void 0;
                            if (targetKind === TargetKind.Player) {
                                target = state.players.get(targetId);
                            }
                            else if (targetKind === TargetKind.Asteroid) {
                                target = state.asteroids.get(targetId);
                            }
                            if (target) {
                                armDef.stateMutator(state, player, targetKind, target, applyEffect, slotId);
                            }
                        }
                    }
                }
                else if (armDef.targeted === defs_1.TargetedKind.Untargeted) {
                    if (slotId !== undefined && slotId < player.armIndices.length) {
                        if (armDef.stateMutator) {
                            armDef.stateMutator(state, player, TargetKind.None, undefined, applyEffect, slotId);
                        }
                    }
                }
            }
        }
        else {
            // Have stations spin slowly
            player.heading = positiveMod(player.heading + 0.003, 2 * Math.PI);
            var closestEnemy_1;
            var closestEnemyDistanceSquared = Infinity;
            try {
                for (var _y = (e_12 = void 0, __values(state.players)), _z = _y.next(); !_z.done; _z = _y.next()) {
                    var _0 = __read(_z.value, 2), otherId = _0[0], otherPlayer = _0[1];
                    if (otherPlayer.docked) {
                        continue;
                    }
                    if (player.id === otherId) {
                        continue;
                    }
                    var otherDef = defs_1.defs[otherPlayer.definitionIndex];
                    if (otherDef.team === def.team) {
                        continue;
                    }
                    var distanceSquared = l2NormSquared(player.position, otherPlayer.position);
                    if (distanceSquared < closestEnemyDistanceSquared) {
                        closestEnemy_1 = otherPlayer;
                        closestEnemyDistanceSquared = distanceSquared;
                    }
                }
            }
            catch (e_12_1) { e_12 = { error: e_12_1 }; }
            finally {
                try {
                    if (_z && !_z.done && (_w = _y["return"])) _w.call(_y);
                }
                finally { if (e_12) throw e_12.error; }
            }
            if (closestEnemy_1) {
                var hardpointLocations = hardpointPositions(player, def);
                var hardpointHeadingsAndDistances = hardpointLocations.map(function (hardpoint) { return [
                    findHeadingBetween(hardpoint, closestEnemy_1.position),
                    l2NormSquared(hardpoint, closestEnemy_1.position),
                ]; });
                for (var i = 0; i < def.hardpoints.length; i++) {
                    var _1 = __read(hardpointHeadingsAndDistances[i], 2), heading = _1[0], distanceSquared = _1[1];
                    if (distanceSquared < primaryRangeSquared && player.energy > 10 && player.sinceLastShot[i] > def.primaryReloadTime) {
                        var projectile = {
                            position: hardpointLocations[i],
                            radius: primaryRadius,
                            speed: primarySpeed,
                            heading: heading,
                            damage: def.primaryDamage,
                            team: def.team,
                            id: player.projectileId,
                            parent: id,
                            frameTillEXpire: primaryFramesToExpire
                        };
                        var projectiles = state.projectiles.get(id) || [];
                        projectiles.push(projectile);
                        state.projectiles.set(id, projectiles);
                        player.projectileId++;
                        player.energy -= 10;
                        player.sinceLastShot[i] = 0;
                    }
                }
            }
        }
        for (var i = 0; i < player.sinceLastShot.length; i++) {
            player.sinceLastShot[i] += 1;
        }
        player.energy += def.energyRegen;
        if (player.energy > def.energy) {
            player.energy = def.energy;
        }
    };
    try {
        for (var _f = __values(state.players), _g = _f.next(); !_g.done; _g = _f.next()) {
            var _h = __read(_g.value, 2), id = _h[0], player = _h[1];
            _loop_1(id, player);
        }
    }
    catch (e_7_1) { e_7 = { error: e_7_1 }; }
    finally {
        try {
            if (_g && !_g.done && (_a = _f["return"])) _a.call(_f);
        }
        finally { if (e_7) throw e_7.error; }
    }
    try {
        for (var _j = __values(state.projectiles), _k = _j.next(); !_k.done; _k = _j.next()) {
            var _l = __read(_k.value, 2), id = _l[0], projectiles = _l[1];
            for (var i = 0; i < projectiles.length; i++) {
                var projectile = projectiles[i];
                projectile.position.x += projectile.speed * Math.cos(projectile.heading);
                projectile.position.y += projectile.speed * Math.sin(projectile.heading);
                projectile.frameTillEXpire -= 1;
                var didRemove = false;
                try {
                    for (var _m = (e_9 = void 0, __values(state.players)), _o = _m.next(); !_o.done; _o = _m.next()) {
                        var _p = __read(_o.value, 2), otherId = _p[0], otherPlayer = _p[1];
                        if (otherPlayer.docked) {
                            continue;
                        }
                        var def = defs_1.defs[otherPlayer.definitionIndex];
                        if (projectile.team !== def.team && pointInCircle(projectile.position, otherPlayer)) {
                            otherPlayer.health -= projectile.damage;
                            if (otherPlayer.health <= 0) {
                                state.players["delete"](otherId);
                                applyEffect({
                                    effectIndex: def.deathEffect,
                                    from: { kind: EffectAnchorKind.Absolute, value: otherPlayer.position, heading: otherPlayer.heading, speed: otherPlayer.speed }
                                });
                                onDeath(otherId);
                            }
                            projectiles.splice(i, 1);
                            i--;
                            didRemove = true;
                            break;
                        }
                    }
                }
                catch (e_9_1) { e_9 = { error: e_9_1 }; }
                finally {
                    try {
                        if (_o && !_o.done && (_c = _m["return"])) _c.call(_m);
                    }
                    finally { if (e_9) throw e_9.error; }
                }
                if (!didRemove && projectile.frameTillEXpire <= 0) {
                    projectiles.splice(i, 1);
                    i--;
                }
            }
        }
    }
    catch (e_8_1) { e_8 = { error: e_8_1 }; }
    finally {
        try {
            if (_k && !_k.done && (_b = _j["return"])) _b.call(_j);
        }
        finally { if (e_8) throw e_8.error; }
    }
    try {
        for (var _q = __values(state.missiles), _r = _q.next(); !_r.done; _r = _q.next()) {
            var _s = __read(_r.value, 2), id = _s[0], missile = _s[1];
            var missileDef = defs_1.missileDefs[missile.definitionIndex];
            missile.position.x += missile.speed * Math.cos(missile.heading);
            missile.position.y += missile.speed * Math.sin(missile.heading);
            if (missile.speed > missileDef.speed) {
                missile.speed -= missileDef.acceleration;
                if (missile.speed < missileDef.speed) {
                    missile.speed = missileDef.speed;
                }
            }
            else if (missile.speed < missileDef.speed) {
                missile.speed += missileDef.acceleration;
                if (missile.speed > missileDef.speed) {
                    missile.speed = missileDef.speed;
                }
            }
            missile.lifetime -= 1;
            var didRemove = false;
            try {
                for (var _t = (e_11 = void 0, __values(state.players)), _u = _t.next(); !_u.done; _u = _t.next()) {
                    var _v = __read(_u.value, 2), otherId = _v[0], otherPlayer = _v[1];
                    if (otherPlayer.docked) {
                        continue;
                    }
                    var def = defs_1.defs[otherPlayer.definitionIndex];
                    if (missile.team !== def.team && circlesIntersect(missile, otherPlayer)) {
                        otherPlayer.health -= missile.damage;
                        if (otherPlayer.health <= 0) {
                            state.players["delete"](otherId);
                            applyEffect({
                                effectIndex: def.deathEffect,
                                from: { kind: EffectAnchorKind.Absolute, value: otherPlayer.position, heading: otherPlayer.heading, speed: otherPlayer.speed }
                            });
                            onDeath(otherId);
                        }
                        state.missiles["delete"](id);
                        applyEffect({ effectIndex: missileDef.deathEffect, from: { kind: EffectAnchorKind.Absolute, value: missile.position } });
                        didRemove = true;
                        break;
                    }
                }
            }
            catch (e_11_1) { e_11 = { error: e_11_1 }; }
            finally {
                try {
                    if (_u && !_u.done && (_e = _t["return"])) _e.call(_t);
                }
                finally { if (e_11) throw e_11.error; }
            }
            if (!didRemove && missile.lifetime <= 0) {
                state.missiles["delete"](id);
                applyEffect({ effectIndex: missileDef.deathEffect, from: { kind: EffectAnchorKind.Absolute, value: missile.position } });
            }
        }
    }
    catch (e_10_1) { e_10 = { error: e_10_1 }; }
    finally {
        try {
            if (_r && !_r.done && (_d = _q["return"])) _d.call(_q);
        }
        finally { if (e_10) throw e_10.error; }
    }
};
exports.update = update;
var applyInputs = function (input, player) {
    var def = defs_1.defs[player.definitionIndex];
    if (input.up) {
        player.speed += 0.1;
    }
    if (input.down) {
        player.speed -= 0.1;
    }
    if (input.left) {
        player.heading -= 0.1;
    }
    if (input.right) {
        player.heading += 0.1;
    }
    if (player.speed > 10) {
        player.speed = 10;
    }
    if (player.speed < 0) {
        player.speed = 0;
    }
    if (input.primary) {
        if (player.sinceLastShot[0] > def.primaryReloadTime) {
            player.sinceLastShot[0] = 0;
            player.toFirePrimary = true;
        }
    }
    else {
        player.toFirePrimary = false;
    }
    player.toFireSecondary = input.secondary;
};
exports.applyInputs = applyInputs;
var uid = function () {
    var ret = 0;
    while (ret === 0) {
        ret = Math.floor(Math.random() * 1000000);
    }
    return ret;
};
exports.uid = uid;
var randomAsteroids = function (count, bounds) {
    if (defs_1.asteroidDefs.length === 0) {
        throw new Error("Asteroid defs not initialized");
    }
    var asteroids = [];
    for (var i = 0; i < count; i++) {
        var index = Math.floor(Math.random() * defs_1.asteroidDefs.length);
        var def = defs_1.asteroidDefs[index];
        var asteroid = {
            position: {
                x: Math.random() * bounds.width + bounds.x,
                y: Math.random() * bounds.height + bounds.y
            },
            heading: Math.random() * 2 * Math.PI,
            resources: def.resources,
            definitionIndex: index,
            id: uid(),
            radius: def.radius
        };
        asteroids.push(asteroid);
    }
    return asteroids;
};
exports.randomAsteroids = randomAsteroids;
var findClosestTargetAsteroid = function (player, state) {
    var e_13, _a;
    var ret = [undefined, 0];
    var minDistance = Infinity;
    try {
        for (var _b = __values(state.asteroids), _c = _b.next(); !_c.done; _c = _b.next()) {
            var _d = __read(_c.value, 2), id = _d[0], asteroid = _d[1];
            var distanceSquared = l2NormSquared(player.position, asteroid.position);
            if (distanceSquared < minDistance) {
                minDistance = distanceSquared;
                ret = [asteroid, id];
            }
        }
    }
    catch (e_13_1) { e_13 = { error: e_13_1 }; }
    finally {
        try {
            if (_c && !_c.done && (_a = _b["return"])) _a.call(_b);
        }
        finally { if (e_13) throw e_13.error; }
    }
    return ret;
};
var findFurthestTargetAsteroid = function (player, state) {
    var e_14, _a;
    var ret = [undefined, 0];
    var maxDistance = 0;
    try {
        for (var _b = __values(state.asteroids), _c = _b.next(); !_c.done; _c = _b.next()) {
            var _d = __read(_c.value, 2), id = _d[0], asteroid = _d[1];
            var distanceSquared = l2NormSquared(player.position, asteroid.position);
            if (distanceSquared > maxDistance) {
                maxDistance = distanceSquared;
                ret = [asteroid, id];
            }
        }
    }
    catch (e_14_1) { e_14 = { error: e_14_1 }; }
    finally {
        try {
            if (_c && !_c.done && (_a = _b["return"])) _a.call(_b);
        }
        finally { if (e_14) throw e_14.error; }
    }
    return ret;
};
var findNextTargetAsteroid = function (player, current, state) {
    var e_15, _a;
    if (!current) {
        return findClosestTargetAsteroid(player, state);
    }
    var ret = [current, (current === null || current === void 0 ? void 0 : current.id) || 0];
    var currentDistanceSquared = l2NormSquared(player.position, current.position);
    var minDistanceGreaterThanCurrent = Infinity;
    var foundFurther = false;
    try {
        for (var _b = __values(state.asteroids), _c = _b.next(); !_c.done; _c = _b.next()) {
            var _d = __read(_c.value, 2), id = _d[0], asteroid = _d[1];
            var distanceSquared = l2NormSquared(player.position, asteroid.position);
            if (distanceSquared > currentDistanceSquared && distanceSquared < minDistanceGreaterThanCurrent) {
                minDistanceGreaterThanCurrent = distanceSquared;
                ret = [asteroid, id];
                foundFurther = true;
            }
        }
    }
    catch (e_15_1) { e_15 = { error: e_15_1 }; }
    finally {
        try {
            if (_c && !_c.done && (_a = _b["return"])) _a.call(_b);
        }
        finally { if (e_15) throw e_15.error; }
    }
    if (!foundFurther) {
        return findClosestTargetAsteroid(player, state);
    }
    return ret;
};
exports.findNextTargetAsteroid = findNextTargetAsteroid;
var findPreviousTargetAsteroid = function (player, current, state) {
    var e_16, _a;
    if (!current) {
        return findClosestTargetAsteroid(player, state);
    }
    var ret = [current, (current === null || current === void 0 ? void 0 : current.id) || 0];
    var currentDistanceSquared = l2NormSquared(player.position, current.position);
    var maxDistanceLessThanCurrent = 0;
    var foundCloser = false;
    try {
        for (var _b = __values(state.asteroids), _c = _b.next(); !_c.done; _c = _b.next()) {
            var _d = __read(_c.value, 2), id = _d[0], asteroid = _d[1];
            var distanceSquared = l2NormSquared(player.position, asteroid.position);
            if (distanceSquared < currentDistanceSquared && distanceSquared > maxDistanceLessThanCurrent) {
                maxDistanceLessThanCurrent = distanceSquared;
                ret = [asteroid, id];
                foundCloser = true;
            }
        }
    }
    catch (e_16_1) { e_16 = { error: e_16_1 }; }
    finally {
        try {
            if (_c && !_c.done && (_a = _b["return"])) _a.call(_b);
        }
        finally { if (e_16) throw e_16.error; }
    }
    if (!foundCloser) {
        return findFurthestTargetAsteroid(player, state);
    }
    return ret;
};
exports.findPreviousTargetAsteroid = findPreviousTargetAsteroid;
var equip = function (player, slotIndex, what, noCost) {
    if (noCost === void 0) { noCost = false; }
    var def = defs_1.defs[player.definitionIndex];
    if (slotIndex >= def.slots.length) {
        console.log("Warning: slot number too high");
        return;
    }
    var armDef = undefined;
    var defIndex;
    if (typeof what === "string") {
        var entry = defs_1.armDefMap.get(what);
        if (!entry) {
            console.log("Warning: no such armament");
            return;
        }
        armDef = entry.def;
        defIndex = entry.index;
    }
    else {
        if (what >= defs_1.armDefs.length) {
            console.log("Warning: armament index too high");
            return;
        }
        armDef = defs_1.armDefs[what];
        defIndex = what;
    }
    var slotKind = def.slots[slotIndex];
    if (slotKind !== armDef.kind) {
        console.log("Warning: wrong kind of armament");
        return;
    }
    if (slotIndex >= player.armIndices.length) {
        console.log("Warning: player armaments not initialized correctly");
        return;
    }
    if ((player.credits !== undefined && armDef.cost <= player.credits) || noCost) {
        player.credits -= armDef.cost;
        player.armIndices[slotIndex] = defIndex;
        if (armDef.equipMutator) {
            armDef.equipMutator(player, slotIndex);
        }
    }
};
exports.equip = equip;
var maxNameLength = 20;
exports.maxNameLength = maxNameLength;
var ticksPerSecond = 60;
exports.ticksPerSecond = ticksPerSecond;
