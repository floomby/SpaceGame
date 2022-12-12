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

- Fix text to not be blit onto the screen in an way that overwrites the pixels of the other texts *

### World Checklist

- fix projectile drawing *
- draw collectables *
- draw the repair bars on stations that need repairing *
- player selection highlighting *

### Effects Checklist

- Finish effects
- Weak particle emitters
- Improve the beam effects (Need hit locations per model that are targeted based on which is closest or something)

### UI Checklist

- Draw the ship previews (IDK the best way to do this, probably hijack the target drawing code to render and then grab the pixels)

### WebGL optimizations that can be done (in estimated order of performance gain)

- instanced rendering for projectiles
- move a bunch of the vbos into vaos to avoid setting the attributes over and over
- instanced rendering for other things
- use ubos for the lights and particle emitters

### Wishlist

- Material system (likely to happen)
- Animations for the models
