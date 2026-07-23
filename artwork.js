(() => {
  "use strict";

  const motion = window.MotionLibrary;
  if (!motion) throw new Error("motion library unavailable");

  const fallback = JSON.parse(document.querySelector("#pulse-fallback").textContent);
  const reduceMotion = motion.reduceMotion;
  const intervals = new Set();
  const timeouts = new Set();
  let pulse = fallback;
  let dropIntervalId = null;
  let lastScrollY = window.scrollY;
  let scrollFrame = null;
  let operations = null;

  const AUTOMATIC_EVENTS = Object.freeze([
    { minute: 350, label: "認証の目覚め" },
    { minute: 512, label: "運転開始" },
    { minute: 910, label: "終幕処理" },
    { minute: 1140, label: "夜の記録" }
  ]);

  function addTimeout(callback, delay) {
    const id = window.setTimeout(() => {
      timeouts.delete(id);
      callback();
    }, delay);
    timeouts.add(id);
    return id;
  }

  function addInterval(callback, delay) {
    const id = window.setInterval(callback, delay);
    intervals.add(id);
    return id;
  }

  function clearRuntimeMotion() {
    intervals.forEach(id => window.clearInterval(id));
    intervals.clear();
    timeouts.forEach(id => window.clearTimeout(id));
    timeouts.clear();
    dropIntervalId = null;
    document.querySelectorAll(".falling-number").forEach(node => node.remove());
    motion.stopAll();
  }

  function jstParts(now = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tokyo",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
    }).formatToParts(now);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return {
      year: Number(values.year), month: Number(values.month), day: Number(values.day),
      hour: Number(values.hour), minute: Number(values.minute), second: Number(values.second)
    };
  }

  function nextAutomaticEvent(parts) {
    const nowSeconds = parts.hour * 3600 + parts.minute * 60 + parts.second;
    const today = AUTOMATIC_EVENTS.find(event => event.minute * 60 > nowSeconds);
    const event = today || AUTOMATIC_EVENTS[0];
    const targetSeconds = event.minute * 60 + (today ? 0 : 86400);
    return { ...event, secondsRemaining: targetSeconds - nowSeconds };
  }

  function hhmmss(seconds) {
    const safe = Math.max(0, Math.floor(seconds));
    return [Math.floor(safe / 3600), Math.floor((safe % 3600) / 60), safe % 60]
      .map(value => String(value).padStart(2, "0")).join(":");
  }

  function updateClock() {
    const parts = jstParts();
    const minute = parts.hour * 60 + parts.minute;
    const event = nextAutomaticEvent(parts);
    const longClock = `${String(parts.hour).padStart(2,"0")}:${String(parts.minute).padStart(2,"0")}:${String(parts.second).padStart(2,"0")} JST`;
    const shortClock = `${String(parts.hour).padStart(2,"0")}:${String(parts.minute).padStart(2,"0")}`;
    document.querySelectorAll("[data-live='jst-clock']").forEach(node => { node.textContent = longClock; });
    document.querySelectorAll("[data-live='jst-short']").forEach(node => { node.textContent = shortClock; });
    document.querySelectorAll("[data-live='next-event-name']").forEach(node => { node.textContent = event.label; });
    document.querySelectorAll("[data-live='countdown']").forEach(node => {
      node.textContent = hhmmss(event.secondsRemaining);
      node.dataset.secondsRemaining = String(event.secondsRemaining);
    });
    document.documentElement.dataset.jstMinute = String(minute);
    document.documentElement.dataset.nextEventMinute = String(event.minute);
    motion.configureOrbit(document.querySelector(".scene-time-orbit"), minute);
  }

  function startClock() {
    updateClock();
    if (!reduceMotion.matches) addInterval(updateClock, 1000);
  }

  function hopResident() {
    const resident = document.querySelector(".resident-one");
    if (!resident || reduceMotion.matches) return;
    resident.classList.add("is-hopping");
    addTimeout(() => resident.classList.remove("is-hopping"), 320);
  }

  function triggerSceneDrop() {
    motion.playDrop(document.querySelector(".motion-drop-scene"), hopResident);
  }

  function scheduleSceneDrop() {
    const seconds = motion.dropIntervalSeconds(pulse.judgments_total);
    document.documentElement.dataset.dropInterval = seconds.toFixed(3);
    document.querySelectorAll("[data-derived='drop-interval']").forEach(node => { node.textContent = seconds.toFixed(1); });
    if (reduceMotion.matches) return;
    addTimeout(triggerSceneDrop, 850);
    dropIntervalId = addInterval(triggerSceneDrop, seconds * 1000);
  }

  function scheduleBlink(resident) {
    if (!resident || reduceMotion.matches) return;
    const blink = () => {
      resident.classList.add("is-blinking");
      addTimeout(() => resident.classList.remove("is-blinking"), 100);
      addTimeout(blink, 4000 + Math.random() * 3000);
    };
    addTimeout(blink, 4000 + Math.random() * 3000);
  }

  function showSpeech(button) {
    button.classList.add("show-speech");
    if (button._speechTimer) window.clearTimeout(button._speechTimer);
    button._speechTimer = addTimeout(() => button.classList.remove("show-speech"), 1500);
  }

  function emitNumber(container, value, index) {
    const node = document.createElement("span");
    node.className = "falling-number";
    node.textContent = String(value);
    node.style.setProperty("--left", `${10 + (index * 31) % 72}%`);
    container.appendChild(node);
    addTimeout(() => node.remove(), 25000);
  }

  function startNumberRain() {
    const container = document.querySelector(".number-rain");
    if (!container || reduceMotion.matches) return;
    const values = [pulse.judgments_total, pulse.judgments_week, pulse.lessons_total, pulse.days_running];
    let index = 0;
    const emit = () => { emitNumber(container, values[index++ % values.length], index); };
    emit();
    addTimeout(emit, 1300);
    addInterval(emit, 6800);
  }

  function formatUpdated(value) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.valueOf())) return value;
    return new Intl.DateTimeFormat("ja-JP", {
      timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23"
    }).format(parsed).replaceAll("/", ".") + " JST";
  }

  function bindPulseValues() {
    document.querySelectorAll("[data-pulse]").forEach(node => {
      const key = node.dataset.pulse;
      if (Object.hasOwn(pulse, key)) node.textContent = String(pulse[key]);
    });
    document.querySelectorAll("[data-live='updated-at']").forEach(node => { node.textContent = formatUpdated(pulse.updated_at_jst); });
  }

  function configureDataMotion() {
    document.querySelectorAll(".motion-bars").forEach(root => motion.configureBars(root, pulse));
    const vessel = document.querySelector(".vessel-toy");
    motion.configureVessel(vessel, 0, 1);
    document.querySelectorAll(".loop-toy").forEach(root => motion.configureLoop(root, pulse.days_running));
    motion.playStagger(document.querySelector(".stagger-value"));
    if (Number(pulse.judgments_today) > 0) addTimeout(() => motion.playCradle(document.querySelector(".motion-cradle")), 700);
  }

  function playMachine(card) {
    const type = card.dataset.motionCard;
    const toy = card.querySelector("[data-motion]");
    const handlers = {
      A1: () => motion.playDrop(toy),
      A2: () => motion.playStagger(toy),
      A3: () => motion.playOrbit(toy),
      A4: () => motion.playCradle(toy),
      A5: () => motion.playVessel(toy),
      A6: () => motion.playLoop(toy)
    };
    const played = handlers[type]?.() ?? false;
    card.classList.add("is-played");
    const count = Number(card.dataset.tapCount || 0) + 1;
    card.dataset.tapCount = String(count);
    const status = document.querySelector("#machine-status");
    if (status) status.textContent = reduceMotion.matches ? `${type} — 動きを減らす設定のため静止しています。` : `${type} — データの力を1回通しました。`;
    return played;
  }

  function wireInteractions() {
    document.querySelectorAll(".resident, .resident-hotspot").forEach(button => {
      button.addEventListener("click", () => showSpeech(button));
    });
    document.querySelectorAll("[data-motion-card]").forEach(card => {
      card.addEventListener("click", () => playMachine(card));
    });
  }

  function startSceneObserver() {
    const scenes = document.querySelectorAll(".scene");
    if (!("IntersectionObserver" in window)) {
      scenes.forEach(scene => scene.classList.add("is-visible"));
      return;
    }
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) entry.target.classList.add("is-visible");
      });
    }, { threshold: .14, rootMargin: "0px 0px -8%" });
    scenes.forEach(scene => observer.observe(scene));
  }

  function wireImageReveal() {
    document.querySelectorAll(".lazy-art").forEach((image, index) => {
      const reveal = () => addTimeout(() => image.classList.add("is-loaded"), index * 60);
      if (image.complete) reveal(); else image.addEventListener("load", reveal, { once: true });
    });
  }

  function updateSlosh() {
    scrollFrame = null;
    if (reduceMotion.matches) return;
    const velocity = motion.clamp(window.scrollY - lastScrollY, -40, 40);
    lastScrollY = window.scrollY;
    const angle = motion.clamp(velocity * .0375, -1.5, 1.5);
    const liquid = document.querySelector(".vessel-liquid");
    if (liquid) liquid.style.setProperty("--slosh-angle", `${angle.toFixed(3)}deg`);
  }

  function wireScrollSlosh() {
    window.addEventListener("scroll", () => {
      if (!scrollFrame) scrollFrame = window.requestAnimationFrame(updateSlosh);
    }, { passive: true });
  }

  function isVisible(element) {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth &&
      style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0;
  }

  async function auditAllScrollPositions() {
    const originalY = window.scrollY;
    const originalScrollBehavior = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = "auto";
    const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const positions = [];
    for (let y = 0; y <= maxY; y += window.innerHeight) positions.push(Math.min(y, maxY));
    if (positions.at(-1) !== maxY) positions.push(maxY);
    const unique = [...new Set(positions)];
    const results = [];
    for (const y of unique) {
      window.scrollTo(0, y);
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const visible = [...document.querySelectorAll("[data-motion-active]")].filter(isVisible);
      const running = visible.filter(element => element.getAnimations({ subtree: true }).some(animation => animation.playState === "running"));
      results.push({ y, visible: visible.map(element => element.dataset.motionActive), running: running.map(element => element.dataset.motionActive) });
    }
    window.scrollTo(0, originalY);
    document.documentElement.style.scrollBehavior = originalScrollBehavior;
    const pass = !reduceMotion.matches && results.every(row => row.running.length >= 1);
    return { pass, viewportHeight: window.innerHeight, maxScrollY: maxY, positions: results };
  }

  function render() {
    bindPulseValues();
    configureDataMotion();
    scheduleSceneDrop();
    startNumberRain();
    document.documentElement.dataset.pulseSource = pulse === fallback ? "fallback" : "live";
    document.documentElement.dataset.motionLibrary = motion.version;
  }

  function renderOperations(data) {
    operations = data;
    const monuments = data?.os1?.monuments || [];
    const os1 = document.querySelector("[data-operations='os1']");
    const cells = document.querySelector("[data-operations='os1-cells']");
    if (os1) os1.textContent = `${monuments.length}/${monuments.length} 墓標`;
    if (cells) cells.textContent = monuments.map(row => `${row.cell_id}: ${row.status}`).join(" / ");
    const survivalCells = document.querySelector("[data-operations='survival-cells']");
    const survivalMechanisms = document.querySelector("[data-operations='survival-mechanisms']");
    if (survivalCells) survivalCells.textContent = `${data?.survival?.cells ?? "—"}セル`;
    if (survivalMechanisms) {
      survivalMechanisms.textContent = `実効独立機序=${data?.survival?.effective_independent_mechanisms ?? "—"}`;
    }
    const clocks = data?.evaluation_clocks || [];
    const clockList = document.querySelector("[data-operations='evaluation-clocks']");
    if (clockList) {
      clockList.replaceChildren(...clocks.map(row => {
        const line = document.createElement("span");
        const label = document.createElement("b");
        const value = document.createElement("i");
        label.textContent = row.label;
        value.textContent = `n=${row.n}/${row.target}`;
        line.append(label, value);
        return line;
      }));
    }
    const liveClock = clocks.find(row => row.card_id === "PB-1v2");
    if (liveClock) {
      document.querySelectorAll("[data-operations-clock='n']").forEach(node => {
        node.textContent = String(liveClock.n);
      });
      document.querySelectorAll("[data-operations-clock='target']").forEach(node => {
        node.textContent = String(liveClock.target);
      });
      motion.configureVessel(
        document.querySelector(".vessel-toy"),
        Number(liveClock.n),
        Number(liveClock.target)
      );
    }
    const red = document.querySelector("[data-operations='red-history']");
    if (red) {
      red.replaceChildren(...(data?.red_history || []).map(row => {
        const line = document.createElement("span");
        const label = document.createElement("b");
        const value = document.createElement("i");
        label.textContent = row.trade_date;
        value.textContent = row.red_class;
        line.append(label, value);
        return line;
      }));
    }
  }

  function restartForMotionPreference() {
    clearRuntimeMotion();
    startClock();
    if (!reduceMotion.matches) {
      scheduleBlink(document.querySelector(".resident-one"));
      scheduleSceneDrop();
      startNumberRain();
    }
  }

  wireInteractions();
  startSceneObserver();
  wireImageReveal();
  wireScrollSlosh();
  startClock();
  scheduleBlink(document.querySelector(".resident-one"));
  reduceMotion.addEventListener("change", restartForMotionPreference);

  fetch("./pulse_public.json", { cache: "no-store" })
    .then(response => response.ok ? response.json() : Promise.reject(new Error("pulse unavailable")))
    .then(data => { pulse = { ...fallback, ...data }; render(); })
    .catch(() => render());

  fetch("./operations_public.json", { cache: "no-store" })
    .then(response => response.ok ? response.json() : Promise.reject(new Error("operations unavailable")))
    .then(renderOperations)
    .catch(() => {});

  window.LivingArtwork = Object.freeze({
    version: "2.0.0",
    automaticEvents: AUTOMATIC_EVENTS,
    dropIntervalSeconds: motion.dropIntervalSeconds,
    jstParts,
    nextAutomaticEvent,
    auditAllScrollPositions,
    playMachine,
    getPulse: () => ({ ...pulse }),
    getOperations: () => operations ? structuredClone(operations) : null
  });
})();
