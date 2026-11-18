"""UI 시험용 합성 미션. 비행역학/제어기 검증 모델이 아니다."""
import json
from math import sin, cos, pi
from threading import Event, Thread
from time import monotonic
from uuid import uuid4
from protocol import decode_frame


def make_packet(t, seq, boot_id):
    # 하나의 100초 시나리오 이후 GROUND 유지. 자동 재발사하지 않는다.
    stages = [(2, 0), (5, 1), (8, 2), (13, 3), (25, 4), (27, 5),
              (30, 6), (34, 7), (85, 8), (100, 9)]
    state = next((state for end, state in stages if t < end), 10)
    if t < 8:
        altitude, speed = 0.0, 0.0
    elif t < 25:
        phase = (t - 8) / 17 * pi / 2
        altitude = 400 * sin(phase)
        speed = 400 * pi / 34 * cos(phase)
    elif t < 27:
        altitude, speed = 400.0, 0.0
    elif t < 100:
        altitude, speed = 400 * (100 - t) / 73, -400 / 73
    else:
        altitude, speed = 0.0, 0.0
    progress = min(1, max(0, (t - 8) / 92))
    # 임의의 서울 부근 데모 좌표. 실제 발사 위치/목표가 아니다.
    lat = 37.5665 + progress * 0.0018
    lon = 126.9780 + progress * 0.0024 + sin(progress * pi) * 0.0004
    moving = 8 <= t < 100
    roll = 12 * sin(t * 0.6) if moving else 0.0
    pitch = 80 + 8 * cos(t * 0.4) if moving else 90.0
    yaw = (40 + 15 * sin(t * 0.2)) if moving else 40.0
    def canopy(start):
        fraction = min(1., max(0., (t-start)/2))
        return dict(state="STOWED" if t < start else "DEPLOYING" if fraction < 1 else "DEPLOYED",
                    inflation=fraction, physical_confirmed=None)
    active = 34 <= t < 100
    turn = .65*sin(t*.27) if active else 0.
    controller = dict(sample_time_ms=int(t*1000), status="ACTIVE" if active else "IDLE",
                      input_source="AUTO" if active else "NONE",
                      target_heading_deg=(yaw+turn*35)%360 if active else None,
                      heading_deg=yaw, heading_error_deg=turn*35 if active else None,
                      turn_command=turn if active else None,
                      left=dict(command_deg=90+turn*35 if active else None, actual_deg=None, pwm_us=1500+turn*300 if active else None),
                      right=dict(command_deg=90-turn*35 if active else None, actual_deg=None, pwm_us=1500-turn*300 if active else None))
    return dict(controller=controller, arming=dict(source="AIRFRAME_BUTTON", button_pressed=5 <= t < 5.3, armed=5 <= t < 100),
                recovery=dict(drogue=canopy(27), main=canopy(30)), protocol="DEV_JSONL_1", vehicle_id="TUSI-DEMO", boot_id=boot_id,
                seq=seq, source_time_ms=int(t * 1000), state_code=state, control_mode="AUTO",
                altitude_m=altitude, vertical_speed_mps=speed,
                gps=dict(valid=True, lat=lat, lon=lon),
                target=dict(lat=37.5683, lon=126.9804),
                imu=dict(roll_deg=roll, pitch_deg=pitch, yaw_deg=yaw,
                         accel_mps2=[0.4*sin(t) if moving else 0, 0.3*cos(t) if moving else 0, -9.81],
                         gyro_dps=[7.2*cos(t*.6) if moving else 0,
                                   -3.2*sin(t*.4) if moving else 0,
                                   3*cos(t*.2) if moving else 0]))


class Simulator(Thread):
    def __init__(self, store):
        super().__init__(name="mission-simulator", daemon=True)
        self._store = store
        self._stop_event = Event()

    def run(self):
        start = monotonic()
        boot = str(uuid4())
        seq = 0
        self._store.set_transport("SIMULATED", "합성 미션 · RF 연결 아님")
        try:
            while not self._stop_event.is_set():
                packet = make_packet(monotonic() - start, seq, boot)
                raw = json.dumps(packet).encode()
                self._store.capture_raw(raw)
                self._store.ingest(decode_frame(raw))
                seq += 1
                self._stop_event.wait(.1)
        finally:
            self._store.set_transport("STOPPED", "모의 생성기 종료")

    def stop(self):
        self._stop_event.set()
