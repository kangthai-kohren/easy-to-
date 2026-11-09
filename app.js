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
    circuit: "gates", gate: "AND", rsMode: "nor", dMode: "ff", edge: "rising", detailLevel: "block",
    inputs: { A: 0, B: 0, S: 0, R: 0, J: 0, K: 0, D: 0, T: 0 },
    clock: 0, previousClock: 0, q: null, master: null, initialQ: null, autoTimer: null,
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
  const masterTransparent = (clock = state.clock, edge = state.edge) => edge === "rising" ? clock === 0 : clock === 1;
  function refreshDMaster() {
    if (state.circuit === "d" && state.dMode === "ff" && masterTransparent()) state.master = state.inputs.D;
  }
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
    let markup = select("detail-mode", "回路図の詳細度", [["block","機能ブロック表示"],["gate","MILゲート接続図（ゲートレベル）"]], state.detailLevel);
    if (state.circuit === "gates") {
      markup += select("gate-mode", "論理ゲート", [["AND","AND"],["OR","OR"],["NOT","NOT"],["NAND","NAND"],["NOR","NOR"],["XOR","XOR"],["XNOR","XNOR"]], state.gate);
    } else if (state.circuit === "rs") {
      markup += select("rs-mode", "RS回路の種類", [["nor","NOR型ラッチ（S/R 有効 HIGH）"],["nand","NAND型ラッチ（S̅/R̅ 有効 LOW）"],["clocked","クロック付きRS-FF（エッジ動作）"]], state.rsMode);
    } else if (state.circuit === "d") {
      markup += select("d-mode", "D回路の種類", [["latch","Dラッチ（レベル動作）"],["ff","D-FF（エッジ動作）"]], state.dMode);
    }
    if (["jk","t","d"].includes(state.circuit) || state.circuit === "rs" && state.rsMode === "clocked") {
      markup += select("edge-mode", "有効クロックエッジ", [["rising","ポジティブエッジ（立ち上がり ↑）"],["falling","ネガティブエッジ（立ち下がり ↓）"]], state.edge);
    }
    modeRow.innerHTML = markup;
    modeRow.querySelectorAll("select").forEach((el) => el.addEventListener("change", (event) => {
      const { id, value } = event.target;
      if (id === "detail-mode") state.detailLevel = value;
      if (id === "gate-mode") state.gate = value;
      if (id === "rs-mode") { state.rsMode = value; state.q = null; state.initialQ = null; }
      if (id === "d-mode") { state.dMode = value; state.q = null; state.master = null; state.initialQ = null; }
      if (id === "edge-mode") { state.edge = value; state.master = null; }
      refreshDMaster();
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
        refreshDMaster();
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
      next = state.master;
      setEvent(`有効エッジでマスターラッチの値${displayBit(state.master)}を取り込み、Q=${displayBit(next)}になりました。`);
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
    refreshDMaster();
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
    refreshDMaster();
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

  function logicNot(value) {
    return value === null ? null : 1 - value;
  }
  function logicAnd(a, b) {
    if (a === 0 || b === 0) return 0;
    return a === 1 && b === 1 ? 1 : null;
  }
  function logicOr(a, b) {
    if (a === 1 || b === 1) return 1;
    return a === 0 && b === 0 ? 0 : null;
  }

  function buildLogicStages() {
    const stages = [];
    const add = (gate, name, terms, value, equation) => stages.push({ gate, name, terms, value, equation });
    const { A, B, D, J, K, S, R, T } = state.inputs;
    const q = state.q;
    const qbar = logicNot(q);

    if (state.circuit === "gates") {
      if (state.gate === "NOT") add("NOT", "Y", [["A", A]], logicNot(A), `Y = ¬A`);
      else if (state.gate === "NAND" || state.gate === "NOR") {
        const inner = state.gate === "NAND" ? logicAnd(A, B) : logicOr(A, B);
        add(state.gate === "NAND" ? "AND" : "OR", "X", [["A", A], ["B", B]], inner, `X = A ${state.gate === "NAND" ? "∧" : "∨"} B`);
        add("NOT", "OUT", [["X", inner]], logicNot(inner), `OUT = ¬X`);
      } else if (state.gate === "XOR" || state.gate === "XNOR") {
        const nA = logicNot(A), nB = logicNot(B);
        const p = logicAnd(A, nB), r = logicAnd(nA, B), xor = logicOr(p, r);
        add("NOT", "¬A", [["A", A]], nA, "¬A");
        add("NOT", "¬B", [["B", B]], nB, "¬B");
        add("AND", "P", [["A", A], ["¬B", nB]], p, "P = A ∧ ¬B");
        add("AND", "R", [["¬A", nA], ["B", B]], r, "R = ¬A ∧ B");
        add("OR", "XOR", [["P", p], ["R", r]], xor, "XOR = P ∨ R");
        if (state.gate === "XNOR") add("NOT", "OUT", [["XOR", xor]], logicNot(xor), "OUT = ¬XOR");
      } else {
        const value = state.gate === "AND" ? logicAnd(A, B) : logicOr(A, B);
        add(state.gate, "OUT", [["A", A], ["B", B]], value, `OUT = A ${state.gate === "AND" ? "∧" : "∨"} B`);
      }
      return { stages, note: "組み合わせ論理: 入力が変わると各ゲート出力も即時に再計算されます。" };
    }

    if (state.circuit === "rs" && state.rsMode !== "clocked") {
      const activeHigh = state.rsMode === "nor";
      const set = activeHigh ? S === 1 : S === 0;
      const reset = activeHigh ? R === 1 : R === 0;
      const gate = activeHigh ? "NOR" : "NAND";
      const gateQ = set && reset ? null : activeHigh ? logicNot(logicOr(R, qbar)) : logicNot(logicAnd(R, qbar));
      const gateQbar = set && reset ? null : activeHigh ? logicNot(logicOr(S, q)) : logicNot(logicAnd(S, q));
      add(gate, "Q", [[activeHigh ? "R" : "R̅", R], ["Q̅", qbar]], gateQ, activeHigh ? "Q = ¬(R ∨ Q̅)" : "Q = ¬(R̅ ∧ Q̅)");
      add(gate, "Q̅", [[activeHigh ? "S" : "S̅", S], ["Q", q]], gateQbar, activeHigh ? "Q̅ = ¬(S ∨ Q)" : "Q̅ = ¬(S̅ ∧ Q)");
      return { stages, note: `相互帰還した${gate}ゲート。各ゲート出力を相手側の入力へ戻し、状態を保持します。${set && reset ? " 禁止入力のため出力は未定義として表示しています。" : ""}` };
    }

    if (state.circuit === "d" && state.dMode === "ff") {
      const nClock = logicNot(state.clock);
      const masterEnable = state.edge === "rising" ? nClock : state.clock;
      const slaveEnable = state.edge === "rising" ? state.clock : nClock;
      const masterData = logicAnd(masterEnable, D);
      const masterHold = logicAnd(logicNot(masterEnable), state.master);
      const masterNext = logicOr(masterData, masterHold);
      const slaveData = logicAnd(slaveEnable, state.master);
      const slaveHold = logicAnd(logicNot(slaveEnable), q);
      add("NOT", "¬CLK", [["CLK", state.clock]], nClock, "¬CLK");
      add("AND", "MASTER DATA", [["MASTER EN", masterEnable], ["D", D]], masterData, "MASTER DATA = MASTER EN ∧ D");
      add("AND", "MASTER HOLD", [["¬MASTER EN", logicNot(masterEnable)], ["MASTER Q", state.master]], masterHold, "MASTER HOLD = ¬MASTER EN ∧ MASTER Q");
      add("OR", "MASTER Q(next)", [["DATA", masterData], ["HOLD", masterHold]], masterNext, "MASTER Q(next) = DATA ∨ HOLD");
      add("AND", "SLAVE DATA", [["SLAVE EN", slaveEnable], ["MASTER Q", state.master]], slaveData, "SLAVE DATA = SLAVE EN ∧ MASTER Q");
      add("AND", "SLAVE HOLD", [["¬SLAVE EN", logicNot(slaveEnable)], ["Q", q]], slaveHold, "SLAVE HOLD = ¬SLAVE EN ∧ Q");
      add("OR", "Q(next)", [["DATA", slaveData], ["HOLD", slaveHold]], logicOr(slaveData, slaveHold), "Q(next) = DATA ∨ HOLD");
      return { stages, note: `マスター／スレーブD-FFを2つのAND/ORラッチで表示。${state.edge === "rising" ? "CLK=0でマスター、CLK=1でスレーブが開きます。" : "CLK=1でマスター、CLK=0でスレーブが開きます。"} 指定エッジでQが更新されます。` };
    }
    if (state.circuit === "d" && state.dMode === "latch") {
      const nClock = logicNot(state.clock);
      const open = logicAnd(state.clock, D);
      const hold = logicAnd(nClock, q);
      add("AND", "OPEN", [["CLK", state.clock], ["D", D]], open, "OPEN = CLK ∧ D");
      add("NOT", "¬CLK", [["CLK", state.clock]], nClock, "¬CLK");
      add("AND", "HOLD", [["¬CLK", nClock], ["Q", q]], hold, "HOLD = ¬CLK ∧ Q");
      add("OR", "Q(next)", [["OPEN", open], ["HOLD", hold]], logicOr(open, hold), "Q(next) = OPEN ∨ HOLD");
      return { stages, note: "Dラッチのレベル制御MUX。CLK=1ではDを通し、CLK=0ではQを帰還して保持します。" };
    }
    if (state.circuit === "jk") {
      const nQ = logicNot(q), nK = logicNot(K);
      const setTerm = logicAnd(J, nQ), holdTerm = logicAnd(nK, q);
      add("NOT", "¬Q", [["Q", q]], nQ, "¬Q");
      add("NOT", "¬K", [["K", K]], nK, "¬K");
      add("AND", "SET", [["J", J], ["¬Q", nQ]], setTerm, "SET = J ∧ ¬Q");
      add("AND", "HOLD/RESET", [["¬K", nK], ["Q", q]], holdTerm, "HOLD/RESET = ¬K ∧ Q");
      add("OR", "D / Q(next)", [["SET", setTerm], ["HOLD/RESET", holdTerm]], logicOr(setTerm, holdTerm), "Q(next) = (J ∧ ¬Q) ∨ (¬K ∧ Q)");
      return { stages, note: `JKの特性方程式をAND/OR/NOTゲートに展開。結果は${edgeName()}エッジでのみQへ取り込まれます。` };
    }
    if (state.circuit === "t") {
      const nT = logicNot(T), nQ = logicNot(q);
      const toggleTerm = logicAnd(T, nQ), holdTerm = logicAnd(nT, q);
      add("NOT", "¬T", [["T", T]], nT, "¬T");
      add("NOT", "¬Q", [["Q", q]], nQ, "¬Q");
      add("AND", "TOGGLE", [["T", T], ["¬Q", nQ]], toggleTerm, "TOGGLE = T ∧ ¬Q");
      add("AND", "HOLD", [["¬T", nT], ["Q", q]], holdTerm, "HOLD = ¬T ∧ Q");
      add("OR", "D / Q(next)", [["TOGGLE", toggleTerm], ["HOLD", holdTerm]], logicOr(toggleTerm, holdTerm), "Q(next) = (T ∧ ¬Q) ∨ (¬T ∧ Q)");
      return { stages, note: `T-FFの反転/保持論理をAND/OR/NOTゲートに展開。結果は${edgeName()}エッジでQへ取り込まれます。` };
    }
    if (state.circuit === "rs" && state.rsMode === "clocked") {
      const nR = logicNot(R), holdTerm = logicAnd(nR, q);
      const invalid = S === 1 && R === 1;
      add("NOT", "¬R", [["R", R]], nR, "¬R");
      add("AND", "HOLD", [["¬R", nR], ["Q", q]], holdTerm, "HOLD = ¬R ∧ Q");
      add("OR", "D / Q(next)", [["S", S], ["HOLD", holdTerm]], invalid ? null : logicOr(S, holdTerm), "Q(next) = S ∨ (¬R ∧ Q)");
      return { stages, note: `RSの次状態論理。結果は${edgeName()}エッジで取り込みます。${invalid ? " S=R=1は禁止入力のため次状態を未定義としています。" : ""}` };
    }
    return { stages, note: "" };
  }

  function renderLogicDetails() {
    const root = $("#logic-details");
    const detailed = state.detailLevel === "gate";
    root.hidden = !detailed;
    if (!detailed) {
      root.innerHTML = "";
      return;
    }
    const { stages, note } = buildLogicStages();
    const schematic = renderConnectedSchematic(stages);
    root.innerHTML = `<div class="logic-detail-heading"><strong>MIL GATE SCHEMATIC</strong><span>ゲート記号を配線で接続した回路図 / 信号値は現在のシミュレーション状態</span></div><div class="schematic-scroll">${schematic}</div><p class="logic-detail-note">${note}</p>`;
  }

  function signalClass(value, clock = false) {
    return `wire${clock ? " clock-wire" : ""}${value === 1 ? " high" : value === null ? " unknown" : ""}`;
  }
  function signalPath(path, value, clock = false) {
    return `<path class="${signalClass(value, clock)}" d="${path}"/>`;
  }
  function signalText(x, y, label, value, clock = false) {
    return `<text class="${valueClass(value, clock)} schematic-value" x="${x}" y="${y}">${label ? `${label}=` : ""}${displayBit(value)}</text>`;
  }
  function milGate(type, x, y, count = 2, label = "") {
    const pins = count === 3 ? [-18, 0, 18] : count === 1 ? [0] : [-12, 12];
    const inputs = pins.map((offset) => `<path class="mil-pin" d="M${x} ${y + offset} H${x + 17}"/>`).join("");
    let shape = "";
    let bubble = "";
    if (type === "NOT") {
      shape = `<path class="mil-body" d="M${x + 17} ${y - 22} L${x + 61} ${y} L${x + 17} ${y + 22} Z"/>`;
      bubble = `<circle class="mil-bubble" cx="${x + 68}" cy="${y}" r="5"/>`;
    } else if (type === "OR" || type === "NOR" || type === "XOR") {
      shape = `<path class="mil-body" d="M${x + 17} ${y - 26} Q${x + 39} ${y - 26} ${x + 72} ${y} Q${x + 39} ${y + 26} ${x + 17} ${y + 26} Q${x + 34} ${y} ${x + 17} ${y - 26} Z"/>`;
      if (type === "XOR") shape += `<path class="mil-extra" d="M${x + 9} ${y - 26} Q${x + 26} ${y} ${x + 9} ${y + 26}"/>`;
      if (type === "NOR") bubble = `<circle class="mil-bubble" cx="${x + 79}" cy="${y}" r="5"/>`;
    } else {
      shape = `<path class="mil-body" d="M${x + 17} ${y - 26} H${x + 43} A26 26 0 0 1 ${x + 43} ${y + 26} H${x + 17} Z"/>`;
      if (type === "NAND") bubble = `<circle class="mil-bubble" cx="${x + 77}" cy="${y}" r="5"/>`;
    }
    const outX = type === "NAND" || type === "NOR" || type === "NOT" ? x + 84 : x + 70;
    return `<g class="mil-gate">${inputs}${shape}${bubble}<path class="mil-pin" d="M${outX} ${y} H${outX + 13}"/><text class="mil-label" x="${x + 43}" y="${y + 4}">${type === "NOT" ? "1" : type === "OR" || type === "NOR" ? "≥1" : "="}</text>${label ? `<text class="mil-name" x="${x + 43}" y="${y - 34}">${label}</text>` : ""}</g>`;
  }
  function milInput(x, y, label, value, clock = false) {
    return `${signalPath(`M${x} ${y} H${x + 34}`, value, clock)}<circle class="schematic-led ${value === 1 ? (clock ? "clock-on" : "on") : value === null ? "unknown" : ""}" cx="${x + 34}" cy="${y}" r="4"/><text class="schematic-label" x="${x}" y="${y - 9}">${label}</text>${signalText(x + 4, y + 16, "", value, clock)}`;
  }
  function milOutput(x, y, label, value, clock = false) {
    return `${signalPath(`M${x} ${y} H${x + 38}`, value, clock)}<circle class="schematic-led ${value === 1 ? (clock ? "clock-on" : "on") : value === null ? "unknown" : ""}" cx="${x + 38}" cy="${y}" r="4"/><text class="schematic-label" x="${x + 44}" y="${y + 4}">${label}</text>${signalText(x + 3, y - 8, "", value, clock)}`;
  }

  function renderCrossCoupledSchematic(type, setValue, resetValue, inputLabels, width = 720) {
    const activeHigh = type === "NOR";
    const invalid = activeHigh ? setValue === 1 && resetValue === 1 : setValue === 0 && resetValue === 0;
    const upperInput = activeHigh ? resetValue : setValue;
    const lowerInput = activeHigh ? setValue : resetValue;
    const upperLabel = inputLabels[activeHigh ? 1 : 0];
    const lowerLabel = inputLabels[activeHigh ? 0 : 1];
    const qbar = state.q === null ? null : 1 - state.q;
    const qValue = invalid ? (activeHigh ? 0 : 1) : activeHigh
      ? logicNot(logicOr(upperInput, qbar)) : logicNot(logicAnd(upperInput, qbar));
    const qbarValue = invalid ? (activeHigh ? 0 : 1) : activeHigh
      ? logicNot(logicOr(lowerInput, state.q)) : logicNot(logicAnd(lowerInput, state.q));
    const gx = 285, top = 105, bottom = 245;
    let svg = `<svg class="mil-schematic" viewBox="0 0 ${width} 350" role="img" aria-label="${type}ゲート2個を相互接続した${type}型RSラッチのMIL回路図">`;
    svg += `<text class="schematic-heading" x="30" y="28">CROSS-COUPLED ${type} / 2-GATE RS LATCH</text>`;
    svg += signalPath(`M35 ${top - 12} H${gx}`, upperInput) + signalText(75, top - 19, upperLabel, upperInput);
    svg += signalPath(`M35 ${bottom - 12} H${gx}`, lowerInput) + signalText(75, bottom - 19, lowerLabel, lowerInput);
    svg += signalPath(`M${gx + 84} ${top} H625`, qValue) + signalText(470, top - 10, "Q", qValue);
    svg += signalPath(`M${gx + 84} ${bottom} H625`, qbarValue) + signalText(470, bottom - 10, "Q̅", qbarValue);
    svg += signalPath(`M${gx + 84} ${top} H${gx + 130} V${bottom + 12} H${gx}`, qValue);
    svg += signalPath(`M${gx + 84} ${bottom} H${gx + 185} V${top + 12} H${gx}`, qbarValue);
    svg += milGate(type, gx, top, 2, "G1") + milGate(type, gx, bottom, 2, "G2");
    svg += `<circle class="schematic-junction" cx="${gx + 84}" cy="${top}" r="3"/><circle class="schematic-junction" cx="${gx + 84}" cy="${bottom}" r="3"/>`;
    svg += `<text class="schematic-caption" x="35" y="320">${type === "NAND" ? "S̅=0: SET  /  R̅=0: RESET  /  S̅=R̅=0: 禁止入力" : "S=1: SET  /  R=1: RESET  /  S=R=1: 禁止入力"}</text>`;
    if (invalid) svg += `<text class="schematic-warning" x="465" y="315">禁止入力: ゲート出力は双方 ${qValue}、記憶状態は未定義</text>`;
    return `${svg}</svg>`;
  }

  function renderConnectedSchematic(stages) {
    if (state.circuit === "gates") return renderCombinationalSchematic();
    if (state.circuit === "rs" && state.rsMode !== "clocked") {
      const type = state.rsMode === "nand" ? "NAND" : "NOR";
      return renderCrossCoupledSchematic(type, state.inputs.S, state.inputs.R,
        [state.rsMode === "nand" ? "S̅" : "S", state.rsMode === "nand" ? "R̅" : "R"]);
    }
    if (state.circuit === "rs" && state.rsMode === "clocked") {
      const sg = logicAnd(state.inputs.S, state.clock), rg = logicAnd(state.inputs.R, state.clock);
      const qbar = state.q === null ? null : 1 - state.q;
      const invalid = sg === 1 && rg === 1;
      const qValue = invalid ? 0 : logicNot(logicOr(rg, qbar));
      const qbarValue = invalid ? 0 : logicNot(logicOr(sg, state.q));
      const gx = 490, top = 105, bottom = 245;
      let svg = `<svg class="mil-schematic" viewBox="0 0 900 350" role="img" aria-label="AND入力ゲート2個と相互接続NORゲート2個によるクロック付きRS回路">`;
      svg += `<text class="schematic-heading" x="25" y="28">CLOCKED RS / AND GATING + CROSS-COUPLED NOR</text>`;
      svg += signalPath("M30 93 H120", state.inputs.R) + signalText(42, 84, "R", state.inputs.R);
      svg += signalPath("M30 117 H120", state.clock, true) + signalText(42, 133, "CLK", state.clock, true);
      svg += signalPath("M30 233 H120", state.inputs.S) + signalText(42, 224, "S", state.inputs.S);
      svg += signalPath("M30 257 H120", state.clock, true);
      svg += signalPath(`M203 105 H440 V${top - 12} H${gx}`, rg) + signalText(350, 84, "R·CLK", rg);
      svg += signalPath(`M203 245 H440 V${bottom - 12} H${gx}`, sg) + signalText(350, 224, "S·CLK", sg);
      svg += signalPath(`M${gx + 84} ${top} H850`, qValue) + signalText(740, top - 10, "Q", qValue);
      svg += signalPath(`M${gx + 84} ${bottom} H850`, qbarValue) + signalText(740, bottom - 10, "Q̅", qbarValue);
      svg += signalPath(`M${gx + 84} ${top} H${gx + 115} V${bottom + 12} H${gx}`, qValue);
      svg += signalPath(`M${gx + 84} ${bottom} H${gx + 155} V${top + 12} H${gx}`, qbarValue);
      svg += milGate("AND", 120, 105, 2, "G1") + milGate("AND", 120, 245, 2, "G2");
      svg += milGate("NOR", gx, top, 2, "G3") + milGate("NOR", gx, bottom, 2, "G4");
      svg += `<circle class="schematic-junction" cx="${gx + 70}" cy="${top}" r="3"/><circle class="schematic-junction" cx="${gx + 70}" cy="${bottom}" r="3"/>`;
      svg += `<text class="schematic-caption" x="30" y="320">CLK=1でS/Rをゲートへ通し、NORラッチにSET/RESETを伝えます。状態更新は選択エッジで判定。</text></svg>`;
      return svg;
    }

    return renderStageSchematic(stages);
  }

  function dffSymbol(x, y, dValue, qValue, clock, edge) {
    const qbar = qValue === null ? null : 1 - qValue;
    const edgeMark = edge === "falling"
      ? `<circle class="mil-bubble" cx="${x + 7}" cy="${y + 96}" r="5"/><path class="mil-clock-edge" d="M${x + 12} ${y + 84} l15 12 -15 12"/>`
      : `<path class="mil-clock-edge" d="M${x} ${y + 84} l15 12 -15 12"/>`;
    const clkX = edge === "falling" ? x - 5 : x;
    return `<rect class="mil-ff-body" x="${x + 15}" y="${y + 15}" width="112" height="144" rx="6"/><text class="mil-ff-text" x="${x + 72}" y="${y + 48}">D-FF</text><text class="schematic-label" x="${x + 25}" y="${y + 82}">D</text><text class="schematic-label" x="${x + 103}" y="${y + 71}">Q</text><text class="schematic-label" x="${x + 103}" y="${y + 132}">Q̅</text>${edgeMark}${signalPath(`M${x - 35} ${y + 72} H${x + 15}`, dValue)}${signalText(x - 31, y + 63, "D", dValue)}${signalPath(`M${x + 127} ${y + 70} H${x + 175}`, qValue)}${signalText(x + 135, y + 62, "Q", qValue)}${signalPath(`M${x + 127} ${y + 130} H${x + 175}`, qbar)}${signalText(x + 135, y + 122, "Q̅", qbar)}${signalPath(`M${clkX - 35} ${y + 96} H${clkX}`, clock, true)}${signalText(clkX - 34, y + 115, `${edge === "rising" ? "↑" : "↓"} CLK`, clock, true)}`;
  }

  function renderCombinationalSchematic() {
    const A = state.inputs.A, B = state.inputs.B;
    const result = gateResult();
    const oneInput = state.gate === "NOT";
    let svg = `<svg class="mil-schematic" viewBox="0 0 640 280" role="img" aria-label="${state.gate}ゲートのMIL記号と信号値を示す回路図">`;
    svg += `<text class="schematic-heading" x="25" y="28">COMBINATIONAL LOGIC / MIL GATE SYMBOL</text>`;
    if (state.gate === "NAND" || state.gate === "NOR" || state.gate === "XNOR") {
      const base = state.gate === "XNOR" ? "XOR" : state.gate;
      const intermediate = state.gate === "NAND" ? logicAnd(A, B) : state.gate === "NOR" ? logicOr(A, B) : logicNot(result);
      svg += signalPath(`M35 ${oneInput ? 135 : 123} H235`, A) + signalText(42, oneInput ? 125 : 114, "A", A);
      if (!oneInput) svg += signalPath("M35 147 H235", B) + signalText(42, 166, "B", B);
      svg += milGate(base, 235, 135, oneInput ? 1 : 2, "G1");
      if (state.gate === "XNOR") {
        svg += signalPath("M318 135 H385", intermediate);
        svg += milGate("NOT", 385, 135, 1, "G2");
        svg += signalPath("M468 135 H570", result) + signalText(520, 125, "OUT", result);
      } else {
        svg += signalPath("M319 135 H570", result);
        svg += signalText(510, 125, "OUT", result);
      }
    } else {
      const gate = state.gate;
      svg += signalPath(`M35 ${oneInput ? 135 : 123} H235`, A) + signalText(42, oneInput ? 125 : 114, "A", A);
      if (!oneInput) svg += signalPath("M35 147 H235", B) + signalText(42, 166, "B", B);
      svg += milGate(gate, 235, 135, oneInput ? 1 : 2, "G1");
      const outputX = gate === "NOT" ? 318 : 305;
      svg += signalPath(`M${outputX} 135 H570`, result) + signalText(510, 125, "OUT", result);
    }
    svg += `<circle class="schematic-led ${A ? "on" : ""}" cx="35" cy="${oneInput ? 135 : 123}" r="4"/>`;
    if (!oneInput) svg += `<circle class="schematic-led ${B ? "on" : ""}" cx="35" cy="147" r="4"/>`;
    svg += `<circle class="schematic-led ${result === 1 ? "on" : ""}" cx="570" cy="135" r="4"/></svg>`;
    return svg;
  }

  function renderJKSchematic() {
    const { J, K } = state.inputs;
    const qbar = state.q === null ? null : 1 - state.q;
    const nK = logicNot(K);
    const setTerm = logicAnd(J, qbar);
    const holdTerm = logicAnd(nK, state.q);
    const next = logicOr(setTerm, holdTerm);
    let svg = `<svg class="mil-schematic" viewBox="0 0 1010 370" role="img" aria-label="JKフリップフロップの特性方程式をAND、OR、NOTゲートとD-FFで構成したMIL回路図">`;
    svg += `<text class="schematic-heading" x="25" y="28">JK FLIP-FLOP / AND-OR IMPLEMENTATION OF NEXT-STATE LOGIC</text>`;
    svg += signalPath("M30 108 H300", J) + signalText(38, 98, "J", J);
    svg += signalPath("M30 240 H125", K) + signalText(38, 230, "K", K);
    svg += signalPath("M209 240 H300 V228", nK) + signalText(225, 228, "¬K", nK);
    svg += signalPath("M30 252 H245 V252 H300", state.q) + signalText(65, 272, "Q", state.q);
    svg += signalPath("M383 120 H452 V158 H550", setTerm);
    svg += signalPath("M383 240 H475 V182 H550", holdTerm);
    svg += signalPath("M633 170 H700", next);
    svg += signalPath("M840 150 H890", state.q) + signalText(846, 140, "Q", state.q);
    svg += signalPath("M840 210 H925 V132 H300", qbar);
    svg += signalPath("M840 150 H950 V252 H300", state.q);
    svg += signalPath("M30 330 H660 V246 H700", state.clock, true) + signalText(42, 320, "CLK", state.clock, true);
    svg += milGate("NOT", 125, 240, 1, "G1") + milGate("AND", 300, 120, 2, "G2") + milGate("AND", 300, 240, 2, "G3") + milGate("OR", 550, 170, 2, "G4");
    svg += `<rect class="mil-ff-body" x="700" y="105" width="140" height="150" rx="6"/><text class="mil-ff-text" x="770" y="150">EDGE FF</text><text class="mil-ff-text" x="715" y="177">D</text><text class="mil-ff-text" x="819" y="155">Q</text><text class="mil-ff-text" x="812" y="215">Q̅</text>${state.edge === "falling" ? `<circle class="mil-bubble" cx="700" cy="246" r="5"/>` : ""}<path class="mil-clock-edge" d="M${state.edge === "falling" ? 705 : 700} 234 l12 12 -12 12 Z"/>`;
    svg += `<circle class="schematic-junction" cx="383" cy="120" r="3"/><circle class="schematic-junction" cx="383" cy="240" r="3"/>`;
    svg += `<text class="schematic-equation" x="550" y="285">D = (J ∧ Q̅) ∨ (¬K ∧ Q)</text><text class="schematic-caption" x="25" y="355">QとQ̅を帰還し、選択したクロックエッジでD相当の次状態を取り込みます。</text></svg>`;
    return svg;
  }

  function renderTSchematic() {
    const T = state.inputs.T;
    const qbar = state.q === null ? null : 1 - state.q;
    const next = logicOr(logicAnd(T, qbar), logicAnd(logicNot(T), state.q));
    let svg = `<svg class="mil-schematic" viewBox="0 0 780 330" role="img" aria-label="TフリップフロップをXORゲートとD-FFで構成したMIL回路図">`;
    svg += `<text class="schematic-heading" x="25" y="28">T FLIP-FLOP / XOR + EDGE-TRIGGERED D-FF</text>`;
    svg += signalPath("M35 134 H280", T) + signalText(42, 124, "T", T);
    svg += signalPath("M35 158 H280", state.q) + signalText(42, 178, "Q", state.q);
    svg += signalPath("M363 146 H425", next);
    svg += signalPath("M600 135 H650", state.q) + signalText(605, 125, "Q", state.q);
    svg += signalPath("M600 135 H700 V158 H280", state.q);
    svg += signalPath("M600 195 H650", state.q === null ? null : 1 - state.q) + signalText(605, 185, "Q̅", state.q === null ? null : 1 - state.q);
    svg += signalPath("M35 275 H425 V242", state.clock, true) + signalText(42, 265, "CLK", state.clock, true);
    svg += milGate("XOR", 280, 146, 2, "G1");
    svg += `<rect class="mil-ff-body" x="425" y="90" width="175" height="170" rx="6"/><text class="mil-ff-text" x="512" y="145">T-FF</text><text class="mil-ff-text" x="442" y="180">T ⊕ Q</text><text class="mil-ff-text" x="578" y="139">Q</text><text class="mil-ff-text" x="570" y="211">Q̅</text>${state.edge === "falling" ? `<circle class="mil-bubble" cx="425" cy="242" r="5"/>` : ""}<path class="mil-clock-edge" d="M${state.edge === "falling" ? 430 : 425} 230 l12 12 -12 12 Z"/>`;
    svg += `<text class="schematic-equation" x="280" y="220">D = T ⊕ Q</text><text class="schematic-caption" x="25" y="315">XORがT=0でQを保持、T=1で反転する次状態を作り、選択エッジで保存します。</text></svg>`;
    return svg;
  }

  function renderDSchematic() {
    const D = state.inputs.D;
    if (state.dMode === "ff") {
      const masterEnable = state.edge === "rising" ? 1 - state.clock : state.clock;
      const slaveEnable = 1 - masterEnable;
      const mData = logicAnd(masterEnable, D);
      const mHold = logicAnd(1 - masterEnable, state.master);
      const master = logicOr(mData, mHold);
      const sData = logicAnd(slaveEnable, master);
      const sHold = logicAnd(1 - slaveEnable, state.q);
      const qNext = logicOr(sData, sHold);
      const qbar = state.q === null ? null : 1 - state.q;
      const nClock = logicNot(state.clock);
      const masterHoldEnable = 1 - masterEnable;
      const slaveHoldEnable = 1 - slaveEnable;
      let svg = `<svg class="mil-schematic" viewBox="0 0 1190 400" role="img" aria-label="AND、ORゲートで構成したマスター・スレーブDフリップフロップ回路図">`;
      svg += `<text class="schematic-heading" x="25" y="28">MASTER-SLAVE D FLIP-FLOP / AND-OR LATCHES</text>`;
      svg += `<rect class="schematic-module" x="105" y="54" width="405" height="290" rx="7"/><text class="mil-ff-text" x="307" y="75">MASTER LATCH</text>`;
      svg += `<rect class="schematic-module" x="590" y="54" width="405" height="290" rx="7"/><text class="mil-ff-text" x="792" y="75">SLAVE LATCH</text>`;
      svg += signalPath("M35 98 H135", D) + signalText(42, 89, "D", D);
      svg += signalPath("M35 122 H135", masterEnable, true) + signalText(42, 140, "M-EN", masterEnable, true);
      svg += signalPath("M35 238 H135", masterHoldEnable, true) + signalText(42, 256, "M-HOLD", masterHoldEnable, true);
      svg += signalPath("M35 262 H135", state.master);
      svg += signalPath("M218 110 H280 V163 H350", mData);
      svg += signalPath("M218 250 H310 V187 H350", mHold);
      svg += signalPath("M433 175 H475 V262 H135", master);
      svg += signalText(437, 165, "MASTER Q", master);
      svg += signalPath("M475 175 H535 V98 H720", master);
      svg += signalText(500, 89, "MASTER Q", master);
      svg += signalPath("M620 122 H720", slaveEnable, true) + signalText(623, 140, "S-EN", slaveEnable, true);
      svg += signalPath("M620 238 H720", slaveHoldEnable, true) + signalText(623, 256, "S-HOLD", slaveHoldEnable, true);
      svg += signalPath("M620 262 H720", state.q);
      svg += signalPath("M803 110 H860 V163 H930", sData);
      svg += signalPath("M803 250 H890 V187 H930", sHold);
      svg += signalPath("M1013 175 H1120", qNext) + signalText(1032, 165, "Q(next)", qNext);
      svg += signalPath("M1013 175 H1050 V262 H720", state.q);
      svg += milGate("AND", 135, 110, 2, "G1") + milGate("AND", 135, 250, 2, "G2") + milGate("OR", 350, 175, 2, "G3");
      svg += milGate("AND", 720, 110, 2, "G4") + milGate("AND", 720, 250, 2, "G5") + milGate("OR", 930, 175, 2, "G6");
      svg += `<circle class="schematic-junction" cx="433" cy="175" r="3"/><circle class="schematic-junction" cx="1013" cy="175" r="3"/>`;
      svg += `<text class="schematic-equation" x="135" y="322">MASTER(next) = (M-EN ∧ D) ∨ (M-HOLD ∧ MASTER)</text><text class="schematic-equation" x="720" y="322">Q(next) = (S-EN ∧ MASTER) ∨ (S-HOLD ∧ Q)</text>`;
      svg += `<text class="schematic-caption" x="25" y="394">${state.edge === "rising" ? "立ち上がり選択: CLK=0でMASTERがDを追従し、CLK=1でSLAVEがQを更新します。" : "立ち下がり選択: CLK=1でMASTERがDを追従し、CLK=0でSLAVEがQを更新します。"} Q̅=${displayBit(qbar)}</text></svg>`;
      return svg;
    }

    const nD = logicNot(D);
    const setBar = logicNot(logicAnd(D, state.clock));
    const resetBar = logicNot(logicAnd(nD, state.clock));
    const qbar = state.q === null ? null : 1 - state.q;
    const qValue = logicNot(logicAnd(setBar, qbar));
    const qbarValue = logicNot(logicAnd(resetBar, state.q));
    let svg = `<svg class="mil-schematic" viewBox="0 0 940 360" role="img" aria-label="NOTと4個のNANDゲートを接続したDラッチのMIL回路図">`;
    svg += `<text class="schematic-heading" x="25" y="28">D LATCH / 1 INVERTER + 4 NAND GATES</text>`;
    svg += signalPath("M30 88 H260", D) + signalText(38, 78, "D", D);
    svg += signalPath("M60 88 V275 H145", D);
    svg += `<circle class="schematic-junction" cx="60" cy="88" r="3"/>`;
    svg += signalPath("M213 275 H235 V228 H260", nD) + signalText(224, 265, "¬D", nD);
    svg += signalPath("M30 135 H115 V112 H260", state.clock, true) + signalText(38, 155, "EN/CLK", state.clock, true);
    svg += signalPath("M115 135 V252 H260", state.clock, true);
    svg += signalPath("M344 100 H500 V88 H570", setBar);
    svg += signalPath("M344 240 H500 V228 H570", resetBar);
    svg += signalPath("M654 100 H900", qValue) + signalText(800, 90, "Q", qValue);
    svg += signalPath("M654 240 H900", qbarValue) + signalText(800, 230, "Q̅", qbarValue);
    svg += signalPath("M654 100 H720 V252 H570", qValue);
    svg += signalPath("M654 240 H760 V112 H570", qbarValue);
    svg += milGate("NOT", 145, 275, 1, "G1") + milGate("NAND", 260, 100, 2, "G2") + milGate("NAND", 260, 240, 2, "G3") + milGate("NAND", 570, 100, 2, "G4") + milGate("NAND", 570, 240, 2, "G5");
    svg += `<text class="schematic-caption" x="25" y="330">EN=1でDからSET̅/RESET̅を生成。EN=0では相互帰還したNANDラッチがQを保持します。</text></svg>`;
    return svg;
  }

  function renderStageSchematic(stages) {
    if (state.circuit === "jk") return renderJKSchematic();
    if (state.circuit === "t") return renderTSchematic();
    if (state.circuit === "d") return renderDSchematic();
    const width = Math.max(760, 150 + stages.length * 140);
    let svg = `<svg class="mil-schematic" viewBox="0 0 ${width} 330" role="img" aria-label="順序回路のゲートレベルMIL回路図">`;
    svg += `<text class="schematic-heading" x="24" y="28">${state.circuit.toUpperCase()} / GATE-LEVEL NEXT-STATE LOGIC</text>`;
    const top = 155;
    stages.forEach((stage, index) => {
      const x = 70 + index * 138;
      const value = stage.value;
      if (index > 0) {
        const previous = stages[index - 1];
        const prevX = 70 + (index - 1) * 138;
        svg += signalPath(`M${prevX + 98} ${top} H${x}`, previous.value);
        svg += signalText(prevX + 103, top - 9, previous.name, previous.value);
      }
      const gateType = stage.gate === "WIRE" ? "AND" : stage.gate;
      const count = stage.terms.length;
      svg += milGate(gateType, x, top, count, `G${index + 1}`);
      stage.terms.forEach(([label, termValue], termIndex) => {
        const pinY = count === 1 ? top : count === 3 ? top + [-18, 0, 18][termIndex] : top + [-12, 12][termIndex];
        svg += signalPath(`M${x - 34} ${pinY} H${x}`, termValue);
        svg += signalText(x - 31, pinY - 5, label, termValue);
      });
      svg += signalPath(`M${x + 98} ${top} H${x + 120}`, value);
      svg += signalText(x + 103, top + 20, stage.name, value);
      svg += `<text class="schematic-equation" x="${x - 25}" y="260">${stage.equation}</text>`;
    });
    const last = stages[stages.length - 1];
    const finalX = 70 + (stages.length - 1) * 138 + 120;
    svg += `<rect class="mil-ff-body" x="${finalX + 25}" y="95" width="100" height="120" rx="6"/><path class="mil-clock-edge" d="M${finalX + 25} 185 l12 10 -12 10 Z"/><text class="mil-ff-text" x="${finalX + 75}" y="145">DFF</text><text class="mil-ff-text" x="${finalX + 40}" y="120">D</text>`;
    svg += signalPath(`M${finalX} ${top} H${finalX + 25}`, last ? last.value : null);
    svg += signalText(finalX + 4, top - 10, "D", last ? last.value : null);
    svg += signalPath(`M${finalX + 125} 135 H${finalX + 165}`, state.q) + signalText(finalX + 132, 125, "Q", state.q);
    svg += signalPath(`M${finalX + 125} 175 H${finalX + 165}`, state.q === null ? null : 1 - state.q) + signalText(finalX + 132, 165, "Q̅", state.q === null ? null : 1 - state.q);
    svg += signalPath(`M${finalX + 75} 270 V255`, state.clock, true) + signalText(finalX + 80, 275, `${edgeName()} CLK`, state.clock, true);
    svg += `</svg>`;
    return svg;
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
    renderLogicDetails();
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
      refreshDMaster();
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
        state.master = previous.master;
        state.lastEvent = previous.lastEvent;
      }
    } else {
      if (state.step === -1) return;
      state.stepHistory.push({
        step: state.step, stepEdge: state.stepEdge, stepTarget: state.stepTarget, clock: state.clock,
        previousClock: state.previousClock, q: state.q, master: state.master, lastEvent: state.lastEvent
      });
      if (state.step === 2) {
        const isDLevel = state.circuit === "d" && state.dMode === "latch";
        const target = isDLevel || state.edge === "rising" ? 1 : 0;
        state.stepTarget = target;
        const baseline = isDLevel ? 0 : 1 - target;
        state.previousClock = state.clock;
        state.clock = baseline;
        refreshDMaster();
        state.stepEdge = false;
        setEvent(`STEP 3: CLKを${baseline ? "HIGH" : "LOW"}に準備しました。`);
      } else if (state.step === 3) {
        const isDLevel = state.circuit === "d" && state.dMode === "latch";
        refreshDMaster();
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
    state.master = null;
    state.initialQ = null;
    state.clock = 0;
    state.previousClock = 0;
    state.step = 0;
    state.stepHistory = [];
    refreshDMaster();
    setEvent(state.circuit === "gates" ? "入力を切り替えると出力が即時に再計算されます。" : "初期状態は未定義です。入力とクロックを操作して動作を確認してください。");
    render();
  }));
  render();
})();
