#!/bin/bash

scp -i ~/.ssh/AWSkeys.pem resources/background/* ec2-user@inharmonious.floomby.us:~/SpaceGame/resources/background/
