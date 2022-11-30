#version 300 es
in highp vec2 vTextureCoord;
in highp vec3 vNormal;
in highp vec3 vPointLights[4];
in highp vec3 vPosition;
flat in int vDrawType;
in highp vec4 vColor;

precision mediump float;

uniform vec3 uBaseColor;
uniform sampler2D uSampler;
uniform vec3 uPointLightLighting[4];
uniform vec2 uHealthAndEnergy;

layout(location = 0) out vec4 outColor;

void main(void) {
  if (vDrawType == 1) {
    outColor = vec4(uBaseColor, 1.0);
    return;
  }

  if (vDrawType == 2) {
    outColor = vColor;
    return;
  }

  // In world health bar
  if (vDrawType == 3) {
    if (vPosition.x > uHealthAndEnergy.x) {
      outColor = vec4(1.0, 0.0, 0.0, 0.8);
    } else {
      outColor = vec4(0.0, 1.0, 0.0, 0.8);
    }
    return;
  }

  // In world energy bar
  if (vDrawType == 4) {
    if (vPosition.x > uHealthAndEnergy.y) {
      outColor = vec4(0.3, 0.3, 0.3, 0.8);
    } else {
      outColor = vec4(0.0, 0.0, 1.0, 0.8);
    }
    return;
  }

  // Background
  if (vDrawType == 5) {
    outColor = texture(uSampler, vTextureCoord);
    return;
  }

  vec4 sampled = texture(uSampler, vTextureCoord);
  vec3 materialColor = mix(uBaseColor, sampled.rgb, sampled.a);

  vec3 pointLightSum = vec3(0.0, 0.0, 0.0);

  vec3 viewDir = normalize(vec3(0.0, 0.0, -1.0));
  
  for (int i = 0; i < 1; i++) {
    vec3 lightDirection = normalize(vPointLights[i] - vPosition);
    vec3 halfVector = normalize(lightDirection + viewDir);
    float lightDistance = length(vPointLights[i] - vPosition);
    
    float diffuse = max(dot(vNormal, lightDirection), 0.0) * 0.3;
    float specular = pow(max(dot(vNormal, halfVector), 0.0), 20.0);

    pointLightSum += (uPointLightLighting[i] * diffuse + specular) / max(lightDistance * lightDistance, 2.0);
  }
  
  // blinn-phong
  vec3 lightDir = normalize(vec3(0.0, 1.0, 1.0));
  vec3 halfDir = normalize(lightDir + viewDir);
  float diffuse = max(dot(vNormal, lightDir), 0.0);
  float specular = pow(max(dot(vNormal, halfDir), 0.0), 20.0);
  float ambient = 0.1;

  outColor = vec4(materialColor * (ambient + diffuse) + specular + pointLightSum, 1.0);
}
