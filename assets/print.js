(function () {
  var q = new URLSearchParams(location.search);
  var requested = q.get("week");
  var week = requested || window.JUBO_CURRENT;
  var mode = q.get("fold") === "1" ? "booklet" : "single";

  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function t(x) {
    return esc(x).replace(/\[([^\s\]][^\]]*)\]/g, '<mark class="ph">[$1]</mark>').replace(/\n/g, "<br>");
  }
  function blank(x) { return String(x == null ? "" : x).trim() === ""; }
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

  function renderChrome(week) {
    var weeks = window.JUBO_WEEKS || [week];
    var church = window.CHURCH || {};
    var opts = weeks.map(function (w) {
      return '<option value="' + esc(w) + '"' + (w === week ? " selected" : "") + ">" + esc(w) + "</option>";
    }).join("");
    var back = "index.html" + (week ? "?week=" + encodeURIComponent(week) : "");
    document.getElementById("tools").innerHTML =
      '<a class="brand" href="' + back + '"><img src="' + esc(church.logo || "assets/logo.png") + '" alt="" width="36" height="36"><span>' + esc(church.name || "주보") + " 인쇄</span></a>" +
      '<div class="tool-row"><label>주차 <select aria-label="주보 주차">' + opts + "</select></label>" +
      '<button type="button" id="do-print">인쇄 / PDF</button>' +
      '<button type="button" id="do-pdf">인쇄용 PDF 받기</button></div>';
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
    document.getElementById("do-pdf").addEventListener("click", function () { window.print(); });
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
        "<ol><li>용지: A4</li><li>배율: 100% (용지에 맞추기 끄기)</li><li>양면 인쇄: 짧은 쪽 넘기기</li><li>배경 그래픽 켜기</li><li>인쇄한 다음 반으로 접기. 1쪽이 겉표지입니다.</li></ol>" +
        "<p>PDF로 받으려면 <b>인쇄용 PDF 받기</b>를 누르고, 대상을 PDF로 저장으로 고르세요.</p>";
    } else {
      how.innerHTML =
        "<p><b>한 장에 한 쪽씩</b>은 A4 네 장입니다. 표지, 예배 순서, 소식, 안내 순서입니다.</p>" +
        "<ol><li>용지: A4</li><li>배율: 100%</li><li>배경 그래픽 켜기</li></ol>";
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
      slot.appendChild(sheet);
      spread.appendChild(slot);
    });
    wrap.appendChild(label);
    wrap.appendChild(spread);
    return wrap;
  }

  function render(C, J, week) {
    document.title = C.name + " 주보 인쇄 · " + J.date;
    var sermon = findName(J.order, "설교");
    var reading = findName(J.order, "성경봉독");
    var date = parseDate(J.date);
    var dow = date ? (date.dow === "일" ? "주일" : date.dow + "요일") : "";
    var when = date ? (date.y + "년 " + date.m + "월 " + date.d + "일") : t(J.date);
    var num = date ? ((date.m < 10 ? "0" : "") + date.m + "<i>.</i>" + (date.d < 10 ? "0" : "") + date.d) : "";
    var meta = t(J.date) + " · " + t(J.issue);

    var cover =
      '<section class="sheet cover">' +
      '<div class="sheet-in">' +
      '<div class="mast"><img src="' + esc(C.logo) + '" alt="">' +
      '<div><p class="name">' + esc(C.name) + '</p><p class="slogan">' + t(C.slogan) + "</p>" +
      (J.season ? '<p class="season">' + t(J.season) + "</p>" : "") + "</div>" +
      '<p class="issue">' + t(J.issue) + "</p></div>" +
      '<div class="date-band"><p class="num">' + num + '</p><div><p class="big">' + esc(when) + '</p><p class="dow">' + esc(dow) + "</p></div></div>" +
      '<div class="sermon-panel"><div>' +
      '<p class="kicker">오늘의 말씀</p>' +
      "<h1>" + (sermon ? t(sermon.mid) : "") + "</h1>" +
      (reading ? '<p class="scripture">' + t(reading.mid) + "</p>" : "") +
      "</div><ul class=\"chips\">" +
      "<li>" + t(J.service && J.service.time) + "</li>" +
      "<li>" + t(J.service && J.service.leader) + "</li>" +
      (sermon && sermon.by ? "<li>설교 " + t(sermon.by) + "</li>" : "") +
      "</ul></div>" +
      '<div class="motto"><p class="kicker">표어</p>' +
      (C.motto || []).map(function (m) {
        return "<p>" + esc(m[0]) + "<em>" + esc(m[1]) + "</em>" + esc(m[2]) + "</p>";
      }).join("") + "</div>" +
      '<div class="pastors">' +
      (C.pastors || []).map(function (p) {
        return "<div><small>" + esc(p[0]) + "</small><b>" + esc(p[1]) + "</b></div>";
      }).join("") + "</div>" +
      '<footer class="foot"><p class="addr">' + (C.address || []).map(t).join("<br>") + "</p>" +
      '<p class="reach"><span>전화 ' + esc(C.tel) + "</span><span>" + esc(C.email) + "</span></p></footer>" +
      folio(1) + "</div></section>";

    var orderBits = "";
    (J.order || []).forEach(function (o) {
      if (o.section) {
        orderBits += '<div class="sec"><h3>' + t(o.section) + "</h3>" +
          (o.song ? '<p class="sec-song"><b>♬</b> ' + t(o.song) + "</p>" : "") + "</div>";
        return;
      }
      var hasMid = !blank(o.mid);
      orderBits += '<div class="orow' + (o.strong ? " strong" : "") + (hasMid ? "" : " nomid") + '">' +
        '<span class="oname"><i>' + (o.stand ? "※" : "") + "</i>" + t(o.name) + "</span>" +
        '<span class="odots"></span>' +
        (hasMid ? '<span class="omid">' + (o.song ? "<b>♬</b> " : "") + t(o.mid) + '</span><span class="odots"></span>' : "") +
        '<span class="oby">' + t(o.by) + "</span></div>";
    });
    var page2 =
      '<section class="sheet">' +
      '<div class="sheet-in">' +
      head("02", "주일예배 순서", meta) +
      (J.praise ? '<p class="praise"><b>♬</b> ' + t(J.praise) + "</p>" : "") +
      '<p class="key">※ 일어섬 · ♬ 찬양 · ' + t(J.service && J.service.time) + " · " + t(J.service && J.service.leader) + "</p>" +
      '<div class="order">' + orderBits + "</div>" +
      folio(2) + "</div></section>";

    var headline = (J.newsHeadline || []).map(function (x, i) {
      return i % 2 ? "<em>" + esc(x) + "</em>" : esc(x);
    }).join("");
    var page3 =
      '<section class="sheet">' +
      '<div class="sheet-in">' +
      head("03", "교회 소식", meta) +
      (headline ? '<p class="banner">' + headline + "</p>" : "") +
      '<section class="blk news"><h3>소식</h3><div class="stack">' +
      (J.news || []).map(function (n, i) {
        var a = String(n).split("\n");
        return '<article><span>' + (i + 1) + "</span><div><p class=\"lead\">" + t(a[0]) + "</p>" +
          (a.length > 1 ? "<p>" + t(a.slice(1).join("\n")) + "</p>" : "") + "</div></article>";
      }).join("") + "</div></section>" +
      '<section class="blk pray"><h3>기도 제목</h3><ol class="stack">' +
      (J.prayers || []).map(function (p, i) {
        return "<li><span>" + (i + 1) + "</span><p>" + t(p) + "</p></li>";
      }).join("") + "</ol></section>" +
      '<section class="blk serve"><h3>' + t(J.month) + '월 섬기는 분들</h3><table><thead><tr>' +
      "<th>일</th><th>설교</th><th>기도</th><th>헌금</th><th>성경봉독</th><th>주요 행사</th></tr></thead><tbody>" +
      (J.servers || []).map(function (r) {
        var now = isThisSunday(r[0], J);
        return '<tr' + (now ? ' class="now"' : "") + ">" + r.map(function (c) {
          return "<td>" + (blank(c) ? "" : t(c)) + "</td>";
        }).join("") + "</tr>";
      }).join("") + "</tbody></table></section>" +
      '<section class="blk welcome"><h3>새가족 환영</h3><table><thead><tr><th>번호</th><th>이름</th><th>인도자</th><th>소속</th></tr></thead><tbody>' +
      (J.newcomers || []).map(function (r) {
        return "<tr>" + [0, 1, 2, 3].map(function (i) {
          return "<td>" + (blank(r[i]) ? '<span class="empty">—</span>' : t(r[i])) + "</td>";
        }).join("") + "</tr>";
      }).join("") + "</tbody></table></section>" +
      folio(3) + "</div></section>";

    var page4 =
      '<section class="sheet">' +
      '<div class="sheet-in">' +
      head("04", "안내", meta) +
      '<section class="blk offer"><h3>지난 주 헌금</h3><div class="olist">' +
      (J.offerings || []).map(function (o) {
        return "<div><dt>" + t(o[0]) + "</dt><dd>" + (blank(o[1]) ? '<span class="empty">—</span>' : t(o[1])) + "</dd></div>";
      }).join("") +
      (J.youth && J.youth.length ? '<div class="youth"><dt>청소년부</dt><dd>' +
        J.youth.map(function (y) {
          return "<span><i>" + t(y[0]) + "</i> " + (blank(y[1]) ? '<span class="empty">—</span>' : t(y[1])) + "</span>";
        }).join("") + "</dd></div>" : "") +
      "</div></section>" +
      '<div class="split">' +
      '<section class="blk"><h3>예배 시간</h3><ul class="times">' +
      (C.services || []).map(function (s) {
        return "<li><span>" + t(s[0]) + "</span><b>" + t(s[1]) + "</b></li>";
      }).join("") + "</ul></section>" +
      '<section class="blk"><h3>주중 모임</h3><ul class="times meet">' +
      (C.weekday || []).map(function (w) {
        return "<li><span>" + t(w.name) + "</span><b>" + t(w.time) + "</b><small>인도 " + t(w.leader) + "</small></li>";
      }).join("") + "</ul></section></div>" +
      '<section class="blk vision"><h3>교회 비전</h3><div class="vgrid">' +
      (C.vision || []).map(function (v) {
        return "<article><h4>" + t(v.title) + '</h4><p class="verse">' + t(v.verse) + "</p><p>" + t(v.desc) + "</p></article>";
      }).join("") + "</div></section>" +
      '<section class="blk visit"><h3>오시는 길 · 연락처</h3><div class="vtwo">' +
      '<p class="addr">' + (C.address || []).map(t).join("<br>") + "</p>" +
      "<ul><li><span>전화</span><b>" + esc(C.tel) + "</b></li><li><span>이메일</span><b>" + esc(C.email) + "</b></li>" +
      (C.pastors || []).map(function (p) {
        return "<li><span>" + esc(p[0]) + "</span><b>" + esc(p[1]) + "</b></li>";
      }).join("") + "</ul></div>" +
      (C.invitation ? '<p class="invite">' + t(C.invitation) + "</p>" : "") +
      "</section>" +
      folio(4) + "</div></section>";

    document.getElementById("book").innerHTML = cover + page2 + page3 + page4;
    applyMode();
  }

  if (q.get("draft") === "1") {
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
    render(window.CHURCH, pack.jubo, dw);
    return;
  }

  renderChrome(week);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week || "")) {
    document.getElementById("book").innerHTML = '<p class="err">주보 날짜를 찾을 수 없습니다.</p>';
    return;
  }
  var s = document.createElement("script");
  s.src = "data/" + week + ".js";
  s.onload = function () { render(window.CHURCH, window.JUBO, week); };
  s.onerror = function () {
    document.getElementById("book").innerHTML = '<p class="err">' + week + " 주보 파일을 찾을 수 없습니다.</p>";
  };
  document.head.appendChild(s);
})();
