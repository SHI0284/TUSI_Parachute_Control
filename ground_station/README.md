# TUSI 지상국 개발 안내

## 실행

Ubuntu 터미널에서:

```bash
cd /home/seohyein/TUSI_Avionics_Recovery/ground_station
source .venv/bin/activate
python -I -m pip install -r requirements.txt
python -E -s app.py --mode sim
```

`http://127.0.0.1:8080` 접속. 이전 서버는 Ctrl+C로 종료하고 다시 실행한다. 브라우저는 Ctrl+Shift+R로 갱신한다. ROS 환경의 PYTHONPATH를 배제하되 로컬 Python 모듈 import는 허용하려고 `-E -s`를 사용한다. Flask 개발 서버는 로컬 개발 용도이다.

## 이번 구현 범위

- 지도: Leaflet 1.9.4 로컬 자산, GPS 위치·최근 궤적·보고 목표. 기본값은 인터넷이 필요 없는 좌표 격자. 온라인 배경 체크 시 OSM 타일 사용. 타일의 대량 다운로드/오프라인 저장 기능은 제공하지 않는다.
- 3D 궤적: GPS를 첫 유효 GPS 기준 ENU의 E/N으로 변환하고, 발사 지면 상대고도를 Up으로 표시. Canvas 직교 투영이며 드래그로 회전, 휠로 확대한다. 지형·AGL 시뮬레이션이나 실물 3D 스캔이 아니다.
- 자세: 입력 Euler roll/pitch/yaw로 기체 도형을 회전. 축은 기체 X 전방/Y 우측/Z 아래(FRD), 자세는 NED 기준 Rz(yaw) Ry(pitch) Rx(roll)이며 표시할 때 ENU로 변환한다. 실제 센서 장착축과 탑재 좌표계는 통합 전에 일치시켜야 한다. 원시 가속도·자이로만으로 자세를 추정하지 않는다.
- 그래프: 상대고도·수직속도·가속도 XYZ·각속도 XYZ. 최근 1,200개 패킷을 기기 시간에 맞춰 표시. 상태 변화 관측을 고도/속도 그래프의 점선으로 표시. seq 누락·무효값·1초 초과 시각 공백에서는 선을 끊는다.
- 상태 막대: 현재 상태와 관측된 방문을 구분. SAFE↔ARMED 재방문 보존, 미수신 중간 단계를 생성하지 않음. 이벤트 시각은 해당 스냅샷의 기기 시각이며 탑재의 실제 전이 시각으로 확정하지 않는다.
- 데이터 freshness: 수신 나이에 브라우저에서 경과한 시간을 더한다. 1초 기준은 개발용이며 RF 전송 profile 확정 후 변경한다. PC 연결, USB 열림, 텔레메트리 수신, 실제 RF 연결을 구분한다.
- 실제 USB 시리얼 수신: `DEV_JSONL_1` 개발용 줄 단위 패킷만 수신. 최종 MAVLink wire revision 2 및 명령 송신은 미구현이다. ARM은 동체 물리 버튼이 담당하며 지상국 ARM 요청은 범위에서 제외한다. DISARM 원격 정책은 미확정으로 송신하지 않는다.
- 기록: 원본 프레임·검증된 패킷과 수락 여부·해석 거부 사유를 SQLite에 저장한다. 화면 그래프는 최근 메모리 버퍼이며, 저장 DB의 GUI 재생은 후속 구현이다.

모의 모드는 100초짜리 합성 시나리오를 한 번 수행하고 GROUND를 유지한다. 데모 GPS는 서울 부근의 임의 위치이며 실제 발사장/목표가 아니다. 400m는 표시 시험에 사용한 값이며 100초 비행시간과 합성 IMU는 비행역학·제어 검증 근거가 아니다. 재실행 시 새 세션으로 시작한다.

## 코드 읽는 순서

1. `protocol.py`: 바이트 → Python 객체, 형식·단위·유효성 검사. 사용자 최종 패킷 설계가 들어갈 교체 지점.
2. `state_store.py`: Lock으로 원자적 저장, deepcopy 조회, 중복·역순·기기 재부팅 처리, 최근 궤적과 상태 변경 관측 보관.
3. `simulator.py`: 합성 패킷 생성 → 동일 decoder → store.ingest. 화면에서 임의로 상태를 판단하지 않는다.
4. `transport.py`: 실제 serial read → 조각을 줄 단위로 조립 → decoder → store.ingest. 한 스레드만 serial을 소유한다. 연결 실패 시 재시도하되 과거 명령을 송신하지 않는다.
5. `app.py`: 입력 모드 선택, 작업 스레드 시작/종료, GET API. 화면 요청은 시뮬레이터 시간을 전진시키지 않는다.
6. `static/js/app.js`: 250ms 후속 조회, 카드·상태 이력·freshness, 패킷 revision 변경 때 시각화 갱신.
7. `static/js/visuals.js`: 지도, 3차원 좌표 변환, 시계열 그래프. 모듈 분리는 데이터와 그림을 따로 공부할 수 있게 한다.
8. `static/js/rocket_scene.js`: Three.js 로컬 엔진으로 ORK 외형과 보고 자세·낙하산 전개율 표시.
9. `recorder.py`: 유한 큐 → 별도 DB writer → SQLite backup API.
10. `templates/index.html`, `static/css/style.css`: 화면 구조와 반응형 디자인.

초기 학습 코드의 `update_navigation()`과 `update_flight()`는 호환용으로 남겼다. 통합 입력은 `ingest()`로 한 패킷 전체를 일관되게 적용한다. 새 미션은 텔레메트리 `state_code`를 표시하며 GCS가 실제 비행 상태 전이를 실행하지 않는다.

## 실제 포트 수신 시험

```bash
python -E -s app.py --mode serial --port /dev/ttyUSB0 --baud 115200
```

지정한 포트가 실제로 존재하고 송신 측이 아래 개발용 JSONL 형식을 보내야 한다. pyserial 기본 제어선 동작은 보드에 따라 reset을 일으킬 수 있으므로 PCB 통합 시 DTR/RTS·전원·포트를 확인한다. USB 열림은 E22 링크 성공이나 인증 성공을 의미하지 않는다. REAL에서 합성 데이터로 자동 대체하지 않는다.

최종 이진 무선 패킷은 아직 이 수신부에서 해석하지 못한다. 최종 규격의 검증·decoder를 구현한 다음 정규화된 객체를 `ingest()`에 연결한다.

## 개발용 패킷: DEV_JSONL_1

`examples/telemetry.jsonl`은 한 줄 예제이다. UTF-8 JSON 객체 하나 뒤 LF(`\n`)로 종료한다. 줄바꿈 제외 최대 4,096바이트. 분할·연속 입력을 처리하며 초과 프레임은 다음 LF까지 폐기한다. 이 형식은 **사용자가 설계할 최종 무선 규격을 대체하지 않는다**. 인증·암호화·CRC·명령 실행 기능이 없으며 통신/화면 개발 시험에만 사용한다.

| 필드 | 의미 / 개발용 계약 |
| --- | --- |
| protocol | `DEV_JSONL_1` |
| vehicle_id / boot_id | 각각 1~64자 문자열. 부팅마다 새 boot_id. 한 PC 세션에서 첫 기체에 고정 |
| seq | 부팅 내 증가 정수, 0~2^53−1; 이 개발 형식은 wrap을 지원하지 않음 |
| source_time_ms | 부팅 후 단조 증가 ms, 0~2^53−1 |
| state_code | 기존 FlightState 0~11. 미지 코드는 UNKNOWN으로 보존 |
| control_mode | AUTO / MANUAL / null |
| altitude_m | 발사 지면 상대고도 m / null |
| vertical_speed_mps | 상승 양수의 수직속도 m/s / null |
| gps | null 또는 `{valid, lat, lon}`; valid=false는 표시 무효. 이 지도 시험 범위는 위도 ±85°, 경도 ±180° |
| target | null 또는 `{lat, lon}`. 이번 예제는 보고 목표 위치만 표시; 적용 버전 readback/설정 명령은 미구현 |
| imu | null 또는 roll_deg/pitch_deg/yaw_deg(각각 null 허용), accel_mps2/gyro_dps(XYZ 리스트 또는 null) |

DEV 형식은 패킷마다 전체 스냅샷을 보낸다. 생략한 선택 데이터는 이전 값으로 보완하지 않고 미제공 처리한다. 최종 주기별 message 구조와 다른 점이다. 실제 가속도는 FRD specific force(중력 포함 효과)로 약속해야 하며 모의 IMU는 그림 시험용이다.

사용자가 최종 패킷을 설계할 때 결정할 항목: 메시지 ID/길이/엔디언, 시간·세션·순번, 각 센서 validity와 좌표계, 각 항목 송신 주기, CRC/서명, 세션 교체·재전송·ACK, 명령 유효기간, E22 반이중 송신창. 기존 ICD v0.2와 `shared/protocol/`의 revision 1을 구분하여 새 revision 2를 작성해야 한다.

## 검증

```bash
python -E -s -m unittest discover -s tests -v
```

2026-11-19: 백엔드/가상 시리얼(PTY) 시험, Playwright 브라우저에서 지도·3D 회전·자세 축·상태 막대·무효 입력·연결 실패/복구·오프라인 타일 fallback·390px 반응형을 확인했다. PTY 성공은 실제 PCB·E22 RF 성공을 의미하지 않는다. 브라우저 검증은 합성 입력이며 실제 IMU 캘리브레이션/위치 정밀도 시험은 남아 있다.

## 요구사항 추적 / 남은 작업

| 요구사항 | 현재 반영 / 경계 |
| --- | --- |
| SRS §13.2, §13.4 | 계측·상태·GPS·실시간 그래프·유효성·부팅 식별. 센서 health/전압/servo/예측은 미제공 표시 |
| FSM-UI-01~05,08~09 | 관측 방문·재방문·누락 표시·freshness·세션 분리·미지 코드. 영속 전이 로그는 후속 |
| WEB-01~05 | 단일 수신자, GET 부작용 없음, 250ms 후속 조회, SIM/REAL 분리. REPLAY 미구현 |
| MISSION-04,10 | 타일 없는 좌표 지도, 상대고도와 AGL 구분 |
| 신규 사용자 요청 | 3D 궤적·Euler 자세 모델·XYZ IMU 그래프·대시보드 디자인 |
| 미완료 | 최종 wire revision 2, 기능 handshake, 서명 검증, 목표 설정/readback, 모드/긴급 요청, DB GUI 재생·내보내기 (ARM은 동체 버튼으로 범위 변경, 원격 DISARM 미확정), 실제 PCB/ELRS/RF 시험 |

근거: [요구사항 v0.4](../docs/ground_system_requirements_v0.4.md), [ICD v0.2](../docs/communication_interface_v0.2.md), [Leaflet 1.9.4](https://leafletjs.com/reference-1.9.4.html), [OSM 타일 정책](https://operations.osmfoundation.org/policies/tiles/), [pyserial](https://pyserial.readthedocs.io/en/latest/pyserial_api.html). Leaflet 라이선스는 `static/vendor/LEAFLET-LICENSE.txt`에 보관한다.


## 2026-11-19: Flight deck / ORK / 동체 ARM / SQLite

중앙은 기체 상세 3D, 좌측은 주요 계기와 동체 ARM readback, 우측은 고도·속도 그래프와 지도다. 아래에는 FSM 관측 막대, 3D 궤적, IMU 시계열, 상태 관측 이력, 수신 및 DB 상태가 있다. Mission / Telemetry / Record 링크는 해당 영역으로 이동한다.

### OpenRocket 모델과 표시 의미

원본 `simulation/data/rocket.ork`는 제공된 `낙하산_454g(최종).ork`와 SHA256이 동일하다. SHA256과 추출 치수는 `static/models/rocket.json`에 저장했다. 길이 1.604375m, 외경 104mm, 타원체 노즈, 핀 4개, 드로그 지름 0.6m/줄 8개, 메인 지름 1.3m/줄 6개를 사용한다. 원본을 수정한 뒤 `python tools/export_rocket.py`로 치수를 재생성한다. 이 exporter는 현재 단일 stage 구성에 맞췄으므로 다른 구조로 변경하면 추출 코드를 함께 검토한다.

도색과 캐노피 곡면·줄 배치·전개율 표현은 시각화용이다. 천의 접힘, 공력, 하중, 분리 동역학을 계산하지 않는다. 중앙 모델은 자세 상세보기라 실제 고도만큼 화면 위로 이동하지 않는다. 실제 위치·상대고도 궤적은 별도 3D TRAJECTORY가 표시한다. 브라우저가 WebGL을 지원하지 않으면 모델 실패 문구를 보이고 나머지 계기·수신·기록은 유지한다. Three.js와 OrbitControls는 로컬 자산이며 MIT 고지는 `static/vendor/three/THREE-LICENSE.txt`에 보존한다.

`recovery.main` / `recovery.drogue`가 없으면 FSM이 DEPLOY여도 캐노피를 임의로 펼치지 않는다. 보고된 `DEPLOYING`과 inflation 값으로 단계적으로 펼치고, `DEPLOYED`만 제공되면 완전히 열린 개념 모델을 표시한다. 이는 탑재 보고의 시각화이고 물리적 성공 확인은 별도 `physical_confirmed` 보고값이다. 수신이 멈추면 마지막 보고값에서 고정되고 화면을 흐리게 한다.

SIM은 27초부터 드로그, 30초부터 메인을 2초간 펼치는 **UI 시험 시나리오**다. 실제 전개 정책이나 ORK 전개 설정을 펌웨어에 적용한 것이 아니다. 재시작 후 27~32초에 전개 애니메이션을 볼 수 있다.

### 동체 ARM readback 및 개발 패킷 확장

아래 필드는 선택 필드다. 기존 패킷은 계속 허용하되 누락 시 UI에 미확인을 표시한다. 최종 무선 패킷을 확정한 것은 아니다.

```json
{
  "arming": {"source": "AIRFRAME_BUTTON", "button_pressed": false, "armed": true},
  "recovery": {
    "drogue": {"state": "DEPLOYED", "inflation": 1.0, "physical_confirmed": null},
    "main": {"state": "DEPLOYING", "inflation": 0.5, "physical_confirmed": null}
  }
}
```

- button_pressed는 버튼의 순간 상태, armed는 탑재가 판정한 ARM 상태다. 버튼을 놓았다고 자동 DISARM으로 판단하지 않는다.
- 상태는 UNKNOWN/STOWED/DEPLOYING/DEPLOYED. inflation은 0~1 또는 null이고 임의 추정값으로 실물 센서 확인을 대신하지 않는다.
- 물리 버튼의 디바운스·길게 누르기·인터록·허용 상태는 탑재 담당의 명세/구현 항목이다. 이 변경은 지상국만 수정한다.
- GCS에 ARM/DISARM 전송 버튼·API·패킷 송신 코드는 없다. 원격 DISARM 정책은 별도 합의 전 비활성이다.

### 비행 기록과 백업 사용법

기본 경로는 `ground_station/data/sim/` 또는 `ground_station/data/real/`이며 시작할 때마다 UTC+세션 UUID 파일을 만든다. `--data-dir /원하는/경로`로 바꿀 수 있다. 기본 데이터 폴더는 Git에서 제외한다.

- `session`: 소스 모드, 세션 ID, 시작·종료 UTC, schema_version, 정상 종료 여부, 기록 누락 수.
- `records`: ID, PC 수신 UTC, PC monotonic 시각, 종류, JSON payload.
- `raw_frame`: 수신한 줄 프레임의 hex (줄바꿈 제외). 불량 프레임도 보관한다. 4096바이트를 넘는 프레임은 무제한 저장하지 않고 크기 초과 거부 사유만 남긴다.
- `packet`: decoder 통과 객체와 store 수락 여부. 중복·역순·과거 부팅 패킷도 accepted=false로 남는다.
- `rejection`: 해석 실패 원인. 명령·출력 성공을 만들어 기록하지 않는다.

별도 writer가 최대 4096개 큐에서 batch 최대 256개를 SQLite WAL / synchronous=FULL로 commit한다. GUI의 DB 기록 수는 패킷 수가 아니라 raw/packet/rejection 전체 row 수다. 원시 프레임과 처리 결과는 순서대로 기록되지만 개별 batch 경계에서 두 row 사이에 중단될 수 있으므로 영구 row의 완전한 쌍을 보장하지 않는다.

60초마다 및 정상 종료 때 SQLite backup API로 `backups/`에 일관된 사본을 생성하고 integrity_check를 실행한다. 백업은 같은 디스크에 있으므로 디스크 고장 대비 복제는 별도 외부 저장장치에 수행한다. 자동 백업은 최근 3개만 보관하며 원본 세션 DB는 자동 삭제하지 않는다. 저장 용량 확보는 운용자가 관리한다.

실행 중인 WAL DB를 파일 하나만 단순 복사하지 않는다. 일관된 외부 사본은 다음처럼 만든다(실제 파일 경로로 치환).

```bash
python -E -s recorder.py data/real/SESSION.sqlite3 /media/USER/BACKUP/flight.sqlite3
```

대상 파일이 이미 있으면 덮어쓰지 않는다. Ctrl+C 정상 종료는 수신 스레드 종료 → 큐 배출 → 최종 commit → 백업 순서다. 강제 종료·정전 시 아직 큐에 있던 데이터는 유실될 수 있다. 기록/백업 오류와 큐 누락은 UI에 표시한다. `clean_shutdown=0`이면 정상 종료 여부를 확인해야 한다. 자동 GUI 재생·CSV 내보내기·손상 DB 복구는 아직 구현하지 않았다.

근거: [SQLite Online Backup API](https://www.sqlite.org/backup.html), [SQLite WAL](https://www.sqlite.org/wal.html). 실제 PCB/무선 링크에서의 기록 부하·전원 차단 검증은 후속 실물 시험이다.

### 검증

```bash
python -E -s -m unittest discover -s tests -v
```

수신/상태 테스트에 더해 원본·거부·중복 저장, 종료 flush, backup row 수와 integrity_check, 디스크 오류, 큐 초과, 선택 필드 누락·범위를 검증한다. 브라우저에서는 전개 전/중/후, REAL 전개 미보고, WebGL 오류 대응, 작은 화면, DB 상태 표시를 확인한다.

## 2026-11-19 추가 수정: 날개형 메인 / 제어 텔레메트리

이 절은 위의 원형 메인 1.3m 표시 설명을 대체한다. 사용자가 제공한 [사진](https://images-na.ssl-images-amazon.com/images/I/61uHHe8CnZL.jpg)의 붉은 앞전·검은 띠·흰 날개·셀과 브라이들 형상을 참고해 메인 캐노피를 날개형으로 변경했다. ORK의 원형 parachute 파라미터 `diameter=1.3`을 날개 폭으로 해석하지 않는다. **실제 펼친 폭·chord·셀 수·줄 길이와 연결 위치는 미확정**이다. `parafoil.js`의 폭 2.05, chord 0.67, 셀 12개는 렌더링을 위한 임의 비율로 실물 제원이나 제작 도면이 아니다. 확인된 기체 치수와 구분한다. 드로그는 기존 ORK 원형 임시 표현을 유지한다.

날개형 캐노피의 자세는 별도 센서 보고가 없으므로 실제 기체 IMU 자세를 그대로 적용하지 않는다. 서보 명령을 캐노피의 실제 변형·선회로 변환하는 물리 시뮬레이션도 하지 않는다. 제어 상태는 아래 readback 패널에서 확인한다. 재설계한 반투명 패널의 흐림 효과는 CSS backdrop-filter이며 외부 이미지·웹폰트에 의존하지 않는다.

### controller 개발 패킷 (수신 전용)

기존 DEV_JSONL_1 패킷에 선택 객체 `controller`를 추가한다. 최종 RF 이진 패킷 ID/단위 배율/주기 확정은 별도 작업이다. 탑재 담당이 같은 의미의 필드를 송신해야 실물에서 표시된다. 탑재 제어기 코드는 이번 변경에 포함하지 않았다.

```json
{
  "controller": {
    "sample_time_ms": 45000,
    "status": "ACTIVE",
    "input_source": "AUTO",
    "target_heading_deg": 37.0,
    "heading_deg": 46.2,
    "heading_error_deg": -9.2,
    "turn_command": -0.26,
    "left": {"command_deg": 80.8, "actual_deg": null, "pwm_us": 1421},
    "right": {"command_deg": 99.2, "actual_deg": null, "pwm_us": 1579}
  }
}
```

| 필드 | 개발 계약 |
| --- | --- |
| sample_time_ms | 필수 정수. 현재 boot의 기기 단조 시각(ms). 패킷 source_time_ms 이하. GCS 나이 = 패킷 나이 + 패킷 시각 − 제어 샘플 시각 |
| status | 필수 UNKNOWN / IDLE / ACTIVE / INHIBITED / FAULT. ACTIVE만으로 실제 출력 작동을 입증하지 않음 |
| input_source | 필수 UNKNOWN / NONE / AUTO / ELRS. 탑재가 보고하는 현재 제어 입력 출처 |
| target_heading_deg / heading_deg | 선택 숫자 또는 null, 0~360°. 진북 기준 시계방향 기수방위. GPS course와 혼용하지 않음. 센서 기준은 탑재 담당과 통합 시 일치 확인 |
| heading_error_deg | 선택 숫자 또는 null, −180~180°. 탑재가 계산한 목표−현재의 최단 각도 오차. GCS가 임의 재계산하지 않음 |
| turn_command | 선택 숫자 또는 null, −1~1. 이번 개발 계약은 음수=좌/양수=우의 선회 명령. PWM 및 실제 선회율이 아님 |
| left/right.command_deg | 선택 숫자 또는 null, 개발 범위 0~180°의 서보 명령각. 실제 기구 허용각·중립·방향·캘리브레이션은 별도 확정 |
| left/right.actual_deg | 선택 숫자 또는 null. 별도 피드백 센서 등으로 측정한 실제 각도만 기입. 명령 echo를 넣지 않음 |
| left/right.pwm_us | 선택 숫자 또는 null, 개발 범위 0~3000μs의 보고된 펄스폭 명령. 이 범위는 기구 운용 허용 범위를 의미하지 않음 |

controller 또는 개별 출력이 누락되면 미수신/미제공을 표시한다. command와 actual은 막대와 세로선으로 구별하며, 실제 피드백이 없으면 세로선을 숨긴다. 제어 샘플은 패킷이 계속 들어와도 1초 이상 오래되면 갱신 지연으로 별도 표시한다(1초는 개발용 임계값). controller는 기존 packet 기록과 함께 SQLite에 저장되므로 별도 DB schema migration 없이 보존된다.

SIM은 34~100초에 ACTIVE/AUTO와 합성 선회·서보 명령을 생성하며 actual_deg는 null을 유지한다. 이는 실제 제어기 성능·서보 이동·캐노피 변형의 검증이 아니다.

읽는 순서: protocol.py(검증) → state_store.py(저장) → static/js/app.js(renderController, freshness) → templates/index.html(표시) → recorder.py(원본/패킷 보존). 3D는 rocket_scene.js에서 parafoil.js를 불러오는 별도 표시 계층이다.
