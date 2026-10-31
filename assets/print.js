(function () {
  var q = new URLSearchParams(location.search);
  var requested = q.get("week");
  var week = requested || window.JUBO_CURRENT;
  var mode = q.get("fold") === "1" ? "booklet" : "single";
  var editing = q.get("edit") === "1";
  var viewJ = null;
  var viewC = null;
  var fileChurch = null;
  var saveTimer = null;
  var songOpen = {};
  var DRAFTS = "hmj-drafts";
  var TOKEN = "hmj-github-token";
  var ROLES_KEY = "hmj-roles";
  var REPO = "chamegirl0808-maker/hanmaum-jubo";
  var roleCache = null;
  var ROLE_TITLES = ["안수집사", "담임목사", "전도사", "목사", "장로", "권사", "집사", "사모", "성도"];
  var BARE_TITLES = { "성도": 1, "형제": 1, "자매": 1 };
  if (editing) {
    mode = "single";
    document.body.classList.add("editing");
  }

  function logoSrc(src) {
    return String(src || "assets/logo.png").split("?")[0] + "?v=20261026g";
  }
  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function t(x) {
    return esc(x).replace(/\[([^\s\]][^\]]*)\]/g, '<mark class="ph">[$1]</mark>').replace(/\n/g, "<br>");
  }
  // trim() leaves zero-width chars and a contenteditable <br>, which still count as text.
  function stripMarks(x) {
    return String(x == null ? "" : x)
      .replace(/<br\s*[^>]*>/gi, "\n")
      .replace(/<\/?(?:div|p)\b[^>]*>/gi, "")
      .replace(/[\u200b\u200c\u200d\ufeff]/g, "")
      .replace(/&nbsp;/gi, " ")
      .replace(/\u00a0/g, " ");
  }
  function blank(x) { return stripMarks(x).trim() === ""; }
  function cleanSong(x) { return stripMarks(x).trim(); }
  function parseDate(s) {
    var p = String(s || "").split(".");
    if (p.length < 3) return null;
    var y = Number(p[0]), m = Number(p[1]), d = Number(p[2]);
    if (!y || !m || !d) return null;
    var dt = new Date(y, m - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
    return { y: y, m: m, d: d, dow: "일월화수목금토"[dt.getDay()] };
  }
  function findName(order, name) {
    var list = order || [];
    for (var i = 0; i < list.length; i++) if (list[i].name === name) return list[i];
    return null;
  }
  function isThisSunday(dayCell, J) {
    var p = parseDate(J.date);
    if (!p) return false;
    var cell = String(dayCell == null ? "" : dayCell).trim();
    if (!cell) return false;
    if (cell.indexOf(".") !== -1) {
      var md = cell.split(".");
      return Number(md[0]) === p.m && Number(md[1]) === p.d;
    }
    return cell === String(p.d) && Number(J.month) === p.m;
  }
  function folio(n) { return '<p class="folio">' + n + " / 4</p>"; }
  function head(num, title, extra) {
    return '<header class="phead"><div><span>' + num + "</span><h2>" + title + "</h2></div>" +
      (extra ? '<p class="pmeta">' + extra + "</p>" : "") + "</header>";
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function E(key, value, lead) {
    var raw = value == null ? "" : String(value);
    var html = t(raw);
    if (!editing) return blank(raw) ? "" : html;
    var leadAttr = lead ? ' data-lead="' + esc(lead) + '"' : "";
    return '<span class="ed" data-k="' + esc(key) + '"' + leadAttr + ' contenteditable="true" spellcheck="false">' + html + "</span>";
  }
  // A slash joins one couple, so "김팔옥/정영희" wraps as a single piece.
  function nameListHtml(text) {
    var src = String(text == null ? "" : text);
    if (blank(src)) return "";
    return src.split(/\n/).map(function (line) {
      return line.split(/\s+/).filter(Boolean).map(function (tok) {
        return '<span class="nm">' + esc(tok) + "</span>";
      }).join(" ");
    }).join("<br>");
  }
  function nameField(key, text) {
    var html = nameListHtml(text);
    if (!editing) return html;
    return '<span class="ed" data-k="' + esc(key) + '" contenteditable="true" spellcheck="false">' + html + "</span>";
  }
  function praiseTitles(text) {
    return String(text || "").split(/\s*[.。,，]\s*/).map(function (s) {
      return s.replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
    }).filter(Boolean);
  }
  function praiseMarkup(text) {
    return praiseTitles(text).map(function (title, i) {
      var span = '<span class="pt">' + esc(title) + "</span>";
      if (!i) return span;
      return '<span class="chunk"><span class="psep" aria-hidden="true">·</span>' + span + "</span>";
    }).join("");
  }
  function praiseField(text) {
    var inner = praiseMarkup(text);
    if (!editing) return inner;
    return '<span class="ed" data-k="praise" contenteditable="true" spellcheck="false">' + inner + "</span>";
  }
  function readPraise(el) {
    var nodes = el.querySelectorAll(".pt");
    var parts = [];
    if (nodes.length) {
      [].forEach.call(nodes, function (n) {
        var s = (n.textContent || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
        s = s.replace(/^[·•/.\s]+|[·•/.\s]+$/g, "");
        if (s) parts.push(s);
      });
    } else parts = praiseTitles(plain(el));
    var original = viewJ && viewJ.praise;
    if (original && praiseTitles(original).join("\n") === parts.join("\n")) return original;
    return parts.join(".   ");
  }
  // "!   생활은" keeps the bang on the previous highlighted word. The spaces stay with this phrase.
  function peelLeadPunct(s) {
    var str = String(s == null ? "" : s);
    var m = str.match(/^[!！?？.。,，、:：;；…]+/);
    if (!m) return { punct: "", rest: str };
    return { punct: m[0], rest: str.slice(m[0].length) };
  }
  function plain(el) {
    var html = el.innerHTML.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(div|p)>/gi, "\n").replace(/<[^>]+>/g, "");
    var ta = document.createElement("textarea");
    ta.innerHTML = html;
    return ta.value.replace(/\u00a0/g, " ").replace(/\n+$/g, "").replace(/^\n+/g, "");
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function parseLoose(s) {
    var m = String(s || "").match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
    if (!m) return null;
    var y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    var dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
    return { y: y, m: mo, d: d, dot: y + "." + pad(mo) + "." + pad(d), iso: y + "-" + pad(mo) + "-" + pad(d) };
  }
  function dotToIso(dot) {
    var p = parseLoose(dot);
    return p ? p.iso : "";
  }
  function addDays(iso, n) {
    var p = iso.split("-");
    var dt = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    dt.setDate(dt.getDate() + n);
    return dt.getFullYear() + "-" + pad(dt.getMonth() + 1) + "-" + pad(dt.getDate());
  }
  function bumpIssue(issue, iso) {
    var year = iso.slice(0, 4);
    var m = String(issue || "").match(/제\s*(\d+)\s*호/);
    var n = m ? Number(m[1]) + 1 : 1;
    return year + " - 제" + n + "호";
  }
  function drafts() {
    try { return JSON.parse(localStorage.getItem(DRAFTS) || "{}"); } catch (e) { return {}; }
  }
  function writeDraft(J, C) {
    var iso = dotToIso(J.date);
    if (!iso) return;
    var all = drafts();
    all[iso] = { at: Date.now(), jubo: J, church: C };
    localStorage.setItem(DRAFTS, JSON.stringify(all));
    var params = new URLSearchParams(location.search);
    if (params.get("week") !== iso) {
      params.set("week", iso);
      params.set("edit", "1");
      history.replaceState(null, "", location.pathname + "?" + params.toString() + location.hash);
    }
  }
  function setEditStatus(msg) {
    var el = document.getElementById("edit-status");
    if (el) el.textContent = msg || "";
  }
  function showToast(msg, bad) {
    setEditStatus(msg);
    var el = document.getElementById("edit-toast");
    if (!el) {
      el = document.createElement("p");
      el.id = "edit-toast";
      el.className = "edit-toast no-print";
      el.setAttribute("role", "status");
      document.body.appendChild(el);
    }
    el.classList.toggle("bad", !!bad);
    el.textContent = msg || "";
    el.hidden = !msg;
  }
  function setPath(J, C, key, val) {
    var p = key.split(".");
    if (key === "issue") J.issue = val;
    else if (key === "season") { if (String(val).trim()) J.season = val; else delete J.season; }
    else if (key === "date" || key === "when") {
      var d = parseLoose(val);
      if (d) { J.date = d.dot; J.month = String(d.m); }
    } else if (key === "month") {
      var num = String(val).replace(/월/g, "").trim();
      if (num) J.month = num;
    } else if (key === "time") { J.service = J.service || {}; J.service.time = val; }
    else if (key === "leader") { J.service = J.service || {}; J.service.leader = val; }
    else if (key === "praise") J.praise = val;
    else if (p[0] === "head" && J.newsHeadline) J.newsHeadline[Number(p[1])] = val;
    else if (p[0] === "ord" && J.order[Number(p[1])]) {
      var o = J.order[Number(p[1])];
      if (p[2] === "section") o.section = val;
      else if (p[2] === "song" && o.section) o.song = val;
      else if (p[2] === "name") o.name = val;
      else if (p[2] === "mid") o.mid = val;
      else if (p[2] === "by") o.by = val;
    } else if (p[0] === "news") J.news[Number(p[1])] = val;
    else if (p[0] === "prayer") J.prayers[Number(p[1])] = val;
    else if (p[0] === "srv") J.servers[Number(p[1])][Number(p[2])] = val;
    else if (p[0] === "newc") J.newcomers[Number(p[1])][Number(p[2])] = val;
    else if (p[0] === "off") J.offerings[Number(p[1])][Number(p[2])] = val;
    else if (p[0] === "youth") J.youth[Number(p[1])][Number(p[2])] = val;
    else if (p[0] === "ch") setChurch(C, p, val);
  }
  function setChurch(C, p, val) {
    if (p[1] === "name") C.name = val;
    else if (p[1] === "slogan") C.slogan = val;
    else if (p[1] === "tel") C.tel = val;
    else if (p[1] === "email") C.email = val;
    else if (p[1] === "invite") C.invitation = val;
    else if (p[1] === "addr") C.address = String(val).split(/\n/).map(function (s) { return s.trim(); }).filter(Boolean);
    else if (p[1] === "motto") C.motto[Number(p[2])][Number(p[3])] = val;
    else if (p[1] === "pastor") C.pastors[Number(p[2])][Number(p[3])] = val;
    else if (p[1] === "vis") C.vision[Number(p[2])][p[3]] = val;
    else if (p[1] === "wd") C.weekday[Number(p[2])][p[3]] = val;
    else if (p[1] === "svc") C.services[Number(p[2])][Number(p[3])] = val;
  }
  function decodeRolePayload(payload) {
    var s = String(payload || "");
    try { s = decodeURIComponent(s); } catch (e) {}
    s = s.replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    var bin = atob(s);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i) & 255;
    if (window.TextDecoder) return new TextDecoder("utf-8").decode(bytes);
    return decodeURIComponent(escape(bin));
  }
  function parseRoleText(text) {
    var map = {};
    String(text || "").replace(/^\uFEFF/, "").split(/\r?\n/).forEach(function (line) {
      line = line.trim();
      if (!line) return;
      var cut = line.indexOf(",");
      if (cut < 0) cut = line.indexOf("\t");
      if (cut < 0) return;
      var name = line.slice(0, cut).trim().replace(/^"|"$/g, "");
      var title = line.slice(cut + 1).trim().replace(/^"|"$/g, "");
      if (!name || !title || name === "이름" || name === "name") return;
      map[name] = title;
    });
    return map;
  }
  function roleMap() {
    if (roleCache) return roleCache;
    try {
      var raw = localStorage.getItem(ROLES_KEY);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (!obj || typeof obj !== "object") return null;
      roleCache = obj;
      return obj;
    } catch (e) { return null; }
  }
  function roleCount() {
    var map = roleMap();
    if (!map) return 0;
    var n = 0;
    for (var k in map) if (Object.prototype.hasOwnProperty.call(map, k)) n++;
    return n;
  }
  function storeRoles(map) {
    var n = 0;
    for (var k in map) if (Object.prototype.hasOwnProperty.call(map, k)) n++;
    if (!n) return 0;
    roleCache = map;
    try { localStorage.setItem(ROLES_KEY, JSON.stringify(map)); } catch (e) {}
    syncRoleNote();
    return n;
  }
  function ingestRoleHash() {
    var h = location.hash || "";
    if (h.charAt(0) === "#") h = h.slice(1);
    if (!h) return;
    var keep = [];
    var touched = false;
    h.split("&").forEach(function (part) {
      if (!part) return;
      var cut = part.indexOf("=");
      var key = cut < 0 ? part : part.slice(0, cut);
      var val = cut < 0 ? "" : part.slice(cut + 1);
      if (key === "gh") {
        touched = true;
        try {
          var token = val;
          try { token = decodeURIComponent(token); } catch (e) {}
          token = String(token).trim();
          if (token) localStorage.setItem(TOKEN, token);
        } catch (e) {}
        return;
      }
      if (key === "roles") {
        touched = true;
        try { storeRoles(parseRoleText(decodeRolePayload(val))); } catch (e) {}
      }
      keep.push(part);
    });
    if (!touched) return;
    history.replaceState(null, "", location.pathname + location.search + (keep.length ? "#" + keep.join("&") : ""));
  }
  function syncRoleNote() {
    var n = roleCount();
    var note = document.getElementById("roles-note");
    var detail = document.getElementById("roles-detail");
    var full = n ? "직분표 " + n + "명 저장됨" : "직분표 없음";
    if (note) {
      note.textContent = n ? "직분 " + n : "직분 없음";
      note.title = full;
    }
    if (detail) detail.textContent = full;
  }
  function isRoleTitle(tok) {
    return ROLE_TITLES.indexOf(tok) >= 0;
  }
  function isRoleField(key) {
    if (!key) return false;
    if (key === "leader") return true;
    return /^ord\.\d+\.by$/.test(key);
  }
  function displayTitle(title) {
    return title === "담임목사" ? "목사" : title;
  }
  function spaceGluedTitles(text) {
    var re = /(\s+|[\/／,，、]+)/;
    var parts = String(text == null ? "" : text).split(re);
    for (var i = 0; i < parts.length; i++) {
      var tok = parts[i];
      if (!tok || re.test(tok) || isRoleTitle(tok)) continue;
      var best = "";
      for (var t = 0; t < ROLE_TITLES.length; t++) {
        var title = ROLE_TITLES[t];
        if (tok.length > title.length && title.length > best.length && tok.slice(-title.length) === title) best = title;
      }
      if (best) parts[i] = tok.slice(0, -best.length) + " " + displayTitle(best);
    }
    return parts.join("");
  }
  function withRoles(text) {
    var spaced = spaceGluedTitles(text);
    var map = roleMap();
    if (!map) return spaced;
    var re = /(\s+|[\/／,，、]+)/;
    var parts = String(spaced == null ? "" : spaced).split(re);
    var i = 0;
    while (i < parts.length) {
      var tok = parts[i];
      if (!tok || re.test(tok)) { i++; continue; }
      var rawTitle = map[tok];
      if (!rawTitle || BARE_TITLES[rawTitle]) { i++; continue; }
      var j = i + 1;
      while (j < parts.length && (!parts[j] || re.test(parts[j]))) j++;
      var shown = displayTitle(rawTitle);
      if (j < parts.length && (isRoleTitle(parts[j]) || parts[j] === shown)) { i++; continue; }
      parts.splice(i + 1, 0, " ", shown);
      i += 3;
    }
    return parts.join("");
  }
  function commitRoleField(el, force) {
    if (!editing || !el) return;
    if (!force && el === document.activeElement) return;
    var key = el.getAttribute("data-k") || "";
    if (!isRoleField(key)) return;
    var val = plain(el);
    var next = withRoles(val);
    if (next !== val) el.textContent = next;
  }
  function harvest() {
    if (!viewJ || !viewC) return;
    [].forEach.call(document.querySelectorAll("#book .ed"), commitRoleField);
    var J = clone(viewJ);
    var C = clone(viewC);
    [].forEach.call(document.querySelectorAll("#book .ed"), function (el) {
      var key = el.getAttribute("data-k") || "";
      var val = key === "praise" ? readPraise(el) : plain(el);
      var lead = el.getAttribute("data-lead") || "";
      if (lead && val.indexOf(lead) !== 0) val = lead + val;
      if (isRoleField(key)) val = withRoles(val);
      if (/\.song$/.test(key)) val = cleanSong(val);
      setPath(J, C, key, val);
    });
    (J.order || []).forEach(function (o) {
      if (!o || !o.section || typeof o.song !== "string") return;
      o.song = cleanSong(o.song);
    });
    viewJ = J;
    viewC = C;
    window.CHURCH = C;
  }
  function dropEmptyOpenSongs() {
    if (!viewJ || !viewJ.order) return false;
    var changed = false;
    viewJ.order.forEach(function (o, i) {
      if (!o || !o.section || !Object.prototype.hasOwnProperty.call(o, "song")) return;
      if (typeof o.song !== "string") return;
      var cleaned = cleanSong(o.song);
      if (o.song !== cleaned) {
        o.song = cleaned;
        changed = true;
      }
      if (!cleaned && songOpen[i]) {
        delete songOpen[i];
        changed = true;
      }
    });
    return changed;
  }
  function blankSongRowOpen() {
    var nodes = document.querySelectorAll("#book .songrow");
    for (var i = 0; i < nodes.length; i++) {
      var ed = nodes[i].querySelector(".ed");
      var text = ed ? plain(ed) : ((nodes[i].querySelector(".b") || nodes[i]).textContent || "").replace(/♬/g, "");
      if (blank(text)) return true;
    }
    return false;
  }
  function settleSongs() {
    if (editing) harvest();
    var dropped = dropEmptyOpenSongs();
    if (!dropped && !blankSongRowOpen()) return;
    render(viewC, viewJ, (viewJ && dotToIso(viewJ.date)) || week);
  }
  function applyLoadedRoles(J) {
    if (!editing || !J) return false;
    var changed = false;
    (J.order || []).forEach(function (o) {
      if (!o || o.by == null || o.by === "") return;
      var next = withRoles(o.by);
      if (next !== o.by) { o.by = next; changed = true; }
    });
    if (J.service && J.service.leader) {
      var leader = withRoles(J.service.leader);
      if (leader !== J.service.leader) { J.service.leader = leader; changed = true; }
    }
    return changed;
  }
  function scheduleSave() {
    if (!editing) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try {
        harvest();
        writeDraft(viewJ, viewC);
        setEditStatus("이 휴대폰에 저장해 두었습니다.");
      } catch (e) { setEditStatus("임시 저장을 하지 못했습니다."); }
    }, 400);
  }
  function sheetZoom(value) {
    var book = document.getElementById("book");
    if (!book) return;
    [].forEach.call(book.querySelectorAll(".sheet"), function (s) { s.style.zoom = value; });
  }
  function fitWidth() {
    var book = document.getElementById("book");
    if (!book) return;
    book.style.transform = "";
    book.style.marginLeft = "";
    book.style.marginBottom = "";
    if (!editing) { sheetZoom(""); return; }
    sheetZoom("1");
    var target = book.querySelector(".sheet");
    if (!target) return;
    var natural = target.getBoundingClientRect().width;
    if (!natural) return;
    var side = 2;
    var scale = (document.documentElement.clientWidth - side * 2) / natural;
    sheetZoom(String(scale));
  }

  function renderChrome(week) {
    if (editing) { buildEditbar(week); return; }
    var weeks = window.JUBO_WEEKS || [week];
    var church = window.CHURCH || {};
    var opts = weeks.map(function (w) {
      return '<option value="' + esc(w) + '"' + (w === week ? " selected" : "") + ">" + esc(w) + "</option>";
    }).join("");
    var back = "index.html" + (week ? "?week=" + encodeURIComponent(week) : "");
    document.getElementById("tools").innerHTML =
      '<a class="brand" href="' + back + '"><img src="' + esc(logoSrc(church.logo)) + '" alt="" width="36" height="36"><span>' + esc(church.name || "주보") + " 인쇄</span></a>" +
      '<div class="tool-row"><label>주차 <select aria-label="주보 주차">' + opts + "</select></label>" +
      '<button type="button" id="do-print">인쇄 / PDF</button>' +
      '<button type="button" id="do-booklet-pdf">접는 주보 PDF 받기</button></div>';
    document.getElementById("guide").hidden = false;
    document.getElementById("guide").innerHTML =
      '<div class="mode-row" role="group" aria-label="인쇄 모양">' +
      '<button type="button" id="mode-booklet">접는 주보 (A4 한 장 앞뒤)</button>' +
      '<button type="button" id="mode-single">한 장에 한 쪽씩 (A4 4장)</button></div>' +
      '<div class="howto" id="howto"></div>';
    document.querySelector("#tools select").addEventListener("change", function () {
      var params = new URLSearchParams(location.search);
      params.delete("draft");
      params.set("week", this.value);
      if (mode === "booklet") params.set("fold", "1");
      else params.delete("fold");
      location.search = "?" + params.toString();
    });
    document.getElementById("do-print").addEventListener("click", function () { window.print(); });
    document.getElementById("do-booklet-pdf").addEventListener("click", function () { bookletPdf(); });
    document.getElementById("mode-booklet").addEventListener("click", function () { setMode("booklet"); });
    document.getElementById("mode-single").addEventListener("click", function () { setMode("single"); });
    syncGuide();
  }

  function setMode(next) {
    mode = next;
    var params = new URLSearchParams(location.search);
    if (mode === "booklet") params.set("fold", "1");
    else params.delete("fold");
    history.replaceState(null, "", location.pathname + "?" + params.toString());
    applyMode();
  }

  function syncGuide() {
    var book = mode === "booklet";
    var bookletBtn = document.getElementById("mode-booklet");
    var singleBtn = document.getElementById("mode-single");
    if (bookletBtn) bookletBtn.setAttribute("aria-pressed", book ? "true" : "false");
    if (singleBtn) singleBtn.setAttribute("aria-pressed", book ? "false" : "true");
    var how = document.getElementById("howto");
    if (!how) return;
    if (book) {
      how.innerHTML =
        "<p><b>접는 주보</b>는 A4 한 장을 앞뒤로 인쇄한 뒤 반으로 접습니다. 앞면은 왼쪽 4쪽, 오른쪽 1쪽입니다. 뒷면은 왼쪽 2쪽, 오른쪽 3쪽입니다.</p>" +
        "<p class=\"print-note no-print\">인쇄 설정: 용지 A4, 방향 가로, 여백 없음, 배율 100%, 양면 짧은 쪽 넘기기, 배경 그래픽 켜기. 가장자리 7mm 여백은 인쇄면에 들어 있습니다.</p>" +
        "<p>글자가 잘리면 <b>접는 주보 PDF 받기</b>로 받은 파일을 배율 100%로 인쇄하세요. 인쇄한 다음 반으로 접으면 1쪽이 겉표지입니다.</p>";
    } else {
      how.innerHTML =
        "<p><b>한 장에 한 쪽씩</b>은 A4 네 장입니다. 표지, 예배 순서, 소식, 안내 순서입니다.</p>" +
        "<ol><li>용지: A4</li><li>여백: 없음</li><li>배율: 100%</li><li>배경 그래픽 켜기</li></ol>" +
        "<p class=\"print-note no-print\">가장자리 7mm 여백은 인쇄면에 들어 있습니다. 여백을 더 넣지 마세요.</p>";
    }
  }

  function applyMode() {
    var bookEl = document.getElementById("book");
    var sheets = [].slice.call(bookEl.querySelectorAll(".sheet"));
    sheets.sort(function (a, b) {
      var fa = a.querySelector(".folio");
      var fb = b.querySelector(".folio");
      var na = fa ? parseInt(fa.textContent, 10) : 0;
      var nb = fb ? parseInt(fb.textContent, 10) : 0;
      return na - nb;
    });
    document.body.classList.toggle("booklet", mode === "booklet");
    var rule = document.getElementById("page-rule");
    if (rule) {
      rule.textContent = mode === "booklet"
        ? "@page { size: A4 landscape; margin: 0; }"
        : "@page { size: A4 portrait; margin: 0; }";
    }
    if (sheets.length !== 4) { syncGuide(); return; }
    if (mode === "booklet") {
      bookEl.innerHTML = "";
      bookEl.appendChild(makeSpread("앞면", "왼쪽 4쪽 · 오른쪽 1쪽", [sheets[3], sheets[0]]));
      bookEl.appendChild(makeSpread("뒷면", "왼쪽 2쪽 · 오른쪽 3쪽", [sheets[1], sheets[2]]));
    } else {
      bookEl.innerHTML = "";
      sheets.forEach(function (sheet) { bookEl.appendChild(sheet); });
    }
    syncGuide();
  }

  function makeSpread(title, detail, pair) {
    var wrap = document.createElement("section");
    wrap.className = "spread-wrap";
    var label = document.createElement("p");
    label.className = "spread-label no-print";
    label.textContent = title + " · " + detail;
    var spread = document.createElement("div");
    spread.className = "spread";
    pair.forEach(function (sheet) {
      var slot = document.createElement("div");
      slot.className = "slot";
      var mini = document.createElement("div");
      mini.className = "mini";
      mini.appendChild(sheet);
      slot.appendChild(mini);
      spread.appendChild(slot);
    });
    wrap.appendChild(label);
    wrap.appendChild(spread);
    return wrap;
  }

  function clock() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="#e0620d" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
  }
  function decorateInvite(text) {
    var marks = [["평안과 건강한 삶, 보람된 삶을 원하십니까?", "c1"], ["예수님을 만나십시오.", "c1"], ["좋은 안내자가 필요합니다.", "c2"], ["한마음제자교회", "c2"], ["의미 있고 행복한 곳", "u"]];
    return String(text || "").split(/\n/).filter(function (line) {
      return line.replace(/\s/g, "") !== "";
    }).map(function (line) {
      var html = esc(line);
      marks.forEach(function (b) {
        var safe = esc(b[0]);
        html = html.split(safe).join(b[1] === "u" ? "<u>" + safe + "</u>" : '<span class="' + b[1] + '">' + safe + "</span>");
      });
      return '<div class="ln">' + html + "</div>";
    }).join("");
  }
  function inviteField(text) {
    var inner = decorateInvite(text);
    if (!editing) return inner;
    return '<div class="ed" data-k="ch.invite" contenteditable="true" spellcheck="false">' + inner + "</div>";
  }
  function groupOrder(order) {
    var groups = [];
    var cur = null;
    (order || []).forEach(function (o, i) {
      if (o.section) {
        cur = { i: i, o: o, rows: [] };
        groups.push(cur);
      } else if (!cur) {
        cur = { i: -1, o: { section: "" }, rows: [] };
        groups.push(cur);
        cur.rows.push({ i: i, o: o });
      } else cur.rows.push({ i: i, o: o });
    });
    return groups;
  }
  function visitorFilled(r) {
    return [1, 2, 3].some(function (i) { return String((r && r[i]) || "").trim() !== ""; });
  }
  function trimVisitors(rows) {
    var list = (rows || []).map(function (r) {
      return [0, 1, 2, 3].map(function (i) { return r && r[i] != null ? String(r[i]) : ""; });
    });
    while (list.length > 2 && !visitorFilled(list[list.length - 1])) list.pop();
    while (list.length < 2) list.push(["", "", "", ""]);
    return list;
  }
  function render(C, J, week) {
    viewC = clone(C);
    viewJ = clone(J);
    document.title = (C.name || "주보") + " 주보 인쇄 · " + J.date;
    var date = parseDate(J.date);
    var when = date ? (date.y + "년 " + date.m + "월 " + date.d + "일") : String(J.date || "");
    var map = window.JUBO_MAP || "";

    var cover =
      '<section class="sheet p1"><span class="folio">1</span>' +
      '<div class="blob t"></div><div class="blob r"></div><div class="blob l"></div>' +
      '<div class="inner">' +
      '<div class="date">' + E("when", when) +
      ((J.season || editing) ? '<span class="sep">·</span>' + E("season", J.season || "") : "") + "</div>" +
      '<div class="tag">' + E("ch.slogan", C.slogan) + "</div>" +
      '<div class="name">' + E("ch.name", C.name) + "</div>" +
      '<div class="rule"><i></i><b></b><i></i></div>' +
      '<div class="logo-wrap"><img src="' + esc(logoSrc(C.logo)) + '" alt=""></div>' +
      '<div class="confess">' +
      (C.motto || []).map(function (m, i) {
        return (i ? "<br>" : "") + E("ch.motto." + i + ".0", m[0]) + "<em>" + E("ch.motto." + i + ".1", m[1]) + "</em>" + E("ch.motto." + i + ".2", m[2]);
      }).join("") + "</div>" +
      '<div class="info"><div class="r1">' +
      (C.pastors || []).map(function (p, i) {
        return (i ? '<span class="sep">·</span>' : "") + E("ch.pastor." + i + ".0", p[0]) + " " + E("ch.pastor." + i + ".1", p[1]);
      }).join("") + "</div>" +
      '<div class="r2">전화 ' + E("ch.tel", C.tel) + '<span class="sep">·</span>이메일 ' + E("ch.email", C.email) + "</div>" +
      '<div class="r3">' + E("ch.addr", (C.address || []).join(" ")) + "</div></div>" +
      "</div></section>";

    var orderHtml = groupOrder(J.order).map(function (g) {
      var songRow = "";
      var songBtn = "";
      if (g.o && Object.prototype.hasOwnProperty.call(g.o, "song")) {
        var rawSong = g.o.song;
        var songText = typeof rawSong === "string" ? cleanSong(rawSong) : String(rawSong == null ? "" : rawSong);
        var songFilled = typeof rawSong === "string" ? songText !== "" : !blank(songText);
        if (songFilled || (editing && songOpen[g.i])) {
          songRow = '<div class="row songrow' + (songFilled ? "" : " song-empty no-print") + '"><div class="a"></div><div class="b"><span class="note sym">♬</span> ' +
            E("ord." + g.i + ".song", songText) + '</div><div class="c"></div></div>';
        } else if (editing) {
          songBtn = '<button type="button" class="songadd no-print" data-add="song" data-i="' + g.i + '">+ 특송 넣기 (인쇄 안 됨)</button>';
        }
      }
      var rows = songRow + g.rows.map(function (item) {
        var o = item.o, i = item.i;
        var itemSong = o.song === true || (typeof o.song === "string" && cleanSong(o.song) !== "");
        return '<div class="row' + (o.name === "설교" ? " sermon" : "") + '">' +
          '<div class="a">' + (o.stand ? '<span class="st">※</span>' : "") + E("ord." + i + ".name", o.name || "") + "</div>" +
          '<div class="b">' + (itemSong ? '<span class="note sym">♬</span>' : "") + E("ord." + i + ".mid", o.mid || "") + "</div>" +
          '<div class="c">' + E("ord." + i + ".by", o.by || "") + "</div></div>";
      }).join("");
      var pill = g.o && g.o.section ? '<span class="pill">' + E("ord." + g.i + ".section", g.o.section) + "</span>" : "";
      var head = (pill || songBtn) ? '<div class="sechead">' + pill + songBtn + "</div>" : "";
      return '<div class="sec">' + head + '<div class="card rows">' + rows + "</div></div>";
    }).join("");

    var page2 =
      '<section class="sheet p2"><span class="folio">2</span><div class="inner">' +
      '<div class="pagehead"><span class="chip">' + clock() + E("time", J.service && J.service.time) + "</span>" +
      "<h1>주일예배</h1>" +
      '<span class="chip">' + E("leader", J.service && J.service.leader) + "</span></div>" +
      '<div class="praise"><span class="note sym">♬</span>' + praiseField(J.praise || "") + "</div>" +
      orderHtml + "</div></section>";

    var motto = "";
    var heads = J.newsHeadline || [];
    var shown = heads.map(function (h) { return h == null ? "" : String(h); });
    var leads = [];
    for (var hi = 0; hi < shown.length; hi += 2) {
      var punct = "";
      if (hi + 2 < shown.length) {
        var peeled = peelLeadPunct(shown[hi + 2]);
        if (peeled.punct) {
          punct = peeled.punct;
          shown[hi + 2] = peeled.rest;
          leads[hi + 2] = peeled.punct;
        }
      }
      var emHere = hi + 1 < shown.length;
      if (!shown[hi] && !emHere && !punct) continue;
      motto += "<span>" + E("head." + hi, shown[hi], leads[hi] || "") +
        (emHere ? "<em>" + E("head." + (hi + 1), shown[hi + 1]) + "</em>" : "") +
        esc(punct) + "</span>";
    }
    var altar = null;
    (J.offerings || []).forEach(function (o, i) { if (o[0] === "강단장식") altar = { o: o, i: i }; });
    var offerHtml = (J.offerings || []).map(function (o, i) {
      if (altar && i === altar.i) return "";
      if (altar && o[0] === "오병이어") {
        return '<div class="o o-pair"><span class="l"><span class="ast">*</span>' + E("off." + i + ".0", o[0]) +
          ' :</span><span class="v">' + nameField("off." + i + ".1", o[1]) +
          '</span><span class="alt"><span class="al"><b>' + E("off." + altar.i + ".0", altar.o[0]) +
          "</b> :</span> " + nameField("off." + altar.i + ".1", altar.o[1]) + "</span></div>";
      }
      return '<div class="o"><span class="l"><span class="ast">*</span>' + E("off." + i + ".0", o[0]) +
        ' :</span><span class="v">' + nameField("off." + i + ".1", o[1]) + "</span></div>";
    }).join("");
    if (J.youth && J.youth.length) {
      offerHtml += '<div class="o"><span class="l"><span class="ast">*</span>청소년부 :</span><span class="v">' +
        J.youth.map(function (y, i) {
          return E("youth." + i + ".0", y[0]) + " : " + nameField("youth." + i + ".1", y[1]);
        }).join("<br>") + "</span></div>";
    }

    var page3 =
      '<section class="sheet p3"><span class="folio">3</span><div class="inner">' +
      '<div class="pagehead"><div><h1>교회 행사 및 교우 소식</h1></div></div>' +
      (motto ? '<div class="motto">' + motto + "</div>" : "") +
      '<div class="card pray">' +
      (J.prayers || []).map(function (pr, i) {
        return '<p><span class="k">※</span><span>' + E("prayer." + i, pr) + "</span></p>";
      }).join("") + "</div>" +
      (editing ? '<button type="button" class="addline no-print" data-add="news">+ 줄 추가</button>' : "") +
      '<ul class="news">' +
      (J.news || []).map(function (n, i) {
        return "<li>" + (editing ? '<button type="button" class="rowdel no-print" data-del="news" data-i="' + i + '">줄 삭제</button>' : "") +
          '<span class="n">' + (i + 1) + "</span><b>" + E("news." + i, n) + "</b></li>";
      }).join("") + "</ul>" +
      '<div class="card wrapcard"><div class="boxhead"><span class="mtitle"><span class="paren">( ' +
      E("month", J.month) + " )</span>월 예배위원 &nbsp;/&nbsp; 주요 행사</span>" +
      (editing ? '<button type="button" class="addline no-print" data-add="srv">+ 줄 추가</button>' : "") +
      '</div><table class="tbl"><tr><th style="width:11mm">일</th><th>설교</th><th>기도</th><th>헌금</th><th>성경봉독</th><th>주요 행사 계획</th>' +
      (editing ? '<th class="editcol no-print"></th>' : "") + "</tr>" +
      (J.servers || []).map(function (r, ri) {
        var today = isThisSunday(r[0], J);
        return '<tr' + (today ? ' class="today"' : "") + ">" + r.map(function (c, ci) {
          var cls = ci === 0 ? "day" : (ci === 5 ? "ev" : "");
          return '<td' + (cls ? ' class="' + cls + '"' : "") + ">" + E("srv." + ri + "." + ci, c) + "</td>";
        }).join("") + (editing ? '<td class="editcol no-print"><button type="button" class="rowdel" data-del="srv" data-i="' + ri + '">줄 삭제</button></td>' : "") + "</tr>";
      }).join("") + "</table></div>" +
      '<div class="card wrapcard"><table class="tbl nf"><tr><th></th><th class="who">새가족/방문자</th><th style="width:40mm">인도자</th><th style="width:36mm">소속</th></tr>' +
      (J.newcomers || []).map(function (r, ri) {
        return "<tr>" + [0, 1, 2, 3].map(function (i) {
          return "<td>" + E("newc." + ri + "." + i, r[i] || "") + "</td>";
        }).join("") + "</tr>";
      }).join("") + "</table>" +
      (editing ? '<div class="nf-add no-print"><button type="button" class="addline" data-add="newc">+ 줄 추가</button></div>' : "") +
      "</div>" +
      '<div class="card offer"><div class="boxhead"><span class="pill"><span class="dot"></span>지난 주 헌금자 명단</span></div>' +
      offerHtml + "</div></div></section>";

    var page4 =
      '<section class="sheet p4"><span class="folio">4</span><div class="inner">' +
      '<div class="pagehead"><div><h1>' + E("ch.name", C.name) + "는</h1></div></div>" +
      '<div class="vis">' +
      (C.vision || []).map(function (v, i) {
        return '<div class="card v"><div class="ttl"><span class="ast">*</span>' + E("ch.vis." + i + ".title", v.title) +
          '</div><span class="ref">(' + E("ch.vis." + i + ".verse", v.verse) + ')</span><div class="sub">' +
          E("ch.vis." + i + ".desc", v.desc) + "</div></div>";
      }).join("") + "</div>" +
      '<div class="meet">' +
      (C.weekday || []).map(function (w, i) {
        return '<div class="card m"><div class="mt">' + E("ch.wd." + i + ".name", w.name) +
          '</div><span class="tm">( ' + E("ch.wd." + i + ".time", w.time) + ' )</span><div class="ld">인도 : ' +
          E("ch.wd." + i + ".leader", w.leader) + "</div></div>";
      }).join("") + "</div>" +
      '<div class="lower"><div class="card times"><span class="pill"><span class="dot"></span>예배시간 안내</span><div class="tlist">' +
      (C.services || []).map(function (s, i) {
        var head = i === 0 ? '<div class="gl">주일</div>' : (i === 1 ? '<div class="gl">주중</div>' : "");
        return head + '<div class="trow' + (i === 0 ? " sun" : "") + '"><span class="tn">' + E("ch.svc." + i + ".0", s[0]) +
          '</span><span class="tt">' + E("ch.svc." + i + ".1", s[1]) + "</span></div>";
      }).join("") + "</div></div>" +
      '<div class="card mapcard"><span class="pill"><span class="dot"></span>교회 찾아오시는 길</span><div class="mapframe">' + map + "</div>" +
      '<p class="mapaddr">2F Bramante Piazza Clubhouse, Renaissance Condominium,<br>Meralco Ave, Brgy Ugong, Ortigas, Pasig City' +
      (C.tel ? '<span class="maptel">☎ ' + esc(C.tel) + "</span>" : "") + "</p></div></div>" +
      '<div class="closing">' + inviteField(C.invitation || "") + "</div>" +
      "</div></section>";

    document.getElementById("book").innerHTML = cover + page2 + page3 + page4;
    applyMode();
    if (editing) fitWidth();
  }

  function buildEditbar(weekId) {
    document.getElementById("tools").hidden = true;
    document.getElementById("guide").hidden = true;
    var bar = document.getElementById("editbar");
    bar.hidden = false;
    var weeks = (window.JUBO_WEEKS || []).slice();
    if (weekId && weeks.indexOf(weekId) < 0) weeks.unshift(weekId);
    var opts = weeks.map(function (w) {
      return '<option value="' + esc(w) + '"' + (w === weekId ? " selected" : "") + ">" + esc(w) + "</option>";
    }).join("");
    var tokenNote = "";
    try { tokenNote = localStorage.getItem(TOKEN) ? "이 휴대폰에 토큰이 있습니다." : ""; } catch (e) {}
    bar.innerHTML =
      '<div class="edit-row">' +
      '<img class="edit-logo" src="' + esc(logoSrc((window.CHURCH || {}).logo)) + '" alt="" width="32" height="32">' +
      '<select id="edit-week" aria-label="주보 날짜">' + opts + "</select>" +
      '<button type="button" id="edit-save" class="primary">저장</button>' +
      '<button type="button" id="edit-more" aria-expanded="false">더보기</button>' +
      '<span class="roles-chip" id="roles-note"></span></div>' +
      '<div id="edit-more-box" hidden>' +
      '<div class="edit-row">' +
      '<button type="button" id="edit-new">새 주보</button>' +
      '<button type="button" id="edit-reset">처음대로</button>' +
      '<button type="button" id="edit-fold" class="printy">접어 인쇄</button>' +
      '<button type="button" id="edit-fold-pdf" class="printy">접는 PDF</button>' +
      '<button type="button" id="edit-single" class="printy">한 장 인쇄</button>' +
      '<button type="button" id="roles-open">직분표</button>' +
      '<a class="quiet" href="edit.html?week=' + encodeURIComponent(weekId || "") + '">칸으로 고치기</a></div>' +
      '<p class="edit-hint">글자를 누르면 바로 고칩니다.</p>' +
      '<p class="edit-hint" id="roles-detail"></p>' +
      '<p class="print-note">인쇄: A4, 여백 없음, 배율 100%, 배경 그래픽 켜기. 접는 주보는 가로·양면 짧은 쪽. 가장자리 7mm는 인쇄면에 포함됨</p></div>' +
      '<p class="edit-status" id="edit-status" role="status"></p>' +
      '<div class="tokenbox no-print" id="roles-box" hidden>' +
      '<p>이름,직분 을 한 줄에 하나씩 붙여 넣거나, CSV 파일을 고르세요. 이 목록은 이 휴대폰에만 남습니다.</p>' +
      '<textarea id="roles-text" rows="4" spellcheck="false" placeholder="이름,직분"></textarea>' +
      '<input id="roles-file" type="file" accept=".csv,text/csv,text/plain">' +
      '<div class="edit-row" style="margin-top:6px"><button type="button" id="roles-save" class="primary">이 목록 저장</button></div></div>' +
      '<div class="tokenbox" id="tokenbox" hidden><p id="token-note">' + esc(tokenNote) + "</p>" +
      "<p>홈페이지에 올리려면 깃허브 토큰을 넣어 주세요. 토큰은 이 휴대폰에만 남습니다.</p>" +
      '<input id="edit-token" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="github_pat_...">' +
      '<div class="edit-row" style="margin-top:6px"><button type="button" id="token-go" class="primary">토큰으로 올리기</button>' +
      '<button type="button" id="file-go">파일로 내려받기</button></div></div>';
    syncRoleNote();
  }
  function ensureWeekOption(id) {
    var sel = document.getElementById("edit-week");
    if (!sel || !id) return;
    var found = false;
    [].forEach.call(sel.options, function (o) { if (o.value === id) found = true; });
    if (!found) {
      var opt = document.createElement("option");
      opt.value = id;
      opt.textContent = id;
      sel.insertBefore(opt, sel.firstChild);
    }
    sel.value = id;
  }
  function syncDate(src) {
    var d = parseLoose(plain(src));
    if (!d) return;
    document.querySelectorAll('.ed[data-k="date"]').forEach(function (el) { if (el !== src) el.textContent = d.dot; });
    document.querySelectorAll('.ed[data-k="when"]').forEach(function (el) {
      if (el !== src) el.textContent = d.y + "년 " + d.m + "월 " + d.d + "일";
    });
    document.querySelectorAll('.ed[data-k="month"]').forEach(function (el) { if (el !== src) el.textContent = String(d.m); });
    var dow = document.getElementById("dow-label");
    if (dow) {
      var name = "일월화수목금토"[new Date(d.y, d.m - 1, d.d).getDay()];
      dow.textContent = name === "일" ? "주일" : name + "요일";
    }
  }
  function addRow(kind) {
    harvest();
    if (kind === "news") viewJ.news.push("");
    if (kind === "srv") viewJ.servers.push(["", "", "", "", "", ""]);
    if (kind === "newc") {
      if (!viewJ.newcomers) viewJ.newcomers = [];
      viewJ.newcomers.push(["", "", "", ""]);
    }
    render(viewC, viewJ, dotToIso(viewJ.date));
    scheduleSave();
  }
  function delRow(kind, i) {
    harvest();
    if (kind === "news" && viewJ.news.length > 1) viewJ.news.splice(i, 1);
    if (kind === "srv" && viewJ.servers.length > 1) viewJ.servers.splice(i, 1);
    render(viewC, viewJ, dotToIso(viewJ.date));
    scheduleSave();
  }
  function makeNew() {
    harvest();
    var iso = dotToIso(viewJ.date);
    if (!iso) { setEditStatus("날짜를 2026년 10월 18일 처럼 적어 주세요."); return; }
    var next = addDays(iso, 7);
    var p = parseLoose(next);
    viewJ.date = p.dot;
    viewJ.month = String(p.m);
    viewJ.issue = bumpIssue(viewJ.issue, next);
    ensureWeekOption(next);
    render(viewC, viewJ, next);
    scheduleSave();
    setEditStatus("지난 주보를 복사했습니다. 날짜는 7일 뒤, 호수는 하나 올렸습니다.");
  }
  function resetDraft() {
    var all = drafts();
    delete all[week];
    if (viewJ) delete all[dotToIso(viewJ.date)];
    localStorage.setItem(DRAFTS, JSON.stringify(all));
    location.href = "print.html?edit=1&week=" + encodeURIComponent(week);
  }
  function withoutRoleMap(obj) {
    if (!obj || typeof obj !== "object") return obj;
    var copy = clone(obj);
    delete copy.roles;
    delete copy.roleMap;
    delete copy.직분;
    return copy;
  }
  function weekFile(J) {
    J = withoutRoleMap(J);
    return "// ===== " + (J.date || "") + " (" + (J.issue || "") + ") 주보 데이터 =====\n" +
      "window.JUBO = " + JSON.stringify(J, null, 2) + ";\n";
  }
  function churchFile(C) {
    C = withoutRoleMap(C);
    return "// 교회 고정 정보 (자주 바뀌지 않는 내용)\nwindow.CHURCH = " + JSON.stringify(C, null, 2) + ";\n";
  }
  function currentFile(id) {
    var list = (window.JUBO_WEEKS || []).slice();
    if (list.indexOf(id) < 0) list.push(id);
    var seen = {};
    list = list.filter(function (w) { if (seen[w]) return false; seen[w] = true; return true; });
    list.sort().reverse();
    return "// 기본으로 보여줄 주보 날짜 (매주 이 값만 바꾸면 됩니다)\n" +
      "window.JUBO_CURRENT = " + JSON.stringify(list[0]) + ";\n" +
      "window.JUBO_WEEKS = " + JSON.stringify(list) + ";\n";
  }
  function download(name, text) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/javascript;charset=utf-8" }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  function downloadFiles() {
    var iso = dotToIso(viewJ.date);
    if (!iso) return;
    download(iso + ".js", weekFile(viewJ));
    setTimeout(function () { download("current.js", currentFile(iso)); }, 400);
  }
  function tokenValue() {
    var input = document.getElementById("edit-token");
    var typed = input && input.value.trim();
    if (typed) {
      localStorage.setItem(TOKEN, typed);
      input.value = "";
      var note = document.getElementById("token-note");
      if (note) note.textContent = "이 휴대폰에 토큰이 있습니다.";
    }
    return localStorage.getItem(TOKEN) || "";
  }
  function toB64(text) {
    var bytes = new TextEncoder().encode(text);
    var bin = "";
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }
  function ghMessage(res) {
    if (res.status === 401) return "토큰이 맞지 않습니다. 다시 확인해 주세요.";
    if (res.status === 403 || res.status === 404) return "이 토큰으로는 저장할 수 없습니다. hanmaum-jubo 만 허용하고, Contents 를 Read and write 로 만들어 주세요.";
    if (res.status === 409) return "다른 수정이 먼저 저장되었습니다. 한 번 더 눌러 주세요.";
    return "저장하지 못했습니다. 잠시 후 다시 눌러 주세요.";
  }
  function ghPut(path, text, message, token) {
    var url = "https://api.github.com/repos/" + REPO + "/contents/" + path;
    var headers = {
      "Authorization": "Bearer " + token,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json"
    };
    function fetchSha() {
      return fetch(url + "?ref=main", { headers: headers }).then(function (res) {
        if (res.status === 401 || res.status === 403) throw new Error(ghMessage(res));
        if (res.status === 404) return null;
        if (res.status !== 200) throw new Error(ghMessage(res));
        return res.json().then(function (data) { return data && data.sha ? data.sha : null; });
      });
    }
    function putSha(sha) {
      var body = { message: message, content: toB64(text), branch: "main" };
      if (sha) body.sha = sha;
      return fetch(url, { method: "PUT", headers: headers, body: JSON.stringify(body) });
    }
    function once() { return fetchSha().then(putSha); }
    return once().then(function (res) {
      if (res.status !== 409) {
        if (!res.ok) throw new Error(ghMessage(res));
        return res.json();
      }
      return once().then(function (retry) {
        if (!retry.ok) throw new Error(ghMessage(retry));
        return retry.json();
      });
    });
  }
  function saveAll() {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    settleSongs();
    var iso = dotToIso(viewJ.date);
    if (!iso) { setEditStatus("날짜를 2026년 10월 18일 처럼 적어 주세요."); return; }
    writeDraft(viewJ, viewC);
    downloadFiles();
    var token = tokenValue();
    var box = document.getElementById("tokenbox");
    if (!token) {
      if (box) box.hidden = false;
      setEditStatus("이 휴대폰에 저장하고 파일을 내려받았습니다. 홈페이지에 올리려면 토큰을 넣어 주세요.");
      return;
    }
    var buttons = [document.getElementById("edit-save"), document.getElementById("token-go")];
    buttons.forEach(function (btn) { if (btn) btn.disabled = true; });
    setEditStatus("깃허브에 올리는 중입니다. 잠시만 기다려 주세요.");
    var message = "목사님 주보 수정 " + iso;
    var jobs = [
      ghPut("data/" + iso + ".js", weekFile(viewJ), message, token),
      ghPut("data/current.js", currentFile(iso), message, token)
    ];
    var churchNow = withoutRoleMap(viewC);
    var churchWas = withoutRoleMap(fileChurch);
    if (fileChurch && JSON.stringify(churchNow) !== JSON.stringify(churchWas)) jobs.push(ghPut("data/church.js", churchFile(viewC), message, token));
    Promise.all(jobs).then(function () {
      showToast("저장되었습니다. 사이트와 PPT에 반영됩니다.");
    }).catch(function () {
      showToast("저장은 되었지만 사이트 올리기에 실패했습니다. 잠시 후 다시 저장해 주세요.", true);
    }).then(function () {
      buttons.forEach(function (btn) { if (btn) btn.disabled = false; });
    });
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (document.querySelector('script[src="' + src + '"]')) { resolve(); return; }
      var s = document.createElement("script");
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error("script")); };
      document.head.appendChild(s);
    });
  }
  function setPdfStatus(msg) {
    setEditStatus(msg);
    var how = document.getElementById("howto");
    if (!how) return;
    var note = document.getElementById("pdf-status");
    if (!note) {
      note = document.createElement("p");
      note.id = "pdf-status";
      note.className = "print-note no-print";
      how.appendChild(note);
    }
    note.textContent = msg || "";
  }
  function sheetOrder(list) {
    return list.slice().sort(function (a, b) {
      var fa = a.querySelector(".folio");
      var fb = b.querySelector(".folio");
      return (fa ? parseInt(fa.textContent, 10) : 0) - (fb ? parseInt(fb.textContent, 10) : 0);
    });
  }
  function bookletPdf() {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    settleSongs();
    var prev = mode;
    mode = "single";
    applyMode();
    var book = document.getElementById("book");
    var prevStyle = book.getAttribute("style");
    book.style.transform = "none";
    book.style.marginLeft = "0px";
    book.style.marginBottom = "0px";
    sheetZoom("");
    document.body.classList.add("pdf-capture");
    var buttons = [].slice.call(document.querySelectorAll("#do-booklet-pdf, #edit-fold-pdf"));
    buttons.forEach(function (b) { b.disabled = true; });
    setPdfStatus("PDF를 만드는 중입니다. 잠시만 기다려 주세요.");
    function restore() {
      document.body.classList.remove("pdf-capture");
      buttons.forEach(function (b) { b.disabled = false; });
      if (prevStyle) book.setAttribute("style", prevStyle);
      else book.removeAttribute("style");
      if (prev !== mode) { mode = prev; applyMode(); }
      if (editing) fitWidth();
    }
    var resultMsg = "";
    var fontsReady = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
    return fontsReady.then(function () {
      return loadScript("https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js");
    }).then(function () {
      return loadScript("https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js");
    }).then(function () {
      var sheets = sheetOrder([].slice.call(document.querySelectorAll("#book > .sheet")));
      if (sheets.length !== 4) throw new Error("pages");
      var images = [];
      var chain = Promise.resolve();
      sheets.forEach(function (sheet) {
        chain = chain.then(function () {
          sheet.scrollIntoView({ block: "start" });
          return window.html2canvas(sheet, {
            scale: 3,
            backgroundColor: "#ffffff",
            useCORS: true,
            logging: false,
            scrollX: 0,
            scrollY: -window.scrollY
          }).then(function (canvas) {
            images.push(canvas.toDataURL("image/jpeg", 0.95));
          });
        });
      });
      return chain.then(function () {
        var pdf = new window.jspdf.jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
        var safe = 7;
        var halfW = 148.5;
        var pageW = halfW - safe * 2;
        var pageH = 297 * pageW / 210;
        var my = (210 - pageH) / 2;
        function place(index, col) {
          pdf.addImage(images[index], "JPEG", col * halfW + safe, my, pageW, pageH);
        }
        place(3, 0);
        place(0, 1);
        pdf.addPage("a4", "landscape");
        place(1, 0);
        place(2, 1);
        var iso = (viewJ && dotToIso(viewJ.date)) || week || "jubo";
        pdf.save("jubo-booklet-" + iso + ".pdf");
        resultMsg = "접는 주보 PDF를 내려받았습니다. 배율 100%로 인쇄하세요.";
      });
    }).catch(function () {
      resultMsg = "PDF를 만들지 못했습니다. 접는 주보 인쇄로 저장해 주세요.";
    }).then(function () {
      restore();
      if (resultMsg) setPdfStatus(resultMsg);
    });
  }
  function printAs(next) {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    settleSongs();
    mode = next;
    applyMode();
    fitWidth();
    setTimeout(function () { window.print(); }, 80);
  }
  document.addEventListener("input", function (e) {
    var el = e.target.closest && e.target.closest(".ed");
    if (!el) return;
    var key = el.getAttribute("data-k");
    document.querySelectorAll(".ed").forEach(function (other) {
      if (other !== el && other.getAttribute("data-k") === key) other.textContent = el.textContent;
    });
    if (key === "date" || key === "when") syncDate(el);
    if (key && /\.song$/.test(key)) {
      var songRowEl = el.closest(".songrow");
      if (songRowEl) {
        var songEmpty = blank(plain(el));
        songRowEl.classList.toggle("no-print", songEmpty);
        songRowEl.classList.toggle("song-empty", songEmpty);
      }
    }
    scheduleSave();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Enter") return;
    var el = e.target.closest && e.target.closest(".ed");
    if (!el) return;
    var key = el.getAttribute("data-k") || "";
    var multi = key.indexOf("news.") === 0 || key === "praise" || key === "ch.addr" || key === "ch.invite";
    if (!multi) e.preventDefault();
  });
  document.addEventListener("focusin", function (e) {
    var el = e.target && e.target.closest ? e.target.closest(".ed") : null;
    if (!el) return;
    document.querySelectorAll(".ed.on").forEach(function (n) { if (n !== el) n.classList.remove("on"); });
    el.classList.add("on");
  });
  document.addEventListener("focusout", function (e) {
    var el = e.target && e.target.classList && e.target.classList.contains("ed") ? e.target : null;
    if (!el) return;
    el.classList.remove("on");
    commitRoleField(el, true);
    if (isRoleField(el.getAttribute("data-k") || "")) scheduleSave();
  });
  document.addEventListener("paste", function (e) {
    var el = e.target.closest && e.target.closest(".ed");
    if (!el) return;
    e.preventDefault();
    var text = (e.clipboardData || window.clipboardData).getData("text");
    document.execCommand("insertText", false, text);
  });
  document.addEventListener("click", function (e) {
    var btn = e.target.closest && e.target.closest("button");
    if (!btn || !editing) return;
    if (btn.id === "edit-new") return makeNew();
    if (btn.id === "edit-save" || btn.id === "token-go") return saveAll();
    if (btn.id === "edit-reset") return resetDraft();
    if (btn.id === "edit-fold") return printAs("booklet");
    if (btn.id === "edit-fold-pdf") return bookletPdf();
    if (btn.id === "edit-single") return printAs("single");
    if (btn.id === "file-go") { harvest(); downloadFiles(); setEditStatus("파일을 내려받았습니다."); return; }
    if (btn.id === "edit-more") {
      var more = document.getElementById("edit-more-box");
      if (!more) return;
      more.hidden = !more.hidden;
      btn.setAttribute("aria-expanded", more.hidden ? "false" : "true");
      return;
    }
    if (btn.id === "roles-open") {
      var box = document.getElementById("roles-box");
      if (box) box.hidden = !box.hidden;
      return;
    }
    if (btn.id === "roles-save") {
      var pasted = document.getElementById("roles-text");
      var n = storeRoles(parseRoleText(pasted ? pasted.value : ""));
      setEditStatus(n ? "직분표 " + n + "명을 이 휴대폰에 저장했습니다." : "이름,직분 형식의 줄을 찾지 못했습니다.");
      return;
    }
    if (btn.getAttribute("data-add") === "song") {
      songOpen[Number(btn.getAttribute("data-i"))] = true;
      harvest();
      render(viewC, viewJ, dotToIso(viewJ.date));
      var songField = document.querySelector('.ed[data-k="ord.' + btn.getAttribute("data-i") + '.song"]');
      if (songField) songField.focus();
      return;
    }
    if (btn.getAttribute("data-add")) return addRow(btn.getAttribute("data-add"));
    if (btn.getAttribute("data-del")) return delRow(btn.getAttribute("data-del"), Number(btn.getAttribute("data-i")));
  });
  document.addEventListener("change", function (e) {
    if (editing && e.target.id === "roles-file" && e.target.files && e.target.files[0]) {
      var file = e.target.files[0];
      var reader = new FileReader();
      reader.onload = function () {
        var n = storeRoles(parseRoleText(String(reader.result || "")));
        setEditStatus(n ? "직분표 " + n + "명을 이 휴대폰에 저장했습니다." : "이름,직분 형식의 줄을 찾지 못했습니다.");
      };
      reader.readAsText(file, "UTF-8");
      return;
    }
    if (!editing || e.target.id !== "edit-week") return;
    try { harvest(); writeDraft(viewJ, viewC); } catch (err) {}
    location.href = "print.html?edit=1&week=" + encodeURIComponent(e.target.value);
  });
  window.addEventListener("resize", function () { if (editing) fitWidth(); });
  window.addEventListener("beforeprint", function () {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    settleSongs();
    var book = document.getElementById("book");
    if (book) { book.style.transform = "none"; book.style.marginLeft = "0px"; book.style.marginBottom = "0px"; }
    sheetZoom("");
  });
  window.addEventListener("afterprint", function () {
    var book = document.getElementById("book");
    if (book && !editing) { book.style.transform = ""; book.style.marginLeft = ""; book.style.marginBottom = ""; }
    if (!editing) return;
    if (mode !== "single") { mode = "single"; applyMode(); }
    fitWidth();
  });

  ingestRoleHash();
  fileChurch = clone(window.CHURCH);
  if (q.get("draft") === "1" && !editing) {
    var pack = null;
    try { pack = JSON.parse(localStorage.getItem("hmj-preview") || ""); } catch (e) {}
    if (!pack || !pack.jubo) {
      document.getElementById("book").innerHTML = '<p class="err">미리보기 내용을 찾지 못했습니다. 수정 화면에서 다시 열어 주세요.</p>';
      return;
    }
    var dw = pack.week || week;
    if (window.JUBO_WEEKS && dw && window.JUBO_WEEKS.indexOf(dw) < 0) window.JUBO_WEEKS = [dw].concat(window.JUBO_WEEKS);
    renderChrome(dw);
    var back = document.querySelector("#tools .brand");
    if (back) back.setAttribute("href", "edit.html" + (dw ? "?week=" + encodeURIComponent(dw) : ""));
    pack.jubo.newcomers = trimVisitors(pack.jubo.newcomers);
    render(window.CHURCH, pack.jubo, dw);
    return;
  }

  renderChrome(week);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week || "")) {
    document.getElementById("book").innerHTML = '<p class="err">주보 날짜를 찾을 수 없습니다.</p>';
    return;
  }
  function showLoaded(J) {
    if (editing) {
      var draft = drafts()[week];
      var jubo = clone((draft && draft.jubo) ? draft.jubo : J);
      var church = (draft && draft.church) ? draft.church : window.CHURCH;
      jubo.newcomers = trimVisitors(jubo.newcomers);
      if (applyLoadedRoles(jubo)) writeDraft(jubo, church);
      render(church, jubo, week);
      if (draft && draft.jubo) setEditStatus("이 휴대폰에 남겨 둔 수정을 불러왔습니다.");
      return;
    }
    J = clone(J);
    J.newcomers = trimVisitors(J.newcomers);
    render(window.CHURCH, J, week);
  }
  var s = document.createElement("script");
  s.src = "data/" + week + ".js?v=20261026g";
  s.onload = function () { showLoaded(window.JUBO); };
  s.onerror = function () {
    var draft = editing ? drafts()[week] : null;
    if (draft && draft.jubo) showLoaded(draft.jubo);
    else document.getElementById("book").innerHTML = '<p class="err">' + week + " 주보 파일을 찾을 수 없습니다.</p>";
  };
  document.head.appendChild(s);
})();
