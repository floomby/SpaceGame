#! /bin/bash

node peers.js carter 5555 8080 0 &
node peers.js sheppard 5556 8082 1 &
node peers.js oneill 5557 8083 2 &
