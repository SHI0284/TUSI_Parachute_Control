# TUSI Parachute Control

**투지 낙하산 제어 시스템** — 로켓의 비행 상태를 판단하고 낙하산 회수·조향을 제어하기 위한 ESP32 기반 프로젝트입니다. 탑재 비행 컴퓨터, 지상국 중계기, PC 지상국, 수동 조종 송신기를 함께 개발합니다.

현재는 하드웨어와 독립적인 비행 판단 로직을 구현하는 초기 단계입니다. 아래 진행 상태는 **2026-11-03 코드 기준**이며, 개발 일정은 팀 일정과 하드웨어 준비 상황에 맞춰 조정할 초안입니다.

## 현재 개발 상태

| 항목 | 상태 | 구현 내용 |
| --- | --- | --- |
| 개발 환경 | 구성됨 | ESP32 / Arduino / PlatformIO, 시리얼 모니터 115200 baud |
| 보드 핀 설정 | 일부 구현 | `board_config.h`에 핀 정의 및 일부 중복 검사 |
| 비행 상태·제어 모드 | 정의됨 | `FlightState`, `ControlMode` 열거형 |
| 초기 상태머신 | 구현됨 | `INIT → SAFE/FAULT`, `SAFE ↔ ARMED`, 허용되지 않는 요청 거절 |
| 발사 감지 | 단독 구현 | 가속도 기준과 유지 시간 검사, 무효 샘플·시간 중복·샘플 단절 처리 |
| PC 단위 테스트 | 작성됨 | 상태머신 11개, 발사 감지 10개 검사 |
| ESP32 진입점 | 데모 | `setup()`에서 초기화 상태 전이 검사 결과 출력 |
| 지상국 중계기 | 설정만 준비 | PlatformIO 설정 존재, `src/main.cpp`는 비어 있음 |
| 센서·통신·조향·기록 | 예정 | 드라이버, 태스크, 지상국 UI 및 실제 출력 통합 필요 |

발사 감지기는 아직 상태머신이나 ESP32 실행 루프에 연결되지 않았습니다. `LAUNCH` 이후 상태는 이름만 정의돼 있으며 전이 로직은 구현 전입니다. PC 테스트의 임계값은 시험용 값입니다.

## 개발 구조

### 폴더별 역할

```text
TUSI_Parachute_Control/
├── avionics/                       # 로켓 탑재 ESP32 펌웨어
│   ├── include/board_config.h      # 핀·보드 설정
│   ├── lib/FlightCore/src/         # 하드웨어 독립 비행 판단 로직
│   │   ├── flight_types.h          # 비행 상태와 제어 모드
│   │   ├── flight_fsm.h/.cpp       # 상태 전이 및 요청 검증
│   │   └── launch_detector.h/.cpp  # 발사 감지
│   ├── src/main.cpp               # ESP32 실행 진입점
│   ├── test/native_fsm/           # PC 상태머신 테스트
│   ├── test/native_launch/        # PC 발사 감지 테스트
│   └── platformio.ini             # ESP32 빌드 설정
├── ground_bridge/                 # E22 ↔ PC 중계 펌웨어, 설정만 준비
├── ground_station/                # PC 표시·명령·로그·재생, 예정
├── transmitter/                   # 조이스틱·ELRS 수동 조종, 예정
├── shared/                        # 공통 메시지·프로토콜, 예정
├── test_data/                     # 합성 궤적·재생 입력, 예정
└── output/documents/              # 아키텍처 및 요구사항 문서
```

`ground_station`, `transmitter`, `shared`, `test_data`는 로컬에 빈 폴더만 준비된 상태입니다. Git은 빈 폴더를 추적하지 않으므로 GitHub에는 구현 파일이 추가될 때 표시됩니다.

### 시스템 간 역할과 통신 계획

- **탑재 ESP32:** 센서를 읽고 비행 상태, 제어 모드, 출력 요청을 판단합니다. PC 연결 여부와 독립적으로 동작하도록 개발합니다.
- **지상국 중계기:** E22 데이터 링크와 PC 시리얼 연결 사이에서 메시지를 전달합니다.
- **PC 지상국:** 상태·위치·그래프 표시, 운용 명령, 로그 저장과 재생을 담당합니다.
- **수동 송신기:** 조이스틱 입력을 ELRS 링크로 전달합니다. 송신 펌웨어 통합 방식은 결정이 필요합니다.

계획된 데이터 흐름은 `센서 → 탑재 ESP32 → E22 → 지상국 중계기 → PC`입니다. 지상국 명령은 반대 방향으로 전달하며, 수동 입력은 `조이스틱 → ELRS → 탑재 ESP32` 경로를 사용합니다.

### 펌웨어 내부 설계 방향

`FlightCore`는 Arduino나 실제 센서에 의존하지 않는 C++ 판단 코드로 유지합니다. PC 테스트와 실제 보드가 같은 로직을 사용하고, 장치 접근 코드는 별도 드라이버로 연결합니다.

| 계획 모듈 | 책임 |
| --- | --- |
| `SensorTask` | 센서 수집, 측정 시각·단위·유효성을 포함한 입력 전달 |
| `FlightTask` | 상태머신, 추정·유도, AUTO/MANUAL 중재, 출력 변경의 단일 담당 |
| `LinkTask` | E22·ELRS 입력 처리, 명령 검증 경로 연결, 상태 송신 |
| `LogTask` | 상태·이벤트·측정 기록 |

이 태스크 구조는 설계안이며 아직 구현되지 않았습니다. 통신으로 받은 명령도 비행 판단 경로를 거쳐 실행하도록 구성합니다.

계획된 정상 비행 순서는 다음과 같습니다. 현재 구현 범위는 초기화와 ARM/DISARM까지입니다.

```text
INIT → SAFE → ARMED → LAUNCH → COAST → APOGEE → DEPLOY
     → STABILIZATION → GUIDED_DESCENT → FINAL_DESCENT → GROUND
```

초기화 실패는 `FAULT`로 처리합니다. 이후 상태별 오류 처리와 전이 조건은 추가 정의가 필요합니다.

## 앞으로의 개발 일정

**다음 개발 착수일을 1주차로 잡은 8주 계획 초안**입니다. 확정 마감일이나 비행 시험 일정이 아니며, 앞 단계의 완료 조건과 장비 준비 여부에 따라 조정합니다.

| 기간 | 개발 목표 | 완료 조건 |
| --- | --- | --- |
| 1주차 | 공통 데이터·시간·단위 정의, 상태 전환표와 명령 허용표 정리, 발사 감지와 FSM 연결 | 허용·금지 전이 및 반복 이벤트 PC 테스트 통과 |
| 2주차 | FreeRTOS 태스크·큐 기본 구조, 센서 모의 입력과 재생 데이터 준비 | 동일 입력의 결과 재현, 태스크·큐 예제 빌드 및 보드 확보 시 실행 확인 |
| 3주차 | 고도·수직속도 추정과 최고점 예측을 관측 모드로 구현 | 합성 궤적·잡음·누락 입력에 대한 오차와 무효 판정 기록 |
| 4주차 | 공통 패킷 형식, E22 중계, 명령 ID·응답 처리 | 분할·손상·중복·지연 패킷 시험 통과 |
| 5주차 | PC 지상국 상태 표시·그래프·로그·재생 | 수신 중단 표시, 기록 재현, 재생 중 실제 명령 송신 차단 확인 |
| 6주차 | AUTO/MANUAL 중재, 조향 로직과 출력 모의, 송신기 입력 연동 | 모드 전환·링크 손실·출력 제한 시험 통과 |
| 7주차 | 실제 센서·UART·출력 드라이버와 RTOS 통합 | 배선·센서 값·더미 출력 확인, 실행 시간·큐 포화·전원 재시작 시험 기록 |
| 8주차 | 전체 시나리오 재생, 보드 통합 시험, 미해결 항목 정리 | 코드·설정·입력 데이터·관측 결과가 연결된 통합 시험 보고서 작성 |

가장 먼저 할 작업은 **발사 감지 결과를 `ARMED → LAUNCH` 전이에 연결하고, 다른 상태에서는 전이가 일어나지 않는지 테스트하는 것**입니다.

통합 전에 결정할 사항은 다음과 같습니다.

- GNSS·E22·ELRS 및 디버그용 UART 배정과 GPS 송신 배선
- 센서 모델·장착 축·유효 범위와 실측 기반 비행 판단 임계값
- ARM 및 긴급 요청 허용 조건, 센서·통신 손실 시 동작
- 전개·착륙다리·서보의 인터페이스와 완료 확인 방법
- ELRS 송신기 통합 방식, 저장 매체와 비행 중 재부팅 정책

## 빌드와 테스트

아래 명령은 저장소 최상위 폴더에서 실행합니다. ESP32 빌드는 PlatformIO, PC 테스트는 C++11 이상을 지원하는 `g++`가 필요합니다.

### ESP32 펌웨어 빌드

```bash
pio run -d avionics -e esp32dev
```

보드를 연결한 뒤 업로드와 시리얼 모니터를 실행합니다.

```bash
pio run -d avionics -e esp32dev -t upload
pio device monitor -b 115200
```

### PC 단위 테스트

현재 PlatformIO에는 `native` 환경이 없으므로 기존 테스트를 직접 컴파일합니다.

```bash
mkdir -p /tmp/tusi-tests

g++ -std=c++11 -Wall -Wextra -pedantic \
  -I avionics/lib/FlightCore/src \
  avionics/test/native_fsm/main.cpp \
  avionics/lib/FlightCore/src/flight_fsm.cpp \
  -o /tmp/tusi-tests/native_fsm
/tmp/tusi-tests/native_fsm

g++ -std=c++11 -Wall -Wextra -pedantic \
  -I avionics/lib/FlightCore/src \
  avionics/test/native_launch/main.cpp \
  avionics/lib/FlightCore/src/launch_detector.cpp \
  -o /tmp/tusi-tests/native_launch
/tmp/tusi-tests/native_launch
```

각 테스트의 마지막 출력이 `Failures: 0`이면 해당 검사들이 통과한 것입니다. 이 결과는 실제 센서·무선 통신·낙하산 구동 성능을 검증한 결과와 구분합니다.

## 설계 문서

- [소프트웨어 아키텍처 및 요구사항 v0.1 (PDF)](output/documents/TUSI_소프트웨어_아키텍처_요구사항_v0.1.pdf)
- [소프트웨어 아키텍처 및 요구사항 v0.1 (Word)](output/documents/TUSI_소프트웨어_아키텍처_요구사항_v0.1.docx)

설계 문서는 목표 구조와 요구사항의 초안입니다. 현재 구현 상태는 실제 코드와 이 README의 개발 현황을 기준으로 확인합니다.
