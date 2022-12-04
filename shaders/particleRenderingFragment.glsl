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
  if (vBehavior.x < 0.0) {
    discard;
  } else if (vBehavior.x < 1.0) {
    outColor = texture(uSample, vTextureCoord) * vLife / 20.0;
  } else {
    vec4 color = texture(uSample, vTextureCoord);
    outColor = vec4(color.rrr, color.a);
  }
  // }
}