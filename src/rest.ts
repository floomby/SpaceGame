import { uid } from "./game";

const domFromRest = (query: string, template: (value: string) => string, postCompletion?: () => void) => {
  const id = uid();
  const html = `<div id="${id}"></div>`;
  fetch(query)
    .catch((error) => {
      console.error(error);
    })
    .then((response) => {
      if (response && response.ok) {
        return response.json();
      }
    })
    ?.then((data) => {
      if (data.error) {
        console.log("Rest error: " + data.error);
      } else {
        const element = document.getElementById(id.toString());
        if (element) {
          element.innerHTML = template(data.value);
          if (postCompletion) {
            postCompletion();
          }
        }
      }
    });
  return html;
};

const getRestRaw = (query: string, callback: (value: string) => void) => {
  fetch(query)
    .catch((error) => {
      console.error(error);
    })
    .then((response) => {
      if (response && response.ok) {
        return response.json();
      }
    })
    ?.then(callback);
};

export { domFromRest, getRestRaw };
