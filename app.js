(() => {
  "use strict";

  const circuitInfo = {
    gates: { index: "MODULE 01 / COMBINATIONAL", title: "基本論理ゲート" },
    rs: { index: "MODULE 02 / BISTABLE", title: "RSラッチ・RSフリップフロップ" },
    jk: { index: "MODULE 03 / EDGE TRIGGERED", title: "JKフリップフロップ" },
    d: { index: "MODULE 04 / DATA STORAGE", title: "Dラッチ・Dフリップフロップ" },
    t: { index: "MODULE 05 / TOGGLE", title: "Tフリップフロップ" }
  };
  const descriptions = {
    gates: ["論理ゲートは入力の組み合わせに応じて出力を決める組み合わせ回路です。状態を記憶せず、入力が変わると出力もすぐに変わります。", "<strong>NOT</strong>は1入力を反転し、AND / OR / XORなどは2入力の論理演算を行います。NAND・NORはそれぞれAND・ORの出力を反転したものです。"],
    rs: ["RS回路はSETでQを1、RESETでQを0にし、それ以外では前の状態を保持する記憶回路です。NOR型はS=R=1、NAND型はS̅=R̅=0が禁止入力です。", "NOR型ラッチは入力レベルで動作します。クロック付きRS-FFは選択したエッジでのみS/Rを取り込みます。禁止入力ではQとQ̅の相補関係が失われるため、状態を「?」として示します。"],
    jk: ["JK-FFはクロックの指定エッジでJとKを取り込みます。両方0なら保持、Jだけ1ならSET、Kだけ1ならRESET、両方1なら反転します。", "入力を変えただけでは状態は変わりません。次の指定エッジまで待ちます。J=K=1でも、エッジごとに一度だけ反転します。"],
    d: ["Dラッチはイネーブル（CLK）がHIGHの間、QがDを追いかけます。D-FFは指定エッジの瞬間のDだけを取り込み、次のエッジまで保持します。", "「レベル」は信号がHIGHのあいだ有効、「エッジ」はLOW→HIGH（立ち上がり）またはHIGH→LOW（立ち下がり）になった瞬間だけ有効です。"],
    t: ["T-FFは指定エッジでT=1ならQを反転し、T=0なら状態を保持します。クロックを分周するカウンタの基本要素です。", "入力Tの値はエッジでサンプリングされます。T=1のままでも、エッジが来なければQは変化しません。"]
  };

  const state = {
    circuit: "gates", gate: "AND", rsMode: "nor", dMode: "ff", edge: "rising",
    inputs: { A: 0, B: 0, S: 0, R: 0, J: 0, K: 0, D: 0, T: 0 },
    clock: 0, previousClock: 0, q: null, initialQ: null, autoTimer: null,
    step: 0, stepEdge: null, stepTarget: null, stepHistory: [], lastEvent: "回路を選択して入力を操作してください。"
  };
  const $ = (selector) => document.querySelector(selector);
  const modeRow = $("#mode-row");

  const edgeName = () => state.edge === "rising" ? "立ち上がり" : "立ち下がり";
  const isStateful = () => state.circuit !== "gates";
  const usesClock = () => state.circuit === "jk" || state.circuit === "t" ||
    (state.circuit === "rs" && state.rsMode === "clocked") ||
    (state.circuit === "d" && state.dMode === "ff");
  const isLatch = () => state.circuit === "rs" && state.rsMode !== "clocked" ||
    state.circuit === "d" && state.dMode === "latch";
  const displayBit = (value) => value === null || value === undefined ? "?" : String(value);

  function setEvent(text) {
    state.lastEvent = text;
    $("#event-description").textContent = text;
  }

  function switchControl(name, label, value, note = "") {
    return `<div class="input-row"><span class="input-name">${label}</span><div class="switch-wrap"><span class="value-label ${value ? "on" : ""}">${value}</span><button class="toggle" role="switch" aria-checked="${!!value}" aria-label="${label} を ${value ? 0 : 1} に切り替え" data-input="${name}" title="${note || "クリックまたはEnter/Spaceで切り替え"}"></button></div></div>`;
  }

  function currentInputs() {
    if (state.circuit === "gates") return state.gate === "NOT" ? ["A", "A"] : ["A", "B"];
    if (state.circuit === "rs") return ["S", "R"];
    if (state.circuit === "jk") return ["J", "K"];
    if (state.circuit === "d") return ["D"];
    return ["T"];
  }

  function renderModes() {
    const select = (id, label, options, value) =>
      `<label class="mode-label"><span class="sr-only">${label}</span><select class="mode-select" id="${id}" aria-label="${label}">${options.map(([v, n]) => `<option value="${v}" ${value === v ? "selected" : ""}>${n}</option>`).join("")}</select></label>`;
    let markup = "";
    if (state.circuit === "gates") {
      markup = select("gate-mode", "論理ゲート", [["AND","AND"],["OR","OR"],["NOT","NOT"],["NAND","NAND"],["NOR","NOR"],["XOR","XOR"],["XNOR","XNOR"]], state.gate);
    } else if (state.circuit === "rs") {
      markup = select("rs-mode", "RS回路の種類", [["nor","NOR型ラッチ（S/R 有効 HIGH）"],["nand","NAND型ラッチ（S̅/R̅ 有効 LOW）"],["clocked","クロック付きRS-FF（エッジ動作）"]], state.rsMode);
    } else if (state.circuit === "d") {
      markup = select("d-mode", "D回路の種類", [["latch","Dラッチ（レベル動作）"],["ff","D-FF（エッジ動作）"]], state.dMode);
    }
    if (["jk","t","d"].includes(state.circuit) || state.circuit === "rs" && state.rsMode === "clocked") {
      markup += select("edge-mode", "有効クロックエッジ", [["rising","立ち上がりエッジ"],["falling","立ち下がりエッジ"]], state.edge);
    }
    modeRow.innerHTML = markup;
    modeRow.querySelectorAll("select").forEach((el) => el.addEventListener("change", (event) => {
      const { id, value } = event.target;
      if (id === "gate-mode") state.gate = value;
      if (id === "rs-mode") { state.rsMode = value; state.q = null; state.initialQ = null; }
      if (id === "d-mode") { state.dMode = value; state.q = null; state.initialQ = null; }
      if (id === "edge-mode") state.edge = value;
      stopClock();
      state.step = 0;
      state.stepHistory = [];
      setEvent("回路モードを変更しました。入力とクロックを操作してください。");
      render();
    }));
  }

  function renderControls() {
    const names = currentInputs();
    const inputLabels = {
      A: "入力 A", B: "入力 B", S: state.rsMode === "nand" ? "S̅ (SET̅)" : "S (SET)",
      R: state.rsMode === "nand" ? "R̅ (RESET̅)" : "R (RESET)",
      J: "入力 J", K: "入力 K", D: "データ D", T: "入力 T"
    };
    $("#input-controls").innerHTML = [...new Set(names)].map((name) =>
      switchControl(name, inputLabels[name], state.inputs[name])).join("");
    $("#input-controls").querySelectorAll(".toggle").forEach((button) => {
      button.addEventListener("click", () => {
        const key = button.dataset.input;
        state.inputs[key] = 1 - state.inputs[key];
        state.step = 0;
        state.stepHistory = [];
        if (state.circuit === "gates") setEvent("入力が変化し、組み合わせ論理の出力が更新されました。");
        else if (isLatch() && (state.circuit === "rs" || state.clock === 1)) updateLevelSensitive();
        else setEvent("入力を設定しました。内部状態は有効なクロックエッジまで保持されます。");
        render();
      });
    });

    const clockRoot = $("#clock-controls");
    if (!usesClock() && !(state.circuit === "d" && state.dMode === "latch")) {
      clockRoot.innerHTML = "";
      return;
    }
    clockRoot.innerHTML = `<div class="clock-box"><div class="clock-head"><span>CLK / CLOCK</span><span class="clock-state">CLK = ${state.clock}</span></div><div class="clock-buttons"><button data-clock="high">HIGH</button><button data-clock="low">LOW</button><button class="pulse" data-clock="rise">↑ 立ち上がり</button><button class="pulse" data-clock="fall">↓ 立ち下がり</button><button data-clock="auto" class="${state.autoTimer ? "running" : ""}">${state.autoTimer ? "■ クロック停止" : "▶ 自動クロック"}</button></div></div>`;
    clockRoot.querySelectorAll("[data-clock]").forEach((button) => button.addEventListener("click", () => {
      const action = button.dataset.clock;
      state.step = 0;
      state.stepHistory = [];
      if (action === "high") changeClock(1);
      if (action === "low") changeClock(0);
      if (action === "rise") { state.clock = 0; changeClock(1); }
      if (action === "fall") { state.clock = 1; changeClock(0); }
      if (action === "auto") state.autoTimer ? stopClock() : startClock();
      render();
    }));
  }

  function stopClock() {
    if (state.autoTimer !== null) clearInterval(state.autoTimer);
    state.autoTimer = null;
  }
  function startClock() {
    if (state.autoTimer !== null) return;
    state.autoTimer = setInterval(() => {
      changeClock(1 - state.clock);
      render();
    }, 750);
  }

  function activeRsInputs() {
    return state.rsMode === "nand"
      ? { set: state.inputs.S === 0, reset: state.inputs.R === 0 }
      : { set: state.inputs.S === 1, reset: state.inputs.R === 1 };
  }
  function updateLevelSensitive() {
    if (state.circuit === "rs" && state.rsMode !== "clocked") {
      const { set, reset } = activeRsInputs();
      if (set && reset) {
        state.q = null;
        setEvent(`${state.rsMode === "nand" ? "S̅=R̅=0" : "S=R=1"} は禁止入力です。Q/Q̅は未定義になります。`);
      } else if (set) { state.q = 1; setEvent("SETが有効になり、ラッチのQを1にしました。"); }
      else if (reset) { state.q = 0; setEvent("RESETが有効になり、ラッチのQを0にしました。"); }
      else setEvent("SET/RESETが非アクティブです。ラッチは直前の状態を保持します。");
    } else if (state.circuit === "d" && state.dMode === "latch") {
      if (state.clock === 1) {
        state.q = state.inputs.D;
        setEvent(`CLK=1（イネーブル中）のため、D=${state.inputs.D} がQに伝わっています。`);
      } else setEvent("CLK=0のためDラッチは閉じています。Qは直前の値を保持します。");
    }
  }

  function edgeDetected(oldValue, newValue) {
    return state.edge === "rising" ? oldValue === 0 && newValue === 1 : oldValue === 1 && newValue === 0;
  }
  function updateOnEdge() {
    let next = state.q;
    if (state.circuit === "rs" && state.rsMode === "clocked") {
      const { set, reset } = activeRsInputs();
      if (set && reset) next = null;
      else if (set) next = 1;
      else if (reset) next = 0;
      setEvent(set && reset ? "有効エッジでSET/RESETが同時に有効です。出力状態は未定義になります。" :
        set ? `有効エッジを検出。SETを取り込みQ=1になりました。` :
        reset ? `有効エッジを検出。RESETを取り込みQ=0になりました。` :
        "有効エッジですがSET/RESETは非アクティブ。状態を保持します。");
    } else if (state.circuit === "jk") {
      const { J, K } = state.inputs;
      if (J === 0 && K === 0) setEvent("有効エッジ：J=K=0なのでQを保持します。");
      else if (J === 0 && K === 1) { next = 0; setEvent("有効エッジ：J=0, K=1を取り込みRESET。Q=0です。"); }
      else if (J === 1 && K === 0) { next = 1; setEvent("有効エッジ：J=1, K=0を取り込みSET。Q=1です。"); }
      else { next = state.q === null ? null : 1 - state.q; setEvent(state.q === null ? "J=K=1で反転しますが、初期Qが未定義のためQも未定義です。" : `有効エッジ：J=K=1なのでQを反転し、Q=${next}になりました。`); }
    } else if (state.circuit === "d") {
      next = state.inputs.D;
      setEvent(`有効エッジでD=${state.inputs.D}を取り込み、Q=${next}になりました。`);
    } else if (state.circuit === "t") {
      if (state.inputs.T === 0) setEvent("有効エッジ：T=0なのでQを保持します。");
      else { next = state.q === null ? null : 1 - state.q; setEvent(state.q === null ? "T=1で反転しますが、初期Qが未定義のためQも未定義です。" : `有効エッジ：T=1なのでQを反転し、Q=${next}になりました。`); }
    }
    state.q = next;
  }

  function changeClock(value) {
    const old = state.clock;
    if (old === value) {
      setEvent(`CLKはすでに${value ? "HIGH" : "LOW"}です。新しいエッジは発生していません。`);
      return;
    }
    state.previousClock = old;
    state.clock = value;
    if (state.circuit === "d" && state.dMode === "latch") {
      if (value === 1) updateLevelSensitive();
      else setEvent("CLKがLOWになり、Dラッチが閉じました。Qは保持されます。");
      return;
    }
    if (state.circuit === "rs" && state.rsMode !== "clocked") return;
    const detected = edgeDetected(old, value);
    if (detected) updateOnEdge();
    else setEvent(`クロックが${value ? "HIGH" : "LOW"}になりましたが、選択中の${edgeName()}ではないためQを保持します。`);
  }

  function gateResult() {
    const a = state.inputs.A;
    const b = state.inputs.B;
    switch (state.gate) {
      case "AND": return a & b;
      case "OR": return a | b;
      case "NOT": return 1 - a;
      case "NAND": return 1 - (a & b);
      case "NOR": return 1 - (a | b);
      case "XOR": return a ^ b;
      case "XNOR": return 1 - (a ^ b);
      default: return 0;
    }
  }
  function currentOutput() {
    return state.circuit === "gates" ? gateResult() : state.q;
  }

  function wireClass(value, clock = false) {
    return `wire${clock ? " clock-wire" : ""}${value === 1 ? " high" : value === null ? " unknown" : ""}`;
  }
  function valueClass(value, clock = false) {
    return `wire-value${clock ? " clock" : value === 1 ? " high" : value === null ? " unknown" : ""}`;
  }
  function wireSvg(y, label, value, x1 = 36, x2 = 168, clock = false) {
    return `<path class="${wireClass(value, clock)}" d="M${x1} ${y} H${x2}"/><text class="svg-label" x="${x1 - 25}" y="${y + 4}">${label}</text><text class="${valueClass(value, clock)}" x="${(x1+x2)/2 - 7}" y="${y - 9}">${displayBit(value)}</text><circle class="led ${value === 1 ? "high" : value === null ? "unknown" : ""}" cx="${x2}" cy="${y}" r="5"/>`;
  }

  function renderDiagram() {
    const output = currentOutput();
    let svg = `<svg class="circuit-svg" viewBox="0 0 520 230" role="img" aria-label="入力信号、内部回路、出力信号を表示する回路図">`;
    if (state.circuit === "gates") {
      const oneInput = state.gate === "NOT";
      const a = state.inputs.A, b = state.inputs.B, result = gateResult();
      svg += `<text class="svg-label" x="30" y="25">COMBINATIONAL LOGIC</text>`;
      svg += wireSvg(86, "A", a, 42, 183);
      if (!oneInput) svg += wireSvg(144, "B", b, 42, 183);
      svg += `<rect class="gate-shape" x="183" y="${oneInput ? 69 : 69}" width="115" height="${oneInput ? 55 : 92}" rx="14"/><text class="gate-text" x="240" y="${oneInput ? 97 : 115}">${state.gate}</text>`;
      svg += `<path class="${wireClass(result)}" d="M298 ${oneInput ? 97 : 115} H423"/><text class="${valueClass(result)}" x="348" y="${oneInput ? 87 : 105}">${displayBit(result)}</text><circle class="led ${result === 1 ? "high" : ""}" cx="423" cy="${oneInput ? 97 : 115}" r="7"/><text class="svg-label" x="438" y="${oneInput ? 101 : 119}">OUT</text>`;
    } else if (state.circuit === "rs" && state.rsMode !== "clocked") {
      const { set, reset } = activeRsInputs();
      const setSignal = state.inputs.S;
      const resetSignal = state.inputs.R;
      const qbar = state.q === null ? null : 1 - state.q;
      const gate = state.rsMode.toUpperCase();
      svg += `<text class="svg-label" x="28" y="25">CROSS-COUPLED ${gate} LATCH</text>`;
      svg += wireSvg(68, state.rsMode === "nand" ? "S̅" : "S", setSignal, 43, 210);
      svg += wireSvg(148, state.rsMode === "nand" ? "R̅" : "R", resetSignal, 43, 210);
      svg += `<rect class="gate-shape" x="210" y="48" width="82" height="40" rx="9"/><text class="gate-text" x="251" y="68">${gate}</text>`;
      svg += `<rect class="gate-shape" x="210" y="128" width="82" height="40" rx="9"/><text class="gate-text" x="251" y="148">${gate}</text>`;
      svg += `<path class="${wireClass(state.q)}" d="M292 68 H420"/><text class="${valueClass(state.q)}" x="349" y="58">${displayBit(state.q)}</text><circle class="led ${state.q === 1 ? "high" : state.q === null ? "unknown" : ""}" cx="420" cy="68" r="6"/><text class="svg-label" x="435" y="72">Q</text>`;
      svg += `<path class="${wireClass(qbar)}" d="M292 148 H420"/><text class="${valueClass(qbar)}" x="349" y="138">${displayBit(qbar)}</text><circle class="led ${qbar === 1 ? "high" : qbar === null ? "unknown" : ""}" cx="420" cy="148" r="6"/><text class="svg-label" x="435" y="152">Q̅</text>`;
      svg += `<path class="${wireClass(qbar)}" d="M292 148 H330 V106 H188 V82 H210"/><text class="${valueClass(qbar)}" x="309" y="139">${displayBit(qbar)}</text>`;
      svg += `<path class="${wireClass(state.q)}" d="M292 68 H372 V190 H188 V162 H210"/><text class="${valueClass(state.q)}" x="315" y="181">${displayBit(state.q)}</text>`;
      svg += `<text class="svg-label" x="347" y="215">${set && reset ? "禁止入力" : set ? "SET" : reset ? "RESET" : "HOLD"}</text>`;
    } else {
      const inputs = currentInputs();
      const ys = inputs.length === 2 ? [72, 152] : [112];
      svg += `<text class="svg-label" x="28" y="25">${state.circuit === "jk" ? "EDGE-TRIGGERED JK FLIP-FLOP" : state.circuit === "d" ? (state.dMode === "latch" ? "LEVEL-SENSITIVE D LATCH" : "EDGE-TRIGGERED D FLIP-FLOP") : state.circuit === "t" ? "EDGE-TRIGGERED T FLIP-FLOP" : `${state.rsMode.toUpperCase()} ${state.rsMode === "clocked" ? "CLOCKED RS FLIP-FLOP" : "RS LATCH"}`}</text>`;
      inputs.forEach((key, index) => svg += wireSvg(ys[index], key, state.inputs[key], 43, 176));
      if (usesClock() || isLatch()) {
        const clockY = state.circuit === "d" && state.dMode === "latch" ? 198 : 185;
        svg += `<path class="${wireClass(state.clock, true)}" d="M43 ${clockY} H176"/><text class="svg-label" x="20" y="${clockY + 4}">CLK</text><text class="${valueClass(state.clock, true)}" x="102" y="${clockY - 9}">${state.clock}</text><circle class="led ${state.clock ? "clock-high" : ""}" cx="176" cy="${clockY}" r="5"/>`;
      }
      const boxY = 62;
      const boxHeight = 110;
      svg += `<rect class="gate-shape" x="176" y="${boxY}" width="168" height="${boxHeight}" rx="13"/><text class="gate-text" x="260" y="96">${state.circuit.toUpperCase()} ${state.circuit === "rs" ? state.rsMode.toUpperCase() : state.circuit === "d" ? state.dMode.toUpperCase() : "FF"}</text>`;
      svg += `<rect class="state-box" x="217" y="112" width="86" height="42" rx="6"/><text class="state-label" x="260" y="127">INTERNAL Q</text><text class="state-value" x="260" y="148">${displayBit(state.q)}</text>`;
      const qbar = state.q === null ? null : 1 - state.q;
      svg += `<path class="${wireClass(state.q)}" d="M344 94 H414"/><text class="${valueClass(state.q)}" x="367" y="84">${displayBit(state.q)}</text><circle class="led ${state.q === 1 ? "high" : state.q === null ? "unknown" : ""}" cx="414" cy="94" r="6"/><text class="svg-label" x="429" y="98">Q</text>`;
      svg += `<path class="${wireClass(qbar)}" d="M344 142 H414"/><text class="${valueClass(qbar)}" x="367" y="132">${displayBit(qbar)}</text><circle class="led ${qbar === 1 ? "high" : qbar === null ? "unknown" : ""}" cx="414" cy="142" r="6"/><text class="svg-label" x="429" y="146">Q̅</text>`;
      if (state.step >= 2 && state.step <= 4) svg += `<text class="svg-label" x="373" y="192" fill="#54d9ed">STEP ${state.step + 1} / ${steps[state.step]}</text>`;
    }
    svg += `</svg>`;
    $("#diagram").innerHTML = svg;
  }

  function renderOutputs() {
    const outputs = state.circuit === "gates"
      ? [{ name: "OUT", value: currentOutput() }]
      : [{ name: "Q", value: state.q }, { name: "Q̅", value: state.q === null ? null : 1 - state.q }];
    $("#outputs").innerHTML = outputs.map(({ name, value }) =>
      `<div class="output-readout"><span class="output-name">${name}</span><strong class="output-value ${value === null ? "unknown" : value === 0 ? "low" : ""}">${displayBit(value)}</strong></div>`).join("") +
      (isStateful() ? `<div class="state-summary"><small>初期状態 → 現在状態</small><strong>${displayBit(state.initialQ)} → ${displayBit(state.q)}</strong></div><div class="initialize-box"><small>実験用の初期条件（回路入力ではありません）</small><div><button data-initial="0">Qを0に設定</button><button data-initial="1">Qを1に設定</button></div></div>` : "");
    $("#outputs").querySelectorAll("[data-initial]").forEach((button) => button.addEventListener("click", () => {
      state.q = Number(button.dataset.initial);
      state.initialQ = state.q;
      state.step = 0;
      state.stepHistory = [];
      setEvent(`実験用初期条件としてQ=${state.q}を設定しました。非同期SET/RESET入力による動作ではありません。`);
      render();
    }));
  }

  function getTruthData() {
    if (state.circuit === "gates") {
      const cols = state.gate === "NOT" ? ["A", "OUT"] : ["A", "B", "OUT"];
      const rows = [];
      for (let a = 0; a <= 1; a++) for (let b = 0; b <= (state.gate === "NOT" ? 0 : 1); b++) {
        const result = (() => {
          switch (state.gate) {
            case "AND": return a & b; case "OR": return a | b; case "NOT": return 1 - a;
            case "NAND": return 1 - (a & b); case "NOR": return 1 - (a | b);
            case "XOR": return a ^ b; default: return 1 - (a ^ b);
          }
        })();
        rows.push({ values: state.gate === "NOT" ? [a, result] : [a, b, result], key: `${a}-${b}`, current: a === state.inputs.A && (state.gate === "NOT" || b === state.inputs.B) });
      }
      return { cols, rows };
    }
    if (state.circuit === "rs") {
      const cols = [state.rsMode === "nand" ? "S̅" : "S", state.rsMode === "nand" ? "R̅" : "R", "Q", "Q(next)"];
      const rows = [];
      for (let s = 0; s <= 1; s++) for (let r = 0; r <= 1; r++) for (let q = 0; q <= 1; q++) {
        const set = state.rsMode === "nand" ? s === 0 : s === 1;
        const reset = state.rsMode === "nand" ? r === 0 : r === 1;
        const next = set && reset ? "禁止" : set ? 1 : reset ? 0 : q;
        rows.push({ values: [s, r, q, next], current: s === state.inputs.S && r === state.inputs.R && q === state.q });
      }
      return { cols, rows };
    }
    if (state.circuit === "jk") {
      const cols = ["J", "K", "Q", "Q(next)"], rows = [];
      for (let j = 0; j <= 1; j++) for (let k = 0; k <= 1; k++) for (let q = 0; q <= 1; q++) {
        const next = j ? (k ? 1 - q : 1) : (k ? 0 : q);
        rows.push({ values: [j, k, q, next], current: j === state.inputs.J && k === state.inputs.K && q === state.q });
      }
      return { cols, rows };
    }
    if (state.circuit === "d") {
      const cols = state.dMode === "latch" ? ["CLK / EN", "D", "Q", "Q(next)"] : ["D", "Q", "Q(next)"];
      const rows = [];
      if (state.dMode === "latch") {
        for (let en = 0; en <= 1; en++) for (let d = 0; d <= 1; d++) for (let q = 0; q <= 1; q++)
          rows.push({ values: [en, d, q, en ? d : q], current: en === state.clock && d === state.inputs.D && q === state.q });
      } else {
        for (let d = 0; d <= 1; d++) for (let q = 0; q <= 1; q++)
          rows.push({ values: [d, q, d], current: d === state.inputs.D && q === state.q });
      }
      return { cols, rows };
    }
    const cols = ["T", "Q", "Q(next)"], rows = [];
    for (let t = 0; t <= 1; t++) for (let q = 0; q <= 1; q++)
      rows.push({ values: [t, q, t ? 1 - q : q], current: t === state.inputs.T && q === state.q });
    return { cols, rows };
  }

  function renderTruthTable() {
    const { cols, rows } = getTruthData();
    $("#truth-table").innerHTML = `<table><thead><tr>${cols.map((col) => `<th>${col}</th>`).join("")}</tr></thead><tbody>${rows.map((row) =>
      `<tr class="${row.current ? "current" : ""}">${row.values.map((value) => `<td>${value}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    $(".table-caption").textContent = state.circuit === "gates"
      ? "現在の入力に一致する行をハイライトします。"
      : state.circuit === "d" && state.dMode === "latch"
        ? "CLK/EN=1の間はDを取り込み、0ではQを保持します。現在の入力・状態に一致する行をハイライトします。"
        : "Q(next)は有効なエッジを検出した場合の次状態です。エッジ以外ではQを保持します。現在の入力・状態に一致する行をハイライトします。";
  }

  function renderExplanation() {
    const [first, second] = descriptions[state.circuit];
    let note = "";
    if (state.circuit === "rs") note = state.rsMode === "nand"
      ? `<div class="term"><b>NAND型の有効レベル</b><span>S̅=0でSET、R̅=0でRESET。両方0は不正入力です。</span></div>`
      : `<div class="term"><b>NOR型の有効レベル</b><span>S=1でSET、R=1でRESET。両方1は不正入力です。</span></div>`;
    else note = `<div class="term"><b>レベル動作</b><span>信号が有効なレベルの間、回路が反応し続けます。</span></div><div class="term"><b>エッジ動作</b><span>信号が切り替わる瞬間だけ状態を更新します。</span></div>`;
    const wrong = state.circuit === "rs" ? "禁止入力でもQとQ̅が常に反対になると思い込むこと。"
      : state.circuit === "gates" ? "XOR（異なるとき1）とOR（どちらかが1なら1）を混同すること。"
      : state.circuit === "d" && state.dMode === "latch" ? "DラッチのCLK=1中にQが変わらないと思い込むこと。"
      : "クロック入力のHIGHレベルと有効エッジを同じものと考えること。";
    $("#explanation").innerHTML = `<p class="explain-copy">${first}</p><p class="explain-copy">${second}</p><div class="term-grid">${note}</div><p class="explain-copy" style="margin-top:11px"><strong>よくある間違い：</strong>${wrong}</p>`;
  }

  const steps = ["入力設定", "信号伝搬", "クロック変化", "エッジ検出", "状態更新", "出力反映"];
  function advanceStep(direction) {
    if (direction === "reset") {
      state.step = 0; state.stepEdge = null; state.stepTarget = null; state.stepHistory = [];
      setEvent("ステップ実行を最初から開始できます。入力値と回路状態はそのままです。");
    } else if (direction === "back") {
      const previous = state.stepHistory.pop();
      if (previous) {
        state.step = previous.step;
        state.stepEdge = previous.stepEdge;
        state.stepTarget = previous.stepTarget;
        state.clock = previous.clock;
        state.previousClock = previous.previousClock;
        state.q = previous.q;
        state.lastEvent = previous.lastEvent;
      }
    } else {
      if (state.step === -1) return;
      state.stepHistory.push({
        step: state.step, stepEdge: state.stepEdge, stepTarget: state.stepTarget, clock: state.clock,
        previousClock: state.previousClock, q: state.q, lastEvent: state.lastEvent
      });
      if (state.step === 2) {
        const isDLevel = state.circuit === "d" && state.dMode === "latch";
        const target = isDLevel || state.edge === "rising" ? 1 : 0;
        state.stepTarget = target;
        const baseline = isDLevel ? 0 : 1 - target;
        state.previousClock = state.clock;
        state.clock = baseline;
        state.stepEdge = false;
        setEvent(`STEP 3: CLKを${baseline ? "HIGH" : "LOW"}に準備しました。`);
      } else if (state.step === 3) {
        const isDLevel = state.circuit === "d" && state.dMode === "latch";
        const old = state.clock;
        state.previousClock = old;
        state.clock = isDLevel ? 1 : state.stepTarget;
        state.stepEdge = isDLevel || edgeDetected(old, state.clock);
        if (isDLevel) setEvent("STEP 4: CLK=HIGHでDラッチが開き、入力が通過できる状態です。");
        else setEvent(state.stepEdge ? `STEP 4: ${edgeName()}エッジを検出しました。` : `STEP 4: ${edgeName()}エッジではないため状態を保持します。`);
      } else if (state.step === 4) {
        if (state.circuit === "d" && state.dMode === "latch") updateLevelSensitive();
        else if (state.stepEdge) updateOnEdge();
        else setEvent("有効エッジがないため内部状態は変わりません。");
      } else if (state.step === 5) {
        setEvent(`ステップ動作完了。Q=${displayBit(state.q)}、Q̅=${displayBit(state.q === null ? null : 1 - state.q)}です。`);
        state.step = -1;
        render();
        return;
      }
      state.step += 1;
      if (state.step <= 2) setEvent(`STEP ${state.step + 1}: ${steps[state.step]}。`);
    }
    render();
  }
  function renderStepper() {
    const root = $("#stepper");
    if (!isStateful() || state.circuit === "rs" && state.rsMode !== "clocked") { root.innerHTML = ""; return; }
    root.innerHTML = `<div class="step-top"><span class="step-title">STEP-BY-STEP / 動作を段階確認</span><span class="step-count">${state.step === -1 ? "DONE" : `STEP ${state.step + 1} / 6`}</span></div><div class="step-track">${steps.map((text, index) => `<div class="step-item ${state.step === index ? "active" : ""}"><b>${index + 1}</b>${text}</div>`).join("")}</div><div class="step-actions"><button data-step="reset">最初から</button><button data-step="back">戻る</button><button data-step="next">次へ →</button></div>`;
    root.querySelectorAll("[data-step]").forEach((button) => button.addEventListener("click", () => advanceStep(button.dataset.step)));
  }

  function render() {
    $("#circuit-index").textContent = circuitInfo[state.circuit].index;
    $("#circuit-title").textContent = circuitInfo[state.circuit].title;
    document.querySelectorAll(".nav-tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.circuit === state.circuit));
    renderModes();
    renderControls();
    $("#input-note").textContent = state.circuit === "rs"
      ? state.rsMode === "nand" ? "NAND型は入力0で有効（アクティブLOW）。" : "NOR型は入力1で有効（アクティブHIGH）。"
      : state.circuit === "d" && state.dMode === "latch" ? "CLKはイネーブル。HIGHの間DがQに伝わります。" :
      isStateful() ? `${edgeName()}で状態を更新。エッジ以外では状態を保持します。` : "入力変更に応じて出力がすぐに変化します。";
    $("#event-description").textContent = state.lastEvent;
    renderDiagram();
    renderOutputs();
    renderTruthTable();
    renderExplanation();
    renderStepper();
  }

  document.querySelectorAll(".nav-tab").forEach((tab) => tab.addEventListener("click", () => {
    stopClock();
    state.circuit = tab.dataset.circuit;
    state.q = null;
    state.initialQ = null;
    state.clock = 0;
    state.previousClock = 0;
    state.step = 0;
    state.stepHistory = [];
    setEvent(state.circuit === "gates" ? "入力を切り替えると出力が即時に再計算されます。" : "初期状態は未定義です。入力とクロックを操作して動作を確認してください。");
    render();
  }));
  render();
})();
