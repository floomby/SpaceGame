### Random list of things to do

- Shields? (maybe)
- Handle network interruptions
- Network optimizations
- Economy is very boring right now
- Try and make the strafe animations work in a way that looks tolerable
- Investigate drawing performance (Missile trails are still bad)

### MMO Stuff

- Play as guest (low priority)
- Option to change password (low priority)

### Next steps

- Manufacturing slots and time
- Armament purchase options for stations
- Manufacturing UI is pretty horrible to use
- NPC behavior state graph factory for making behaviors and transitions between behaviors easier to handle
- Make mine drawing not this ad-hoc thing it is right now (probably model after the projectile drawing)
- Figure out kill messages in a way that is performant for the server (low priority)

### Refactoring stuff

- We don't need to send the id for every network transaction, the server already knows this information and verifies it anyways