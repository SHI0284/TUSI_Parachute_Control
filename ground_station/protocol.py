"""DEV_JSONL_1: USB/PTY 시험용 어댑터. 최종 E22/MAVLink 규격이 아니다."""
import json
from math import isfinite

MAX_FRAME_BYTES = 4096


def number(value, name, low=None, high=None, nullable=False):
    if value is None and nullable:
        return
    if type(value) not in (int, float) or not isfinite(value):
        raise ValueError(f"{name}: 유한한 숫자 필요")
    if (low is not None and value < low) or (high is not None and value > high):
        raise ValueError(f"{name}: 범위 오류")


def decode_frame(raw):
    if len(raw) > MAX_FRAME_BYTES:
        raise ValueError("프레임 크기 초과")
    p = json.loads(raw)
    if not isinstance(p, dict) or p.get("protocol") != "DEV_JSONL_1":
        raise ValueError("DEV_JSONL_1 시험 프레임만 지원")
    for key in ("vehicle_id", "boot_id"):
        if not isinstance(p.get(key), str) or not 1 <= len(p[key]) <= 64:
            raise ValueError(f"{key}: 1~64자 문자열 필요")
    for key in ("seq", "source_time_ms", "state_code"):
        if type(p.get(key)) is not int or not 0 <= p[key] <= 2**53-1:
            raise ValueError(f"{key}: 범위 내 정수 필요")
    if "control_mode" not in p or p.get("control_mode") not in (None, "AUTO", "MANUAL"):
        raise ValueError("control_mode 오류")
    for key in ("altitude_m", "vertical_speed_mps"):
        if key not in p:
            raise ValueError(f"{key} 필드 누락")
        number(p[key], key, nullable=True)
    gps = p.get("gps")
    if gps is not None:
        if not isinstance(gps, dict) or type(gps.get("valid")) is not bool:
            raise ValueError("GPS validity 필요")
        if gps["valid"]:
            number(gps.get("lat"), "latitude", -85, 85)
            number(gps.get("lon"), "longitude", -180, 180)
        else:
            p["gps"] = None
    target = p.get("target")
    if target is not None:
        if not isinstance(target, dict):
            raise ValueError("target 객체 필요")
        number(target.get("lat"), "target.lat", -85, 85)
        number(target.get("lon"), "target.lon", -180, 180)
    imu = p.get("imu")
    if imu is not None:
        if not isinstance(imu, dict):
            raise ValueError("imu 객체 필요")
        for key in ("roll_deg", "pitch_deg", "yaw_deg"):
            number(imu.get(key), key, -360, 360, nullable=True)
        for key in ("accel_mps2", "gyro_dps"):
            value = imu.get(key)
            if value is not None:
                if not isinstance(value, list) or len(value) != 3:
                    raise ValueError(f"{key}: XYZ 3개 필요")
                for item in value:
                    number(item, key)
    arming = p.get("arming")
    if arming is not None:
        if not isinstance(arming, dict) or arming.get("source") != "AIRFRAME_BUTTON":
            raise ValueError("arming.source는 AIRFRAME_BUTTON이어야 합니다")
        for key in ("button_pressed", "armed"):
            if arming.get(key) is not None and type(arming[key]) is not bool:
                raise ValueError("arming: bool 또는 null 필요")
    recovery = p.get("recovery")
    if recovery is not None:
        if not isinstance(recovery, dict):
            raise ValueError("recovery 객체 필요")
        for key in ("main", "drogue"):
            item = recovery.get(key)
            if item is None: continue
            if not isinstance(item, dict) or item.get("state") not in ("UNKNOWN", "STOWED", "DEPLOYING", "DEPLOYED"):
                raise ValueError("recovery.state 오류")
            number(item.get("inflation"), "inflation", 0, 1, nullable=True)
            if item.get("physical_confirmed") is not None and type(item["physical_confirmed"]) is not bool:
                raise ValueError("physical_confirmed: bool 또는 null 필요")
    controller = p.get("controller")
    if controller is not None:
        if not isinstance(controller, dict):
            raise ValueError("controller 객체 필요")
        sample = controller.get("sample_time_ms")
        if type(sample) is not int or not 0 <= sample <= p["source_time_ms"]:
            raise ValueError("controller.sample_time_ms: 패킷 시각 이하의 정수 필요")
        if controller.get("status") not in ("UNKNOWN", "IDLE", "ACTIVE", "INHIBITED", "FAULT"):
            raise ValueError("controller.status 오류")
        if controller.get("input_source") not in ("UNKNOWN", "NONE", "AUTO", "ELRS"):
            raise ValueError("controller.input_source 오류")
        for key in ("target_heading_deg", "heading_deg"):
            number(controller.get(key), key, 0, 360, nullable=True)
        number(controller.get("heading_error_deg"), "heading_error_deg", -180, 180, nullable=True)
        number(controller.get("turn_command"), "turn_command", -1, 1, nullable=True)
        for side in ("left", "right"):
            servo = controller.get(side)
            if servo is None: continue
            if not isinstance(servo, dict):
                raise ValueError("controller servo 객체 필요")
            for key in ("command_deg", "actual_deg"):
                number(servo.get(key), key, 0, 180, nullable=True)
            number(servo.get("pwm_us"), "pwm_us", 0, 3000, nullable=True)
    return p
