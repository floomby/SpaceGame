#version 300 es
precision mediump float;

layout (location = 0) in vec3 aPosition;
layout (location = 1) in float aAge;
layout (location = 2) in float aLife;
layout (location = 3) in vec3 aVelocity;
layout (location = 4) in vec4 aBehavior;

uniform float uTimeDelta;
uniform sampler2D uNoise;

out vec3 vPosition;
out float vAge;
out float vLife;
out vec3 vVelocity;
out vec4 vBehavior;

// UBOs exist in webgl2, but I am not wanting to figure out the javascript api for it right now
uniform float uEmitWeight[24];
uniform uint uEmitType[24];
// Despite calling these velocity and position there is often extra stuff in the z components that are neither velocity nor position data
// It is dependent on the type of particle being emitted
// The w component of the position is the time remaining before the emitter times out (other conditions may cause the emitter to be removed anyway)
uniform vec4 uEmitPosition[24];
uniform vec4 uEmitVelocity[24];

uniform float uTotalWeight;

void emitNop() {
  vBehavior = vec4(-1.0, 0.0, 0.0, 0.0);
  ivec2 noiseCoord = ivec2(gl_VertexID % 512, gl_VertexID / 512);
  vec2 noise = texelFetch(uNoise, noiseCoord, 0).xy;
  vLife = noise.x * 5.0 + 5.0;
  vAge = 0.0;
}

void emitExplosion(uint index) {
  vBehavior = vec4(0.5, 0.85, uEmitVelocity[index].w, 0.0);
  ivec2 noiseCoord = ivec2(gl_VertexID % 512, gl_VertexID / 512);
  ivec2 noiseCoord2 = ivec2(gl_VertexID % 512, (gl_VertexID / 512) + 1);
  vec4 rand = texelFetch(uNoise, noiseCoord, 0);
  vec4 rand2 = texelFetch(uNoise, noiseCoord2, 0);

  vAge = 0.0;
  vLife = rand2.x * 90.0 + 5.0;

  vec3 dir = normalize(rand.xyz - 0.5);
  vVelocity = dir * (rand.w * 0.7) + vec3(uEmitVelocity[index].xy, 0.0) * uEmitVelocity[index].z;

  vPosition = uEmitPosition[index].xyz + dir * (rand2.y) * uEmitVelocity[index].z;
}

void emitTrail(uint index) {
  // Use the emitter position z uniform to determine color
  vBehavior = vec4(1.5, 0.93, uEmitPosition[index].z, 0.0);
  ivec2 noiseCoord = ivec2(gl_VertexID % 512, gl_VertexID / 512);
  ivec2 noiseCoord2 = ivec2(gl_VertexID % 512, (gl_VertexID / 512) + 1);
  vec4 rand = texelFetch(uNoise, noiseCoord, 0);
  vec4 rand2 = texelFetch(uNoise, noiseCoord2, 0);

  vAge = 0.0;
  vLife = rand2.x * 6.0 + 4.0;

  vec3 dir = normalize(rand.xyz - 0.5);
  dir = vec3(dir.xy, dir.z * 0.5);

  if (uEmitVelocity[index].z >= 0.0) {
    vPosition = vec3(uEmitPosition[index].xy, -0.3) + dir * (rand2.y * 0.3) + rand2.x * vec3(uEmitVelocity[index].xy, 0.0) * 2.0;
  } else {
    vPosition = vec3(uEmitPosition[index].xy, -0.3) + dir * (rand2.y * 0.3) - vec3(uEmitVelocity[index].xy, 0.0);
  }

  vVelocity = (rand2.y * 0.01) * dir - vec3(uEmitVelocity[index].xy, 0.0);
}

void emitSmoke(uint index) {
  vBehavior = vec4(2.5, 0.85, 0.0, 0.0);
  ivec2 noiseCoord = ivec2(gl_VertexID % 512, gl_VertexID / 512);
  ivec2 noiseCoord2 = ivec2(gl_VertexID % 512, (gl_VertexID / 512) + 1);
  vec4 rand = texelFetch(uNoise, noiseCoord, 0);
  vec4 rand2 = texelFetch(uNoise, noiseCoord2, 0);

  vAge = 0.0;
  vLife = rand2.x * 60.0 + 30.0;

  vec3 dir = normalize(rand.xyz - 0.5);
  dir = vec3(dir.xy, dir.z * 0.5);

  vPosition = vec3(uEmitPosition[index].xy, -0.3) + dir * (rand2.y * 0.2) - vec3(uEmitVelocity[index].xy, 0.0) * uEmitVelocity[index].z
   + vec3(uEmitVelocity[index].xy, 0.0) * rand2.z * 1.5;

  vVelocity = (rand2.y * 0.1) * dir - vec3(uEmitVelocity[index].xy, 0.0) * uEmitPosition[index].z;
}

void emitWarp(uint index) {
  vBehavior = vec4(3.5, 0.98, 0.0, 0.0);
  ivec2 noiseCoord = ivec2(gl_VertexID % 512, gl_VertexID / 512);
  vec4 rand = texelFetch(uNoise, noiseCoord, 0);
  ivec2 noiseCoord2 = ivec2(gl_VertexID % 512, (gl_VertexID / 512) + 1);
  vec4 rand2 = texelFetch(uNoise, noiseCoord2, 0);

  vAge = 0.0;
  vLife = rand2.w * 60.0 + 30.0;

  vec3 dir = normalize(rand.xyz - 0.5);
  dir = vec3(dir.xy, dir.z * 0.5);

  vec3 dir2 = normalize(rand2.xyz - 0.5);
  dir2 = vec3(dir2.xy, dir2.z * 0.5);

  vPosition = vec3(uEmitPosition[index].xy, -0.1) + dir * 3.0;

  vVelocity = uEmitVelocity[index].xyz + dir2 * 0.1;
}

void main() {
  if (aAge >= aLife) {
    ivec2 noiseCoord = ivec2(gl_VertexID % 512, gl_VertexID / 512 + 40);
    vec4 rand = texelFetch(uNoise, noiseCoord, 0);

    float weight = rand.x * uTotalWeight;
    
    uint index = 0u;
    while (true) {
      weight -= uEmitWeight[index];
      if (weight <= 0.0) {
        break;
      }
      index++;
    }
    if (index >  23u) {
      emitNop();
    }
    if (uEmitType[index] == 1u) {
      emitExplosion(index);
    } else if (uEmitType[index] == 2u) {
      emitTrail(index);
    } else if (uEmitType[index] == 3u) {
      emitSmoke(index);
    } else if (uEmitType[index] == 4u) {
      if (rand.y / uTotalWeight * 20.0 < 1.0) {
        emitWarp(index);
      } else {
        emitNop();
      }
    } else {
      emitNop();
    }
  } else {
    vVelocity = aVelocity * aBehavior.y;
    vPosition = vVelocity * uTimeDelta + aPosition;
    vAge = aAge + uTimeDelta;
    vLife = aLife;
    vBehavior = aBehavior;
  }
}
