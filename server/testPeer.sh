#! /bin/bash

node peers.js carter 5555 8080 "[0,1,2]" &
node peers.js sheppard 5556 8082 "[3,4,5]" &
