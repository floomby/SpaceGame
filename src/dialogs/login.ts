import { getFactionString, Faction } from "../defs";
import { horizontalCenter, setDialogBackground, push as pushDialog, pop as popDialog, show as showDialog, pop, center } from "../dialog";
import { faction, keybind, setFaction, allianceColor, confederationColor } from "../globals";
import { KeyBindings } from "../keybindings";
import { register, login } from "../net";
import { getRestRaw } from "../rest";
import { initSound } from "../sound";
import { Debouncer } from "./helpers";

const loggingInDialog = horizontalCenter(["<h3>Logging in...</h3>"]);
const registeringDialog = horizontalCenter(["<h3>Registering...</h3>"]);

const doRegister = (username: string, password: string) => {
  register(username, password, faction);
  pushDialog(registeringDialog, () => { }, "registering");
};

const doLogin = (username: string, password: string) => {
  login(username, password);
  pushDialog(loggingInDialog, () => { }, "loggingIn");
};

const loginHandler = () => {
  // This is the first place that interacting with the page is guaranteed and so we setup the sound here
  // Is idempotent, so we can just call it even if we get kicked back to the login dialog due to invalid login
  initSound();

  const input = document.getElementById("username") as HTMLInputElement;
  const password = document.getElementById("password") as HTMLInputElement;
  doLogin(input.value, password.value);
};

const registerHandler = () => {
  initSound();

  const registerInput = document.getElementById("registerUsername") as HTMLInputElement;
  const registerPassword = document.getElementById("registerPassword") as HTMLInputElement;
  const input = document.getElementById("username") as HTMLInputElement;
  const password = document.getElementById("password") as HTMLInputElement;
  input.value = registerInput.value;
  password.value = registerPassword.value;
  doRegister(registerInput.value, registerPassword.value);
};

const enterKeyHandler = (f: () => void) => (e: KeyboardEvent) => {
  if (e.key === "Enter") {
    f();
  }
};

const registerDialog = horizontalCenter([
  "<h2>Register</h2>",
  `<div id="registerErrorSpot" class="error"></div>`,
  `<input type="text" placeholder="Username" id="registerUsername" style="color: black;"/>`,
  `<input style="margin-top: 10px;" type="password" placeholder="Password" id="registerPassword"/>`,
  `<br/><fieldset style="display: inline;">
  <legend>Select Faction</legend>
  <div style="text-align: left;">
    <input type="radio" id="alliance" name="faction" value="alliance" checked>
    <label for="alliance">${getFactionString(Faction.Alliance)}</label>
  </div>
  <div style="text-align: left;">
    <input type="radio" id="confederation" name="faction" value="confederation">
    <label for="confederation">${getFactionString(Faction.Confederation)}</label>
</fieldset>`,
  `<br/><button style="margin-top: 10px;" id="registerButton">Register</button>`,
  `<button style="margin-top: 10px;" id="backToLogin">Back</button>`,
]);

const setupRegisterDialog = (username: string, password: string) => {
  const passwordInput = document.getElementById("registerPassword") as HTMLInputElement;
  const usernameInput = document.getElementById("registerUsername") as HTMLInputElement;

  const validator = (value: string) => {
    getRestRaw(`/available?name=${value}`, (data: string) => {
      const available = JSON.parse(data) as boolean;
      if (usernameInput.value === value) {
        if (available) {
          usernameInput.style.backgroundColor = "#aaffaa";
        } else {
          usernameInput.style.backgroundColor = "#ffaaaa";
        }
      }
    });
  }

  validator(username);

  const debouncer = new Debouncer(300);

  usernameInput.addEventListener("keyup", () => {
    debouncer.debounce(() => validator(usernameInput.value));
  });

  usernameInput.value = username;
  passwordInput.value = password;

  document.getElementById("errorSpot").innerHTML = "";

  usernameInput.addEventListener("keyup", (event) => {
    if (event.key === "Enter") {
      passwordInput.focus();
    }
  });
  passwordInput.addEventListener("keydown", enterKeyHandler(registerHandler));
  // keylayoutSelectorSetup();
  const alliance = document.getElementById("alliance") as HTMLInputElement;
  const confederation = document.getElementById("confederation") as HTMLInputElement;
  alliance.addEventListener("change", () => {
    if (alliance.checked) {
      setFaction(Faction.Alliance);
      setDialogBackground(allianceColor);
    }
  });
  confederation.addEventListener("change", () => {
    if (confederation.checked) {
      setFaction(Faction.Confederation);
      setDialogBackground(confederationColor);
    }
  });
  document.getElementById("registerButton")?.addEventListener("click", registerHandler);
  document.getElementById("backToLogin")?.addEventListener("click", () => popDialog());
};

const loginDialog = `<div class="center">${horizontalCenter([
  "<h1 class='title'>Space Quest</h1>",
  `<div id="errorSpot" class="error"></div>`,
  `<input type="text" placeholder="Username" id="username"/>`,
  `<input style="margin-top: 10px;" type="password" placeholder="Password" id="password"/>`,
  `<br/><button id="loginButton">Login</button>`,
  `<button style="margin-top: 10px;" id="openRegister">Create an Account</button>`,
  `<button style="marin-top: 10px;" id="changePassword" class="secondary">Change Password</button>`
])}</div>`;

const setupLoginDialog = () => {
  const passwordInput = document.getElementById("password") as HTMLInputElement;
  const usernameInput = document.getElementById("username") as HTMLInputElement;
  usernameInput.addEventListener("keyup", (event) => {
    if (event.key === "Enter") {
      passwordInput.focus();
    }
  });
  passwordInput.addEventListener("keydown", enterKeyHandler(loginHandler));

  document.getElementById("loginButton")?.addEventListener("click", loginHandler);
  document.getElementById("openRegister")?.addEventListener("click", () =>
    pushDialog(
      registerDialog,
      () => {
        setupRegisterDialog(usernameInput.value, passwordInput.value);
      },
      "register"
    )
  );
  document.getElementById("changePassword")?.addEventListener("click", () => {
    pushDialog(
      changePasswordDialog,
      setupChangePasswordDialog,
      "changePassword"
    )
  })
};

const changePasswordDialog = `<div class="center">${horizontalCenter([
  "<h2>Change Password</h2>",
  `<div id="changeErrorSpot" class="error"></div>`,
  `<input type="text" placeholder="Username" id="changeUsername"/>`,
  `<input style="margin-top: 10px;" type="password" placeholder="Previous Password" id="passwordOld"/>`,
  `<input style="margin-top: 10px;" type="password" placeholder="Password" id="passwordNew"/>`,
  `<br/><button id="changeButton">Change</button>`,
  `<button style="margin-top: 10px;" id="changeToLogin" class="secondary">Back</button>`,
])}</div>`;

const setupChangePasswordDialog = () => {
  document.getElementById("changeButton")?.addEventListener("click", () => {
    const username = document.getElementById("changeUsername") as HTMLInputElement
    const old = document.getElementById("passwordOld") as HTMLInputElement
    const passwordNew = document.getElementById("passwordNew") as HTMLInputElement

    fetch(`/changePassword?username=${encodeURIComponent(username.value)}&old=${encodeURIComponent(old.value)}&new=${encodeURIComponent(passwordNew.value)}`).then(res => res.text()).then(text => {
      if (text === "true") {
        popDialog()
      } else {
        document.getElementById("changeErrorSpot").innerText = text;
      }
    })
  })

  document.getElementById("changeToLogin")?.addEventListener("click", () => {
    popDialog()
  })
}

const displayLoginDialog = () => {
  showDialog(loginDialog);
  setupLoginDialog();
};

export { displayLoginDialog };
