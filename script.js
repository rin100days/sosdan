(function () {
  const STORAGE = {
    counter: "sosdan_counter",
    notices: "sosdan_notices",
    joins: "sosdan_joins",
    bbs: "sosdan_bbs",
  };

  const NOTICE_PASSWORD = "sos2006";

  // 2번: 전역 공유 DB 모드 (Supabase) - 값 채우면 자동 활성화
  const SUPABASE_URL = ""; // 예: https://xxxx.supabase.co
  const SUPABASE_ANON_KEY = ""; // 예: eyJ...

  const remoteEnabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
  const formatNow = () => new Date().toLocaleString("ko-KR", { hour12: false });

  const escapeHtml = (value) =>
    String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const setSyncStatus = (text) => {
    const el = document.getElementById("syncStatus");
    if (el) el.textContent = text;
  };

  const loadLocalList = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : fallback;
    } catch {
      return fallback;
    }
  };

  const saveLocalList = (key, value) => {
    localStorage.setItem(key, JSON.stringify(value));
  };

  const mapRemoteRows = (rows, type) =>
    rows.map((row) => {
      if (type === "notices") {
        return {
          title: row.title || "",
          content: row.content || "",
          createdAt: row.created_at ? new Date(row.created_at).toLocaleString("ko-KR", { hour12: false }) : formatNow(),
        };
      }
      if (type === "joins") {
        return {
          name: row.name || "",
          type: row.category || "",
          message: row.message || "",
          createdAt: row.created_at ? new Date(row.created_at).toLocaleString("ko-KR", { hour12: false }) : formatNow(),
        };
      }
      return {
        name: row.name || "",
        message: row.message || "",
        createdAt: row.created_at ? new Date(row.created_at).toLocaleString("ko-KR", { hour12: false }) : formatNow(),
      };
    });

  const supabaseHeaders = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
  };

  const fetchRemoteList = async (table, limit, type) => {
    const url = `${SUPABASE_URL}/rest/v1/${table}?select=*&order=created_at.desc&limit=${limit}`;
    const response = await fetch(url, { headers: supabaseHeaders });
    if (!response.ok) throw new Error(`remote fetch failed: ${response.status}`);
    const rows = await response.json();
    return mapRemoteRows(rows, type);
  };

  const insertRemote = async (table, payload) => {
    const url = `${SUPABASE_URL}/rest/v1/${table}`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        ...supabaseHeaders,
        Prefer: "return=minimal",
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`remote insert failed: ${response.status}`);
  };

  const renderList = (target, items, mapper) => {
    if (!target) return;
    target.innerHTML = "";
    items.forEach((item) => {
      const li = document.createElement("li");
      li.innerHTML = mapper(item);
      target.appendChild(li);
    });
  };

  const setupCounter = () => {
    const counterEl = document.getElementById("counter");
    if (!counterEl) return;

    const initial = 42;
    const saved = Number(localStorage.getItem(STORAGE.counter));
    const count = Number.isFinite(saved) && saved > 0 ? saved + 1 : initial;

    localStorage.setItem(STORAGE.counter, String(count));
    counterEl.textContent = String(count).padStart(6, "0");
  };

  const setupNotice = async () => {
    const listEl = document.getElementById("noticeList");
    const form = document.getElementById("noticeForm");
    const pwInput = document.getElementById("noticePassword");
    const unlockBtn = document.getElementById("unlockNoticeBtn");
    const status = document.getElementById("noticeAuthStatus");
    const titleInput = document.getElementById("noticeTitle");
    const contentInput = document.getElementById("noticeContent");

    if (!listEl || !form || !pwInput || !unlockBtn || !status || !titleInput || !contentInput) return;

    let unlocked = false;
    const defaultNotices = [{ title: "환영", content: "SOS단 공식(?) 홈페이지 오픈!", createdAt: formatNow() }];
    let notices = defaultNotices;

    const draw = () => {
      renderList(
        listEl,
        notices,
        (item) => `<strong>[공지] ${escapeHtml(item.title)}</strong><span class="post-meta">${escapeHtml(item.createdAt)}</span><div>${escapeHtml(item.content)}</div>`
      );
    };

    if (remoteEnabled) {
      try {
        notices = await fetchRemoteList("sos_notices", 15, "notices");
        setSyncStatus("저장소: Supabase 공유 모드");
      } catch {
        notices = loadLocalList(STORAGE.notices, defaultNotices);
        setSyncStatus("저장소: local 모드 (원격 연결 실패)");
      }
    } else {
      notices = loadLocalList(STORAGE.notices, defaultNotices);
      setSyncStatus("저장소: local 모드");
    }

    unlockBtn.addEventListener("click", () => {
      if (pwInput.value === NOTICE_PASSWORD) {
        unlocked = true;
        form.classList.add("unlocked");
        status.textContent = "인증 성공 · 작성 가능";
      } else {
        unlocked = false;
        form.classList.remove("unlocked");
        status.textContent = "비밀번호가 틀렸습니다.";
      }
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!unlocked) {
        status.textContent = "먼저 비밀번호 인증을 해주세요.";
        return;
      }

      const title = titleInput.value.trim();
      const content = contentInput.value.trim();
      if (!title || !content) return;

      if (remoteEnabled) {
        try {
          await insertRemote("sos_notices", { title, content });
          notices = await fetchRemoteList("sos_notices", 15, "notices");
        } catch {
          notices.unshift({ title, content, createdAt: formatNow() });
          notices = notices.slice(0, 15);
          saveLocalList(STORAGE.notices, notices);
          setSyncStatus("저장소: local 모드 (원격 저장 실패)");
        }
      } else {
        notices.unshift({ title, content, createdAt: formatNow() });
        notices = notices.slice(0, 15);
        saveLocalList(STORAGE.notices, notices);
      }

      draw();
      form.reset();
    });

    draw();
  };

  const setupJoin = async () => {
    const form = document.getElementById("joinForm");
    const listEl = document.getElementById("joinList");
    const nameInput = document.getElementById("joinName");
    const typeInput = document.getElementById("joinType");
    const msgInput = document.getElementById("joinMessage");

    if (!form || !listEl || !nameInput || !typeInput || !msgInput) return;

    const defaults = [{ name: "익명 단원", type: "평범한 고등학생", message: "재밌는 사건 찾아오겠습니다!", createdAt: formatNow() }];
    let joins = remoteEnabled ? defaults : loadLocalList(STORAGE.joins, defaults);

    const draw = () => {
      renderList(
        listEl,
        joins,
        (item) => `<strong>${escapeHtml(item.name)}</strong> (${escapeHtml(item.type)})<span class="post-meta">${escapeHtml(item.createdAt)}</span><div>${escapeHtml(item.message)}</div>`
      );
    };

    if (remoteEnabled) {
      try {
        joins = await fetchRemoteList("sos_joins", 15, "joins");
      } catch {
        joins = loadLocalList(STORAGE.joins, defaults);
      }
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const name = nameInput.value.trim();
      const type = typeInput.value;
      const message = msgInput.value.trim();
      if (!name || !message) return;

      if (remoteEnabled) {
        try {
          await insertRemote("sos_joins", { name, category: type, message });
          joins = await fetchRemoteList("sos_joins", 15, "joins");
        } catch {
          joins.unshift({ name, type, message, createdAt: formatNow() });
          joins = joins.slice(0, 15);
          saveLocalList(STORAGE.joins, joins);
        }
      } else {
        joins.unshift({ name, type, message, createdAt: formatNow() });
        joins = joins.slice(0, 15);
        saveLocalList(STORAGE.joins, joins);
      }

      draw();
      form.reset();
    });

    draw();
  };

  const setupBbs = async () => {
    const form = document.getElementById("bbsForm");
    const listEl = document.getElementById("bbsList");
    const nameInput = document.getElementById("bbsName");
    const msgInput = document.getElementById("bbsMessage");

    if (!form || !listEl || !nameInput || !msgInput) return;

    const defaults = [
      { name: "단장최고", message: "이번 주말 불가사의 탐사 갑니다!", createdAt: formatNow() },
      { name: "미쿠루짱팬77", message: "메이드 사진 업로드 일정 공지 부탁해요", createdAt: formatNow() },
      { name: "정보통합사념체", message: "관측을 지속한다.", createdAt: formatNow() },
    ];
    let posts = remoteEnabled ? defaults : loadLocalList(STORAGE.bbs, defaults);

    const draw = () => {
      renderList(
        listEl,
        posts,
        (item) => `<strong>[${escapeHtml(item.name)}]</strong><span class="post-meta">${escapeHtml(item.createdAt)}</span><div>${escapeHtml(item.message)}</div>`
      );
    };

    if (remoteEnabled) {
      try {
        posts = await fetchRemoteList("sos_bbs", 25, "bbs");
      } catch {
        posts = loadLocalList(STORAGE.bbs, defaults);
      }
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const name = nameInput.value.trim();
      const message = msgInput.value.trim();
      if (!name || !message) return;

      if (remoteEnabled) {
        try {
          await insertRemote("sos_bbs", { name, message });
          posts = await fetchRemoteList("sos_bbs", 25, "bbs");
        } catch {
          posts.unshift({ name, message, createdAt: formatNow() });
          posts = posts.slice(0, 25);
          saveLocalList(STORAGE.bbs, posts);
        }
      } else {
        posts.unshift({ name, message, createdAt: formatNow() });
        posts = posts.slice(0, 25);
        saveLocalList(STORAGE.bbs, posts);
      }

      draw();
      form.reset();
    });

    draw();
  };

  setupCounter();
  Promise.all([setupNotice(), setupJoin(), setupBbs()]);
})();
