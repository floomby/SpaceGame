### Things to think about

- Handle network interruptions
- Network optimizations
- Economy does not make sense
- Manufacturing slots and time??
- Armament purchase options for stations??
- Killed/killed by messages??


### Server stuff

- Anti chat spam needed
- Collision and redo docking and repairing radius **
- Delayed damage for beam weapons *

### Hud

- Fix text to not be blit onto the screen in an way that overwrites the pixels of the other texts *

### World

- Be more zoomed out

### Effects

- Fix firefox bug where lines only draw when the projectiles draw (it is a webgl state issue with the uniforms for the main monolithic shader)
- Improve the beam effects (Need hit locations per model that are targeted based on which is closest or something) *

### UI

- Don't show weapon text while docked
- Make a bunch of the text unselectable when it shouldn't be selectable

### Misc

- Particle count setting
- Boost volume of all effects

### WebGL optimizations that can be done (in estimated order of performance gain)

- move a bunch of the vbos into vaos to avoid setting the attributes over and over
- instanced rendering for projectiles
- instanced rendering for other things
- use ubos for the lights and particle emitters

### Wishlist

- Material system (likely to happen)
- Animations for the models
