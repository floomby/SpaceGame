// Stuff for the particle system (some of the stuff is in the 3dDrawing file, such as shader program compilation and linking)

import { mat4 } from "gl-matrix";
import {
  gamePlaneZ,
  gl,
  isRemotelyOnscreenReducedWorldCoords,
  mapGameXToWorld,
  mapGameYToWorld,
  particleProgramInfo,
  particleRenderingProgramInfo,
  projectionMatrix,
} from "./3dDrawing";
import { maxMissileLifetime, missileDefs } from "./defs";
import { resolveAnchor } from "./effects";
import { EffectAnchor, EffectAnchorKind, effectiveInfinity } from "./game";
import { Position } from "./geometry";
import { getParticlePref, lastSelf, state } from "./globals";
import { loadTexture } from "./modelLoader";

let count: number;

const randomNoise = (width: number, height: number, channels: number) => {
  const data = new Uint8Array(width * height * channels);
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.floor(Math.random() * 255);
  }
  return data;
};

let particleTextures: WebGLTexture = [];

const initTextures = (gl: WebGL2RenderingContext, callback: () => void) => {
  Promise.all(["particle_test.png"].map((file) => loadTexture(file, gl)))
    .then((textures) => {
      particleTextures = textures;
      callback();
    })
    .catch(console.error);
};

const initializeParticleData = (count: number, minAge: number, maxAge: number) => {
  const data = new Float32Array(count * 12);
  for (let i = 0; i < count; i++) {
    // Position
    data[i * 12 + 0] = Math.random() * 2 - 1;
    data[i * 12 + 1] = Math.random() * 2 - 1;
    data[i * 12 + 2] = Math.random() * 2 - 1;
    // Age
    const age = Math.random() * (maxAge - minAge) + minAge;
    data[i * 12 + 3] = age;
    // Life
    data[i * 12 + 4] = age + 1;
    // Velocity
    data[i * 12 + 5] = Math.random() * 0.01 - 0.005;
    data[i * 12 + 6] = Math.random() * 0.01 - 0.005;
    data[i * 12 + 7] = Math.random() * 0.01 - 0.005;
    // Behavior
    // Type, Drag, -, -
    data[i * 12 + 8] = 1.0;
    data[i * 12 + 9] = 1.0;
    data[i * 12 + 10] = 1.0;
    data[i * 12 + 11] = 1.0;
  }
  return data;
};

let noiseTexture: WebGLTexture;
let particleAOs: WebGLVertexArrayObject[] = [];
let particleRenderAOs: WebGLVertexArrayObject[] = [];
let particleBuffers: WebGLBuffer[] = [];
let behaviorBuffers: WebGLBuffer[] = [];

const reinitializeParticleSystem = (newCount: number) => {
  if (newCount === count) {
    return;
  }
  clearEmitters();
  count = newCount;
  createBuffers();
};

const createBuffers = () => {
  count = getParticlePref() ?? 50000;
  particleAOs.length = 0;
  particleRenderAOs.length = 0;
  particleBuffers.length = 0;
  behaviorBuffers.length = 0;

  // Create a texture with the noise
  const noise = randomNoise(1024, 1024, 4);
  noiseTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, noiseTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 512, 512, 0, gl.RGBA, gl.UNSIGNED_BYTE, noise);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  const particleData = initializeParticleData(count, 0, 20);
  for (let i = 0; i < 2; i++) {
    const particleBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, particleBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, particleData, gl.STREAM_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    particleBuffers.push(particleBuffer);

    const particleAO = gl.createVertexArray();
    gl.bindVertexArray(particleAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, particleBuffer);
    if (particleProgramInfo.attribLocations.position !== -1) {
      const offset = 0;
      const stride = 48;
      const numComponents = 3;
      gl.vertexAttribPointer(particleProgramInfo.attribLocations.position, numComponents, gl.FLOAT, false, stride, offset);
      gl.enableVertexAttribArray(particleProgramInfo.attribLocations.position);
    }
    if (particleProgramInfo.attribLocations.age !== -1) {
      const offset = 12;
      const stride = 48;
      const numComponents = 1;
      gl.vertexAttribPointer(particleProgramInfo.attribLocations.age, numComponents, gl.FLOAT, false, stride, offset);
      gl.enableVertexAttribArray(particleProgramInfo.attribLocations.age);
    }
    if (particleProgramInfo.attribLocations.life !== -1) {
      const offset = 16;
      const stride = 48;
      const numComponents = 1;
      gl.vertexAttribPointer(particleProgramInfo.attribLocations.life, numComponents, gl.FLOAT, false, stride, offset);
      gl.enableVertexAttribArray(particleProgramInfo.attribLocations.life);
    }
    if (particleProgramInfo.attribLocations.velocity !== -1) {
      const offset = 20;
      const stride = 48;
      const numComponents = 3;
      gl.vertexAttribPointer(particleProgramInfo.attribLocations.velocity, numComponents, gl.FLOAT, false, stride, offset);
      gl.enableVertexAttribArray(particleProgramInfo.attribLocations.velocity);
    }
    if (particleProgramInfo.attribLocations.behavior !== -1) {
      const offset = 32;
      const stride = 48;
      const numComponents = 4;
      gl.vertexAttribPointer(particleProgramInfo.attribLocations.behavior, numComponents, gl.FLOAT, false, stride, offset);
      gl.enableVertexAttribArray(particleProgramInfo.attribLocations.behavior);
    }
    gl.bindVertexArray(null);
    particleAOs.push(particleAO);

    const particleRenderAO = gl.createVertexArray();
    gl.bindVertexArray(particleRenderAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, particleBuffer);
    if (particleRenderingProgramInfo.attribLocations.position !== -1) {
      const offset = 0;
      const stride = 48;
      const numComponents = 3;
      gl.vertexAttribPointer(particleRenderingProgramInfo.attribLocations.position, numComponents, gl.FLOAT, false, stride, offset);
      gl.enableVertexAttribArray(particleRenderingProgramInfo.attribLocations.position);
      gl.vertexAttribDivisor(particleRenderingProgramInfo.attribLocations.position, 1);
    }
    if (particleRenderingProgramInfo.attribLocations.age !== -1) {
      const offset = 12;
      const stride = 48;
      const numComponents = 1;
      gl.vertexAttribPointer(particleRenderingProgramInfo.attribLocations.age, numComponents, gl.FLOAT, false, stride, offset);
      gl.enableVertexAttribArray(particleRenderingProgramInfo.attribLocations.age);
      gl.vertexAttribDivisor(particleRenderingProgramInfo.attribLocations.age, 1);
    }
    if (particleRenderingProgramInfo.attribLocations.life !== -1) {
      const offset = 16;
      const stride = 48;
      const numComponents = 1;
      gl.vertexAttribPointer(particleRenderingProgramInfo.attribLocations.life, numComponents, gl.FLOAT, false, stride, offset);
      gl.enableVertexAttribArray(particleRenderingProgramInfo.attribLocations.life);
      gl.vertexAttribDivisor(particleRenderingProgramInfo.attribLocations.life, 1);
    }
    if (particleRenderingProgramInfo.attribLocations.velocity !== -1) {
      const offset = 20;
      const stride = 48;
      const numComponents = 3;
      gl.vertexAttribPointer(particleRenderingProgramInfo.attribLocations.velocity, numComponents, gl.FLOAT, false, stride, offset);
      gl.enableVertexAttribArray(particleRenderingProgramInfo.attribLocations.velocity);
      gl.vertexAttribDivisor(particleRenderingProgramInfo.attribLocations.velocity, 1);
    }
    if (particleRenderingProgramInfo.attribLocations.behavior !== -1) {
      const offset = 32;
      const stride = 48;
      const numComponents = 4;
      gl.vertexAttribPointer(particleRenderingProgramInfo.attribLocations.behavior, numComponents, gl.FLOAT, false, stride, offset);
      gl.enableVertexAttribArray(particleRenderingProgramInfo.attribLocations.behavior);
      gl.vertexAttribDivisor(particleRenderingProgramInfo.attribLocations.behavior, 1);
    }
    gl.bindVertexArray(null);
    particleRenderAOs.push(particleRenderAO);
  }
};

enum EmitterKind {
  Nop = 0,
  Explosion = 1,
  Trail = 2,
  Smoke = 3,
  Warp = 4,
}

// The particle system operates in "reduced world" coordinates
// x = gameX / 10
// y = -gameY / 10
type Emitter = {
  position: [number, number, number, number];
  velocity: [number, number, number];
  kind: EmitterKind;
  weight: number;
  from: EffectAnchor;
};

const clearEmitters = () => {
  killParticles();
  emitters.length = 0;
};

const emitters: Emitter[] = [];

const updateEmitter = (emitter: Emitter, sixtieths: number) => {
  if (emitter.from.kind === EffectAnchorKind.Projectile) {
    const projectile = state.projectiles.get(emitter.from.value as number);
    if (!projectile) {
      return true;
    }
    emitter.position[0] = projectile.position.x / 10;
    emitter.position[1] = -projectile.position.y / 10;
    if (emitter.velocity[2] < 0) {
      emitter.velocity[2] += sixtieths;
    } else {
      emitter.velocity[2] = 1;
    }
    return false;
  } else if (emitter.from.kind === EffectAnchorKind.Missile) {
    const missile = state.missiles.get(emitter.from.value as number);
    if (!missile) {
      return true;
    }
    const def = missileDefs[missile.defIndex];
    emitter.position[0] = missile.position.x / 10;
    emitter.position[1] = -missile.position.y / 10;
    emitter.position[2] = missile.speed / def.speed;
    emitter.velocity[0] = Math.cos(missile.heading);
    emitter.velocity[1] = -Math.sin(missile.heading);
    return false;
  } else if (emitter.from.kind === EffectAnchorKind.Absolute) {
    // I have emitter drag in the position z component
    emitter.velocity[0] *= emitter.position[2];
    emitter.velocity[1] *= emitter.position[2];
    emitter.position[0] += emitter.velocity[0] * sixtieths;
    emitter.position[1] += emitter.velocity[1] * sixtieths;
    return false;
  } else {
    console.warn("Unknown emitter kind", emitter.from);
  }
  return true;
};

// This is a place where ubos would be good
const bindEmitters = (sixtieths: number) => {
  let bindingIndex = 0;
  let totalWeight = 0;
  for (let i = 0; i < emitters.length; i++) {
    emitters[i].position[3] -= sixtieths;
    if (emitters[i].position[3] <= 0 || updateEmitter(emitters[i], sixtieths)) {
      emitters.splice(i, 1);
      i--;
      continue;
    }
    if (bindingIndex < 24 && isRemotelyOnscreenReducedWorldCoords(emitters[i].position[0], emitters[i].position[1])) {
      gl.uniform1ui(particleProgramInfo.uniformLocations.emitTypes[bindingIndex], emitters[i].kind);
      gl.uniform4fv(particleProgramInfo.uniformLocations.emitPositions[bindingIndex], emitters[i].position);
      // console.log(emitters[i].position);
      gl.uniform4fv(particleProgramInfo.uniformLocations.emitVelocities[bindingIndex], emitters[i].velocity);
      gl.uniform1f(particleProgramInfo.uniformLocations.emitWeights[bindingIndex], emitters[i].weight);
      totalWeight += emitters[i].weight;
      bindingIndex++;
    }
  }
  if (bindingIndex === 0) {
    // bind a nop emitter
    gl.uniform1ui(particleProgramInfo.uniformLocations.emitTypes[0], EmitterKind.Nop);
    gl.uniform1f(particleProgramInfo.uniformLocations.emitWeights[0], 1);
    totalWeight = 1;
  }
  gl.uniform1f(particleProgramInfo.uniformLocations.totalWeight, totalWeight);
  // console.log(emitters.length);
};

enum TrailColors {
  White = 0,
  Red = 1,
  YellowGreen = 2,
}

const pushTrailEmitter = (from: EffectAnchor, color = TrailColors.White) => {
  if (from.kind === EffectAnchorKind.Projectile) {
    const projectile = state.projectiles.get(from.value as number);
    if (projectile) {
      const position = [projectile.position.x / 10, -projectile.position.y / 10, color, 120];
      const velocity = [(Math.cos(projectile.heading) * projectile.speed) / -10, (Math.sin(projectile.heading) * projectile.speed) / 10, -3, 0];
      const kind = EmitterKind.Trail;
      const weight = 4;
      emitters.push({ position, velocity, kind, weight, from } as Emitter);
      return projectile.position;
    }
  } else {
    console.warn("Unsupported anchor trail", from);
  }
};

const pushSmokeEmitter = (from: EffectAnchor) => {
  if (from.kind === EffectAnchorKind.Missile) {
    const missile = state.missiles.get(from.value as number);
    if (missile) {
      const def = missileDefs[missile.defIndex];
      const position = [missile.position.x / 10, -missile.position.y / 10, missile.speed / def.speed, maxMissileLifetime];
      const velocity = [Math.cos((missile.heading * from.speed) / 10), (-Math.sin(missile.heading) * from.speed) / 10, missile.radius / 10, 0];
      const kind = EmitterKind.Smoke;
      const weight = 4;
      emitters.push({ position, velocity, kind, weight, from } as Emitter);
      return missile.position;
    }
  } else {
    console.warn("Unsupported anchor smoke", from);
  }
};

enum ExplosionKind {
  Normal = 0,
  Impulse = 1,
  EMP = 2,
  Plasma = 3,
}

const pushExplosionEmitter = (from: EffectAnchor, size = 1, explosionKind = ExplosionKind.Normal) => {
  if (from.kind === EffectAnchorKind.Absolute) {
    const position = [(from.value as Position).x / 10, -(from.value as Position).y / 10, 0.96, 15];
    let velocity = [0, 0, size, explosionKind];
    if (from.heading !== undefined) {
      const x = (Math.cos(from.heading) * from.speed) / 10;
      const y = (Math.sin(from.heading) * from.speed) / -10;
      velocity = [x, y, size, explosionKind];
    }
    const weight = 20 * size;
    const kind = EmitterKind.Explosion;
    emitters.push({ position, velocity, kind, weight, from } as Emitter);
    return from.value as Position;
  } else {
    console.warn("Unsupported anchor explosion", from);
  }
};

const pushWarpEmitter = (from: EffectAnchor) => {
  if (from.kind === EffectAnchorKind.Absolute) {
    const position = [(from.value as Position).x / 10, -(from.value as Position).y / 10, 0, 8];
    const x = (Math.cos(from.heading) * from.speed) / 10;
    const y = (Math.sin(from.heading) * from.speed) / -10;
    const velocity = [x, y, 0, 0];
    const weight = 4;
    const kind = EmitterKind.Warp;
    emitters.push({ position, velocity, kind, weight, from } as Emitter);
    return from.value as Position;
  } else {
    console.warn("Unsupported anchor warp", from);
  }
};

let toKillParticles = false;

const killParticles = () => {
  toKillParticles = true;
};

let readIndex = 0;

const draw = (sixtieths: number) => {
  gl.useProgram(particleProgramInfo.program);

  if (toKillParticles) {
    gl.uniform1ui(particleProgramInfo.uniformLocations.killParticles, 1);
  }

  gl.uniform1f(particleProgramInfo.uniformLocations.timeDelta, sixtieths);
  gl.bindTexture(gl.TEXTURE_2D, noiseTexture);
  gl.activeTexture(gl.TEXTURE0);
  gl.uniform1i(particleProgramInfo.uniformLocations.noise, 0);

  bindEmitters(sixtieths);

  gl.bindVertexArray(particleAOs[readIndex]);

  gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, particleBuffers[readIndex ^ 1]);
  gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 1, behaviorBuffers[readIndex ^ 1]);
  gl.enable(gl.RASTERIZER_DISCARD);
  gl.beginTransformFeedback(gl.POINTS);
  gl.drawArrays(gl.POINTS, 0, count);
  gl.endTransformFeedback();
  gl.disable(gl.RASTERIZER_DISCARD);
  gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);
  gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 1, null);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  readIndex = (readIndex + 1) % 2;

  if (toKillParticles) {
    toKillParticles = false;
    gl.uniform1ui(particleProgramInfo.uniformLocations.killParticles, 0);
  }

  // Rendering
  gl.useProgram(particleRenderingProgramInfo.program);

  gl.bindVertexArray(particleRenderAOs[readIndex]);
  const viewMatrix = mat4.create();
  mat4.translate(viewMatrix, viewMatrix, [-lastSelf.position.x / 10, lastSelf.position.y / 10, gamePlaneZ]);

  gl.uniformMatrix4fv(particleRenderingProgramInfo.uniformLocations.projectionMatrix, false, projectionMatrix);
  gl.uniformMatrix4fv(particleRenderingProgramInfo.uniformLocations.viewMatrix, false, viewMatrix);

  // bind the texture to texture unit 0
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, particleTextures[0]);
  gl.uniform1i(particleRenderingProgramInfo.uniformLocations.particleTexture, 0);

  // gl.disable(gl.DEPTH_TEST);
  gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, count);
  // gl.enable(gl.DEPTH_TEST);
  gl.bindVertexArray(null);
};

export {
  randomNoise,
  createBuffers as createParticleBuffers,
  draw as drawParticles,
  initTextures as initParticleTextures,
  pushTrailEmitter,
  pushSmokeEmitter,
  pushExplosionEmitter,
  pushWarpEmitter,
  TrailColors,
  ExplosionKind,
  clearEmitters,
  reinitializeParticleSystem,
  count as particleCount,
};
