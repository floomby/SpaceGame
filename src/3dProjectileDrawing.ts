import { mat4 } from "gl-matrix";
import { DrawType, gamePlaneZ, gl, mapGameXToWorld, mapGameYToWorld, programInfo } from "./3dDrawing";
import { projectileDefs } from "./defs/projectiles";
import { PointLightData } from "./defs/shipsAndStations";
import { Ballistic } from "./game";
import { Model, modelMap } from "./modelLoader";

const drawer = (projectile: Ballistic, model: Model, randomizeMatrix = false) => {
  // {
  //   const numComponents = 3;
  //   const type = gl.FLOAT;
  //   const normalize = false;
  //   const stride = 0;
  //   const offset = 0;
  //   gl.bindBuffer(gl.ARRAY_BUFFER, model.vertexBuffer);
  //   gl.vertexAttribPointer(programInfo.attribLocations.vertexPosition, numComponents, type, normalize, stride, offset);
  //   gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition);
  // }

  // {
  //   const numComponents = 2;
  //   const type = gl.FLOAT;
  //   const normalize = false;
  //   const stride = 0;
  //   const offset = 0;
  //   gl.bindBuffer(gl.ARRAY_BUFFER, model.vertexTextureCoordBuffer);
  //   gl.vertexAttribPointer(programInfo.attribLocations.textureCoord, numComponents, type, normalize, stride, offset);
  //   gl.enableVertexAttribArray(programInfo.attribLocations.textureCoord);
  // }

  // {
  //   const numComponents = 3;
  //   const type = gl.FLOAT;
  //   const normalize = false;
  //   const stride = 0;
  //   const offset = 0;
  //   gl.bindBuffer(gl.ARRAY_BUFFER, model.vertexNormalBuffer);
  //   gl.vertexAttribPointer(programInfo.attribLocations.vertexNormal, numComponents, type, normalize, stride, offset);
  //   gl.enableVertexAttribArray(programInfo.attribLocations.vertexNormal);
  // }

  // gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, model.indexBuffer);

  gl.bindVertexArray(model.vertexArrayObject);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, model.texture);
  gl.uniform1i(programInfo.uniformLocations.uSampler, 0);

  const modelMatrix = mat4.create();
  mat4.rotateZ(modelMatrix, modelMatrix, -projectile.heading);
  if (randomizeMatrix) {
    mat4.rotateX(modelMatrix, modelMatrix, Math.random() * Math.PI * 2);
    mat4.rotateY(modelMatrix, modelMatrix, Math.random() * Math.PI * 2);
  }
  gl.uniformMatrix4fv(programInfo.uniformLocations.modelMatrix, false, modelMatrix);

  const viewMatrix = mat4.create();
  mat4.translate(viewMatrix, viewMatrix, [mapGameXToWorld(projectile.position.x), mapGameYToWorld(projectile.position.y), gamePlaneZ]);
  gl.uniformMatrix4fv(programInfo.uniformLocations.viewMatrix, false, viewMatrix);

  const normalMatrix = mat4.create();
  mat4.invert(normalMatrix, mat4.mul(normalMatrix, viewMatrix, modelMatrix));
  mat4.transpose(normalMatrix, normalMatrix);
  gl.uniformMatrix4fv(programInfo.uniformLocations.normalMatrix, false, normalMatrix);

  gl.uniform1i(programInfo.uniformLocations.drawType, DrawType.Projectile);

  gl.uniform3fv(programInfo.uniformLocations.baseColor, [1.0, 1.0, 1.0]);

  const vertexCount = model.indices.length || 0;
  const type = gl.UNSIGNED_SHORT;
  const offset = 0;
  gl.drawElements(gl.TRIANGLES, vertexCount, type, offset);

  gl.bindVertexArray(null);
};

const drawPrimary = (projectile: Ballistic) => {
  drawer(projectile, modelMap.get("projectile")![0]);
};

const drawDisruptor = (projectile: Ballistic) => {
  drawer(projectile, modelMap.get("disruptor")![0], true);
};

const drawPlasma = (projectile: Ballistic) => {
  drawer(projectile, modelMap.get("plasma")![0], true);
};

const projectileDrawers = [drawPrimary, drawPlasma, drawDisruptor];

const drawProjectile = (projectile: Ballistic) => {
  projectileDrawers[projectileDefs[projectile.idx].drawIndex](projectile);
};

export { drawProjectile };
