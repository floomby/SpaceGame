### Server stuff

- Anti chat spam (low priority)
- Killed/killed by messages??

### Gameplay

### User Interface

- Make the social menu look much better
- Partial dialogs for in game
- Make the co-op missions work
- Readdress text selectability, upon more playing idk if even the tables should be selectable
- Hiding messages while docked after time has elapsed is broken (I think I broke this with the switch to 3d somehow, have been vaugely aware of it for a while)

### Effects

- Add graphical flash effect for large EMP
- Improve the beam effects (Need hit locations per model that are targeted based on which is closest or something)

### Misc

- Get a name for the game
- Fix how dark the tomahawk and emp missiles are (does not appear to be backwards normals)
- Stat and bridge system

### WebGL optimizations that can be done (in estimated order of performance gain)

- move a bunch of the vbos into vaos to avoid setting the attributes over and over
- instanced rendering for projectiles
- instanced rendering for other things
- use ubos for the lights and particle emitters

### Ongoing

- Make some more tier 2 weapons
- Make more ships
- Network optimizations

### Wishlist

- Bloom (Also using some sort of hdr internally to make this even nicer would be cool)
- Material system
- Animations for the models
