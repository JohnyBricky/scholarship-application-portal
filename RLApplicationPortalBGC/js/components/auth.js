// auth.js — Sign-in, OTP login, password strength, registration & register-and-apply

let localLoginOtp = null;

const otpLoginSendEl = document.getElementById("otpLoginSendForm");
if (otpLoginSendEl) {
  otpLoginSendEl.addEventListener("submit", async e => {
    e.preventDefault();
    const errEl = document.getElementById("otpLoginError");
    const noticeEl = document.getElementById("otpLoginNotice");
    errEl.classList.add("d-none");
    noticeEl.classList.add("d-none");
    const email = document.getElementById("otpLoginEmail").value.trim().toLowerCase();

    if (useBackend) {
      const res = await fetch("/api/auth/login-otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        errEl.textContent = data.error || "Could not send login OTP.";
        errEl.classList.remove("d-none");
        return;
      }
      noticeEl.textContent = data.emailSent
        ? `OTP sent to ${email}. Check your inbox.`
        : `OTP generated for ${email}. (Local preview code: ${data.demoOtp})`;
      noticeEl.classList.remove("d-none");
      document.getElementById("otpLoginVerifyForm").classList.remove("d-none");
      return;
    }

    const users = JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS) || "[]");
    if (!users.some(u => u.email.toLowerCase() === email)) {
      errEl.textContent = "No account found with this email.";
      errEl.classList.remove("d-none");
      return;
    }
    const code = String(Math.floor(100000 + Math.random() * 900000));
    localLoginOtp = { email, code };
    noticeEl.textContent = `Demo OTP for ${email}: ${code}`;
    noticeEl.classList.remove("d-none");
    document.getElementById("otpLoginVerifyForm").classList.remove("d-none");
  });
}

const otpLoginVerifyEl = document.getElementById("otpLoginVerifyForm");
if (otpLoginVerifyEl) {
  otpLoginVerifyEl.addEventListener("submit", async e => {
    e.preventDefault();
    const errEl = document.getElementById("otpLoginError");
    errEl.classList.add("d-none");
    const email = document.getElementById("otpLoginEmail").value.trim().toLowerCase();
    const code = document.getElementById("otpLoginCode").value.trim();

    if (useBackend) {
      const res = await fetch("/api/auth/login-otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        errEl.textContent = data.error || "Invalid or expired OTP.";
        errEl.classList.remove("d-none");
        return;
      }
      currentUser = data;
      localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(currentUser));
      redirectAfterAuth(currentUser);
      return;
    }

    if (!localLoginOtp || localLoginOtp.email !== email || localLoginOtp.code !== code) {
      errEl.textContent = "Invalid OTP code.";
      errEl.classList.remove("d-none");
      return;
    }
    const users = JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS) || "[]");
    const found = users.find(u => u.email.toLowerCase() === email);
    currentUser = { name: found.name, email: found.email, role: found.role };
    localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(currentUser));
    redirectAfterAuth(currentUser);
  });
}

function evaluatePasswordStrength(pw) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[a-z]/.test(pw)) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return score;
}

function updatePasswordStrength() {
  const pw = document.getElementById("newPortalPass")?.value || "";
  const bar = document.getElementById("passStrengthBar");
  const txt = document.getElementById("passStrengthText");
  if (!bar || !txt) return;

  const score = evaluatePasswordStrength(pw);
  const pct = Math.min(100, score * 20);
  bar.style.width = `${pct}%`;
  if (!pw) {
    bar.className = "progress-bar bg-secondary";
    txt.textContent = "Use 8+ characters with a-z, A-Z, and 0-9.";
  } else if (score <= 2) {
    bar.className = "progress-bar bg-danger";
    txt.textContent = "Weak — add uppercase, lowercase, and numbers (8+ chars).";
  } else if (score === 3) {
    bar.className = "progress-bar bg-warning";
    txt.textContent = "Medium — almost there (include a-z, A-Z, 0-9, 8+ chars).";
  } else {
    bar.className = "progress-bar bg-success";
    txt.textContent = score >= 5 ? "Very Strong password!" : "Strong password!";
  }
}

const setPassEl = document.getElementById("setPasswordForm");
if (setPassEl) {
  setPassEl.addEventListener("submit", async e => {
    e.preventDefault();
    if (!currentUser) return;
    const fb = document.getElementById("setPassFeedback");
    const password = document.getElementById("newPortalPass").value;
    const confirmPw = document.getElementById("confirmPortalPass").value;

    if (password !== confirmPw) {
      fb.className = "small fw-semibold text-danger";
      fb.textContent = "Passwords do not match.";
      showToast("Passwords do not match.", "danger");
      return;
    }
    if (password.length < 8 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
      fb.className = "small fw-semibold text-danger";
      fb.textContent = "Password must be 8+ characters and include a-z, A-Z, and 0-9.";
      showToast("Password does not meet strength requirements.", "danger");
      return;
    }

    if (useBackend) {
      const res = await fetch("/api/auth/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: currentUser.email, password })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        fb.textContent = "";
        bootstrap.Modal.getInstance(document.getElementById("setPasswordModal"))?.hide();
        showToast("Password saved! You can now sign in with it.");
      } else {
        fb.className = "small fw-semibold text-danger";
        fb.textContent = data.error || "Failed to save password.";
        showToast(fb.textContent, "danger");
        return;
      }
    } else {
      const users = JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS) || "[]");
      const target = users.find(u => u.email.toLowerCase() === currentUser.email.toLowerCase());
      if (target) target.password = password;
      localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
      fb.textContent = "";
      bootstrap.Modal.getInstance(document.getElementById("setPasswordModal"))?.hide();
      showToast("Password saved!");
    }
    setPassEl.reset();
    updatePasswordStrength();
  });
}

const loginFormEl = document.getElementById("loginForm");
if (loginFormEl) {
  loginFormEl.addEventListener("submit", async e => {
    e.preventDefault();
    const email = document.getElementById("loginEmail").value.trim().toLowerCase();
    const password = document.getElementById("loginPassword").value;
    const errEl = document.getElementById("loginError");
    errEl.classList.add("d-none");

    if (useBackend) {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      if (res.ok) {
        currentUser = await res.json();
        localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(currentUser));
        redirectAfterAuth(currentUser);
        return;
      }
    } else {
      const users = JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS) || "[]");
      const found = users.find(u => u.email.toLowerCase() === email && u.password === password);
      if (found) {
        currentUser = { name: found.name, email: found.email, role: found.role };
        localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(currentUser));
        redirectAfterAuth(currentUser);
        return;
      }
    }
    errEl.textContent = "Invalid email or password.";
    errEl.classList.remove("d-none");
  });
}

let confirmedOtpEmail = null;
let localPendingOtp = null;

const sendOtpEl = document.getElementById("sendOtpForm");
if (sendOtpEl) {
  sendOtpEl.addEventListener("submit", async e => {
    e.preventDefault();
    const errEl = document.getElementById("otpError");
    errEl.classList.add("d-none");
    const email = document.getElementById("regEmail").value.trim().toLowerCase();

    if (useBackend) {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        errEl.textContent = data.error || "Could not send OTP.";
        errEl.classList.remove("d-none");
        return;
      }
      document.getElementById("otpNotice").textContent = data.emailSent
        ? `OTP sent to ${email}. Please check your inbox.`
        : `OTP generated for ${email}. (Local preview code: ${data.demoOtp})`;
      document.getElementById("otpVerifyBox").classList.remove("d-none");
      return;
    }

    const users = JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS) || "[]");
    if (users.some(u => u.email.toLowerCase() === email)) {
      errEl.textContent = "An account with this email already exists.";
      errEl.classList.remove("d-none");
      return;
    }
    const code = String(Math.floor(100000 + Math.random() * 900000));
    localPendingOtp = { email, code };
    document.getElementById("otpNotice").textContent = `OTP sent to ${email}. (Demo code: ${code})`;
    document.getElementById("otpVerifyBox").classList.remove("d-none");
  });
}

const verifyOtpEl = document.getElementById("verifyOtpForm");
if (verifyOtpEl) {
  verifyOtpEl.addEventListener("submit", async e => {
    e.preventDefault();
    const errEl = document.getElementById("otpError");
    errEl.classList.add("d-none");
    const email = document.getElementById("regEmail").value.trim().toLowerCase();
    const code = document.getElementById("otpCodeInput").value.trim();

    if (useBackend) {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        errEl.textContent = data.error || "Invalid or expired OTP code.";
        errEl.classList.remove("d-none");
        return;
      }
    } else if (!localPendingOtp || localPendingOtp.email !== email || localPendingOtp.code !== code) {
      errEl.textContent = "Invalid OTP code.";
      errEl.classList.remove("d-none");
      return;
    }

    confirmedOtpEmail = email;
    document.getElementById("regEmail").disabled = true;
    document.getElementById("sendOtpBtn").disabled = true;
    document.getElementById("otpVerifyBox").classList.add("d-none");
    document.getElementById("otpConfirmedBadge").classList.remove("d-none");
    document.getElementById("registerAndApplyForm").classList.remove("d-none");
    setTimeout(() => {
      initApplicantPinMap();
      applicantPinMap?.invalidateSize();
    }, 150);
  });
}

const regAndApplyEl = document.getElementById("registerAndApplyForm");
if (regAndApplyEl) {
  regAndApplyEl.addEventListener("submit", async e => {
    e.preventDefault();
    const errEl = document.getElementById("regError");
    errEl.classList.add("d-none");

    const email = confirmedOtpEmail || document.getElementById("regEmail").value.trim().toLowerCase();
    const payload = {
      email,
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
      driveLink: ""
    };

    if (useBackend) {
      const res = await fetch("/api/auth/register-and-apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        currentUser = await res.json();
        localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(currentUser));
        redirectAfterAuth(currentUser);
        return;
      }
      const err = await res.json().catch(() => ({}));
      errEl.textContent = err.error || "Could not submit application.";
      errEl.classList.remove("d-none");
      return;
    }

    const users = JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS) || "[]");
    if (users.some(u => u.email.toLowerCase() === email)) {
      errEl.textContent = "An account with this email already exists.";
      errEl.classList.remove("d-none");
      return;
    }
    users.push({ id: Date.now(), name: payload.name, email, password: "", role: "applicant" });
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));

    const nowStr = new Date().toISOString().slice(0, 16).replace("T", " ");
    const apps = JSON.parse(localStorage.getItem(STORAGE_KEYS.APPS) || "[]");
    apps.unshift({
      id: Date.now(),
      userEmail: email,
      name: payload.name,
      age: payload.age,
      schoolYear: payload.schoolYear,
      course: payload.course,
      gpa: payload.gpa,
      income: payload.income,
      contact: payload.contact,
      area: payload.area,
      address: payload.address,
      driveLink: "",
      status: "UNPROCESSED",
      updatedAt: nowStr,
      emailLogs: [`${nowStr}: Email confirmed via OTP. Application received (UNPROCESSED).`]
    });
    localStorage.setItem(STORAGE_KEYS.APPS, JSON.stringify(apps));

    currentUser = { name: payload.name, email, role: "applicant" };
    localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(currentUser));
    redirectAfterAuth(currentUser);
  });
}

const registerFormEl = document.getElementById("registerForm");
if (registerFormEl) {
  registerFormEl.addEventListener("submit", async e => {
    e.preventDefault();
    const name = document.getElementById("regName").value.trim();
    const email = document.getElementById("regEmail").value.trim().toLowerCase();
    const password = document.getElementById("regPassword").value;
    const errEl = document.getElementById("regError");
    errEl.classList.add("d-none");

    if (useBackend) {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password })
      });
      if (res.ok) {
        currentUser = await res.json();
        localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(currentUser));
        redirectAfterAuth(currentUser);
        return;
      }
      const err = await res.json().catch(() => ({}));
      errEl.textContent = err.error || "Could not create account.";
      errEl.classList.remove("d-none");
      return;
    }

    const users = JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS) || "[]");
    if (users.some(u => u.email.toLowerCase() === email)) {
      errEl.textContent = "An account with this email already exists.";
      errEl.classList.remove("d-none");
      return;
    }
    const newUser = { id: Date.now(), name, email, password, role: "applicant" };
    users.push(newUser);
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
    currentUser = { name, email, role: "applicant" };
    localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(currentUser));
    redirectAfterAuth(currentUser);
  });
}

