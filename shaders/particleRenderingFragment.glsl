#version 300 es
precision mediump float;

uniform sampler2D uSample;

in float vAge;
in float vLife;
in vec2 vTextureCoord;
in vec4 vBehavior;

layout(location = 0) out vec4 outColor;

void main() {
  if (vBehavior.x < 0.0) {
    discard;
  } else if (vBehavior.x < 1.0) {
    outColor = vec4(vec3(1.0, 0.9, 0.9) * (1.0 - vAge / vLife), (1.0 - vAge / vLife) * 3.0);
  } else  if (vBehavior.x < 2.0) {
    vec4 color = texture(uSample, vTextureCoord);
    outColor = vec4(color.rrr, color.a);
  } else if (vBehavior.x < 3.0) {
    outColor = vec4(vec3(1.0, 0.5, 0.5) * (1.0 - vAge / vLife), 1.0);
  } else {
    vec4 color = texture(uSample, vTextureCoord);
    outColor = vec4(vec3((vLife - 30.0) / 60.0, (vLife - 30.0) / 60.0, 1.0) * color.r, color.a);
  }
}