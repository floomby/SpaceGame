import { createHash } from "crypto";
import { readFileSync } from "fs";
import { useSsl } from "../src/config";

const credentials: { key?: string; cert?: string; ca?: string } = {};

if (useSsl) {
  credentials.key = readFileSync("/etc/letsencrypt/live/inharmonious.floomby.us/privkey.pem", "utf8");
  credentials.cert = readFileSync("/etc/letsencrypt/live/inharmonious.floomby.us/cert.pem", "utf8");
  credentials.ca = readFileSync("/etc/letsencrypt/live/inharmonious.floomby.us/chain.pem", "utf8");
}

const wsPort = 8080;
const httpPort = 8081;

// Our "secret" salt (obviously not secret, but in theory it would be)
const salt = "Lithium Chloride, Lanthanum(III) Chloride, and Strontium Chloride";

const hash = (str: string) => {
  return createHash("sha256")
    .update(salt + str)
    .digest("hex");
};

const adminHash = "1d8465217b25152cb3de788928007459e451cb11a6e0e18ab5ed30e2648d809c";

export { credentials, wsPort, httpPort, hash, adminHash };
