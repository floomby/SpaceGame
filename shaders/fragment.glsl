#version 300 es
in highp vec2 vTextureCoord;
in highp vec3 vNormal;
in highp vec3 vPointLights[10];
in highp vec3 vPosition;
flat in int vDrawType;
in highp vec4 vColor;

precision mediump float;

uniform vec3 uBaseColor;
uniform sampler2D uSampler;
uniform vec3 uPointLightLighting[10];
uniform mediump vec3 uHealthAndEnergyAndScale;
uniform mediump vec4 uDesaturateAndTransparencyAndWarpingAndHighlight;
uniform mediump float uPhase;

layout(location = 0) out vec4 outColor;

void main(void) {
  if (vDrawType == 1) {
    vec4 sampled = texture(uSampler, vTextureCoord);
    vec3 materialColor = mix(uBaseColor, sampled.rgb, sampled.a);

    vec3 viewDir = normalize(vec3(0.0, 0.0, -1.0));
  
    vec3 emissive = vec3(0.0, 0.0, 0.0);

    // blinn-phong
    vec3 lightDir = normalize(vec3(0.0, 1.0, 1.0));
    vec3 halfDir = normalize(lightDir + viewDir);
    float diffuse = max(dot(vNormal, lightDir), 0.0);
    float specular = pow(max(dot(vNormal, halfDir), 0.0), 20.0);
    float ambient = 0.1;

    outColor = vec4(materialColor * (ambient + diffuse + emissive) + specular, 1.0);
    return;
  }

  // World lines
  if (vDrawType == 11) {
    outColor = vec4(vColor.xyz, vColor.w * vPosition.x);
    return;
  }

  if (vDrawType == 2) {
    outColor = vColor;
    return;
  }

  // In world and in target health bar
  if (vDrawType == 3 || vDrawType == 8) {
    if (vPosition.x > uHealthAndEnergyAndScale.x) {
      outColor = vec4(1.0, 0.0, 0.0, 0.8);
    } else {
      outColor = vec4(0.0, 1.0, 0.0, 0.8);
    }
    return;
  }

  // In world and in target energy bar
  if (vDrawType == 4 || vDrawType == 9) {
    if (vPosition.x > uHealthAndEnergyAndScale.y) {
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

  // In world and in target resource bar
  if (vDrawType == 7 || vDrawType == 10) {
    if (vPosition.x > uHealthAndEnergyAndScale.x) {
      outColor = vec4(0.3, 0.3, 0.3, 0.8);
    } else {
      outColor = vec4(0.5, 0.15, 0.15, 0.8);
    }
    return;
  }

  vec4 sampled = texture(uSampler, vTextureCoord);
  vec3 materialColor = mix(uBaseColor, sampled.rgb, sampled.a);

  // desaturate
  float average = (materialColor.r + materialColor.g + materialColor.b) / 3.0;
  materialColor = mix(vec3(average), materialColor, 1.0 - uDesaturateAndTransparencyAndWarpingAndHighlight.x);
  materialColor = mix(vec3(average * 1.2), materialColor, 1.0 - uPhase * uDesaturateAndTransparencyAndWarpingAndHighlight.w * 0.4);

  vec3 pointLightSum = vec3(0.0, 0.0, 0.0);

  vec3 viewDir = normalize(vec3(0.0, 0.0, -1.0));
  
  // Do not apply point lights if we are drawing targets, there is junk in the point light uniforms
  // drawTarget and drawTargetAsteroid do not set the point lights
  if (vDrawType != 12) {
    for (int i = 0; i < 10; i++) {
      vec3 lightDirection = normalize(vPointLights[i] - vPosition);
      vec3 halfVector = normalize(lightDirection + viewDir);
      float lightDistance = length(vPointLights[i] - vPosition) / 5.0;
      
      float diffuse = max(dot(vNormal, lightDirection), 0.0) * 0.3;
      float specular = pow(max(dot(vNormal, halfVector), 0.0), 20.0);

      pointLightSum += (uPointLightLighting[i] * diffuse + specular) / max(lightDistance * lightDistance, 2.0);
    }
  }

  vec3 emissive = vec3(uDesaturateAndTransparencyAndWarpingAndHighlight.z * 0.8 + uPhase * uDesaturateAndTransparencyAndWarpingAndHighlight.w * 0.9);

  // blinn-phong
  vec3 lightDir = normalize(vec3(0.0, 1.0, 1.0));
  vec3 halfDir = normalize(lightDir + viewDir);
  float diffuse = max(dot(vNormal, lightDir), 0.0);
  float specular = pow(max(dot(vNormal, halfDir), 0.0), 20.0);
  float ambient = 0.1;

  outColor = vec4(materialColor * (ambient + diffuse + emissive) + specular + pointLightSum, 1.0 - uDesaturateAndTransparencyAndWarpingAndHighlight.y);
}
