const SCOPES = "https://www.googleapis.com/auth/calendar.readonly";

let tokenClient;
let accessToken = null;
let gapiInited = false;
let gisInited = false;

const signinBtn = document.getElementById("signinBtn");
const signoutBtn = document.getElementById("signoutBtn");
const dateFilter = document.getElementById("dateFilter");
const statusFilter = document.getElementById("statusFilter");
const searchFilter = document.getElementById("searchFilter");
const refreshBtn = document.getElementById("refreshBtn");
const jobsList = document.getElementById("jobsList");
const jobTemplate = document.getElementById("jobCardTemplate");

document.addEventListener("DOMContentLoaded", () => {
  dateFilter.value = new Date().toISOString().slice(0, 10);

  window.gapiLoaded = gapiLoaded;
  window.gisLoaded = gisLoaded;

  signinBtn.addEventListener("click", signIn);
  signoutBtn.addEventListener("click", signOut);
  refreshBtn.addEventListener("click", loadJobs);

  [dateFilter, statusFilter, searchFilter].forEach(el =>
    el.addEventListener("input", applyFilters)
  );
});

/******** GOOGLE INIT ********/

async function gapiLoaded() {
  gapiInited = true;
  await gapi.load("client", initGapiClient);
}

async function initGapiClient() {
  await gapi.client.init({
    discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest"]
  });
  gapiInited = true;
  maybeEnableSignin();
}

function gisLoaded() {
  gisInited = true;

  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: SCOPES,
    callback: (resp) => {
      accessToken = resp.access_token;
      signinBtn.hidden = true;
      signoutBtn.hidden = false;
      loadJobs();
    }
  });

  maybeEnableSignin();
}

function maybeEnableSignin() {
  if (gapiInited && gisInited) signinBtn.disabled = false;
}

function signIn() {
  tokenClient.requestAccessToken({ prompt: "" });
}

function signOut() {
  google.accounts.oauth2.revoke(accessToken, () => {
    accessToken = null;
    signinBtn.hidden = false;
    signoutBtn.hidden = true;
    jobsList.innerHTML = `<div class="empty-state">Signed out.</div>`;
  });
}

/******** LOAD JOBS ********/

async function loadJobs() {
  if (!accessToken) return signIn();

  const date = dateFilter.value;
  const timeMin = new Date(date + "T00:00:00").toISOString();
  const timeMax = new Date(date + "T23:59:59").toISOString();

  const res = await gapi.client.calendar.events.list({
    calendarId: GOOGLE_CALENDAR_ID,
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: "startTime"
  });

  const events = res.result.items || [];
  renderJobs(events);
}

/******** STATUS STORAGE ********/

function store() {
  return JSON.parse(localStorage.getItem("honestechStatus") || "{}");
}

function save(storeObj) {
  localStorage.setItem("honestechStatus", JSON.stringify(storeObj));
}

function getStatus(id) {
  return store()[id] || "Scheduled";
}

function setStatus(id, val) {
  const s = store();
  s[id] = val;
  save(s);
}

/******** RENDERING ********/

function renderJobs(events) {
  jobsList.innerHTML = "";

  if (!events.length) {
    jobsList.innerHTML = `<div class="empty-state">No jobs for this day.</div>`;
    return;
  }

  events.forEach(evt => {
    const card = jobTemplate.content.cloneNode(true);

    const title = card.querySelector(".job-title");
    const pill = card.querySelector(".job-status-pill");
    const time = card.querySelector(".job-time");
    const loc = card.querySelector(".job-location");
    const notes = card.querySelector(".job-notes");
    const select = card.querySelector(".job-status-select");
    const raw = card.querySelector(".job-raw-json");

    const id = evt.id;

    title.textContent = evt.summary || "(No title)";
    loc.textContent = evt.location || "No location";
    notes.textContent = evt.description || "";
    raw.textContent = JSON.stringify(evt, null, 2);

    const s = getStatus(id);
    pill.textContent = s;
    pill.dataset.status = s;
    select.value = s;

    const start = evt.start.dateTime || evt.start.date;
    const end = evt.end.dateTime || evt.end.date;
    time.textContent = formatTime(start) + " - " + formatTime(end);

    select.addEventListener("change", () => {
      const val = select.value;
      pill.textContent = val;
      pill.dataset.status = val;
      setStatus(id, val);
      applyFilters();
    });

    jobsList.appendChild(card);
  });

  applyFilters();
}

function formatTime(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/******** FILTERS ********/

function applyFilters() {
  const sVal = statusFilter.value;
  const search = searchFilter.value.toLowerCase();

  [...jobsList.querySelectorAll(".job-card")].forEach(card => {
    const title = card.querySelector(".job-title").textContent.toLowerCase();
    const loc = card.querySelector(".job-location").textContent.toLowerCase();
    const notes = card.querySelector(".job-notes").textContent.toLowerCase();
    const st = card.querySelector(".job-status-pill").dataset.status;

    let show = true;

    if (sVal !== "all" && st !== sVal) show = false;

    if (search && !(title + loc + notes).includes(search)) show = false;

    card.style.display = show ? "" : "none";
  });
}
