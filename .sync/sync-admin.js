// ===== EPL SALES HUB — ADMIN SYNC PANEL =====
// Self-contained admin override for the Admin tab when the backend isn't reachable.
// Provides:
//   1. A simple password gate (local, hardcoded hash)
//   2. Two file dropzones (Client Activity Report + Received Payments)
//   3. Client-side CSV/XLSX parsing → per-rep MTD totals
//   4. One-click "Publish to team" that commits payments.json via GitHub API (with admin PAT)
//
// The admin enters a GitHub Personal Access Token once per browser session.
// Token is stored in localStorage only, never sent anywhere except api.github.com.

(function() {
  'use strict';

  // === Configuration ===
  var ADMIN_PASSWORD_SHA256 = '2560766fc02b427a01dd0323ffafbaff45476a727ef3cc6a3a024e7784c277a3'; // "5757"
  var REPO_OWNER = 'heather-equine';
  var REPO_NAME = 'EPL-Sales-Hub';
  var REPO_BRANCH = 'gh-pages';
  var PAYMENTS_FILE_PATH = 'payments.json';
  var PAT_STORAGE_KEY = 'epl_admin_pat';
  var AUTH_STORAGE_KEY = 'epl_admin_authed';

  // === Utilities ===
  function sha256(text) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then(function(buf) {
      return Array.from(new Uint8Array(buf)).map(function(b){return b.toString(16).padStart(2,'0');}).join('');
    });
  }

  function base64ToStr(b64) { return decodeURIComponent(escape(atob(b64))); }
  function strToBase64(str) { return btoa(unescape(encodeURIComponent(str))); }

  function fmtMoney(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
  function todayISO() { return new Date().toISOString().slice(0, 10); }

  // === CSV Parser (simple, handles quoted fields with commas) ===
  function parseCSV(text) {
    // Remove BOM
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    var rows = [];
    var row = [];
    var field = '';
    var inQuotes = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i+1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else field += c;
      } else {
        if (c === '"') inQuotes = true;
        else if (c === ',') { row.push(field); field = ''; }
        else if (c === '\r') { /* skip */ }
        else if (c === '\n') { row.push(field); field = ''; rows.push(row); row = []; }
        else field += c;
      }
    }
    if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
    return rows;
  }

  function rowsToObjects(rows) {
    if (rows.length < 2) return [];
    var headers = rows[0].map(function(h) { return h.trim(); });
    return rows.slice(1).filter(function(r) { return r.length >= headers.length && r.some(function(v){return v && v.trim();}); }).map(function(r) {
      var o = {};
      for (var i = 0; i < headers.length; i++) o[headers[i]] = r[i] !== undefined ? r[i].trim() : '';
      return o;
    });
  }

  // === Payment Aggregation ===
  function aggregatePayments(paymentsObjs, activityObjs) {
    // Map rep names to keys
    var repMap = { 'Karin Williamson': 'karin', 'Megan Smith': 'megan', 'Drew Howard': 'drew' };
    var repsOut = {};
    var rawPayments = [];

    paymentsObjs.forEach(function(p) {
      if ((p['Payment Status'] || '').toUpperCase() !== 'PAID') return;
      var repName = (p['Rep Name'] || '').trim();
      var repKey = repMap[repName];
      if (!repKey) return;
      var amount = parseFloat((p['Payment Amount'] || '0').replace(/[^0-9.-]/g, '')) || 0;
      var dateStr = (p['Payment Date'] || '').trim();
      if (!dateStr || !amount) return;
      // Parse M/D/YYYY
      var m = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (!m) return;
      var month = parseInt(m[1]), day = parseInt(m[2]), year = parseInt(m[3]);
      var monthKey = year + '-' + (month < 10 ? '0' : '') + month;
      var isoDate = year + '-' + (month < 10 ? '0' : '') + month + '-' + (day < 10 ? '0' : '') + day;

      if (!repsOut[repKey]) repsOut[repKey] = { name: repName, mtdCollected: 0, monthlyActuals: {} };
      // Determine current month (latest in file)
      var today = new Date();
      var curMonth = today.getMonth() + 1;
      var curYear = today.getFullYear();
      var monthName = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][month - 1];
      if (year === curYear && month === curMonth) {
        repsOut[repKey].mtdCollected += amount;
      }
      if (!repsOut[repKey].monthlyActuals[monthName]) {
        repsOut[repKey].monthlyActuals[monthName] = { collected: 0, isActual: false, inProgress: (year === curYear && month === curMonth) };
      }
      repsOut[repKey].monthlyActuals[monthName].collected += amount;

      rawPayments.push({
        rep: repKey,
        invoice: p['INV#'] || '',
        customer: p['Customer Name'] || '',
        amount: amount,
        paymentDate: isoDate
      });
    });

    // Add activity aggregates
    (activityObjs || []).forEach(function(a) {
      var repName = (a['Assigned Rep'] || '').trim();
      var repKey = repMap[repName];
      if (!repKey || !repsOut[repKey]) return;
      repsOut[repKey].ytdVialsOrdered = (repsOut[repKey].ytdVialsOrdered || 0) + (parseInt(a['Total Vials Ordered']) || 0);
      repsOut[repKey].ytdPaid = (repsOut[repKey].ytdPaid || 0) + (parseFloat(a['Total Paid']) || 0);
    });

    var today = new Date();
    return {
      lastUpdated: todayISO(),
      uploadedAt: todayISO(),
      asOfDay: today.getDate(),
      currentMonth: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][today.getMonth()],
      year: today.getFullYear(),
      reps: repsOut,
      payments: rawPayments
    };
  }

  // === GitHub API ===
  function getPAT() { return localStorage.getItem(PAT_STORAGE_KEY); }
  function setPAT(pat) { localStorage.setItem(PAT_STORAGE_KEY, pat); }
  function clearPAT() { localStorage.removeItem(PAT_STORAGE_KEY); }

  function githubRequest(path, opts) {
    opts = opts || {};
    var pat = getPAT();
    if (!pat) return Promise.reject(new Error('No GitHub token set. Click "Configure token" first.'));
    opts.headers = Object.assign({
      'Authorization': 'Bearer ' + pat,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }, opts.headers || {});
    return fetch('https://api.github.com' + path, opts).then(function(r) {
      if (!r.ok) return r.json().then(function(j) { throw new Error(j.message || ('GitHub API ' + r.status)); });
      return r.json();
    });
  }

  function publishPayments(data) {
    var path = '/repos/' + REPO_OWNER + '/' + REPO_NAME + '/contents/' + PAYMENTS_FILE_PATH;
    // Get current file SHA first
    return githubRequest(path + '?ref=' + REPO_BRANCH, { method: 'GET' })
      .then(function(current) {
        var contentStr = JSON.stringify(data, null, 2);
        var body = {
          message: 'Update payments.json — ' + data.lastUpdated + ' (auto-sync from admin)',
          content: strToBase64(contentStr),
          sha: current.sha,
          branch: REPO_BRANCH
        };
        return githubRequest(path, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
      });
  }

  // === UI Builder ===
  function buildSyncPanel() {
    var panel = document.createElement('div');
    panel.id = 'epl-sync-panel';
    panel.style.cssText = 'max-width:960px;margin:40px auto;padding:32px;font-family:system-ui,-apple-system,sans-serif;color:#1a1a1a;background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.05);border:1px solid #e5e5e5;';

    panel.innerHTML = [
      '<div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">',
      '  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#2d7a5c" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
      '  <h2 style="margin:0;font-size:24px;font-weight:700;">Admin Sync Panel</h2>',
      '</div>',
      '<p style="margin:0 0 24px;color:#666;font-size:14px;">Upload weekly reports → auto-publishes to team via GitHub.</p>',

      '<div id="epl-token-status" style="padding:12px 16px;border-radius:8px;margin-bottom:24px;font-size:14px;"></div>',

      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px;">',
      '  <div class="epl-drop" id="epl-drop-activity" data-kind="activity" style="border:2px dashed #d4d4d4;border-radius:10px;padding:24px;text-align:center;cursor:pointer;transition:all 0.2s;">',
      '    <div style="font-size:32px;margin-bottom:8px;">📊</div>',
      '    <div style="font-weight:600;font-size:14px;margin-bottom:4px;">Client Activity Report</div>',
      '    <div style="font-size:12px;color:#888;">CLIENT_ACTIVITY_Report_*.csv</div>',
      '    <div id="epl-drop-activity-status" style="margin-top:8px;font-size:12px;color:#2d7a5c;font-weight:500;"></div>',
      '  </div>',
      '  <div class="epl-drop" id="epl-drop-payments" data-kind="payments" style="border:2px dashed #d4d4d4;border-radius:10px;padding:24px;text-align:center;cursor:pointer;transition:all 0.2s;">',
      '    <div style="font-size:32px;margin-bottom:8px;">💰</div>',
      '    <div style="font-weight:600;font-size:14px;margin-bottom:4px;">Received Payments</div>',
      '    <div style="font-size:12px;color:#888;">Received_Payments_*.csv</div>',
      '    <div id="epl-drop-payments-status" style="margin-top:8px;font-size:12px;color:#2d7a5c;font-weight:500;"></div>',
      '  </div>',
      '</div>',

      '<div id="epl-preview" style="display:none;background:#f9fafb;border:1px solid #e5e5e5;border-radius:8px;padding:16px;margin-bottom:24px;"></div>',

      '<div style="display:flex;gap:12px;align-items:center;">',
      '  <button id="epl-publish-btn" disabled style="padding:12px 24px;background:#2d7a5c;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;opacity:0.5;">Publish to team</button>',
      '  <button id="epl-token-btn" style="padding:12px 16px;background:transparent;color:#2d7a5c;border:1.5px solid #2d7a5c;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;">Configure GitHub token</button>',
      '  <button id="epl-logout-btn" style="padding:12px 16px;background:transparent;color:#999;border:1.5px solid #ddd;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;margin-left:auto;">Sign out</button>',
      '</div>',

      '<div id="epl-result" style="margin-top:16px;padding:12px 16px;border-radius:8px;display:none;"></div>'
    ].join('');

    return panel;
  }

  function updateTokenStatus() {
    var el = document.getElementById('epl-token-status');
    if (!el) return;
    if (getPAT()) {
      el.innerHTML = '✓ GitHub token configured — ready to publish.';
      el.style.background = '#f0fdf4';
      el.style.color = '#166534';
      el.style.border = '1px solid #bbf7d0';
    } else {
      el.innerHTML = '⚠ No GitHub token set. Click <strong>Configure GitHub token</strong> to enable publishing. <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" style="color:inherit;text-decoration:underline;">Create a fine-grained PAT</a> scoped to repo contents:write on EPL-Sales-Hub.';
      el.style.background = '#fffbeb';
      el.style.color = '#854d0e';
      el.style.border = '1px solid #fde68a';
    }
  }

  // === Dropzone wiring ===
  var uploadedActivity = null;
  var uploadedPayments = null;
  var aggregatedData = null;

  function processFile(file, kind) {
    return new Promise(function(resolve, reject) {
      var reader = new FileReader();
      reader.onload = function() {
        try {
          var text = reader.result;
          var rows = parseCSV(text);
          var objects = rowsToObjects(rows);
          resolve(objects);
        } catch (e) { reject(e); }
      };
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }

  function wireDropzones() {
    ['activity', 'payments'].forEach(function(kind) {
      var zone = document.getElementById('epl-drop-' + kind);
      var status = document.getElementById('epl-drop-' + kind + '-status');
      if (!zone) return;

      function handleFile(file) {
        status.textContent = 'Parsing ' + file.name + '...';
        status.style.color = '#666';
        processFile(file, kind).then(function(objects) {
          status.textContent = '✓ ' + file.name + ' (' + objects.length + ' rows)';
          status.style.color = '#2d7a5c';
          zone.style.borderColor = '#2d7a5c';
          zone.style.background = '#f0fdf4';
          if (kind === 'activity') uploadedActivity = objects;
          else uploadedPayments = objects;
          tryAggregate();
        }).catch(function(e) {
          status.textContent = '✗ Error: ' + e.message;
          status.style.color = '#dc2626';
        });
      }

      zone.addEventListener('click', function() {
        var input = document.createElement('input');
        input.type = 'file';
        input.accept = '.csv,.xlsx';
        input.onchange = function(e) { if (e.target.files[0]) handleFile(e.target.files[0]); };
        input.click();
      });
      zone.addEventListener('dragover', function(e) { e.preventDefault(); zone.style.borderColor = '#2d7a5c'; });
      zone.addEventListener('dragleave', function(e) { zone.style.borderColor = '#d4d4d4'; });
      zone.addEventListener('drop', function(e) {
        e.preventDefault();
        if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
      });
    });
  }

  function tryAggregate() {
    if (!uploadedPayments) return;
    aggregatedData = aggregatePayments(uploadedPayments, uploadedActivity || []);

    var preview = document.getElementById('epl-preview');
    var html = '<div style="font-size:13px;color:#666;margin-bottom:8px;font-weight:600;">PREVIEW — This is what will publish to payments.json:</div>';
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;">';
    Object.keys(aggregatedData.reps).forEach(function(key) {
      var rep = aggregatedData.reps[key];
      html += '<div style="padding:12px;background:#fff;border:1px solid #e5e5e5;border-radius:6px;">';
      html += '<div style="font-weight:600;font-size:14px;">' + rep.name + '</div>';
      html += '<div style="font-size:20px;font-weight:700;color:#2d7a5c;margin-top:4px;">' + fmtMoney(rep.mtdCollected) + '</div>';
      html += '<div style="font-size:12px;color:#888;">MTD collected (' + aggregatedData.currentMonth + ')</div>';
      html += '</div>';
    });
    html += '</div>';
    html += '<div style="font-size:12px;color:#888;margin-top:12px;">' + aggregatedData.payments.length + ' payment records · As of day ' + aggregatedData.asOfDay + '</div>';
    preview.innerHTML = html;
    preview.style.display = 'block';

    var btn = document.getElementById('epl-publish-btn');
    btn.disabled = false;
    btn.style.opacity = '1';
  }

  // === Main panel setup after admin auth ===
  function mountSyncPanel() {
    // Find the admin sign-in form and replace the whole admin tab body
    var existingPanel = document.getElementById('epl-sync-panel');
    if (existingPanel) return;

    // Look for the admin tab content container
    var signInBtns = Array.from(document.querySelectorAll('button')).filter(function(b) { return b.textContent.trim() === 'Sign In'; });
    if (!signInBtns.length) return;
    var signInContainer = signInBtns[0].closest('div[class*="min-h-screen"], main, div');
    // Go up a few levels to find the "Admin Access" card's parent
    var parent = signInBtns[0].parentElement;
    for (var i = 0; i < 6 && parent; i++) {
      if (parent.textContent.indexOf('Admin Access') > -1 || parent.textContent.indexOf('Data Upload') > -1) break;
      parent = parent.parentElement;
    }
    if (!parent) return;

    // Insert our sync panel AFTER the Admin Access card so it doesn't break other things when signed in
    var panel = buildSyncPanel();
    parent.parentElement.insertBefore(panel, parent.nextSibling);
    parent.style.display = 'none'; // hide the original sign-in card

    updateTokenStatus();
    wireDropzones();

    document.getElementById('epl-token-btn').addEventListener('click', function() {
      var current = getPAT();
      var next = prompt(
        'Paste your GitHub Personal Access Token:\n\n' +
        '1. Go to https://github.com/settings/personal-access-tokens/new\n' +
        '2. Fine-grained, scoped to EPL-Sales-Hub repo\n' +
        '3. Permission: Contents → Read and write\n' +
        '4. Copy the token and paste here.\n\n' +
        'The token is stored in your browser only (localStorage). Never committed, never sent anywhere except api.github.com.',
        current || ''
      );
      if (next === null) return;
      if (next.trim() === '') { clearPAT(); }
      else setPAT(next.trim());
      updateTokenStatus();
    });

    document.getElementById('epl-logout-btn').addEventListener('click', function() {
      sessionStorage.removeItem(AUTH_STORAGE_KEY);
      location.reload();
    });

    document.getElementById('epl-publish-btn').addEventListener('click', function() {
      if (!aggregatedData) return;
      if (!getPAT()) { alert('Please configure a GitHub token first.'); return; }
      var btn = this;
      btn.disabled = true;
      btn.textContent = 'Publishing...';
      btn.style.opacity = '0.6';
      publishPayments(aggregatedData).then(function(result) {
        var r = document.getElementById('epl-result');
        r.style.display = 'block';
        r.style.background = '#f0fdf4';
        r.style.color = '#166534';
        r.style.border = '1px solid #bbf7d0';
        r.innerHTML = '✓ Published successfully! <a href="' + result.commit.html_url + '" target="_blank" style="color:inherit;text-decoration:underline;">View commit</a> · Live at the dashboard within ~30 seconds.';
        btn.textContent = 'Published ✓';
      }).catch(function(e) {
        var r = document.getElementById('epl-result');
        r.style.display = 'block';
        r.style.background = '#fef2f2';
        r.style.color = '#991b1b';
        r.style.border = '1px solid #fecaca';
        r.innerHTML = '✗ Publish failed: ' + e.message;
        btn.disabled = false;
        btn.textContent = 'Publish to team';
        btn.style.opacity = '1';
      });
    });
  }

  // === Admin password gate override ===
  function wireLocalSignIn() {
    // Intercept the Sign In button click
    document.body.addEventListener('click', function(e) {
      if (!e.target || e.target.textContent.trim() !== 'Sign In') return;
      // Only act if we're on the Admin Access screen (no backend means sign-in hangs)
      var pwInput = document.querySelector('input[type="password"]');
      if (!pwInput) return;
      e.preventDefault();
      e.stopPropagation();

      sha256(pwInput.value).then(function(hash) {
        if (hash === ADMIN_PASSWORD_SHA256) {
          sessionStorage.setItem(AUTH_STORAGE_KEY, 'true');
          // Wait a beat then mount the sync panel
          setTimeout(mountSyncPanel, 200);
        } else {
          alert('Incorrect password.');
        }
      });
    }, true);
  }

  // === Monitor for admin tab activation ===
  var panelMounted = false;
  function checkAdminView() {
    if (sessionStorage.getItem(AUTH_STORAGE_KEY) !== 'true') return;
    // If "Admin Access" text is visible and our panel isn't, mount it
    var adminAccessVisible = document.body.innerText.indexOf('Admin Access') > -1;
    var panelExists = document.getElementById('epl-sync-panel');
    if (adminAccessVisible && !panelExists) {
      mountSyncPanel();
    }
  }

  // === Initialize ===
  function init() {
    wireLocalSignIn();
    // Periodically check if admin view is shown
    setInterval(checkAdminView, 1500);
    // Also mount immediately if already authed & on admin tab
    setTimeout(checkAdminView, 2000);
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }
})();
