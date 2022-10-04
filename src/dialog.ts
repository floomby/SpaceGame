let div: HTMLDivElement;

const init = () => {
  div = document.getElementById("dialog") as HTMLDivElement;
  div.style.display = "none";
};

const show = (html: string) => {
  div.style.display = "flex";
  div.innerHTML = `<div class="dialog">${html}</div>`;
};

const hide = () => {
  div.style.display = "none";
};

export { init, show, hide };