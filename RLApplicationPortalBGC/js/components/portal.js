// portal.js — Applicant dashboard, status tracker, application form, uploads & applicant chat

function renderApplicantPortal() {
  const existing = applications.find(a => a.userEmail === currentUser.email);
  const nameEl = document.getElementById("navProfileName");
  const subEl = document.getElementById("navProfileSub");
  const avatarEl = document.getElementById("navProfileAvatar");
  if (nameEl && currentUser) nameEl.textContent = existing ? existing.name : currentUser.name;
  if (avatarEl && currentUser) {
    if (existing?.photoUrl) {
      avatarEl.innerHTML = `<img src="${escapeHtml(existing.photoUrl)}" alt="${escapeHtml(existing.name)}" class="rounded-circle object-fit-cover" style="width:32px;height:32px;" />`;
      avatarEl.style.background = "transparent";
    } else {
      avatarEl.textContent = getInitials(existing ? existing.name : currentUser.name);
      avatarEl.style.background = "";
    }
  }
  if (subEl) {
    const yearLevel = existing?.schoolYear
      ? existing.schoolYear.replace(/^SY\s+\d{4}-\d{4}\s*\(([^)]+)\)$/, "$1")
      : "No Year Level";
    const statusText = existing ? (STATUS_LABELS[existing.status] || existing.status) : "Not Submitted";
    subEl.textContent = `${yearLevel} | ${statusText}`;
  }

  renderApplicantTracker(existing);
  if (existing) {
    document.getElementById("appName").value = existing.name;
    document.getElementById("appAge").value = existing.age;
    document.getElementById("appSchoolYear").value = existing.schoolYear;
    document.getElementById("appCourse").value = existing.course;
    document.getElementById("appGpa").value = existing.gpa;
    document.getElementById("appIncome").value = existing.income;
    document.getElementById("appContact").value = existing.contact;
    document.getElementById("appArea").value = existing.area;
    document.getElementById("appAddress").value = existing.address;
    document.getElementById("appDriveLink").value = existing.driveLink;

    const isLocked = !["UNPROCESSED", "FOR_VERIFICATION"].includes(existing.status);
    document.getElementById("appLockNotice")?.classList.toggle("d-none", !isLocked);
    document.querySelectorAll("#applicationForm input, #applicationForm select, #applicationForm button[type='submit']").forEach(el => {
      el.disabled = isLocked;
    });
  } else {
    document.getElementById("appName").value = currentUser.name;
  }
}

function renderApplicantTracker(app) {
  const card = document.getElementById("applicantStatusCard");
  if (!card) return;
  if (!app) {
    card.classList.add("d-none");
    return;
  }
  card.classList.remove("d-none");
  document.getElementById("trackerApplicantName").textContent = `${app.name} — ${app.course}`;
  const badge = document.getElementById("trackerStatusBadge");
  badge.className = `status-badge status-${app.status}`;
  badge.textContent = STATUS_LABELS[app.status] || app.status;

  const declinedEl = document.getElementById("declinedAlert");
  if (declinedEl) declinedEl.classList.toggle("d-none", app.status !== "DECLINED");

  const currentIdx = PIPELINE_ORDER.indexOf(app.status);
  document.querySelectorAll("#statusPipeline .pipeline-step").forEach((step, idx) => {
    step.classList.remove("done", "current", "declined");
    if (app.status !== "DECLINED") {
      if (idx < currentIdx) step.classList.add("done");
      else if (idx === currentIdx) step.classList.add("current");
    }
  });

  const logList = document.getElementById("emailLogList");
  logList.innerHTML = (app.emailLogs || [])
    .slice()
    .reverse()
    .map(item => `<li>${escapeHtml(item)}</li>`)
    .join("");
}

const appFormEl = document.getElementById("applicationForm");
if (appFormEl) {
  appFormEl.addEventListener("submit", async e => {
    e.preventDefault();
    if (!currentUser) return;

    const payload = {
      userEmail: currentUser.email,
      name: toNameCase(document.getElementById("appName").value),
      age: Number(document.getElementById("appAge").value),
      schoolYear: document.getElementById("appSchoolYear").value,
      course: document.getElementById("appCourse").value.trim(),
      gpa: Number(document.getElementById("appGpa").value),
      income: document.getElementById("appIncome").value,
      contact: document.getElementById("appContact").value.trim(),
      area: document.getElementById("appArea").value,
      address: document.getElementById("appAddress").value.trim(),
      lat: document.getElementById("appLat")?.value ? Number(document.getElementById("appLat").value) : null,
      lng: document.getElementById("appLng")?.value ? Number(document.getElementById("appLng").value) : null,
      driveLink: document.getElementById("appDriveLink").value.trim()
    };

    if (useBackend) {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        await loadApplications();
        renderApplicantPortal();
        document.getElementById("formFeedback").textContent = "Application saved!";
        showToast("Application saved!");
        return;
      }
      const err = await res.json().catch(() => ({}));
      showToast(err.error || "Could not save application.", "danger");
      return;
    }

    const nowStr = new Date().toISOString().slice(0, 16).replace("T", " ");
    const existing = applications.find(a => a.userEmail === currentUser.email);
    if (existing) {
      Object.assign(existing, payload, { updatedAt: nowStr });
      existing.emailLogs.push(`${nowStr}: Application details updated.`);
    } else {
      applications.unshift({
        id: Date.now(),
        ...payload,
        status: "UNPROCESSED",
        updatedAt: nowStr,
        emailLogs: [`${nowStr}: Application received (UNPROCESSED).`]
      });
    }
    saveLocalApplications();
    renderApplicantPortal();
    document.getElementById("formFeedback").textContent = "Application submitted! Status: UNPROCESSED.";
  });
}

async function loadApplicantFiles(appId) {
  const card = document.getElementById("requirementsCard");
  const tbody = document.getElementById("applicantFilesBody");
  if (!card || !tbody || !appId) return;
  card.classList.remove("d-none");

  const files = groupAndSortFiles(await fetchApplicantFiles(appId));
  currentApplicantFiles = files;
  let lastCat = null;
  tbody.innerHTML = files.map(f => {
    let groupRow = "";
    if (f.category !== lastCat) {
      lastCat = f.category;
      groupRow = `<tr class="table-secondary"><td colspan="6" class="small fw-bold text-uppercase py-1">${escapeHtml(f.category)}</td></tr>`;
    }
    return `${groupRow}
      <tr>
        <td class="small fw-semibold">${escapeHtml(f.category)}</td>
        <td><span class="badge bg-secondary-subtle text-secondary-emphasis">v${escapeHtml(f.version)}</span></td>
        <td>${reviewBadgeHtml(f.reviewStatus || "PENDING")}</td>
        <td class="small text-muted">${escapeHtml(f.reviewRemarks || "—")}</td>
        <td class="small text-muted">${escapeHtml(f.originalName)}</td>
        <td class="small text-muted">${escapeHtml(f.uploadedAt)}</td>
      </tr>
    `;
  }).join("") || `<tr><td colspan="6" class="text-center text-muted py-3">No requirement documents uploaded yet.</td></tr>`;
  updateUploadLockState();
}

const uploadReqEl = document.getElementById("uploadReqForm");
if (uploadReqEl) {
  uploadReqEl.addEventListener("submit", async e => {
    e.preventDefault();
    const existing = applications.find(a => a.userEmail === currentUser?.email);
    if (!existing) return;
    const fb = document.getElementById("reqUploadFeedback");
    const category = document.getElementById("reqCategory").value;
    const fileInput = document.getElementById("reqFileInput");
    const extUrl = document.getElementById("reqExternalUrl").value.trim();

    let filename = extUrl;
    let contentBase64 = null;
    if (!document.getElementById("reqFileGroup").classList.contains("d-none")) {
      const file = fileInput.files[0];
      if (!file) {
        fb.className = "col-12 small fw-semibold text-danger";
        fb.textContent = "Please choose a file first.";
        return;
      }
      filename = file.name;
      contentBase64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }

    if (useBackend) {
      const res = await fetch(`/api/applications/${existing.id}/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, filename, contentBase64, externalUrl: extUrl })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        fb.className = "col-12 small fw-semibold text-danger";
        fb.textContent = err.error || "Upload failed.";
        return;
      }
    } else {
      const all = JSON.parse(localStorage.getItem("rl_portal_files_v1") || "[]");
      const prevMax = all.filter(f => f.applicationId === existing.id && f.category === category).reduce((m, f) => Math.max(m, f.version), 0);
      all.unshift({
        id: Date.now(),
        applicationId: existing.id,
        category,
        version: prevMax + 1,
        provider: "filesystem",
        originalName: filename,
        storedPath: `Images/2026/${existing.status === "DECLINED" ? "Rejected" : "Ongoing"}/${existing.name}/Requirements/${category}/${category}_v${prevMax + 1}`,
        uploadedAt: new Date().toISOString().slice(0, 16).replace("T", " ")
      });
      localStorage.setItem("rl_portal_files_v1", JSON.stringify(all));
    }

    uploadReqEl.reset();
    fb.className = "col-12 small fw-semibold text-success";
    fb.textContent = "Requirement uploaded!";
    showToast("Requirement uploaded!");
    loadApplicantFiles(existing.id);
    if (category === "ProfilePhoto") {
      await loadApplications();
      renderApplicantPortal();
    }
  });
}

async function toggleApplicantChatPopup() {
  const panel = document.getElementById("applicantChatCard");
  const fab = document.getElementById("applicantChatFab");
  const badge = document.getElementById("applicantChatUnreadBadge");
  if (!panel) return;
  const opening = !panel.classList.contains("open");
  panel.classList.toggle("open");
  if (opening) {
    const existing = applications.find(a => a.userEmail === currentUser?.email);
    if (existing) {
      await markChatRead(existing.id, "applicant");
      existing.unreadApplicantCount = 0;
      if (fab) fab.classList.remove("chat-unread-glow");
      if (badge) badge.classList.add("d-none");
      const msgs = await fetchAppMessages(existing.id);
      renderChatThread("applicantChatThread", msgs, "applicant");
    }
  }
}

async function loadApplicantChat(appId) {
  const fab = document.getElementById("applicantChatFab");
  const badge = document.getElementById("applicantChatUnreadBadge");
  if (!fab || !appId) return;
  fab.classList.remove("d-none");
  const existing = applications.find(a => a.id === appId);
  const unread = existing?.unreadApplicantCount || 0;
  if (badge) {
    badge.textContent = String(unread);
    badge.classList.toggle("d-none", unread === 0);
  }
  fab.classList.toggle("chat-unread-glow", unread > 0);
  const msgs = await fetchAppMessages(appId);
  renderChatThread("applicantChatThread", msgs, "applicant");
}

const applicantChatFormEl = document.getElementById("applicantChatForm");
if (applicantChatFormEl) {
  applicantChatFormEl.addEventListener("submit", async e => {
    e.preventDefault();
    const existing = applications.find(a => a.userEmail === currentUser?.email);
    if (!existing) return;
    const input = document.getElementById("applicantChatInput");
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    await sendAppMessage(existing.id, text);
    await loadApplicantChat(existing.id);
    showToast("Message sent to BGC Staff.");
  });
}

function startApplicantSessionTimeout() {
  const TIMEOUT_MS = 15 * 60 * 1000;
  const WARN_MS = 14 * 60 * 1000;
  let warnTimer = null;
  let outTimer = null;
  function resetTimers() {
    clearTimeout(warnTimer);
    clearTimeout(outTimer);
    warnTimer = setTimeout(() => showToast("Session expiring in 1 minute due to inactivity.", "warning"), WARN_MS);
    outTimer = setTimeout(() => {
      localStorage.removeItem(STORAGE_KEYS.SESSION);
      window.location.href = "signin.html";
    }, TIMEOUT_MS);
  }
  ["mousemove", "keydown", "click", "scroll"].forEach(evt => document.addEventListener(evt, resetTimers, { passive: true }));
  resetTimers();
}

