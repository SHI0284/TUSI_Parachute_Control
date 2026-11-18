"""입력 어댑터와 화면 사이의 스레드 안전한 최신 상태 저장소."""
from collections import deque
from copy import deepcopy
from datetime import datetime, timezone
from math import isfinite
from threading import Lock
from time import monotonic
from uuid import uuid4

STATES = ["INIT", "SAFE", "ARMED", "LAUNCH", "COAST", "APOGEE", "DEPLOY",
          "STABILIZATION", "GUIDED_DESCENT", "FINAL_DESCENT", "GROUND", "FAULT"]


def measurement(value=None, unit="", source_time_ms=None, received_at_utc=None):
    return dict(value=value, unit=unit, valid=value is not None,
                source_time_ms=source_time_ms, received_at_utc=received_at_utc,
                age_ms=None, origin="ONBOARD")


class StateStore:
    def __init__(self, source_mode="SIM"):
        self._lock = Lock()
        self.recorder = None
        self._revision = 0
        self._received = {}
        self._last_seq = None
        self._last_source_ms = None
        self._retired_boots = set()
        self._events = deque(maxlen=200)
        self._history = deque(maxlen=1200)
        self._event_seq = 0
        self._snapshot = {
            "api_version": 1, "source_mode": source_mode,
            "session_id": str(uuid4()), "vehicle_id": None, "boot_id": None,
            "snapshot_revision": "0", "source_time_ms": None,
            "flight": dict(state_code=None, state_name="UNKNOWN", control_mode=None),
            "navigation": {"relative_altitude": measurement(unit="m"),
                           "vertical_speed": measurement(unit="m/s")},
            "gps": None, "imu": None, "target": None, "arming": None, "recovery": None, "controller": None,
            "transport": dict(status="STARTING", detail="입력 대기", received=0,
                              rejected=0, duplicates=0, out_of_order=0, gaps=0),
        }

    def _bump(self):
        self._revision += 1
        self._snapshot["snapshot_revision"] = str(self._revision)

    def get_snapshot(self):
        with self._lock:
            result = deepcopy(self._snapshot)
            received = dict(self._received)
            result["events"] = list(deepcopy(self._events))
            result["history"] = list(deepcopy(self._history))
        now = monotonic()
        result["telemetry_age_ms"] = (
            int((now - received["packet"]) * 1000) if "packet" in received else None)
        for item in result["navigation"].values():
            item["age_ms"] = (int((now - received["navigation"]) * 1000)
                              if "navigation" in received else None)
        result["logging"] = self.recorder.status() if self.recorder else {"status": "DISABLED"}
        return result

    def set_transport(self, status, detail):
        with self._lock:
            self._snapshot["transport"].update(status=status, detail=detail)

    def reject(self, reason):
        if self.recorder:
            self.recorder.record("rejection", {"reason": str(reason)[:180]})
        with self._lock:
            self._snapshot["transport"]["rejected"] += 1
            self._snapshot["transport"]["last_error"] = str(reason)[:180]

    def _flight(self, state_code, control_mode, source_ms):
        old = self._snapshot["flight"]
        name = STATES[state_code] if state_code is not None and 0 <= state_code < len(STATES) else "UNKNOWN"
        if old["state_code"] != state_code:
            self._event_seq += 1
            self._events.append(dict(id=str(self._event_seq), previous=old["state_name"],
                                     state=name, state_code=state_code,
                                     source_time_ms=source_ms,
                                     observed_at_utc=datetime.now(timezone.utc).isoformat(),
                                     origin="SNAPSHOT_OBSERVATION"))
        self._snapshot["flight"] = dict(state_code=state_code, state_name=name, control_mode=control_mode)

    def capture_raw(self, raw):
        if self.recorder:
            self.recorder.record("raw_frame", {"hex": raw.hex()})

    def ingest(self, packet):
        accepted = self._ingest(packet)
        if self.recorder:
            self.recorder.record("packet", {"accepted": accepted, "packet": packet})
        return accepted

    def _ingest(self, packet):
        """검증한 패킷을 한 번에 적용. 패킷 해석은 protocol.py의 책임."""
        with self._lock:
            boot = packet["boot_id"]
            if self._snapshot["vehicle_id"] not in (None, packet["vehicle_id"]):
                self._snapshot["transport"]["rejected"] += 1
                return False
            if boot in self._retired_boots:
                self._snapshot["transport"]["out_of_order"] += 1
                return False
            if boot != self._snapshot["boot_id"]:
                if self._snapshot["boot_id"] is not None:
                    self._retired_boots.add(self._snapshot["boot_id"])
                self._snapshot["boot_id"] = boot
                self._last_seq = None
                self._last_source_ms = None
                self._events.clear()
                self._history.clear()
                self._snapshot["flight"] = dict(state_code=None, state_name="UNKNOWN", control_mode=None)
            seq = packet["seq"]
            if self._last_seq is not None and seq <= self._last_seq:
                key = "duplicates" if seq == self._last_seq else "out_of_order"
                self._snapshot["transport"][key] += 1
                return False
            if self._last_source_ms is not None and packet["source_time_ms"] < self._last_source_ms:
                self._snapshot["transport"]["out_of_order"] += 1
                return False
            if self._last_seq is not None:
                self._snapshot["transport"]["gaps"] += seq - self._last_seq - 1
            self._last_seq = seq
            self._last_source_ms = packet["source_time_ms"]
            utc = datetime.now(timezone.utc).isoformat()
            stamp = monotonic()
            self._received.update(packet=stamp, navigation=stamp)
            self._snapshot.update(vehicle_id=packet["vehicle_id"], source_time_ms=packet["source_time_ms"])
            self._flight(packet["state_code"], packet["control_mode"], packet["source_time_ms"])
            self._snapshot["navigation"] = {
                "relative_altitude": measurement(packet["altitude_m"], "m", packet["source_time_ms"], utc),
                "vertical_speed": measurement(packet["vertical_speed_mps"], "m/s", packet["source_time_ms"], utc),
            }
            for key in ("gps", "imu", "target", "arming", "recovery", "controller"):
                self._snapshot[key] = deepcopy(packet.get(key))
            self._snapshot["transport"]["received"] += 1
            self._history.append(dict(seq=str(seq), t=packet["source_time_ms"] / 1000,
                                      altitude=packet["altitude_m"], speed=packet["vertical_speed_mps"],
                                      gps=deepcopy(packet.get("gps")), imu=deepcopy(packet.get("imu"))))
            self._bump()
            return True

    # 초기 학습 코드와 호환. 통합 입력은 ingest()를 사용한다.
    def update_flight(self, *, state_code, state_name, control_mode):
        with self._lock:
            self._flight(state_code, control_mode, None)
            self._bump()

    def update_navigation(self, *, relative_altitude_m, vertical_speed_mps, source_time_ms):
        for value in (relative_altitude_m, vertical_speed_mps):
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not isfinite(value):
                raise ValueError("유한한 숫자가 필요합니다.")
        if type(source_time_ms) is not int or source_time_ms < 0:
            raise ValueError("source_time_ms는 0 이상의 정수여야 합니다.")
        with self._lock:
            self._received["navigation"] = monotonic()
            utc = datetime.now(timezone.utc).isoformat()
            self._snapshot["navigation"] = {
                "relative_altitude": measurement(float(relative_altitude_m), "m", source_time_ms, utc),
                "vertical_speed": measurement(float(vertical_speed_mps), "m/s", source_time_ms, utc),
            }
            self._bump()
