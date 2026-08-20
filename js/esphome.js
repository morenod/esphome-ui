(() => {
  "use strict";

  const APP_ID = "esphome-modern-ui";
  const entities = new Map();
  let config = {};
  let connected = false;

  const DOMAIN_ORDER = [
    "light",
    "switch",
    "fan",
    "cover",
    "lock",
    "button",
    "number",
    "select",
    "text",
    "sensor",
    "binary_sensor"
  ];

  const ICONS = {
    light: "💡",
    switch: "⏻",
    fan: "🌀",
    cover: "▤",
    lock: "🔒",
    button: "●",
    number: "#",
    select: "⌄",
    text: "✎",
    sensor: "◉",
    binary_sensor: "◆",
    climate: "◐",
    default: "•"
  };

  function escapeHtml(value = "") {
    return String(value).replace(/[&<>"']/g, c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[c]));
  }

  function entityId(data) {
    /*
     * ESPHome actual usa IDs del estilo:
     *
     *   sensor/temperature
     *   switch/relay
     *
     * Dejamos name_id como fallback para versiones anteriores.
     */
    return data.name_id || data.id || "";
  }

  function splitId(id) {
    if (id.includes("/")) {
      const parts = id.split("/");

      return {
        domain: parts[0],
        name: parts[parts.length - 1],
        path: parts.slice(1)
      };
    }

    /*
     * Compatibilidad legacy:
     *
     *   sensor-temperature
     */

    const idx = id.indexOf("-");

    return idx > 0
      ? {
          domain: id.slice(0, idx),
          name: id.slice(idx + 1),
          path: [id.slice(idx + 1)]
        }
      : {
          domain: "unknown",
          name: id,
          path: [id]
        };
  }

  function displayName(entity) {
    return (
      entity.name ||
      entity.friendly_name ||
      splitId(entityId(entity))
        .name
        .replace(/[-_]/g, " ")
        .replace(/\b\w/g, m => m.toUpperCase())
    );
  }

  function domainOf(entity) {
    return splitId(entityId(entity)).domain;
  }

  function apiPath(entity, action = "") {
    const info = splitId(entityId(entity));

    const encoded = info.path
      .map(encodeURIComponent)
      .join("/");

    return (
      `/${encodeURIComponent(info.domain)}/${encoded}` +
      (action ? `/${action}` : "")
    );
  }

  function isOn(entity) {
    return [
      "ON",
      "OPEN",
      "LOCKED",
      "ACTIVE",
      "RUNNING",
      "HEATING",
      "COOLING"
    ].includes(String(entity.state || "").toUpperCase());
  }

  async function post(entity, action, params = {}) {
    const url = new URL(
      apiPath(entity, action),
      location.origin
    );

    Object.entries(params).forEach(([key, value]) => {
      if (
        value !== undefined &&
        value !== null &&
        value !== ""
      ) {
        url.searchParams.set(key, value);
      }
    });

    try {
      const response = await fetch(url, {
        method: "POST"
      });

      if (!response.ok) {
        throw new Error(
          `${response.status} ${response.statusText}`
        );
      }
    } catch (error) {
      toast(`Error: ${error.message}`);
    }
  }

  function toast(message) {
    let node = document.querySelector(".emu-toast");

    if (!node) {
      node = document.createElement("div");
      node.className = "emu-toast";
      document.body.appendChild(node);
    }

    node.textContent = message;
    node.classList.add("show");

    clearTimeout(node._timer);

    node._timer = setTimeout(() => {
      node.classList.remove("show");
    }, 2600);
  }

  function formatUptime(seconds) {
    if (!Number.isFinite(Number(seconds))) {
      return "";
    }

    let s = Number(seconds);

    const d = Math.floor(s / 86400);
    s %= 86400;

    const h = Math.floor(s / 3600);
    s %= 3600;

    const m = Math.floor(s / 60);

    if (d) {
      return `${d}d ${h}h`;
    }

    if (h) {
      return `${h}h ${m}m`;
    }

    return `${m}m`;
  }

  function entityControl(entity) {
    const domain = domainOf(entity);
    const state = escapeHtml(entity.state ?? "—");

    /*
     * SWITCH / LIGHT / FAN
     */

    if (
      domain === "switch" ||
      domain === "light" ||
      domain === "fan"
    ) {
      return `
        <button
          class="emu-toggle ${isOn(entity) ? "on" : ""}"
          data-action="toggle"
          aria-label="Cambiar estado"
        >
          <span></span>
        </button>
      `;
    }

    /*
     * BUTTON
     */

    if (domain === "button") {
      return `
        <button
          class="emu-action"
          data-action="press"
        >
          Pulsar
        </button>
      `;
    }

    /*
     * COVER
     */

    if (domain === "cover") {
      return `
        <div class="emu-actions">

          <button
            data-action="open"
            title="Abrir"
          >
            ↑
          </button>

          <button
            data-action="stop"
            title="Parar"
          >
            ■
          </button>

          <button
            data-action="close"
            title="Cerrar"
          >
            ↓
          </button>

        </div>
      `;
    }

    /*
     * LOCK
     */

    if (domain === "lock") {
      const locked =
        String(entity.state || "").toUpperCase() ===
        "LOCKED";

      return `
        <button
          class="emu-action"
          data-action="${locked ? "unlock" : "lock"}"
        >
          ${locked ? "Abrir" : "Cerrar"}
        </button>
      `;
    }

    /*
     * NUMBER
     */

    if (domain === "number") {
      const value =
        entity.value ??
        parseFloat(entity.state);

      const min =
        entity.min_value ??
        entity.min ??
        0;

      const max =
        entity.max_value ??
        entity.max ??
        100;

      const step =
        entity.step ??
        1;

      return `
        <div class="emu-number">

          <input
            type="range"
            min="${min}"
            max="${max}"
            step="${step}"
            value="${
              Number.isFinite(Number(value))
                ? value
                : min
            }"
            data-action="number"
          >

          <span>${state}</span>

        </div>
      `;
    }

    /*
     * SELECT
     */

    if (
      domain === "select" &&
      Array.isArray(entity.option)
    ) {
      return selectHtml(
        entity,
        entity.option
      );
    }

    if (
      domain === "select" &&
      Array.isArray(entity.options)
    ) {
      return selectHtml(
        entity,
        entity.options
      );
    }

    /*
     * SENSORES / FALLBACK
     */

    return `
      <div class="emu-state">
        ${state}
      </div>
    `;
  }

  function selectHtml(entity, options) {
    return `
      <select data-action="select">

        ${options
          .map(option => `
            <option
              ${
                String(option) === String(entity.state)
                  ? "selected"
                  : ""
              }
            >
              ${escapeHtml(option)}
            </option>
          `)
          .join("")}

      </select>
    `;
  }

  function cardHtml(entity) {
    const domain = domainOf(entity);
    const active = isOn(entity)
      ? " active"
      : "";

    return `
      <article
        class="emu-card${active}"
        data-id="${escapeHtml(entityId(entity))}"
      >

        <div class="emu-icon">
          ${ICONS[domain] || ICONS.default}
        </div>

        <div class="emu-card-body">

          <div class="emu-name">
            ${escapeHtml(displayName(entity))}
          </div>

          <div class="emu-domain">
            ${escapeHtml(
              domain.replace("_", " ")
            )}
          </div>

        </div>

        <div class="emu-control">
          ${entityControl(entity)}
        </div>

      </article>
    `;
  }

  function groupTitle(domain) {
    const titles = {
      light: "Luces",
      switch: "Interruptores",
      fan: "Ventiladores",
      cover: "Persianas y cubiertas",
      lock: "Cerraduras",
      button: "Acciones",
      number: "Valores",
      select: "Opciones",
      text: "Texto",
      sensor: "Sensores",
      binary_sensor: "Sensores binarios",
      climate: "Clima"
    };

    return (
      titles[domain] ||
      domain.replace("_", " ")
    );
  }

  function render() {
    const root =
      document.getElementById(APP_ID);

    if (!root) {
      return;
    }

    const grouped = {};

    for (const entity of entities.values()) {
      const domain = domainOf(entity);

      if (!grouped[domain]) {
        grouped[domain] = [];
      }

      grouped[domain].push(entity);
    }

    const domains =
      Object.keys(grouped).sort((a, b) => {

        const ai =
          DOMAIN_ORDER.indexOf(a);

        const bi =
          DOMAIN_ORDER.indexOf(b);

        return (
          (ai < 0 ? 999 : ai) -
            (bi < 0 ? 999 : bi) ||
          a.localeCompare(b)
        );
      });

    root.innerHTML = `
      <div class="emu-shell">

        <header class="emu-header">

          <div>

            <div class="emu-eyebrow">
              ESPHome
            </div>

            <h1>
              ${escapeHtml(
                config.title ||
                document.title ||
                "ESPHome"
              )}
            </h1>

            ${
              config.comment
                ? `
                  <p>
                    ${escapeHtml(config.comment)}
                  </p>
                `
                : ""
            }

          </div>

          <div
            class="
              emu-status
              ${connected ? "online" : "offline"}
            "
          >

            <span class="emu-dot"></span>

            ${
              connected
                ? "Online"
                : "Offline"
            }

          </div>

        </header>

        <main>

          ${domains
            .map(domain => `
              <section class="emu-section">

                <div class="emu-section-head">

                  <h2>
                    ${escapeHtml(
                      groupTitle(domain)
                    )}
                  </h2>

                  <span>
                    ${grouped[domain].length}
                  </span>

                </div>

                <div class="emu-grid">

                  ${grouped[domain]
                    .sort((a, b) =>
                      displayName(a)
                        .localeCompare(
                          displayName(b)
                        )
                    )
                    .map(cardHtml)
                    .join("")}

                </div>

              </section>
            `)
            .join("")}

          ${
            domains.length === 0
              ? `
                <div class="emu-empty">

                  <div class="emu-loader"></div>

                  <strong>
                    Conectando con el dispositivo…
                  </strong>

                  <span>
                    Esperando estados de ESPHome
                  </span>

                </div>
              `
              : ""
          }

        </main>

        <footer class="emu-footer">

          <span>
            ${escapeHtml(location.hostname)}
          </span>

          ${
            config.uptime !== undefined
              ? `
                <span>
                  Uptime
                  ${formatUptime(config.uptime)}
                </span>
              `
              : ""
          }

          <span>
            ${entities.size} entidades
          </span>

        </footer>

      </div>
    `;

    wireControls(root);
  }

  function wireControls(root) {
    root
      .querySelectorAll("[data-action]")
      .forEach(control => {

        const card =
          control.closest(".emu-card");

        if (!card) {
          return;
        }

        const entity =
          entities.get(card.dataset.id);

        if (!entity) {
          return;
        }

        const action =
          control.dataset.action;

        /*
         * TOGGLE
         */

        if (action === "toggle") {

          control.addEventListener(
            "click",
            () => post(entity, "toggle")
          );

        /*
         * ACCIONES SIMPLES
         */

        } else if (
          [
            "press",
            "open",
            "close",
            "stop",
            "lock",
            "unlock"
          ].includes(action)
        ) {

          control.addEventListener(
            "click",
            () => post(entity, action)
          );

        /*
         * NUMBER
         */

        } else if (
          action === "number"
        ) {

          control.addEventListener(
            "change",
            () =>
              post(
                entity,
                "set",
                {
                  value: control.value
                }
              )
          );

        /*
         * SELECT
         */

        } else if (
          action === "select"
        ) {

          control.addEventListener(
            "change",
            () =>
              post(
                entity,
                "set",
                {
                  option: control.value
                }
              )
          );
        }
      });
  }

  function mount() {
    /*
     * Eliminamos visualmente el frontend estándar.
     *
     * ESPHome continúa funcionando como backend:
     *
     *   /events
     *   /sensor/...
     *   /switch/...
     *   /light/...
     *   etc.
     */

    document.documentElement
      .classList.add("emu-active");

    document.body.innerHTML = `
      <div id="${APP_ID}"></div>
    `;

    render();

    /*
     * EventSource de ESPHome.
     *
     * Aquí recibimos cambios de estado
     * en tiempo real.
     */

    const events =
      new EventSource("/events");

    events.addEventListener(
      "open",
      () => {

        connected = true;

        render();
      }
    );

    events.addEventListener(
      "error",
      () => {

        connected = false;

        render();
      }
    );

    /*
     * Información general del nodo.
     */

    events.addEventListener(
      "ping",
      event => {

        connected = true;

        try {

          const data =
            JSON.parse(
              event.data || "{}"
            );

          config = {
            ...config,
            ...data
          };

          if (config.title) {
            document.title =
              config.title;
          }

        } catch (_) {}

        render();
      }
    );

    /*
     * Estados de entidades.
     */

    events.addEventListener(
      "state",
      event => {

        try {

          const data =
            JSON.parse(event.data);

          const id =
            entityId(data);

          if (!id) {
            return;
          }

          entities.set(
            id,
            {
              ...(entities.get(id) || {}),
              ...data
            }
          );

          render();

        } catch (error) {

          console.warn(
            "ESPHome UI: invalid state event",
            error
          );
        }
      }
    );
  }

  /*
   * Inicialización
   */

  if (
    document.readyState === "loading"
  ) {

    document.addEventListener(
      "DOMContentLoaded",
      mount,
      {
        once: true
      }
    );

  } else {

    mount();
  }

})();
