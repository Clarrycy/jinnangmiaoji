// 由 src/core/overlay-preload.ts 生成（node scripts/build-ts.js）；改源文件，不要改这里。
const electron_ = require("electron");
const { ipcRenderer } = electron_;
window.addEventListener("DOMContentLoaded", () => {
  const act = (action) => ipcRenderer.send("jnd-overlay-action", action);
  const $ = (id) => document.getElementById(id);
  const kind = $("main") ? "menu" : $("focus") ? "version" : $("qr") ? "qr" : $("yes") ? "save" : "";
  if (kind === "menu") {
    const main = $("main"), sub = $("sub");
    let model = null, subOpen = false;
    const item = (label, onClick, extra = {}) => {
      const node = document.createElement("div");
      node.className = `item${extra.on ? " on" : ""}${extra.sub ? " sub" : ""}${extra.open ? " open" : ""}`;
      const text = document.createElement("span");
      text.textContent = label;
      node.append(text);
      if (extra.on) {
        const chk = document.createElement("i");
        chk.className = "chk";
        node.append(chk);
      }
      node.addEventListener("click", (event) => {
        event.stopPropagation();
        onClick();
      });
      return node;
    };
    const render = () => {
      main.style.left = `${model.anchor.x}px`;
      main.style.top = `${model.anchor.y}px`;
      main.textContent = "";
      for (const entry of model.entries) main.append(item(entry.label, () => act({ type: "entry", id: entry.id }), { on: entry.id === model.currentEntry }));
      const sep = document.createElement("div");
      sep.className = "sep";
      main.append(sep);
      const other = item(model.otherLabel, () => {
        subOpen = !subOpen;
        render();
      }, { sub: true, open: subOpen });
      other.addEventListener("mouseenter", () => {
        if (!subOpen) {
          subOpen = true;
          render();
        }
      });
      main.append(other);
      sub.hidden = !subOpen;
      if (subOpen) {
        sub.textContent = "";
        for (const provider of model.providers) sub.append(item(provider.label, () => act({ type: "provider", id: provider.id })));
        sub.style.left = `${model.anchor.x + main.offsetWidth + 2}px`;
        sub.style.top = `${model.anchor.y + other.offsetTop}px`;
      }
    };
    ipcRenderer.on("jnd-overlay-model", (_event, next) => {
      model = next;
      subOpen = false;
      render();
    });
    document.addEventListener("click", () => act({ type: "close" }));
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") act({ type: "close" });
    });
    let subTimer = null;
    document.addEventListener("mousemove", (event) => {
      if (!subOpen) return;
      const hit = (node) => {
        if (!node || node.hidden) return false;
        const r = node.getBoundingClientRect();
        return event.clientX >= r.left - 4 && event.clientX <= r.right + 4 && event.clientY >= r.top - 4 && event.clientY <= r.bottom + 4;
      };
      if (hit(main) || hit(sub)) {
        clearTimeout(subTimer);
        subTimer = null;
        return;
      }
      if (!subTimer) subTimer = setTimeout(() => {
        subTimer = null;
        subOpen = false;
        render();
      }, 300);
    });
    return;
  }
  if (kind === "version") {
    const card = $("card"), focus = $("focus"), more = $("more"), moreText = $("more-text"), plus = $("plus"), list = $("list");
    const url = $("url"), go = $("go"), file = $("file"), status = $("status");
    let model = null, open = false;
    const row = (name, detail, extra = {}) => {
      const node = document.createElement("div");
      node.className = "row";
      const inner = extra.pad ? document.createElement("div") : node;
      if (extra.pad) {
        inner.className = "pad";
        node.append(inner);
      }
      const vn = document.createElement("span");
      vn.className = "vn";
      vn.textContent = name;
      inner.append(vn);
      const vd = document.createElement("span");
      vd.className = `vd${extra.tone ? ` ${extra.tone}` : ""}`;
      vd.textContent = detail;
      inner.append(vd);
      if (extra.button) {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = extra.button;
        b.disabled = Boolean(extra.disabled);
        b.addEventListener("click", (event) => {
          event.stopPropagation();
          extra.onClick();
        });
        node.append(b);
      }
      return node;
    };
    const render = () => {
      if (!model) return;
      if ("x" in model) card.style.setProperty("--x", `${Number(model.x) || 0}px`);
      const items = model.items || [];
      const updatable = items.filter((i) => i.updatable);
      const rest = items.filter((i) => !i.updatable);
      focus.textContent = "";
      if (updatable.length === 0) focus.append(row(model.checking ? "正在检查…" : "全部为最新", "", { pad: true, tone: "quiet" }));
      for (const i of updatable) {
        const busy = i.phase === "downloading" || i.phase === "verifying";
        const detail = i.phase === "ready" ? i.readyText || "已更新，下次进入游戏生效" : busy ? "正在下载…" : i.phase === "error" ? `更新失败：${i.error || ""}` : `${i.current} → ${i.latest}`;
        const tone = i.phase === "ready" ? "ok" : i.phase === "error" ? "quiet" : "";
        focus.append(row(i.name, detail, { pad: true, tone, button: i.phase === "ready" ? "" : "更新", disabled: busy, onClick: () => act({ type: "update", id: i.id, keep: true }) }));
      }
      moreText.textContent = `${updatable.length ? "其余 " : ""}${rest.length} 项均为最新 · ${model.checking ? "正在检查…" : model.checkedText || "刚刚检查"}`;
      list.textContent = "";
      for (const i of rest) list.append(row(i.name, i.current || i.note || "", {}));
      list.hidden = !open;
      plus.classList.toggle("open", open);
      if ("status" in model) {
        status.textContent = model.status || "等待输入链接…";
        status.className = model.statusTone || "";
      }
      if ("busy" in model) {
        go.disabled = Boolean(model.busy);
      }
    };
    more.addEventListener("click", (event) => {
      event.stopPropagation();
      open = !open;
      render();
    });
    go.addEventListener("click", (event) => {
      event.stopPropagation();
      const value = url.value.trim();
      if (!value) {
        status.textContent = "等待输入链接…";
        status.className = "";
        return;
      }
      act({ type: "import", source: value, keep: true });
    });
    url.addEventListener("keydown", (event) => {
      if (event.key === "Enter") go.click();
    });
    file.addEventListener("click", (event) => {
      event.stopPropagation();
      act({ type: "pick-file", keep: true });
    });
    ipcRenderer.on("jnd-overlay-model", (_event, next) => {
      model = { ...model || {}, ...next };
      if ("pickedPath" in next && next.pickedPath) url.value = next.pickedPath;
      render();
    });
    document.addEventListener("click", (event) => {
      if (!card.contains(event.target)) act({ type: "close" });
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") act({ type: "close" });
    });
    return;
  }
  if (kind === "qr") {
    const qrCard = $("card");
    let title = "";
    requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.add("in")));
    let closing = false;
    const closeAnimated = () => {
      if (closing) return;
      closing = true;
      document.body.classList.remove("in");
      setTimeout(() => act({ type: "close" }), 170);
    };
    ipcRenderer.on("jnd-overlay-model", (_event, next) => {
      closing = false;
      document.body.classList.add("in");
      if (typeof next.title === "string") title = next.title;
      $("title").textContent = title;
      const image = $("qr");
      if (next.qr) {
        image.src = next.qr;
        image.hidden = false;
      } else if ("qr" in next) {
        image.hidden = true;
        image.removeAttribute("src");
      }
      if ("text" in next) $("text").textContent = String(next.text || "");
    });
    document.addEventListener("click", (event) => {
      if (!qrCard.contains(event.target)) closeAnimated();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeAnimated();
    });
    return;
  }
  if (kind === "save") {
    const account = $("account"), password = $("password");
    ipcRenderer.on("jnd-overlay-model", (_event, next) => {
      if ("x" in next) $("card").style.setProperty("--x", `${Number(next.x) || 0}px`);
      $("title").textContent = next.mode === "changed" ? "更新密码？" : "保存密码？";
      $("yes").textContent = next.mode === "changed" ? "更新" : "保存";
      account.value = next.account || "";
      password.value = next.password || "";
      password.type = "password";
    });
    $("eye").addEventListener("click", () => {
      password.type = password.type === "password" ? "text" : "password";
    });
    $("yes").addEventListener("click", () => act({ type: "save", account: account.value.trim(), password: password.value }));
    $("no").addEventListener("click", () => act({ type: "close" }));
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") act({ type: "close" });
    });
  }
});
