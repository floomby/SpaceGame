import { createHash } from "crypto";
import { readFileSync } from "fs";
import { useSsl } from "../src/config";
import * as tls from "tls";

const credentials: { key?: string; cert?: string; ca?: string } = {};
const oldCredentials: { key?: string; cert?: string; ca?: string } = {};

if (useSsl) {
  credentials.key = readFileSync("/etc/letsencrypt/live/spacequest.io/privkey.pem", "utf8");
  credentials.cert = readFileSync("/etc/letsencrypt/live/spacequest.io/cert.pem", "utf8");
  credentials.ca = readFileSync("/etc/letsencrypt/live/spacequest.io/chain.pem", "utf8");

  oldCredentials.key = readFileSync("/etc/letsencrypt/live/inharmonious.floomby.us/privkey.pem", "utf8");
  oldCredentials.cert = readFileSync("/etc/letsencrypt/live/inharmonious.floomby.us/cert.pem", "utf8");
  oldCredentials.ca = readFileSync("/etc/letsencrypt/live/inharmonious.floomby.us/chain.pem", "utf8");
}

const sniCallback = (servername: string, cb: (err: Error | null, ctx: any) => void) => {
  if (servername === "spacequest.io") {
    cb(null, tls.createSecureContext(credentials));
  } else if (servername === "inharmonious.floomby.us") {
    cb(null, tls.createSecureContext(oldCredentials));
  } else {
    cb(new Error("Unknown servername"), null);
  }
};

const wsPort = 8080;
const httpPort = 8081;

// Our "secret" salt (obviously not secret, but in theory it would be)
const salt = "Lithium Chloride, Lanthanum(III) Chloride, and Strontium Chloride";

const hash = (str: string) => {
  return createHash("sha256")
    .update(salt + str)
    .digest("hex");
};

const adminHash = "77bf8af9b1f3f51c07556c529623732cb1feb23fae82b5fdaea68c7488362a91";

export { sniCallback, wsPort, httpPort, hash, adminHash };
