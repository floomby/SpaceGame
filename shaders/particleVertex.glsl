#version 300 es
precision mediump float;

layout (location = 0) in vec3 aPosition;
layout (location = 1) in float aAge;
layout (location = 2) in float aLife;
layout (location = 3) in vec3 aVelocity;
layout (location = 4) in vec4 aBehavior;

uniform float uTimeDelta;
uniform sampler2D uNoise;
uniform vec3 uGravity;
uniform vec3 uOrigin;
uniform float uMinSpeed;
uniform float uMaxSpeed;

out vec3 vPosition;
out float vAge;
out float vLife;
out vec3 vVelocity;
out vec4 vBehavior;

void main() {
  if (aAge >= aLife) {
    ivec2 noiseCoord = ivec2(gl_VertexID % 512, gl_VertexID / 512);
    
    vec4 rand = texelFetch(uNoise, noiseCoord, 0);

    vec3 dir = normalize(rand.xyz - 0.5);

    vPosition = aBehavior.xyz + uOrigin;

    vAge = 0.0;
    vLife = rand.w * 80.0 + 15.0;

    vVelocity = dir * (uMinSpeed + rand.g * (uMaxSpeed - uMinSpeed));
    vBehavior = vec4(aBehavior.x + 0.5, 0.0, 0.0, 0.0);
  } else {
    vVelocity = aVelocity + uGravity * uTimeDelta;
    vPosition = vVelocity * uTimeDelta + aPosition;
    vAge = aAge + 1.0;
    vLife = aLife;
    vBehavior = aBehavior;
  }
}
