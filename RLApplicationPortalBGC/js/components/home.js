// home.js — Public landing page content, announcements, FAQs, hero carousel & chatbot

function renderHomeContent() {
  applyClientName(siteContent.clientName);
  const banner = document.getElementById("importantBanner");
  const bannerInner = document.getElementById("importantBannerInner");
  if (banner && bannerInner) {
    const flagged = (siteContent.announcements || []).filter(a => a.show_on_banner);
    if (flagged.length > 0) {
      bannerInner.innerHTML = flagged.map((a, i) => `
        <div class="carousel-item ${i === 0 ? "active" : ""}">
          <span class="badge bg-warning text-dark me-2">IMPORTANT${flagged.length > 1 ? ` ${i + 1}/${flagged.length}` : ""}</span>
          <span><strong>${escapeHtml(a.title)}:</strong> ${escapeHtml(a.body)}</span>
        </div>
      `).join("");
      banner.classList.remove("d-none");
    } else {
      banner.classList.add("d-none");
    }
  }

  const regOpen = siteContent.registrationOpen !== false;
  const ctaOpen = document.getElementById("heroCtaOpen");
  const ctaClosed = document.getElementById("heroCtaClosed");
  const navSignIn = document.getElementById("navSignInBtn");
  if (ctaOpen && ctaClosed) {
    ctaOpen.classList.toggle("d-none", !regOpen);
    ctaClosed.classList.toggle("d-none", regOpen);
  }
  if (navSignIn && !regOpen) {
    navSignIn.textContent = "Staff / Existing Sign In";
  }

  const dlBadge = document.getElementById("heroDeadlineBadge");
  if (dlBadge && siteContent.deadline) {
    dlBadge.textContent = `Application Deadline: ${siteContent.deadline}`;
    dlBadge.classList.remove("d-none");
  }
  const portalDl = document.getElementById("portalDeadlineBadge");
  if (portalDl && siteContent.deadline) {
    portalDl.textContent = `Requirements Deadline: ${siteContent.deadline}`;
    portalDl.classList.remove("d-none");
  }

  const carouselInner = document.getElementById("heroCarouselInner");
  if (carouselInner && (siteContent.heroImages || []).length > 0) {
    carouselInner.innerHTML = siteContent.heroImages.map((img, i) => `
      <div class="carousel-item ${i === 0 ? "active" : ""}">
        <img src="${escapeHtml(img.image_url)}" alt="${escapeHtml(img.caption || "Real LIFE Foundation")}" class="hero-photo" />
      </div>
    `).join("");
  }

  const annGrid = document.getElementById("announcementsGrid");
  if (annGrid && (siteContent.announcements || []).length > 0) {
    annGrid.innerHTML = siteContent.announcements.map(a => `
      <div class="col-md-4">
        <div class="bulletin-card">
          <div class="small fw-bold text-success text-uppercase mb-1">${escapeHtml(a.category)}</div>
          <h5 class="fw-bold">${escapeHtml(a.title)}</h5>
          <p class="small text-muted mb-0">${escapeHtml(a.body)}</p>
        </div>
      </div>
    `).join("");
  }

  const faqAcc = document.getElementById("faqAccordion");
  if (faqAcc && (siteContent.faqs || []).length > 0) {
    faqAcc.innerHTML = siteContent.faqs.map((f, i) => `
      <div class="accordion-item">
        <h2 class="accordion-header">
          <button class="accordion-button ${i === 0 ? "" : "collapsed"}" type="button" data-bs-toggle="collapse" data-bs-target="#faqDyn_${f.id}">
            ${escapeHtml(f.question)}
          </button>
        </h2>
        <div id="faqDyn_${f.id}" class="accordion-collapse collapse ${i === 0 ? "show" : ""}" data-bs-parent="#faqAccordion">
          <div class="accordion-body small text-secondary">${escapeHtml(f.answer)}</div>
        </div>
      </div>
    `).join("");
  }
}

function renderAdminHomeContent() {
  const heroList = document.getElementById("adminHeroList");
  if (heroList) {
    heroList.innerHTML = (siteContent.heroImages || []).map(h => `
      <div class="col-6 col-md-3">
        <div class="border rounded p-2 bg-white text-center">
          <img src="${escapeHtml(h.image_url)}" alt="" class="rounded mb-2 object-fit-cover w-100" style="height:80px;" />
          <div class="small text-truncate mb-1">${escapeHtml(h.caption || h.image_url)}</div>
          <button type="button" class="btn btn-outline-danger btn-sm py-0 px-2" onclick="deleteHeroImage(${h.id})">Remove</button>
        </div>
      </div>
    `).join("") || `<div class="col-12 small text-muted">No hero images configured.</div>`;
  }

  const annBody = document.getElementById("adminAnnBody");
  if (annBody) {
    annBody.innerHTML = (siteContent.announcements || []).map(a => `
      <tr>
        <td class="small fw-semibold">${escapeHtml(a.category)}</td>
        <td>
          <div class="small fw-bold">${escapeHtml(a.title)}</div>
          <div class="small text-muted">${escapeHtml(a.body)}</div>
        </td>
        <td>
          <div class="form-check form-switch">
            <input class="form-check-input" type="checkbox" ${a.show_on_banner ? "checked" : ""} onchange="toggleBanner(${a.id}, this.checked)" />
          </div>
        </td>
        <td class="text-end">
          <button type="button" class="btn btn-outline-danger btn-sm py-0 px-2" onclick="deleteAnnouncement(${a.id})">Delete</button>
        </td>
      </tr>
    `).join("");
  }

  const faqBody = document.getElementById("adminFaqBody");
  if (faqBody) {
    faqBody.innerHTML = (siteContent.faqs || []).map(f => `
      <tr>
        <td class="small fw-semibold">${escapeHtml(f.question)}</td>
        <td class="small text-muted">${escapeHtml(f.answer)}</td>
        <td class="text-end">
          <button type="button" class="btn btn-outline-danger btn-sm py-0 px-2" onclick="deleteFaq(${f.id})">Delete</button>
        </td>
      </tr>
    `).join("");
  }
}

async function toggleBanner(id, showOnBanner) {
  if (useBackend) {
    await fetch(`/api/admin/announcements/${id}/banner`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ showOnBanner })
    });
  } else {
    const target = siteContent.announcements.find(a => a.id === id);
    if (target) target.show_on_banner = showOnBanner ? 1 : 0;
    localStorage.setItem("rl_portal_content_v1", JSON.stringify(siteContent));
  }
  showToast(showOnBanner ? "Announcement pinned to home banner!" : "Removed from home banner.");
  await loadSiteContent();
}

async function deleteAnnouncement(id) {
  if (useBackend) {
    await fetch(`/api/admin/announcements/${id}`, { method: "DELETE" });
  } else {
    siteContent.announcements = siteContent.announcements.filter(a => a.id !== id);
    localStorage.setItem("rl_portal_content_v1", JSON.stringify(siteContent));
  }
  showToast("Announcement deleted.");
  await loadSiteContent();
}

async function deleteFaq(id) {
  if (useBackend) {
    await fetch(`/api/admin/faqs/${id}`, { method: "DELETE" });
  } else {
    siteContent.faqs = siteContent.faqs.filter(f => f.id !== id);
    localStorage.setItem("rl_portal_content_v1", JSON.stringify(siteContent));
  }
  showToast("FAQ deleted.");
  await loadSiteContent();
}

async function deleteHeroImage(id) {
  if (useBackend) {
    await fetch(`/api/admin/hero-images/${id}`, { method: "DELETE" });
  } else {
    siteContent.heroImages = siteContent.heroImages.filter(h => h.id !== id);
    localStorage.setItem("rl_portal_content_v1", JSON.stringify(siteContent));
  }
  showToast("Hero image removed.");
  await loadSiteContent();
}

const heroImgFormEl = document.getElementById("heroImageForm");
if (heroImgFormEl) {
  heroImgFormEl.addEventListener("submit", async e => {
    e.preventDefault();
    const file = document.getElementById("heroFileInput").files[0];
    const imageUrl = document.getElementById("heroUrlInput").value.trim();
    const caption = document.getElementById("heroCaptionInput").value.trim();
    let contentBase64 = null;
    let filename = "";
    if (file) {
      filename = file.name;
      contentBase64 = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(",")[1] || "");
        r.onerror = reject;
        r.readAsDataURL(file);
      });
    }
    if (useBackend) {
      const res = await fetch("/api/admin/hero-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl, caption, contentBase64, filename })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || "Could not add hero image.", "danger");
        return;
      }
    } else {
      if ((siteContent.heroImages || []).length >= 5) {
        showToast("Maximum of 5 hero images allowed.", "danger");
        return;
      }
      siteContent.heroImages.push({ id: Date.now(), image_url: imageUrl || "assets/rl/testSamplePics.jpg", caption });
      localStorage.setItem("rl_portal_content_v1", JSON.stringify(siteContent));
    }
    heroImgFormEl.reset();
    showToast("Hero image added!");
    await loadSiteContent();
  });
}

const annFormEl = document.getElementById("announcementForm");
if (annFormEl) {
  annFormEl.addEventListener("submit", async e => {
    e.preventDefault();
    const payload = {
      category: document.getElementById("annCategory").value.trim(),
      title: document.getElementById("annTitle").value.trim(),
      body: document.getElementById("annBody").value.trim(),
      showOnBanner: document.getElementById("annBannerCheck").checked
    };
    if (useBackend) {
      await fetch("/api/admin/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    } else {
      siteContent.announcements.unshift({ id: Date.now(), ...payload, show_on_banner: payload.showOnBanner ? 1 : 0 });
      localStorage.setItem("rl_portal_content_v1", JSON.stringify(siteContent));
    }
    annFormEl.reset();
    showToast("Announcement posted!");
    await loadSiteContent();
  });
}

const faqFormEl = document.getElementById("faqForm");
if (faqFormEl) {
  faqFormEl.addEventListener("submit", async e => {
    e.preventDefault();
    const payload = {
      question: document.getElementById("faqQuestion").value.trim(),
      answer: document.getElementById("faqAnswer").value.trim()
    };
    if (useBackend) {
      await fetch("/api/admin/faqs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    } else {
      siteContent.faqs.push({ id: Date.now(), ...payload });
      localStorage.setItem("rl_portal_content_v1", JSON.stringify(siteContent));
    }
    faqFormEl.reset();
    showToast("FAQ added!");
    await loadSiteContent();
  });
}

function askQuickChat(q) {
  const input = document.getElementById("chatInput");
  if (!input) return;
  input.value = q;
  sendChat({ preventDefault: () => {} });
}

function toggleChat() {
  const panel = document.getElementById("chatPanel");
  if (panel) panel.classList.toggle("open");
}

function loadPublicChat() {
  const box = document.getElementById("chatMessages");
  if (!box) return;
  const saved = JSON.parse(localStorage.getItem("rl_inquiry_chat_v1") || "[]");
  if (saved.length > 0) {
    box.innerHTML = saved.map(m => `<div class="chat-msg ${m.sender === "user" ? "user" : "bot"}">${escapeHtml(m.text)}</div>`).join("");
    box.scrollTop = box.scrollHeight;
  }
}

function savePublicChatMsg(sender, text) {
  const saved = JSON.parse(localStorage.getItem("rl_inquiry_chat_v1") || "[]");
  saved.push({ sender, text });
  localStorage.setItem("rl_inquiry_chat_v1", JSON.stringify(saved.slice(-40)));
}

function clearPublicChat() {
  localStorage.removeItem("rl_inquiry_chat_v1");
  const box = document.getElementById("chatMessages");
  if (box) {
    box.innerHTML = `<div class="chat-msg bot">Hi! Tap a quick topic below or ask a question about requirements, application stages, or how to apply.</div>`;
  }
}

function sendChat(e) {
  e.preventDefault();
  const input = document.getElementById("chatInput");
  const text = input.value.trim();
  if (!text) return;

  const box = document.getElementById("chatMessages");
  box.innerHTML += `<div class="chat-msg user">${escapeHtml(text)}</div>`;
  savePublicChatMsg("user", text);
  input.value = "";

  const q = text.toLowerCase();
  let reply = "Click 'Apply to the Program' to verify your email via OTP and submit your screening form, or 'Sign In' if you already applied.";
  const matchedFaq = (siteContent.faqs || []).find(f =>
    q.split(/\s+/).some(w => w.length > 3 && (f.question.toLowerCase().includes(w) || f.answer.toLowerCase().includes(w)))
  );
  if (matchedFaq) {
    reply = matchedFaq.answer;
  } else if (q.includes("grade") || q.includes("document") || q.includes("require")) {
    reply = "Prepare your last 3 years of grades, Birth Certificate, and proof of household income (ITR, Indigency, or payslips).";
  } else if (q.includes("status") || q.includes("stage") || q.includes("email")) {
    reply = "Stages: Unprocessed → For Verification → Shortlisted / Interview → House Visitation → Approved. Email updates are sent at every step.";
  } else if (q.includes("visit") || q.includes("map")) {
    reply = "Shortlisted applicants undergo a BGC center interview and house visitation before final scholarship approval.";
  }

  setTimeout(() => {
    box.innerHTML += `<div class="chat-msg bot">${escapeHtml(reply)}</div>`;
    savePublicChatMsg("bot", reply);
    box.scrollTop = box.scrollHeight;
  }, 250);
}

