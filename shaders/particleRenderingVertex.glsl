#version 300 es
precision mediump float;

layout (location = 0) in vec3 aPosition;
layout (location = 1) in float aAge;
layout (location = 2) in float aLife;
layout (location = 3) in vec3 aVelocity;

uniform mat4 uProjectionMatrix;
uniform mat4 uViewMatrix;

out float vAge;
out float vLife;

void main() {
  gl_PointSize = aAge * 0.1;
  gl_Position = uProjectionMatrix * uViewMatrix * vec4(aPosition, 1.0);
  vAge = aAge;
  vLife = 20.0;
}