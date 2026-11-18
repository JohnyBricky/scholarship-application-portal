// reports.js — Individual flattened PDF dossier & School Year demographics report

async function generateApplicantPdfReport(appId) {
  const a = applications.find(x => x.id === appId);
  if (!a) return;
  if (!(siteContent.requirementTypes || []).length) {
    await loadSiteContent();
  }
  const files = groupAndSortFiles(await fetchApplicantFiles(appId));
  const displayName = toNameCase(a.name);
  const photoTag = a.photoUrl
    ? `<img src="${escapeHtml(a.photoUrl)}" style="width:90px;height:90px;object-fit:cover;border-radius:10px;border:2px solid #71bf43;" />`
    : "";

  const filesRows = files.map(f => `
    <tr>
      <td>${escapeHtml(f.category)}</td>
      <td>v${escapeHtml(f.version)}</td>
      <td>${escapeHtml(f.reviewStatus || "PENDING")}</td>
      <td>${escapeHtml(f.reviewRemarks || "—")}</td>
      <td>${escapeHtml(f.originalName)}</td>
      <td>${escapeHtml(f.uploadedAt)}</td>
    </tr>
  `).join("") || `<tr><td colspan="6" style="text-align:center;">No files uploaded.</td></tr>`;

  // Pick latest version per category in Requirement Type Dictionary order, excluding ProfilePhoto
  const latestByCat = [];
  const seenCats = new Set();
  files.forEach(f => {
    if (f.category === "ProfilePhoto" || seenCats.has(f.category)) return;
    seenCats.add(f.category);
    latestByCat.push(f);
  });

  const flattenedBlocks = latestByCat.map((f, idx) => {
    const isFs = f.provider === "filesystem" && useBackend;
    const fileUrl = isFs ? `/api/files/${f.id}` : (f.storedPath || "");
    const lowerName = (f.originalName || f.storedPath || "").toLowerCase();
    const isPdf = lowerName.endsWith(".pdf");
    const isImg = /\.(png|jpe?g|webp|gif|bmp)$/i.test(lowerName);
    const title = `${f.category} (v${f.version}) — ${f.reviewStatus || "PENDING"}`;

    if (isFs && isImg) {
      return `
        <div class="doc-page">
          <h3>${escapeHtml(title)}</h3>
          <img src="${escapeHtml(fileUrl)}" style="max-width:100%;max-height:860px;object-fit:contain;border:1px solid #cbd5e1;" />
        </div>`;
    }
    if (isFs && isPdf) {
      return `
        <div class="doc-page">
          <h3>${escapeHtml(title)}</h3>
          <div class="pdf-render-target" data-url="${escapeHtml(fileUrl)}" id="pdfTarget_${idx}">Rendering PDF pages...</div>
        </div>`;
    }
    return `
      <div class="doc-page">
        <h3>${escapeHtml(title)}</h3>
        <p style="font-size:13px;">Reference: <a href="${escapeHtml(fileUrl)}" target="_blank">${escapeHtml(fileUrl || f.originalName)}</a></p>
      </div>`;
  }).join("");

  const logsHtml = (a.emailLogs || []).map(l => `<li>${escapeHtml(l)}</li>`).join("") || "<li>No logs</li>";
  const win = window.open("", "_blank", "width=960,height=800");
  if (!win) {
    showToast("Please allow popups to generate the PDF report.", "warning");
    return;
  }
  win.document.write(`<!doctype html><html><head><title>${escapeHtml(displayName)} — Applicant Report</title>
    <style>
      body { font-family: Segoe UI, Arial, sans-serif; color: #1e293b; margin: 28px; }
      .hdr { display:flex; justify-content:space-between; align-items:center; border-bottom:3px solid #71bf43; padding-bottom:12px; margin-bottom:18px; }
      .grid { display:grid; grid-template-columns:1fr 1fr; gap:8px 18px; font-size:13px; margin-bottom:18px; }
      table { width:100%; border-collapse:collapse; font-size:12px; margin-bottom:18px; }
      th, td { border:1px solid #cbd5e1; padding:6px 8px; text-align:left; }
      th { background:#f1f5f9; }
      h3 { margin:16px 0 8px; font-size:15px; color:#3f7d1c; }
      .doc-page { page-break-before: always; padding-top: 8px; }
      .flat-page-img { width: 100%; max-height: 920px; object-fit: contain; border: 1px solid #cbd5e1; margin-bottom: 10px; display: block; }
      @media print { .no-print { display:none; } }
    </style>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"><\/script>
  </head><body>
    <div class="hdr">
      <div>
        <h2 style="margin:0;">Real LIFE Foundation (BGC) — Individual Applicant Report</h2>
        <div style="font-size:12px;color:#64748b;">Generated: ${new Date().toLocaleString()}</div>
      </div>
      <div style="display:flex;align-items:center;gap:12px;">
        ${photoTag}
        <button class="no-print" onclick="window.print()" style="padding:8px 14px;background:#71bf43;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:600;">Print / Save PDF</button>
      </div>
    </div>
    <h3>Applicant Profile</h3>
    <div class="grid">
      <div><strong>Name:</strong> ${escapeHtml(displayName)}</div>
      <div><strong>Status:</strong> ${escapeHtml(STATUS_LABELS[a.status] || a.status)}</div>
      <div><strong>Email:</strong> ${escapeHtml(a.userEmail)}</div>
      <div><strong>Contact:</strong> ${escapeHtml(a.contact)}</div>
      <div><strong>Age:</strong> ${escapeHtml(a.age)}</div>
      <div><strong>School Year:</strong> ${escapeHtml(a.schoolYear)}</div>
      <div><strong>Course / Strand:</strong> ${escapeHtml(a.course)}</div>
      <div><strong>3-Yr Average GPA:</strong> ${escapeHtml(a.gpa)}%</div>
      <div><strong>Household Income:</strong> ${escapeHtml(a.income)}</div>
      <div><strong>Barangay / Area:</strong> ${escapeHtml(a.area)}</div>
      <div style="grid-column:span 2;"><strong>Address:</strong> ${escapeHtml(a.address)} ${(a.lat && a.lng) ? `(${a.lat}, ${a.lng})` : ""}</div>
      <div style="grid-column:span 2;"><strong>Assigned Visitation Staff:</strong> ${escapeHtml((a.assignedStaff || []).join(", ") || "Unassigned")}</div>
    </div>
    <h3>Compiled Requirement Files</h3>
    <table><thead><tr><th>Category</th><th>Version</th><th>Status</th><th>Remarks</th><th>File</th><th>Uploaded</th></tr></thead><tbody>${filesRows}</tbody></table>
    <h3>Notification &amp; Status History</h3>
    <ul style="font-size:12px;">${logsHtml}</ul>
    ${flattenedBlocks}
    <script>
      (async function flattenPdfs() {
        const targets = document.querySelectorAll('.pdf-render-target');
        if (!targets.length || typeof pdfjsLib === 'undefined') return;
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        for (const el of targets) {
          try {
            const pdf = await pdfjsLib.getDocument(el.dataset.url).promise;
            el.innerHTML = '';
            for (let p = 1; p <= pdf.numPages; p++) {
              const page = await pdf.getPage(p);
              const viewport = page.getViewport({ scale: 1.5 });
              const canvas = document.createElement('canvas');
              canvas.width = viewport.width;
              canvas.height = viewport.height;
              await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
              const img = document.createElement('img');
              img.src = canvas.toDataURL('image/png');
              img.className = 'flat-page-img';
              el.appendChild(img);
            }
          } catch (err) {
            el.textContent = 'Could not flatten PDF preview: ' + err.message;
          }
        }
      })();
    <\/script>
  </body></html>`);
  win.document.close();
}

let syCharts = [];

function openSchoolYearReportModal() {
  const modalEl = document.getElementById("schoolYearReportModal");
  if (!modalEl) return;
  const total = applications.length;
  const avgGpa = total ? (applications.reduce((s, a) => s + Number(a.gpa || 0), 0) / total).toFixed(2) : "0.00";
  const approved = applications.filter(a => a.status === "APPROVED").length;
  const atRisk = applications.filter(a => a.atRisk).length;

  document.getElementById("syReportSummary").innerHTML = [
    ["Total Applicants", total, "text-dark"],
    ["Average GPA", `${avgGpa}%`, "text-primary"],
    ["Approved Scholars", approved, "text-success"],
    ["At Risk (Incomplete)", atRisk, "text-danger"]
  ].map(([lbl, val, cls]) => `
    <div class="col-6 col-md-3">
      <div class="border rounded p-3 text-center bg-light">
        <div class="fs-4 fw-bold ${cls}">${val}</div>
        <div class="small text-muted">${lbl}</div>
      </div>
    </div>
  `).join("");

  document.getElementById("syReportTableBody").innerHTML = applications.map(a => `
    <tr>
      <td class="small fw-semibold">${escapeHtml(toNameCase(a.name))}</td>
      <td class="small">${escapeHtml(a.schoolYear)}</td>
      <td class="small">${escapeHtml(a.course)}</td>
      <td class="small">${escapeHtml(a.gpa)}%</td>
      <td class="small">${escapeHtml(a.income)}</td>
      <td class="small">${escapeHtml(a.area)}</td>
      <td class="small">${escapeHtml(STATUS_LABELS[a.status] || a.status)}</td>
    </tr>
  `).join("");

  syCharts.forEach(c => c.destroy());
  syCharts = [];

  if (typeof Chart !== "undefined") {
    const countBy = keyFn => {
      const map = {};
      applications.forEach(a => {
        const k = keyFn(a) || "Unspecified";
        map[k] = (map[k] || 0) + 1;
      });
      return [Object.keys(map), Object.values(map)];
    };
    const palette = ["#71bf43", "#38bdf8", "#f59e0b", "#8b5cf6", "#ef4444", "#10b981", "#64748b"];
    const mkChart = (id, type, [labels, data]) => {
      const ctx = document.getElementById(id);
      if (!ctx) return;
      syCharts.push(new Chart(ctx, {
        type,
        data: { labels, datasets: [{ data, backgroundColor: palette }] },
        options: { plugins: { legend: { display: type !== "bar", position: "bottom" } }, responsive: true }
      }));
    };
    mkChart("chartStatus", "doughnut", countBy(a => STATUS_LABELS[a.status] || a.status));
    mkChart("chartIncome", "bar", countBy(a => a.income));
    mkChart("chartArea", "bar", countBy(a => (a.area || "").split(" - ")[0]));
    mkChart("chartLevel", "pie", countBy(a => (a.schoolYear || "").replace(/^SY\s+\d{4}-\d{4}\s*/, "")));
  }

  new bootstrap.Modal(modalEl).show();
}

function printSchoolYearReport() {
  const total = applications.length;
  const avgGpa = total ? (applications.reduce((s, a) => s + Number(a.gpa || 0), 0) / total).toFixed(2) : "0.00";
  const approved = applications.filter(a => a.status === "APPROVED").length;
  const atRisk = applications.filter(a => a.atRisk).length;

  const chartImg = (id, title) => {
    const c = document.getElementById(id);
    if (!c) return "";
    return `<div class="chart-box"><h4>${title}</h4><img src="${c.toDataURL("image/png")}" /></div>`;
  };

  const rowsHtml = applications.map(a => `
    <tr>
      <td>${escapeHtml(toNameCase(a.name))}</td>
      <td>${escapeHtml(a.schoolYear)}</td>
      <td>${escapeHtml(a.course)}</td>
      <td>${escapeHtml(a.gpa)}%</td>
      <td>${escapeHtml(a.income)}</td>
      <td>${escapeHtml(a.area)}</td>
      <td>${escapeHtml(STATUS_LABELS[a.status] || a.status)}</td>
    </tr>
  `).join("") || `<tr><td colspan="7" style="text-align:center;">No applicants found.</td></tr>`;

  const win = window.open("", "_blank", "width=1020,height=800");
  if (!win) {
    showToast("Please allow popups to generate the PDF report.", "warning");
    return;
  }
  win.document.write(`<!doctype html><html><head><title>School Year Applicants &amp; Demographics Report</title>
    <style>
      body { font-family: Segoe UI, Arial, sans-serif; color: #1e293b; margin: 28px; }
      .hdr { display:flex; justify-content:space-between; align-items:center; border-bottom:3px solid #71bf43; padding-bottom:12px; margin-bottom:18px; }
      .kpis { display:grid; grid-template-columns:repeat(4, 1fr); gap:12px; margin-bottom:20px; }
      .kpi { border:1px solid #cbd5e1; border-radius:8px; padding:12px; text-align:center; background:#f8fafc; }
      .kpi .val { font-size:22px; font-weight:700; }
      .kpi .lbl { font-size:12px; color:#64748b; }
      .charts { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:22px; }
      .chart-box { border:1px solid #cbd5e1; border-radius:8px; padding:12px; text-align:center; break-inside:avoid; }
      .chart-box h4 { margin:0 0 8px; font-size:13px; color:#3f7d1c; }
      .chart-box img { max-width:100%; max-height:240px; }
      table { width:100%; border-collapse:collapse; font-size:12px; }
      th, td { border:1px solid #cbd5e1; padding:6px 8px; text-align:left; }
      th { background:#f1f5f9; }
      @media print { .no-print { display:none; } }
    </style></head><body>
    <div class="hdr">
      <div>
        <h2 style="margin:0;">Real LIFE Foundation (BGC) — School Year Applicants &amp; Demographics Report</h2>
        <div style="font-size:12px;color:#64748b;">Generated: ${new Date().toLocaleString()}</div>
      </div>
      <button class="no-print" onclick="window.print()" style="padding:8px 14px;background:#71bf43;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:600;">Print / Save PDF</button>
    </div>
    <div class="kpis">
      <div class="kpi"><div class="val">${total}</div><div class="lbl">Total Applicants</div></div>
      <div class="kpi"><div class="val">${avgGpa}%</div><div class="lbl">Average GPA</div></div>
      <div class="kpi"><div class="val">${approved}</div><div class="lbl">Approved Scholars</div></div>
      <div class="kpi"><div class="val">${atRisk}</div><div class="lbl">At Risk (Incomplete)</div></div>
    </div>
    <div class="charts">
      ${chartImg("chartStatus", "Applicants by Status Tag")}
      ${chartImg("chartIncome", "Household Income Demographics")}
      ${chartImg("chartArea", "Geographic Distribution (City / Area)")}
      ${chartImg("chartLevel", "Incoming School Year / Level")}
    </div>
    <h3 style="margin:0 0 8px;font-size:15px;color:#3f7d1c;">Applicant Roster Summary</h3>
    <table><thead><tr><th>Name</th><th>Level</th><th>Course</th><th>GPA</th><th>Income</th><th>Area</th><th>Status</th></tr></thead><tbody>${rowsHtml}</tbody></table>
  </body></html>`);
  win.document.close();
  setTimeout(() => win.print(), 350);
}

