#!/bin/bash

eval "$(ssh-agent -s)" && ssh-add ~/.ssh/github && git pull
cd server
tsc --project config.json
cd ..
tsc
cd workers
tsc
cd ..
pm2 restart server
