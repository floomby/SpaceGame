#version 300 es
in vec4 aVertexPosition;
in vec2 aTextureCoord;
in vec3 aVertexNormal;
in vec4 aVertexColor;

uniform mat4 uModelMatrix;
uniform mat4 uViewMatrix;
uniform mat4 uProjectionMatrix;
uniform mat4 uNormalMatrix;
// I am going to highjack the first point lights for pushing the line data to the shader when uDrawType is set to Line (11)
uniform vec4 uPointLights[10];
// When drawing asteroids the "health" is the resources left
uniform mediump vec3 uHealthAndEnergyAndScale;
// uniform mediump vec4 uDesaturateAndTransparencyAndWarpingAndHighlight;
uniform mediump float uPhase;

uniform int uDrawType;

out highp vec2 vTextureCoord;
out highp vec3 vNormal;
out highp vec3 vPointLights[10];
// The vPosition is also use for passing the bar realative fragment position to the fragment shader
out highp vec3 vPosition;
flat out int vDrawType;
out highp vec4 vColor;

void main() {
  vDrawType = uDrawType;

  // World lines
  if (uDrawType == 11) {
    vec2 from = uPointLights[0].xy;
    vec2 to = uPointLights[0].zw;
    float width = uPointLights[1].x;
    float dropoff = uPointLights[1].y;

    vec2 basisParallel = normalize(to - from);
    vec2 basisPerpendicular = vec2(-basisParallel.y, basisParallel.x);

    vec4 topLeft = vec4(
      from + basisPerpendicular * width / 2.0,
      0.0,
      1.0
    );
    vec4 topRight = vec4(
      to + basisPerpendicular * width / 2.0,
      0.0,
      1.0
    );
    vec4 bottomLeft = vec4(
      from - basisPerpendicular * width / 2.0,
      0.0,
      1.0
    );
    vec4 bottomRight = vec4(
      to - basisPerpendicular * width / 2.0,
      0.0,
      1.0
    );
    vec4 centerLeft = vec4(
      from,
      0.0,
      1.0
    );
    vec4 centerRight = vec4(
      to,
      0.0,
      1.0
    );

    int idx = gl_VertexID % 6;

    if (gl_VertexID > 5) {
      topRight = centerRight;
      topLeft = centerLeft;
      if (idx == 0 || idx == 1 || idx == 4) {
        vPosition = vec3(1.0, 0.0, 0.0);
      } else {
        vPosition = vec3(1.0 - dropoff, 0.0, 0.0);
      }
    } else {
      if (idx == 0 || idx == 1 || idx == 4) {
        vPosition = vec3(1.0 - dropoff, 0.0, 0.0);
      } else {
        vPosition = vec3(1.0, 0.0, 0.0);
      }
      bottomRight = centerRight;
      bottomLeft = centerLeft;
    }

    if (idx == 0) {
      gl_Position = uProjectionMatrix * uViewMatrix * topLeft;
    } else if (idx == 1) {
      gl_Position = uProjectionMatrix * uViewMatrix * topRight;
    } else if (idx == 2) {
      gl_Position = uProjectionMatrix * uViewMatrix * bottomLeft;
    } else if (idx == 3) {
      gl_Position = uProjectionMatrix * uViewMatrix * bottomLeft;
    } else if (idx == 4) {
      gl_Position = uProjectionMatrix * uViewMatrix * topRight;
    } else if (idx == 5) {
      gl_Position = uProjectionMatrix * uViewMatrix * bottomRight;
    }

    vColor = uPointLights[2];
    return;
  }

  vColor = aVertexColor;

  // Hud polygon
  if (uDrawType == 2) {
    gl_Position = vec4(aVertexPosition.xyz, 1.0);
    return;
  }

  // In world health bar or resource
  if (uDrawType == 3 || uDrawType == 7) {
    gl_Position = uProjectionMatrix * uViewMatrix *
      vec4(aVertexPosition.x * uHealthAndEnergyAndScale.z, aVertexPosition.y + uHealthAndEnergyAndScale.z, aVertexPosition.z, 1.0);
    vPosition = vec3(aVertexPosition.x / 2.0 + 0.5, 0.0, 0.0);
    return;
  }

  // In world energy bar
  if (uDrawType == 4) {
    gl_Position = uProjectionMatrix  * uViewMatrix * 
      vec4(aVertexPosition.x * uHealthAndEnergyAndScale.z, aVertexPosition.y - 0.5 + uHealthAndEnergyAndScale.z, aVertexPosition.z, 1.0);
    vPosition = vec3(aVertexPosition.x / 2.0 + 0.5, 0.0, 0.0);
    return;
  }

  // In target display health bar or resource
  if (uDrawType == 8 || uDrawType == 10) {
    gl_Position = uProjectionMatrix * uViewMatrix *
      vec4(aVertexPosition.x * uHealthAndEnergyAndScale.z, (aVertexPosition.y + 1.0) * uHealthAndEnergyAndScale.z / 2.0, aVertexPosition.z, 1.0);
    vPosition = vec3(aVertexPosition.x / 2.0 + 0.5, 0.0, 0.0);
    return;
  }

  // In target display energy bar
  if (uDrawType == 9) {
    gl_Position = uProjectionMatrix  * uViewMatrix * 
      vec4(aVertexPosition.x * uHealthAndEnergyAndScale.z, (aVertexPosition.y - 0.5 + 1.0) * uHealthAndEnergyAndScale.z / 2.0, aVertexPosition.z, 1.0);
    vPosition = vec3(aVertexPosition.x / 2.0 + 0.5, 0.0, 0.0);
    return;
  }

  // Background
  if (uDrawType == 5) {
    gl_Position = aVertexPosition.xyzz;
    vTextureCoord = (uViewMatrix * aVertexPosition).xy / 2.0 + 0.5;
    return;
  }

  gl_Position = uProjectionMatrix * uViewMatrix * uModelMatrix * aVertexPosition;

  // The vertex position in relative world space
  vPosition = (uViewMatrix * uModelMatrix * aVertexPosition).xyz;

  if (uDrawType == 0) {
    for (int i = 0; i < 10; i++) {
      vPointLights[i] = (uViewMatrix * uPointLights[i]).xyz;
    }
  }

  vTextureCoord = aTextureCoord;
  vNormal = normalize((uNormalMatrix * vec4(aVertexNormal, 1.0)).xyz);
}
