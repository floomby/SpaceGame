#version 300 es
precision mediump float;

layout (location = 0) in vec3 aPosition;
layout (location = 1) in float aAge;
layout (location = 2) in float aLife;
layout (location = 3) in vec3 aVelocity;
layout (location = 4) in vec4 aBehavior;

uniform mat4 uProjectionMatrix;
uniform mat4 uViewMatrix;

out float vAge;
out float vLife;
out vec2 vTextureCoord;
out vec4 vBehavior;

const vec3 topLeft = vec3(-1.0, 1.0, 0.0);
const vec3 topRight = vec3(1.0, 1.0, 0.0);
const vec3 bottomLeft = vec3(-1.0, -1.0, 0.0);
const vec3 bottomRight = vec3(1.0, -1.0, 0.0);

const vec2 textureTopLeft = vec2(0.0, 1.0);
const vec2 textureTopRight = vec2(1.0, 1.0);
const vec2 textureBottomLeft = vec2(0.0, 0.0);
const vec2 textureBottomRight = vec2(1.0, 0.0);

void main() {
  float scale = 0.0;

  if (aBehavior.x < 0.0) {
    gl_Position = vec4(0.0);
    vBehavior = aBehavior;
    return;
  } else if (aBehavior.x < 1.0) {
    scale = 1.0;
  } else if (aBehavior.x < 2.0) {
    scale = 1.0 - aAge / aLife;
  } else if (aBehavior.x < 3.0) {
    scale = 1.0;
  }

  if (gl_VertexID % 6 == 0) {
    gl_Position = uProjectionMatrix * uViewMatrix * vec4(aPosition + topLeft * scale * 0.03, 1.0);
    vTextureCoord = textureTopLeft;
  } else if (gl_VertexID % 6 == 1) {
    gl_Position = uProjectionMatrix * uViewMatrix * vec4(aPosition + topRight * scale * 0.03, 1.0);
    vTextureCoord = textureTopRight;
  } else if (gl_VertexID % 6 == 2) {
    gl_Position = uProjectionMatrix * uViewMatrix * vec4(aPosition + bottomLeft * scale * 0.03, 1.0);
    vTextureCoord = textureBottomLeft;
  } else if (gl_VertexID % 6 == 3) {
    gl_Position = uProjectionMatrix * uViewMatrix * vec4(aPosition + bottomLeft * scale * 0.03, 1.0);
    vTextureCoord = textureBottomLeft;
  } else if (gl_VertexID % 6 == 4) {
    gl_Position = uProjectionMatrix * uViewMatrix * vec4(aPosition + topRight * scale * 0.03, 1.0);
    vTextureCoord = textureTopRight;
  } else if (gl_VertexID % 6 == 5) {
    gl_Position = uProjectionMatrix * uViewMatrix * vec4(aPosition + bottomRight * scale * 0.03, 1.0);
    vTextureCoord = textureBottomRight;
  }
  vAge = aAge;
  vLife = aLife;
  vBehavior = aBehavior;
}