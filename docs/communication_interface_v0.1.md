# TUSI 로켓–지상국 통신 인터페이스 명세서

> 이전 버전 보관본. 현재 미션 설계 기준은 [v0.2](communication_interface_v0.2.md)이다. 순수 poll 운용은 폐기되었으며 이 문서의 XML·CRC·시험 결과는 revision 1에만 유효하다. revision 2 wire 스키마는 아직 동결되지 않았다.

| 항목 | 내용 |
| --- | --- |
| 문서 ID / 버전 | TUSI-ICD-001 / 0.1 |
| 작성·자료 조회일 | 2026-11-11 |
| 상태 | 구현용 제안 초안; 탑재 담당 검토 및 RF 실측 전 |
| 요구사항 기준 | [지상 시스템 요구사항 v0.3](ground_system_requirements_v0.3.md) |
| 메시지 원본 | [tusi.xml](../shared/protocol/tusi.xml) |
| 적용 | Ubuntu PC ↔ 지상 ESP32/E22 ↔ 로켓 E22/ESP32 |
| 별도 경로 | ELRS 조종기 ↔ RP1 ↔ 탑재 소프트웨어; 제12절 참조 |

## 1. 근거를 사용하는 방법

본 문서에서 **표준 사실**은 공식 문서·원저자 자료로 확인한 사항이다. **TUSI 설계 결정**은 그 사실과 프로젝트 요구사항을 바탕으로 제안한 선택이다. 표준이 TUSI의 상태 전이·주기·명령 허용 정책까지 보장하는 것은 아니다.

지상 시스템 개발 담당은 본 초안과 XML을 배포하고, 탑재 소프트웨어 개발 담당은 메시지 생성·해석·명령 처리 및 제공 가능한 데이터를 검토한다. 비행 임계값과 제어 판단은 본 명세에서 정의하지 않는다.

## 2. 조사 결과와 프로토콜 선택

| 후보 | 장점 | 부담 / 판단 |
| --- | --- | --- |
| JSON + 줄바꿈 | 사람이 바로 읽기 쉬움 | RF 바이트 비용·숫자와 필드명 크기 증가. 로그 내보내기에 적합 |
| 자체 binary + COBS + CRC + HMAC | 경계·크기·인증을 직접 통제 | 파서·인증·재전송·호환성 시험 전체를 직접 유지해야 함 |
| MAVLink 2 + TUSI dialect | 기존 C/Python 생성기, CRC·서명·파서 사용 | dialect 배포와 서명 상태 관리 필요. 본 초안의 선택 |

COBS는 예약 구분자가 payload에 나타나지 않도록 인코딩하고 확장 크기를 제한하는 방법이다. 조사했지만 MAVLink와 중복으로 적용하지 않는다. [S7]

MAVLink는 little-endian 필드 직렬화, 메시지 식별자, 프레임 순번, CRC 및 선택적 서명을 정의한다. TUSI는 이 외부 프레임을 재사용한다. 자체 magic/CRC/HMAC을 추가하지 않는다. [S2][S4]

**선택은 MAVLink 2 wire format을 사용하는 TUSI 전용 dialect이다.** 일반 QGroundControl 화면이나 표준 MAVLink 명령 서비스와 자동 호환된다는 뜻은 아니다. NURA의 자체 프레임과도 wire 호환되지 않는다. 초기 전용 지상국 범위에서 유지보수 가능한 선택이며, 범용 지상국 연동이 필수가 되면 common 메시지 채택을 재검토한다.

MAVLink 기본 명령 서비스의 요청·응답 구분은 참고하되, TUSI는 로켓 부팅 ID·GCS 세션·요청 ID·일회성 허가를 명시하기 위해 전용 명령 메시지를 사용한다. 표준 서비스의 자동 재시도 규칙을 그대로 상속하지 않는다. [S3]

## 3. E22의 역할과 실물 확인 항목

제조사 작성 E22-400T22S 매뉴얼의 공개 사본은 UART 인터페이스, 정상 투명 전송 모드 및 32/64/128/240-byte subpacket을 기술한다. AUX high는 상대방 수신·명령 실행 확인이 아니며 마지막 무선 패킷이 아직 전송 중일 수 있다. [S1]

따라서:
- E22는 애플리케이션 메시지의 의미를 모르는 전송 장치로 취급한다.
- UART read 한 번을 MAVLink 패킷 하나로 가정하지 않는다.
- AUX를 애플리케이션 ACK로 사용하지 않는다.
- E22 설정은 운용 시작 전 완료하고 실제 설정 읽기 결과를 기록한다.
- 초기 제안은 정상 투명 모드, fixed transmission 비활성, RSSI byte append 비활성이다. 부가 바이트가 MAVLink stream에 섞이지 않도록 한다.
- UART 115200/8N1, air rate 9.6 kbps, subpacket 240은 **벤치 시험 제안값**이다. 보유 모듈 펌웨어 지원과 레지스터를 확인하기 전 확정값이 아니다.
- 주파수·채널·출력·주소·NETID는 실제 운용 설정표에서 양쪽 일치를 확인한다. 본 문서가 특정 주파수 운용을 승인하지 않는다.

조사한 매뉴얼은 과거 제조사 문서의 외부 공개 사본이다. E22와 E220, T(UART)와 M(SPI) 모델을 혼동하지 않는다. 보유 모듈의 인쇄 모델·펌웨어·레지스터를 대조하기 전 레지스터 바이트를 코드에 고정하지 않는다.

## 4. 프레임, 식별자 및 호환성

### 4.1 MAVLink 2 프레임

`0xFD | len | incompat_flags | compat_flags | seq | sysid | compid | msgid(3) | payload | CRC(2) | signature(13)`

- 서명 없는 overhead는 12 bytes, 서명 포함은 25 bytes이다.
- CRC는 MAVLink CRC-16/MCRF4XX와 메시지별 CRC_EXTRA를 생성 라이브러리가 처리한다.
- base 필드는 타입 크기 순으로 재배치된다. C++ struct 메모리 복사를 송신하지 않는다.
- MAVLink 2 trailing-zero 절단 때문에 실제 payload 길이는 표의 최대 길이보다 작을 수 있다. 생성 라이브러리로 복원한다. [S2]

### 4.2 TUSI 식별 정책 — 프로젝트 결정

| 항목 | 값 |
| --- | --- |
| 로켓 sysid / compid | 1 / 1 |
| GCS sysid / compid | 255 / 190 |
| 로컬 브리지 sysid / compid | 254 / 191 |
| GCS signing link ID / 로켓 link ID | 1 / 2 |
| ICD revision | 1 |
| 전용 메시지 ID | 60000~60013 |

ID는 이 프로젝트의 닫힌 dialect에 대한 배정이며 전역 MAVLink 등록 번호라는 주장이 아니다. 다른 dialect를 합칠 경우 충돌 검사부터 수행한다. 여러 로켓 운용과 broadcast 제어는 v0.1 범위에서 제외한다.

XML에는 common.xml을 포함하지 않는다. HEARTBEAT 대신 STATUS poll을 연결·상태 확인 수단으로 사용한다. 표준 heartbeat 서비스 자동 발견은 지원하지 않는다. heartbeat와 계측값의 최신성은 개념적으로 분리해야 한다는 점은 공식 문서를 참고한다. [S6]

송신자·대상·방향 allowlist를 검사한다. RF에서 들어온 BRIDGE_STATUS는 거부한다. 알 수 없는 메시지는 상태·명령에 영향을 주지 않고 진단 통계만 갱신한다. revision 불일치 시 제어를 차단한다.

### 4.3 XML 및 배포

메시지 필드 정의의 원본은 tusi.xml이며 C/Python 바인딩은 같은 원본에서 생성한다. 표의 offset은 생성기 정렬 규칙을 반영한 wire offset이다. CRC_EXTRA는 실제 pymavlink 2.4.50 생성 결과다. XML 스키마와 생성 도구 버전을 함께 보관한다. [S5]

base 필드 이름·타입·순서·의미 변경은 호환성 변경이다. 본 revision에서는 extension 필드를 사용하지 않는다. 변경 시 revision 증가 및 양쪽 재생성을 수행한다. 단위 의미만 변경하는 경우 CRC가 이를 잡아주지 않을 수 있으므로 revision을 생략하지 않는다.

## 5. 메시지 역할

| ID | 메시지 | 방향 / 목적 |
| --- | --- | --- |
| 60000/60001 | HELLO / HELLO_REPLY | GCS 발견 요청 / 로켓 ID·부팅·지원 상태 확인 |
| 60009 | POLL | GCS가 한 종류의 최신 정보 또는 특정 이력 요청 |
| 60002 | STATUS | 상태머신·고도·속도·전압 snapshot |
| 60003 | GPS | 좌표·fix·유효성 |
| 60004 | STATE_EVENT | 실제 상태 전이 1건 |
| 60005/60006 | PREPARE / CHALLENGE | 상태 변경 요청 준비 및 일회성 허가 |
| 60007/60008 | COMMIT / COMMAND_RESULT | 요청 제출 및 탑재 판단 결과 |
| 60010 | POLL_ERROR | 이벤트 없음·지원 안 함 등 조회 오류 |
| 60011 | CONTROL | ELRS 입력 유효성·서보 명령·제어 모드 |
| 60012 | GUARDS | 전이 조건의 known/satisfied 표시 |
| 60013 | BRIDGE_STATUS | USB 전용 브리지 상태, RF 전달 금지 |

## 6. 단위, 유효성 및 코드 사전

정수는 부호 없는 uint 또는 2의 보수 int이다. 모든 다중 바이트는 little-endian. 시간은 uint64 milliseconds로 부팅부터 단조 증가하며 UTC가 아니다. 로켓·GCS·브리지 시계를 직접 빼지 않는다.

### 6.1 상태 및 전이

`0 INIT, 1 SAFE, 2 ARMED, 3 LAUNCH, 4 COAST, 5 APOGEE, 6 DEPLOY, 7 STABILIZATION, 8 GUIDED_DESCENT, 9 FINAL_DESCENT, 10 GROUND, 11 FAULT, 255 UNKNOWN`.

현재 flight_types.h와 이름을 대조했다. 명시적 변환 함수를 사용하고 enum 메모리를 송신하지 않는다. supported_states의 bit n은 코드 n 지원 여부이다. 상태명이 존재하는 것과 해당 전이 구현이 완료된 것은 다르다.

전이 reason: 0 UNSPECIFIED, 1 INIT_OK, 2 INIT_FAILED, 3 ARM_APPLIED, 4 DISARM_APPLIED, 5 LAUNCH_DETECTED, 6 FLIGHT_RULE, 7 FAULT_REPORTED. 향후 세부 비행 규칙은 새로운 사유 코드로 추가한다. 이 코드는 어떤 전이도 자동 허용하지 않는다.

event_id는 부팅별 1부터 증가, 0은 이벤트 없음이다. 로켓은 최근 64건을 RAM에 보존하는 것을 초안 기준으로 한다. STATUS.last_event_id로 누락을 발견하고 POLL(selector=2,item_id=event_id)로 순서대로 조회한다. 보존 범위 밖이면 POLL_ERROR와 oldest/latest를 반환한다. 없는 이력을 지상국에서 생성하지 않는다.

### 6.2 STATUS validity

valid_flags: bit0 altitude, bit1 vertical_speed, bit2 state_entry, bit3 pyro_mv, bit4 leg_mv, bit5 health_flags. 예약 bit는 송신 0, 수신은 알려진 bit만 사용한다. 무효 필드는 wire 값 0으로 보내되 GUI는 미제공/무효로 표시한다.

health_flags: bit0 barometer_ok, bit1 imu_ok, bit2 gps_receiver_ok, bit3 rc_input_fresh. GPS receiver 정상과 위치 fix는 다르다. health 정보 전체가 미제공이면 validity bit5=0이다.

altitude_mm는 발사 지면 기준이며 지상국이 다시 영점 보정하지 않는다. GPS altitude_msl_mm와 섞지 않는다. pyro_mv/leg_mv는 환산 완료한 해당 감지 지점 전압이며 잔량·전개 성공을 의미하지 않는다.

### 6.3 명령 및 결과

command: 1 ARM, 2 DISARM. 기타 값은 거부한다. 탑재 상태 변경은 탑재 담당의 guard를 통과해야 한다.

COMMAND_RESULT.result: 0 APPLIED(상태 변경 완료), 1 REJECTED, 2 PENDING(처리 예약됨), 3 UNKNOWN(결과 보존 안 됨). CHALLENGE.result는 별도 enum이며 0 READY, 1 REJECTED이다. READY는 ARM 성공이 아니다.

reason: 0 NONE, 1 BAD_REVISION, 2 BAD_BOOT, 3 BAD_STATE, 4 NOT_READY, 5 EXPIRED, 6 BAD_TOKEN, 7 BUSY, 8 UNSUPPORTED, 9 NOT_FOUND, 10 EVENT_GAP, 11 INTERNAL, 12 STATE_CHANGED, 13 REQUEST_CONFLICT.

인증 실패에는 명령 결과를 보내지 않고 drop·로컬 집계한다. 세션/대상 불일치도 실행 경로에 전달하지 않는다.

### 6.4 GUARDS

rules_revision=1: bit0 initialization_ok, bit1 arm_ready, bit2 disarm_allowed, bit3 rc_input_fresh. 비행 단계 조건은 별도 revision으로 확장한다. known_mask에 없는 조건은 알 수 없음, known=1/satisfied=0은 미충족이다. satisfied_mask는 known_mask의 부분집합이어야 한다.

candidate_state는 탑재 측이 보고한 다음 후보이며 255는 없음/미제공이다. 복수 후보·원시 관측값·상세 임계값은 현재 메시지에 포함하지 않는다. GUI는 이 정보를 추정해 채우지 않는다.

## 7. 연결 및 반이중 링크 운영 — TUSI 제안

초기 구현은 **GCS 주도 stop-and-wait poll**을 사용한다. 로켓은 유효한 요청 하나에 응답 프레임 하나를 보내며 주기적인 무요청 RF 송신은 하지 않는다. HELLO, POLL, PREPARE, COMMIT을 하나의 scheduler에서 직렬화한다. 이는 동시 송신 충돌을 줄이는 선택이며, GCS가 없을 때 RF downlink도 멈춘다는 tradeoff가 있다. 로켓의 비행 판단·기록은 계속 독립 실행한다.

1. GCS가 fresh gcs_session과 probe_nonce를 만들고 서명된 HELLO를 전송한다.
2. 로켓은 nonce/session을 echo하고 자신의 boot_id·revision·지원 상태를 반환한다.
3. GCS는 현재 probe와 일치하는 응답만 연결 확정에 사용한다.
4. 이후 boot_id를 명시한 POLL을 순차 전송한다. STATUS/GPS/EVENT/CONTROL/GUARDS 응답의 request_id는 poll의 request_id다.
5. RESULT 조회(selector=3)는 item_id가 원래 command request_id다. COMMAND_RESULT.request_id는 원래 command ID이며 poll ID가 아니다. 동시에 요청 하나만 진행하고 session+item_id로 연결한다.
6. 한 응답을 받거나 timeout·복구 대기가 끝난 뒤에만 다음 요청을 보낸다.

부팅 ID는 재부팅마다 바뀌어야 한다. 영속 증가 카운터 또는 검증된 엔트로피로 생성한 nonzero 64-bit 값을 사용하고 생성·저장 실패 시 상태 변경 명령을 비활성화한다. GCS session/probe/token도 재사용하지 않는 nonzero 64-bit 값이며 생성 방법을 배포 문서에 기록한다.

새 HELLO는 대기 중인 미사용 token을 무효화하지만 로켓 비행 상태를 변경하지 않는다. 이미 처리 중인 명령의 결과는 취소하지 않는다. 연결 갱신과 명령 적용은 탑재 측에서 동기화한다.

### 7.1 벤치 초기값 — 표준값 아님

| 설정 | 초기 제안 | 근거 / 검증 |
| --- | --- | --- |
| STATUS 목표 | 1 Hz | 학습·초기 모니터링 요구 |
| GPS/CONTROL/GUARDS 목표 | 각각 0.2 Hz | 느린 데이터 비용 제한 |
| 응답 대기 | 3 s | 초기 저속 링크 시험용, 실측 후 조정 |
| 응답 후 turnaround 여유 | 100 ms | 벤치 시작값, AUX만으로 RF 종료를 단정하지 않음 |
| stale 표시 | 마지막 STATUS 후 3 s | UI 정책, 비행 FAULT 조건 아님 |
| disconnected 표시 | 유효 로켓 응답 없음 10 s | UI 정책 |
| command token 유효기간 | 발급 후 로켓 시간 10 s | 조작 지연 제한; 실제 응답 시간 시험 필요 |
| 이벤트/result 보존 | 이벤트 64건, 최근 command 결과 32건 | 고정 메모리 사용; 넘치면 명시적 GAP/UNKNOWN |

목표 주기는 최대 송신 요구이지 강제 deadline이 아니다. 느린 링크에서는 outstanding 요청을 겹치지 않으며 오래된 periodic poll은 버리고 최신 poll을 예약한다. 우선순위는 command 결과·명령 진행 > STATUS > 이벤트 보충 > 기타 계측이다. 명령 burst로 STATUS가 장시간 굶지 않도록 실제 scheduler 시험을 수행한다.

timeout 뒤 늦은 응답은 request 식별자로 분리한다. 늦은 응답과 새 송신이 충돌할 가능성은 남아 있으므로 RF 실측으로 최대 응답 지연 및 재시도 대기값을 검증해야 한다. 영구 전달 보장이나 hard realtime 통신이라고 표현하지 않는다.

## 8. ARM/DISARM transaction

일회성 token은 **서명된 명령의 오래된 지연 전달**을 제한하기 위한 애플리케이션 계층 규칙이다. 인증 자체를 대체하지 않는다.

1. 최신 STATUS와 사용자 확인을 확보한다.
2. GCS가 새로운 request_id를 할당하고 PREPARE에 현재 boot_id/state/last_event_id를 넣는다.
3. 로켓은 서명·대상·세션·중복·상태를 검사한다. 허용 후보이면 command/session/request/state/event에 묶인 token과 로켓 기준 expires를 반환한다. 이 단계에서 상태를 바꾸지 않는다.
4. GCS는 matching CHALLENGE READY에 대해서만 COMMIT을 한 번 전송한다. 사용자 취소는 COMMIT을 보내지 않는 것으로 처리한다.
5. 탑재 단일 상태 소유자가 token 미사용·미만료·boot/session·command·request·expected state/event와 최신 guard를 다시 검사한다.
6. 검증과 token 소비, 상태 변경 예약을 원자적으로 수행한다. 완료 시 APPLIED, 거부 시 REJECTED를 기록한다. 즉시 완료가 어려우면 PENDING 후 RESULT 조회로 최종 확인한다.
7. 지상국은 상태 보고로 현재 상태를 확인한다. APPLIED의 state_after는 처리 시점이며 현재 상태를 강제로 덮어쓰지 않는다.

token은 여러 번 시도하여 다른 명령에 사용할 수 없다. 이미 소비된 request의 같은 COMMIT은 저장한 결과만 반환한다. 같은 ID로 다른 내용이 오면 REQUEST_CONFLICT. COMMIT 재전송을 GUI가 자동 수행하지 않는다. 응답 유실 후 RESULT 조회만 자동으로 수행할 수 있다.

탑재는 session 내 request_id high-water mark를 유지하여 결과 캐시에서 지워진 오래된 명령도 재실행하지 않는다. request_id는 1부터 증가하고 wrap 전에 새 session을 연다. 읽기 poll도 같은 할당기를 쓰지만 command high-water는 PREPARE 최초 처리 시 갱신한다. 거부된 PREPARE도 해당 ID를 소비한다. 결과 캐시가 없으면 UNKNOWN을 반환하며 실행하지 않는다. 새 boot_id에서는 과거 COMMIT이 BAD_BOOT로 거부된다.

토큰 발급 상태와 COMMIT 사이에 SAFE→ARMED→SAFE처럼 상태가 되돌아와도 event_id 변화로 거부한다. PREPARE 만료·응답 유실은 다시 확인한 뒤 새 ID로 시작한다. 명령은 exactly-once delivery가 아니라 **중복 실행 방지 + 결과 조회**를 목표로 한다.

## 9. 인증 및 파서 규칙

RF에서는 모든 TUSI 메시지에 MAVLink 2 signing을 요구한다. 무서명·잘못된 서명을 허용하는 callback은 사용하지 않는다. 모의시험도 공개된 시험 키로 같은 서명 경로를 통과시킨다.

공식 signing은 32-byte key, link ID, 48-bit timestamp와 6-byte signature를 사용한다. 이것은 HMAC-SHA256과 동일한 알고리즘이 아니며 임의로 교체하지 않는다. 암호화가 아니므로 데이터 내용은 숨기지 않는다. [S4]

송수신 서명 시각과 재생 방지 상태는 공식 라이브러리 정책을 따르고 영속 저장·복원한다. 시각 초기화 실패·키 미설정이면 명령을 활성화하지 않는다. cold boot, 오래된 서명, GCS 재시작을 반드시 시험한다. 응용 boot/session/token 검사는 라이브러리 검사를 보완한다. [S8]

브리지는 로켓/GCS 서명 key를 보관하거나 패킷을 재서명하지 않는다. 원본 프레임을 전달하고, 자신의 상태만 로컬 USB에 별도 compid로 보낸다. 로컬 BRIDGE_STATUS는 USB에서만 무서명 허용하며 이 예외를 RF 파서에 적용하지 않는다. 키는 인증된 유선 준비 절차로 배포하고 RF SETUP_SIGNING을 허용하지 않는다.

파싱 순서:
1. bounded MAVLink parser로 stream 조립.
2. CRC·지원 msgid·서명 검사.
3. source/target/revision/session/boot/request 검사.
4. 필드 범위·validity·semantic 검사.
5. snapshot/event 저장 또는 명령 요청 queue 전달.

일반 MAVLink signed max frame 280 bytes에 맞춘 parser buffer를 확보한다. 본 dialect 최대 frame은 75 bytes다. 알 수 없는 flags·길이 오류·CRC 오류·서명 오류는 로그 카운터로 구분한다. 프레임 내부에 0xFD가 들어있다고 파서를 수동 초기화하지 않는다.

8-bit MAVLink seq는 전송 stream의 누락 추정용일 뿐 command ID가 아니다. wrap·재시작·중복·다른 stream을 고려하며 정확한 패킷 손실률이라고 단정하지 않는다. 상태 최신성은 boot_id/time_boot_ms/event_id로 판정한다. RFC 1982는 wrap 순번 비교를 이해하기 위한 참고이며, 본 문서의 command ID에는 wrap을 허용하지 않는다. [S9]

## 10. 대역폭 계산과 한계

서명된 POLL 최대 27+25=52 bytes, STATUS 50+25=75 bytes. 한 STATUS 조회 왕복은 127 bytes다. GPS 왕복은 117, CONTROL은 111, GUARDS는 109 bytes다.

초기 목표의 계측 트래픽:
`127×1 + (117+111+109)×0.2 = 194.4 bytes/s`.
application bits는 `194.4×8 = 1555.2 bit/s`.

9.6 kbps 설정의 단순 비율은 약 16.2%이며, 2.4 kbps에서는 약 64.8%다. 이것은 PHY preamble·FEC·모듈 framing·turnaround·재시도·HELLO·이벤트·명령을 제외한 **하한 비용**이다. UART 8N1 직렬 비용은 byte당 10 bits이므로 같은 계측량은 1944 UART bit/s다.

고속 벤치 후보 STATUS 2 Hz, GPS/CONTROL/GUARDS 각 0.5 Hz는 422.5 bytes/s = 3380 application bit/s다. 2.4 kbps에는 overhead 이전부터 맞지 않는다. UART 115200이라는 이유로 무선도 같은 처리량이라고 가정하지 않는다.

원격 센서 sampling은 이 주기와 무관하다. 400m 비행의 짧은 상태를 GUI가 놓치지 않도록 STATE_EVENT 보충 조회를 사용한다. 이것도 실시간 전부 표시를 보장하지 않으며 필요한 실측 성능을 충족하지 못하면 전송률·메시지 배치·poll 정책을 개정한다.

## 11. GUI 연결 규칙

| 메시지/필드 | GUI 사용 |
| --- | --- |
| HELLO_REPLY.supported_states | 미구현 단계와 구현 단계를 구분 |
| STATUS.flight_state/state_entry/last_event | 현재 단계·체류 시간·누락 발견 |
| STATE_EVENT | 전이 이력·그래프 마커·사유 |
| STATUS altitude/velocity | 상대고도·수직속도 카드 및 그래프 |
| GPS | 위치·fix·나이, 상대고도와 별도 |
| GUARDS | known/satisfied/unknown 조건 표시 |
| CONTROL | 요청 모드·실제 모드·조종 입력 최신성·서보 명령 |
| CHALLENGE/COMMAND_RESULT | 준비됨·요청 중·적용·거부·결과 불명 |
| BRIDGE_STATUS | USB·브리지·AUX 상태; 원격 로켓 연결 증거로 사용하지 않음 |

STATE_EVENT는 GUI 진행 경로만 보충하며 늦게 왔다고 현재 snapshot을 과거로 되돌리지 않는다. DUPLICATE는 동일 boot/event를 하나의 이벤트로 병합한다. snapshot만으로 중간 단계를 추정하지 않는다.

## 12. ELRS / CRSF 연결 경계

E22에서는 위 MAVLink dialect를 사용하고, RP1 수신 출력은 CRSF를 사용하는 방향으로 잡는다. ExpressLRS 공식 문서는 여러 receiver serial protocol을 지원하며 CRSF를 지원하는 장치에서 CRSF 사용을 안내한다. [S10]

**ELRS의 arm 표시와 로켓 ARMED는 다른 상태다.** 채널 5는 ExpressLRS 버전·arming mode에 따라 특별한 의미가 있으므로 일반 MODE 채널로 임의 배정하지 않는다. 최근 공식 문서는 CH5 방식과 버전에 따른 대체 arming 방식을 구분한다. 실제 사용할 펌웨어 버전과 설정을 고정해야 한다. [S11][S12]

TUSI 정책 초안:
- E22만 로켓 ARM/DISARM transaction을 운반한다.
- ELRS CH5 변화가 로켓 FSM을 직접 ARM/DISARM하지 않는다.
- 수동 모드 요청은 별도 채널을 사용하되 정확한 채널·범위는 RC 전용 ICD에서 고정한다.
- CH1~4의 조이스틱 축 매핑과 좌우 조향 의미는 기구·제어 입력을 확인한 뒤 확정한다.
- ELRS 송신 준비 상태와 로켓의 허용 상태가 다르면 실제 모드 적용은 탑재 정책에 따른다.
- E28 송신 target 호환성, RP1 baud·frame·CRC·채널 값·링크 손실 시간은 실물 revision 검토 전 확정하지 않는다.

본 문서는 E22 ICD를 구현 가능한 수준으로 정의하며 CRSF 자체를 새로 정의하지 않는다. ELRS 구현 착수 전 별도 RC ICD가 필요하다.

## 13. 검증 결과와 시험 벡터

XML을 pymavlink 2.4.50 공식 생성기로 검증하고 Python3 binding을 생성했다. 생성물은 임시 검증 디렉터리에 두었으며 제품 펌웨어나 GUI 코드는 작성하지 않았다.

시험용 HELLO:
- source=255/190, seq=0, gcs_session=1, probe_nonce=2, revision=1, target=1/1.
- key=00 01 02 ... 1f (공개 시험 키; 실물 운용용 아님).
- signing link_id=1, signing timestamp=1000000.
- signed frame 길이=45 bytes.

```text
fd14010000ffbe60ea000100000000000000020000000000000001000101475d0140420f000000a0a15040fc24
```

동일 key의 수신 parser로 round-trip 복원 성공, 같은 signed packet 재주입 거부 확인. 추가로 14개 메시지 모두에 대해 Python 필드 복원과 모든 2조각 분할 위치를 검사했고, Python 생성 프레임을 C parser가 해당 msgid로 수신하는 것을 확인했다. C가 생성한 HELLO는 위 바이트와 정확히 일치했다. 두 parser의 CRC 손상·서명 손상·무서명 거부도 통과했다. 모든 메시지의 C 필드 복원, transaction 로직 및 실물 통합을 검증한 것은 아니다.

스키마 재검증 명령(별도 가상환경에 pymavlink 2.4.50 설치 후):

```bash
python -m pymavlink.tools.mavgen --lang=Python3 --wire-protocol=2.0 --output=/tmp/tusi_generated.py shared/protocol/tusi.xml
python -m pymavlink.tools.mavgen --lang=C --wire-protocol=2.0 --output=/tmp/tusi_generated_c shared/protocol/tusi.xml
```

아래 전체 시험은 제품 구현 단계 인수시험이며 앞의 프레임 검사만으로 완료되지 않는다.

| 시험 | 기대 결과 |
| --- | --- |
| C encoder → Python parser / Python encoder → C parser | 모든 메시지 값·CRC 일치 |
| 모든 byte 위치에서 stream 분할, 연속 프레임 | 정상 복원 |
| 최대·최소·음수·0·validity=0 | 타입·단위·미제공 해석 일치 |
| CRC 손상·틀린 key·unsigned·서명 replay | 처리 경로 진입 거부 |
| key/timestamp cold boot 및 재시작 | 정책 유지, 과거 COMMIT 실행 안 됨 |
| PREPARE 후 상태 변화·token 만료 | COMMIT 거부 |
| 같은 request로 다른 command | REQUEST_CONFLICT |
| 명령 적용 후 ACK 유실·중복 COMMIT | 상태 변경 한 번, 조회 결과 보존 |
| result/event cache 소진 | UNKNOWN/GAP, 이력 조작·재실행 없음 |
| delayed old event / old snapshot | 현재 상태 역행 없음 |
| 실제 UART·E22 양방향·AUX·전원 재인가 | profile의 대기·처리량 검증 |
| E22+ELRS 동시 동작 | 채널 역할 충돌 없음, 지연·손실 기록 |

## 14. 학습 순서와 설계 결정 기록

1. **stream과 packet**: read 한 번은 메시지 하나가 아니다. S1과 S2를 읽고 45-byte 예제를 여러 조각으로 나누어 생각한다.
2. **직렬화**: altitude=123.456 m를 123456 mm로 표현한다. little-endian int32 bytes는 40 e2 01 00이다.
3. **CRC와 서명**: CRC는 잡음으로 바뀐 byte를 찾고 signing은 key 보유 송신자의 무결성을 확인한다. signing은 암호화가 아니다.
4. **세 가지 번호**: MAVLink seq는 프레임 순번, request_id는 요청 번호, event_id는 실제 상태 전이 번호다.
5. **부팅·시간**: 10초는 어느 장치의 시계인지 명시한다. token 만료는 로켓 자신의 시계로 확인한다.
6. **ACK 의미**: READY→COMMIT→APPLIED와 응답 유실 사례를 손으로 추적한다.
7. **대역폭**: 127 bytes 왕복에 원하는 Hz를 곱하고 PHY overhead 이전에도 예산을 초과하는지 확인한다.
8. **GUI 데이터 출처**: AUX high, ELRS CH5 high, STATUS ARMED가 각각 다른 사실임을 설명해본다.

| 결정 | 상태 |
| --- | --- |
| MAVLink 2 + 전용 dialect, signed RF | 본 초안 제안; 탑재 담당 검토 필요 |
| 메시지 필드·코드·CRC_EXTRA | XML 생성 검증 완료; 기능 구현 전 |
| poll 주도 반이중 스케줄 | 초기 구현 제안; 비행 중 관측 성능 검증 필요 |
| PREPARE/COMMIT 및 cache 정책 | 명령 상태 소유자와 원자성 검토 필요 |
| RF 주기·timeout·buffer | 벤치 초기값, 실측 후 확정 |
| 실물 E22 revision·RF 설정 | 미확인 |
| ELRS 버전·CH5·축 매핑 | RC ICD에서 확정 |
| 실제 비행 전이·ARM guard | 탑재 담당 책임, 본 문서에서 추가 구현하지 않음 |

## 15. 출처 및 읽을 부분

- **S1** [Ebyte E22-400T22S User Manual, 제조사 작성 공개 사본](https://fccid.io/2ALPH-E22400T22S/User-Manual/User-manual-4233671.pdf), §2·§5.6·§6. 공개 사본의 revision을 실물과 대조할 것. [제조사 제품 페이지](https://www.cdebyte.com/products/E22-400T22S)도 모델 확인에 사용.
- **S2** [MAVLink Packet Serialization](https://mavlink.io/en/guide/serialization.html): frame, little-endian, 정렬, CRC_EXTRA, trailing-zero.
- **S3** [MAVLink Command Protocol](https://mavlink.io/en/services/command.html): ACK와 accepted/completed 구분. TUSI transaction은 별도 설계.
- **S4** [MAVLink Message Signing](https://mavlink.io/en/guide/message_signing.html): signature·timestamp·key 관리.
- **S5** [How to Define MAVLink Messages & Enums](https://mavlink.io/en/guide/define_xml_element.html): XML 원본과 호환성.
- **S6** [Heartbeat/Connection Protocol](https://mavlink.io/en/services/heartbeat.html): 연결 감시 개념. TUSI는 표준 heartbeat를 사용하지 않음.
- **S7** [Cheshire & Baker, Consistent Overhead Byte Stuffing](https://www.stuartcheshire.org/papers/COBSforToN.pdf): 자체 framing 대안 비교용, 채택하지 않음.
- **S8** [C Message Signing](https://mavlink.io/en/mavgen_c/message_signing_c.html): 애플리케이션의 영속 timestamp 관리 책임.
- **S9** [RFC 1982 — Serial Number Arithmetic](https://www.rfc-editor.org/rfc/rfc1982): wrap 순번 비교 학습.
- **S10** [ExpressLRS Receiver Serial Protocols](https://www.expresslrs.org/software/serial-protocols/): RP1 연결 경로 검토.
- **S11** [ExpressLRS Radio Preparation](https://www.expresslrs.org/quick-start/transmitters/tx-prep/): version별 arm 입력 방식.
- **S12** [ExpressLRS Switch Configs](https://www.expresslrs.org/software/switch-config/): 채널별 해상도·갱신 특성.
- 비교 조사: [RFC 2104 HMAC](https://www.rfc-editor.org/rfc/rfc2104.txt), [RFC 4231 HMAC-SHA 시험 벡터](https://www.rfc-editor.org/rfc/rfc4231), [RFC 1952 CRC 예제](https://www.rfc-editor.org/rfc/rfc1952.txt). 본 MAVLink profile의 별도 알고리즘으로 채택하지 않음.

## 부록 A. 생성 규칙을 반영한 wire payload 사전

표의 영문 설명은 XML의 동일 필드 설명이다. field 이름·타입·offset·CRC_EXTRA를 직접 생성 코드와 대조할 수 있도록 유지한다. 정확한 byte 예제와 재현 환경은 [검증 manifest](../shared/protocol/verification_v0.1.json)를 참조한다.

### 60000: TUSI_HELLO

최대 payload 20 bytes, CRC_EXTRA=198.

| Wire offset | 형식 | 필드 | 의미 |
| --- | --- | --- | --- |
| 0 | uint64_t | gcs_session | Fresh nonzero session per GCS process. |
| 8 | uint64_t | probe_nonce | Fresh discovery nonce. |
| 16 | uint16_t | icd_revision | Must be 1. |
| 18 | uint8_t | target_system | Target vehicle system ID. |
| 19 | uint8_t | target_component | Target component ID. |

### 60001: TUSI_HELLO_REPLY

최대 payload 42 bytes, CRC_EXTRA=238.

| Wire offset | 형식 | 필드 | 의미 |
| --- | --- | --- | --- |
| 0 | uint64_t | gcs_session | Echo session. |
| 8 | uint64_t | probe_nonce | Echo nonce. |
| 16 | uint64_t | boot_id | Nonzero unique vehicle boot ID. |
| 24 | uint64_t | time_boot_ms | Vehicle monotonic time in milliseconds. |
| 32 | uint32_t | firmware_id | Configured release identifier. |
| 36 | uint16_t | icd_revision | Must be 1. |
| 38 | uint16_t | supported_states | State support mask bits 0 through 11. |
| 40 | uint8_t | target_system | GCS system ID. |
| 41 | uint8_t | target_component | GCS component ID. |

### 60002: TUSI_STATUS

최대 payload 50 bytes, CRC_EXTRA=191.

| Wire offset | 형식 | 필드 | 의미 |
| --- | --- | --- | --- |
| 0 | uint64_t | boot_id | Vehicle boot ID. |
| 8 | uint64_t | time_boot_ms | Snapshot time. |
| 16 | uint64_t | state_entry_ms | Entry time; zero valid only with validity bit. |
| 24 | uint32_t | request_id | Echo poll ID. |
| 28 | uint32_t | last_event_id | Latest event ID; zero means none. |
| 32 | int32_t | altitude_mm | Launch-relative altitude. |
| 36 | int32_t | vertical_speed_mms | Positive upwards. |
| 40 | uint16_t | valid_flags | Validity mask. |
| 42 | uint16_t | health_flags | Sensor health mask. |
| 44 | uint16_t | pyro_mv | Sense node voltage, not battery. |
| 46 | uint16_t | leg_mv | Sense node voltage. |
| 48 | uint8_t | flight_state | TUSI state code. |
| 49 | uint8_t | control_mode | 0 AUTO 1 MANUAL 255 UNKNOWN. |

### 60003: TUSI_GPS

최대 payload 40 bytes, CRC_EXTRA=111.

| Wire offset | 형식 | 필드 | 의미 |
| --- | --- | --- | --- |
| 0 | uint64_t | boot_id | Vehicle boot ID. |
| 8 | uint64_t | time_boot_ms | Snapshot time. |
| 16 | uint32_t | request_id | Echo poll ID. |
| 20 | int32_t | latitude_e7 | Latitude degrees times 1e7. |
| 24 | int32_t | longitude_e7 | Longitude degrees times 1e7. |
| 28 | int32_t | altitude_msl_mm | Mean sea level altitude. |
| 32 | uint32_t | age_ms | Age of last fix. |
| 36 | uint16_t | valid_flags | Bits 0 position 1 altitude 2 age. |
| 38 | uint8_t | fix_type | 0 none 2 2D 3 3D 255 unknown. |
| 39 | uint8_t | satellites | 255 unknown. |

### 60004: TUSI_STATE_EVENT

최대 payload 28 bytes, CRC_EXTRA=243.

| Wire offset | 형식 | 필드 | 의미 |
| --- | --- | --- | --- |
| 0 | uint64_t | boot_id | Vehicle boot ID. |
| 8 | uint64_t | transition_ms | Vehicle event time. |
| 16 | uint32_t | request_id | Echo poll ID. |
| 20 | uint32_t | event_id | Event ID starting at 1. |
| 24 | uint16_t | reason | Transition reason code. |
| 26 | uint8_t | previous_state | Previous state; 255 unknown. |
| 27 | uint8_t | new_state | New state. |

### 60005: TUSI_PREPARE

최대 payload 28 bytes, CRC_EXTRA=36.

| Wire offset | 형식 | 필드 | 의미 |
| --- | --- | --- | --- |
| 0 | uint64_t | gcs_session | Current GCS session. |
| 8 | uint64_t | target_boot_id | Expected vehicle boot. |
| 16 | uint32_t | request_id | Unique transaction ID. |
| 20 | uint32_t | expected_event_id | Latest observed event ID. |
| 24 | uint8_t | command | 1 ARM 2 DISARM. |
| 25 | uint8_t | expected_state | Observed flight state. |
| 26 | uint8_t | target_system | Vehicle system ID. |
| 27 | uint8_t | target_component | Vehicle component ID. |

### 60006: TUSI_CHALLENGE

최대 payload 40 bytes, CRC_EXTRA=48.

| Wire offset | 형식 | 필드 | 의미 |
| --- | --- | --- | --- |
| 0 | uint64_t | boot_id | Vehicle boot ID. |
| 8 | uint64_t | gcs_session | Echo session. |
| 16 | uint64_t | token | Nonzero single-use random token; zero if rejected. |
| 24 | uint64_t | expires_boot_ms | Expiry on vehicle clock. |
| 32 | uint32_t | request_id | Echo transaction ID. |
| 36 | uint16_t | reason | Reason code. |
| 38 | uint8_t | result | 0 READY 1 REJECTED. |
| 39 | uint8_t | command | Echo command. |

### 60007: TUSI_COMMIT

최대 payload 31 bytes, CRC_EXTRA=246.

| Wire offset | 형식 | 필드 | 의미 |
| --- | --- | --- | --- |
| 0 | uint64_t | gcs_session | Current GCS session. |
| 8 | uint64_t | target_boot_id | Expected vehicle boot. |
| 16 | uint64_t | token | Challenge token. |
| 24 | uint32_t | request_id | Original transaction ID. |
| 28 | uint8_t | command | Original command. |
| 29 | uint8_t | target_system | Vehicle system ID. |
| 30 | uint8_t | target_component | Vehicle component ID. |

### 60008: TUSI_COMMAND_RESULT

최대 payload 34 bytes, CRC_EXTRA=30.

| Wire offset | 형식 | 필드 | 의미 |
| --- | --- | --- | --- |
| 0 | uint64_t | boot_id | Vehicle boot ID. |
| 8 | uint64_t | gcs_session | Echo session. |
| 16 | uint64_t | processed_boot_ms | Decision time. |
| 24 | uint32_t | request_id | Transaction ID. |
| 28 | uint16_t | reason | Reason code. |
| 30 | uint8_t | command | Command ID. |
| 31 | uint8_t | result | 0 APPLIED 1 REJECTED 2 PENDING 3 UNKNOWN. |
| 32 | uint8_t | state_after | State at decision; not necessarily current. |
| 33 | uint8_t | mode_after | Mode at decision. |

### 60009: TUSI_POLL

최대 payload 27 bytes, CRC_EXTRA=67.

| Wire offset | 형식 | 필드 | 의미 |
| --- | --- | --- | --- |
| 0 | uint64_t | gcs_session | Current GCS session. |
| 8 | uint64_t | target_boot_id | Expected vehicle boot. |
| 16 | uint32_t | request_id | Poll ID. |
| 20 | uint32_t | item_id | Event ID or transaction ID, otherwise zero. |
| 24 | uint8_t | selector | 0 STATUS 1 GPS 2 EVENT 3 RESULT 4 CONTROL 5 GUARDS. |
| 25 | uint8_t | target_system | Vehicle system ID. |
| 26 | uint8_t | target_component | Vehicle component ID. |

### 60010: TUSI_POLL_ERROR

최대 payload 22 bytes, CRC_EXTRA=139.

| Wire offset | 형식 | 필드 | 의미 |
| --- | --- | --- | --- |
| 0 | uint64_t | boot_id | Vehicle boot ID. |
| 8 | uint32_t | request_id | Poll ID. |
| 12 | uint32_t | oldest_event_id | Oldest retained event or zero. |
| 16 | uint32_t | latest_event_id | Latest event or zero. |
| 20 | uint16_t | reason | Reason code. |

### 60011: TUSI_CONTROL

최대 payload 34 bytes, CRC_EXTRA=1.

| Wire offset | 형식 | 필드 | 의미 |
| --- | --- | --- | --- |
| 0 | uint64_t | boot_id | Vehicle boot ID. |
| 8 | uint64_t | time_boot_ms | Snapshot time. |
| 16 | uint32_t | request_id | Poll ID. |
| 20 | uint32_t | rc_age_ms | Age of valid RC input. |
| 24 | int16_t | steering_permille | Normalized steering -1000 through 1000. |
| 26 | uint16_t | left_servo_us | Commanded pulse width. |
| 28 | uint16_t | right_servo_us | Commanded pulse width. |
| 30 | uint16_t | valid_flags | Bits 0 RC age 1 steering 2 left 3 right 4 mode request. |
| 32 | uint8_t | requested_mode | 0 AUTO 1 MANUAL 255 UNKNOWN. |
| 33 | uint8_t | applied_mode | 0 AUTO 1 MANUAL 255 UNKNOWN. |

### 60012: TUSI_GUARDS

최대 payload 32 bytes, CRC_EXTRA=12.

| Wire offset | 형식 | 필드 | 의미 |
| --- | --- | --- | --- |
| 0 | uint64_t | boot_id | Vehicle boot ID. |
| 8 | uint64_t | time_boot_ms | Snapshot time. |
| 16 | uint32_t | request_id | Poll ID. |
| 20 | uint32_t | known_mask | Known conditions. |
| 24 | uint32_t | satisfied_mask | Satisfied subset of known conditions. |
| 28 | uint16_t | rules_revision | Guard dictionary revision, initially 1. |
| 30 | uint8_t | flight_state | State at evaluation. |
| 31 | uint8_t | candidate_state | Candidate next state or 255. |

### 60013: TUSI_BRIDGE_STATUS

최대 payload 24 bytes, CRC_EXTRA=157.

| Wire offset | 형식 | 필드 | 의미 |
| --- | --- | --- | --- |
| 0 | uint64_t | time_boot_ms | Bridge uptime. |
| 8 | uint32_t | firmware_id | Bridge release ID. |
| 12 | uint32_t | rx_bytes | Radio UART bytes received modulo 2^32. |
| 16 | uint32_t | tx_bytes | Radio UART bytes sent modulo 2^32. |
| 20 | uint16_t | error_flags | Bits 0 initialization 1 AUX timeout 2 queue overflow 3 UART error. |
| 22 | uint8_t | radio_ready | 0 no 1 yes. |
| 23 | uint8_t | aux_level | 0 low 1 high 255 unknown. |

## 변경 이력

| 버전 | 날짜 | 내용 |
| --- | --- | --- |
| 0.1 | 2026-11-11 | 공식 자료 비교, MAVLink dialect·명령 transaction·GUI 상태·실물시험 및 학습 자료 정의 |
