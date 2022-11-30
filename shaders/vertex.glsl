#version 300 es
in vec4 aVertexPosition;
in vec2 aTextureCoord;
in vec3 aVertexNormal;
in vec4 aVertexColor;

uniform mat4 uModelMatrix;
uniform mat4 uViewMatrix;
uniform mat4 uProjectionMatrix;
uniform mat4 uNormalMatrix;
uniform vec4 uPointLights[4];

uniform int uDrawType;

out highp vec2 vTextureCoord;
out highp vec3 vNormal;
out highp vec3 vPointLights[4];
out highp vec3 vPosition;
flat out int vDrawType;
out highp vec4 vColor;

void main() {
  vDrawType = uDrawType;
  vColor = aVertexColor;

  if (uDrawType == 2) {
    gl_Position = vec4(aVertexPosition.xyz, 1.0);
    return;
  }

  gl_Position = uProjectionMatrix * uViewMatrix * uModelMatrix * aVertexPosition;

  // The vertex position in relative world space
  vPosition = (uViewMatrix * uModelMatrix * aVertexPosition).xyz;

  if (uDrawType == 0) {
    for (int i = 0; i < 4; i++) {
      vPointLights[i] = (uViewMatrix * uPointLights[i]).xyz;
    }
  }

  vTextureCoord = aTextureCoord;
  vNormal = normalize((uNormalMatrix * vec4(aVertexNormal, 1.0)).xyz);
}
