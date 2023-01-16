#! /bin/bash

node peers.js carter 5555 5565 8080 0 &
node peers.js sheppard 5556 5566 8082 1 &
node peers.js oneill 5557 5567 8084 2 &
