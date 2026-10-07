(function () {
  var q = new URLSearchParams(location.search);
  var week = q.get("week") || window.JUBO_CURRENT;
  var s = document.createElement("script");
  s.src = "data/" + week + ".js";
  s.onload = function () { render(window.CHURCH, window.JUBO, week); };
  s.onerror = function () { document.getElementById("jubo").innerHTML = '<p class="err">data/' + week + '.js 파일을 찾을 수 없습니다.</p>'; };
  document.head.appendChild(s);

  function esc(t) { return String(t == null ? "" : t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  // [설교 제목] 같은 미입력 자리표시를 강조 (단, "[ 새 가족 환영 ]"처럼 띄어쓴 대괄호는 본문으로 취급)
  function t(x) { return esc(x).replace(/\[([^\s\]][^\]]*)\]/g, '<mark class="ph">[$1]</mark>').replace(/\n/g, "<br>"); }

  function render(C, J, week) {
    document.title = C.name + " 주보 · " + J.date;
    var bar = '<span class="brand">' + C.name + ' 주보</span><select onchange="location.search=\'?week=\'+this.value">' +
      (window.JUBO_WEEKS || [week]).map(function (w) { return '<option' + (w === week ? " selected" : "") + ">" + w + "</option>"; }).join("") +
      '</select><button onclick="window.print()">인쇄 / PDF</button>';
    document.getElementById("toolbar").innerHTML = bar;

    var orn = '<div class="orn"><span></span><i>✦</i><span></span></div>';

    // ---------- 1. 표지 ----------
    var p1 = '<section class="page cover">' +
      '<div class="frame">' +
      '<div class="cover-top"><span>' + t(J.date) + '</span><span>' + t(J.issue) + '</span></div>' +
      '<h1 class="church">' + C.name.split("").join("<i></i>") + '</h1>' +
      '<p class="slogan">' + t(C.slogan) + '</p>' + orn +
      '<img class="logo" src="' + C.logo + '" alt="' + C.name + ' 로고">' +
      '<div class="motto"><span class="motto-label">표 어</span><div>' +
      C.motto.map(function (m) { return "<p>" + esc(m[0]) + "<em>" + esc(m[1]) + "</em>" + esc(m[2]) + "</p>"; }).join("") + '</div></div>' +
      '<div class="pastors">' + C.pastors.map(function (p) { return "<span><small>" + p[0] + "</small>" + p[1].split("").join(" ") + "</span>"; }).join("") + '</div>' +
      '<footer class="addr"><p>' + C.address.join("<br>") + '</p><p class="contact">Tel. ' + C.tel + ' &nbsp;·&nbsp; ' + C.email + '</p></footer>' +
      '</div></section>';

    // ---------- 2. 교회 안내 ----------
    var p2 = '<section class="page">' + head(C.name + "는") +
      '<ol class="vision">' + C.vision.map(function (v) { return '<li><h3>' + v.title + ' <span class="verse">' + v.verse + '</span></h3><p>' + v.desc + '</p></li>'; }).join("") + '</ol>' +
      '<table class="weekday"><thead><tr>' + C.weekday.map(function (w) { return "<th>" + w.name + "</th>"; }).join("") + '</tr></thead><tbody><tr>' +
      C.weekday.map(function (w) { return "<td class='tm'>" + w.time + "</td>"; }).join("") + '</tr><tr>' +
      C.weekday.map(function (w) { return "<td>인도 : " + w.leader + "</td>"; }).join("") + '</tr></tbody></table>' +
      '<div class="two"><div class="svc"><h3 class="box-title">예배시간 안내</h3><table><thead><tr><th>구 분</th><th>시 간</th></tr></thead><tbody>' +
      C.services.map(function (s) { return "<tr><td>" + s[0] + "</td><td>" + s[1] + "</td></tr>"; }).join("") + '</tbody></table></div>' +
      '<div class="map"><h3 class="box-title">교회 찾아오시는 길</h3>' + MAP + '</div></div>' +
      '<p class="invite">' + C.invitation + '</p></section>';

    // ---------- 3. 소식 ----------
    var h = J.newsHeadline || [];
    var p3 = '<section class="page">' + head("교회 행사 및 교우 소식") +
      '<p class="headline">' + h.map(function (x, i) { return i % 2 ? "<em>" + esc(x) + "</em>" : esc(x); }).join("") + '</p>' +
      '<ul class="prayers">' + J.prayers.map(function (p) { return "<li>" + t(p) + "</li>"; }).join("") + '</ul>' +
      '<ol class="news">' + J.news.map(function (n) { var a = n.split("\n"); return "<li><b>" + t(a[0]) + "</b>" + (a.length > 1 ? '<span class="sub">' + t(a.slice(1).join("\n")) + "</span>" : "") + "</li>"; }).join("") + '</ol>' +
      sub("( " + J.month + " )월 예배위원 / 주요 행사") +
      '<table class="grid servers"><thead><tr><th>일</th><th>설 교</th><th>기 도</th><th>헌 금</th><th>성경봉독</th><th>주요 행사 계획</th></tr></thead><tbody>' +
      J.servers.map(function (r) { return "<tr>" + r.map(function (c, i) { return "<td" + (i === 5 ? ' class="ev"' : "") + ">" + t(c) + "</td>"; }).join("") + "</tr>"; }).join("") + '</tbody></table>' +
      '<table class="grid newc"><thead><tr><th></th><th>새가족/방문자</th><th>인도자</th><th>소속</th></tr></thead><tbody>' +
      J.newcomers.map(function (r) { return "<tr>" + r.map(function (c) { return "<td>" + t(c) + "</td>"; }).join("") + "</tr>"; }).join("") + '</tbody></table>' +
      sub("지난 주 헌금자 명단") +
      '<dl class="offer">' + J.offerings.map(function (o) { return "<dt>" + o[0] + "</dt><dd>" + t(o[1]) + "</dd>"; }).join("") +
      '<dt>청소년부</dt><dd class="youth">' + (J.youth || []).map(function (y) { return "<span><small>" + y[0] + "</small> " + t(y[1]) + "</span>"; }).join("") + '</dd></dl></section>';

    // ---------- 4. 주일예배 ----------
    var p4 = '<section class="page worship">' +
      '<div class="w-top"><span>' + t(J.date) + '</span><span>' + t(J.issue) + '</span></div>' +
      '<h2 class="w-title">주 일 예 배</h2>' +
      '<div class="w-meta"><span>' + t(J.service.time) + '</span><span>' + t(J.service.leader) + '</span></div>' +
      '<p class="praise">♬ ' + t(J.praise) + '</p>' +
      '<div class="order">' + J.order.map(function (o) {
        if (o.section) return '<h3 class="sec">' + esc(o.section) + '</h3>' + (o.song ? '<p class="sec-song">♬ ' + t(o.song) + "</p>" : "");
        return '<div class="row' + (o.strong ? " strong" : "") + '"><span class="nm">' + (o.stand ? '<i class="st">※</i>' : '<i class="st"></i>') + esc(o.name) + '</span>' +
          '<span class="dots"></span>' + (o.mid ? '<span class="mid">' + (o.song ? "♬ " : "") + t(o.mid) + '</span><span class="dots"></span>' : "") +
          '<span class="by">' + t(o.by) + "</span></div>";
      }).join("") + '</div></section>';

    document.getElementById("jubo").innerHTML = p1 + p2 + p3 + p4;
  }
  function head(x) { return '<header class="ph-head"><span class="rule"></span><h2>' + x + '</h2><span class="rule"></span></header>'; }
  function sub(x) { return '<h3 class="subhead"><span>' + x + "</span></h3>"; }

  var MAP = '<svg viewBox="0 0 400 330" class="mapsvg" role="img" aria-label="교회 약도">' +
    '<g class="road"><rect x="0" y="22" width="400" height="16"/><rect x="40" y="22" width="16" height="308"/><rect x="200" y="22" width="16" height="308"/><rect x="372" y="22" width="16" height="308"/><rect x="216" y="138" width="156" height="14"/></g>' +
    '<g class="rl"><text x="230" y="16">Meralco · Medical City</text><text x="300" y="54">Ortigas Ave</text><text x="70" y="54">← Green Hills</text>' +
    '<text x="48" y="120" class="v">EDSA</text><text x="208" y="200" class="v">Meralco Ave</text><text x="380" y="120" class="v">C5</text><text x="255" y="149">← Julia Vargas →</text></g>' +
    '<g class="blk"><rect x="66" y="62" width="120" height="58" rx="4"/><rect x="226" y="62" width="136" height="66" rx="4"/><rect x="66" y="160" width="120" height="40" rx="4"/>' +
    '<rect x="66" y="212" width="120" height="104" rx="4"/><rect x="226" y="162" width="136" height="60" rx="4"/><rect x="226" y="232" width="136" height="70" rx="4"/></g>' +
    '<g class="bl"><text x="74" y="78">Robinson Gr</text><text x="74" y="92">A D B</text><text x="136" y="112">Shell station</text><text x="70" y="146">Mega Mall</text>' +
    '<text x="90" y="186">Regency Hotel</text><text x="74" y="232">Sangrila Hotel</text><text x="74" y="252">Alexander Con.</text>' +
    '<text x="74" y="296" class="s">2F Bramante Piazza ClubHouse</text><text x="74" y="308" class="s">Brgy Ugong Ortigas Center</text>' +
    '<text x="236" y="98">Home Depot</text><text x="320" y="78">C C F</text><text x="236" y="180">MMDA</text>' +
    '<text x="236" y="256">Ayala 30th</text><text x="292" y="256">Renaissance</text><text x="292" y="270">Condominium</text><text x="290" y="296">Saint PAUL</text><text x="232" y="324">EASTANCIA</text></g>' +
    '<g class="pin"><circle cx="300" cy="196" r="9"/><circle cx="300" cy="196" r="3.5" fill="#fff"/><text x="314" y="194">한마음제자</text><text x="314" y="208" class="s">Hanmaum</text></g></svg>';
})();
