import { drawEffects, initEffects } from "./effects";
import { addLoadingText, isFirefox, lastSelf, state, teamColorsFloat } from "./globals";
import { glMatrix, mat2, mat4, vec3, vec4 } from "gl-matrix";
import { loadObj, Model, modelMap, models } from "./modelLoader";
import { asteroidDefs, collectableDefs, defs, mineDefs, missileDefs } from "./defs";
import { Asteroid, Ballistic, ChatMessage, CloakedState, Collectable, Mine, Missile, Player } from "./game";
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
  blitImageDataToOverlayCenteredFromGame,
  drawChats,
  nameDataCache,
  blitImageDataCentered,
  classDataCache,
  nameDataFont,
  classDataFont,
  computeArrows,
  drawArrows,
  drawSectorArrowAndLines,
  drawMessages,
  initDockingMessages,
  displayDockedMessages,
  drawPrompts,
  rasterizePrompts,
  drawWeaponText,
  rasterizeTextBitmap,
  putBitmapCenteredUnderneath,
  insertPromise,
  putBitmapCenteredUnderneathFromGame,
} from "./2dDrawing";
import { loadBackground } from "./background";
import { PointLightData, UnitKind } from "./defs/shipsAndStations";
import { getNameOfPlayer } from "./rest";
import { createParticleBuffers, drawParticles, initParticleTextures } from "./particle";
import { drawProjectile } from "./3dProjectileDrawing";
import { projectileLightColorUnnormed } from "./defs/projectiles";

let canvas: HTMLCanvasElement;
let overlayCanvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
let gl: WebGL2RenderingContext;
let programInfo: any;
let particleProgramInfo: any;
let particleRenderingProgramInfo: any;
let backgroundTexture: WebGLTexture;

enum DrawType {
  Player = 0,
  Projectile = 1,
  Hud = 2,
  HealthBar = 3,
  EnergyBar = 4,
  Background = 5,
  TargetPlayer = 6,
  ResourceBar = 7,
  TargetHealthBar = 8,
  TargetEnergyBar = 9,
  TargetResourceBar = 10,
  Line = 11,
  Target = 12,
  RepairBar = 13,
}

const initShaders = (callback: (program: any, particleProgram: any, particleRenderingProgram: any) => void) => {
  addLoadingText("Loading and compiling shaders...");
  Promise.all(
    [
      "shaders/vertex.glsl",
      "shaders/fragment.glsl",
      "shaders/particleVertex.glsl",
      "shaders/particleFragment.glsl",
      "shaders/particleRenderingVertex.glsl",
      "shaders/particleRenderingFragment.glsl",
    ].map((file) => fetch(file).then((res) => res.text()))
  )
    .then(([vsSource, fsSource, pvsSource, pfsSource, prvsSource, prfsSource]) => {
      const vertexShader = loadShader(gl.VERTEX_SHADER, vsSource, "vertex.glsl");
      const fragmentShader = loadShader(gl.FRAGMENT_SHADER, fsSource, "fragment.glsl");
      const particleVertexShader = loadShader(gl.VERTEX_SHADER, pvsSource, "particleVertex.glsl");
      const particleFragmentShader = loadShader(gl.FRAGMENT_SHADER, pfsSource, "particleFragment.glsl");
      const particleRenderingVertexShader = loadShader(gl.VERTEX_SHADER, prvsSource, "particleRenderingVertex.glsl");
      const particleRenderingFragmentShader = loadShader(gl.FRAGMENT_SHADER, prfsSource, "particleRenderingFragment.glsl");

      const shaderProgram = gl.createProgram();
      gl.attachShader(shaderProgram, vertexShader);
      gl.attachShader(shaderProgram, fragmentShader);
      gl.linkProgram(shaderProgram);

      if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
        console.error(`Unable to initialize the shader program: ${gl.getProgramInfoLog(shaderProgram)}`);
        return null;
      }

      const particleShaderProgram = gl.createProgram();
      gl.attachShader(particleShaderProgram, particleVertexShader);
      gl.attachShader(particleShaderProgram, particleFragmentShader);
      gl.transformFeedbackVaryings(particleShaderProgram, ["vPosition", "vAge", "vLife", "vVelocity", "vBehavior"], gl.INTERLEAVED_ATTRIBS);
      gl.linkProgram(particleShaderProgram);

      if (!gl.getProgramParameter(particleShaderProgram, gl.LINK_STATUS)) {
        console.error(`Unable to initialize the shader program: ${gl.getProgramInfoLog(particleShaderProgram)}`);
        return null;
      }

      const particleRenderingShaderProgram = gl.createProgram();
      gl.attachShader(particleRenderingShaderProgram, particleRenderingVertexShader);
      gl.attachShader(particleRenderingShaderProgram, particleRenderingFragmentShader);
      gl.linkProgram(particleRenderingShaderProgram);

      if (!gl.getProgramParameter(particleRenderingShaderProgram, gl.LINK_STATUS)) {
        console.error(`Unable to initialize the shader program: ${gl.getProgramInfoLog(particleRenderingShaderProgram)}`);
        return null;
      }

      callback(shaderProgram, particleShaderProgram, particleRenderingShaderProgram);
    })
    .catch(console.error);
};

const loadShader = (type: number, source: string, filename: string) => {
  const shader = gl.createShader(type);

  gl.shaderSource(shader, source);

  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(`An error occurred compiling the shaders (${filename}): ${gl.getShaderInfoLog(shader)}`);
    gl.deleteShader(shader);
    return null;
  }

  return shader;
};

let projectionMatrix: mat4;
let inverseProjectionMatrix: mat4;
let canvasGameTopLeft: Position;
let canvasGameBottomRight: Position;

let barBuffer: WebGLBuffer;
let backgroundBuffer: WebGLBuffer;

// Rendering constants stuff
const pointLightCount = 10;
const gamePlaneZ = -120.0;

const init3dDrawing = (callback: () => void) => {
  initDockingMessages();

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
    const zFar = 300.0;
    projectionMatrix = mat4.create();
    inverseProjectionMatrix = mat4.create();

    mat4.perspective(projectionMatrix, fieldOfView, aspect, zNear, zFar);
    mat4.invert(inverseProjectionMatrix, projectionMatrix);
  };

  gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true });
  if (!gl) {
    console.error("Your browser does not support WebGL 2.0");
  }

  ctx = overlayCanvas.getContext("2d");

  const barData = new Float32Array([
    // top right
    -1, 1, 1.9,
    // bottom left
    1, 0.5, 1.9,
    // top left
    1, 1, 1.9,
    // bottom left
    1, 0.5, 1.9,
    // top right
    -1, 1, 1.9,
    // bottom right
    -1, 0.5, 1.9,
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

  initRasterizer({ x: Math.min(canvas.width, 2048), y: 400 });
  rasterizePrompts();

  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

  initShaders((program, particleProgram, particleRenderingProgram) => {
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
        healthAndEnergyAndScale: gl.getUniformLocation(program, "uHealthAndEnergyAndScale"),
        desaturateAndTransparencyAndWarpingAndHighlight: gl.getUniformLocation(program, "uDesaturateAndTransparencyAndWarpingAndHighlight"),
        phase: gl.getUniformLocation(program, "uPhase"),
      },
    };

    // Reuse of same uniforms for multiple purposes
    programInfo.uniformLocations.lineFromTo = programInfo.uniformLocations.pointLights[0];
    programInfo.uniformLocations.lineWidthAndDropoff = programInfo.uniformLocations.pointLights[1];
    programInfo.uniformLocations.lineColor = programInfo.uniformLocations.pointLights[2];

    particleProgramInfo = {
      program: particleProgram,
      attribLocations: {
        position: gl.getAttribLocation(particleProgram, "aPosition"),
        age: gl.getAttribLocation(particleProgram, "aAge"),
        velocity: gl.getAttribLocation(particleProgram, "aVelocity"),
        life: gl.getAttribLocation(particleProgram, "aLife"),
        behavior: gl.getAttribLocation(particleProgram, "aBehavior"),
      },
      uniformLocations: {
        timeDelta: gl.getUniformLocation(particleProgram, "uTimeDelta"),
        noise: gl.getUniformLocation(particleProgram, "uNoise"),
        emitWeights: new Array(24).fill(0).map((_, i) => gl.getUniformLocation(particleProgram, `uEmitWeight[${i}]`)),
        emitTypes: new Array(24).fill(0).map((_, i) => gl.getUniformLocation(particleProgram, `uEmitType[${i}]`)),
        emitPositions: new Array(24).fill(0).map((_, i) => gl.getUniformLocation(particleProgram, `uEmitPosition[${i}]`)),
        emitVelocities: new Array(24).fill(0).map((_, i) => gl.getUniformLocation(particleProgram, `uEmitVelocity[${i}]`)),
        totalWeight: gl.getUniformLocation(particleProgram, "uTotalWeight"),
      },
    };

    particleRenderingProgramInfo = {
      program: particleRenderingProgram,
      attribLocations: {
        position: gl.getAttribLocation(particleRenderingProgram, "aPosition"),
        age: gl.getAttribLocation(particleRenderingProgram, "aAge"),
        velocity: gl.getAttribLocation(particleRenderingProgram, "aVelocity"),
        life: gl.getAttribLocation(particleRenderingProgram, "aLife"),
        behavior: gl.getAttribLocation(particleProgram, "aBehavior"),
      },
      uniformLocations: {
        projectionMatrix: gl.getUniformLocation(particleRenderingProgram, "uProjectionMatrix"),
        viewMatrix: gl.getUniformLocation(particleRenderingProgram, "uViewMatrix"),
        sample: gl.getUniformLocation(particleRenderingProgram, "uSample"),
      },
    };

    createParticleBuffers();

    addLoadingText("Loading models...");
    Promise.all(
      [
        "projectile.obj",
        "advanced_fighter.obj",
        "alliance_starbase.obj",
        "fighter.obj",
        "aziracite.obj",
        "hemacite.obj",
        "prifecite.obj",
        "russanite.obj",
        "proximity_mine.obj",
        "strafer.obj",
        "javelin.obj",
        "impulse.obj",
        "emp.obj",
        "tomahawk.obj",
        "heavy_javelin.obj",
        "drone.obj",
        "seeker.obj",
        "striker.obj",
        "disruptor.obj",
        "plasma.obj",
        "confederacy_starbase.obj",
        "venture.obj",
        "bounty.obj",
        "spartan.obj",
        "rogue_starbase.obj",
        "spare_parts.obj",
        "energy.obj",
        "health.obj",
        "ammo.obj",
        "recipe.obj",
      ].map((url) => loadObj(url, gl, programInfo))
    )
      .then(async () => {
        defs.forEach((def) => {
          def.modelIndex = modelMap.get(def.model)[1];
        });
        asteroidDefs.forEach((def) => {
          def.modelIndex = modelMap.get(def.model)[1];
        });
        mineDefs.forEach((def) => {
          def.modelIndex = modelMap.get(def.model)[1];
        });
        missileDefs.forEach((def) => {
          def.modelIndex = modelMap.get(def.model)[1];
        });
        collectableDefs.forEach((def) => {
          def.modelIndex = modelMap.get(def.model)[1];
        });

        models.forEach((model) => {
          model.recordVertexArrayObject(gl, programInfo);
        });

        backgroundTexture = await loadBackground(gl);
        initParticleTextures(gl, callback);
      })
      .catch(console.error);
  });
};

const clientPlayerUpdate = (player: Player) => {
  const def = defs[player.defIndex];

  const modelMatrix = mat4.create();
  mat4.rotateZ(modelMatrix, modelMatrix, -player.heading);
  if (player.p !== undefined) {
    mat4.rotateY(modelMatrix, modelMatrix, player.p);
  }
  if (player.rl !== undefined) {
    mat4.rotateX(modelMatrix, modelMatrix, player.rl);
  }

  if (player.warping) {
    const warpFramesLeft = def.warpTime - Math.abs(player.warping);
    mat4.scale(modelMatrix, modelMatrix, [Math.max(1, 10 / (warpFramesLeft + 3)), Math.min(1, warpFramesLeft / 10), 1]);
  }

  player.modelMatrix = modelMatrix;
};

const drawPlayer = (player: Player, lightSources: PointLightData[], isHighlighted: boolean) => {
  const cloakedAmount = !player.cloak ? 0 : player.cloak / CloakedState.Cloaked;
  if (cloakedAmount === 1 && player.team !== lastSelf.team) {
    return;
  }
  const cloakOpacity = player.team === lastSelf.team ? 0.8 * cloakedAmount : cloakedAmount;

  const def = defs[player.defIndex];
  let bufferData = models[def.modelIndex];

  if (player.isPC || def.kind === UnitKind.Station) {
    const name = getNameOfPlayer(player);
    if (name !== undefined) {
      let nameData = nameDataCache.get(name);
      if (nameData === undefined) {
        nameDataCache.set(name, null);
        insertPromise(rasterizeTextBitmap(name, nameDataFont, [1.0, 1.0, 1.0, 0.8]), nameDataCache, name);
      } else if (nameData !== null) {
        putBitmapCenteredUnderneathFromGame(nameData, player.position, { x: 0, y: -def.radius / 10 - 1, z: 5 });
      }
    }
  }

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

  // gl.bindVertexArray(bufferData.vertexArrayObject);
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
      const pointLight = [mapGameXToWorld(lights[i][1].position.x), mapGameYToWorld(lights[i][1].position.y), lights[i][1].position.z, 0];
      gl.uniform4fv(programInfo.uniformLocations.pointLights[i], pointLight);
      gl.uniform3fv(programInfo.uniformLocations.pointLightLighting[i], lights[i][1].color);
    } else {
      gl.uniform4fv(programInfo.uniformLocations.pointLights[i], [0.0, 0.0, 0.0, 0.0]);
      gl.uniform3fv(programInfo.uniformLocations.pointLightLighting[i], [0.0, 0.0, 0.0]);
    }
  }

  gl.uniformMatrix4fv(programInfo.uniformLocations.modelMatrix, false, player.modelMatrix);

  const viewMatrix = mat4.create();
  mat4.translate(viewMatrix, viewMatrix, [mapGameXToWorld(player.position.x), mapGameYToWorld(player.position.y), gamePlaneZ]);
  gl.uniformMatrix4fv(programInfo.uniformLocations.viewMatrix, false, viewMatrix);

  const normalMatrix = mat4.create();
  mat4.invert(normalMatrix, mat4.mul(normalMatrix, viewMatrix, player.modelMatrix));
  mat4.transpose(normalMatrix, normalMatrix);
  gl.uniformMatrix4fv(programInfo.uniformLocations.normalMatrix, false, normalMatrix);

  gl.uniform1i(programInfo.uniformLocations.drawType, DrawType.Player);

  const toDesaturate = player.inoperable ? 1 : 0;
  // const transparency = player.cloak ? 0.5 : 0;
  const warpAmount = !player.warping ? 0 : Math.abs(player.warping / def.warpTime);
  gl.uniform4f(
    programInfo.uniformLocations.desaturateAndTransparencyAndWarpingAndHighlight,
    toDesaturate,
    cloakOpacity,
    warpAmount,
    isHighlighted ? 1 : 0
  );

  const vertexCount = models[def.modelIndex].indices.length || 0;
  const type = gl.UNSIGNED_SHORT;
  const offset = 0;
  gl.drawElements(gl.TRIANGLES, vertexCount, type, offset);

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

  if (player.inoperable) {
    gl.uniform1i(programInfo.uniformLocations.drawType, DrawType.RepairBar);
    for (let i = 0; i < 4; i++) {
      const repairAmount = player.repairs[i] / def.repairsRequired;
      gl.uniform3f(programInfo.uniformLocations.healthAndEnergyAndScale, repairAmount, i, def.radius / 10);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
  } else {
    // Draw the players status bars
    const health = Math.max(player.health, 0) / def.health;
    const energy = player.energy / def.energy;
    gl.uniform3fv(programInfo.uniformLocations.healthAndEnergyAndScale, [health, energy, def.radius / 10]);

    // Draw the health bar
    gl.uniform1i(programInfo.uniformLocations.drawType, DrawType.HealthBar);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // Draw the energy bar
    gl.uniform1i(programInfo.uniformLocations.drawType, DrawType.EnergyBar);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
};

const mapGameXToWorld = (x: number) => (x - lastSelf.position.x) / 10;
const mapGameYToWorld = (y: number) => -(y - lastSelf.position.y) / 10;
const mapWorldXToGame = (x: number) => x * 10 + lastSelf.position.x;
const mapWorldYToGame = (y: number) => -y * 10 + lastSelf.position.y;

const drawTarget = (target: Player, where: Rectangle) => {
  if (target.modelMatrix === undefined) {
    clientPlayerUpdate(target);
  }

  const targetDisplayRectNDC = canvasRectToNDC(where);

  const def = defs[target.defIndex];
  let bufferData = models[def.modelIndex];

  const centerX = where.x + where.width / 2;

  let classData = classDataCache.get(def.name);
  if (classData === undefined) {
    classDataCache.set(def.name, null);
    insertPromise(rasterizeTextBitmap(def.name, classDataFont, [1.0, 1.0, 1.0, 0.9]), classDataCache, def.name);
  } else if (classData) {
    const yPosition = where.y + where.height + 10 + classData.height / 2;
    putBitmapCenteredUnderneath(classData, centerX, yPosition);
  }

  const name = getNameOfPlayer(target);
  if (name) {
    let nameData = nameDataCache.get(name);
    if (nameData === undefined) {
      nameDataCache.set(name, null);
      insertPromise(rasterizeTextBitmap(name, nameDataFont, [1.0, 1.0, 1.0, 0.9]), nameDataCache, name);
    } else if (nameData) {
      const yPosition = where.y + where.height + 10 + nameData.height / 2 + (classData?.height ?? 0);
      putBitmapCenteredUnderneath(nameData, centerX, yPosition);
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

  gl.uniformMatrix4fv(programInfo.uniformLocations.modelMatrix, false, target.modelMatrix);

  const viewMatrix = mat4.create();
  mat4.translate(viewMatrix, viewMatrix, [0, 0, 0]);
  gl.uniformMatrix4fv(programInfo.uniformLocations.viewMatrix, false, viewMatrix);

  const normalMatrix = mat4.create();
  mat4.invert(normalMatrix, mat4.mul(normalMatrix, viewMatrix, target.modelMatrix));
  mat4.transpose(normalMatrix, normalMatrix);
  gl.uniformMatrix4fv(programInfo.uniformLocations.normalMatrix, false, normalMatrix);

  gl.uniform1i(programInfo.uniformLocations.drawType, DrawType.Target);

  const toDesaturate = target.inoperable ? 1 : 0;
  const warpAmount = !target.warping ? 0 : Math.abs(target.warping / def.warpTime);
  gl.uniform4f(programInfo.uniformLocations.desaturateAndTransparencyAndWarpingAndHighlight, toDesaturate, 0, warpAmount, 0);

  const vertexCount = models[def.modelIndex].indices.length || 0;
  const type = gl.UNSIGNED_SHORT;
  const offset = 0;
  gl.drawElements(gl.TRIANGLES, vertexCount, type, offset);

  // Draw the players status bars
  gl.clear(gl.DEPTH_BUFFER_BIT);

  const health = Math.max(target.health, 0) / def.health;
  const energy = target.energy / def.energy;
  gl.uniform3fv(programInfo.uniformLocations.healthAndEnergyAndScale, [health, energy, def.radius / 10]);

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

  gl.uniform1i(programInfo.uniformLocations.drawType, DrawType.TargetHealthBar);

  gl.drawArrays(gl.TRIANGLES, 0, 6);

  // Draw the energy bar
  gl.uniform1i(programInfo.uniformLocations.drawType, DrawType.TargetEnergyBar);

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
  mat4.translate(viewMatrix, viewMatrix, [lastSelf.position.x / 1000, lastSelf.position.y / -1000, 0]);
  mat4.scale(viewMatrix, viewMatrix, [canvas.width / 1000, canvas.height / 1000, 1.0]);
  gl.uniformMatrix4fv(programInfo.uniformLocations.viewMatrix, false, viewMatrix);

  gl.drawArrays(gl.TRIANGLES, 0, 6);
};

const drawAsteroid = (asteroid: Asteroid, lightSources: PointLightData[], isHighlighted: boolean) => {
  const def = asteroidDefs[asteroid.defIndex];
  let bufferData = models[def.modelIndex];

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

  // gl.uniform3fv(programInfo.uniformLocations.baseColor, teamColorsFloat[player.team]);

  // find the closest lights
  let lights: [number, PointLightData][] = [];
  for (let i = 0; i < pointLightCount; i++) {
    lights.push([Infinity, null]);
  }
  for (const light of lightSources) {
    const dist2 = l2NormSquared(light.position, asteroid.position);
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
      const pointLight = [mapGameXToWorld(lights[i][1].position.x), mapGameYToWorld(lights[i][1].position.y), lights[i][1].position.z, 0];
      gl.uniform4fv(programInfo.uniformLocations.pointLights[i], pointLight);
      gl.uniform3fv(programInfo.uniformLocations.pointLightLighting[i], lights[i][1].color);
    } else {
      gl.uniform4fv(programInfo.uniformLocations.pointLights[i], [0.0, 0.0, 0.0, 0.0]);
      gl.uniform3fv(programInfo.uniformLocations.pointLightLighting[i], [0.0, 0.0, 0.0]);
    }
  }

  const modelMatrix = mat4.create();
  mat4.rotateX(modelMatrix, modelMatrix, asteroid.roll);
  mat4.rotateY(modelMatrix, modelMatrix, asteroid.pitch);
  mat4.rotateZ(modelMatrix, modelMatrix, -asteroid.heading);

  gl.uniformMatrix4fv(programInfo.uniformLocations.modelMatrix, false, modelMatrix);

  const viewMatrix = mat4.create();
  mat4.translate(viewMatrix, viewMatrix, [mapGameXToWorld(asteroid.position.x), mapGameYToWorld(asteroid.position.y), gamePlaneZ]);
  gl.uniformMatrix4fv(programInfo.uniformLocations.viewMatrix, false, viewMatrix);

  const normalMatrix = mat4.create();
  mat4.invert(normalMatrix, mat4.mul(normalMatrix, viewMatrix, modelMatrix));
  mat4.transpose(normalMatrix, normalMatrix);
  gl.uniformMatrix4fv(programInfo.uniformLocations.normalMatrix, false, normalMatrix);

  gl.uniform1i(programInfo.uniformLocations.drawType, DrawType.Player);

  const toDesaturate = asteroid.resources === 0 ? 0.5 : 0;
  gl.uniform4f(programInfo.uniformLocations.desaturateAndTransparencyAndWarpingAndHighlight, toDesaturate, 0, 0, isHighlighted ? 1 : 0);

  const vertexCount = models[def.modelIndex].indices.length || 0;
  const type = gl.UNSIGNED_SHORT;
  const offset = 0;
  gl.drawElements(gl.TRIANGLES, vertexCount, type, offset);

  // Draw the resource bar
  const resources = Math.max(asteroid.resources, 0) / def.resources;
  gl.uniform3fv(programInfo.uniformLocations.healthAndEnergyAndScale, [resources, 0, def.radius / 10]);

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

  gl.uniform1i(programInfo.uniformLocations.drawType, DrawType.ResourceBar);

  gl.drawArrays(gl.TRIANGLES, 0, 6);
};

const drawCollectable = (collectable: Collectable, lightSources: PointLightData[], desaturation = 0) => {
  const def = collectableDefs[collectable.index];
  const bufferData = models[def.modelIndex];

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

  // gl.uniform3fv(programInfo.uniformLocations.baseColor, teamColorsFloat[player.team]);

  // find the closest lights
  let lights: [number, PointLightData][] = [];
  for (let i = 0; i < pointLightCount; i++) {
    lights.push([Infinity, null]);
  }
  for (const light of lightSources) {
    const dist2 = l2NormSquared(light.position, collectable.position);
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
      const pointLight = [mapGameXToWorld(lights[i][1].position.x), mapGameYToWorld(lights[i][1].position.y), lights[i][1].position.z, 0];
      gl.uniform4fv(programInfo.uniformLocations.pointLights[i], pointLight);
      gl.uniform3fv(programInfo.uniformLocations.pointLightLighting[i], lights[i][1].color);
    } else {
      gl.uniform4fv(programInfo.uniformLocations.pointLights[i], [0.0, 0.0, 0.0, 0.0]);
      gl.uniform3fv(programInfo.uniformLocations.pointLightLighting[i], [0.0, 0.0, 0.0]);
    }
  }

  const modelMatrix = mat4.create();
  const scaleFactor = (collectable.scale ?? 1) + Math.sin(collectable.phase) * 0.3;
  mat4.scale(modelMatrix, modelMatrix, [scaleFactor, scaleFactor, scaleFactor]);
  mat4.rotateZ(modelMatrix, modelMatrix, -collectable.heading);

  gl.uniformMatrix4fv(programInfo.uniformLocations.modelMatrix, false, modelMatrix);

  const viewMatrix = mat4.create();
  mat4.translate(viewMatrix, viewMatrix, [mapGameXToWorld(collectable.position.x), mapGameYToWorld(collectable.position.y), gamePlaneZ]);
  gl.uniformMatrix4fv(programInfo.uniformLocations.viewMatrix, false, viewMatrix);

  const normalMatrix = mat4.create();
  mat4.invert(normalMatrix, mat4.mul(normalMatrix, viewMatrix, modelMatrix));
  mat4.transpose(normalMatrix, normalMatrix);
  gl.uniformMatrix4fv(programInfo.uniformLocations.normalMatrix, false, normalMatrix);

  gl.uniform1i(programInfo.uniformLocations.drawType, DrawType.Player);

  gl.uniform4f(programInfo.uniformLocations.desaturateAndTransparencyAndWarpingAndHighlight, desaturation, 0, 0, 0);

  const vertexCount = models[def.modelIndex].indices.length || 0;
  const type = gl.UNSIGNED_SHORT;
  const offset = 0;
  gl.drawElements(gl.TRIANGLES, vertexCount, type, offset);
};

const drawTargetAsteroid = (asteroid: Asteroid, where: Rectangle) => {
  const targetDisplayRectNDC = canvasRectToNDC(where);

  const def = asteroidDefs[asteroid.defIndex];
  let bufferData = models[def.modelIndex];

  const centerX = where.x + where.width / 2;

  // Just call the mineral the "class" and be done with it
  let classData = classDataCache.get(def.mineral);
  if (classData === undefined) {
    classDataCache.set(def.mineral, null);
    insertPromise(rasterizeTextBitmap(def.mineral, classDataFont, [1.0, 1.0, 1.0, 0.9]), classDataCache, def.mineral);
  } else if (classData) {
    const yPosition = where.y + where.height + 10 + classData.height / 2;
    putBitmapCenteredUnderneath(classData, centerX, yPosition);
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

  const modelMatrix = mat4.create();
  mat4.rotateZ(modelMatrix, modelMatrix, -asteroid.heading);
  gl.uniformMatrix4fv(programInfo.uniformLocations.modelMatrix, false, modelMatrix);

  const viewMatrix = mat4.create();
  mat4.rotateX(modelMatrix, modelMatrix, asteroid.roll);
  mat4.rotateY(modelMatrix, modelMatrix, asteroid.pitch);
  mat4.translate(viewMatrix, viewMatrix, [0, 0, 0]);
  gl.uniformMatrix4fv(programInfo.uniformLocations.viewMatrix, false, viewMatrix);

  const normalMatrix = mat4.create();
  mat4.invert(normalMatrix, mat4.mul(normalMatrix, viewMatrix, modelMatrix));
  mat4.transpose(normalMatrix, normalMatrix);
  gl.uniformMatrix4fv(programInfo.uniformLocations.normalMatrix, false, normalMatrix);

  gl.uniform1i(programInfo.uniformLocations.drawType, DrawType.Target);

  const toDesaturate = asteroid.resources === 0 ? 0.5 : 0;
  gl.uniform4f(programInfo.uniformLocations.desaturateAndTransparencyAndWarpingAndHighlight, toDesaturate, 0.0, 0, 0);

  const vertexCount = models[def.modelIndex].indices.length || 0;
  const type = gl.UNSIGNED_SHORT;
  const offset = 0;
  gl.drawElements(gl.TRIANGLES, vertexCount, type, offset);

  // Draw the resource bar
  const resources = Math.max(asteroid.resources, 0) / def.resources;
  gl.uniform3fv(programInfo.uniformLocations.healthAndEnergyAndScale, [resources, 0, def.radius / 10]);

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

  gl.uniform1i(programInfo.uniformLocations.drawType, DrawType.TargetResourceBar);

  gl.clear(gl.DEPTH_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
};

type FadingMine = Mine & { framesRemaining: number };
type FadingCollectable = Collectable & { framesRemaining: number };

let fadingMines: FadingMine[] = [];
let fadingCollectables: FadingCollectable[] = [];

const fadeOutMine = (mine: Mine) => {
  fadingMines.push({ ...mine, framesRemaining: 180 });
};

const processFadingMines = (sixtieths: number, pointLights: PointLightData[]) => {
  fadingMines = fadingMines.filter((fadingMine) => {
    fadingMine.framesRemaining -= sixtieths;
    if (fadingMine.framesRemaining < 0) {
      return false;
    }
    fadingMine.modelMatrix = mat4.create();
    fadingMine.heading = (fadingMine.heading + (fadingMine.id % 2 ? 0.007 : -0.007)) % (Math.PI * 2);
    if (isRemotelyOnscreen(fadingMine.position)) {
      mat4.rotateZ(fadingMine.modelMatrix, fadingMine.modelMatrix, fadingMine.heading);
      mat4.rotateY(fadingMine.modelMatrix, fadingMine.modelMatrix, fadingMine.pitch);
      const scaleFactor = (fadingMine.framesRemaining / 180) * 1.5;
      mat4.scale(fadingMine.modelMatrix, fadingMine.modelMatrix, [scaleFactor, scaleFactor, scaleFactor]);
      drawMine(fadingMine, pointLights, 1 - fadingMine.framesRemaining / 180);
    }
    return true;
  });
};

const fadeOutCollectable = (collectable: Collectable) => {
  if (collectable.scale === undefined) {
    collectable.scale = 1;
  }
  fadingCollectables.push({ ...collectable, framesRemaining: 180 });
};

const processFadingCollectables = (sixtieths: number, pointLights: PointLightData[]) => {
  fadingCollectables = fadingCollectables.filter((fadingCollectable) => {
    fadingCollectable.framesRemaining -= sixtieths;
    if (fadingCollectable.framesRemaining < 0) {
      return false;
    }
    fadingCollectable.scale -= 0.8 / 180;
    if (isRemotelyOnscreen(fadingCollectable.position)) {
      drawCollectable(fadingCollectable, pointLights, 1 - fadingCollectable.framesRemaining / 180);
    }
    return true;
  });
};

const clientCollectableUpdate = (collectable: Collectable, sixtieths: number) => {
  collectable.phase += sixtieths * 0.03;
  collectable.heading = (collectable.heading + (collectable.id % 2 ? 0.007 : -0.007)) % (Math.PI * 2);
};

const clientMineUpdate = (mine: Mine, sixtieths: number) => {
  const def = mineDefs[mine.defIndex];
  mine.deploying = Math.max(0, mine.deploying - sixtieths);
  mine.modelMatrix = mat4.create();
  mine.heading = (mine.heading + (mine.id % 2 ? 0.007 : -0.007)) % (Math.PI * 2);
  mat4.rotateZ(mine.modelMatrix, mine.modelMatrix, mine.heading);
  mat4.rotateY(mine.modelMatrix, mine.modelMatrix, mine.pitch);
  const scaleFactor = (1 - mine.deploying / def.deploymentTime) * 1.5;
  mat4.scale(mine.modelMatrix, mine.modelMatrix, [scaleFactor, scaleFactor, scaleFactor]);
};

const drawMine = (mine: Mine, lightSources: PointLightData[], desaturation = 0) => {
  const def = mineDefs[mine.defIndex];
  let bufferData = models[def.modelIndex];

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

  gl.uniform3fv(programInfo.uniformLocations.baseColor, teamColorsFloat[mine.team]);

  // find the closest lights
  let lights: [number, PointLightData][] = [];
  for (let i = 0; i < pointLightCount; i++) {
    lights.push([Infinity, null]);
  }
  for (const light of lightSources) {
    const dist2 = l2NormSquared(light.position, mine.position);
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
      const pointLight = [mapGameXToWorld(lights[i][1].position.x), mapGameYToWorld(lights[i][1].position.y), lights[i][1].position.z, 0];
      gl.uniform4fv(programInfo.uniformLocations.pointLights[i], pointLight);
      gl.uniform3fv(programInfo.uniformLocations.pointLightLighting[i], lights[i][1].color);
    } else {
      gl.uniform4fv(programInfo.uniformLocations.pointLights[i], [0.0, 0.0, 0.0, 0.0]);
      gl.uniform3fv(programInfo.uniformLocations.pointLightLighting[i], [0.0, 0.0, 0.0]);
    }
  }

  gl.uniformMatrix4fv(programInfo.uniformLocations.modelMatrix, false, mine.modelMatrix);

  const viewMatrix = mat4.create();
  mat4.translate(viewMatrix, viewMatrix, [mapGameXToWorld(mine.position.x), mapGameYToWorld(mine.position.y), gamePlaneZ]);
  gl.uniformMatrix4fv(programInfo.uniformLocations.viewMatrix, false, viewMatrix);

  const normalMatrix = mat4.create();
  mat4.invert(normalMatrix, mat4.mul(normalMatrix, viewMatrix, mine.modelMatrix));
  mat4.transpose(normalMatrix, normalMatrix);
  gl.uniformMatrix4fv(programInfo.uniformLocations.normalMatrix, false, normalMatrix);

  gl.uniform1i(programInfo.uniformLocations.drawType, DrawType.Player);

  gl.uniform4f(programInfo.uniformLocations.desaturateAndTransparencyAndWarpingAndHighlight, desaturation, 0.0, 0, 0);

  const vertexCount = models[def.modelIndex].indices.length || 0;
  const type = gl.UNSIGNED_SHORT;
  const offset = 0;
  gl.drawElements(gl.TRIANGLES, vertexCount, type, offset);
};

const clientMissileUpdate = (missile: Missile) => {
  if (missile.roll === undefined) {
    missile.roll = 0;
  }
  missile.roll += 0.01;
  const modelMatrix = mat4.create();
  mat4.rotateZ(modelMatrix, modelMatrix, -missile.heading);
  mat4.rotateX(modelMatrix, modelMatrix, missile.roll);
  missile.modelMatrix = modelMatrix;
};

const drawMissile = (missile: Missile, lightSources: PointLightData[]) => {
  const def = missileDefs[missile.defIndex];
  let bufferData = models[def.modelIndex];

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

  gl.uniform3fv(programInfo.uniformLocations.baseColor, teamColorsFloat[missile.team]);

  // find the closest lights
  let lights: [number, PointLightData][] = [];
  for (let i = 0; i < pointLightCount; i++) {
    lights.push([Infinity, null]);
  }
  for (const light of lightSources) {
    const dist2 = l2NormSquared(light.position, missile.position);
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
      const pointLight = [mapGameXToWorld(lights[i][1].position.x), mapGameYToWorld(lights[i][1].position.y), lights[i][1].position.z, 0];
      gl.uniform4fv(programInfo.uniformLocations.pointLights[i], pointLight);
      gl.uniform3fv(programInfo.uniformLocations.pointLightLighting[i], lights[i][1].color);
    } else {
      gl.uniform4fv(programInfo.uniformLocations.pointLights[i], [0.0, 0.0, 0.0, 0.0]);
      gl.uniform3fv(programInfo.uniformLocations.pointLightLighting[i], [0.0, 0.0, 0.0]);
    }
  }

  gl.uniformMatrix4fv(programInfo.uniformLocations.modelMatrix, false, missile.modelMatrix);

  const viewMatrix = mat4.create();
  mat4.translate(viewMatrix, viewMatrix, [mapGameXToWorld(missile.position.x), mapGameYToWorld(missile.position.y), gamePlaneZ]);
  gl.uniformMatrix4fv(programInfo.uniformLocations.viewMatrix, false, viewMatrix);

  const normalMatrix = mat4.create();
  mat4.invert(normalMatrix, mat4.mul(normalMatrix, viewMatrix, missile.modelMatrix));
  mat4.transpose(normalMatrix, normalMatrix);
  gl.uniformMatrix4fv(programInfo.uniformLocations.normalMatrix, false, normalMatrix);

  gl.uniform1i(programInfo.uniformLocations.drawType, DrawType.Player);

  gl.uniform4f(programInfo.uniformLocations.desaturateAndTransparencyAndWarpingAndHighlight, 0.0, 0.0, 0, 0);

  const vertexCount = models[def.modelIndex].indices.length || 0;
  const type = gl.UNSIGNED_SHORT;
  const offset = 0;
  gl.drawElements(gl.TRIANGLES, vertexCount, type, offset);
};

const setLineUniforms = () => {
  const viewMatrix = mat4.create();
  mat4.scale(viewMatrix, viewMatrix, [1 / 10, -1 / 10, 1]);
  mat4.translate(viewMatrix, viewMatrix, [-lastSelf.position.x, -lastSelf.position.y, gamePlaneZ]);

  gl.uniformMatrix4fv(programInfo.uniformLocations.viewMatrix, false, viewMatrix);

  gl.uniform1i(programInfo.uniformLocations.drawType, DrawType.Line);
};

// Uses reduced world coordinates
const drawLine = (from: [number, number], to: [number, number], width: number, color: [number, number, number, number], dropoff = 0) => {
  gl.uniform4f(programInfo.uniformLocations.lineFromTo, from[0], from[1], to[0], to[1]);
  gl.uniform4f(programInfo.uniformLocations.lineWidthAndDropoff, width * 10, dropoff, 0, 0);
  gl.uniform4fv(programInfo.uniformLocations.lineColor, color);

  gl.drawArrays(gl.TRIANGLES, 0, 12);
};

const isRemotelyOnscreen = (position: Position) => {
  return !(
    position.x < canvasGameTopLeft.x - 500 ||
    position.x > canvasGameBottomRight.x + 500 ||
    position.y < canvasGameTopLeft.y - 500 ||
    position.y > canvasGameBottomRight.y + 500
  );
};

const isRemotelyOnscreenReducedWorldCoords = (x: number, y: number) => {
  return !(
    x * 10 < canvasGameTopLeft.x - 500 ||
    x * 10 > canvasGameBottomRight.x + 500 ||
    y * -10 < canvasGameTopLeft.y - 500 ||
    y * -10 > canvasGameBottomRight.y + 500
  );
};

const lightSources: PointLightData[] = [];

const addLightSource = (position: Position, unnormedColor: [number, number, number]) => {
  lightSources.push({ position: { ...position, z: gamePlaneZ }, color: unnormedColor });
  // console.log({ position: { ...position, z: gamePlaneZ }, color: unnormedColor });
};

// Renders a ship in in the main world, grabs the pixels and then blits the pixels to the preview canvas
const doPreviewRendering = (previewRequest: PreviewRequest) => {
  const targetDisplayRectNDC = canvasRectToNDC({ x: 0, y: 0, width: 800, height: 800 });

  const def = defs[previewRequest.defIndex];
  let bufferData = models[def.modelIndex];

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

  gl.uniform3fv(programInfo.uniformLocations.baseColor, teamColorsFloat[lastSelf.team]);

  const viewMatrix = mat4.create();
  mat4.translate(viewMatrix, viewMatrix, [0, 0, 0]);
  gl.uniformMatrix4fv(programInfo.uniformLocations.viewMatrix, false, viewMatrix);

  const modelMatrix = mat4.create();
  gl.uniformMatrix4fv(programInfo.uniformLocations.modelMatrix, false, modelMatrix);
  const normalMatrix = mat4.create();
  // mat4.invert(normalMatrix, mat4.mul(normalMatrix, viewMatrix, modelMatrix));
  // mat4.transpose(normalMatrix, normalMatrix);
  gl.uniformMatrix4fv(programInfo.uniformLocations.normalMatrix, false, normalMatrix);

  gl.uniform1i(programInfo.uniformLocations.drawType, DrawType.Target);

  gl.uniform4f(programInfo.uniformLocations.desaturateAndTransparencyAndWarpingAndHighlight, 0, 0, 0, 0);

  const vertexCount = models[def.modelIndex].indices.length || 0;
  const type = gl.UNSIGNED_SHORT;
  const offset = 0;
  const pixelData = new Uint8Array(4 * 800 * 800);

  gl.drawElements(gl.TRIANGLES, vertexCount, type, offset);
  gl.readPixels(0, canvas.height - 800, 800, 800, gl.RGBA, gl.UNSIGNED_BYTE, pixelData);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  blitShipPreview(previewRequest.canvasId, new Uint8ClampedArray(pixelData));
};

const fixFirefoxJankyness = () => {
  // Firefox appears to have a problem where it will not do a drawArrays call if there is not a buffer with an active attribute
  {
    const model = models[0];
    {
      const numComponents = 3;
      const type = gl.FLOAT;
      const normalize = false;
      const stride = 0;
      const offset = 0;
      gl.bindBuffer(gl.ARRAY_BUFFER, model.vertexBuffer);
      gl.vertexAttribPointer(programInfo.attribLocations.vertexPosition, numComponents, type, normalize, stride, offset);
      gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition);
    }
  }
};

// Main draw function (some game things appear to be updated here, but it is just cosmetic updates and has nothing to do with game logic)
const drawEverything = (target: Player | undefined, targetAsteroid: Asteroid | undefined, chats: Map<number, ChatMessage>, sixtieths: number) => {
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  if (!lastSelf) {
    lightSources.length = 0;
    return;
  }

  const phase = Math.sin(Date.now() / 250) * 0.5 + 0.5;
  gl.useProgram(programInfo.program);
  gl.uniform1f(programInfo.uniformLocations.phase, phase);

  if (previewRequests.length > 0) {
    const previewRequest = previewRequests.shift();
    doPreviewRendering(previewRequest);
  }

  canvasGameTopLeft = canvasCoordsToGameCoords(0, 0);
  canvasGameBottomRight = canvasCoordsToGameCoords(canvas.width, canvas.height);

  gl.uniformMatrix4fv(programInfo.uniformLocations.projectionMatrix, false, projectionMatrix);

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
    drawPrompts();
  }

  // Compute all point lights in the scene (and handle some other updates to drawing data)
  for (const projectile of state.projectiles.values()) {
    if (isRemotelyOnscreen(projectile.position)) {
      lightSources.push({
        position: { x: projectile.position.x, y: projectile.position.y, z: gamePlaneZ },
        color: projectileLightColorUnnormed(projectile.idx),
      });
    }
  }

  for (const player of state.players.values()) {
    if (isRemotelyOnscreen(player.position)) {
      clientPlayerUpdate(player);

      if (!player.inoperable && !player.docked) {
        const def = defs[player.defIndex];
        if (def.pointLights) {
          for (const light of def.pointLights) {
            const pos = vec4.create();
            vec4.set(pos, light.position.x, light.position.y, light.position.z, 1);

            vec4.transformMat4(pos, pos, player.modelMatrix);

            lightSources.push({
              position: { x: pos[0] * 10 + player.position.x, y: -pos[1] * 10 + player.position.y, z: gamePlaneZ + pos[2] },
              color: light.color,
            });
          }
        }
      }
    }
  }

  for (const collectable of state.collectables.values()) {
    if (isRemotelyOnscreen(collectable.position)) {
      clientCollectableUpdate(collectable, sixtieths);

      const def = collectableDefs[collectable.index];
      lightSources.push({
        position: { x: collectable.position.x, y: collectable.position.y, z: gamePlaneZ + 4 },
        color: def.light,
      });
    }
  }

  // Update the mines and also add the point lights
  for (const mine of state.mines.values()) {
    clientMineUpdate(mine, sixtieths);

    if (mine.deploying) {
      continue;
    }

    if (isRemotelyOnscreen(mine.position)) {
      const def = mineDefs[mine.defIndex];
      if (def.pointLights) {
        for (const light of def.pointLights) {
          const pos = vec4.create();
          vec4.set(pos, light.position.x, light.position.y, light.position.z, 1);

          vec4.transformMat4(pos, pos, mine.modelMatrix);

          lightSources.push({
            position: { x: pos[0] * 10 + mine.position.x, y: -pos[1] * 10 + mine.position.y, z: gamePlaneZ + pos[2] },
            color: light.color,
          });
        }
      }
    }
  }

  for (const missile of state.missiles.values()) {
    clientMissileUpdate(missile);

    if (isRemotelyOnscreen(missile.position)) {
      const def = missileDefs[missile.defIndex];
      if (def.pointLights) {
        for (const light of def.pointLights) {
          const pos = vec4.create();
          vec4.set(pos, light.position.x, light.position.y, light.position.z, 1);

          vec4.transformMat4(pos, pos, missile.modelMatrix);

          lightSources.push({
            position: { x: pos[0] * 10 + missile.position.x, y: -pos[1] * 10 + missile.position.y, z: gamePlaneZ + pos[2] },
            color: light.color,
          });
        }
      }
    }
  }

  // Start drawing world objects (all light sources are aggregated above this point)
  processFadingMines(sixtieths, lightSources);
  processFadingCollectables(sixtieths, lightSources);

  gl.enable(gl.CULL_FACE);
  for (const player of state.players.values()) {
    if (!player.docked && isRemotelyOnscreen(player.position)) {
      drawPlayer(player, lightSources, player.id === target?.id);
    }
  }
  gl.disable(gl.CULL_FACE);

  for (const asteroid of state.asteroids.values()) {
    asteroid.roll += asteroid.rotationRate * sixtieths;
    if (isRemotelyOnscreen(asteroid.position)) {
      drawAsteroid(asteroid, lightSources, asteroid.id === targetAsteroid?.id);
    }
  }

  for (const collectable of state.collectables.values()) {
    if (isRemotelyOnscreen(collectable.position)) {
      drawCollectable(collectable, lightSources);
    }
  }

  for (const mine of state.mines.values()) {
    if (isRemotelyOnscreen(mine.position)) {
      drawMine(mine, lightSources);
    }
  }

  for (const projectile of state.projectiles.values()) {
    if (isRemotelyOnscreen(projectile.position)) {
      drawProjectile(projectile);
    }
  }

  for (const missile of state.missiles.values()) {
    if (isRemotelyOnscreen(missile.position)) {
      drawMissile(missile, lightSources);
    }
  }

  // TODO Need to use bitmap with source atop
  drawChats(chats.values());

  if (!lastSelf.docked) {
    drawWeaponText();
    // Likewise for all these functions we need to switch to a bitmap with source atop
    const arrows = computeArrows(target, targetAsteroid);
    drawArrows(arrows);
    drawMessages(sixtieths);
  }

  drawParticles(sixtieths);
  gl.useProgram(programInfo.program);
  gl.uniform1f(programInfo.uniformLocations.phase, phase);

  if (isFirefox) {
    fixFirefoxJankyness();
  }
  setLineUniforms();
  // Lazy way to deal with point lights is to process them one frame later
  lightSources.length = 0;
  drawEffects(sixtieths);
  drawSectorArrowAndLines();

  if (!lastSelf.docked) {
    draw2d(programInfo);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    if (target) {
      // DEPTH CLEARED HERE AND ALSO AGAIN IN THE TARGET DRAWING FUNCTIONS!!!
      drawTarget(target, targetDisplayRect);
    } else if (targetAsteroid) {
      drawTargetAsteroid(targetAsteroid, targetDisplayRect);
    }
  } else {
    displayDockedMessages(sixtieths);
  }
};

const canvasCoordsToGameCoords = (x: number, y: number) => {
  if (!lastSelf) {
    return undefined;
  }
  let ndcX = (x / canvas.width) * 2 - 1;
  let ndcY = (y / canvas.height) * 2 - 1;
  let coords = vec4.create();
  vec4.set(coords, ndcX, -ndcY, -1, 1);
  vec4.transformMat4(coords, coords, inverseProjectionMatrix);
  // solve for the intersection with the game plane to get the world coordinates
  let t = gamePlaneZ / coords[2];
  let worldX = coords[0] * t;
  let worldY = coords[1] * t;
  return { x: mapWorldXToGame(worldX), y: mapWorldYToGame(worldY) };
};

const previewRequests: PreviewRequest[] = [];

type PreviewRequest = {
  canvasId: string;
  defIndex: number;
};

const requestShipPreview = (canvasId: string, defIndex: number) => {
  previewRequests.push({ canvasId, defIndex });
};

const blitShipPreview = (canvasId: string, data: Uint8ClampedArray) => {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
  if (!canvas) {
    return;
  }
  const ctx = canvas.getContext("2d");
  const imageData = ctx.createImageData(canvas.width, canvas.height);
  imageData.data.set(data);
  ctx.putImageData(imageData, 0, 0);
};

export {
  init3dDrawing,
  canvas,
  canvasCoordsToGameCoords,
  drawEverything,
  gl,
  projectionMatrix,
  DrawType,
  ctx,
  overlayCanvas,
  gamePlaneZ,
  mapGameXToWorld,
  mapGameYToWorld,
  canvasGameTopLeft,
  canvasGameBottomRight,
  particleProgramInfo,
  particleRenderingProgramInfo,
  fadeOutMine,
  isRemotelyOnscreenReducedWorldCoords,
  drawLine,
  addLightSource,
  programInfo,
  requestShipPreview,
  fadeOutCollectable,
};
