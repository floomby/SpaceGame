import { KeyLayouts } from "./keybindings";

const useSsl = false;
const wsUrl = useSsl ? "wss://inharmonious.floomby.us:80" : "ws://localhost:8080";
const defaultKeyLayout = KeyLayouts.Qwerty;

export { useSsl, wsUrl, defaultKeyLayout };
