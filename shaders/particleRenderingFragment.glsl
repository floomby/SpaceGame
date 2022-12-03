#version 300 es
precision mediump float;

uniform sampler2D uSample;

in float vAge;
in float vLife;
in vec2 vTextureCoord;
in vec4 vColor;

layout(location = 0) out vec4 outColor;

void main() {
  outColor = texture(uSample, vTextureCoord);
}