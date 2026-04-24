// ===== EPL ACTIVITY SYNC =====
// Fetches activity.json from the repo and patches all Activity tab tables/cards
// to match the latest uploaded Client Activity Report + Received Payments data.

(function() {
  'use strict';

  var activityData = null;
  var paymentsData = null;

  function fmtMoney(n) {
    if (n === null || n === undefined || n === 0) return '$0';
    return '$' + Math.round(n).toLocaleString('en-US');
  }

  function fmtMoneyOrDash(n) {
    if (!n) return '—';
    return fmtMoney(n);
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    // Parse "M/D/YYYY" or ISO
    var d;
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(iso)) {
      var p = iso.split('/');
      d = new Date(parseInt(p[2]), parseInt(p[0]) - 1, parseInt(p[1]));
    } else {
      d = new Date(iso + 'T00:00:00');
    }
    if (isNaN(d)) return iso;
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
  }

  // Detect which rep is currently active
  function detectActiveRep() {
    // Admin override via in-page toggle takes highest priority
    if (window.__EPL_ADMIN_SELECTED_REP === 'karin' || window.__EPL_ADMIN_SELECTED_REP === 'megan') {
      return window.__EPL_ADMIN_SELECTED_REP;
    }
    // Check URL param first
    var params = new URLSearchParams(window.location.search);
    var urlRep = params.get('rep');
    if (urlRep === 'karin' || urlRep === 'megan') return urlRep;
    // Check heading text
    var h = document.querySelector('h1, h2, h3, h4');
    var bodyText = document.body.innerText;
    if (bodyText.indexOf('Karin Williamson') > -1 && bodyText.indexOf('Megan Smith') === -1) return 'karin';
    if (bodyText.indexOf('Megan Smith') > -1 && bodyText.indexOf('Karin Williamson') === -1) return 'megan';
    // Check tab button
    var karinBtn = Array.from(document.querySelectorAll('button')).find(function(b){return b.textContent.trim() === 'Karin';});
    if (karinBtn && getComputedStyle(karinBtn).backgroundColor.match(/rgb\((\d+),\s*(\d+)/)) {
      var m = getComputedStyle(karinBtn).backgroundColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)/);
      if (m && parseInt(m[1]) < 100 && parseInt(m[2]) > 80) return 'karin';
    }
    return 'karin'; // default
  }

  function isAdminView() {
    var params = new URLSearchParams(window.location.search);
    return params.get('admin') === 'true';
  }

  function isOnActivityTab() {
    // Heuristic: the Weekly Activity Recap heading is visible
    var headings = document.querySelectorAll('h1, h2, h3');
    for (var i = 0; i < headings.length; i++) {
      if (/Weekly Activity Recap/i.test(headings[i].textContent)) return headings[i];
    }
    return null;
  }

  function updateWeeklyHeader(repKey) {
    // Update 'Month-to-date through Mon D, YYYY · RepName'
    // The text may be split across multiple text nodes. Find the container of the
    // Weekly Activity Recap heading, then update any rep-name text node within the same block.
    var repName = repKey === 'megan' ? 'Megan Smith' : 'Karin Williamson';
    var recapHeading = isOnActivityTab();
    if (!recapHeading) return;
    // Walk up to find a container that includes both 'Month-to-date through' and rep name
    var container = recapHeading.parentElement;
    var tries = 0;
    while (container && tries < 6) {
      var txt = container.textContent || '';
      if (/Month-to-date through/i.test(txt) && /(Karin Williamson|Megan Smith)/.test(txt)) break;
      container = container.parentElement;
      tries++;
    }
    if (!container) return;
    // Walk text nodes within container and replace any rep name occurrences
    var w = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
    var node;
    while ((node = w.nextNode())) {
      var nTxt = node.textContent;
      if (/(Karin Williamson|Megan Smith)/.test(nTxt)) {
        node.textContent = nTxt.replace(/(Karin Williamson|Megan Smith)/g, repName);
      }
    }
    // Also update the date in 'Month-to-date through <date>' to the activity report date.
    // Text may be split: one node = "Month-to-date through ", next = "Apr 17, 2026", next = " · ".
    if (activityData && activityData.reportDate) {
      var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      var rptDate = new Date(activityData.reportDate + 'T00:00:00');
      var rptStr = months[rptDate.getMonth()] + ' ' + rptDate.getDate() + ', ' + rptDate.getFullYear();
      var dateRe = /[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}/;
      var w2 = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
      var nodes = [];
      var node2;
      while ((node2 = w2.nextNode())) nodes.push(node2);
      // Case A: one text node has both 'Month-to-date through' and a date
      var handledA = false;
      for (var a = 0; a < nodes.length; a++) {
        var ta = nodes[a].textContent;
        if (/Month-to-date through/i.test(ta) && dateRe.test(ta)) {
          nodes[a].textContent = ta.replace(dateRe, rptStr);
          handledA = true;
        }
      }
      // Case B: 'Month-to-date through' in one node, date in a later text node
      if (!handledA) {
        for (var b = 0; b < nodes.length; b++) {
          if (/Month-to-date through/i.test(nodes[b].textContent)) {
            // Find the next text node that contains a date
            for (var c = b + 1; c < Math.min(b + 6, nodes.length); c++) {
              var tc = nodes[c].textContent;
              if (dateRe.test(tc)) {
                nodes[c].textContent = tc.replace(dateRe, rptStr);
                break;
              }
            }
            break;
          }
        }
      }
    }
  }

  function injectAdminRepToggle() {
    if (!isAdminView()) return;
    if (document.getElementById('epl-admin-rep-toggle')) return; // already injected
    var recapHeading = isOnActivityTab();
    if (!recapHeading) return;
    // Insert toggle just after the Weekly Activity Recap heading block
    // Find the nearest ancestor that also wraps the subtitle
    var insertAfter = recapHeading.parentElement;
    // Walk up until we find a block that contains 'Month-to-date through'
    var tries = 0;
    while (insertAfter && tries < 5) {
      if (/Month-to-date through/i.test(insertAfter.textContent) && insertAfter !== document.body) break;
      insertAfter = insertAfter.parentElement;
      tries++;
    }
    if (!insertAfter) insertAfter = recapHeading.parentElement;

    var wrap = document.createElement('div');
    wrap.id = 'epl-admin-rep-toggle';
    wrap.style.cssText = 'display:flex;gap:8px;align-items:center;margin:12px 0 20px;padding:10px 14px;background:#f0f5f3;border:1px solid #d5e2dd;border-radius:10px;font-family:inherit;';
    var label = document.createElement('span');
    label.textContent = 'Admin view — show data for:';
    label.style.cssText = 'font-size:13px;color:#4a5f5a;font-weight:500;';
    wrap.appendChild(label);

    var current = window.__EPL_ADMIN_SELECTED_REP || detectActiveRep();

    [['karin', 'Karin Williamson'], ['megan', 'Megan Smith']].forEach(function(pair) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.rep = pair[0];
      btn.textContent = pair[1];
      var isActive = current === pair[0];
      btn.style.cssText = 'padding:6px 14px;border-radius:6px;border:1px solid ' + (isActive ? '#2f6b5b' : '#cfd8d4') + ';background:' + (isActive ? '#2f6b5b' : '#fff') + ';color:' + (isActive ? '#fff' : '#2f3b39') + ';font-size:13px;font-weight:500;cursor:pointer;transition:all 0.15s;';
      btn.addEventListener('click', function() {
        window.__EPL_ADMIN_SELECTED_REP = pair[0];
        // Re-style buttons
        wrap.querySelectorAll('button').forEach(function(b) {
          var active = b.dataset.rep === pair[0];
          b.style.background = active ? '#2f6b5b' : '#fff';
          b.style.color = active ? '#fff' : '#2f3b39';
          b.style.borderColor = active ? '#2f6b5b' : '#cfd8d4';
        });
        updateWeeklyHeader(pair[0]);
        patchAll();
      });
      wrap.appendChild(btn);
    });

    insertAfter.parentNode.insertBefore(wrap, insertAfter.nextSibling);

    // If admin hasn't explicitly chosen yet, default to Karin so view is consistent
    if (!window.__EPL_ADMIN_SELECTED_REP) {
      window.__EPL_ADMIN_SELECTED_REP = 'karin';
      updateWeeklyHeader('karin');
    }
  }

  // ===== Helpers for updating table rows =====
  function clearCellContent(cell) {
    // Keep any sub-text span (like "no change") but clear the main value
    // For simplicity: clear all and let caller set new
    cell.innerHTML = '';
  }

  function setCellText(cell, text) {
    cell.textContent = text;
  }

  // Find a table by checking its header text
  function findTableByHeaders(requiredHeaders) {
    var tables = document.querySelectorAll('table');
    for (var i = 0; i < tables.length; i++) {
      var head = tables[i].querySelector('thead');
      if (!head) continue;
      var ht = head.textContent.toUpperCase();
      var allMatch = requiredHeaders.every(function(h) { return ht.indexOf(h.toUpperCase()) > -1; });
      if (allMatch) return tables[i];
    }
    return null;
  }

  // Find a section by its label (MY TOP 5 ACCOUNTS, etc.) and return the first following table
  function findSectionTable(label) {
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    var node;
    while ((node = walker.nextNode())) {
      if (node.textContent.trim().toUpperCase() === label.toUpperCase()) {
        // Find the next table after this label
        var el = node.parentElement;
        for (var i = 0; i < 8 && el; i++) {
          var nextTable = el.nextElementSibling;
          while (nextTable) {
            var t = nextTable.querySelector ? (nextTable.tagName === 'TABLE' ? nextTable : nextTable.querySelector('table')) : null;
            if (t) return t;
            nextTable = nextTable.nextElementSibling;
          }
          // Look in siblings of parent
          if (el.parentElement) {
            var peers = el.parentElement.querySelectorAll('table');
            for (var j = 0; j < peers.length; j++) {
              // Make sure this table comes after the label
              if (peers[j].compareDocumentPosition(node) & Node.DOCUMENT_POSITION_PRECEDING) {
                return peers[j];
              }
            }
          }
          el = el.parentElement;
        }
      }
    }
    return null;
  }

  // Replace the tbody contents of a table with new rows
  function rebuildTableBody(table, rows) {
    if (!table) return;
    var tbody = table.querySelector('tbody');
    if (!tbody) return;

    // Preserve styling classes from the first existing row
    var sampleRow = tbody.querySelector('tr');
    var rowClass = sampleRow ? sampleRow.className : '';
    var sampleCells = sampleRow ? sampleRow.querySelectorAll('td') : null;
    var cellClasses = sampleCells ? Array.from(sampleCells).map(function(c){return c.className;}) : [];
    var cellStyles = sampleCells ? Array.from(sampleCells).map(function(c){return c.getAttribute('style') || '';}) : [];

    tbody.innerHTML = '';
    rows.forEach(function(rowData) {
      var tr = document.createElement('tr');
      if (rowClass) tr.className = rowClass;
      rowData.forEach(function(cellData, idx) {
        var td = document.createElement('td');
        if (cellClasses[idx]) td.className = cellClasses[idx];
        if (cellStyles[idx]) td.setAttribute('style', cellStyles[idx]);
        if (typeof cellData === 'string' || typeof cellData === 'number') {
          td.textContent = String(cellData);
        } else if (cellData && cellData.html) {
          td.innerHTML = cellData.html;
          if (cellData.style) {
            for (var k in cellData.style) td.style[k] = cellData.style[k];
          }
        } else {
          td.textContent = '';
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  }

  // ===== Patch Top 5 Accounts =====
  function patchTopAccounts(repKey) {
    var rep = activityData.repDetails[repKey];
    if (!rep) return;
    var table = findSectionTable('MY TOP 5 ACCOUNTS');
    if (!table) return;

    var rows = rep.topAccounts.map(function(c) {
      return [
        c.clinic,
        c.state,
        c.totalOrders,
        c.totalVials,
        fmtMoney(c.totalSpent),
        {
          html: fmtMoneyOrDash(c.outstanding),
          style: c.outstanding > 0 ? { color: '#d97706', fontWeight: '600' } : {}
        },
        fmtDate(c.lastOrder)
      ];
    });
    rebuildTableBody(table, rows);
  }

  // ===== Patch New Clients This Month =====
  function patchNewClients(repKey) {
    var rep = activityData.repDetails[repKey];
    if (!rep) return;
    var table = findSectionTable('NEW CLIENTS THIS MONTH');
    if (!table) return;

    var rows = rep.newClients.map(function(c) {
      return [
        c.clinic,
        c.state,
        fmtDate(c.firstOrder),
        c.totalOrders,
        c.totalVials,
        fmtMoney(c.totalSpent),
        {
          html: c.status,
          style: c.status === 'Active' ? {
            backgroundColor: '#d1fae5',
            color: '#065f46',
            padding: '2px 8px',
            borderRadius: '4px',
            fontWeight: '600',
            display: 'inline-block'
          } : {}
        }
      ];
    });
    rebuildTableBody(table, rows);
  }

  // ===== Patch Outstanding AR =====
  function patchOutstandingAR(repKey) {
    var rep = activityData.repDetails[repKey];
    if (!rep) return;
    var table = findSectionTable('MY OUTSTANDING AR');
    if (!table) return;

    var rows = rep.outstandingAR.map(function(c) {
      return [
        c.clinic,
        c.state,
        {
          html: fmtMoney(c.outstanding),
          style: { color: '#d97706', fontWeight: '600' }
        },
        c.daysSinceLastOrder,
        fmtDate(c.lastOrder)
      ];
    });
    rebuildTableBody(table, rows);
  }

  // ===== Patch At-Risk Accounts =====
  function patchAtRisk(repKey) {
    var rep = activityData.repDetails[repKey];
    if (!rep) return;
    // Heading has count: MY AT-RISK ACCOUNTS (N)
    // Find any section label starting with this prefix
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    var node, labelEl = null;
    while ((node = walker.nextNode())) {
      if (/MY AT-RISK ACCOUNTS/i.test(node.textContent)) {
        labelEl = node.parentElement;
        // Update count if in label
        var updated = node.textContent.replace(/\(\d+\)/, '(' + rep.atRiskAccounts.length + ')');
        if (updated !== node.textContent) node.textContent = updated;
        break;
      }
    }
    var table = findSectionTable('MY AT-RISK ACCOUNTS');
    if (!table) return;

    var rows = rep.atRiskAccounts.map(function(c) {
      return [
        c.clinic,
        c.state,
        {
          html: c.status,
          style: c.status === 'Active' ? {
            backgroundColor: '#fef3c7',
            color: '#92400e',
            padding: '2px 8px',
            borderRadius: '4px',
            fontWeight: '600',
            display: 'inline-block'
          } : {}
        },
        {
          html: String(c.daysSinceLastOrder),
          style: { color: '#dc2626', fontWeight: '600' }
        },
        fmtDate(c.lastOrder),
        fmtMoney(c.totalSpent)
      ];
    });
    rebuildTableBody(table, rows);
  }

  // ===== Main patch =====
  function patchAll() {
    if (!activityData) return;
    try { injectAdminRepToggle(); } catch(e) { console.warn('[EPL] toggle inject failed', e); }
    var repKey = detectActiveRep();
    window.__EPL_ACTIVE_REP = repKey;

    // Always refresh the weekly recap header (date + rep name) so it matches activityData
    try { updateWeeklyHeader(repKey); } catch(e){ console.warn('[EPL] weekly header update failed', e); }

    try { patchTopAccounts(repKey); } catch(e) { console.warn('[EPL] topAccounts patch failed', e); }
    try { patchNewClients(repKey); } catch(e) { console.warn('[EPL] newClients patch failed', e); }
    try { patchOutstandingAR(repKey); } catch(e) { console.warn('[EPL] outstandingAR patch failed', e); }
    try { patchAtRisk(repKey); } catch(e) { console.warn('[EPL] atRisk patch failed', e); }
  }

  // ===== Load and apply =====
  function loadActivity() {
    fetch('./activity.json?_=' + Date.now())
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(data) {
        if (!data) return;
        activityData = data;
        window.__EPL_ACTIVITY = data;
        console.log('[EPL ActivitySync] loaded', data.lastUpdated);
        setTimeout(patchAll, 1200);
      })
      .catch(function(e) { console.warn('[EPL ActivitySync] failed to load', e); });
  }

  loadActivity();

  // Re-apply on ANY nav click — covers admin toggle, rep tabs, section tabs.
  document.body.addEventListener('click', function(e) {
    if (!e.target) return;
    var text = (e.target.textContent || '').trim();
    if (text === 'Activity' || text === 'Karin' || text === 'Megan' ||
        text === 'Overview' || text === 'Comp' ||
        text === 'Karin Williamson' || text === 'Megan Smith' ||
        text === 'Commission Reports' || text === 'Documents') {
      setTimeout(patchAll, 500);
      setTimeout(patchAll, 1500); // second pass for slower React updates
    }
  }, true);

  // Also re-apply on route changes
  window.addEventListener('hashchange', function() { setTimeout(patchAll, 500); });
  window.addEventListener('popstate', function() { setTimeout(patchAll, 500); });

  // Permanent low-frequency safety net (every 2 seconds forever). React can
  // re-render at any time and wipe our patches; a persistent check keeps the
  // UI consistent even after a long idle or route change.
  setInterval(patchAll, 2000);
})();
