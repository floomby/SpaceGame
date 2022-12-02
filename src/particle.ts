// Stuff for the particle system (some of the stuff is in the 3dDrawing file, such as shader program compilation and linking)

const randomNoise = (width: number, height: number, channels: number) => {
  const data = new Uint8Array(width * height * channels);
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.floor(Math.random() * 255);
  }
  return data;
}

export { randomNoise };