// Right now the only worker is the worker that loads textures for webgl to use

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
  e.data[0] = Math.min(Math.max(e.data[0], 0), 15);
  e.data[1] = Math.min(Math.max(e.data[1], 0), 15);
  const key = `${e.data[0]}_${e.data[1]}`;
  let debouncer = debounceMap.get(key);
  if (!debouncer) {
    debouncer = new EagerDebouncer(1300);
    debounceMap.set(key, debouncer);
  }
  debouncer.debounce(() => loadImageFromUrl(e.data[0], e.data[1]));
};
