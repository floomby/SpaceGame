"use strict";
exports.__esModule = true;
exports.clientUid = exports.Debouncer = exports.disableTooExpensive = void 0;
var disableTooExpensive = function (player, cost) {
    if (player) {
        if (player.credits < cost) {
            return "disabled";
        }
        else {
            return "";
        }
    }
    else {
        return "disabled";
    }
};
exports.disableTooExpensive = disableTooExpensive;
var Debouncer = /** @class */ (function () {
    function Debouncer(delay) {
        this.delay = delay;
    }
    Debouncer.prototype.debounce = function (func) {
        if (this.timeout) {
            clearTimeout(this.timeout);
        }
        this.timeout = setTimeout(func, this.delay);
    };
    return Debouncer;
}());
exports.Debouncer = Debouncer;
var clientUid = function () {
    var ret = 0;
    while (ret === 0) {
        ret = Math.floor(Math.random() * 1000000);
    }
    return ret;
};
exports.clientUid = clientUid;
