// staff.js — Staff/Admin review dashboard, visitation map, CSV exports, file & staff assignment modals

function renderAdminDashboard() {
  const kpiRow = document.getElementById("kpiRow");
  if (!kpiRow) return;

  const nameEl = document.getElementById("navProfileName");
  const subEl = document.getElementById("navProfileSub");
  const avatarEl = document.getElementById("navProfileAvatar");
  const roleLabels = { admin: "Super Admin", approver: "Approver", system_admin: "System Admin", comms_admin: "Comms Admin" };
  if (nameEl && currentUser) nameEl.textContent = currentUser.name;
  if (avatarEl && currentUser) avatarEl.textContent = getInitials(currentUser.name);
  if (subEl && currentUser) subEl.textContent = roleLabels[currentUser.role] || currentUser.role;

  const settingsBtn = document.getElementById("staffSettingsBtn");
  if (settingsBtn && currentUser?.role === "approver") {
    settingsBtn.classList.add("d-none");
  }

  const counts = {
    total: applications.length,
    needsAction: 0,
    atRisk: 0,
    flagged: 0,
    shortlistedOrVisit: 0,
    approved: 0
  };
  applications.forEach(a => {
    if (a.status === "UNPROCESSED" || a.status === "FOR_VERIFICATION") counts.needsAction++;
    if (a.atRisk) counts.atRisk++;
    if (a.incomeFlag || a.gpaFlag) counts.flagged++;
    if (a.status === "SHORTLISTED" || a.status === "FOR_HOUSE_VISITATION") counts.shortlistedOrVisit++;
    if (a.status === "APPROVED") counts.approved++;
  });

  kpiRow.innerHTML = [
    ["Total Applicants", counts.total, "text-dark"],
    ["Needs Review", counts.needsAction, "text-warning-emphasis"],
    ["At Risk (Docs)", counts.atRisk, "text-danger"],
    ["Income / GPA Flag", counts.flagged, "text-primary"],
    ["Interview / Visit", counts.shortlistedOrVisit, "text-info-emphasis"],
    ["Approved", counts.approved, "text-success"]
  ].map(([label, val, cls]) => `
    <div class="col-6 col-md-4 col-lg-2">
      <div class="card border-0 shadow-sm p-3 text-center h-100">
        <div class="fs-4 fw-bold ${cls}">${val}</div>
        <div class="small text-muted">${label}</div>
      </div>
    </div>
  `).join("");

  const query = (document.getElementById("adminSearch").value || "").toLowerCase();
  const statusFilter = document.getElementById("adminStatusFilter").value;
  const flagFilter = document.getElementById("adminFlagFilter")?.value || "ALL";
  const myVisitationsOnly = document.getElementById("myVisitationsOnly")?.checked || false;
  const filtered = applications.filter(a => {
    const matchesStatus = statusFilter === "ALL" || a.status === statusFilter;
    const matchesQuery = !query || [a.name, a.course, a.address, a.area].some(v => (v || "").toLowerCase().includes(query));
    const matchesFlag =
      flagFilter === "ALL" ||
      (flagFilter === "AT_RISK" && a.atRisk) ||
      (flagFilter === "INCOME_FLAG" && a.incomeFlag) ||
      (flagFilter === "GPA_FLAG" && a.gpaFlag) ||
      (flagFilter === "RESUBMIT" && a.hasResubmit);
    const assigned = a.assignedStaff || [];
    const matchesAssigned = !myVisitationsOnly || assigned.includes(currentUser?.name) || assigned.includes(currentUser?.email);
    return matchesStatus && matchesQuery && matchesFlag && matchesAssigned;
  });

  const statusOrder = [...PIPELINE_ORDER, "DECLINED"];
  filtered.sort((a, b) => {
    const sa = statusOrder.indexOf(a.status);
    const sb = statusOrder.indexOf(b.status);
    if (sa !== sb) return sa - sb;
    return getSurname(a.name).localeCompare(getSurname(b.name));
  });

  const tbody = document.getElementById("adminTableBody");
  let lastStatusGroup = null;
  tbody.innerHTML = filtered.map(a => {
    const displayName = toNameCase(a.name);
    let groupRow = "";
    if (a.status !== lastStatusGroup) {
      lastStatusGroup = a.status;
      groupRow = `<tr class="table-secondary"><td colspan="7" class="small fw-bold text-uppercase py-1">${escapeHtml(STATUS_LABELS[a.status] || a.status)}</td></tr>`;
    }
    const gmapsUrl = (a.lat && a.lng)
      ? `https://www.google.com/maps/search/?api=1&query=${a.lat},${a.lng}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a.address)}`;
    const statusControl = `
      <select class="form-select form-select-sm" onchange="updateStatus(${a.id}, this.value)">
        ${Object.entries(STATUS_LABELS).map(([k, lbl]) => `<option value="${k}" ${a.status === k ? "selected" : ""}>${lbl}</option>`).join("")}
      </select>`;

    const avatarHtml = a.photoUrl
      ? `<img src="${escapeHtml(a.photoUrl)}" alt="${escapeHtml(displayName)}" class="rounded-circle object-fit-cover flex-shrink-0" style="width:36px;height:36px;border:1px solid var(--rl-border);" />`
      : `<div class="nav-profile-avatar" style="width:36px;height:36px;font-size:0.78rem;">${escapeHtml(getInitials(displayName))}</div>`;

    const docTotal = a.requiredDocTotal ?? 3;
    const flagsHtml = [
      `<span class="badge ${(a.docCount ?? 0) >= docTotal ? "bg-success-subtle text-success-emphasis" : "bg-secondary-subtle text-secondary-emphasis"}">Docs ${a.docCount ?? 0}/${docTotal}</span>`,
      a.atRisk ? `<span class="badge bg-danger-subtle text-danger-emphasis">At Risk</span>` : "",
      a.hasResubmit ? `<span class="badge bg-warning-subtle text-warning-emphasis">Resubmit</span>` : "",
      a.incomeFlag ? `<span class="badge bg-info-subtle text-info-emphasis">Income Flag</span>` : "",
      a.gpaFlag ? `<span class="badge bg-warning-subtle text-warning-emphasis">GPA Flag</span>` : ""
    ].filter(Boolean).join(" ");

    const unreadCnt = a.unreadAdminCount || 0;
    const chatBtnCls = unreadCnt > 0 ? "btn btn-warning btn-sm chat-unread-glow" : "btn btn-outline-secondary btn-sm";
    const chatBadge = unreadCnt > 0 ? ` <span class="badge bg-danger ms-1">${unreadCnt}</span>` : "";

    return `${groupRow}
      <tr>
        <td>
          <div class="d-flex align-items-center gap-2">
            ${avatarHtml}
            <div>
              <button type="button" class="btn btn-link p-0 fw-semibold text-decoration-none text-start" onclick="openEditApplicantModal(${a.id})" title="Click to edit applicant profile">${escapeHtml(displayName)}</button>
              <div class="small text-muted">${escapeHtml(a.contact)} &middot; ${escapeHtml(a.area)}</div>
            </div>
          </div>
        </td>
        <td>
          <div class="small fw-semibold">${escapeHtml(a.course)}</div>
          <div class="small text-muted">${escapeHtml(a.schoolYear)}</div>
        </td>
        <td>
          <div class="small fw-semibold">${escapeHtml(a.gpa)}% GPA</div>
          <div class="small text-muted">${escapeHtml(a.income)}</div>
        </td>
        <td>
          <div class="d-flex flex-wrap gap-1">${flagsHtml}</div>
        </td>
        <td>
          <div class="d-flex gap-1 flex-wrap">
            <button type="button" class="btn btn-outline-rl btn-sm" onclick="openApplicantFilesModal(${a.id}, '${escapeHtml(displayName)}')">Files</button>
            <button type="button" class="${chatBtnCls}" onclick="openApplicantChatModal(${a.id}, '${escapeHtml(displayName)}')">Chat${chatBadge}</button>
            <button type="button" class="btn btn-outline-dark btn-sm" onclick="generateApplicantPdfReport(${a.id})">PDF</button>
            ${a.driveLink ? `<a href="${escapeHtml(a.driveLink)}" target="_blank" rel="noopener noreferrer" class="btn btn-outline-secondary btn-sm">Drive</a>` : ""}
          </div>
        </td>
        <td style="min-width: 190px;">${statusControl}</td>
        <td>
          <div class="d-flex flex-column gap-1">
            <div class="d-flex gap-1 flex-wrap">
              <a href="${gmapsUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-outline-rl btn-sm">Google Maps</a>
              <button type="button" class="btn btn-outline-secondary btn-sm" onclick="openAssignStaffModal(${a.id}, '${escapeHtml(displayName)}')">Assign</button>
            </div>
            ${(a.assignedStaff || []).length ? `<div class="small text-muted">Visitors: ${escapeHtml(a.assignedStaff.join(", "))}</div>` : ""}
          </div>
        </td>
      </tr>
    `;
  }).join("") || `<tr><td colspan="7" class="text-center text-muted py-4">No matching applications found.</td></tr>`;

  window._lastFilteredApps = filtered;
  renderVisitationMap();
}

function safeCsvCell(v) {
  const s = String(v ?? "");
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

function exportFilteredReportCSV() {
  const rowsData = window._lastFilteredApps || applications;
  const headers = ["ID", "Name", "Email", "School Year", "Course", "GPA", "Income", "Docs (x/3)", "At Risk", "Income Flag", "GPA Flag", "Status", "Address"];
  const rows = rowsData.map(a => [
    a.id, a.name, a.userEmail, a.schoolYear, a.course, a.gpa, a.income,
    `${a.docCount ?? 0}/3`, a.atRisk ? "YES" : "NO", a.incomeFlag ? "YES" : "NO", a.gpaFlag ? "YES" : "NO",
    STATUS_LABELS[a.status] || a.status, a.address
  ]);
  const csvContent = "\uFEFF" + [headers, ...rows]
    .map(r => r.map(v => `"${safeCsvCell(v).replace(/"/g, '""')}"`).join(","))
    .join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "RealLIFE_BGC_Applicant_Report.csv";
  link.click();
  URL.revokeObjectURL(url);
  showToast("Filtered applicant report exported!");
}

function renderVisitationMap() {
  if (typeof L === "undefined" || !document.getElementById("visitationMap")) return;
  if (!visitationMap) {
    visitationMap = L.map("visitationMap").setView([14.5495, 121.055], 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors"
    }).addTo(visitationMap);
  }

  mapMarkers.forEach(m => m.remove());
  mapMarkers = [];

  const toPin = applications.filter(a => a.status === "SHORTLISTED" || a.status === "FOR_HOUSE_VISITATION");
  document.getElementById("mapCountBadge").textContent = `${toPin.length} pinned`;

  toPin.forEach((a, i) => {
    const base = AREA_COORDS[a.area] || [14.5508, 121.0494];
    const lat = (a.lat && a.lng) ? Number(a.lat) : base[0] + ((i % 3) - 1) * 0.0022;
    const lng = (a.lat && a.lng) ? Number(a.lng) : base[1] + ((i % 2) - 0.5) * 0.0022;
    const gmapsUrl = (a.lat && a.lng)
      ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a.address)}`;
    const marker = L.marker([lat, lng]).addTo(visitationMap);
    const assignedLine = (a.assignedStaff || []).length ? `<br/><span style="font-size:12px;">Assigned: ${escapeHtml(a.assignedStaff.join(", "))}</span>` : "";
    marker.bindPopup(`
      <strong>${escapeHtml(a.name)}</strong><br/>
      <span style="font-size:12px;">${escapeHtml(STATUS_LABELS[a.status])}</span><br/>
      <span style="font-size:12px;">${escapeHtml(a.address)}</span>${assignedLine}<br/>
      <a href="${gmapsUrl}" target="_blank" rel="noopener noreferrer">Open in Google Maps</a>
    `);
    mapMarkers.push(marker);
  });
}

async function updateStatus(appId, newStatus) {
  const nowStr = new Date().toISOString().slice(0, 16).replace("T", " ");
  let note = `${nowStr}: Status updated to ${STATUS_LABELS[newStatus]}.`;
  if (newStatus === "SHORTLISTED") {
    note = `${nowStr}: Verification passed! Official Real LIFE application form sent via email (SHORTLISTED).`;
  }

  if (useBackend) {
    const res = await fetch(`/api/applications/${appId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus, note })
    });
    if (res.ok) {
      await loadApplications();
      renderAdminDashboard();
      showToast(`Status updated to ${STATUS_LABELS[newStatus] || newStatus}`);
      return;
    }
  }

  const target = applications.find(a => a.id === appId);
  if (target) {
    target.status = newStatus;
    target.updatedAt = nowStr;
    target.emailLogs = target.emailLogs || [];
    target.emailLogs.push(note);
    saveLocalApplications();
    renderAdminDashboard();
    showToast(`Status updated to ${STATUS_LABELS[newStatus] || newStatus}`);
  }
}

function exportApplicationsCSV() {
  if (useBackend) {
    window.location.href = "/api/export.csv";
    return;
  }
  const headers = ["ID", "Name", "Email", "Age", "School Year", "Course/Strand", "3-Yr GPA", "Household Income", "Contact", "Area", "Address", "Drive Link", "Status", "Updated At"];
  const rows = applications.map(a => [
    a.id, a.name, a.userEmail, a.age, a.schoolYear, a.course, a.gpa, a.income, a.contact, a.area, a.address, a.driveLink, STATUS_LABELS[a.status] || a.status, a.updatedAt
  ]);
  const csvContent = "\uFEFF" + [headers, ...rows]
    .map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\r\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "RealLIFE_BGC_Applications.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function openEditApplicantModal(appId) {
  const a = applications.find(x => x.id === appId);
  if (!a) return;
  document.getElementById("editAppId").value = a.id;
  document.getElementById("editAppName").value = a.name;
  document.getElementById("editAppAge").value = a.age;
  document.getElementById("editAppGpa").value = a.gpa;
  document.getElementById("editAppSchoolYear").value = a.schoolYear;
  document.getElementById("editAppCourse").value = a.course;
  document.getElementById("editAppIncome").value = a.income;
  document.getElementById("editAppContact").value = a.contact;
  document.getElementById("editAppArea").value = a.area;
  document.getElementById("editAppAddress").value = a.address;
  document.getElementById("editAppDriveLink").value = a.driveLink || "";
  document.getElementById("editAppLat").value = a.lat ?? "";
  document.getElementById("editAppLng").value = a.lng ?? "";
  document.getElementById("editAppFeedback").textContent = "";
  const modalEl = document.getElementById("editApplicantModal");
  new bootstrap.Modal(modalEl).show();
  setTimeout(() => initAdminPinMap(a.lat, a.lng), 250);
}

const editAppFormEl = document.getElementById("editApplicantForm");
if (editAppFormEl) {
  editAppFormEl.addEventListener("submit", async e => {
    e.preventDefault();
    const appId = Number(document.getElementById("editAppId").value);
    const fb = document.getElementById("editAppFeedback");
    const payload = {
      name: document.getElementById("editAppName").value.trim(),
      age: Number(document.getElementById("editAppAge").value),
      gpa: Number(document.getElementById("editAppGpa").value),
      schoolYear: document.getElementById("editAppSchoolYear").value.trim(),
      course: document.getElementById("editAppCourse").value.trim(),
      income: document.getElementById("editAppIncome").value.trim(),
      contact: document.getElementById("editAppContact").value.trim(),
      area: document.getElementById("editAppArea").value.trim(),
      address: document.getElementById("editAppAddress").value.trim(),
      lat: document.getElementById("editAppLat")?.value ? Number(document.getElementById("editAppLat").value) : null,
      lng: document.getElementById("editAppLng")?.value ? Number(document.getElementById("editAppLng").value) : null,
      driveLink: document.getElementById("editAppDriveLink").value.trim()
    };

    if (useBackend) {
      const res = await fetch(`/api/applications/${appId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        fb.className = "col-12 small fw-semibold text-danger";
        fb.textContent = "Failed to save profile changes.";
        return;
      }
      await loadApplications();
    } else {
      const target = applications.find(x => x.id === appId);
      if (target) Object.assign(target, payload);
      saveLocalApplications();
    }
    bootstrap.Modal.getInstance(document.getElementById("editApplicantModal"))?.hide();
    renderAdminDashboard();
    showToast("Applicant profile updated!");
  });
}

let pendingRejectFileId = null;

function openRejectFileModal(fileId, label) {
  pendingRejectFileId = fileId;
  document.getElementById("rejectFileModalTitle").textContent = `Reject ${label}`;
  document.getElementById("rejectFileRemarksInput").value = "";
  new bootstrap.Modal(document.getElementById("rejectFileModal")).show();
}

const rejectFileFormEl = document.getElementById("rejectFileForm");
if (rejectFileFormEl) {
  rejectFileFormEl.addEventListener("submit", async e => {
    e.preventDefault();
    const remarks = document.getElementById("rejectFileRemarksInput").value.trim();
    if (!remarks || !pendingRejectFileId) return;
    bootstrap.Modal.getInstance(document.getElementById("rejectFileModal"))?.hide();
    await reviewApplicantFile(pendingRejectFileId, "RESUBMIT", remarks);
    pendingRejectFileId = null;
  });
}

async function reviewApplicantFile(fileId, status, remarks = "") {
  const fb = document.getElementById("fileReviewFeedback");

  if (status === "RESUBMIT" && !remarks) {
    fb.className = "small fw-semibold mb-2 text-danger";
    fb.textContent = "Please enter remarks explaining why the applicant needs to resubmit.";
    fb.classList.remove("d-none");
    return;
  }

  if (useBackend) {
    const res = await fetch(`/api/files/${fileId}/review`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, remarks })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      fb.className = "small fw-semibold mb-2 text-danger";
      fb.textContent = data.error || "Could not update file review.";
      fb.classList.remove("d-none");
      return;
    }
  } else {
    const all = JSON.parse(localStorage.getItem("rl_portal_files_v1") || "[]");
    const target = all.find(f => f.id === fileId);
    if (target) {
      target.reviewStatus = status;
      target.reviewRemarks = remarks;
      localStorage.setItem("rl_portal_files_v1", JSON.stringify(all));
    }
  }

  fb.className = "small fw-semibold mb-2 text-success";
  fb.textContent = status === "VERIFIED" ? "Document verified & locked!" : "Marked for resubmission with remarks.";
  fb.classList.remove("d-none");
  showToast(fb.textContent, status === "VERIFIED" ? "success" : "warning");
  await renderModalFiles();
}

async function renderModalFiles() {
  const tbody = document.getElementById("modalFilesBody");
  const files = groupAndSortFiles(await fetchApplicantFiles(activeModalAppId));
  let lastCat = null;
  tbody.innerHTML = files.map(f => {
    let groupRow = "";
    if (f.category !== lastCat) {
      lastCat = f.category;
      groupRow = `<tr class="table-secondary"><td colspan="5" class="small fw-bold text-uppercase py-1">${escapeHtml(f.category)}</td></tr>`;
    }
    const openLink = f.provider === "filesystem" && useBackend
      ? `<a href="/api/files/${f.id}" target="_blank" rel="noopener noreferrer" class="btn btn-outline-secondary btn-sm py-0 px-2">Open</a>`
      : (f.storedPath && f.storedPath.startsWith("http")
        ? `<a href="${escapeHtml(f.storedPath)}" target="_blank" rel="noopener noreferrer" class="btn btn-outline-secondary btn-sm py-0 px-2">Link</a>`
        : "");
    return `${groupRow}
      <tr>
        <td class="small fw-semibold">${escapeHtml(f.category)}</td>
        <td><span class="badge bg-secondary-subtle text-secondary-emphasis">v${escapeHtml(f.version)}</span></td>
        <td>
          <div>${reviewBadgeHtml(f.reviewStatus || "PENDING")}</div>
          ${f.reviewRemarks ? `<div class="small text-muted mt-1">${escapeHtml(f.reviewRemarks)}</div>` : ""}
        </td>
        <td class="small text-muted font-monospace">
          <div>${escapeHtml(f.originalName)}</div>
          <div class="mt-1">${openLink}</div>
        </td>
        <td class="text-end" style="min-width: 155px;">
          <div class="d-flex gap-1 justify-content-end">
            <button type="button" class="btn btn-success btn-sm py-0 px-2" onclick="reviewApplicantFile(${f.id}, 'VERIFIED')">Accept</button>
            <button type="button" class="btn btn-danger btn-sm py-0 px-2" onclick="openRejectFileModal(${f.id}, '${escapeHtml(f.category)} v${escapeHtml(f.version)}')">Reject</button>
          </div>
        </td>
      </tr>
    `;
  }).join("") || `<tr><td colspan="5" class="text-center text-muted py-3">No requirement files uploaded yet.</td></tr>`;
}

async function openApplicantFilesModal(appId, name) {
  activeModalAppId = appId;
  activeModalAppName = name;
  document.getElementById("filesModalTitle").textContent = `Requirement Files — ${name}`;
  document.getElementById("fileReviewFeedback")?.classList.add("d-none");
  await renderModalFiles();
  new bootstrap.Modal(document.getElementById("filesModal")).show();
}

async function openApplicantChatModal(appId, name) {
  activeStaffChatAppId = appId;
  document.getElementById("chatModalTitle").textContent = `Chat with ${name}`;
  await markChatRead(appId, "admin");
  const target = applications.find(a => a.id === appId);
  if (target) target.unreadAdminCount = 0;
  renderAdminDashboard();
  const msgs = await fetchAppMessages(appId);
  renderChatThread("staffChatThread", msgs, "admin");
  new bootstrap.Modal(document.getElementById("applicantChatModal")).show();
}

const staffChatFormEl = document.getElementById("staffChatForm");
if (staffChatFormEl) {
  staffChatFormEl.addEventListener("submit", async e => {
    e.preventDefault();
    if (!activeStaffChatAppId) return;
    const input = document.getElementById("staffChatInput");
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    await sendAppMessage(activeStaffChatAppId, text);
    const msgs = await fetchAppMessages(activeStaffChatAppId);
    renderChatThread("staffChatThread", msgs, "admin");
    showToast("Message sent to applicant.");
  });
}

async function openAssignStaffModal(appId, name) {
  document.getElementById("assignStaffAppId").value = appId;
  document.getElementById("assignStaffTitle").textContent = `Assign House Visitation Staff — ${name}`;
  const app = applications.find(a => a.id === appId);
  const currentAssigned = app?.assignedStaff || [];

  let staffUsers = [];
  if (useBackend) {
    const res = await fetch("/api/admin/users");
    if (res.ok) staffUsers = (await res.json()).filter(u => isStaffRole(u.role));
  } else {
    staffUsers = JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS) || "[]").filter(u => isStaffRole(u.role));
  }

  const box = document.getElementById("assignStaffCheckboxes");
  box.innerHTML = staffUsers.map(u => `
    <label class="form-check border rounded p-2 d-flex align-items-center gap-2">
      <input class="form-check-input ms-0 assign-staff-cb" type="checkbox" value="${escapeHtml(u.name)}" ${currentAssigned.includes(u.name) ? "checked" : ""} />
      <span class="small fw-semibold">${escapeHtml(u.name)}</span>
      <span class="badge bg-secondary-subtle text-secondary-emphasis ms-auto">${escapeHtml(u.role)}</span>
    </label>
  `).join("") || `<div class="small text-muted">No staff accounts found.</div>`;

  new bootstrap.Modal(document.getElementById("assignStaffModal")).show();
}

const assignStaffFormEl = document.getElementById("assignStaffForm");
if (assignStaffFormEl) {
  assignStaffFormEl.addEventListener("submit", async e => {
    e.preventDefault();
    const appId = Number(document.getElementById("assignStaffAppId").value);
    const staffList = Array.from(document.querySelectorAll(".assign-staff-cb:checked")).map(cb => cb.value);
    if (useBackend) {
      await fetch(`/api/applications/${appId}/assign-staff`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffList })
      });
      await loadApplications();
    } else {
      const target = applications.find(a => a.id === appId);
      if (target) target.assignedStaff = staffList;
      saveLocalApplications();
    }
    bootstrap.Modal.getInstance(document.getElementById("assignStaffModal"))?.hide();
    renderAdminDashboard();
    showToast("House visitation staff assigned!");
  });
}

