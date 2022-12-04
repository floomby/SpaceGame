#version 300 es
precision mediump float;

uniform sampler2D uSample;

in float vAge;
in float vLife;
in vec2 vTextureCoord;
in vec4 vBehavior;

layout(location = 0) out vec4 outColor;

void main() {
  // if (vBehavior.x > 1.0) {
  //   outColor = vec4(1.0) * vLife / 20.0;
  // } else {
    outColor = texture(uSample, vTextureCoord);
  // }
}