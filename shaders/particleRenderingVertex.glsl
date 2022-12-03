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
out vec2 vTextureCoord;
out vec4 vColor;

const vec3 topLeft = vec3(-1.0, 1.0, 0.0);
const vec3 topRight = vec3(1.0, 1.0, 0.0);
const vec3 bottomLeft = vec3(-1.0, -1.0, 0.0);
const vec3 bottomRight = vec3(1.0, -1.0, 0.0);

const vec2 textureTopLeft = vec2(0.0, 1.0);
const vec2 textureTopRight = vec2(1.0, 1.0);
const vec2 textureBottomLeft = vec2(0.0, 0.0);
const vec2 textureBottomRight = vec2(1.0, 0.0);

void main() {
  gl_PointSize = aAge * 0.1;
  if (gl_VertexID % 6 == 0) {
    gl_Position = uProjectionMatrix * uViewMatrix * vec4(aPosition + topLeft * aAge / 4000.0, 1.0);
    vTextureCoord = textureTopLeft;
  } else if (gl_VertexID % 6 == 1) {
    gl_Position = uProjectionMatrix * uViewMatrix * vec4(aPosition + topRight * aAge / 4000.0, 1.0);
    vTextureCoord = textureTopRight;
  } else if (gl_VertexID % 6 == 2) {
    gl_Position = uProjectionMatrix * uViewMatrix * vec4(aPosition + bottomLeft * aAge / 4000.0, 1.0);
    vTextureCoord = textureBottomLeft;
  } else if (gl_VertexID % 6 == 3) {
    gl_Position = uProjectionMatrix * uViewMatrix * vec4(aPosition + bottomLeft * aAge / 4000.0, 1.0);
    vTextureCoord = textureBottomLeft;
  } else if (gl_VertexID % 6 == 4) {
    gl_Position = uProjectionMatrix * uViewMatrix * vec4(aPosition + topRight * aAge / 4000.0, 1.0);
    vTextureCoord = textureTopRight;
  } else if (gl_VertexID % 6 == 5) {
    gl_Position = uProjectionMatrix * uViewMatrix * vec4(aPosition + bottomRight * aAge / 4000.0, 1.0);
    vTextureCoord = textureBottomRight;
  }
  vAge = aAge;
  vLife = aLife;
}