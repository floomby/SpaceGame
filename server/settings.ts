import { createHash } from "crypto";
import { readFileSync } from "fs";
import { useSsl } from "../src/config";

const credentials: { key?: string; cert?: string; ca?: string } = {};

if (useSsl) {
  credentials.key = readFileSync("/etc/letsencrypt/live/spacequest.io/privkey.pem", "utf8");
  credentials.cert = readFileSync("/etc/letsencrypt/live/spacequest.io/cert.pem", "utf8");
  credentials.ca = readFileSync("/etc/letsencrypt/live/spacequest.io/chain.pem", "utf8");
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

const adminHash = "77bf8af9b1f3f51c07556c529623732cb1feb23fae82b5fdaea68c7488362a91";

export { credentials, wsPort, httpPort, hash, adminHash };
