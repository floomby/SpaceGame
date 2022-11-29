// Wavefront importer

const modelMap = new Map<string, Model>();

class Model {
  public vertices: number[] = [];
  public vertexDimension: number = 0;

  public vertexNormals: number[] = [];

  public vertexTextureCoords: number[] = [];
  public vertexTextureCoordDimension: number = 0;

  public vertexIndices: number[] = [];
  public vertexNormalIndices: number[] = [];
  public vertexTextureCoordIndices: number[] = [];

  public name: string = "";

  public texture: HTMLImageElement | null = null;

  private loadTexture(resolve: (model: Model) => void, reject: (error: Error) => void) {
    const texture = new Image();
    texture.onload = () => {
      this.texture = texture;
      resolve(this);
    };
    texture.onerror = () => {
      reject(new Error("Failed to load texture"));
    };
    texture.src = `resources/textures/${this.name}.png`;
  }

  constructor(data: string, resolve: (model: Model) => void, reject: (error: Error) => void) {
    let vertexDimensionSet = false;
    let vertexTextureCoordDimensionSet = false;

    const lines = data.replace(/\r/g, "").split("\n");

    for (const line of lines) {
      const elems = line.split(" ");
      switch (elems[0]) {
        case "o":
          this.name = elems[1];
          break;
        case "v":
          if (!vertexDimensionSet) {
            this.vertexDimension = elems.length - 1;
            vertexDimensionSet = true;
          }
          if (this.vertexDimension !== elems.length - 1) {
            throw new Error("Vertex dimension mismatch");
          }
          for (let i = 1; i < elems.length; i++) {
            this.vertices.push(parseFloat(elems[i]));
          }
          break;
        case "vn":
          for (let i = 1; i < elems.length; i++) {
            this.vertexNormals.push(parseFloat(elems[i]));
          }
          break;
        case "vt":
          if (!vertexTextureCoordDimensionSet) {
            this.vertexTextureCoordDimension = elems.length - 1;
            vertexTextureCoordDimensionSet = true;
          }
          if (this.vertexTextureCoordDimension !== elems.length - 1) {
            throw new Error("Vertex texture coord dimension mismatch");
          }
          for (let i = 1; i < elems.length; i++) {
            this.vertexTextureCoords.push(parseFloat(elems[i]));
          }
          break;
        case "f":
          if (elems.length === 5) {
            this.processQuadFace(elems);
          } else if (elems.length === 4) {
            this.processTriangleFace(elems);
          } else {
            throw new Error("Unsupported face - please triangularize or quadralateralize your mesh");
          }
          break;
      }
    }
    if (this.name === "") {
      throw new Error("Model name not set");
    }

    this.loadTexture(resolve, reject);

    modelMap.set(this.name, this);
  }

  private processFaceIndex(elem: string) {
    const subElems = elem.split("/");
    if (subElems.length !== 3) {
      throw new Error("Unsupported face format");
    }
    this.vertexIndices.push(parseInt(subElems[0], 10) - 1);
    this.vertexTextureCoordIndices.push(parseInt(subElems[1], 10) - 1);
    this.vertexNormalIndices.push(parseInt(subElems[2], 10) - 1);
  }

  private processQuadFace(elems: string[]) {
    for (let i = 1; i <= 3; i++) {
      this.processFaceIndex(elems[i]);
    }
    for (let i = 2; i <= 4; i++) {
      this.processFaceIndex(elems[i]);
    }
  }

  private processTriangleFace(elems: string[]) {
    for (let i = 1; i <= 3; i++) {
      this.processFaceIndex(elems[i]);
    }
  }

  public bindResources(gl: WebGLRenderingContext) {
    const vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.vertices), gl.STATIC_DRAW);

    const vertexTextureCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexTextureCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.vertexTextureCoords), gl.STATIC_DRAW);

    const indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(this.vertexIndices), gl.STATIC_DRAW);

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.texture);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    return { vertexBuffer, indexBuffer, vertexTextureCoordBuffer, texture };
  }
}

const loadObj = (file: string) => {
  return new Promise<Model>((resolve, reject) => {
    fetch(`resources/models/${file}`)
      .then((response) => {
        response
          .text()
          .then((data) => {
            new Model(data, resolve, reject);
          })
          .catch(reject);
      })
      .catch(reject);
  });
};

export { Model, loadObj, modelMap };
