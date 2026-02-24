(function () {
  const STORAGE = {
    counter: "sosdan_counter",
    notices: "sosdan_notices",
    joins: "sosdan_joins",
    bbs: "sosdan_bbs",
  };

  // demo admin (실서비스는 서버 인증으로 교체 권장)
  const ADMIN_ID = "admin";
  const ADMIN_PASSWORD = "sos2006";

  // Supabase 연결값 입력 시 공유 모드 활성화
  const SUPABASE_URL = "";
  const SUPABASE_ANON_KEY = "";

  const remoteEnabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
  let isAdmin = false;

  const formatNow = () => new Date().toLocaleString("ko-KR", { hour12: false });

  const escapeHtml = (value) =>
    String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const setText = (id, text) => {
    const el = document.getElementById(id);
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

  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
  };

  const fetchRemote = async (table, limit = 20) => {
    const url = `${SUPABASE_URL}/rest/v1/${table}?select=*&order=created_at.desc&limit=${limit}`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
    return res.json();
  };

  const insertRemote = async (table, payload) => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: { ...headers, Prefer: "return=representation" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`insert failed: ${res.status}`);
    return res.json();
  };

  const updateRemoteById = async (table, id, payload) => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method: "PATCH",
      headers: { ...headers, Prefer: "return=representation" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`update failed: ${res.status}`);
    return res.json();
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

  const setupAdminAuth = ({ refreshJoinList, setNoticeFormState }) => {
    const form = document.getElementById("adminLoginForm");
    const logoutBtn = document.getElementById("adminLogoutBtn");
    const idInput = document.getElementById("adminId");
    const pwInput = document.getElementById("adminPw");

    const refreshAdminUI = () => {
      setText("adminStatus", `관리자 상태: ${isAdmin ? "로그인" : "로그아웃"}`);
      if (logoutBtn) logoutBtn.classList.toggle("hidden", !isAdmin);
      if (form) form.classList.toggle("hidden", isAdmin);
      setNoticeFormState(isAdmin);
      refreshJoinList();
    };

    if (form && idInput && pwInput) {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const id = idInput.value.trim();
        const pw = pwInput.value;
        isAdmin = id === ADMIN_ID && pw === ADMIN_PASSWORD;
        if (!isAdmin) {
          alert("관리자 로그인 실패");
          return;
        }
        idInput.value = "";
        pwInput.value = "";
        refreshAdminUI();
      });
    }

    if (logoutBtn) {
      logoutBtn.addEventListener("click", () => {
        isAdmin = false;
        refreshAdminUI();
      });
    }

    refreshAdminUI();
  };

  const setupCounter = async () => {
    const counterEl = document.getElementById("counter");
    if (!counterEl) return;

    if (remoteEnabled) {
      try {
        const rows = await fetchRemote("sos_metrics", 1);
        let metric = rows[0];
        if (!metric) {
          const created = await insertRemote("sos_metrics", { total_visits: 1 });
          metric = created[0] || { total_visits: 1 };
        } else {
          const next = Number(metric.total_visits || 0) + 1;
          const updated = await updateRemoteById("sos_metrics", metric.id, { total_visits: next });
          metric = updated[0] || { total_visits: next };
        }

        const total = Number(metric.total_visits || 1);
        counterEl.textContent = String(total).padStart(6, "0");
        setText("counterStatus", "실시간 전역 접속자수 (Supabase)");
        setText("syncStatus", "저장소: Supabase 공유 모드");
        return;
      } catch {
        setText("counterStatus", "원격 집계 실패 · local 대체");
      }
    }

    const initial = 42;
    const saved = Number(localStorage.getItem(STORAGE.counter));
    const count = Number.isFinite(saved) && saved > 0 ? saved + 1 : initial;
    localStorage.setItem(STORAGE.counter, String(count));
    counterEl.textContent = String(count).padStart(6, "0");
    setText("syncStatus", "저장소: local 모드");
  };

  const setupNotice = async () => {
    const listEl = document.getElementById("noticeList");
    const form = document.getElementById("noticeForm");
    const titleInput = document.getElementById("noticeTitle");
    const contentInput = document.getElementById("noticeContent");

    if (!listEl || !form || !titleInput || !contentInput) return { setNoticeFormState: () => {} };

    let notices = [];

    const setNoticeFormState = (allow) => {
      form.classList.toggle("unlocked", allow);
    };

    const draw = () => {
      renderList(
        listEl,
        notices,
        (item) => `<strong>[공지] ${escapeHtml(item.title)}</strong><span class="post-meta">${escapeHtml(item.createdAt)}</span><div>${escapeHtml(item.content)}</div>`
      );
    };

    const reload = async () => {
      const defaults = [{ title: "환영", content: "SOS단 공식(?) 홈페이지 오픈!", createdAt: formatNow() }];
      if (remoteEnabled) {
        try {
          const rows = await fetchRemote("sos_notices", 20);
          notices = rows.map((row) => ({
            title: row.title || "",
            content: row.content || "",
            createdAt: row.created_at ? new Date(row.created_at).toLocaleString("ko-KR", { hour12: false }) : formatNow(),
          }));
        } catch {
          notices = loadLocalList(STORAGE.notices, defaults);
        }
      } else {
        notices = loadLocalList(STORAGE.notices, defaults);
      }
      draw();
    };

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!isAdmin) {
        alert("관리자 로그인 후 작성 가능합니다.");
        return;
      }

      const title = titleInput.value.trim();
      const content = contentInput.value.trim();
      if (!title || !content) return;

      if (remoteEnabled) {
        try {
          await insertRemote("sos_notices", { title, content });
          await reload();
        } catch {
          notices.unshift({ title, content, createdAt: formatNow() });
          notices = notices.slice(0, 20);
          saveLocalList(STORAGE.notices, notices);
          draw();
        }
      } else {
        notices.unshift({ title, content, createdAt: formatNow() });
        notices = notices.slice(0, 20);
        saveLocalList(STORAGE.notices, notices);
        draw();
      }

      form.reset();
    });

    await reload();
    setNoticeFormState(false);
    return { setNoticeFormState };
  };

  const setupJoin = async () => {
    const form = document.getElementById("joinForm");
    const listEl = document.getElementById("joinList");
    const nameInput = document.getElementById("joinName");
    const typeInput = document.getElementById("joinType");
    const msgInput = document.getElementById("joinMessage");

    if (!form || !listEl || !nameInput || !typeInput || !msgInput) return { refreshJoinList: () => {} };

    let joins = [];

    const draw = () => {
      renderList(
        listEl,
        joins,
        (item) => {
          const controls = isAdmin
            ? `<div class="join-actions">
                 <button class="approve-btn" data-action="approve" data-id="${item.id}">승인</button>
                 <button class="reject-btn" data-action="reject" data-id="${item.id}">보류</button>
               </div>`
            : "";
          return `<strong>${escapeHtml(item.name)}</strong> (${escapeHtml(item.type)})
                  <span class="join-status">${escapeHtml(item.status)}</span>
                  <span class="post-meta">${escapeHtml(item.createdAt)}</span>
                  <div>${escapeHtml(item.message)}</div>${controls}`;
        }
      );
    };

    const reload = async () => {
      const defaults = [{ id: Date.now(), name: "익명 단원", type: "평범한 고등학생", message: "재밌는 사건 찾아오겠습니다!", status: "pending", createdAt: formatNow() }];
      if (remoteEnabled) {
        try {
          const rows = await fetchRemote("sos_joins", 30);
          joins = rows.map((row) => ({
            id: row.id,
            name: row.name || "",
            type: row.category || "",
            message: row.message || "",
            status: row.status || "pending",
            createdAt: row.created_at ? new Date(row.created_at).toLocaleString("ko-KR", { hour12: false }) : formatNow(),
          }));
        } catch {
          joins = loadLocalList(STORAGE.joins, defaults);
        }
      } else {
        joins = loadLocalList(STORAGE.joins, defaults);
      }
      draw();
    };

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const name = nameInput.value.trim();
      const type = typeInput.value;
      const message = msgInput.value.trim();
      if (!name || !message) return;

      if (remoteEnabled) {
        try {
          await insertRemote("sos_joins", { name, category: type, message, status: "pending" });
          await reload();
        } catch {
          joins.unshift({ id: Date.now(), name, type, message, status: "pending", createdAt: formatNow() });
          joins = joins.slice(0, 30);
          saveLocalList(STORAGE.joins, joins);
          draw();
        }
      } else {
        joins.unshift({ id: Date.now(), name, type, message, status: "pending", createdAt: formatNow() });
        joins = joins.slice(0, 30);
        saveLocalList(STORAGE.joins, joins);
        draw();
      }

      form.reset();
    });

    listEl.addEventListener("click", async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const action = target.dataset.action;
      const id = Number(target.dataset.id);
      if (!action || !id || !isAdmin) return;

      const nextStatus = action === "approve" ? "approved" : "pending";

      if (remoteEnabled) {
        try {
          await updateRemoteById("sos_joins", id, { status: nextStatus });
          await reload();
        } catch {
          joins = joins.map((item) => (item.id === id ? { ...item, status: nextStatus } : item));
          saveLocalList(STORAGE.joins, joins);
          draw();
        }
      } else {
        joins = joins.map((item) => (item.id === id ? { ...item, status: nextStatus } : item));
        saveLocalList(STORAGE.joins, joins);
        draw();
      }
    });

    await reload();
    return { refreshJoinList: draw };
  };

  const setupBbs = async () => {
    const form = document.getElementById("bbsForm");
    const listEl = document.getElementById("bbsList");
    const nameInput = document.getElementById("bbsName");
    const msgInput = document.getElementById("bbsMessage");

    if (!form || !listEl || !nameInput || !msgInput) return;

    let posts = [];

    const draw = () => {
      renderList(
        listEl,
        posts,
        (item) => `<strong>[${escapeHtml(item.name)}]</strong><span class="post-meta">${escapeHtml(item.createdAt)}</span><div>${escapeHtml(item.message)}</div>`
      );
    };

    const reload = async () => {
      const defaults = [
        { name: "단장최고", message: "이번 주말 불가사의 탐사 갑니다!", createdAt: formatNow() },
        { name: "미쿠루짱팬77", message: "메이드 사진 업로드 일정 공지 부탁해요", createdAt: formatNow() },
      ];
      if (remoteEnabled) {
        try {
          const rows = await fetchRemote("sos_bbs", 40);
          posts = rows.map((row) => ({
            name: row.name || "",
            message: row.message || "",
            createdAt: row.created_at ? new Date(row.created_at).toLocaleString("ko-KR", { hour12: false }) : formatNow(),
          }));
        } catch {
          posts = loadLocalList(STORAGE.bbs, defaults);
        }
      } else {
        posts = loadLocalList(STORAGE.bbs, defaults);
      }
      draw();
    };

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const name = nameInput.value.trim();
      const message = msgInput.value.trim();
      if (!name || !message) return;

      if (remoteEnabled) {
        try {
          await insertRemote("sos_bbs", { name, message });
          await reload();
        } catch {
          posts.unshift({ name, message, createdAt: formatNow() });
          posts = posts.slice(0, 40);
          saveLocalList(STORAGE.bbs, posts);
          draw();
        }
      } else {
        posts.unshift({ name, message, createdAt: formatNow() });
        posts = posts.slice(0, 40);
        saveLocalList(STORAGE.bbs, posts);
        draw();
      }

      form.reset();
    });

    await reload();
  };

  const init = async () => {
    await setupCounter();
    const notice = await setupNotice();
    const join = await setupJoin();
    await setupBbs();

    setupAdminAuth({
      refreshJoinList: join.refreshJoinList,
      setNoticeFormState: notice.setNoticeFormState,
    });
  };

  init();
})();
