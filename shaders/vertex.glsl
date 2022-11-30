#version 300 es
in vec4 aVertexPosition;
in vec2 aTextureCoord;
in vec3 aVertexNormal;

uniform mat4 uModelMatrix;
uniform mat4 uViewMatrix;
uniform mat4 uProjectionMatrix;
uniform mat4 uNormalMatrix;
uniform vec4 uPointLights[4];

uniform int uDrawType;

out highp vec2 vTextureCoord;
out highp vec3 vVertexNormal;
out highp vec3 vPointLights[4];
out highp vec3 vVertexPosition;
flat out int vDrawType;

void main() {
  gl_Position = uProjectionMatrix * uViewMatrix * uModelMatrix * aVertexPosition;

  // The vertex position in relative world space
  vVertexPosition = (uViewMatrix * uModelMatrix * aVertexPosition).xyz;

  if (uDrawType == 0) {
    for (int i = 0; i < 4; i++) {
      vPointLights[i] = (uViewMatrix * uPointLights[i]).xyz;
    }
  }

  vDrawType = uDrawType;

  vTextureCoord = aTextureCoord;
  vVertexNormal = normalize((uNormalMatrix * vec4(aVertexNormal, 1.0)).xyz);
}
