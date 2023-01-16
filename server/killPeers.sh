#! /bin/bash

ps -e | grep node | awk '{ print $1 }' | xargs kill -9
