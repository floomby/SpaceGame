### Things to think about

- Handle network interruptions
- Network optimizations
- Economy does not make sense
- Manufacturing slots and time??
- Armament purchase options for stations??
- Killed/killed by messages??

### Server stuff

- Anti chat spam (low priority)

### Hud

### World

### Effects

- Improve the beam effects (Need hit locations per model that are targeted based on which is closest or something) *

### UI

- Make a bunch of the text unselectable when it shouldn't be selectable (This is somewhat done, I left most tables selectable for now, idk if wanted or not)

### Misc

- Fix the recipes
- Fix how dark the tomahawk and emp missiles are (does not appear to be backwards normals)

### WebGL optimizations that can be done (in estimated order of performance gain)

- move a bunch of the vbos into vaos to avoid setting the attributes over and over
- instanced rendering for projectiles
- instanced rendering for other things
- use ubos for the lights and particle emitters

### Wishlist

- Bloom (Also using some sort of hdr internally to make this even nicer would be cool)
- Material system
- Animations for the models
