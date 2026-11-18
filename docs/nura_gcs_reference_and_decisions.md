# NURA 지상국 검토 및 TUSI 구현 결정

검토일: 2026-11-11. 대상: `/home/seohyein/GCS`의 현재 로컬 소스. 방법: 정적 소스 검토. 앱 실행·PCB 연결·RF 시험은 수행하지 않았으며 이 기록은 NURA의 실제 운용 성능을 보증하지 않는다. NURA 파일은 변경하지 않았다.

## 1. 결정

TUSI PC 지상국은 Ubuntu 로컬 웹 앱으로 개발한다. Flask·pyserial 백엔드와 일반 JavaScript 화면, 로컬 Chart.js·Leaflet 자산을 사용한다. NURA의 화면 배치, 백그라운드 수신, 명령 결과 구분, 진단 항목을 참고한다. TUSI 미션·FSM·무선 규격은 현재 요구사항과 ICD를 따른다.

근거 문서: [요구사항 v0.4 §20](ground_system_requirements_v0.4.md), [ICD v0.2 §18](communication_interface_v0.2.md). 본 결정은 PC 구현 구조를 확정한다. 무선 timing·revision 2 schema·탑재 명령 허용 정책·ELRS 송신 호환성은 별도 결정 항목으로 남는다.

## 2. 소스별 근거와 적용

| 확인한 소스 | 확인 내용 | TUSI 적용 |
| --- | --- | --- |
| `/home/seohyein/GCS/README.md`, `requirements-web.txt` | 주 화면 mission_control.html, 서버 app.py; desktop.py는 보조 PyQt 화면 | 웹 앱을 기준으로 채택 |
| `app.py:831` HardwareTelemetryReader | 웹 조회와 별개인 하드웨어 수신 스레드 | 단일 serial 소유자·상태 저장소 구조 채택 |
| `app.py:916` telemetry/next | 실물은 최신 캐시 조회, 모의는 GET에서 데이터 전진 | 모의도 독립 시계로 수정 설계; GET은 읽기 전용 |
| `app.py:930` telemetry/reset | 화면/로그 초기화 경로에서 uplink reset_fsm 호출 가능 | 화면 초기화와 탑재 제어를 분리 |
| `app.py:1080` flight/arm | 확인 입력, 상태 검증, 실행 결과 확인; HTTP 처리에서 결과 대기 | 검증·결과 구분 참고, 비동기 operation 서비스로 설계 |
| `app.py:86` avionics_downlink_only | 인접 탑재 소스 및 환경 설정으로 기능 판단 | 장치 handshake의 실제 기능·버전 보고를 기준으로 판단 |
| `app.py` HardwareTelemetryLogger | 원본 payload·수신 시각·측정·진단 CSV 기록 | 원본 이벤트 JSONL을 기준으로 보관하고 CSV는 내보내기 |
| `mission_control.html:1232` | 고정 LAUNCH_SITE | 미션 설정으로 분리, 실제 발사 위치와 적용 목표 각각 표시 |
| `mission_control.html:2205` getPhase | 미지 실물 상태의 기본값, 모의 고도·시간 기반 단계 추정 | 미지 상태 UNKNOWN, 실제 상태는 탑재 보고만 사용 |
| `mission_control.html:2222` setPhaseUI | 현재 단계보다 작은 번호를 완료로 표시 | 수신된 전이 이벤트 기반 방문·반복·누락 이력 표시 |
| `mission_control.html`, `tools/prepare_web_assets.py` | Chart.js·Leaflet 로컬 자산 준비, 지도 타일은 외부 URL | 오프라인 평면 위치 화면 필수; 라이브러리 로컬화만으로 오프라인 지도를 보장하지 않음 |
| `protocol.py`, `uplink.py` | NURA V2 Lite 프레임 및 자체 명령·재시도 방식 | MAVLink2 TUSI 어댑터를 별도 구현. NURA wire·키·재시도 코드 복제 금지 |
| `firmware/lora_serial_bridge/`, `run_ground_station.sh` | NURA 브리지 구성 및 빌드·업로드가 포함된 시작 절차 | ESP32/E22 회로용 드라이버 별도 작성, 앱 실행과 업로드 분리 |
| `test_mission_control_contract.py` | 반복 snapshot, 로컬 자산, 연결 시 reset 방지 관련 검사 | 시험 의도를 TUSI 계약에 맞게 재작성 |

위 파일·행은 검토 시점 기준이며 소스 변경 시 이동할 수 있다. NURA LICENSE는 Apache-2.0이다. 실제 코드·자산을 복사하는 단계에서는 해당 파일의 라이선스·고지와 제3자 자산 조건을 함께 보존한다. 이번 작업은 설계 참고이며 코드 이식은 수행하지 않았다.

## 3. 미션 차이

NURA 상태 번호는 6 DROGUE, 7 DEPLOY, 8 GROUND, 9 FAULT이다. TUSI는 6 DEPLOY, 7 STABILIZATION, 8 GUIDED_DESCENT, 9 FINAL_DESCENT, 10 GROUND, 11 FAULT를 사용한다. 번호를 그대로 재사용하면 유도 하강을 착륙으로 표시하는 등의 오류가 생긴다. 상태 이름뿐 아니라 원시 코드·스키마 버전을 함께 확인한다.

TUSI의 중심은 약 400m 발사 지면 상대고도 비행 후 목표지점으로 유도 하강하는 미션이다. GUI에는 목표 readback, course/heading 구분, 조향·AUTO/MANUAL 상태, E22와 ELRS 각각의 상태, 착륙 후 위치 회수가 추가되어야 한다. NURA의 임의 궤적 예측이나 강제 상태 표시를 실제 유도 결과로 사용하지 않는다.

## 4. 개발 파일 배치 기준

아래는 앞으로 만들 구조이며 현재 구현 완료 목록이 아니다.

```text
ground_station/
  app.py                 # 서버 조립·실행
  api/                   # 읽기 전용 조회 및 비동기 명령 접수
  services/              # 세션 상태, 명령 수명주기, 기록, 재생
  transports/            # USB·모의·재생 입력, 단일 serial 소유자
  protocol/              # 생성 MAVLink 코드 연동·의미 변환
  static/                # 화면 JS/CSS, 로컬 vendor 자산
  templates/             # 미션·진단·기록 화면
  tests/                 # 모델·API·파서·명령·재생 시험
shared/protocol/          # 탑재와 공통인 schema·시험 벡터
ground_bridge/            # 실제 ESP32/E22 중계 펌웨어
transmitter/              # ELRS 조종기 구현
test_data/                # 결정적인 정상·오류 입력
```

첫 구현은 화면용 정규화 모델과 모의 세션, 다음은 미션 화면·FSM 이력·기록/재생, 이후 규격 동결된 파서·명령 서비스·실제 브리지 순서로 진행한다. 모의 입력과 실물 입력은 같은 서비스 경계를 사용한다. 전송 규격이 미완성인 동안 논리 fixture 성공을 실제 무선 연동 성공으로 표시하지 않는다.
