import { initEffects } from "./effects";
import { addLoadingText, lastSelf, state, teamColorsFloat } from "./globals";
import { adapter } from "./drawing";
import { glMatrix, mat4, vec3 } from "gl-matrix";
import { loadObj, Model, modelMap, models } from "./modelLoader";
import { defs } from "./defs";
import { Asteroid, Ballistic, Player } from "./game";
import { l2NormSquared, Position, Rectangle } from "./geometry";
import {
  appendBottomBars,
  appendCanvasRect,
  appendMinimap,
  canvasRectToNDC,
  clear2d,
  draw2d,
  initRasterizer,
  rasterizeText,
  blitImageDataToOverlayCenteredFromWorld,
} from "./2dDrawing";
import { loadBackground } from "./background";
import { PointLightData, UnitKind } from "./defs/shipsAndStations";
import { getNameOfPlayer } from "./rest";

let canvas: HTMLCanvasElement;
let overlayCanvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
let gl: WebGLRenderingContext;
let programInfo: any;
let backgroundTexture: WebGLTexture;

enum DrawType {
  Player = 0,
  Projectile = 1,
  Hud = 2,
  HealthBar = 3,
  EnergyBar = 4,
  Background = 5,
  TargetPlayer = 6,
}

const initShaders = (callback: (program: any) => void) => {
  addLoadingText("Loading and compiling shaders...");
  Promise.all(["shaders/vertex.glsl", "shaders/fragment.glsl"].map((file) => fetch(file).then((res) => res.text())))
    .then(([vsSource, fsSource]) => {
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
    })
    .catch(console.error);
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

let projectionMatrix: mat4;

let barBuffer: WebGLBuffer;
let backgroundBuffer: WebGLBuffer;

// Rendering constants stuff
const pointLightCount = 10;
const gamePlaneZ = -50.0;

let testText: ImageData;

const init3dDrawing = (callback: () => void) => {
  adapter();

  initEffects();

  canvas = document.getElementById("canvas") as HTMLCanvasElement;
  overlayCanvas = document.getElementById("overlayCanvas") as HTMLCanvasElement;

  // TODO Handle device pixel ratio
  const handleSizeChange = () => {
    overlayCanvas.width = canvas.width = window.innerWidth;
    overlayCanvas.height = canvas.height = window.innerHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);
    const fieldOfView = (45 * Math.PI) / 180;
    const aspect = canvas.width / canvas.height;
    const zNear = 0.1;
    const zFar = 100.0;
    projectionMatrix = mat4.create();

    mat4.perspective(projectionMatrix, fieldOfView, aspect, zNear, zFar);
  };

  gl = canvas.getContext("webgl2");
  if (!gl) {
    console.error("Your browser does not support WebGL 2.0");
  }

  ctx = overlayCanvas.getContext("2d");

  initRasterizer({ x: canvas.width, y: 400 });

  testText = rasterizeText("Hello world!", "30px Arial", [1.0, 1.0, 1.0, 1.0]);

  const barData = new Float32Array([
    // top right
    -1, 1, 1,
    // top left
    1, 1, 1,
    // bottom left
    1, 0.9, 1,
    // top right
    -1, 1, 1,
    // bottom left
    1, 0.9, 1,
    // bottom right
    -1, 0.9, 1,
  ]);

  barBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, barBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, barData, gl.STATIC_DRAW);

  const backgroundData = new Float32Array([
    // top right
    -1, 1, 1,
    // top left
    1, 1, 1,
    // bottom left
    1, -1, 1,
    // top right
    -1, 1, 1,
    // bottom left
    1, -1, 1,
    // bottom right
    -1, -1, 1,
  ]);

  backgroundBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, backgroundBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, backgroundData, gl.STATIC_DRAW);

  gl.clearColor(0.0, 0.0, 0.0, 0.0);
  gl.clearDepth(1.0);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  window.addEventListener("resize", handleSizeChange);
  handleSizeChange();

  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

  initShaders((program) => {
    programInfo = {
      program,
      attribLocations: {
        vertexPosition: gl.getAttribLocation(program, "aVertexPosition"),
        textureCoord: gl.getAttribLocation(program, "aTextureCoord"),
        vertexNormal: gl.getAttribLocation(program, "aVertexNormal"),
        vertexColor: gl.getAttribLocation(program, "aVertexColor"),
      },
      uniformLocations: {
        projectionMatrix: gl.getUniformLocation(program, "uProjectionMatrix"),
        modelMatrix: gl.getUniformLocation(program, "uModelMatrix"),
        viewMatrix: gl.getUniformLocation(program, "uViewMatrix"),
        normalMatrix: gl.getUniformLocation(program, "uNormalMatrix"),
        uSampler: gl.getUniformLocation(program, "uSampler"),
        baseColor: gl.getUniformLocation(program, "uBaseColor"),
        pointLights: new Array(pointLightCount).fill(0).map((_, i) => gl.getUniformLocation(program, `uPointLights[${i}]`)),
        pointLightLighting: new Array(pointLightCount).fill(0).map((_, i) => gl.getUniformLocation(program, `uPointLightLighting[${i}]`)),

        drawType: gl.getUniformLocation(program, "uDrawType"),
        healthAndEnergy: gl.getUniformLocation(program, "uHealthAndEnergy"),
      },
    };

    addLoadingText("Loading models...");
    Promise.all(["spaceship.obj", "projectile.obj", "advanced_fighter.obj", "alliance_starbase.obj", "fighter.obj"].map((url) => loadObj(url)))
      .then(async () => {
        defs.forEach((def) => {
          def.modelIndex = modelMap.get(def.model)[1];
        });

        backgroundTexture = await loadBackground(gl);
        callback();
      })
      .catch(console.error);
  });
};

const drawPlayer = (player: Player, mapX: (x: number) => number, mapY: (y: number) => number, lightSources: PointLightData[]) => {
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

  // find the closest lights
  let lights: [number, PointLightData][] = [];
  for (let i = 0; i < pointLightCount; i++) {
    lights.push([Infinity, null]);
  }
  for (const light of lightSources) {
    const dist2 = l2NormSquared(light.position, player.position);
    let insertionIndex = 0;
    while (insertionIndex < pointLightCount && dist2 > lights[insertionIndex][0]) {
      insertionIndex++;
    }
    if (insertionIndex < pointLightCount) {
      lights.splice(insertionIndex, 0, [dist2, light]);
      lights.pop();
    }
  }

  for (let i = 0; i < pointLightCount; i++) {
    if (lights[i][1]) {
      const pointLight = [mapX(lights[i][1].position.x), mapY(lights[i][1].position.y), lights[i][1].position.z, 0];
      gl.uniform4fv(programInfo.uniformLocations.pointLights[i], pointLight);
      gl.uniform3fv(programInfo.uniformLocations.pointLightLighting[i], lights[i][1].color);
    } else {
      gl.uniform4fv(programInfo.uniformLocations.pointLights[i], [0.0, 0.0, 0.0, 0.0]);
      gl.uniform3fv(programInfo.uniformLocations.pointLightLighting[i], [0.0, 0.0, 0.0]);
    }
  }

  const modelMatrix = mat4.create();
  mat4.rotateZ(modelMatrix, modelMatrix, -player.heading);
  gl.uniformMatrix4fv(programInfo.uniformLocations.modelMatrix, false, modelMatrix);

  const viewMatrix = mat4.create();
  mat4.translate(viewMatrix, viewMatrix, [mapX(player.position.x), mapY(player.position.y), gamePlaneZ]);
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

  // Draw the players status bars
  const health = Math.max(player.health, 0) / def.health;
  const energy = player.energy / def.energy;
  gl.uniform2fv(programInfo.uniformLocations.healthAndEnergy, [health, energy]);

  // Draw the health bar
  {
    const numComponents = 3;
    const type = gl.FLOAT;
    const normalize = false;
    const stride = 0;
    const offset = 0;
    gl.bindBuffer(gl.ARRAY_BUFFER, barBuffer);
    gl.vertexAttribPointer(programInfo.attribLocations.vertexPosition, numComponents, type, normalize, stride, offset);
    gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition);
  }

  gl.uniform1i(programInfo.uniformLocations.drawType, DrawType.HealthBar);

  gl.drawArrays(gl.TRIANGLES, 0, 6);

  // Draw the energy bar
  gl.uniform1i(programInfo.uniformLocations.drawType, DrawType.EnergyBar);

  gl.drawArrays(gl.TRIANGLES, 0, 6);
};

let lastName = "";

const drawTarget = (target: Player, where: Rectangle) => {
  const targetDisplayRectNDC = canvasRectToNDC(where);

  const def = defs[target.defIndex];
  let bufferData = models[def.modelIndex].bindResources(gl);

  if (!target.isPC || def.kind === UnitKind.Station) {
    const name = getNameOfPlayer(target);
    if (name !== lastName) {
      lastName = name;
      // TODO Draw this
    }
  }

  const targetDisplayProjectionMatrix = mat4.create();
  mat4.ortho(targetDisplayProjectionMatrix, -def.radius / 7, def.radius / 7, -def.radius / 7, def.radius / 7, -10, 10);

  const scaleX = targetDisplayRectNDC.width / 2;
  const scaleY = targetDisplayRectNDC.height / 2;
  const scaleZ = (scaleX + scaleY) / 2;

  mat4.translate(targetDisplayProjectionMatrix, targetDisplayProjectionMatrix, [
    ((targetDisplayRectNDC.x + targetDisplayRectNDC.width / 2) * def.radius) / 7,
    ((targetDisplayRectNDC.y - targetDisplayRectNDC.height / 2) * def.radius) / 7,
    0,
  ]);
  mat4.scale(targetDisplayProjectionMatrix, targetDisplayProjectionMatrix, [scaleX, scaleY, scaleZ]);

  gl.uniformMatrix4fv(programInfo.uniformLocations.projectionMatrix, false, targetDisplayProjectionMatrix);

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

  gl.uniform3fv(programInfo.uniformLocations.baseColor, teamColorsFloat[target.team]);

  const modelMatrix = mat4.create();
  mat4.rotateZ(modelMatrix, modelMatrix, -target.heading);
  gl.uniformMatrix4fv(programInfo.uniformLocations.modelMatrix, false, modelMatrix);

  const viewMatrix = mat4.create();
  mat4.translate(viewMatrix, viewMatrix, [0, 0, 0]);
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

  // Draw the players status bars
  const health = Math.max(target.health, 0) / def.health;
  const energy = target.energy / def.energy;
  gl.uniform2fv(programInfo.uniformLocations.healthAndEnergy, [health, energy]);

  // Draw the health bar
  {
    const numComponents = 3;
    const type = gl.FLOAT;
    const normalize = false;
    const stride = 0;
    const offset = 0;
    gl.bindBuffer(gl.ARRAY_BUFFER, barBuffer);
    gl.vertexAttribPointer(programInfo.attribLocations.vertexPosition, numComponents, type, normalize, stride, offset);
    gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition);
  }

  gl.uniform1i(programInfo.uniformLocations.drawType, DrawType.HealthBar);

  gl.drawArrays(gl.TRIANGLES, 0, 6);

  // Draw the energy bar
  gl.uniform1i(programInfo.uniformLocations.drawType, DrawType.EnergyBar);

  gl.drawArrays(gl.TRIANGLES, 0, 6);
};

const drawBackground = (where: Position) => {
  gl.uniform1i(programInfo.uniformLocations.drawType, DrawType.Background);

  {
    const numComponents = 3;
    const type = gl.FLOAT;
    const normalize = false;
    const stride = 0;
    const offset = 0;
    gl.bindBuffer(gl.ARRAY_BUFFER, backgroundBuffer);
    gl.vertexAttribPointer(programInfo.attribLocations.vertexPosition, numComponents, type, normalize, stride, offset);
    gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition);
  }

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, backgroundTexture);
  gl.uniform1i(programInfo.uniformLocations.uSampler, 0);

  const viewMatrix = mat4.create();
  mat4.translate(viewMatrix, viewMatrix, [lastSelf.position.x / 200, lastSelf.position.y / -200, 0]);
  mat4.scale(viewMatrix, viewMatrix, [canvas.width / 1000, canvas.height / 1000, 1.0]);
  gl.uniformMatrix4fv(programInfo.uniformLocations.viewMatrix, false, viewMatrix);

  gl.drawArrays(gl.TRIANGLES, 0, 6);
};

const drawEverything = (target: Player | undefined, targetAsteroid: Asteroid | undefined) => {
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // I may be able to move this to the initialization code since I am probably just sticking with monolithic shaders
  gl.useProgram(programInfo.program);

  gl.uniformMatrix4fv(programInfo.uniformLocations.projectionMatrix, false, projectionMatrix);

  if (!lastSelf) {
    return;
  }

  drawBackground(lastSelf.position);

  const targetDisplayRect = { x: canvas.width - 210, y: 15, width: 200, height: 200 };

  // Minimap
  clear2d();
  if (!lastSelf.docked) {
    appendMinimap({ x: canvas.width - 200, y: canvas.height - 220, height: 200, width: 200 }, 0.03);
    appendBottomBars();
    // Backdrop for the target
    if (target || targetAsteroid) {
      appendCanvasRect(targetDisplayRect, -1, [0.3, 0.3, 0.3, 0.5]);
    }
  }

  // From game space to world space
  const mapX = (x: number) => (x - lastSelf.position.x) / 10;
  const mapY = (y: number) => -(y - lastSelf.position.y) / 10;

  blitImageDataToOverlayCenteredFromWorld(testText, lastSelf.position, 1.0, mapX, mapY, { x: 0, y: -3, z: 5 });

  // Compute all point lights in the scene
  const lightSources: PointLightData[] = [];

  for (const projectile of state.projectiles.values()) {
    lightSources.push({
      position: { x: projectile.position.x, y: projectile.position.y, z: gamePlaneZ },
      color: [4.0, 4.0, 4.0],
    });
  }

  for (const player of state.players.values()) {
    const def = defs[player.defIndex];
    if (def.pointLights) {
      for (const light of def.pointLights) {
        lightSources.push({
          position: {
            x: player.position.x + light.position.x * Math.cos(player.heading) - light.position.y * Math.sin(player.heading),
            y: player.position.y + light.position.x * Math.sin(player.heading) + light.position.y * Math.cos(player.heading),
            z: gamePlaneZ + light.position.z,
          },
          color: light.color,
        });
      }
    }
  }

  for (const player of state.players.values()) {
    drawPlayer(player, mapX, mapY, lightSources);
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
    mat4.translate(viewMatrix, viewMatrix, [mapX(projectile.position.x), mapY(projectile.position.y), gamePlaneZ]);
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

  draw2d(programInfo);

  gl.clear(gl.DEPTH_BUFFER_BIT);

  if (target) {
    drawTarget(target, targetDisplayRect);
  } else if (targetAsteroid) {
    // drawTargetAsteroid();
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

export { init3dDrawing, canvas, canvasCoordsToGameCoords, drawEverything, gl, projectionMatrix, DrawType, ctx, overlayCanvas, gamePlaneZ };
