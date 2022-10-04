let div: HTMLDivElement;

const init = () => {
  div = document.getElementById("dialog") as HTMLDivElement;
  div.style.display = "none";
};

const show = (html: string) => {
  div.style.display = "flex";
  div.innerHTML = `<div class="center">${html}</div>`;
};

const hide = () => {
  div.style.display = "none";
};

const clear = () => {
  div.innerHTML = "";
};

const horizontalCenter = (htmls: string[]) => {
  return `<div style="text-align: center;">${htmls.map(html => `<div style="display: inline-block;">${html}</div>`).join("<br/>")}</div>`;
};

export { init, show, hide, clear, horizontalCenter };
