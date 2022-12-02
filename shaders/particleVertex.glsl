#version 300 es
precision mediump float;

layout (location = 0) in vec3 aPosition;
layout (location = 1) in float aAge;
layout (location = 2) in vec3 aVelocity;
layout (location = 3) in float aLife;

uniform float uTimeDelta;
uniform sampler2D uNoise;
uniform vec3 uGravity;
uniform vec3 uOrigin;
uniform float uMinSpeed;
uniform float uMaxSpeed;

out vec3 vPosition;
out float vAge;
out vec3 vVelocity;
out float vLife;

void main() {
  // if (aAge >= aLife) {
  //   ivec2 noiseCoord = ivec2(gl_VertexID % 512, gl_VertexID / 512);
    
  //   vec4 rand = texelFetch(uNoise, noiseCoord, 0);

  //   vec3 dir = normalize(rand.xyz - 0.5);

  //   vPosition = uOrigin;

  //   vAge = 0.0;
  //   vLife = aLife;

  //   vVelocity = dir * (uMinSpeed + rand.g * (uMaxSpeed - uMinSpeed));
  // } else {
    vPosition = aPosition;
    vAge = aAge + uTimeDelta;
    vLife = aLife;
    vVelocity = aVelocity + uGravity * uTimeDelta;
  // }
}
