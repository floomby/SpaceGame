### Things to think about

- Handle network interruptions
- Network optimizations
- Economy does not make sense
- Manufacturing slots and time??
- Armament purchase options for stations??
- Killed/killed by messages??

### Server stuff

- Anti chat spam needed

### Hud Checklist

- sector lines (2)
- Fix text to not be blit onto the screen in an way that overwrites the pixels of the other texts

### World Checklist

- fix projectile drawing
- draw collectables
- fix drawing player effects for warping
- draw the repair bars on stations that need repairing
- make the rest of the missile models
- player selection highlighting

### Effects Stuff

- Finish off effects
- Warp effect (1)
- Beam effects (3)

### WebGL optimizations that can be done (in estimated order of performance gain)

- instanced rendering for projectiles
- move a bunch of the vbos into vaos to avoid setting the attributes over and over
- instanced rendering for other things
- use ubos for the lights and particle emitters

### Wishlist

- Material system (likely to happen)
- Animations for the models
