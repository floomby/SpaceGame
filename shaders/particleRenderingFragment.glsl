#version 300 es
precision mediump float;

in float vAge;
in float vLife;

layout(location = 0) out vec4 outColor;

void main() {
  outColor = vec4(1.0) * vAge / 20.0;
  // outColor = vec4(1.0);
}