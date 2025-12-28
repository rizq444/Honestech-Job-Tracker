const SCOPES = "https://www.googleapis.com/auth/calendar.readonly";

let tokenClient;
let accessToken = null;
let gapiReady = false;
let gisReady = false;

// DOM
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

/******** Google init (called from script tags in index.html) ********/

async function gapiLoaded() {
  await new Promise(resolve => gapi.load("client", resolve));
  await gapi.client.init({
    discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest"]
  });
  gapiReady = true;
  enableSigninIfReady();
}

function gisLoaded() {
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
  gisReady = true;
  enableSigninIfReady();
}

function enableSigninIfReady() {
  if (gapiReady && gisReady) signinBtn.disabled = false;
}

/******** Sign in / out ********/

function signIn() {
  if (!tokenClient) return;
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

/******** Local storage (status + tech) ********/

function getLocalStore() {
  try {
    return JSON.parse(localStorage.getItem("honestechJobs") || "{}");
  } catch {
    return {};
  }
}

function setLocalStore(store) {
  localStorage.setItem("honestechJobs", JSON.stringify(store));
}

function getMeta(eventId) {
  const store = getLocalStore();
  return store[eventId] || { status: "Scheduled", tech: "" };
}

function setMeta(eventId, partial) {
  const store = getLocalStore();
  store[eventId] = { ...(store[eventId] || { status: "Scheduled", tech: "" }), ...partial };
  setLocalStore(store);
}

/******** Load jobs from Google Calendar ********/

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
      orderBy: "startTime",
      maxResults: 250
    });

    const events = res.result.items || [];
    renderJobs(events);
  } catch (err) {
    console.error("Calendar load error:", err);
    jobsList.innerHTML = `<div class="empty-state">Error loading events. Check console.</div>`;
  }
}

/******** Render ********/

function renderJobs(events) {
  jobsList.innerHTML = "";

  if (!events.length) {
    jobsList.innerHTML = `<div class="empty-state">No jobs found for this date.</div>`;
    return;
  }

  events.forEach(evt => {
    const node = jobTemplate.content.cloneNode(true);

    const titleEl = node.querySelector(".job-title");
    const pillEl = node.querySelector(".job-status-pill");
    const timeEl = node.querySelector(".job-time");
    const locEl = node.querySelector(".job-location");
    const notesEl = node.querySelector(".job-notes");
    const statusSelect = node.querySelector(".job-status-select");
    const techInput = node.querySelector(".job-tech-input");
    const navigateBtn = node.querySelector(".navigate-btn");
    const clockifyBtn = node.querySelector(".clockify-btn");
    const rawBtn = node.querySelector(".show-raw-btn");
    const detailsEl = node.querySelector(".job-raw");
    const rawJsonEl = node.querySelector(".job-raw-json");

    const eventId = evt.id;
    const meta = getMeta(eventId);

    // If no title, use description as title
const title = evt.summary && evt.summary.trim()
  ? evt.summary
  : (evt.description || "(No title)");

titleEl.textContent = title;

// Only show notes if they are different from title
notesEl.textContent =
  evt.description && evt.description !== title ? evt.description : "";

    const status = meta.status || "Scheduled";
    pillEl.textContent = status;
    pillEl.dataset.status = status;
    statusSelect.value = status;

    techInput.value = meta.tech || "";

    const start = evt.start?.dateTime || evt.start?.date;
    const end = evt.end?.dateTime || evt.end?.date;
    timeEl.textContent = `${formatTime(start)} – ${formatTime(end)}`;

    statusSelect.addEventListener("change", () => {
      const newStatus = statusSelect.value;
      setMeta(eventId, { status: newStatus });
      pillEl.textContent = newStatus;
      pillEl.dataset.status = newStatus;
      applyFilters();
    });

    techInput.addEventListener("change", () => {
      setMeta(eventId, { tech: techInput.value.trim() });
      applyFilters();
    });

    navigateBtn.addEventListener("click", () => {
      const loc = evt.location || "";
      if (!loc) return alert("No location set for this event.");
      const url = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(loc);
      window.open(url, "_blank");
    });

    // Clockify Option A: copy job info + open Clockify
    clockifyBtn.addEventListener("click", async () => {
      const title = evt.summary || "Honestech Job";
      const loc = evt.location || "";
      const notes = evt.description ? evt.description.replace(/\s+/g, " ").trim() : "";
      const tech = techInput?.value ? techInput.value.trim() : "";

      const clipboardText =
        `HONESTECH JOB\n` +
        `Title: ${title}\n` +
        (tech ? `Tech: ${tech}\n` : "") +
        (loc ? `Location: ${loc}\n` : "") +
        (notes ? `Notes: ${notes}\n` : "");

      try {
        await navigator.clipboard.writeText(clipboardText);
        clockifyBtn.textContent = "Timer Ready ✓";
        clockifyBtn.disabled = true;
        setTimeout(() => {
          clockifyBtn.textContent = "Start Timer";
          clockifyBtn.disabled = false;
        }, 3000);
      } catch (e) {
        window.prompt("Copy this job text for Clockify:", clipboardText);
      }

      window.open("https://clockify.me/tracker", "_blank");
    });

    rawJsonEl.textContent = JSON.stringify(evt, null, 2);
    rawBtn.addEventListener("click", () => {
      detailsEl.open = !detailsEl.open;
    });

    jobsList.appendChild(node);
  });

  applyFilters();
}

function formatTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/******** Filters ********/

function applyFilters() {
  const stFilter = statusFilter.value;
  const q = (searchFilter.value || "").toLowerCase();

  [...jobsList.querySelectorAll(".job-card")].forEach(card => {
    const title = card.querySelector(".job-title")?.textContent.toLowerCase() || "";
    const loc = card.querySelector(".job-location")?.textContent.toLowerCase() || "";
    const notes = card.querySelector(".job-notes")?.textContent.toLowerCase() || "";
    const tech = card.querySelector(".job-tech-input")?.value.toLowerCase() || "";
    const st = card.querySelector(".job-status-pill")?.dataset.status || "";

    let show = true;

    if (stFilter !== "all" && st !== stFilter) show = false;

    if (q) {
      const haystack = `${title} ${loc} ${notes} ${tech}`;
      if (!haystack.includes(q)) show = false;
    }

    card.style.display = show ? "" : "none";
  });
}
