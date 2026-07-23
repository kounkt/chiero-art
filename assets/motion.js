(() => {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const activeTimers = new Set();

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value) || 0));
  }

  function dropIntervalSeconds(total) {
    return clamp(86400 / Math.max(1, Number(total) || 1), 6, 30);
  }

  function pulseElement(element, className = "is-playing", duration = 1100) {
    if (!element || reduceMotion.matches) return false;
    element.classList.remove(className);
    void element.offsetWidth;
    element.classList.add(className);
    const timer = window.setTimeout(() => {
      element.classList.remove(className);
      activeTimers.delete(timer);
    }, duration);
    activeTimers.add(timer);
    return true;
  }

  function playDrop(element, onLand) {
    const played = pulseElement(element, "is-playing", 1650);
    if (!played) return false;
    const timer = window.setTimeout(() => {
      onLand?.();
      activeTimers.delete(timer);
    }, 900);
    activeTimers.add(timer);
    return true;
  }

  function configureBars(root, pulse) {
    const keys = ["judgments_today", "judgments_week", "judgments_market", "lessons_total", "no_trade_days"];
    const values = keys.map(key => Math.max(0, Number(pulse[key]) || 0));
    const maximum = Math.max(1, ...values);
    root?.querySelectorAll("[data-bar]").forEach((bar, index) => {
      const value = values[index];
      const height = 18 + (value / maximum) * 72;
      bar.style.setProperty("--bar-height", `${height.toFixed(2)}%`);
      bar.dataset.value = String(value);
      bar.dataset.heightPercent = height.toFixed(2);
    });
  }

  function playStagger(element) {
    return pulseElement(element, "is-playing", 850);
  }

  function configureOrbit(root, minutes) {
    if (!root) return;
    const place = (element, minute, radiusX, radiusY) => {
      const angle = (minute / 1440) * Math.PI * 2;
      element.style.left = `${50 + radiusX * Math.sin(angle)}%`;
      element.style.top = `${50 - radiusY * Math.cos(angle)}%`;
    };
    const current = root.querySelector("[data-current-satellite]");
    if (current) {
      place(current, minutes, 27.2, 33.1);
      current.dataset.jstMinute = String(minutes);
    }
    root.querySelectorAll("[data-task-minute]").forEach((satellite, index) => {
      const taskMinute = Number(satellite.dataset.taskMinute);
      place(satellite, taskMinute, 30.5 + (index % 2) * 3.4, 36 + (index % 2) * 3.4);
      satellite.classList.toggle("is-past", taskMinute < minutes);
      const delta = Math.abs(taskMinute - minutes);
      satellite.classList.toggle("is-now", Math.min(delta, 1440 - delta) <= 1);
    });
  }

  function playOrbit(element) {
    return pulseElement(element, "is-playing", 1500);
  }

  function playCradle(element) {
    return pulseElement(element, "is-playing", 1200);
  }

  function configureVessel(root, numerator, denominator) {
    if (!root) return 0;
    const ratio = denominator > 0 ? clamp(numerator / denominator, 0, 1) : 0;
    const percent = ratio * 100;
    root.style.setProperty("--liquid-level", `${percent.toFixed(2)}%`);
    const label = root.querySelector("[data-derived='pb1-percent']");
    if (label) label.textContent = `${percent.toFixed(0)}%`;
    root.dataset.numerator = String(numerator);
    root.dataset.denominator = String(denominator);
    root.dataset.levelPercent = percent.toFixed(2);
    return percent;
  }

  function playVessel(element) {
    return pulseElement(element, "is-playing", 1000);
  }

  function configureLoop(root, daysRunning) {
    if (!root) return;
    const life = clamp(daysRunning, 0, 60);
    const first = 120 - life;
    root.style.setProperty("--loop-one", `${first}s`);
    root.style.setProperty("--loop-two", `${first + 30}s`);
    root.style.setProperty("--loop-three", `${first + 60}s`);
    root.dataset.daysRunning = String(daysRunning);
  }

  function playLoop(element) {
    return pulseElement(element, "is-playing", 1450);
  }

  function stopAll() {
    activeTimers.forEach(timer => window.clearTimeout(timer));
    activeTimers.clear();
    document.querySelectorAll(".is-playing").forEach(element => element.classList.remove("is-playing"));
  }

  reduceMotion.addEventListener("change", event => {
    if (event.matches) stopAll();
  });

  window.MotionLibrary = Object.freeze({
    version: "2.0.0",
    reduceMotion,
    clamp,
    dropIntervalSeconds,
    playDrop,
    configureBars,
    playStagger,
    configureOrbit,
    playOrbit,
    playCradle,
    configureVessel,
    playVessel,
    configureLoop,
    playLoop,
    stopAll
  });
})();
