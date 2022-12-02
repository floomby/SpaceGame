#version 300 es
precision mediump float;

in vec3 aPosition;
in float aAge;
in float aLife;
in vec3 aVelocity;

uniform float uTimeDelta;
uniform sampler2D uNoise;
uniform vec3 uGravity;
uniform vec3 uOrigin;
uniform float uMinTheta;
uniform float uMaxTheta;
uniform float uMinSpeed;
uniform float uMaxSpeed;

out vec3 vPosition;
out float vAge;
out float vLife;
out vec3 vVelocity;

void main() {
  if (aAge >= aLife) {
    ivec2 noiseCoord = ivec2(gl_VertexID % 512, gl_VertexID / 512);
    
    vec4 rand = texelFetch(uNoise, noiseCoord, 0);

    vec3 dir = normalize(rand.xyz - 0.5);

    vPosition = uOrigin;

    vAge = 0.0;
    vLife = aLife;

    vVelocity = dir * (uMinSpeed + rand.g * (uMaxSpeed - uMinSpeed));
  } else {
    vPosition = aPosition + aVelocity * uTimeDelta;
    vAge = aAge + uTimeDelta;
    vLife = aLife;
    vVelocity = aVelocity + uGravity * uTimeDelta;
  }
}
