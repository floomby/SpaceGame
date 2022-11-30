#version 300 es
in highp vec2 vTextureCoord;
in highp vec3 vVertexNormal;
in highp vec3 vPointLights[4];
in highp vec3 vVertexPosition;
flat in int vDrawType;

precision mediump float;

uniform vec3 uBaseColor;
uniform sampler2D uSampler;
uniform vec3 uPointLightLighting[4];

layout(location = 0) out vec4 outColor;

void main(void) {
  if (vDrawType == 1) {
    outColor = vec4(uBaseColor, 1.0);
    return;
  }

  vec4 sampled = texture(uSampler, vTextureCoord);
  vec3 materialColor = mix(uBaseColor, sampled.rgb, sampled.a);

  vec3 pointLightSum = vec3(0.0, 0.0, 0.0);

  vec3 viewDir = normalize(vec3(0.0, 0.0, -1.0));
  
  for (int i = 0; i < 1; i++) {
    vec3 lightDirection = normalize(vPointLights[i] - vVertexPosition);
    vec3 halfVector = normalize(lightDirection + viewDir);
    float lightDistance = length(vPointLights[i] - vVertexPosition);
    
    float diffuse = max(dot(vVertexNormal, lightDirection), 0.0) * 0.3;
    float specular = pow(max(dot(vVertexNormal, halfVector), 0.0), 20.0);

    pointLightSum += (uPointLightLighting[i] * diffuse + specular) / max(lightDistance * lightDistance, 2.0);
  }
  
  // blinn-phong
  vec3 lightDir = normalize(vec3(0.0, 1.0, 1.0));
  vec3 halfDir = normalize(lightDir + viewDir);
  float diffuse = max(dot(vVertexNormal, lightDir), 0.0);
  float specular = pow(max(dot(vVertexNormal, halfDir), 0.0), 20.0);
  float ambient = 0.1;

  outColor = vec4(materialColor * (ambient + diffuse) + specular + pointLightSum, 1.0);
}
