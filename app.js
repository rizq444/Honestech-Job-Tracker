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

  signinBtn.addEventListener("click", signIn);
  signoutBtn.addEventListener("click", signOut);
  refreshBtn.addEventListener("click", loadJobs);

  [dateFilter, statusFilter, searchFilter].forEach(el =>
    el.addEventListener("input", applyFilters)
  );
});

/******** GOOGLE INIT – CALLED FROM SCRIPT TAGS ********/

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
      if (resp.error) {
        console.error(resp);
        return;
      }
      accessToken = resp.access_token;
      signinBtn.hidden = true;
      signoutBtn.hidden = false;
      loadJobs();
    }
  });

  maybeEnableSignin();
}

function maybeEnableSignin() {
  if (gapiInited && gisInited) {
    signinBtn.disabled = false;
  }
}

/******** SIGN IN / OUT ********/

function signIn() {
  if (!tokenClient) {
    console.error("Token client not ready yet.");
    return;
  }
  tokenClient.requestAccessToken({ prompt: "" });
}

function signOut() {
  if (!accessToken) return;

  google.accounts.oauth2.revoke(accessToken, () => {
    accessToken = null;
    signinBtn.hidden = false;
    signoutBtn.hidden = true;
    jobsList.innerHTML = `<div class="empty-state">Signed out.</div>`;
  });
}

/******** LOAD JOBS ********/

async function loadJobs() {
  if (!accessToken) {
    signIn();
    return;
  }

  const date = dateFilter.value || new Date().toISOString().slice(0, 10);
  const timeMin = new Date(date + "T00:00:00").toISOString();
  const timeMax = new Date(date + "T23:59:59").toISOString();

  try {
    const res = await gapi.client.calendar.events.list({
      calendarId: GOOGLE_CALENDAR_ID,
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: "startTime"
    });

    const events = res.result.items || [];
    renderJobs(events);
  } catch (err) {
    console.error("Error loading events", err);
    jobsList.innerHTML = `<div class="empty-state">Error loading events. Check console.</div>`;
  }
}

/******** LOCAL STORAGE (STATUS + TECH) ********/

function getStore() {
  try {
    return JSON.parse(localStorage.getItem("honestechJobs") || "{}");
  } catch {
    return {};
  }
}

function saveStore(store) {
  localStorage.setItem("honestechJobs", JSON.stringify(store));
}

function getJobMeta(id) {
  const store = getStore();
  return store[id] || { status: "Scheduled", tech: "" };
}

function setJobMeta(id, data) {
  const store = getStore();
  store[id] = { ...(store[id] || {}), ...data };
  saveStore(store);
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

    const titleEl = card.querySelector(".job-title");
    const statusPill = card.querySelector(".job-status-pill");
    const timeEl = card.querySelector(".job-time");
    const locEl = card.querySelector(".job-location");
    const notesEl = card.querySelector(".job-notes");
    const statusSelect = card.querySelector(".job-status-select");
    const techInput = card.querySelector(".job-tech-input");
    const rawJsonEl = card.querySelector(".job-raw-json");
    const navigateBtn = card.querySelector(".navigate-btn");
    const showRawBtn = card.querySelector(".show-raw-btn");
    const detailsEl = card.querySelector(".job-raw");

    const eventId = evt.id;
    const location = evt.location || "";
    const description = evt.description || "";

    const meta = getJobMeta(eventId);
    const status = meta.status || "Scheduled";
    const tech = meta.tech || "";

    titleEl.textContent = evt.summary || "(No title)";
    notesEl.textContent = description;
    locEl.textContent = location || "No location set";

    // Status
    statusPill.textContent = status;
    statusPill.dataset.status = status;
    statusSelect.value = status;

    statusSelect.addEventListener("change", () => {
      const newStatus = statusSelect.value;
      statusPill.textContent = newStatus;
      statusPill.dataset.status = newStatus;
      setJobMeta(eventId, { status: newStatus });
      applyFilters();
    });

    // Tech
    techInput.value = tech;
    techInput.addEventListener("change", () => {
      setJobMeta(eventId, { tech: techInput.value.trim() });
      applyFilters();
    });

    // Time
    const start = evt.start?.dateTime || evt.start?.date;
    const end = evt.end?.dateTime || evt.end?.date;
    timeEl.textContent = formatTime(start) + " – " + formatTime(end);

    // Raw JSON
    rawJsonEl.textContent = JSON.stringify(evt, null, 2);
    showRawBtn.addEventListener("click", () => {
      detailsEl.open = !detailsEl.open;
    });

    // Navigate button
    navigateBtn.addEventListener("click", () => {
      if (!location) {
        alert("No location set for this job.");
        return;
      }
      const url = "https://www.google.com/maps/search/?api=1&query="
        + encodeURIComponent(location);
      window.open(url, "_blank");
    });

    jobsList.appendChild(card);
  });

  applyFilters();
}

function formatTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/******** FILTERS ********/

function applyFilters() {
  const statusVal = statusFilter.value;
  const search = (searchFilter.value || "").toLowerCase();

  const cards = [...jobsList.querySelectorAll(".job-card")];

  cards.forEach(card => {
    const title = card.querySelector(".job-title")?.textContent.toLowerCase() || "";
    const loc = card.querySelector(".job-location")?.textContent.toLowerCase() || "";
    const notes = card.querySelector(".job-notes")?.textContent.toLowerCase() || "";
    const tech = card.querySelector(".job-tech-input")?.value.toLowerCase() || "";
    const st = card.querySelector(".job-status-pill")?.dataset.status || "";

    let show = true;

    if (statusVal !== "all" && st !== statusVal) show = false;

    if (search) {
      const haystack = `${title} ${loc} ${notes} ${tech}`;
      if (!haystack.includes(search)) show = false;
    }

    card.style.display = show ? "" : "none";
  });
}
