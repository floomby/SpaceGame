// Right now the only worker is the worker that loads textures for webgl to use
// TODO Get imports working in the worker tsconfig

class EagerDebouncer {
  constructor(private delay: number) {}

  private sent = false;

  public debounce(func: () => void) {
    if (this.sent) {
      return;
    }

    this.sent = true;
    func();

    setTimeout(() => {
      this.sent = false;
    }, this.delay);
  }
}

const positiveMod = (a: number, b: number) => {
  return ((a % b) + b) % b;
};

const debounceMap = new Map<string, EagerDebouncer>();

const loadImageFromUrl = (x: number, y: number) => {
  console.log("requesting chunk", x, y);
  const url = `/resources/background/chunk${x}_${y}.png`;
  fetch(url).then((response) => {
    response.blob().then((blob) => {
      createImageBitmap(blob).then((imageBitmap) => {
        postMessage([x, y, imageBitmap], [imageBitmap]);
      });
    });
  });
};

onmessage = (e) => {
  e.data[0] = positiveMod(e.data[0], 16);
  e.data[1] = positiveMod(e.data[1], 16);
  const key = `${e.data[0]}_${e.data[1]}`;
  let debouncer = debounceMap.get(key);
  if (!debouncer) {
    debouncer = new EagerDebouncer(1300);
    debounceMap.set(key, debouncer);
  }
  debouncer.debounce(() => loadImageFromUrl(e.data[0], e.data[1]));
};
