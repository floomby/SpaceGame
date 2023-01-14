#! /bin/bash

node peers.js carter 5555 8080 "[0,1,2,3,4]" &
node peers.js sheppard 5556 8082 "[5,6,7,8,9]" &
node peers.js oneill 5557 8083 "[10,11,12,13,14,15]" &
