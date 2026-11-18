// core.js — Shared state, helpers, backend detection, notifications, chat & map utilities

const STATUS_LABELS = {
  UNPROCESSED: "Unprocessed",
  FOR_VERIFICATION: "For Verification",
  SHORTLISTED: "Shortlisted / For Interview",
  FOR_HOUSE_VISITATION: "For House Visitation",
  APPROVED: "Approved",
  DECLINED: "Declined"
};

const PIPELINE_ORDER = [
  "UNPROCESSED",
  "FOR_VERIFICATION",
  "SHORTLISTED",
  "FOR_HOUSE_VISITATION",
  "APPROVED"
];

const AREA_COORDS = {
  "Taguig - Fort Bonifacio (BGC)": [14.5508, 121.0494],
  "Taguig - Pembo / Cembo": [14.5515, 121.0598],
  "Taguig - Signal Village": [14.5136, 121.0566],
  "Makati - Guadalupe / Pitogo": [14.5633, 121.0457],
  "Pasig - Pinagbuhatan": [14.5484, 121.0967],
  "Pateros - Poblacion": [14.5446, 121.0683]
};

const STORAGE_KEYS = {
  USERS: "rl_portal_users_v1",
  APPS: "rl_portal_apps_v1",
  SESSION: "rl_portal_session_v1"
};

let useBackend = false;
let currentUser = null;
let applications = [];
let visitationMap = null;
let mapMarkers = [];

function showToast(message, variant = "success") {
  let container = document.getElementById("rlToastContainer");
  if (!container) {
    container = document.createElement("div");
    container.id = "rlToastContainer";
    container.className = "toast-container position-fixed bottom-0 end-0 p-3";
    container.style.zIndex = "1090";
    document.body.appendChild(container);
  }
  const bgClass = variant === "danger" ? "text-bg-danger" : variant === "warning" ? "text-bg-warning" : "text-bg-success";
  const toastEl = document.createElement("div");
  toastEl.className = `toast align-items-center ${bgClass} border-0`;
  toastEl.setAttribute("role", "alert");
  toastEl.innerHTML = `
    <div class="d-flex">
      <div class="toast-body small fw-semibold">${escapeHtml(message)}</div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
    </div>
  `;
  container.appendChild(toastEl);
  if (typeof bootstrap !== "undefined") {
    const t = new bootstrap.Toast(toastEl, { delay: 3200 });
    toastEl.addEventListener("hidden.bs.toast", () => toastEl.remove());
    t.show();
  }
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toNameCase(str) {
  return String(str || "")
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map(w => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : ""))
    .join(" ");
}

function getSurname(name) {
  const parts = String(name || "").trim().split(/\s+/);
  return (parts[parts.length - 1] || "").toLowerCase();
}

function getSeedUsers() {
  return [
    { id: 1, name: "Angela Reyes", email: "applicant@reallife.ph", password: "demo123", role: "applicant" },
    { id: 2, name: "BGC Center Staff", email: "staff@reallife.ph", password: "staff123", role: "admin" },
    { id: 3, name: "System Administrator", email: "sysadmin@reallife.ph", password: "admin123", role: "system_admin" },
    { id: 4, name: "Communications Lead", email: "comms@reallife.ph", password: "comms123", role: "comms_admin" },
    { id: 5, name: "Pastor Mark Navarro", email: "mark.navarro@reallife.ph", password: "staff123", role: "approver" },
    { id: 6, name: "Coach Grace Bautista", email: "grace.bautista@reallife.ph", password: "staff123", role: "approver" },
    { id: 7, name: "Marco Dela Cruz", email: "marco.delacruz@example.com", password: "demo123", role: "applicant" },
    { id: 8, name: "Carlo Mendoza", email: "carlo.mendoza@example.com", password: "demo123", role: "applicant" },
    { id: 9, name: "Bea Villanueva", email: "bea.villanueva@example.com", password: "demo123", role: "applicant" },
    { id: 10, name: "Joshua Tan", email: "joshua.tan@example.com", password: "demo123", role: "applicant" },
    { id: 11, name: "Clarisse Lim", email: "clarisse.lim@example.com", password: "demo123", role: "applicant" },
    { id: 12, name: "Rafael Soriano", email: "rafael.soriano@example.com", password: "demo123", role: "applicant" },
    { id: 13, name: "Hannah Ocampo", email: "hannah.ocampo@example.com", password: "demo123", role: "applicant" },
    { id: 14, name: "Nathaniel Aquino", email: "nathaniel.aquino@example.com", password: "demo123", role: "applicant" },
    { id: 15, name: "Sofia Mercado", email: "sofia.mercado@example.com", password: "demo123", role: "applicant" }
  ];
}

function getSeedApplications() {
  return [
    {
      id: 101,
      userEmail: "applicant@reallife.ph",
      name: "Angela Reyes",
      age: 18,
      schoolYear: "SY 2026-2027 (Incoming 1st Year College)",
      course: "BS Information Technology",
      gpa: 92.4,
      income: "PHP 10,000 - 20,000",
      contact: "+63 917 555 0101",
      area: "Taguig - Pembo / Cembo",
      address: "14 Sampaguita St., Brgy. Pembo, Taguig City",
      driveLink: "https://drive.google.com/drive/folders/sample-angela-docs",
      status: "FOR_HOUSE_VISITATION",
      updatedAt: "2026-11-16 14:20",
      lat: 14.5446,
      lng: 121.0574,
      assignedStaff: ["Pastor Mark Navarro", "Coach Grace Bautista"],
      emailLogs: [
        "2026-11-10: Application received (UNPROCESSED).",
        "2026-11-12: Moved to FOR VERIFICATION — 3-year grades & income docs under review.",
        "2026-11-14: Verification passed! Official Real LIFE application form sent via email (SHORTLISTED).",
        "2026-11-16: Scheduled for FOR HOUSE VISITATION in Brgy. Pembo."
      ]
    },
    {
      id: 102,
      userEmail: "marco.delacruz@example.com",
      name: "Marco Dela Cruz",
      age: 17,
      schoolYear: "SY 2026-2027 (Incoming Grade 12)",
      course: "STEM Strand",
      gpa: 90.1,
      income: "Below PHP 10,000",
      contact: "+63 918 555 0142",
      area: "Makati - Guadalupe / Pitogo",
      address: "88 Burgos St., Brgy. Pitogo, Makati City",
      driveLink: "https://drive.google.com/drive/folders/sample-marco-docs",
      status: "SHORTLISTED",
      updatedAt: "2026-11-17 09:45",
      lat: 14.5588,
      lng: 121.0454,
      assignedStaff: ["BGC Center Staff"],
      emailLogs: [
        "2026-11-15: Application received (UNPROCESSED).",
        "2026-11-16: Moved to FOR VERIFICATION.",
        "2026-11-17: Shortlisted for interview; official Real LIFE form emailed."
      ]
    },
    {
      id: 103,
      userEmail: "carlo.mendoza@example.com",
      name: "Carlo Mendoza",
      age: 19,
      schoolYear: "SY 2026-2027 (2nd-4th Year College)",
      course: "BS Accountancy",
      gpa: 88.75,
      income: "PHP 10,000 - 20,000",
      contact: "+63 920 555 0188",
      area: "Taguig - Signal Village",
      address: "221 Rizal Ave., Central Signal Village, Taguig City",
      driveLink: "https://drive.google.com/drive/folders/sample-carlo-docs",
      status: "FOR_VERIFICATION",
      updatedAt: "2026-11-18 10:15",
      lat: 14.5097,
      lng: 121.0566,
      assignedStaff: [],
      emailLogs: [
        "2026-11-17: Application received (UNPROCESSED).",
        "2026-11-18: Moved to FOR VERIFICATION."
      ]
    },
    {
      id: 104,
      userEmail: "bea.villanueva@example.com",
      name: "Bea Villanueva",
      age: 18,
      schoolYear: "SY 2026-2027 (Incoming 1st Year College)",
      course: "BS Nursing",
      gpa: 94.0,
      income: "Below PHP 10,000",
      contact: "+63 915 555 0199",
      area: "Pateros - Poblacion",
      address: "45 M. Almeda St., Poblacion, Pateros",
      driveLink: "https://drive.google.com/drive/folders/sample-bea-docs",
      status: "UNPROCESSED",
      updatedAt: "2026-11-18 16:00",
      lat: 14.5449,
      lng: 121.0665,
      assignedStaff: [],
      emailLogs: [
        "2026-11-18: Application received (UNPROCESSED)."
      ]
    },
    {
      id: 105,
      userEmail: "joshua.tan@example.com",
      name: "Joshua Tan",
      age: 20,
      schoolYear: "SY 2026-2027 (2nd-4th Year College)",
      course: "BS Civil Engineering",
      gpa: 91.5,
      income: "Below PHP 10,000",
      contact: "+63 917 812 3409",
      area: "Taguig - Western Bicutan",
      address: "Blk 9 Lot 12, EP Housing, Western Bicutan, Taguig",
      driveLink: "https://drive.google.com/drive/folders/sample-joshua-docs",
      status: "APPROVED",
      updatedAt: "2026-11-18 11:30",
      lat: 14.5172,
      lng: 121.0365,
      assignedStaff: ["Pastor Mark Navarro"],
      emailLogs: [
        "2026-11-05: Application received.",
        "2026-11-10: House visitation completed.",
        "2026-11-18: APPROVED for SY 2026-2027 Scholarship."
      ]
    },
    {
      id: 106,
      userEmail: "clarisse.lim@example.com",
      name: "Clarisse Lim",
      age: 16,
      schoolYear: "SY 2026-2027 (Incoming Grade 11)",
      course: "ABM Strand",
      gpa: 93.2,
      income: "PHP 10,000 - 20,000",
      contact: "+63 927 401 8821",
      area: "Pasig - Kapitolyo / Pineda",
      address: "19 Pine St., Brgy. Pineda, Pasig City",
      driveLink: "https://drive.google.com/drive/folders/sample-clarisse-docs",
      status: "FOR_HOUSE_VISITATION",
      updatedAt: "2026-11-17 15:10",
      lat: 14.5665,
      lng: 121.0628,
      assignedStaff: ["Coach Grace Bautista"],
      emailLogs: [
        "2026-11-11: Application received.",
        "2026-11-17: Scheduled for House Visitation."
      ]
    },
    {
      id: 107,
      userEmail: "rafael.soriano@example.com",
      name: "Rafael Soriano",
      age: 19,
      schoolYear: "SY 2026-2027 (Incoming 1st Year College)",
      course: "BS Computer Science",
      gpa: 89.4,
      income: "PHP 20,000 - 30,000",
      contact: "+63 998 331 5520",
      area: "Taguig - Upper Bicutan",
      address: "72 Maharlika Rd., Upper Bicutan, Taguig City",
      driveLink: "https://drive.google.com/drive/folders/sample-rafael-docs",
      status: "APPROVED",
      updatedAt: "2026-11-15 17:00",
      lat: 14.4961,
      lng: 121.0493,
      assignedStaff: ["BGC Center Staff", "Pastor Mark Navarro"],
      emailLogs: [
        "2026-11-02: Application received.",
        "2026-11-15: APPROVED for Scholarship."
      ]
    },
    {
      id: 108,
      userEmail: "hannah.ocampo@example.com",
      name: "Hannah Ocampo",
      age: 18,
      schoolYear: "SY 2026-2027 (Incoming 1st Year College)",
      course: "BS Secondary Education",
      gpa: 87.9,
      income: "Below PHP 10,000",
      contact: "+63 916 742 1190",
      area: "Makati - East Rembo / Comembo",
      address: "301 J.P. Rizal Ext., East Rembo, Makati City",
      driveLink: "https://drive.google.com/drive/folders/sample-hannah-docs",
      status: "FOR_VERIFICATION",
      updatedAt: "2026-11-18 08:50",
      lat: 14.5522,
      lng: 121.0621,
      assignedStaff: [],
      emailLogs: [
        "2026-11-16: Application received.",
        "2026-11-18: Grade 12 report card under verification."
      ]
    },
    {
      id: 109,
      userEmail: "nathaniel.aquino@example.com",
      name: "Nathaniel Aquino",
      age: 21,
      schoolYear: "SY 2026-2027 (2nd-4th Year College)",
      course: "BS Hospitality Management",
      gpa: 81.5,
      income: "Above PHP 30,000",
      contact: "+63 922 618 7734",
      area: "Paranaque - Bicutan",
      address: "55 Dona Soledad Ave., Better Living, Paranaque",
      driveLink: "https://drive.google.com/drive/folders/sample-nathaniel-docs",
      status: "DECLINED",
      updatedAt: "2026-11-14 13:40",
      lat: 14.4855,
      lng: 121.0282,
      assignedStaff: [],
      emailLogs: [
        "2026-11-08: Application received.",
        "2026-11-14: DECLINED — did not meet household income & GPA threshold."
      ]
    },
    {
      id: 110,
      userEmail: "sofia.mercado@example.com",
      name: "Sofia Mercado",
      age: 17,
      schoolYear: "SY 2026-2027 (Incoming Grade 12)",
      course: "HUMSS Strand",
      gpa: 91.8,
      income: "Below PHP 10,000",
      contact: "+63 906 519 4402",
      area: "Taguig - Ususan",
      address: "108 P. Mariano St., Brgy. Ususan, Taguig City",
      driveLink: "https://drive.google.com/drive/folders/sample-sofia-docs",
      status: "UNPROCESSED",
      updatedAt: "2026-11-18 17:30",
      lat: 14.5356,
      lng: 121.0676,
      assignedStaff: [],
      emailLogs: [
        "2026-11-18: Application received (UNPROCESSED)."
      ]
    }
  ];
}

function ensureLocalSeed() {
  if (!localStorage.getItem(STORAGE_KEYS.USERS)) {
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(getSeedUsers()));
  }
  if (!localStorage.getItem(STORAGE_KEYS.APPS)) {
    localStorage.setItem(STORAGE_KEYS.APPS, JSON.stringify(getSeedApplications()));
  }
}

async function detectBackend() {
  try {
    const res = await fetch("/api/health", { cache: "no-store" });
    if (res.ok) {
      useBackend = true;
      return;
    }
  } catch (_) {
    // Static / file:// mode fallback
  }
  useBackend = false;
  ensureLocalSeed();
}

async function loadApplications(archived = false) {
  if (useBackend) {
    const res = await fetch(`/api/applications${archived ? "?archived=1" : ""}`);
    if (res.ok) {
      applications = await res.json();
      return;
    }
  }
  const all = JSON.parse(localStorage.getItem(STORAGE_KEYS.APPS) || "[]");
  applications = all.filter(a => Boolean(a.is_archived) === archived);
}

function toggleArchivedView(val) {
  loadApplications(val === "1").then(() => renderAdminDashboard());
}

function saveLocalApplications() {
  localStorage.setItem(STORAGE_KEYS.APPS, JSON.stringify(applications));
}

const ADMIN_ROLES = ["admin", "approver", "system_admin", "comms_admin"];

function isStaffRole(role) {
  return ADMIN_ROLES.includes(role);
}

function redirectAfterAuth(user) {
  if (user.role === "system_admin" || user.role === "comms_admin") {
    window.location.href = "settings.html";
    return;
  }
  window.location.href = isStaffRole(user.role) ? "staff.html" : "portal.html";
}

async function logout() {
  if (useBackend) {
    try { await fetch("/api/auth/logout", { method: "POST" }); } catch (_) {}
  }
  currentUser = null;
  localStorage.removeItem(STORAGE_KEYS.SESSION);
  window.location.href = "index.html";
}

function getInitials(name) {
  return (name || "U")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(p => p[0]?.toUpperCase() || "")
    .join("") || "U";
}

let siteContent = { announcements: [], faqs: [], heroImages: [] };

async function loadSiteContent() {
  if (useBackend) {
    const res = await fetch("/api/content");
    if (res.ok) siteContent = await res.json();
  } else {
    siteContent = JSON.parse(localStorage.getItem("rl_portal_content_v1") || JSON.stringify({
      announcements: [
        { id: 1, category: "Application Window", title: "Preliminary Screening Open", body: "Submit your applicant profile and prepare your last 3 years of grades and proof of household income.", show_on_banner: 1 },
        { id: 2, category: "Orientation", title: "BGC Center Applicant Briefing", body: "Shortlisted applicants will receive an email invitation with exact venue details and interview schedule after verification.", show_on_banner: 0 },
        { id: 3, category: "Screening Stages", title: "5-Step Review Process", body: "Unprocessed -> For Verification -> Shortlisted / Interview -> House Visitation -> Approved. Email updates are sent at every stage.", show_on_banner: 0 }
      ],
      faqs: [
        { id: 1, question: "What documents do I need to prepare for screening?", answer: "Prepare your report cards/grades for the last 3 years, Birth Certificate, and proof of family/household income (ITR, Certificate of Indigency, or payslips)." },
        { id: 2, question: "How will I know if my application moves to the next stage?", answer: "Sign in to the Applicant Portal anytime to view your live status tag, and watch your inbox for email notifications at every stage." },
        { id: 3, question: "What happens during Shortlisted & House Visitation stages?", answer: "Applicants who pass verification are scheduled for an interview, followed by a home visit by our BGC center staff before final approval." }
      ],
      heroImages: [{ id: 1, image_url: "assets/rl/testSamplePics.jpg", caption: "Real LIFE Foundation Scholars" }]
    }));
  }
  applyClientName(siteContent.clientName);
  if (typeof renderHomeContent === "function") renderHomeContent();
  if (typeof renderAdminHomeContent === "function") renderAdminHomeContent();
}

let activeClientName = "BGC";

function applyClientName(name) {
  const cname = (name || "BGC").trim() || "BGC";
  activeClientName = cname;
  document.querySelectorAll(".client-name-text").forEach(el => {
    el.textContent = cname;
  });
  if (!document.documentElement.dataset.titleTemplate) {
    document.documentElement.dataset.titleTemplate = document.title.replace(/\bBGC\b/g, "__CLIENT_NAME__");
  }
  const tpl = document.documentElement.dataset.titleTemplate;
  if (tpl && tpl.includes("__CLIENT_NAME__")) {
    document.title = tpl.replace(/__CLIENT_NAME__/g, cname);
  }
  const chatInput = document.getElementById("applicantChatInput");
  if (chatInput) {
    chatInput.placeholder = `Write a message to ${cname} Staff...`;
  }
}

function toggleStorageFields() {
  const provider = document.getElementById("storageProvider")?.value || "filesystem";
  document.getElementById("fsConfigGroup")?.classList.toggle("d-none", provider !== "filesystem");
  document.getElementById("gdriveConfigGroup")?.classList.toggle("d-none", provider !== "google_drive");
  document.getElementById("nextcloudUrlGroup")?.classList.toggle("d-none", provider !== "nextcloud");
  document.getElementById("nextcloudUserGroup")?.classList.toggle("d-none", provider !== "nextcloud");
}

async function loadStorageSettings() {
  if (!document.getElementById("storageForm") && !document.getElementById("requirementsCard")) return;
  let cfg = { provider: "filesystem", baseDir: "Images", gdriveRoot: "", nextcloudUrl: "", nextcloudUser: "" };
  if (useBackend) {
    const res = await fetch("/api/admin/storage");
    if (res.ok) cfg = await res.json();
  } else {
    try {
      cfg = JSON.parse(localStorage.getItem("rl_portal_storage_v1") || JSON.stringify(cfg));
    } catch (_) {}
  }

  if (document.getElementById("storageForm")) {
    document.getElementById("storageProvider").value = cfg.provider || "filesystem";
    document.getElementById("storageBaseDir").value = cfg.baseDir || "Images";
    document.getElementById("storageGdriveRoot").value = cfg.gdriveRoot || "";
    document.getElementById("storageNextcloudUrl").value = cfg.nextcloudUrl || "";
    document.getElementById("storageNextcloudUser").value = cfg.nextcloudUser || "";
    toggleStorageFields();
  }

  const pill = document.getElementById("activeStoragePill");
  if (pill) {
    const labels = { filesystem: "File System", google_drive: "Google Drive", nextcloud: "Nextcloud" };
    pill.textContent = labels[cfg.provider] || "File System";
    const isFs = cfg.provider === "filesystem";
    document.getElementById("reqFileGroup")?.classList.toggle("d-none", !isFs);
    document.getElementById("reqLinkGroup")?.classList.toggle("d-none", isFs);
  }
}

async function fetchApplicantFiles(appId) {
  if (useBackend) {
    const res = await fetch(`/api/applications/${appId}/files`);
    if (res.ok) return await res.json();
    return [];
  }
  const all = JSON.parse(localStorage.getItem("rl_portal_files_v1") || "[]");
  return all.filter(f => f.applicationId === appId);
}

let currentApplicantFiles = [];
let activeModalAppId = null;
let activeModalAppName = "";

function reviewBadgeHtml(status) {
  if (status === "VERIFIED") return `<span class="badge bg-success-subtle text-success-emphasis">Verified</span>`;
  if (status === "RESUBMIT") return `<span class="badge bg-danger-subtle text-danger-emphasis">Resubmit</span>`;
  return `<span class="badge bg-warning-subtle text-warning-emphasis">Pending</span>`;
}

function updateUploadLockState() {
  const cat = document.getElementById("reqCategory")?.value;
  const submitBtn = document.getElementById("reqSubmitBtn");
  const fileInput = document.getElementById("reqFileInput");
  const urlInput = document.getElementById("reqExternalUrl");
  const lockNotice = document.getElementById("reqLockNotice");
  if (!cat || !submitBtn) return;

  const isVerified = currentApplicantFiles.some(f => f.category === cat && f.reviewStatus === "VERIFIED");
  submitBtn.disabled = isVerified;
  if (fileInput) fileInput.disabled = isVerified;
  if (urlInput) urlInput.disabled = isVerified;
  if (lockNotice) lockNotice.classList.toggle("d-none", !isVerified);
}

function groupAndSortFiles(files) {
  const dictOrder = (siteContent.requirementTypes || []).map(t => t.code);
  return [...files].sort((a, b) => {
    const ia = dictOrder.indexOf(a.category);
    const ib = dictOrder.indexOf(b.category);
    if (ia !== -1 && ib !== -1 && ia !== ib) return ia - ib;
    if (ia !== -1 && ib === -1) return -1;
    if (ia === -1 && ib !== -1) return 1;
    const catCmp = (a.category || "").localeCompare(b.category || "");
    if (catCmp !== 0) return catCmp;
    return Number(b.version || 0) - Number(a.version || 0);
  });
}

let activeStaffChatAppId = null;

async function loadNotifications() {
  const listEl = document.getElementById("notifList");
  const badgeEl = document.getElementById("notifCountBadge");
  if (!listEl || !badgeEl || !currentUser) return;

  let items = [];
  if (useBackend) {
    const q = currentUser.role === "admin"
      ? "role=admin"
      : `role=applicant&email=${encodeURIComponent(currentUser.email)}`;
    const res = await fetch(`/api/notifications?${q}`);
    if (res.ok) items = await res.json();
  } else {
    const all = JSON.parse(localStorage.getItem("rl_portal_notifs_v1") || "[]");
    items = all.filter(n =>
      currentUser.role === "admin"
        ? n.target_role === "admin"
        : n.target_role === "applicant" && n.target_email === currentUser.email
    );
  }

  const unread = items.filter(n => !n.is_read).length;
  badgeEl.textContent = String(unread);
  badgeEl.classList.toggle("d-none", unread === 0);

  listEl.innerHTML = items.map(n => `
    <div class="p-2 rounded border ${n.is_read ? "bg-white" : "bg-success-subtle"}">
      <div class="small fw-bold">${escapeHtml(n.title)}</div>
      <div class="small text-muted">${escapeHtml(n.message)}</div>
      <div class="text-muted" style="font-size:0.7rem;">${escapeHtml(n.created_at)}</div>
    </div>
  `).join("") || `<div class="small text-muted text-center py-3">No notifications yet.</div>`;
}

async function markAllNotificationsRead() {
  if (!currentUser) return;
  if (useBackend) {
    await fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: currentUser.role, email: currentUser.email })
    });
  } else {
    const all = JSON.parse(localStorage.getItem("rl_portal_notifs_v1") || "[]");
    all.forEach(n => {
      if (currentUser.role === "admin" ? n.target_role === "admin" : n.target_email === currentUser.email) {
        n.is_read = 1;
      }
    });
    localStorage.setItem("rl_portal_notifs_v1", JSON.stringify(all));
  }
  loadNotifications();
  showToast("All notifications marked as read.");
}

async function fetchAppMessages(appId) {
  if (useBackend) {
    const res = await fetch(`/api/applications/${appId}/messages`);
    if (res.ok) return await res.json();
    return [];
  }
  const all = JSON.parse(localStorage.getItem("rl_portal_msgs_v1") || "[]");
  return all.filter(m => m.application_id === appId);
}

function renderChatThread(containerId, messages, viewerRole) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = messages.map(m => {
    const isSelf = m.sender_role === viewerRole;
    return `
      <div class="chat-msg ${isSelf ? "user" : "bot"}">
        <div class="fw-bold" style="font-size:0.72rem;opacity:0.85;">${escapeHtml(m.sender_name)} &middot; ${escapeHtml(m.created_at)}</div>
        <div>${escapeHtml(m.body)}</div>
      </div>
    `;
  }).join("") || `<div class="small text-muted text-center my-auto">No messages yet. Start the conversation below.</div>`;
  el.scrollTop = el.scrollHeight;
}

async function markChatRead(appId, viewerRole) {
  if (!useBackend || !appId) return;
  await fetch(`/api/applications/${appId}/messages/read`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ viewerRole })
  });
}

async function sendAppMessage(appId, bodyText) {
  if (useBackend) {
    await fetch(`/api/applications/${appId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        senderRole: currentUser.role,
        senderName: currentUser.name,
        body: bodyText
      })
    });
  } else {
    const all = JSON.parse(localStorage.getItem("rl_portal_msgs_v1") || "[]");
    all.push({
      id: Date.now(),
      application_id: appId,
      sender_role: currentUser.role,
      sender_name: currentUser.name,
      body: bodyText,
      created_at: new Date().toISOString().slice(0, 16).replace("T", " ")
    });
    localStorage.setItem("rl_portal_msgs_v1", JSON.stringify(all));
  }
}

function renderPortalRequirementOptions(types) {
  const sel = document.getElementById("reqCategory");
  if (!sel || !Array.isArray(types) || types.length === 0) return;
  sel.innerHTML = types.map(t => `<option value="${escapeHtml(t.code)}">${escapeHtml(t.label)}</option>`).join("");
  updateUploadLockState();
}

const FALLBACK_PH_CITIES = [
  { code: "137607000", name: "City of Taguig", barangays: ["Fort Bonifacio", "Pembo", "Cembo", "Comembo", "East Rembo", "West Rembo", "Central Signal Village", "South Signal Village", "Ususan", "Western Bicutan"] },
  { code: "137602000", name: "City of Makati", barangays: ["Guadalupe Nuevo", "Guadalupe Viejo", "Pitogo", "Poblacion", "Bel-Air", "Pio del Pilar", "San Lorenzo"] },
  { code: "137403000", name: "City of Pasig", barangays: ["Pinagbuhatan", "Bagong Ilog", "Kapitolyo", "San Antonio", "Ugong", "Rosario"] },
  { code: "137606000", name: "Pateros", barangays: ["Poblacion", "Aguho", "Martires del 96", "San Roque", "Santa Ana"] },
  { code: "137604000", name: "City of Parañaque", barangays: ["BF Homes", "Don Bosco", "San Antonio", "Sun Valley", "Merville"] }
];

async function initPhAddressSelector(existingArea = "") {
  const citySel = document.getElementById("phCitySelect");
  const brgySel = document.getElementById("phBarangaySelect");
  const areaInput = document.getElementById("appArea");
  if (!citySel || !brgySel || !areaInput) return;

  let cities = [];
  try {
    const res = await fetch("https://psgc.gitlab.io/api/regions/130000000/cities-municipalities/");
    if (res.ok) {
      const data = await res.json();
      cities = data.map(c => ({ code: c.code, name: c.name })).sort((a, b) => a.name.localeCompare(b.name));
    }
  } catch (_) {}
  if (cities.length === 0) cities = FALLBACK_PH_CITIES;

  citySel.innerHTML = cities.map(c => `<option value="${escapeHtml(c.code)}" data-name="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join("");

  async function loadBarangays(cityCode, preselectBrgy = "") {
    let brgys = [];
    const fallbackCity = FALLBACK_PH_CITIES.find(c => c.code === cityCode);
    if (!fallbackCity) {
      try {
        const res = await fetch(`https://psgc.gitlab.io/api/cities-municipalities/${cityCode}/barangays/`);
        if (res.ok) brgys = (await res.json()).map(b => b.name).sort();
      } catch (_) {}
    }
    if (brgys.length === 0) {
      try {
        const res = await fetch(`https://psgc.gitlab.io/api/cities-municipalities/${cityCode}/barangays/`);
        if (res.ok) brgys = (await res.json()).map(b => b.name).sort();
      } catch (_) {}
    }
    if (brgys.length === 0 && fallbackCity) brgys = fallbackCity.barangays;
    if (brgys.length === 0) brgys = ["Poblacion"];

    brgySel.innerHTML = brgys.map(b => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join("");
    if (preselectBrgy && brgys.includes(preselectBrgy)) brgySel.value = preselectBrgy;
    syncArea();
  }

  function syncArea() {
    const cityName = citySel.options[citySel.selectedIndex]?.dataset?.name || citySel.value;
    areaInput.value = `${cityName} - ${brgySel.value}`;
  }

  citySel.addEventListener("change", () => loadBarangays(citySel.value));
  brgySel.addEventListener("change", syncArea);

  let initCity = cities[0]?.code;
  let initBrgy = "";
  if (existingArea && existingArea.includes(" - ")) {
    const [cPart, bPart] = existingArea.split(" - ");
    const match = cities.find(c => c.name.toLowerCase().includes(cPart.toLowerCase()) || cPart.toLowerCase().includes(c.name.replace("City of ", "").toLowerCase()));
    if (match) {
      initCity = match.code;
      initBrgy = bPart.trim();
    }
  }
  citySel.value = initCity;
  await loadBarangays(initCity, initBrgy);
}

let applicantPinMap = null;
let applicantPinMarker = null;
let adminPinMap = null;
let adminPinMarker = null;

function setPinCoords(mode, lat, lng) {
  if (mode === "admin") {
    document.getElementById("editAppLat").value = lat.toFixed(6);
    document.getElementById("editAppLng").value = lng.toFixed(6);
    document.getElementById("adminPinCoordsText").textContent = `Pinned: ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  } else {
    document.getElementById("appLat").value = lat.toFixed(6);
    document.getElementById("appLng").value = lng.toFixed(6);
    document.getElementById("pinCoordsText").textContent = `Pinned: ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  }
}

function initApplicantPinMap(lat = null, lng = null) {
  const el = document.getElementById("applicantPinMap");
  if (!el || typeof L === "undefined") return;
  const startLat = lat || 14.5508;
  const startLng = lng || 121.0494;
  if (!applicantPinMap) {
    applicantPinMap = L.map("applicantPinMap").setView([startLat, startLng], 14);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap" }).addTo(applicantPinMap);
    applicantPinMarker = L.marker([startLat, startLng], { draggable: true }).addTo(applicantPinMap);
    applicantPinMarker.on("dragend", () => {
      const pos = applicantPinMarker.getLatLng();
      setPinCoords("applicant", pos.lat, pos.lng);
    });
    applicantPinMap.on("click", e => {
      applicantPinMarker.setLatLng(e.latlng);
      setPinCoords("applicant", e.latlng.lat, e.latlng.lng);
    });
  } else {
    applicantPinMap.setView([startLat, startLng], 14);
    applicantPinMarker.setLatLng([startLat, startLng]);
  }
  setTimeout(() => applicantPinMap.invalidateSize(), 150);
  if (lat && lng) setPinCoords("applicant", lat, lng);
}

function initAdminPinMap(lat = null, lng = null) {
  const el = document.getElementById("adminPinMap");
  if (!el || typeof L === "undefined") return;
  const startLat = lat || 14.5508;
  const startLng = lng || 121.0494;
  if (!adminPinMap) {
    adminPinMap = L.map("adminPinMap").setView([startLat, startLng], 14);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap" }).addTo(adminPinMap);
    adminPinMarker = L.marker([startLat, startLng], { draggable: true }).addTo(adminPinMap);
    adminPinMarker.on("dragend", () => {
      const pos = adminPinMarker.getLatLng();
      setPinCoords("admin", pos.lat, pos.lng);
    });
    adminPinMap.on("click", e => {
      adminPinMarker.setLatLng(e.latlng);
      setPinCoords("admin", e.latlng.lat, e.latlng.lng);
    });
  } else {
    adminPinMap.setView([startLat, startLng], 14);
    adminPinMarker.setLatLng([startLat, startLng]);
  }
  setTimeout(() => adminPinMap.invalidateSize(), 150);
  if (lat && lng) setPinCoords("admin", lat, lng);
}

function useMyCurrentLocation(mode = "applicant") {
  if (!navigator.geolocation) {
    showToast("Geolocation is not supported by your browser.", "danger");
    return;
  }
  navigator.geolocation.getCurrentPosition(
    pos => {
      const { latitude, longitude } = pos.coords;
      if (mode === "applicant" && applicantPinMap && applicantPinMarker) {
        applicantPinMap.setView([latitude, longitude], 16);
        applicantPinMarker.setLatLng([latitude, longitude]);
        setPinCoords("applicant", latitude, longitude);
        showToast("Exact location pinned!");
      }
    },
    () => showToast("Could not get your location. Please click the map to drop a pin.", "warning")
  );
}

