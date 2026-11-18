// settings.js — System settings, SMTP, RBAC accounts, IP security, storage, audit logs & Application Controller

async function loadSmtpSettings() {
  if (!useBackend || !document.getElementById("smtpForm")) return;
  const res = await fetch("/api/admin/smtp");
  if (!res.ok) return;
  const cfg = await res.json();
  document.getElementById("smtpHost").value = cfg.host || "smtp.gmail.com";
  document.getElementById("smtpPort").value = cfg.port || 587;
  document.getElementById("smtpUser").value = cfg.user || "";
  if (document.getElementById("smtpEnabledCheck")) document.getElementById("smtpEnabledCheck").checked = cfg.smtpEnabled !== false;
  if (document.getElementById("notifyStatusCheck")) document.getElementById("notifyStatusCheck").checked = cfg.notifyStatusEmails !== false;
  const badge = document.getElementById("smtpStatusBadge");
  if (cfg.user && cfg.hasPassword) {
    badge.className = "badge bg-success-subtle text-success-emphasis";
    badge.textContent = "Configured";
  } else {
    badge.className = "badge bg-secondary-subtle text-secondary-emphasis";
    badge.textContent = "Not Configured";
  }
}

async function testSmtpEmail() {
  const fb = document.getElementById("smtpFeedback");
  if (!useBackend) {
    fb.className = "small fw-semibold text-danger";
    fb.textContent = "Run python main.py to send real SMTP emails.";
    return;
  }
  fb.className = "small fw-semibold text-muted";
  fb.textContent = "Sending test email...";
  const to = document.getElementById("smtpTestTo").value.trim();
  const res = await fetch("/api/admin/smtp/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to })
  });
  const data = await res.json().catch(() => ({}));
  if (res.ok) {
    fb.className = "small fw-semibold text-success";
    fb.textContent = "Test email sent!";
    showToast("Test email sent!");
  } else {
    fb.className = "small fw-semibold text-danger";
    fb.textContent = data.error || "Failed to send test email.";
    showToast(fb.textContent, "danger");
  }
}

const smtpFormEl = document.getElementById("smtpForm");
if (smtpFormEl) {
  smtpFormEl.addEventListener("submit", async e => {
    e.preventDefault();
    const fb = document.getElementById("smtpFeedback");
    if (!useBackend) {
      fb.className = "small fw-semibold text-danger";
      fb.textContent = "Run python main.py to save SMTP settings.";
      return;
    }
    const res = await fetch("/api/admin/smtp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        host: document.getElementById("smtpHost").value.trim(),
        port: Number(document.getElementById("smtpPort").value),
        user: document.getElementById("smtpUser").value.trim(),
        pass: document.getElementById("smtpPass").value,
        smtpEnabled: document.getElementById("smtpEnabledCheck")?.checked ?? true,
        notifyStatusEmails: document.getElementById("notifyStatusCheck")?.checked ?? true
      })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      document.getElementById("smtpPass").value = "";
      fb.className = "small fw-semibold text-success";
      fb.textContent = "SMTP settings saved!";
      showToast("SMTP settings saved!");
      loadSmtpSettings();
    } else {
      fb.className = "small fw-semibold text-danger";
      fb.textContent = `${data.error || "Failed to save SMTP settings."} (HTTP ${res.status})`;
      showToast(fb.textContent, "danger");
    }
  });
}

async function loadAdminUsers() {
  const tbody = document.getElementById("adminUsersBody");
  if (!tbody) return;

  let users = [];
  if (useBackend) {
    const res = await fetch("/api/admin/users");
    if (res.ok) users = await res.json();
  } else {
    users = JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS) || "[]");
  }

  tbody.innerHTML = users.map(u => `
    <tr>
      <td class="small text-muted">${escapeHtml(u.id)}</td>
      <td class="small fw-semibold">${escapeHtml(u.name)}</td>
      <td class="small">${escapeHtml(u.email)}</td>
      <td><span class="badge ${u.role === "admin" ? "bg-primary-subtle text-primary-emphasis" : "bg-secondary-subtle text-secondary-emphasis"}">${escapeHtml(u.role)}</span></td>
      <td class="text-end">
        <button class="btn btn-outline-danger btn-sm py-0 px-2" onclick="deleteAdminUser(${u.id})">Delete</button>
      </td>
    </tr>
  `).join("") || `<tr><td colspan="5" class="text-center text-muted py-3">No users found.</td></tr>`;
}

async function deleteAdminUser(userId) {
  const fb = document.getElementById("accFeedback");
  if (useBackend) {
    const res = await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      fb.className = "col-12 small fw-semibold text-danger";
      fb.textContent = data.error || "Could not delete user.";
      fb.classList.remove("d-none");
      return;
    }
  } else {
    let users = JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS) || "[]");
    const target = users.find(u => u.id === userId);
    if (target && target.role === "admin" && users.filter(u => u.role === "admin").length <= 1) {
      fb.className = "col-12 small fw-semibold text-danger";
      fb.textContent = "Cannot delete the last admin account.";
      fb.classList.remove("d-none");
      return;
    }
    users = users.filter(u => u.id !== userId);
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
  }
  fb.className = "col-12 small fw-semibold text-success";
  fb.textContent = "Account deleted.";
  fb.classList.remove("d-none");
  showToast("Account deleted.");
  loadAdminUsers();
}

const createAccountEl = document.getElementById("createAccountForm");
if (createAccountEl) {
  createAccountEl.addEventListener("submit", async e => {
    e.preventDefault();
    const fb = document.getElementById("accFeedback");
    const payload = {
      name: document.getElementById("newAccName").value.trim(),
      email: document.getElementById("newAccEmail").value.trim().toLowerCase(),
      password: document.getElementById("newAccPass").value,
      role: document.getElementById("newAccRole").value
    };

    if (useBackend) {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        fb.className = "col-12 small fw-semibold text-danger";
        fb.textContent = data.error || "Could not create account.";
        fb.classList.remove("d-none");
        return;
      }
    } else {
      const users = JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS) || "[]");
      if (users.some(u => u.email.toLowerCase() === payload.email)) {
        fb.className = "col-12 small fw-semibold text-danger";
        fb.textContent = "An account with this email already exists.";
        fb.classList.remove("d-none");
        return;
      }
      users.push({ id: Date.now(), ...payload });
      localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
    }

    createAccountEl.reset();
    fb.className = "col-12 small fw-semibold text-success";
    fb.textContent = "Account created!";
    fb.classList.remove("d-none");
    showToast("Account created!");
    loadAdminUsers();
  });
}

async function loadAdminIps() {
  const tbody = document.getElementById("adminIpsBody");
  if (!tbody) return;

  let ips = [];
  if (useBackend) {
    const res = await fetch("/api/admin/ips");
    if (res.ok) ips = await res.json();
  } else {
    ips = JSON.parse(localStorage.getItem("rl_portal_ips_v1") || JSON.stringify([
      { ip: "127.0.0.1", last_seen: "Demo Local", hit_count: 1, last_path: "/staff.html", blocked: 0 }
    ]));
  }

  tbody.innerHTML = ips.map(row => `
    <tr>
      <td class="small fw-semibold font-monospace">${escapeHtml(row.ip)}</td>
      <td class="small text-muted font-monospace">${escapeHtml(row.mac_address || "Unknown")}</td>
      <td class="small text-muted">${escapeHtml(row.last_seen)}</td>
      <td class="small">${escapeHtml(row.hit_count)}</td>
      <td class="small text-muted font-monospace">${escapeHtml(row.last_path)}</td>
      <td><span class="badge ${row.blocked ? "bg-danger-subtle text-danger-emphasis" : "bg-success-subtle text-success-emphasis"}">${row.blocked ? "Blocked" : "Active"}</span></td>
      <td class="text-end">
        <button class="btn ${row.blocked ? "btn-outline-success" : "btn-outline-danger"} btn-sm py-0 px-2" onclick="toggleIpBlock('${escapeHtml(row.ip)}', ${row.blocked ? "false" : "true"})">
          ${row.blocked ? "Unblock" : "Block"}
        </button>
      </td>
    </tr>
  `).join("") || `<tr><td colspan="7" class="text-center text-muted py-3">No IP traffic recorded yet.</td></tr>`;
}

async function toggleIpBlock(ip, blocked) {
  if (useBackend) {
    await fetch("/api/admin/ips/block", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ip, blocked })
    });
  } else {
    const ips = JSON.parse(localStorage.getItem("rl_portal_ips_v1") || JSON.stringify([
      { ip: "127.0.0.1", last_seen: "Demo Local", hit_count: 1, last_path: "/staff.html", blocked: 0 }
    ]));
    const existing = ips.find(x => x.ip === ip);
    if (existing) existing.blocked = blocked ? 1 : 0;
    else ips.unshift({ ip, last_seen: "Manual", hit_count: 0, last_path: "manual", blocked: blocked ? 1 : 0 });
    localStorage.setItem("rl_portal_ips_v1", JSON.stringify(ips));
  }
  loadAdminIps();
  showToast(blocked ? `IP ${ip} blocked.` : `IP ${ip} unblocked.`, blocked ? "warning" : "success");
}

const blockIpFormEl = document.getElementById("blockIpForm");
if (blockIpFormEl) {
  blockIpFormEl.addEventListener("submit", async e => {
    e.preventDefault();
    const ip = document.getElementById("manualBlockIp").value.trim();
    if (!ip) return;
    await toggleIpBlock(ip, true);
    document.getElementById("manualBlockIp").value = "";
  });
}

function openSystemTab(tabId) {
  const trigger = document.querySelector(`[data-bs-target="#${tabId}"]`);
  if (trigger && typeof bootstrap !== "undefined") {
    new bootstrap.Tab(trigger).show();
  }
  const section = document.getElementById("systemSettingsSection");
  if (section) section.scrollIntoView({ behavior: "smooth" });
}

const storageFormEl = document.getElementById("storageForm");
if (storageFormEl) {
  storageFormEl.addEventListener("submit", async e => {
    e.preventDefault();
    const fb = document.getElementById("storageFeedback");
    const payload = {
      provider: document.getElementById("storageProvider").value,
      baseDir: document.getElementById("storageBaseDir").value.trim() || "Images",
      gdriveRoot: document.getElementById("storageGdriveRoot").value.trim(),
      nextcloudUrl: document.getElementById("storageNextcloudUrl").value.trim(),
      nextcloudUser: document.getElementById("storageNextcloudUser").value.trim()
    };
    if (useBackend) {
      const res = await fetch("/api/admin/storage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      fb.className = res.ok ? "small fw-semibold text-success" : "small fw-semibold text-danger";
      fb.textContent = res.ok ? "Storage controller saved!" : "Failed to save storage settings.";
      showToast(fb.textContent, res.ok ? "success" : "danger");
    } else {
      localStorage.setItem("rl_portal_storage_v1", JSON.stringify(payload));
      fb.className = "small fw-semibold text-success";
      fb.textContent = "Storage controller saved (local demo)!";
    }
  });
}

function auditActionBadgeClass(action) {
  const a = String(action || "").toUpperCase();
  if (a.startsWith("DELETE_") || a === "BLOCK_IP" || a === "LOGIN_FAILED") {
    return "bg-danger-subtle text-danger-emphasis";
  }
  if (a.startsWith("CREATE_") || a.startsWith("ADD_") || a.startsWith("REGISTER_") || a === "UPLOAD_FILE" || a === "UNBLOCK_IP" || a.startsWith("LOGIN_")) {
    return "bg-success-subtle text-success-emphasis";
  }
  if (a.startsWith("UPDATE_STATUS") || a === "ASSIGN_VISITATION_STAFF" || a === "ADMIN_EDIT_APPLICANT" || a === "SAVE_APPLICATION" || a === "SEND_MESSAGE" || a === "EXPORT_CSV") {
    return "bg-primary-subtle text-primary-emphasis";
  }
  return "bg-warning-subtle text-warning-emphasis";
}

async function loadAuditLogs() {
  const tbody = document.getElementById("adminAuditBody");
  if (!tbody) return;
  let logs = [];
  if (useBackend) {
    const res = await fetch("/api/admin/audit");
    if (res.ok) logs = await res.json();
  }
  tbody.innerHTML = logs.map(l => `
    <tr>
      <td class="small text-muted">${escapeHtml(l.created_at)}</td>
      <td class="small fw-semibold">${escapeHtml(l.actor)}</td>
      <td><span class="badge ${auditActionBadgeClass(l.action)}">${escapeHtml(l.action)}</span></td>
      <td class="small font-monospace">${escapeHtml(l.target)}</td>
      <td class="small text-muted">${escapeHtml(l.details)}</td>
    </tr>
  `).join("") || `<tr><td colspan="5" class="text-center text-muted py-3">No audit entries recorded yet.</td></tr>`;
}

let currentRegOpen = true;

let currentReqTypes = [];
let currentFlagRules = { gpaThreshold: 85, incomeBracket: "Above PHP 30,000", enableRisk: true };

let draggedReqIdx = null;

function renderReqDictTable() {
  const tbody = document.getElementById("reqDictBody");
  if (!tbody) return;
  tbody.innerHTML = currentReqTypes.map((t, idx) => `
    <tr draggable="true" data-idx="${idx}" style="cursor: grab;"
        ondragstart="draggedReqIdx=${idx}"
        ondragover="event.preventDefault()"
        ondrop="dropReqType(${idx})">
      <td class="text-muted text-center" title="Drag to reorder">&#8942;&#8942;</td>
      <td class="small fw-semibold font-monospace">${escapeHtml(t.code)}</td>
      <td class="small">${escapeHtml(t.label)}</td>
      <td>
        <div class="form-check">
          <input class="form-check-input" type="checkbox" ${t.required ? "checked" : ""} onchange="toggleReqTypeRequired(${idx}, this.checked)" />
          <label class="form-check-label small">${t.required ? "Required" : "Optional"}</label>
        </div>
      </td>
      <td class="text-end"><button type="button" class="btn btn-outline-danger btn-sm py-0 px-2" onclick="deleteReqType(${idx})">Remove</button></td>
    </tr>
  `).join("");
}

async function dropReqType(targetIdx) {
  if (draggedReqIdx === null || draggedReqIdx === targetIdx) return;
  const [moved] = currentReqTypes.splice(draggedReqIdx, 1);
  currentReqTypes.splice(targetIdx, 0, moved);
  draggedReqIdx = null;
  await saveControllerPayload({
    registrationOpen: currentRegOpen,
    deadline: document.getElementById("appDeadlineInput")?.value || "",
    requirementTypes: currentReqTypes
  });
  showToast("Requirement order updated!");
  renderReqDictTable();
}

async function toggleReqTypeRequired(idx, required) {
  if (!currentReqTypes[idx]) return;
  currentReqTypes[idx].required = required;
  await saveControllerPayload({
    registrationOpen: currentRegOpen,
    deadline: document.getElementById("appDeadlineInput")?.value || "",
    requirementTypes: currentReqTypes
  });
  showToast(`${currentReqTypes[idx].label}: ${required ? "Required for risk check" : "Optional"}`);
  renderReqDictTable();
}

async function saveControllerPayload(payload) {
  if (useBackend) {
    const res = await fetch("/api/admin/application-controller", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to save controller settings.");
    }
  }
  if (payload && typeof payload.clientName === "string") {
    const cname = payload.clientName.trim() || "BGC";
    siteContent.clientName = cname;
    const raw = localStorage.getItem("rl_portal_content_v1");
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        parsed.clientName = cname;
        localStorage.setItem("rl_portal_content_v1", JSON.stringify(parsed));
      } catch (_) {}
    } else {
      localStorage.setItem("rl_portal_content_v1", JSON.stringify({ ...siteContent, clientName: cname }));
    }
    applyClientName(cname);
  }
}

async function deleteReqType(idx) {
  currentReqTypes.splice(idx, 1);
  await saveControllerPayload({
    registrationOpen: currentRegOpen,
    deadline: document.getElementById("appDeadlineInput")?.value || "",
    requirementTypes: currentReqTypes
  });
  showToast("Requirement type removed.");
  renderReqDictTable();
}

const reqDictFormEl = document.getElementById("reqDictForm");
if (reqDictFormEl) {
  reqDictFormEl.addEventListener("submit", async e => {
    e.preventDefault();
    const code = document.getElementById("reqDictCode").value.trim().replace(/\s+/g, "_");
    const label = document.getElementById("reqDictLabel").value.trim();
    const required = document.getElementById("reqDictRequired").checked;
    if (!code || !label) return;
    currentReqTypes.push({ code, label, required });
    await saveControllerPayload({
      registrationOpen: currentRegOpen,
      deadline: document.getElementById("appDeadlineInput")?.value || "",
      requirementTypes: currentReqTypes
    });
    reqDictFormEl.reset();
    showToast("Requirement type added!");
    renderReqDictTable();
  });
}

const flagRulesFormEl = document.getElementById("flagRulesForm");
if (flagRulesFormEl) {
  flagRulesFormEl.addEventListener("submit", async e => {
    e.preventDefault();
    currentFlagRules = {
      gpaThreshold: Number(document.getElementById("flagGpaThreshold").value || 85),
      incomeBracket: document.getElementById("flagIncomeBracket").value,
      enableRisk: document.getElementById("flagEnableRisk").checked
    };
    await saveControllerPayload({
      registrationOpen: currentRegOpen,
      deadline: document.getElementById("appDeadlineInput")?.value || "",
      flagRules: currentFlagRules
    });
    showToast("Flag filter rules saved!");
  });
}

async function loadApplicationController() {
  if (!document.getElementById("tabAppCtrl")) return;
  let info = {
    registrationOpen: true,
    activeCount: 0,
    archivedCount: 0,
    archivedCycles: [],
    flagRules: currentFlagRules,
    requirementTypes: [],
    clientName: siteContent.clientName || "BGC"
  };
  if (useBackend) {
    const res = await fetch("/api/admin/application-controller");
    if (res.ok) info = await res.json();
  }
  currentRegOpen = info.registrationOpen !== false;
  currentFlagRules = info.flagRules || currentFlagRules;
  currentReqTypes = info.requirementTypes || [];
  renderReqDictTable();
  if (document.getElementById("flagGpaThreshold")) document.getElementById("flagGpaThreshold").value = currentFlagRules.gpaThreshold ?? 85;
  if (document.getElementById("flagIncomeBracket")) document.getElementById("flagIncomeBracket").value = currentFlagRules.incomeBracket ?? "Above PHP 30,000";
  if (document.getElementById("flagEnableRisk")) document.getElementById("flagEnableRisk").checked = currentFlagRules.enableRisk !== false;
  const badge = document.getElementById("regSeasonBadge");
  const btn = document.getElementById("toggleRegSeasonBtn");
  const stats = document.getElementById("cycleStatsText");
  if (badge) {
    badge.className = currentRegOpen ? "badge bg-success-subtle text-success-emphasis" : "badge bg-danger-subtle text-danger-emphasis";
    badge.textContent = currentRegOpen ? "Open" : "Closed";
  }
  if (btn) {
    btn.textContent = currentRegOpen ? "Close Registration" : "Open Registration";
  }
  if (stats) {
    const cycles = info.archivedCycles?.length ? ` (${info.archivedCycles.join(", ")})` : "";
    stats.textContent = `Active applications: ${info.activeCount} | Archived applications: ${info.archivedCount}${cycles}`;
  }
  const dlInput = document.getElementById("appDeadlineInput");
  if (dlInput && info.deadline) dlInput.value = info.deadline;
  const cnInput = document.getElementById("appClientNameInput");
  if (cnInput) cnInput.value = info.clientName || "BGC";
}

async function saveClientName() {
  const clientName = document.getElementById("appClientNameInput")?.value.trim() || "BGC";
  try {
    await saveControllerPayload({
      registrationOpen: currentRegOpen,
      deadline: document.getElementById("appDeadlineInput")?.value || "",
      clientName
    });
    applyClientName(clientName);
    showToast(`Center / Client name updated to "${clientName}"!`);
    await loadApplicationController();
  } catch (err) {
    showToast(err.message || "Failed to update client name.", "danger");
  }
}

async function saveApplicationDeadline() {
  const deadline = document.getElementById("appDeadlineInput")?.value || "";
  if (useBackend) {
    await fetch("/api/admin/application-controller", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ registrationOpen: currentRegOpen, deadline })
    });
  }
  showToast(deadline ? `Application deadline set to ${deadline}` : "Application deadline cleared.");
  await loadApplicationController();
}

async function toggleRegistrationSeason() {
  const nextVal = !currentRegOpen;
  if (useBackend) {
    await fetch("/api/admin/application-controller", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ registrationOpen: nextVal })
    });
  } else {
    siteContent.registrationOpen = nextVal;
    localStorage.setItem("rl_portal_content_v1", JSON.stringify(siteContent));
  }
  showToast(nextVal ? "Registration season opened!" : "Registration season closed.", nextVal ? "success" : "warning");
  await loadApplicationController();
}

async function archiveSchoolYear() {
  const cycleName = document.getElementById("archiveCycleName")?.value.trim() || "Archived Cycle";
  if (!confirm(`Archive all active applications under "${cycleName}" and reset the dashboard for a new school year? Admin accounts, SMTP, Storage, and Home Content will be preserved.`)) {
    return;
  }
  if (useBackend) {
    const res = await fetch("/api/admin/archive-cycle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cycleName })
    });
    const data = await res.json().catch(() => ({}));
    showToast(`Archived ${data.archived ?? 0} applications under ${cycleName}.`);
  }
  await loadApplicationController();
  loadAuditLogs();
}

async function deleteArchivedSchoolYear() {
  if (!confirm("PERMANENTLY DELETE all archived school year applications, files, and applicant accounts? Admin accounts, SMTP, Storage, and Home Content will remain untouched.")) {
    return;
  }
  if (useBackend) {
    const res = await fetch("/api/admin/delete-cycle", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const data = await res.json().catch(() => ({}));
    showToast(`Deleted ${data.deleted ?? 0} archived applications.`, "warning");
  }
  await loadApplicationController();
  loadAuditLogs();
}

