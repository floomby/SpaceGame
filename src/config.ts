import { KeyLayouts } from "./keybindings";

const useSsl = true;
const wsUrl = useSsl ? "wss://spacequest.io:80" : "ws://localhost:8080";
const defaultKeyLayout = KeyLayouts.Qwerty;

export { useSsl, wsUrl, defaultKeyLayout };
