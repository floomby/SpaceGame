#version 300 es
precision mediump float;

layout (location = 0) in vec3 aPosition;
layout (location = 1) in float aAge;
layout (location = 2) in vec3 aVelocity;
layout (location = 3) in float aLife;

uniform mat4 uProjectionMatrix;
uniform mat4 uViewMatrix;

out float vAge;

void main() {
  gl_PointSize = 1.0;
  gl_Position = uProjectionMatrix * uViewMatrix * vec4(aPosition, 1.0);
  vAge = aAge;
}