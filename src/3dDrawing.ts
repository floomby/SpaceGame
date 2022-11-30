import { initEffects } from "./effects";
import { addLoadingText, lastSelf, state, teamColorsFloat } from "./globals";
import { adapter } from "./drawing";
import { glMatrix, mat4, vec3 } from "gl-matrix";
import { loadObj, Model, modelMap, models } from "./modelLoader";
import { defs } from "./defs";
import { Ballistic } from "./game";
import { l2Norm, l2NormSquared } from "./geometry";

let canvas: HTMLCanvasElement;
let gl: WebGLRenderingContext;
let programInfo: any;

enum DrawType {
  Player = 0,
  Projectile = 1,
}

const initShaders = (callback: (program: any) => void) => {
  addLoadingText("Loading and compiling shaders...");
  Promise.all(["shaders/vertex.glsl", "shaders/fragment.glsl"].map((file) => fetch(file).then((res) => res.text()))).then(([vsSource, fsSource]) => {
    const vertexShader = loadShader(gl.VERTEX_SHADER, vsSource);
    const fragmentShader = loadShader(gl.FRAGMENT_SHADER, fsSource);

    const shaderProgram = gl.createProgram();
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);

    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
      console.error(`Unable to initialize the shader program: ${gl.getProgramInfoLog(shaderProgram)}`);
      return null;
    }
    callback(shaderProgram);
  }).catch(console.error);
};

const loadShader = (type: number, source: string) => {
  const shader = gl.createShader(type);

  gl.shaderSource(shader, source);

  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(`An error occurred compiling the shaders: ${gl.getShaderInfoLog(shader)}`);
    gl.deleteShader(shader);
    return null;
  }

  return shader;
};

const init3dDrawing = (callback: () => void) => {
  adapter();

  initEffects();

  canvas = document.getElementById("canvas") as HTMLCanvasElement;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  window.addEventListener("resize", () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  });

  gl = canvas.getContext("webgl2");
  if (!gl) {
    console.error("Your browser does not support WebGL 2.0");
  }

  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

  const program = initShaders((program) => {
    programInfo = {
      program,
      attribLocations: {
        vertexPosition: gl.getAttribLocation(program, "aVertexPosition"),
        textureCoord: gl.getAttribLocation(program, "aTextureCoord"),
        vertexNormal: gl.getAttribLocation(program, "aVertexNormal"),
      },
      uniformLocations: {
        projectionMatrix: gl.getUniformLocation(program, "uProjectionMatrix"),
        modelMatrix: gl.getUniformLocation(program, "uModelMatrix"),
        viewMatrix: gl.getUniformLocation(program, "uViewMatrix"),
        normalMatrix: gl.getUniformLocation(program, "uNormalMatrix"),
        uSampler: gl.getUniformLocation(program, "uSampler"),
        baseColor: gl.getUniformLocation(program, "uBaseColor"),
        pointLights: [
          gl.getUniformLocation(program, "uPointLights[0]"),
          gl.getUniformLocation(program, "uPointLights[1]"),
          gl.getUniformLocation(program, "uPointLights[2]"),
          gl.getUniformLocation(program, "uPointLights[3]"),
        ],
        pointLightLighting: [
          gl.getUniformLocation(program, "uPointLightLighting[0]"),
          gl.getUniformLocation(program, "uPointLightLighting[1]"),
          gl.getUniformLocation(program, "uPointLightLighting[2]"),
          gl.getUniformLocation(program, "uPointLightLighting[3]"),
        ],
        drawType: gl.getUniformLocation(program, "uDrawType"),
      },
    };

    addLoadingText("Loading models...");
    Promise.all(["spaceship.obj", "projectile.obj"].map((url) => loadObj(url)))
      .then(() => {
        defs.forEach((def) => {
          def.modelIndex = modelMap.get(def.model)[1];
        });

        callback();
      })
      .catch(console.error);
  });
};

const drawEverything = () => {
  gl.clearColor(0.0, 0.0, 0.0, 1.0);
  gl.clearDepth(1.0);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  const fieldOfView = (45 * Math.PI) / 180;
  const aspect = canvas.width / canvas.height;
  const zNear = 0.1;
  const zFar = 100.0;
  const projectionMatrix = mat4.create();

  mat4.perspective(projectionMatrix, fieldOfView, aspect, zNear, zFar);

  gl.useProgram(programInfo.program);

  gl.uniformMatrix4fv(programInfo.uniformLocations.projectionMatrix, false, projectionMatrix);

  if (!lastSelf) {
    return;
  }

  // From game space to world space
  const mapX = (x: number) => (x - lastSelf.position.x) / 10;
  const mapY = (y: number) => -(y - lastSelf.position.y) / 10;

  for (const player of state.players.values()) {
    const def = defs[player.defIndex];
    let bufferData = models[def.modelIndex].bindResources(gl);

    {
      const numComponents = 3;
      const type = gl.FLOAT;
      const normalize = false;
      const stride = 0;
      const offset = 0;
      gl.bindBuffer(gl.ARRAY_BUFFER, bufferData.vertexBuffer);
      gl.vertexAttribPointer(programInfo.attribLocations.vertexPosition, numComponents, type, normalize, stride, offset);
      gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition);
    }

    {
      const numComponents = 2;
      const type = gl.FLOAT;
      const normalize = false;
      const stride = 0;
      const offset = 0;
      gl.bindBuffer(gl.ARRAY_BUFFER, bufferData.vertexTextureCoordBuffer);
      gl.vertexAttribPointer(programInfo.attribLocations.textureCoord, numComponents, type, normalize, stride, offset);
      gl.enableVertexAttribArray(programInfo.attribLocations.textureCoord);
    }

    {
      const numComponents = 3;
      const type = gl.FLOAT;
      const normalize = false;
      const stride = 0;
      const offset = 0;
      gl.bindBuffer(gl.ARRAY_BUFFER, bufferData.vertexNormalBuffer);
      gl.vertexAttribPointer(programInfo.attribLocations.vertexNormal, numComponents, type, normalize, stride, offset);
      gl.enableVertexAttribArray(programInfo.attribLocations.vertexNormal);
    }

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bufferData.indexBuffer);

    // Uniforms
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, bufferData.texture);
    gl.uniform1i(programInfo.uniformLocations.uSampler, 0);

    gl.uniform3fv(programInfo.uniformLocations.baseColor, teamColorsFloat[player.team]);

    // find the closest 4 projectiles to use as point lights
    let projectiles: [number, Ballistic][] = [];
    for (let i = 0; i < 4; i++) {
      projectiles.push([Infinity, null]);
    }
    for (const projectile of state.projectiles.values()) {
      const dist2 = l2NormSquared(projectile.position, player.position);
      let insertionIndex = 0;
      while (insertionIndex < 4 && dist2 > projectiles[insertionIndex][0]) {
        insertionIndex++;
      }
      if (insertionIndex < 4) {
        projectiles.splice(insertionIndex, 0, [dist2, projectile]);
        projectiles.pop();
      }
    }

    for (let i = 0; i < 4; i++) {
      if (projectiles[i][1]) {
        const pointLight = [mapX(projectiles[i][1].position.x), mapY(projectiles[i][1].position.y), -10.0, 0];
        gl.uniform4fv(programInfo.uniformLocations.pointLights[i], pointLight);
        gl.uniform3fv(programInfo.uniformLocations.pointLightLighting[i], [4.0, 4.0, 4.0]);
      } else {
        gl.uniform4fv(programInfo.uniformLocations.pointLights[i], [mapX(-1600), mapY(-1600), -10.0, 0.0]);
        gl.uniform3fv(programInfo.uniformLocations.pointLightLighting[i], [0.0, 0.0, 0.0]);
      }
    }

    const modelMatrix = mat4.create();
    mat4.rotateZ(modelMatrix, modelMatrix, -player.heading);
    gl.uniformMatrix4fv(programInfo.uniformLocations.modelMatrix, false, modelMatrix);

    const viewMatrix = mat4.create();
    mat4.translate(viewMatrix, viewMatrix, [mapX(player.position.x), mapY(player.position.y), -10.0]);
    gl.uniformMatrix4fv(programInfo.uniformLocations.viewMatrix, false, viewMatrix);

    const normalMatrix = mat4.create();
    mat4.invert(normalMatrix, mat4.mul(normalMatrix, viewMatrix, modelMatrix));
    mat4.transpose(normalMatrix, normalMatrix);
    gl.uniformMatrix4fv(programInfo.uniformLocations.normalMatrix, false, normalMatrix);

    gl.uniform1i(programInfo.uniformLocations.drawType, DrawType.Player);

    const vertexCount = models[def.modelIndex].indices.length || 0;
    const type = gl.UNSIGNED_SHORT;
    const offset = 0;
    gl.drawElements(gl.TRIANGLES, vertexCount, type, offset);
  }

  for (const projectile of state.projectiles.values()) {
    let bufferData = modelMap.get("projectile")[0].bindResources(gl);

    {
      const numComponents = 3;
      const type = gl.FLOAT;
      const normalize = false;
      const stride = 0;
      const offset = 0;
      gl.bindBuffer(gl.ARRAY_BUFFER, bufferData.vertexBuffer);
      gl.vertexAttribPointer(programInfo.attribLocations.vertexPosition, numComponents, type, normalize, stride, offset);
      gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition);
    }

    {
      const numComponents = 2;
      const type = gl.FLOAT;
      const normalize = false;
      const stride = 0;
      const offset = 0;
      gl.bindBuffer(gl.ARRAY_BUFFER, bufferData.vertexTextureCoordBuffer);
      gl.vertexAttribPointer(programInfo.attribLocations.textureCoord, numComponents, type, normalize, stride, offset);
      gl.enableVertexAttribArray(programInfo.attribLocations.textureCoord);
    }

    {
      const numComponents = 3;
      const type = gl.FLOAT;
      const normalize = false;
      const stride = 0;
      const offset = 0;
      gl.bindBuffer(gl.ARRAY_BUFFER, bufferData.vertexNormalBuffer);
      gl.vertexAttribPointer(programInfo.attribLocations.vertexNormal, numComponents, type, normalize, stride, offset);
      gl.enableVertexAttribArray(programInfo.attribLocations.vertexNormal);
    }

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bufferData.indexBuffer);

    const modelMatrix = mat4.create();
    mat4.rotateZ(modelMatrix, modelMatrix, -projectile.heading);
    gl.uniformMatrix4fv(programInfo.uniformLocations.modelMatrix, false, modelMatrix);

    const viewMatrix = mat4.create();
    mat4.translate(viewMatrix, viewMatrix, [mapX(projectile.position.x), mapY(projectile.position.y), -10.0]);
    gl.uniformMatrix4fv(programInfo.uniformLocations.viewMatrix, false, viewMatrix);

    const normalMatrix = mat4.create();
    mat4.invert(normalMatrix, mat4.mul(normalMatrix, viewMatrix, modelMatrix));
    mat4.transpose(normalMatrix, normalMatrix);
    gl.uniformMatrix4fv(programInfo.uniformLocations.normalMatrix, false, normalMatrix);

    gl.uniform1i(programInfo.uniformLocations.drawType, DrawType.Projectile);

    gl.uniform3fv(programInfo.uniformLocations.baseColor, [1.0, 1.0, 1.0]);

    const vertexCount = modelMap.get("projectile")[0].indices.length || 0;
    const type = gl.UNSIGNED_SHORT;
    const offset = 0;
    gl.drawElements(gl.TRIANGLES, vertexCount, type, offset);
  }
};

// TODO replace with ray casting
const canvasCoordsToGameCoords = (x: number, y: number) => {
  if (!lastSelf) {
    return undefined;
  }
  return {
    x: x - canvas.width / 2 + lastSelf.position.x,
    y: y - canvas.height / 2 + lastSelf.position.y,
  };
};

export { init3dDrawing, canvas, canvasCoordsToGameCoords, drawEverything, gl };
