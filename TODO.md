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
- weapon text

### World Checklist

- fix projectile drawing
- draw collectables
- fix drawing player effects for warping and being disabled
- draw the repair bars on stations that need repairing
- pitch and roll for players
- make the rest of the missile models

### Effects Stuff

- Finish particle system (1)
- Explosion effects (1)
- Missile trail effects (1)
- Projectile effects (1)
- Warp effect (1)
- Beam effects (3)

### WebGL optimizations that can be done (in estimated order of performance gain)

- instanced rendering for projectiles
- move a bunch of the vbos into vaos to avoid setting the attributes over and over
- instanced rendering for other things
- figure out if rebinding samplers can be reduced using sampler arrays? (Do these exist in WebGL?)

### Wishlist

- Material system (likely to happen)
- Animations for the models
