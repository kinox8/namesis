// サーバーとの通信 (node server.js で 起動したときだけ 使える): ログイン・セーブの保存・オンライン対戦
(function () {
  const NS = (globalThis.NS = globalThis.NS || {});

  async function api(method, url, body) {
    const res = await fetch(url, {
      method, credentials: 'same-origin', cache: 'no-store',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch (e) { /* 中身なし */ }
    if (!res.ok) {
      const err = new Error((data && data.error) || `通信エラー (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  const net = { available: false, user: null, api };
  NS.net = net;

  // サーバーがあるか・ログインしているか
  net.init = async function () {
    if (location.protocol === 'file:') return null;
    try {
      const d = await api('GET', '/api/me');
      net.available = true;
      net.user = d.user;
    } catch (e) {
      net.available = false;
      net.user = null;
    }
    return net.user;
  };
  net.auth = async function (kind, name, password) { // kind = 'login' | 'register'
    const d = await api('POST', '/api/' + kind, { name, password });
    net.user = d.user;
    return d.user;
  };
  net.logout = async function () {
    net.flushSave();
    try { await api('POST', '/api/logout'); } catch (e) { /* noop */ }
    net.user = null;
  };

  // ---- セーブ: 変わったら 少し待って まとめて送る ----
  net.loadSave = async () => (await api('GET', '/api/save')).save;
  let timer = null, pending = null;
  net.queueSave = function (save) {
    if (!net.user) return;
    pending = JSON.stringify(save);
    clearTimeout(timer);
    timer = setTimeout(() => net.flushSave(), 1200);
  };
  // 送り終わるまで まつ Promise を 返す (対戦の 部屋を つくる前に セーブを サーバーに そろえる)
  net.flushSave = function (leaving) {
    clearTimeout(timer);
    if (!pending || !net.user) return Promise.resolve();
    const body = `{"save":${pending}}`;
    pending = null;
    return fetch('/api/save', {
      method: 'PUT', credentials: 'same-origin', keepalive: !!leaving && body.length < 60000,
      headers: { 'Content-Type': 'application/json' }, body,
    }).catch(() => { if (!pending) pending = body.slice(8, -1); });
  };
  window.addEventListener('pagehide', () => net.flushSave(true));

  // 通信が 一瞬 切れても 少し待って やりなおす (サーバーが「だめ」と 返したときは やりなおさない)
  net.retry = async function (fn, tries = 8) {
    for (let i = 0; ; i++) {
      try { return await fn(); } catch (e) {
        if (i >= tries || (e.status && e.status < 500)) throw e;
        await new Promise((r) => setTimeout(r, 1000 * Math.min(5, i + 1)));
      }
    }
  };
})();
