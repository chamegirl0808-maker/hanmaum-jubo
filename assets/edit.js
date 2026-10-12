(function () {
  var DRAFTS = "hmj-drafts";
  var TOKEN = "hmj-github-token";
  var PREVIEW = "hmj-preview";
  var REPO = "chamegirl0808-maker/hanmaum-jubo";
  var ready = false;
  var saveTimer = null;
  var headlineOriginal = [];
  var headlineOriginalText = "";

  var q = new URLSearchParams(location.search);
  var weeks = (window.JUBO_WEEKS || []).slice();
  var currentId = q.get("week") || window.JUBO_CURRENT || weeks[0];

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function isoOf(y, m, d) { return y + "-" + pad(m) + "-" + pad(d); }
  function dotOf(y, m, d) { return y + "." + pad(m) + "." + pad(d); }
  function parts(iso) {
    var p = String(iso || "").split("-");
    return { y: Number(p[0]), m: Number(p[1]), d: Number(p[2]) };
  }
  function validIso(iso) {
    var p = parts(iso);
    if (!p.y || !p.m || !p.d) return false;
    var dt = new Date(p.y, p.m - 1, p.d);
    return dt.getFullYear() === p.y && dt.getMonth() === p.m - 1 && dt.getDate() === p.d;
  }
  function isoFromDot(dot) {
    var p = String(dot || "").split(".");
    if (p.length < 3) return "";
    return isoOf(Number(p[0]), Number(p[1]), Number(p[2]));
  }
  function addDays(iso, n) {
    var p = parts(iso);
    var dt = new Date(p.y, p.m - 1, p.d);
    dt.setDate(dt.getDate() + n);
    return isoOf(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
  }
  function bumpIssue(issue, iso) {
    var year = parts(iso).y || "";
    var m = String(issue || "").match(/제\s*(\d+)\s*호/);
    var n = m ? Number(m[1]) + 1 : 1;
    return year + " - 제" + n + "호";
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function drafts() {
    try { return JSON.parse(localStorage.getItem(DRAFTS) || "{}"); } catch (e) { return {}; }
  }
  function writeDraft(id, jubo) {
    var all = drafts();
    all[id] = { at: Date.now(), jubo: jubo };
    localStorage.setItem(DRAFTS, JSON.stringify(all));
  }
  function setStatus(msg) {
    var el = document.getElementById("status");
    if (el) el.textContent = msg || "";
  }
  function $(id) { return document.getElementById(id); }

  function loadScript(id) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = "data/" + id + ".js";
      s.onload = function () { resolve(clone(window.JUBO)); };
      s.onerror = function () { reject(new Error("missing")); };
      document.head.appendChild(s);
    });
  }

  function orderRow(o) {
    var section = !!o.section && !o.name;
    return '<article class="item row" data-kind="' + (section ? "section" : "item") + '">' +
      '<label>종류<select class="kind"><option value="item"' + (section ? "" : " selected") + '>예배 순서</option>' +
      '<option value="section"' + (section ? " selected" : "") + ">구간 제목</option></select></label>" +
      '<div class="as-item"' + (section ? ' hidden' : "") + ">" +
      '<label>순서 이름<input class="name" value="' + escAttr(o.name || "") + '"></label>' +
      '<label>내용<input class="mid" value="' + escAttr(o.mid || "") + '"></label>' +
      '<label>담당<input class="by" value="' + escAttr(o.by || "") + '"></label>' +
      '<label class="check"><input type="checkbox" class="stand"' + (o.stand ? " checked" : "") + "> 일어섬 ※</label>" +
      '<label class="check"><input type="checkbox" class="song"' + (o.song ? " checked" : "") + "> 찬양 ♬</label>" +
      '<label class="check"><input type="checkbox" class="strong"' + (o.strong ? " checked" : "") + "> 크게 표시</label>" +
      "</div>" +
      '<div class="as-section"' + (section ? "" : " hidden") + ">" +
      '<label>구간 이름<input class="section" value="' + escAttr(o.section || "") + '"></label>' +
      '<label>구간 찬양 (없으면 비움)<input class="secsong" value="' + escAttr(section ? (o.song || "") : "") + '"></label>' +
      "</div>" +
      '<div class="row-actions"><button type="button" class="up">위로</button><button type="button" class="down">아래로</button><button type="button" class="del warn">삭제</button></div>' +
      "</article>";
  }
  function textItem(value, placeholder) {
    return '<article class="item line"><textarea>' + escText(value || "") + "</textarea>" +
      '<div class="row-actions"><button type="button" class="up">위로</button><button type="button" class="down">아래로</button><button type="button" class="del warn">삭제</button></div></article>';
  }
  function serverItem(r) {
    r = r || ["", "", "", "", "", ""];
    var labels = ["일", "설교", "기도", "헌금", "성경봉독", "주요 행사"];
    return '<article class="item server">' + labels.map(function (label, i) {
      return "<label>" + label + '<input class="c' + i + '" value="' + escAttr(r[i] || "") + '"></label>';
    }).join("") +
      '<div class="row-actions"><button type="button" class="up">위로</button><button type="button" class="down">아래로</button><button type="button" class="del warn">삭제</button></div></article>';
  }
  function personItem(r) {
    r = r || ["", "", "", ""];
    var labels = ["번호", "이름", "인도자", "소속"];
    return '<article class="item person">' + labels.map(function (label, i) {
      return "<label>" + label + '<input class="c' + i + '" value="' + escAttr(r[i] || "") + '"></label>';
    }).join("") +
      '<div class="row-actions"><button type="button" class="up">위로</button><button type="button" class="down">아래로</button><button type="button" class="del warn">삭제</button></div></article>';
  }
  function moneyItem(pair) {
    pair = pair || ["", ""];
    return '<article class="item money"><label>항목<input class="k" value="' + escAttr(pair[0] || "") + '"></label>' +
      '<label>이름<input class="v" value="' + escAttr(pair[1] || "") + '"></label>' +
      '<div class="row-actions"><button type="button" class="up">위로</button><button type="button" class="down">아래로</button><button type="button" class="del warn">삭제</button></div></article>';
  }
  function escAttr(s) {
    return String(s == null ? "" : s).replace(/[&"]/g, function (c) { return c === "&" ? "&amp;" : "&quot;"; }).replace(/</g, "&lt;");
  }
  function escText(s) { return escAttr(s); }

  function findRow(name) {
    var rows = document.querySelectorAll("#order-list .row");
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].getAttribute("data-kind") === "item" && rows[i].querySelector(".name").value === name) return rows[i];
    }
    return null;
  }

  function readOrder() {
    return [].map.call(document.querySelectorAll("#order-list .row"), function (row) {
      if (row.querySelector(".kind").value === "section") {
        var sec = { section: row.querySelector(".section").value };
        var song = row.querySelector(".secsong").value.trim();
        if (song) sec.song = song;
        return sec;
      }
      var item = { name: row.querySelector(".name").value };
      if (row.querySelector(".stand").checked) item.stand = true;
      var mid = row.querySelector(".mid").value;
      if (mid) item.mid = mid;
      if (row.querySelector(".song").checked) item.song = true;
      if (row.querySelector(".strong").checked) item.strong = true;
      item.by = row.querySelector(".by").value;
      return item;
    });
  }
  function readLines(id) {
    return [].map.call(document.querySelectorAll("#" + id + " textarea"), function (t) { return t.value; });
  }
  function readServers() {
    return [].map.call(document.querySelectorAll("#server-list .server"), function (row) {
      return [0, 1, 2, 3, 4, 5].map(function (i) { return row.querySelector(".c" + i).value; });
    });
  }
  function readPeople() {
    return [].map.call(document.querySelectorAll("#people-list .person"), function (row) {
      return [0, 1, 2, 3].map(function (i) { return row.querySelector(".c" + i).value; });
    });
  }
  function readMoney(id) {
    return [].map.call(document.querySelectorAll("#" + id + " .money"), function (row) {
      return [row.querySelector(".k").value, row.querySelector(".v").value];
    });
  }

  function collect() {
    var iso = $("f-date").value;
    var p = parts(iso);
    var headlineNow = $("f-headline").value;
    var headline = headlineNow === headlineOriginalText ? headlineOriginal : [headlineNow];
    var order = readOrder();
    var sermon = null, reading = null;
    order.forEach(function (o) {
      if (o.name === "설교" && !sermon) sermon = o;
      if (o.name === "성경봉독" && !reading) reading = o;
    });
    if (!sermon) { sermon = { name: "설교", strong: true, by: "" }; order.push(sermon); }
    if (!reading) { reading = { name: "성경봉독", strong: true, by: "" }; order.push(reading); }
    sermon.mid = $("f-title").value;
    sermon.by = $("f-preacher").value;
    reading.mid = $("f-scripture").value;
    var season = $("f-season").value.trim();
    var J = {
      date: p.y ? dotOf(p.y, p.m, p.d) : "",
      issue: $("f-issue").value
    };
    if (season) J.season = season;
    J.service = { time: $("f-time").value, leader: $("f-leader").value };
    Object.assign(J, {
      praise: $("f-praise").value,
      order: order,
      newsHeadline: headline,
      prayers: readLines("prayer-list"),
      news: readLines("news-list"),
      month: p.m ? String(p.m) : "",
      servers: readServers(),
      newcomers: readPeople(),
      offerings: readMoney("offer-list"),
      youth: readMoney("youth-list")
    });
    return J;
  }

  function weekFile(J) {
    var comment = "// ===== " + (J.date || "") + " (" + (J.issue || "") + ") 주보 데이터 =====\n";
    return comment + "window.JUBO = " + JSON.stringify(J, null, 2) + ";\n";
  }
  function currentFile(id) {
    var list = weeks.filter(function (w, i) { return weeks.indexOf(w) === i; });
    if (list.indexOf(id) < 0) list.push(id);
    list.sort().reverse();
    return "// 기본으로 보여줄 주보 날짜 (매주 이 값만 바꾸면 됩니다)\n" +
      "window.JUBO_CURRENT = " + JSON.stringify(list[0]) + ";\n" +
      "window.JUBO_WEEKS = " + JSON.stringify(list) + ";\n";
  }

  function fill(J) {
    headlineOriginal = (J.newsHeadline || []).slice();
    headlineOriginalText = headlineOriginal.join("");
    var iso = isoFromDot(J.date);
    $("f-date").value = validIso(iso) ? iso : "";
    $("f-issue").value = J.issue || "";
    $("f-season").value = J.season || "";
    $("f-time").value = (J.service && J.service.time) || "";
    $("f-leader").value = (J.service && J.service.leader) || "";
    $("f-praise").value = J.praise || "";
    $("f-headline").value = headlineOriginalText;
    var sermon = null, reading = null;
    (J.order || []).forEach(function (o) {
      if (o.name === "설교" && !sermon) sermon = o;
      if (o.name === "성경봉독" && !reading) reading = o;
    });
    $("f-title").value = sermon && sermon.mid || "";
    $("f-scripture").value = reading && reading.mid || "";
    $("f-preacher").value = sermon && sermon.by || "";
    $("order-list").innerHTML = (J.order || []).map(orderRow).join("");
    $("prayer-list").innerHTML = (J.prayers || []).map(textItem).join("");
    $("news-list").innerHTML = (J.news || []).map(textItem).join("");
    $("server-list").innerHTML = (J.servers || []).map(serverItem).join("");
    $("people-list").innerHTML = (J.newcomers || []).map(personItem).join("");
    $("offer-list").innerHTML = (J.offerings || []).map(moneyItem).join("");
    $("youth-list").innerHTML = (J.youth || []).map(moneyItem).join("");
    updateFileNote();
  }

  function updateFileNote() {
    var iso = $("f-date") && $("f-date").value;
    var note = $("file-note");
    if (!note) return;
    note.textContent = validIso(iso) ? ("저장 파일 이름: data/" + iso + ".js") : "날짜를 골라 주세요.";
  }

  function flush() {
    if (!ready || !$("f-date")) return;
    clearTimeout(saveTimer);
    var iso = $("f-date").value;
    if (!validIso(iso)) return;
    try { writeDraft(iso, collect()); } catch (e) {}
  }
  function scheduleSave() {
    if (!ready) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try {
        var J = collect();
        var iso = $("f-date").value;
        if (!validIso(iso)) return;
        writeDraft(iso, J);
        var note = $("autosave");
        if (note) note.textContent = "이 휴대폰에 임시로 저장했습니다.";
      } catch (e) { setStatus("임시 저장을 하지 못했습니다."); }
    }, 400);
  }

  function shell(weekList, selected) {
    var opts = weekList.map(function (w) {
      return '<option value="' + escAttr(w) + '"' + (w === selected ? " selected" : "") + ">" + escText(w) + "</option>";
    }).join("");
    var saved = "";
    try { saved = localStorage.getItem(TOKEN) ? "이 휴대폰에 토큰이 저장되어 있습니다." : ""; } catch (e) {}
    $("app").innerHTML =
      '<section class="card"><h2>이렇게 고칩니다</h2>' +
      '<ol class="steps"><li>날짜를 고르거나 <b>새 주보 만들기</b>를 누릅니다.</li>' +
      '<li>칸을 고쳐 적습니다. 적다 보면 이 휴대폰에 자동으로 남습니다.</li>' +
      '<li><b>미리보기/인쇄</b>로 종이 주보를 확인합니다.</li>' +
      '<li>홈페이지에도 올리려면 <b>깃허브에 저장</b>을 누릅니다. 토큰은 처음에 한 번만 넣으면 됩니다.</li>' +
      '<li>토큰이 어려우면 <b>파일로 내려받기</b>를 눌러 파일을 가족에게 보내 주세요.</li></ol>' +
      '<p class="hint">[설교 제목]처럼 괄호 안을 붙여 쓰면 주보에 빈칸으로 표시됩니다. [ 새 가족 환영 ]처럼 띄어 쓰면 그대로 나옵니다.</p></section>' +
      '<section class="card"><h2>어느 주보</h2>' +
      '<label>불러올 날짜<select id="week-pick">' + opts + "</select></label>" +
      '<div class="add-row"><button type="button" id="new-week" class="primary">새 주보 만들기</button>' +
      '<button type="button" id="reset-week">처음 내용으로 되돌리기</button></div>' +
      '<p class="file-note" id="file-note"></p><p class="hint" id="autosave"></p></section>' +
      '<section class="card"><h2>표지</h2>' +
      '<div class="row2"><label>날짜<input id="f-date" type="date"></label><label>호수<input id="f-issue"></label></div>' +
      '<label>절기 (없으면 비워 두세요)<input id="f-season" placeholder="예: 창조절"></label>' +
      '<div class="row2"><label>예배 시간<input id="f-time"></label><label>인도<input id="f-leader"></label></div>' +
      '<label>설교 제목<input id="f-title"></label>' +
      '<label>성경 본문<input id="f-scripture"></label>' +
      '<label>설교자<input id="f-preacher"></label>' +
      '<label>찬양<textarea id="f-praise"></textarea></label></section>' +
      '<section class="card"><h2>예배 순서</h2><div id="order-list"></div>' +
      '<div class="add-row"><button type="button" id="add-item">순서 추가</button><button type="button" id="add-section">구간 추가</button></div></section>' +
      '<section class="card"><h2>소식과 기도</h2>' +
      '<label>소식 위에 나오는 문장<textarea id="f-headline"></textarea></label>' +
      '<h2>기도 제목</h2><div id="prayer-list"></div><button type="button" id="add-prayer">기도 추가</button>' +
      '<h2>교회 소식</h2><div id="news-list"></div><button type="button" id="add-news">소식 추가</button></section>' +
      '<section class="card"><h2>예배위원과 주요 행사</h2><div id="server-list"></div><button type="button" id="add-server">위원 줄 추가</button></section>' +
      '<section class="card"><h2>새가족</h2><div id="people-list"></div><button type="button" id="add-person">새가족 추가</button></section>' +
      '<section class="card"><h2>헌금자</h2><div id="offer-list"></div><button type="button" id="add-offer">헌금 항목 추가</button>' +
      '<h2>청소년부 헌금</h2><div id="youth-list"></div><button type="button" id="add-youth">청소년 항목 추가</button></section>' +
      '<section class="card"><h2>깃허브에 저장</h2>' +
      '<p class="hint">저장하면 한마음제자교회 홈페이지 주보가 바뀝니다. 토큰은 이 휴대폰에만 남고, 다른 곳으로 보내지 않습니다.</p>' +
      '<p class="file-note" id="token-state">' + escText(saved) + "</p>" +
      '<label>깃허브 토큰<input id="f-token" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="github_pat_..."></label>' +
      '<div class="add-row"><button type="button" id="save-token">토큰 기억하기</button><button type="button" id="clear-token" class="warn">토큰 지우기</button></div>' +
      '<details open><summary>토큰을 처음 넣는 방법</summary><ol class="steps">' +
      "<li>컴퓨터에서 github.com 에 로그인합니다.</li>" +
      "<li>오른쪽 위 사진 → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token.</li>" +
      "<li>Repository access 에서 Only select repositories 를 고르고 hanmaum-jubo 만 선택합니다.</li>" +
      "<li>Permissions 에서 Contents 를 Read and write 로 바꿉니다.</li>" +
      "<li>Generate token 을 누르고, 나온 토큰을 복사해 위 칸에 붙여 넣은 뒤 토큰 기억하기를 누릅니다.</li>" +
      "</ol><p class=\"hint\">토큰은 비밀번호와 같습니다. 단톡방이나 문자로 보내지 마세요.</p></details></section>";
    $("actions").hidden = false;
  }

  function show(J, fromDraft) {
    fill(J);
    ready = true;
    setStatus(fromDraft ? "이 휴대폰에 남겨 둔 수정을 불러왔습니다." : "");
  }

  function ensureOption(id) {
    var sel = $("week-pick");
    var found = false;
    [].forEach.call(sel.options, function (o) { if (o.value === id) found = true; });
    if (!found) {
      var opt = document.createElement("option");
      opt.value = id;
      opt.textContent = id;
      sel.insertBefore(opt, sel.firstChild);
    }
    sel.value = id;
    if (weeks.indexOf(id) < 0) weeks.unshift(id);
  }

  $("app").addEventListener("input", function (e) {
    var row = e.target.closest && e.target.closest(".row");
    if (row && row.getAttribute("data-kind") === "item") {
      var name = row.querySelector(".name").value;
      if (name === "설교" && e.target.classList.contains("mid")) $("f-title").value = e.target.value;
      if (name === "설교" && e.target.classList.contains("by")) $("f-preacher").value = e.target.value;
      if (name === "성경봉독" && e.target.classList.contains("mid")) $("f-scripture").value = e.target.value;
    }
    if (e.target.id === "f-title" || e.target.id === "f-preacher" || e.target.id === "f-scripture") {
      var sermon = findRow("설교");
      var reading = findRow("성경봉독");
      if (sermon && e.target.id === "f-title") sermon.querySelector(".mid").value = e.target.value;
      if (sermon && e.target.id === "f-preacher") sermon.querySelector(".by").value = e.target.value;
      if (reading && e.target.id === "f-scripture") reading.querySelector(".mid").value = e.target.value;
    }
    updateFileNote();
    scheduleSave();
  });
  $("app").addEventListener("change", function (e) {
    if (e.target.classList && e.target.classList.contains("kind")) {
      var row = e.target.closest(".row");
      var section = e.target.value === "section";
      row.setAttribute("data-kind", section ? "section" : "item");
      row.querySelector(".as-item").hidden = section;
      row.querySelector(".as-section").hidden = !section;
    }
    if (e.target.id === "week-pick") openWeek(e.target.value);
    scheduleSave();
  });
  $("app").addEventListener("click", function (e) {
    var btn = e.target.closest("button");
    if (!btn) return;
    if (btn.id === "new-week") return makeNew();
    if (btn.id === "reset-week") return resetWeek();
    if (btn.id === "add-item") return addOrder({ name: "", mid: "", by: "" });
    if (btn.id === "add-section") return addOrder({ section: "" });
    if (btn.id === "add-prayer") return addLine("prayer-list");
    if (btn.id === "add-news") return addLine("news-list");
    if (btn.id === "add-server") return addBlock("server-list", serverItem(["", "", "", "", "", ""]));
    if (btn.id === "add-person") return addBlock("people-list", personItem(["", "", "", ""]));
    if (btn.id === "add-offer") return addBlock("offer-list", moneyItem(["", ""]));
    if (btn.id === "add-youth") return addBlock("youth-list", moneyItem(["", ""]));
    if (btn.id === "save-token") return saveToken();
    if (btn.id === "clear-token") return clearToken();
    var item = btn.closest(".item");
    if (!item) return;
    var list = item.parentElement;
    if (btn.classList.contains("del")) item.remove();
    if (btn.classList.contains("up") && item.previousElementSibling) list.insertBefore(item, item.previousElementSibling);
    if (btn.classList.contains("down") && item.nextElementSibling) list.insertBefore(item.nextElementSibling, item);
    scheduleSave();
  });

  function addOrder(obj) {
    $("order-list").insertAdjacentHTML("beforeend", orderRow(obj));
    scheduleSave();
  }
  function addLine(id) {
    $(id).insertAdjacentHTML("beforeend", textItem(""));
    scheduleSave();
  }
  function addBlock(id, html) {
    $(id).insertAdjacentHTML("beforeend", html);
    scheduleSave();
  }

  function makeNew() {
    flush();
    var J = collect();
    var iso = $("f-date").value;
    if (!validIso(iso)) { setStatus("날짜를 먼저 골라 주세요."); return; }
    var next = addDays(iso, 7);
    J.date = dotOf(parts(next).y, parts(next).m, parts(next).d);
    J.month = String(parts(next).m);
    J.issue = bumpIssue(J.issue, next);
    delete J.season;
    J.order.forEach(function (o) {
      if (o.name === "설교") { o.mid = ""; o.by = ""; }
      if (o.name === "성경봉독") o.mid = "";
    });
    ensureOption(next);
    show(J, false);
    setStatus("지난 주보를 복사했습니다. 설교 제목, 본문, 설교자는 비워 두었습니다.");
    scheduleSave();
  }
  function resetWeek() {
    var id = $("week-pick").value;
    ready = false;
    loadScript(id).then(function (J) {
      var all = drafts();
      delete all[id];
      localStorage.setItem(DRAFTS, JSON.stringify(all));
      show(J, false);
      setStatus("저장된 파일 내용으로 되돌렸습니다.");
    }).catch(function () { setStatus("되돌릴 파일을 찾지 못했습니다."); });
  }
  function saveToken() {
    var value = $("f-token").value.trim();
    if (!value) { setStatus("토큰을 붙여 넣어 주세요."); return; }
    localStorage.setItem(TOKEN, value);
    $("f-token").value = "";
    $("token-state").textContent = "이 휴대폰에 토큰이 저장되어 있습니다.";
    setStatus("토큰을 이 휴대폰에 기억했습니다.");
  }
  function clearToken() {
    localStorage.removeItem(TOKEN);
    $("token-state").textContent = "";
    setStatus("이 휴대폰에서 토큰을 지웠습니다.");
  }
  function tokenValue() {
    var typed = $("f-token").value.trim();
    if (typed) {
      localStorage.setItem(TOKEN, typed);
      $("f-token").value = "";
      $("token-state").textContent = "이 휴대폰에 토큰이 저장되어 있습니다.";
    }
    return localStorage.getItem(TOKEN) || "";
  }

  function openWeek(id) {
    flush();
    ready = false;
    var draft = drafts()[id];
    if (draft && draft.jubo) { show(draft.jubo, true); return; }
    loadScript(id).then(function (J) { show(J, false); }).catch(function () {
      setStatus("그 날짜의 주보 파일을 찾지 못했습니다.");
    });
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
    return fetch(url + "?ref=main", { headers: headers }).then(function (res) {
      if (res.status === 401 || res.status === 403) throw new Error(ghMessage(res));
      var shaPromise = res.status === 200 ? res.json().then(function (data) { return data.sha; }) : Promise.resolve(null);
      if (res.status !== 200 && res.status !== 404) throw new Error(ghMessage(res));
      return shaPromise;
    }).then(function (sha) {
      var body = { message: message, content: toB64(text), branch: "main" };
      if (sha) body.sha = sha;
      return fetch(url, { method: "PUT", headers: headers, body: JSON.stringify(body) });
    }).then(function (res) {
      if (!res.ok) throw new Error(ghMessage(res));
      return res.json();
    });
  }

  $("preview-btn").addEventListener("click", function () {
    var iso = $("f-date").value;
    if (!validIso(iso)) { setStatus("날짜를 골라 주세요."); return; }
    var J = collect();
    writeDraft(iso, J);
    localStorage.setItem(PREVIEW, JSON.stringify({ week: iso, jubo: J }));
    location.href = "print.html?draft=1";
  });
  $("download-btn").addEventListener("click", function () {
    var iso = $("f-date").value;
    if (!validIso(iso)) { setStatus("날짜를 골라 주세요."); return; }
    var J = collect();
    download(iso + ".js", weekFile(J));
    setTimeout(function () { download("current.js", currentFile(iso)); }, 400);
    setStatus("파일 두 개를 내려받았습니다. 가족에게 보내 주세요.");
  });
  $("github-btn").addEventListener("click", function () {
    var iso = $("f-date").value;
    if (!validIso(iso)) { setStatus("날짜를 골라 주세요."); return; }
    var token = tokenValue();
    if (!token) { setStatus("토큰을 먼저 넣어 주세요."); return; }
    var J = collect();
    var btn = $("github-btn");
    btn.disabled = true;
    setStatus("깃허브에 저장하는 중입니다. 잠시만 기다려 주세요.");
    var message = "주보 " + J.date + " 수정";
    ghPut("data/" + iso + ".js", weekFile(J), message, token).then(function () {
      return ghPut("data/current.js", currentFile(iso), message, token);
    }).then(function () {
      setStatus("깃허브에 저장했습니다. 1~2분 뒤 홈페이지에 나타납니다.");
    }).catch(function (err) {
      setStatus(err && err.message ? err.message : "인터넷 연결을 확인해 주세요.");
    }).then(function () { btn.disabled = false; });
  });

  function download(name, text) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/javascript;charset=utf-8" }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  shell(weeks, currentId);
  openWeek(currentId);
})();
