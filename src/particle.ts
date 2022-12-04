// Stuff for the particle system (some of the stuff is in the 3dDrawing file, such as shader program compilation and linking)

import { mat4 } from "gl-matrix";
import { gl, particleProgramInfo, particleRenderingProgramInfo, projectionMatrix } from "./3dDrawing";
import { loadTexture } from "./modelLoader";

const randomNoise = (width: number, height: number, channels: number) => {
  const data = new Uint8Array(width * height * channels);
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.floor(Math.random() * 255);
  }
  return data;
};

let particleTextures: WebGLTexture = [];

const initTextures = (gl: WebGL2RenderingContext, callback: () => void) => {
  Promise.all(["particle_test.png"].map(file => loadTexture(file, gl))).then(textures => {
    particleTextures = textures;
    callback();
  }).catch(console.error);
};

const initializeParticleData = (count: number, minAge: number, maxAge: number) => {
  const data = new Float32Array(count * 12);
  for (let i = 0; i < count; i++) {
    // Position
    data[i * 8 + 0] = Math.random() * 2 - 1;
    data[i * 8 + 1] = Math.random() * 2 - 1;
    data[i * 8 + 2] = Math.random() * 2 - 1;
    // Age
    const age = Math.random() * (maxAge - minAge) + minAge;
    data[i * 8 + 3] = age;
    // Life
    data[i * 8 + 4] = age + 1;
    // Velocity
    data[i * 8 + 5] = Math.random() * 0.01 - 0.005;
    data[i * 8 + 6] = Math.random() * 0.01 - 0.005;
    data[i * 8 + 7] = Math.random() * 0.01 - 0.005;
    // Behavior
    data[i * 8 + 8] = 0;
    data[i * 8 + 9] = 0;
    data[i * 8 + 10] = 0;
    data[i * 8 + 11] = 0;
  }
  return data;
};

let noiseTexture: WebGLTexture;
let particleAOs: WebGLVertexArrayObject[] = [];
let particleRenderAOs: WebGLVertexArrayObject[] = [];
let particleBuffers: WebGLBuffer[] = [];
let behaviorBuffers: WebGLBuffer[] = [];

const count = 5000;

const createBuffers = () => {
  // Create a texture with the noise
  const noise = randomNoise(512, 512, 4);
  noiseTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, noiseTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 512, 512, 0, gl.RGBA, gl.UNSIGNED_BYTE, noise);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  const particleData = initializeParticleData(count, 0, 20);
  for (let i = 0; i < 2; i++) {
    const particleBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, particleBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, particleData, gl.STREAM_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    particleBuffers.push(particleBuffer);

    const particleAO = gl.createVertexArray();
    gl.bindVertexArray(particleAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, particleBuffer);
    if (particleProgramInfo.attribLocations.position !== -1) {
      const offset = 0;
      const stride = 48;
      const numComponents = 3;
      gl.vertexAttribPointer(particleProgramInfo.attribLocations.position, numComponents, gl.FLOAT, false, stride, offset);
      gl.enableVertexAttribArray(particleProgramInfo.attribLocations.position);
    }
    if (particleProgramInfo.attribLocations.age !== -1) {
      const offset = 12;
      const stride = 48;
      const numComponents = 1;
      gl.vertexAttribPointer(particleProgramInfo.attribLocations.age, numComponents, gl.FLOAT, false, stride, offset);
      gl.enableVertexAttribArray(particleProgramInfo.attribLocations.age);
    }
    if (particleProgramInfo.attribLocations.life !== -1) {
      const offset = 16;
      const stride = 48;
      const numComponents = 1;
      gl.vertexAttribPointer(particleProgramInfo.attribLocations.life, numComponents, gl.FLOAT, false, stride, offset);
      gl.enableVertexAttribArray(particleProgramInfo.attribLocations.life);
    }
    if (particleProgramInfo.attribLocations.velocity !== -1) {
      const offset = 20;
      const stride = 48;
      const numComponents = 3;
      gl.vertexAttribPointer(particleProgramInfo.attribLocations.velocity, numComponents, gl.FLOAT, false, stride, offset);
      gl.enableVertexAttribArray(particleProgramInfo.attribLocations.velocity);
    }
    if (particleProgramInfo.attribLocations.behavior !== -1) {
      const offset = 32;
      const stride = 48;
      const numComponents = 1;
      gl.vertexAttribPointer(particleProgramInfo.attribLocations.behavior, numComponents, gl.FLOAT, false, stride, offset);
      gl.enableVertexAttribArray(particleProgramInfo.attribLocations.behavior);
    }
    gl.bindVertexArray(null);
    particleAOs.push(particleAO);

    const particleRenderAO = gl.createVertexArray();
    gl.bindVertexArray(particleRenderAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, particleBuffer);
    if (particleRenderingProgramInfo.attribLocations.position !== -1) {
      const offset = 0;
      const stride = 48;
      const numComponents = 3;
      gl.vertexAttribPointer(particleRenderingProgramInfo.attribLocations.position, numComponents, gl.FLOAT, false, stride, offset);
      gl.enableVertexAttribArray(particleRenderingProgramInfo.attribLocations.position);
      gl.vertexAttribDivisor(particleRenderingProgramInfo.attribLocations.position, 1);
    }
    if (particleRenderingProgramInfo.attribLocations.age !== -1) {
      const offset = 12;
      const stride = 48;
      const numComponents = 1;
      gl.vertexAttribPointer(particleRenderingProgramInfo.attribLocations.age, numComponents, gl.FLOAT, false, stride, offset);
      gl.enableVertexAttribArray(particleRenderingProgramInfo.attribLocations.age);
      gl.vertexAttribDivisor(particleRenderingProgramInfo.attribLocations.age, 1);
    }
    if (particleRenderingProgramInfo.attribLocations.life !== -1) {
      const offset = 16;
      const stride = 48;
      const numComponents = 1;
      gl.vertexAttribPointer(particleRenderingProgramInfo.attribLocations.life, numComponents, gl.FLOAT, false, stride, offset);
      gl.enableVertexAttribArray(particleRenderingProgramInfo.attribLocations.life);
      gl.vertexAttribDivisor(particleRenderingProgramInfo.attribLocations.life, 1);
    }
    if (particleRenderingProgramInfo.attribLocations.velocity !== -1) {
      const offset = 20;
      const stride = 48;
      const numComponents = 3;
      gl.vertexAttribPointer(particleRenderingProgramInfo.attribLocations.velocity, numComponents, gl.FLOAT, false, stride, offset);
      gl.enableVertexAttribArray(particleRenderingProgramInfo.attribLocations.velocity);
      gl.vertexAttribDivisor(particleRenderingProgramInfo.attribLocations.velocity, 1);
    }
    gl.bindVertexArray(null);
    particleRenderAOs.push(particleRenderAO);
  }
};

let readIndex = 0;

const draw = (sixtieths: number) => {
  gl.useProgram(particleProgramInfo.program);

  gl.uniform1f(particleProgramInfo.uniformLocations.timeDelta, sixtieths);
  gl.bindTexture(gl.TEXTURE_2D, noiseTexture);
  gl.activeTexture(gl.TEXTURE0);
  gl.uniform1i(particleProgramInfo.uniformLocations.noise, 0);

  gl.bindVertexArray(particleAOs[readIndex]);

  gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, particleBuffers[readIndex ^ 1]);
  gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 1, behaviorBuffers[readIndex ^ 1]);
  gl.enable(gl.RASTERIZER_DISCARD);
  gl.beginTransformFeedback(gl.POINTS);
  gl.drawArrays(gl.POINTS, 0, count);
  gl.endTransformFeedback();
  gl.disable(gl.RASTERIZER_DISCARD);
  gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);
  gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 1, null);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  readIndex = (readIndex + 1) % 2;

  // Rendering
  gl.useProgram(particleRenderingProgramInfo.program);

  gl.bindVertexArray(particleRenderAOs[readIndex]);
  const viewMatrix = mat4.create();
  mat4.translate(viewMatrix, viewMatrix, [0, 0, -5]);

  gl.uniformMatrix4fv(particleRenderingProgramInfo.uniformLocations.projectionMatrix, false, projectionMatrix);
  gl.uniformMatrix4fv(particleRenderingProgramInfo.uniformLocations.viewMatrix, false, viewMatrix);

  // bind the texture to texture unit 0
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, particleTextures[0]);
  gl.uniform1i(particleRenderingProgramInfo.uniformLocations.particleTexture, 0);

  gl.disable(gl.DEPTH_TEST);
  gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, count);
  gl.enable(gl.DEPTH_TEST);
  gl.bindVertexArray(null);
};


export { randomNoise, createBuffers as createParticleBuffers, draw as drawParticles, initTextures as initParticleTextures };
