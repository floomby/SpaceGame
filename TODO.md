### Server stuff

- Anti chat spam (low priority)
- Killed/killed by messages??

### Gameplay

- Fix the recipes for the existing weapons (change price and prereqs and stuff so they make more sense)
- Make some more tier 2 weapons

### User Interface

- Readdress text selectability, upon more playing idk if even the tables should be selectable

### Effects

- Improve the beam effects (Need hit locations per model that are targeted based on which is closest or something) *

### Misc

- Fix how dark the tomahawk and emp missiles are (does not appear to be backwards normals)
- Stat and bridge system

### WebGL optimizations that can be done (in estimated order of performance gain)

- move a bunch of the vbos into vaos to avoid setting the attributes over and over
- instanced rendering for projectiles
- instanced rendering for other things
- use ubos for the lights and particle emitters

### Ongoing

- Network optimizations

### Wishlist

- Bloom (Also using some sort of hdr internally to make this even nicer would be cool)
- Material system
- Animations for the models
