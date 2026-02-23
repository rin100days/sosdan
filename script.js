(function () {
  const STORAGE = {
    counter: "sosdan_counter",
    notices: "sosdan_notices",
    joins: "sosdan_joins",
    bbs: "sosdan_bbs",
  };

  const NOTICE_PASSWORD = "sos2006";

  const formatNow = () => new Date().toLocaleString("ko-KR", { hour12: false });

  const loadList = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : fallback;
    } catch {
      return fallback;
    }
  };

  const saveList = (key, value) => {
    localStorage.setItem(key, JSON.stringify(value));
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

  const setupNotice = () => {
    const listEl = document.getElementById("noticeList");
    const form = document.getElementById("noticeForm");
    const pwInput = document.getElementById("noticePassword");
    const unlockBtn = document.getElementById("unlockNoticeBtn");
    const status = document.getElementById("noticeAuthStatus");
    const titleInput = document.getElementById("noticeTitle");
    const contentInput = document.getElementById("noticeContent");

    if (!listEl || !form || !pwInput || !unlockBtn || !status || !titleInput || !contentInput) return;

    let unlocked = false;
    const defaultNotices = [
      { title: "환영", content: "SOS단 공식(?) 홈페이지 오픈!", createdAt: formatNow() },
    ];
    let notices = loadList(STORAGE.notices, defaultNotices);

    const draw = () => {
      renderList(
        listEl,
        notices,
        (item) => `<strong>[공지] ${item.title}</strong><span class="post-meta">${item.createdAt}</span><div>${item.content}</div>`
      );
    };

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

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!unlocked) {
        status.textContent = "먼저 비밀번호 인증을 해주세요.";
        return;
      }

      const title = titleInput.value.trim();
      const content = contentInput.value.trim();
      if (!title || !content) return;

      notices.unshift({ title, content, createdAt: formatNow() });
      notices = notices.slice(0, 15);
      saveList(STORAGE.notices, notices);
      draw();
      form.reset();
    });

    draw();
  };

  const setupJoin = () => {
    const form = document.getElementById("joinForm");
    const listEl = document.getElementById("joinList");
    const nameInput = document.getElementById("joinName");
    const typeInput = document.getElementById("joinType");
    const msgInput = document.getElementById("joinMessage");

    if (!form || !listEl || !nameInput || !typeInput || !msgInput) return;

    const defaults = [{ name: "익명 단원", type: "평범한 고등학생", message: "재밌는 사건 찾아오겠습니다!", createdAt: formatNow() }];
    let joins = loadList(STORAGE.joins, defaults);

    const draw = () => {
      renderList(
        listEl,
        joins,
        (item) => `<strong>${item.name}</strong> (${item.type})<span class="post-meta">${item.createdAt}</span><div>${item.message}</div>`
      );
    };

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const name = nameInput.value.trim();
      const type = typeInput.value;
      const message = msgInput.value.trim();
      if (!name || !message) return;

      joins.unshift({ name, type, message, createdAt: formatNow() });
      joins = joins.slice(0, 15);
      saveList(STORAGE.joins, joins);
      draw();
      form.reset();
    });

    draw();
  };

  const setupBbs = () => {
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
    let posts = loadList(STORAGE.bbs, defaults);

    const draw = () => {
      renderList(listEl, posts, (item) => `<strong>[${item.name}]</strong><span class="post-meta">${item.createdAt}</span><div>${item.message}</div>`);
    };

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const name = nameInput.value.trim();
      const message = msgInput.value.trim();
      if (!name || !message) return;

      posts.unshift({ name, message, createdAt: formatNow() });
      posts = posts.slice(0, 25);
      saveList(STORAGE.bbs, posts);
      draw();
      form.reset();
    });

    draw();
  };

  setupCounter();
  setupNotice();
  setupJoin();
  setupBbs();
})();
