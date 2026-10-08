(function () {
  var q = new URLSearchParams(location.search);
  var requested = q.get("week");
  var week = requested || window.JUBO_CURRENT;
  renderChrome(week);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(week || "")) {
    document.getElementById("jubo").innerHTML = '<p class="err">주보 날짜를 찾을 수 없습니다.</p>';
    return;
  }

  var s = document.createElement("script");
  s.src = "data/" + week + ".js";
  s.onload = function () { render(window.CHURCH, window.JUBO, week); };
  s.onerror = function () {
    document.getElementById("jubo").innerHTML = '<p class="err">' + week + " 주보 파일을 찾을 수 없습니다.</p>";
  };
  document.head.appendChild(s);

  function esc(t) {
    return String(t == null ? "" : t).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  // [설교 제목] 같은 미입력 자리표시를 강조한다.
  // "[ 새 가족 환영 ]"처럼 대괄호 안을 띄어 쓴 경우는 본문으로 둔다.
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
  function findSection(order, title) {
    var list = order || [];
    for (var i = 0; i < list.length; i++) if (list[i].section === title) return list[i];
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

  function renderChrome(week) {
    var weeks = window.JUBO_WEEKS || [week];
    var church = window.CHURCH || {};
    var opts = weeks.map(function (w) {
      return '<option value="' + esc(w) + '"' + (w === week ? " selected" : "") + ">" + esc(w) + "</option>";
    }).join("");
    document.getElementById("toolbar").innerHTML =
      '<a class="brand" href="#cover"><img src="' + esc(church.logo || "assets/logo.png") + '" alt="" width="36" height="36"><span>' + esc(church.name || "주보") + "</span></a>" +
      '<div class="tools"><label class="week"><span class="sr">주차</span><select aria-label="주보 주차">' + opts + "</select></label>" +
      '<button type="button" id="print-btn" aria-label="인쇄 / PDF"><span class="long">인쇄 / PDF</span><span class="short">인쇄</span></button></div>';
    document.querySelector("#toolbar select").addEventListener("change", function () {
      location.search = "?week=" + encodeURIComponent(this.value);
    });
    document.getElementById("print-btn").addEventListener("click", function () {
      location.href = "print.html?week=" + encodeURIComponent(week);
    });
  }

  function render(C, J, week) {
    document.title = C.name + " 주보 · " + J.date;
    var sermon = findName(J.order, "설교");
    var reading = findName(J.order, "성경봉독");
    var word = findSection(J.order, "은혜의 말씀");
    var date = parseDate(J.date);
    var dow = date ? (date.dow === "일" ? "주일" : date.dow + "요일") : "";
    var mm = date ? (date.m < 10 ? "0" : "") + date.m : "";
    var dd = date ? (date.d < 10 ? "0" : "") + date.d : "";

    var nav = [
      ["cover", "이번 주"],
      ["order", "예배"],
      ["sermon", "말씀"],
      ["news", "소식"],
      ["prayer", "기도"],
      ["servers", "섬김"],
      ["welcome", "새가족"],
      ["offering", "헌금"],
      ["guide", "안내"],
      ["visit", "오시는 길"],
      ["contact", "연락처"]
    ];
    document.getElementById("snav").innerHTML = nav.map(function (n, i) {
      return '<a href="#' + n[0] + '"' + (i === 0 ? ' aria-current="true"' : "") + ">" + n[1] + "</a>";
    }).join("");

    var hero =
      '<section class="hero" id="cover">' +
      '<div class="hero-id"><img class="logo" src="' + esc(C.logo) + '" alt="" width="48" height="48">' +
      '<div><p class="church">' + esc(C.name) + "</p><p class=\"slogan\">" + t(C.slogan) + "</p></div></div>" +
      '<p class="issue-line"><span>' + (dow || "주일") + "</span><span>" + t(J.issue) + "</span></p>" +
      (date
        ? '<p class="when">' + date.y + "년 " + date.m + "월 " + date.d + "일</p>" +
          '<p class="bignum" aria-hidden="true">' + mm + '<i>.</i>' + dd + "</p>"
        : '<p class="when">' + t(J.date) + "</p>") +
      '<div class="word">' +
      '<p class="kicker">오늘의 말씀</p>' +
      '<h1 class="sermon-title">' + (sermon ? t(sermon.mid) : t(J.date)) + "</h1>" +
      (reading ? '<p class="scripture">' + t(reading.mid) + "</p>" : "") +
      '<ul class="meta">' +
      "<li>" + t(J.service && J.service.time) + "</li>" +
      "<li>" + t(J.service && J.service.leader) + "</li>" +
      (sermon && sermon.by ? "<li>설교 " + t(sermon.by) + "</li>" : "") +
      "</ul></div>" +
      '<div class="motto"><p class="kicker">표어</p>' +
      (C.motto || []).map(function (m) {
        return "<p>" + esc(m[0]) + "<em>" + esc(m[1]) + "</em>" + esc(m[2]) + "</p>";
      }).join("") +
      "</div></section>";

    var order =
      '<section class="block" id="order"><header class="sh"><span>01</span><h2>예배 순서</h2></header>' +
      (J.praise ? '<p class="praise"><b aria-hidden="true">♬</b> ' + t(J.praise) + "</p>" : "") +
      '<p class="key">※ 일어섬 · ♬ 찬양</p><div class="order">' +
      (J.order || []).map(function (o) {
        if (o.section) {
          return '<h3 class="sec">' + t(o.section) + "</h3>" +
            (o.song ? '<p class="sec-song"><b aria-hidden="true">♬</b> ' + t(o.song) + "</p>" : "");
        }
        return '<div class="row' + (o.strong ? " strong" : "") + '"><span class="flag">' + (o.stand ? "※" : "") + "</span>" +
          '<div class="body"><div class="line"><span class="nm">' + t(o.name) + '</span><span class="by">' + t(o.by) + "</span></div>" +
          (o.mid ? '<p class="mid">' + (o.song ? "<b aria-hidden=\"true\">♬</b> " : "") + t(o.mid) + "</p>" : "") +
          "</div></div>";
      }).join("") +
      "</div></section>";

    var sermonBlock =
      '<section class="block" id="sermon"><header class="sh"><span>02</span><h2>오늘의 말씀</h2></header>' +
      '<article class="sermon-card">' +
      (sermon ? "<h3>" + t(sermon.mid) + "</h3>" : "") +
      (reading ? '<p class="scripture">' + t(reading.mid) + "</p>" : "") +
      '<dl class="who-did">' +
      (sermon && sermon.by ? "<div><dt>설교</dt><dd>" + t(sermon.by) + "</dd></div>" : "") +
      (reading && reading.by ? "<div><dt>성경봉독</dt><dd>" + t(reading.by) + "</dd></div>" : "") +
      (word && word.song ? "<div><dt>말씀 전 찬양</dt><dd>" + t(word.song) + "</dd></div>" : "") +
      "</dl></article></section>";

    var headline = (J.newsHeadline || []).map(function (x, i) {
      return i % 2 ? "<em>" + esc(x) + "</em>" : esc(x);
    }).join("");
    var news =
      '<section class="block" id="news"><header class="sh"><span>03</span><h2>교회 소식</h2></header>' +
      (headline ? '<p class="banner">' + headline + "</p>" : "") +
      '<div class="stack">' +
      (J.news || []).map(function (n, i) {
        var a = String(n).split("\n");
        return '<article class="card"><span class="idx">' + (i + 1) + "</span><div><h3>" + t(a[0]) + "</h3>" +
          (a.length > 1 ? "<p>" + t(a.slice(1).join("\n")) + "</p>" : "") + "</div></article>";
      }).join("") +
      "</div></section>";

    var prayer =
      '<section class="block" id="prayer"><header class="sh"><span>04</span><h2>기도 제목</h2></header><ol class="stack">' +
      (J.prayers || []).map(function (p, i) {
        return '<li class="card"><span class="idx">' + (i + 1) + "</span><p>" + t(p) + "</p></li>";
      }).join("") +
      "</ol></section>";

    var servers =
      '<section class="block" id="servers"><header class="sh"><span>05</span><h2>' + t(J.month) + "월 섬기는 분들</h2></header>" +
      '<div class="srv-list">' +
      (J.servers || []).map(function (r) {
        var now = isThisSunday(r[0], J);
        var ev = r[5];
        return '<article class="srv' + (now ? " is-now" : "") + '"><div class="srv-day"><b>' + t(r[0]) + "</b>" +
          (now ? "<em>이번 주</em>" : "") + "</div><div class=\"roles\">" +
          role("설교", r[1]) + role("기도", r[2]) + role("헌금", r[3]) + role("성경봉독", r[4]) +
          "</div>" + (blank(ev) ? "" : '<p class="ev"><i>주요 행사</i> ' + t(ev) + "</p>") +
          "</article>";
      }).join("") +
      "</div></section>";

    var welcome =
      '<section class="block" id="welcome"><header class="sh"><span>06</span><h2>새가족 환영</h2></header><ul class="people">' +
      (J.newcomers || []).map(function (r) {
        return "<li><b>" + t(r[0]) + "</b><div><strong>" + t(r[1]) + "</strong>" +
          field("인도자", r[2]) + field("소속", r[3]) + "</div></li>";
      }).join("") +
      "</ul></section>";

    var offering =
      '<section class="block" id="offering"><header class="sh"><span>07</span><h2>헌금 안내</h2></header>' +
      '<p class="note">지난 주 헌금자 명단</p><div class="offer">' +
      (J.offerings || []).map(function (o) {
        return "<div><dt>" + t(o[0]) + "</dt><dd>" + (blank(o[1]) ? '<span class="empty">—</span>' : t(o[1])) + "</dd></div>";
      }).join("") +
      "</div>" +
      (J.youth && J.youth.length
        ? '<h3 class="sub">청소년부</h3><div class="offer">' + J.youth.map(function (y) {
          return "<div><dt>" + t(y[0]) + "</dt><dd>" + (blank(y[1]) ? '<span class="empty">—</span>' : t(y[1])) + "</dd></div>";
        }).join("") + "</div>"
        : "") +
      "</section>";

    var guide =
      '<section class="block" id="guide"><header class="sh"><span>08</span><h2>예배 · 모임 안내</h2></header>' +
      '<h3 class="sub">예배 시간</h3><ul class="times">' +
      (C.services || []).map(function (s) {
        return "<li><span>" + t(s[0]) + "</span><b>" + t(s[1]) + "</b></li>";
      }).join("") +
      "</ul><h3 class=\"sub\">주중 모임</h3><ul class=\"times meet\">" +
      (C.weekday || []).map(function (w) {
        return "<li><span>" + t(w.name) + "</span><b>" + t(w.time) + "</b><small>인도 " + t(w.leader) + "</small></li>";
      }).join("") +
      '</ul><h3 class="sub">교회 비전</h3><div class="vision">' +
      (C.vision || []).map(function (v) {
        return "<article><h3>" + t(v.title) + '</h3><p class="verse">' + t(v.verse) + "</p><p>" + t(v.desc) + "</p></article>";
      }).join("") +
      "</div></section>";

    var mapQuery = (C.address || []).join(", ");
    var mapHref = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(mapQuery);
    var visit =
      '<section class="block" id="visit"><header class="sh"><span>09</span><h2>오시는 길</h2></header>' +
      '<p class="addr">' + (C.address || []).map(function (line) { return t(line); }).join("<br>") + "</p>" +
      '<a class="map-btn" href="' + esc(mapHref) + '" target="_blank" rel="noopener noreferrer">지도에서 보기</a></section>' +
      '<section class="block" id="contact"><header class="sh"><span>10</span><h2>연락처</h2></header><ul class="contact">' +
      '<li><span>전화</span><a href="tel:' + esc(String(C.tel).replace(/[^\d+]/g, "")) + '">' + esc(C.tel) + "</a></li>" +
      '<li><span>이메일</span><a href="mailto:' + esc(C.email) + '">' + esc(C.email) + "</a></li>" +
      (C.pastors || []).map(function (p) {
        return "<li><span>" + esc(p[0]) + "</span><b>" + esc(p[1]) + "</b></li>";
      }).join("") +
      "</ul>" +
      (C.invitation ? '<p class="invite">' + t(C.invitation) + "</p>" : "") +
      "</section>";

    document.getElementById("jubo").innerHTML = hero + order + sermonBlock + news + prayer + servers + welcome + offering + guide + visit;
    bindNav();

    function role(label, value) {
      return "<p><i>" + label + "</i><b>" + (blank(value) ? '<span class="empty">—</span>' : t(value)) + "</b></p>";
    }
    function field(label, value) {
      if (blank(value)) return "";
      return "<p><i>" + label + "</i> " + t(value) + "</p>";
    }
  }

  function bindNav() {
    var links = [].slice.call(document.querySelectorAll("#snav a"));
    var sections = links.map(function (a) { return document.querySelector(a.getAttribute("href")); });
    var nav = document.getElementById("snav");
    var ticking = false;
    function update() {
      ticking = false;
      var y = window.scrollY + 128;
      var idx = 0;
      sections.forEach(function (sec, i) { if (sec && sec.offsetTop <= y) idx = i; });
      links.forEach(function (a, i) {
        if (i === idx) a.setAttribute("aria-current", "true");
        else a.removeAttribute("aria-current");
      });
      var on = links[idx];
      if (!on) return;
      var start = nav.scrollLeft;
      var end = start + nav.clientWidth;
      if (on.offsetLeft < start + 8 || on.offsetLeft + on.offsetWidth > end - 8) nav.scrollLeft = on.offsetLeft - 16;
    }
    window.addEventListener("scroll", function () {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    update();
  }
})();
