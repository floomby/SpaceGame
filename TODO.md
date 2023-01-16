### Broken by new multi server system

- Current player information (works except logout)
- NPC sector changing
- Guardians
- Deployment
- Alternative background
- Some admin routes

### Server stuff

- Anti chat spam (low priority)
- Killed/killed by messages??

### Gameplay

### User Interface

- Map css grid is being janky
- I may want friend location/online notifications (idk if I should have a client subscribe model or just have the server figure it out and send it to the client)

### Effects

- Add graphical flash effect for large EMP
- Improve the beam effects (Need hit locations per model that are targeted based on which is closest or something)

### Misc

- Fix how dark the tomahawk and emp missiles are (does not appear to be backwards normals)
- Work on discord integrations

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
