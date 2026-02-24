(function () {
  const ADMIN_ID = "admin";
  const ADMIN_PASSWORD = "sos2006";

  const config = window.SOSDAN_CONFIG || {};
  const SUPABASE_URL = (config.supabaseUrl || "").trim().replace(/\/$/, "");
  const SUPABASE_ANON_KEY = (config.supabaseAnonKey || "").trim();

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

  const setSyncStatus = (text, isError = false) => {
    setText("syncStatus", `저장소: ${text}`);
    const el = document.getElementById("syncStatus");
    if (el) el.classList.toggle("status-error", isError);
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

  const verifyRemoteConnection = async () => {
    if (!remoteEnabled) {
      setSyncStatus("Supabase 미설정 (index.html 설정 필요)", true);
      setText("counterStatus", "Supabase 설정 필요");
      return;
    }

    setSyncStatus("공유 서버 연결 확인 중...");
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/sos_notices?select=id&limit=1`, { headers });
      if (res.ok) {
        setSyncStatus("Supabase 공유 모드 연결됨");
        return;
      }

      if (res.status === 401 || res.status === 403) {
        setSyncStatus("인증 실패 (Project URL / anon key / RLS 정책 확인)", true);
        return;
      }

      if (res.status === 404) {
        setSyncStatus("API 경로 오류 (Project URL 확인 필요)", true);
        return;
      }

      setSyncStatus(`연결 실패 (HTTP ${res.status})`, true);
    } catch {
      setSyncStatus("연결 실패 (네트워크 또는 CORS 오류)", true);
    }
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
      setNoticeFormState(isAdmin && remoteEnabled);
      refreshJoinList();
    };

    if (form && idInput && pwInput) {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const id = idInput.value.trim().toLowerCase();
        const pw = pwInput.value.trim();
        isAdmin = id === ADMIN_ID && pw === ADMIN_PASSWORD;
        if (!isAdmin) {
          alert("관리자 로그인 실패: 아이디/비밀번호를 확인하세요. (demo: admin / sos2006)");
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

    if (!remoteEnabled) {
      counterEl.textContent = "------";
      return;
    }

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
    } catch {
      counterEl.textContent = "ERR500";
      setText("counterStatus", "원격 집계 실패 (RLS 정책 확인)");
    }
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
      if (!remoteEnabled) {
        notices = [{ title: "Supabase 연결 필요", content: "공지 공유 기능을 활성화하려면 설정을 입력하세요.", createdAt: formatNow() }];
        draw();
        return;
      }

      try {
        const rows = await fetchRemote("sos_notices", 20);
        notices = rows.map((row) => ({
          title: row.title || "",
          content: row.content || "",
          createdAt: row.created_at ? new Date(row.created_at).toLocaleString("ko-KR", { hour12: false }) : formatNow(),
        }));
      } catch {
        notices = [{ title: "공지 로딩 실패", content: "Supabase/RLS 상태를 확인해주세요.", createdAt: formatNow() }];
      }
      draw();
    };

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!remoteEnabled) return;
      if (!isAdmin) {
        alert("관리자 로그인 후 작성 가능합니다.");
        return;
      }

      const title = titleInput.value.trim();
      const content = contentInput.value.trim();
      if (!title || !content) return;

      try {
        await insertRemote("sos_notices", { title, content });
        await reload();
      } catch {
        alert("공지 등록 실패: Supabase/RLS 정책을 확인해주세요.");
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
          const controls =
            isAdmin && remoteEnabled
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
      if (!remoteEnabled) {
        joins = [{ id: 0, name: "연결 필요", type: "-", message: "Supabase 설정 후 입단 신청 공유가 활성화됩니다.", status: "offline", createdAt: formatNow() }];
        draw();
        return;
      }

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
        joins = [{ id: 0, name: "로딩 실패", type: "-", message: "입단 목록을 가져오지 못했습니다.", status: "error", createdAt: formatNow() }];
      }
      draw();
    };

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!remoteEnabled) return;

      const name = nameInput.value.trim();
      const type = typeInput.value;
      const message = msgInput.value.trim();
      if (!name || !message) return;

      try {
        await insertRemote("sos_joins", { name, category: type, message, status: "pending" });
        await reload();
      } catch {
        alert("입단 신청 등록 실패: Supabase/RLS 정책을 확인해주세요.");
      }

      form.reset();
    });

    listEl.addEventListener("click", async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const action = target.dataset.action;
      const id = Number(target.dataset.id);
      if (!action || !id || !isAdmin || !remoteEnabled) return;

      const nextStatus = action === "approve" ? "approved" : "pending";

      try {
        await updateRemoteById("sos_joins", id, { status: nextStatus });
        await reload();
      } catch {
        alert("상태 변경 실패: Supabase/RLS 정책을 확인해주세요.");
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
      if (!remoteEnabled) {
        posts = [{ name: "연결 필요", message: "자유게시판 공유를 사용하려면 Supabase를 설정하세요.", createdAt: formatNow() }];
        draw();
        return;
      }

      try {
        const rows = await fetchRemote("sos_bbs", 40);
        posts = rows.map((row) => ({
          name: row.name || "",
          message: row.message || "",
          createdAt: row.created_at ? new Date(row.created_at).toLocaleString("ko-KR", { hour12: false }) : formatNow(),
        }));
      } catch {
        posts = [{ name: "오류", message: "게시판을 불러오지 못했습니다.", createdAt: formatNow() }];
      }
      draw();
    };

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!remoteEnabled) return;

      const name = nameInput.value.trim();
      const message = msgInput.value.trim();
      if (!name || !message) return;

      try {
        await insertRemote("sos_bbs", { name, message });
        await reload();
      } catch {
        alert("게시글 등록 실패: Supabase/RLS 정책을 확인해주세요.");
      }

      form.reset();
    });

    await reload();
  };


  const setupCopyBanner = () => {
    const copyBtn = document.getElementById("copySiteBanner");
    const feedback = document.getElementById("copyFeedback");
    if (!copyBtn) return;

    copyBtn.addEventListener("click", async () => {
      const urlToCopy = `${window.location.origin}${window.location.pathname}`;
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(urlToCopy);
        } else {
          const helper = document.createElement("textarea");
          helper.value = urlToCopy;
          helper.style.position = "fixed";
          helper.style.opacity = "0";
          document.body.appendChild(helper);
          helper.focus();
          helper.select();
          document.execCommand("copy");
          helper.remove();
        }

        if (feedback) feedback.textContent = `복사 완료: ${urlToCopy}`;
      } catch {
        if (feedback) feedback.textContent = "복사 실패: 브라우저 권한을 확인하세요.";
      }
    });
  };

  const init = async () => {
    await verifyRemoteConnection();
    await setupCounter();
    const notice = await setupNotice();
    const join = await setupJoin();
    await setupBbs();

    setupAdminAuth({
      refreshJoinList: join.refreshJoinList,
      setNoticeFormState: notice.setNoticeFormState,
    });
    setupCopyBanner();
  };

  init();
})();
