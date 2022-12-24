### Things to think about

- Handle network interruptions
- Network optimizations
- Killed/killed by messages??

### Server stuff

- Anti chat spam (low priority)

### Effects

- Improve the beam effects (Need hit locations per model that are targeted based on which is closest or something) *

### Misc

- Fix the recipes
- Make some more tier 2 weapons
- Fix how dark the tomahawk and emp missiles are (does not appear to be backwards normals)
- Stat and bridge models
- Get cloudfront working since the reverse nginx proxy was so terrible

### WebGL optimizations that can be done (in estimated order of performance gain)

- move a bunch of the vbos into vaos to avoid setting the attributes over and over
- instanced rendering for projectiles
- instanced rendering for other things
- use ubos for the lights and particle emitters

### Wishlist

- Bloom (Also using some sort of hdr internally to make this even nicer would be cool)
- Material system
- Animations for the models
