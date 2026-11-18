// app.js — Page bootstrapper & initialization

(async function init() {
  await detectBackend();
  await loadSiteContent();
  const saved = localStorage.getItem(STORAGE_KEYS.SESSION);
  if (saved) {
    try { currentUser = JSON.parse(saved); } catch (_) {}
  }

  const isHomePage = Boolean(document.getElementById("heroCarouselInner"));
  const isRegisterPage = Boolean(document.getElementById("sendOtpForm"));
  if (isHomePage || isRegisterPage) {
    loadPublicChat();
    if (isRegisterPage) {
      await initPhAddressSelector();
      initApplicantPinMap();
    }
  }

  const isPortalPage = Boolean(document.getElementById("applicationForm"));
  const isStaffPage = Boolean(document.getElementById("adminTableBody"));
  const isSettingsPage = Boolean(document.getElementById("systemSettingsSection"));

  if (isPortalPage) {
    if (!currentUser) {
      window.location.href = "index.html";
      return;
    }
    await loadSiteContent();
    renderPortalRequirementOptions(siteContent.requirementTypes);
    await loadApplications();
    renderApplicantPortal();
    startApplicantSessionTimeout();
    await loadStorageSettings();
    await loadNotifications();
    const existingApp = applications.find(a => a.userEmail === currentUser.email);
    await initPhAddressSelector(existingApp?.area || "");
    initApplicantPinMap(existingApp?.lat, existingApp?.lng);
    if (existingApp) {
      await loadApplicantFiles(existingApp.id);
      await loadApplicantChat(existingApp.id);
    }
  } else if (isStaffPage) {
    if (!currentUser || !isStaffRole(currentUser.role)) {
      window.location.href = "index.html";
      return;
    }
    await loadApplications();
    renderAdminDashboard();
    loadNotifications();
  } else if (isSettingsPage) {
    if (!currentUser || !isStaffRole(currentUser.role) || currentUser.role === "approver") {
      window.location.href = currentUser ? "staff.html" : "index.html";
      return;
    }
    const nameEl = document.getElementById("navProfileName");
    const subEl = document.getElementById("navProfileSub");
    const avatarEl = document.getElementById("navProfileAvatar");
    if (nameEl) nameEl.textContent = currentUser.name;
    if (avatarEl) avatarEl.textContent = getInitials(currentUser.name);
    if (subEl) subEl.textContent = "Administrator";

    if (window.location.hash) {
      openSystemTab(window.location.hash.slice(1));
    }
    loadSmtpSettings();
    loadAdminUsers();
    loadAdminIps();
    loadStorageSettings();
    loadSiteContent();
    loadApplicationController();
    loadAuditLogs();
  }
})();
