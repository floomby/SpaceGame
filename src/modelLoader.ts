// Wavefront importer

const models: Model[] = [];
const modelMap = new Map<string, [Model, number]>();

type Vertex = {
  x: number;
  y: number;
  z: number;
  u: number;
  v: number;
  nx: number;
  ny: number;
  nz: number;
};

class Model {
  private verticesMisordered: number[] = [];
  private vertexDimension: number = 0;

  private vertexTextureCoordsMisordered: number[] = [];
  private vertexTextureCoordDimension: number = 0;

  private vertexNormalsMisordered: number[] = [];

  public vertices: number[] = [];
  public vertexTextureCoords: number[] = [];
  public vertexNormals: number[] = [];
  public indices: number[] = [];

  public name: string = "";

  private texture: HTMLImageElement | null = null;

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

  private uniqueVertices: Map<string, [number, Vertex]>;

  constructor(data: string, resolve: (model: Model) => void, reject: (error: Error) => void) {
    let vertexDimensionSet = false;
    let vertexTextureCoordDimensionSet = false;

    const lines = data.replace(/\r/g, "").split("\n");

    this.uniqueVertices = new Map();

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
            this.verticesMisordered.push(parseFloat(elems[i]));
          }
          break;
        case "vn":
          for (let i = 1; i < elems.length; i++) {
            this.vertexNormalsMisordered.push(parseFloat(elems[i]));
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
            this.vertexTextureCoordsMisordered.push(parseFloat(elems[i]));
          }
          break;
        case "f":
          console.assert(this.vertexDimension === 3);
          console.assert(this.vertexTextureCoordDimension === 2);
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

    for (const [index, vertex] of this.uniqueVertices.values()) {
      this.vertices.push(vertex.x, vertex.y, vertex.z);
      this.vertexTextureCoords.push(vertex.u, vertex.v);
      this.vertexNormals.push(vertex.nx, vertex.ny, vertex.nz);
      console.assert(this.vertices.length === (index + 1) * 3);
      console.assert(this.vertexTextureCoords.length === (index + 1) * 2);
      console.assert(this.vertexNormals.length === (index + 1) * 3);
    }

    delete this.uniqueVertices;
    delete this.verticesMisordered;
    delete this.vertexTextureCoordsMisordered;
    delete this.vertexNormalsMisordered;

    this.loadTexture(resolve, reject);

    models.push(this);
    modelMap.set(this.name, [this, models.length - 1]);
  }

  private nonce = 0;

  private processFaceIndex(elem: string) {
    const subElems = elem.split("/");
    if (subElems.length !== 3) {
      throw new Error("Unsupported face format");
    }

    const vertexIndex = parseInt(subElems[0], 10) - 1;
    const vertexTextureCoordIndex = parseInt(subElems[1], 10) - 1;
    const vertexNormalIndex = parseInt(subElems[2], 10) - 1;

    const vertex: Vertex = {
      x: this.verticesMisordered[vertexIndex * this.vertexDimension],
      y: this.verticesMisordered[vertexIndex * this.vertexDimension + 1],
      z: this.verticesMisordered[vertexIndex * this.vertexDimension + 2],
      u: this.vertexTextureCoordsMisordered[vertexTextureCoordIndex * this.vertexTextureCoordDimension],
      v: this.vertexTextureCoordsMisordered[vertexTextureCoordIndex * this.vertexTextureCoordDimension + 1],
      nx: this.vertexNormalsMisordered[vertexNormalIndex * 3],
      ny: this.vertexNormalsMisordered[vertexNormalIndex * 3 + 1],
      nz: this.vertexNormalsMisordered[vertexNormalIndex * 3 + 2],
    };

    const key = `${vertex.x},${vertex.y},${vertex.z},${vertex.u},${vertex.v},${vertex.nx},${vertex.ny},${vertex.nz},${this.nonce++}`;
    if (this.uniqueVertices.has(key)) {
      return this.uniqueVertices.get(key)[0];
    } else {
      const index = this.uniqueVertices.size;
      this.uniqueVertices.set(key, [index, vertex]);
      return index;
    }
  }

  private processQuadFace(elems: string[]) {
    for (const i of [1, 2, 3]) {
      this.indices.push(this.processFaceIndex(elems[i]));
    }
    for (const i of [1, 3, 4]) {
      this.indices.push(this.processFaceIndex(elems[i]));
    }
  }

  private processTriangleFace(elems: string[]) {
    for (let i = 1; i <= 3; i++) {
      this.indices.push(this.processFaceIndex(elems[i]));
    }
  }

  private indexBuffer: WebGLBuffer;
  private vertexBuffer: WebGLBuffer;
  private vertexTextureCoordBuffer: WebGLBuffer;
  private vertexNormalBuffer: WebGLBuffer;
  private textureResource: WebGLTexture;
  private buffersUninitialized = true;

  public bindResources(gl: WebGLRenderingContext) {
    if (this.buffersUninitialized) {
      this.vertexBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.vertices), gl.STATIC_DRAW);

      this.vertexTextureCoordBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexTextureCoordBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.vertexTextureCoords), gl.STATIC_DRAW);

      this.vertexNormalBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexNormalBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.vertexNormals), gl.STATIC_DRAW);

      this.indexBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(this.indices), gl.STATIC_DRAW);

      this.textureResource = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.textureResource);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.texture);

      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

      delete this.texture;

      this.buffersUninitialized = false;
    }

    return {
      vertexBuffer: this.vertexBuffer,
      indexBuffer: this.indexBuffer,
      vertexTextureCoordBuffer: this.vertexTextureCoordBuffer,
      vertexNormalBuffer: this.vertexNormalBuffer,
      texture: this.textureResource,
    };
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

export { Model, loadObj, modelMap, models };
