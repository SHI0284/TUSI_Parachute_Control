"use strict";

const POLL_INTERVAL_MS = 250;
const REQUEST_TIMEOUT_MS = 2000;

// HTML에서 갱신할 요소를 찾는다.
const elements = {
    sourceMode: document.getElementById("source-mode"),
    flightState: document.getElementById("flight-state"),
    controlMode: document.getElementById("control-mode"),
    sessionId: document.getElementById("session-id"),
    serverStatus: document.getElementById("server-status"),
};

// 마지막으로 정상 응답을 받은 PC 측 시각이다.
// 로켓 데이터의 측정 시각과는 다르다.
let lastSuccessAt = null;


// 이번 화면에 필요한 최소 데이터 구조를 확인한다.
function validateSnapshot(snapshot) {
    if (
        snapshot === null ||
        typeof snapshot !== "object" ||
        snapshot.api_version !== 1 ||
        !["REAL", "SIM", "REPLAY"].includes(snapshot.source_mode) ||
        typeof snapshot.session_id !== "string" ||
        typeof snapshot.snapshot_revision !== "string" ||
        snapshot.flight === null ||
        typeof snapshot.flight !== "object"
    ) {
        throw new Error("지원하지 않는 상태 응답 형식");
    }

    const flight = snapshot.flight;

    if (
        typeof flight.state_name !== "string" ||
        !(
            flight.control_mode === null ||
            typeof flight.control_mode === "string"
        )
    ) {
        throw new Error("비행 상태 응답 형식 오류");
    }
}


// 검증한 데이터를 화면에 표시한다.
function renderSnapshot(snapshot) {
    elements.sourceMode.textContent = snapshot.source_mode;
    elements.flightState.textContent = snapshot.flight.state_name;
    elements.controlMode.textContent =
        snapshot.flight.control_mode ?? "미확인";
    elements.sessionId.textContent = snapshot.session_id;
}


// 조회 실패를 표시하되 마지막으로 받은 값은 유지한다.
function renderConnectionFailure(message) {
    let detail = "아직 정상 응답을 받지 못했습니다.";

    if (lastSuccessAt !== null) {
        const elapsedSeconds =
            (performance.now() - lastSuccessAt) / 1000;

        detail =
            `마지막 정상 응답 ${elapsedSeconds.toFixed(1)}초 전. ` +
            "화면 값은 마지막 수신값입니다.";
    }

    elements.serverStatus.className =
        "connection-status disconnected";

    elements.serverStatus.textContent =
        `PC 서버 상태 조회 실패: ${message}. ${detail}`;
}


// 한 번 조회하고, 완료된 뒤 다음 조회를 예약한다.
async function pollSnapshot() {
    const controller = new AbortController();

    const timeoutId = setTimeout(() => {
        controller.abort();
    }, REQUEST_TIMEOUT_MS);

    try {
        const response = await fetch("/api/v1/snapshot", {
            method: "GET",
            cache: "no-store",
            signal: controller.signal,
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const snapshot = await response.json();

        validateSnapshot(snapshot);
        renderSnapshot(snapshot);

        lastSuccessAt = performance.now();

        elements.serverStatus.className =
            "connection-status connected";

        elements.serverStatus.textContent =
            "PC 서버 연결 정상 · 로켓/E22 연결 상태와는 별개입니다.";
    } catch (error) {
        const message =
            error.name === "AbortError"
                ? "응답 시간 초과"
                : error.message;

        renderConnectionFailure(message);
    } finally {
        clearTimeout(timeoutId);

        setTimeout(pollSnapshot, POLL_INTERVAL_MS);
    }
}


// 페이지가 열리면 첫 조회를 시작한다.
pollSnapshot();