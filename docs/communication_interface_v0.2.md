# TUSI 로켓–지상국 통신 인터페이스 명세서


> **2026-11-19 운용 변경 — 기존 ARM 요청 조항보다 우선 적용:** ARM은 동체의 물리 버튼과 탑재 소프트웨어가 담당한다. 지상국은 button_pressed/armed readback만 표시하며 원격 ARM 요청·UI·송신은 제외한다. 기존 문서의 ARM/DISARM 요청 흐름은 이전 제안으로, 현재 구현의 활성 계약이 아니다. 원격 DISARM은 별도 합의 전 비활성이다. 입력 디바운스·인터록·허용 상태는 탑재 담당이 확정한다. DB 기록의 현재 계약 및 선택 텔레메트리 필드는 [개발 안내](../ground_station/README.md#2026-11-19-flight-deck--ork--동체-arm--sqlite)를 따른다.


| 항목 | 내용 |
| --- | --- |
| 문서 ID / 버전 | TUSI-ICD-001 / 0.2 |
| 작성일 | 2026-11-11 |
| 상태 | ConOps 반영 설계 초안; wire revision 2 동결 전 |
| 적용 요구사항 | [지상 시스템 요구사항 v0.4](ground_system_requirements_v0.4.md) |
| 원문 | 낙하산제어_ConOps_v0.1.pdf, 10쪽 |
| 이전 명세 | [v0.1](communication_interface_v0.1.md), 비교·검증 이력용 |
| 구현 제한 | 기존 tusi.xml/verification_v0.1.json은 revision 1 전용. 이 문서 전체의 구현·검증 완료를 의미하지 않음 |

## 1. 목적·역할·설계 근거

약 400m 발사 지면 기준 최고고도를 예상하는 로켓의 자동 전개·유도 낙하산·최종 접근·회수 미션을 지원한다. 400m는 사용자 제공 예상값이며 고도 임계값이나 비행시간 근거가 아니다.

지상 시스템 개발 담당은 지상국·브리지·조종기 및 규격 초안을 담당한다. 탑재 소프트웨어 개발 담당은 로켓 센서·FSM·제어·E22/RP1 처리·명령 허용 판단을 담당한다. 통신 계층은 비행 상태 또는 출력을 직접 변경하지 않는다.

직접 확인한 원문 요구와 프로젝트 제안, 미정 결정을 구분한다. 외부 자료는 패킷·인증·모듈 특성 근거이며 미션 정책의 근거를 대신하지 않는다.

## 2. ConOps 추적과 v0.1 대비 변경

| 원문 | 요구 | 인터페이스 개정 |
| --- | --- | --- |
| §3.2 p2 | SAFE 목표 좌표 설정 | 목표 설정 요청·결과·적용 좌표 readback 추가 |
| §3.5~3.8 p3~5 | 최고점·전개·안정화 | 중요 이벤트 우선 예약 및 snapshot과 별도 전달 |
| §3.9 p5~6 | 목표 거리·방위·course error로 유도 | GUIDANCE telemetry 추가 |
| §3.10 p6~7 | GUIDED_DESCENT AUTO/MANUAL | 모드 요청 계약·적용 결과·ELRS freshness |
| §3.11 p7~8 | 최종 접근·제한 | 고도 datum·최종 접근 조건·제한 상태 |
| §3.12 p8 | 착륙 후 위치 송신 | GCS poll 없이 회수 비콘 |
| §4 p9 | 긴급 전개 요청을 FSM에 전달 | 최종 범위에 포함; 별도 지연·인증·허용 정책 확정 필요 |

폐기하는 v0.1 운용 가정:
- 로켓이 요청 없이는 송신하지 않는 순수 stop-and-wait 운용.
- 실물 운용 전체에 STATUS 1Hz를 충분한 주기로 가정하는 것.
- 최종 기능을 ARM/DISARM에 한정하는 것.
- 지도/평면 궤적 화면을 전부 선택 기능으로 보는 것.
- 모든 명령에 ARM용 PREPARE/COMMIT 왕복을 그대로 적용하는 것.

유지하는 기반:
- MAVLink 2 + 프로젝트 dialect, 같은 XML에서 C/Python 생성.
- signed RF, 프레임 CRC와 인증의 역할 구분.
- source/target/boot/session/request/event 식별.
- 로켓 판단 결과 기반 GUI, 중복 실행 방지, 기록·재생.
- E22 텔레메트리·명령과 ELRS 연속 조향 경로의 분리.

## 3. E22 및 wire 기반

제조사 매뉴얼은 E22-400T22S를 UART 모듈로 설명한다. AUX는 버퍼·모듈 동작을 나타내며 상대 수신·명령 완료의 증거가 아니다. 실물 모델·revision·레지스터를 확인하고 E220 또는 SPI형 모듈과 혼동하지 않는다. [S1]

MAVLink 2는 little-endian, 타입 크기 기반 base-field 정렬, CRC_EXTRA, trailing-zero 절단 및 선택적 서명을 제공한다. signed overhead는 25 bytes이다. 해당 처리에는 생성 라이브러리를 사용하고 C struct 메모리를 그대로 송신하지 않는다. [S2]

초기 실물 시험 후보는 정상 투명 전송, RSSI byte append 비활성, fixed transmission 비활성이다. UART 115200/8N1, air rate 9.6kbps, subpacket 240은 보유 모듈 지원 확인 전 벤치 후보이다. 주파수·출력 등 운용 설정은 별도 승인 설정표에 둔다. UART 속도는 RF 처리량과 다르다.

### 3.1 식별 및 버전

| 항목 | 제안 |
| --- | --- |
| 로켓 sysid/compid | 1/1 |
| GCS sysid/compid | 255/190 |
| 로컬 브리지 sysid/compid | 254/191 |
| signing link ID | GCS 1, 로켓 2 |
| 새 application revision | 2, XML 확정 전 예약 상태 |
| 기존 메시지 번호 | 60000~60013, revision 1 정의 참조 |
| 신규 번호 | 60014~60020 후보 예약; 전역 등록 의미 없음 |

부팅 ID는 재부팅마다 바뀌며, GCS 세션은 프로세스/연결 세션을 식별한다. 시간은 각 장치의 단조 증가 부팅 ms이며 UTC·서로 다른 장치의 시계와 혼합하지 않는다.

revision 2 원본 XML, SHA-256, 생성기 버전 및 새 검증 manifest가 준비되기 전 기존 라이브러리의 revision 숫자만 바꾸어 사용하지 않는다. revision 1 장치는 진단·관측용으로만 연결하고 미션 명령 UI는 비활성화한다. 자동 하위호환으로 명령을 허용하지 않는다.

## 4. 송신 구조: 주기 데이터·이벤트·명령 응답

### 4.1 기본 정책

1. 로켓은 GCS 요청 유무와 무관하게 phase profile에 따라 STATUS/GPS 등 주기 downlink를 예약한다.
2. 상태 전이·중요 오류·전개 처리 결과는 이벤트 queue에 넣고 가능한 첫 downlink 기회에 우선 송신한다.
3. E22는 반이중 링크로 취급한다. downlink 연속 전송으로 uplink 기회를 소진하지 않는다.
4. GCS 조회는 상세 진단·누락 이벤트·명령 결과·설정 readback 보충용으로 사용한다.
5. 주기 데이터·발생 이벤트의 request_id는 0, 조회 응답은 해당 nonzero request_id를 사용하도록 revision 2 semantics를 정의한다.
6. GCS 중단 중에도 로켓 비행 판단·로컬 기록·주기 송신은 계속된다.
7. GROUND는 전원 예산과 연결된 회수 profile로 전환한다.

### 4.2 송신권과 uplink 기회 — 동결 전 설계

제안은 로켓 주도 송신 주기 안에 **downlink 구간 → uplink 수신 구간 → 처리/응답 구간**을 배치하는 방식이다. GCS는 로켓이 알린 수신 기회 안에서만 일반 uplink를 보낸다. 시간 정보는 로켓 주기 번호와 상대 구간으로 전달하며 PC와 ESP32의 시계가 이미 동기화됐다고 가정하지 않는다.

구간 길이, 수신 기회 표식 메시지, RF turn-around, UART/USB 지연 보정, missed window 후 재동기화는 TBC-LINK-01에서 확정해야 한다. AUX high만으로 상대 RF 수신 가능 시각을 결정하지 않는다. 이 결정 전에는 무요청 downlink와 임의 uplink를 동시에 활성화한 실물 구현을 완료로 처리하지 않는다.

긴급 요청도 RF 물리적 제약을 받는다. 최초 송신 가능한 기회까지의 최악 대기를 지연 예산에 포함하며, 일반 요청 queue와 UI 처리가 추가 무한 대기를 유발하지 않아야 한다. 명령 종류별 처리 원자성·우선순위는 탑재 담당과 확정한다.

### 4.3 queue 정책

- periodic telemetry: 메시지 종류별 최신 snapshot으로 대체; 오래된 snapshot 무한 누적 금지.
- 이벤트: 순번으로 보존; 우선 송신 후 누락 시 조회 가능. cache 넘침은 GAP 보고.
- 결과: request별 최종 결과 보존; 결과 유실이 동작 재실행을 유발하지 않음.
- RF 우선순위 초안: 긴급 요청·결과 > 일반 명령 결과·전이 이벤트 > 현재 STATUS > 유도·GPS > 상세 진단.
- 높은 우선순위 트래픽에도 STATUS와 uplink window의 최대 공백을 넘지 않도록 제한한다.
- timeout·재시도 횟수·queue 크기는 동결 profile에 명시하고 시험 결과와 연결한다.

## 5. 단계별 정보 profile

아래는 우선순위와 목적을 정한 계약이다. Hz·최대 데이터 나이·지연 한계는 TBC-LINK-02에서 확정하며 이전 1Hz/3s/10s를 자동 승계하지 않는다.

| 단계 | 우선 정보 | 운용 목적 |
| --- | --- | --- |
| INIT/SAFE | 준비 상태, 목표 적용, GPS, 장치 오류 | 설정·ARM 준비 확인 |
| ARMED | STATUS, 센서 유효성, 발사 전 이벤트 | 발사 대기·DISARM |
| LAUNCH/COAST | STATUS, 고도·수직속도, 상태 이벤트 | 상승·최고점 접근 관측 |
| APOGEE/DEPLOY | 전이·전개 처리 이벤트, STATUS | 짧은 단계 확인 |
| STABILIZATION | GNSS·하강·운동·guard 상태 | 유도 시작 준비 |
| GUIDED_DESCENT | GUIDANCE, GPS, CONTROL, STATUS | 목표 접근과 수동 개입 |
| FINAL_DESCENT | 고도 기준·오차·제한·착륙장치 상태 | 최종 접근 감시 |
| GROUND | RECOVERY 위치·fix 나이·기록 상태 | GCS 재접속 및 회수 |

실시간 sampling, onboard controller 주기, telemetry 주기, GUI repaint 주기는 서로 다르다. 최고고도 400m만으로 비행 단계 시간을 산출하지 않는다.

## 6. 데이터 및 메시지 계약

### 6.1 기존 메시지 개정 방향

| 메시지 | revision 2에서의 역할 |
| --- | --- |
| HELLO/HELLO_REPLY | 능동 handshake, nonce echo, boot/revision/capability 확인; 주기 송신 시작 조건이 아님 |
| STATUS | 주기 snapshot, phase·시간·고도·속도·최근 event ID |
| GPS | 주기 위치 및 fix 유효성 |
| STATE_EVENT | 발생 시 우선 송신; 조회 응답으로도 제공 |
| PREPARE/CHALLENGE/COMMIT | 일반 ARM/DISARM 전용 transaction 초안 유지 |
| COMMAND_RESULT | 명령 종류별 결과; 요청 수신과 적용을 구분 |
| POLL/POLL_ERROR | 누락·상세·결과 보충 조회 |
| CONTROL | ELRS 입력 나이, 요청/적용 모드, 출력 명령 |
| GUARDS | known/satisfied 및 정책 버전; GUI가 조건 추정 금지 |
| BRIDGE_STATUS | USB 로컬 진단, RF 전달 금지 |

state codes 0~11과 255 UNKNOWN은 기존 대응을 유지한다. 타입·offset·CRC_EXTRA 표는 v0.1 XML에만 해당하며 revision 2 표로 재사용하지 않는다.

### 6.2 신규 메시지 후보 및 논리 필드

공통 envelope에는 대상·송신자, boot ID, session, 요청 식별과 스키마 revision이 필요하다. MAVLink header에 있는 필드는 payload에서 불필요하게 중복하지 않도록 최종 XML에서 정리한다. 아래는 **필수 의미·단위 계약**이며 wire offset/CRC는 아직 확정하지 않는다.

| 예약 ID / 이름 | 필수 데이터 | 목적 |
| --- | --- | --- |
| 60014 TARGET_CONFIG_REQUEST | target_boot_id, gcs_session, request_id, expected_target_revision, latitude_e7(int32), longitude_e7(int32) | SAFE 목표 설정 |
| 60015 TARGET_STATUS | boot_id, time_boot_ms, request_id(주기=0), target_revision, applied 좌표, valid_flags, 처리 결과·사유 | 적용 목표 readback |
| 60016 GUIDANCE | boot_id, time_boot_ms, target_revision, validity, distance_mm(uint32), target_bearing_cdeg(uint16), ground_course_cdeg(uint16), course_error_cdeg(int16), ground_speed_mms(uint32) | 목표 접근 관측 |
| 60017 MODE_REQUEST | target_boot_id, gcs_session, request_id, requested_mode, 예상 상태·전이 ID, 만료/최신성 정보 | AUTO/MANUAL 요청 |
| 60018 EMERGENCY_REQUEST | target_boot_id, gcs_session, request_id, emergency_type, 최신성·재생 방지 정보 | FSM에 긴급 전개 요청, 정책 확정 전 송신 금지 |
| 60019 RECOVERY_STATUS | boot_id, time_boot_ms, 위치·fix 나이·validity, reported landed, 마지막 기록 상태, 적용 목표 버전 | GROUND 회수 비콘 |
| 60020 LINK_WINDOW | boot_id, cycle_id, 수신 구간·응답 구간 정보와 profile_revision | 반이중 송신권 제어 후보 |

고도 확장에는 altitude_reference enum(launch-relative/AGL/MSL/unknown), AGL valid, 사용한 datum/config revision이 필요하다. STATUS를 확장할지 별도 메시지로 분리할지는 XML 동결 시 결정한다. 지상 상대고도를 AGL로 단순 재명명하지 않는다.

### 6.3 좌표·각도·오차 규칙

- 목표/현재 위도·경도: WGS84 degree × 1e7. 위도 [-90,90], 경도 [-180,180]. 미제공 좌표는 validity=0이며 (0,0)을 미제공 sentinel로 사용하지 않는다.
- 상대고도: mm, 발사 지면 기준. AGL은 현재 지표면 기준으로 별도 정보.
- 방위각·ground course: true north=0°, 시계 방향, [0,36000) centidegree.
- course_error: wrap(target_bearing-ground_course), [-18000,18000) centidegree로 제안. 제어기의 부호와 탑재 담당 대조 필요.
- GNSS course는 이동 방향이며 기체 heading이 아니다. 저속 무효 기준은 탑재 설정으로 관리한다.
- 거리·속도·좌표의 유효성은 필드별로 표시한다. 포화·범위 초과를 정상 수치로 조용히 clamp하지 않는다.
- target_revision 불일치 시 GUI는 목표·유도 정보를 동기화되지 않은 것으로 표시하고 새 readback을 요구한다.

## 7. 일반 명령, 목표 설정 및 모드 전환

### 7.1 공통

모든 미션 명령은 인증·대상·세션·boot·만료·중복 검사를 통과한 뒤 탑재 상태 소유자에게 요청으로 전달한다. APPLIED는 정의된 소프트웨어 변경 완료이며 물리적 전개 성공의 뜻이 아니다. PENDING/REJECTED/UNKNOWN을 구분하고 결과가 없다고 자동 성공·실패로 표시하지 않는다.

캐시 밖 오래된 request도 재실행하지 않는 high-water 또는 동등한 dedup 규칙이 필요하다. GUI 재연결·프로그램 시작 시 이전 명령을 자동 재송신하지 않는다. 제어 요청에는 fresh handshake가 필요하며, 관측 beacon만 받은 상태에서는 버튼을 활성화하지 않는다.

### 7.2 ARM/DISARM

이전 PREPARE→CHALLENGE→COMMIT 방식은 일반 ARM/DISARM의 후보로 유지한다. 최종 guard 검사·token 소비·상태 예약은 원자적으로 처리하며 expected event ID로 상태가 바뀌었다가 돌아온 경우도 식별한다.

ARM은 SAFE 및 준비 조건 충족 시, DISARM은 발사 전 ARMED에서 허용하는 정책 초안이다. 원문은 물리적 ARM 버튼도 검토 대상으로 언급하므로 'E22만이 유일한 가능한 ARM 수단'으로 ConOps를 해석하지 않는다. 물리적 입력 존재 여부와 중재는 별도 결정한다.

### 7.3 목표 설정

1. GCS가 편집 좌표를 범위 검사하고 operator confirmation 후 request를 만든다.
2. 로켓이 SAFE·freshness·expected_target_revision을 검사한다.
3. 좌표 쌍을 원자적으로 적용하고 target_revision을 증가시킨다.
4. TARGET_STATUS로 실제 적용 좌표와 revision을 반환한다.
5. GCS는 readback 일치 시에만 적용 목표를 갱신한다.

초기 정책은 ARMED 이후 변경 거부다. 목표 영속 저장 여부, 재부팅 후 재확인, 지리적 허용 영역과 목표 미설정 ARM 정책은 TBC-MISSION-01에서 결정한다. 설정 version mismatch나 반쪽 좌표 업데이트는 거부한다.

### 7.4 모드 요청

AUTO가 기본이며 MANUAL은 ConOps의 GUIDED_DESCENT에서만 허용한다. E22 MODE_REQUEST가 초기 단일 모드 요청 경로라는 제안이다. ELRS는 연속 조향 입력을 제공하고 CH5가 FSM ARM을 직접 바꾸지 않는다.

MANUAL 적용 시점의 ELRS 입력 최신성·유효성을 탑재에서 검사한다. AUTO 요청도 필요한 항법·유도 상태가 유효한지 확인한다. 링크 상실로 인한 강제 모드 변경은 별도 탑재 정책이며, 변경 원인과 실제 적용 모드를 telemetry로 보고한다.

조종기에서도 모드 스위치를 사용하려면 GUI와의 우선순위·latch·재연결 동작을 먼저 정의한다. 마지막 패킷 도착 순서만으로 두 요청 경로를 경쟁시키지 않는다.

## 8. 긴급 전개 요청 계약 및 구현 보류 조건

ConOps §4는 지상 요청을 통신 검증 후 FSM에 전달하도록 한다. 따라서 최종 인터페이스 범위에서 제외하지 않는다. 허용 비행 상태·동작 조건은 문서가 확정하지 않았으므로 새 전이·출력 pulse·재시도 구동을 여기서 정의하지 않는다.

필수 계약:
- 명시적 운용자 입력, 인증, 대상/boot/session/freshness, 요청 식별, 중복 실행 방지.
- 일반 명령 queue 대기와 RF 송신 기회까지의 최악 지연을 포함하는 별도 deadline.
- 수신 확인, FSM 수락/거부, 출력 처리, 물리적 확인을 구분.
- 수신 확인 또는 처리 결과 유실 시 재요청·결과 조회 정책.
- 이미 전개된 상태 및 동시에 발생한 자동 전개와의 중복 처리 정책.
- 오조작 방지와 지연의 균형을 고려한 GUI 조작 절차.

ARM 준비 왕복을 그대로 적용하지 않는다. 단일 인증 요청·사전 발급 허가 등은 가능한 대안일 뿐 이 revision에서 확정하지 않는다. TBC-EMG-01 해소, wire 스키마 검증 및 출력 분리 실물시험 전에는 UI의 실제 송신을 비활성화한다. 모의 요청·거부·지연 시험은 별도 실행 가능하다.

## 9. 인증·replay·파서

MAVLink signing 정책은 유지한다. key, timestamp, link ID를 공식 라이브러리로 처리하며 key/timestamp 영속 저장·복원, cold boot, 오래된 서명 시험을 수행한다. signing은 암호화가 아니다. [S3][S4]

모든 RF 메시지는 signed profile을 사용하고 unsigned/잘못된 signature 허용 callback을 두지 않는다. 브리지 로컬 상태의 무서명 USB 예외는 RF에 적용하지 않는다. 브리지는 end-to-end key를 보유하거나 로켓 패킷을 재서명하지 않는다.

GCS 없이 생성한 beacon의 boot ID는 관측에는 사용할 수 있으나 제어 권한 확인을 대신하지 않는다. HELLO의 fresh nonce echo와 revision 확인 후 명령 세션을 연다. delayed old boot/session packet은 현재 운용값을 되돌리지 않는다.

bounded stream parser → CRC/signature → source/target/version → session/boot/request → semantic 검증 → 저장/명령 queue 순서를 유지한다. key·인증 secret은 로그에 기록하지 않는다.

## 10. GUI 및 미션 이벤트

| 데이터 | 표시 |
| --- | --- |
| STATUS·STATE_EVENT | 현재 단계·방문 이력·진입 시각·전이 이유 |
| TARGET_STATUS | 편집 목표와 적용 목표·revision 구분 |
| GUIDANCE·GPS | 평면 궤적·목표 거리·방위·진행 방향·오차·fix 나이 |
| CONTROL·MODE 결과 | 요청/실제 모드·ELRS freshness·좌우 출력 명령 |
| GUARDS | 초기화·ARM·안정화·최종 접근 조건의 known/satisfied/unknown |
| 전개·착륙장치 이벤트 | 요청/처리/물리적 확인 분리 |
| RECOVERY_STATUS | 마지막 유효 위치·갱신 나이·좌표 복사·회수 기록 |

이벤트 envelope는 boot ID, event ID, 발생 시각, 종류, 사유, 관련 request ID 및 유효성을 포함한다. 상태 전이 이벤트 외 목표 적용·모드 변경·전개 처리·제한 적용·landing 판단을 표현하도록 event 종류를 확장해야 한다. 기존 STATE_EVENT 필드에 서로 다른 의미를 억지로 넣지 않는다.

50m는 ConOps의 예비값이다. GUI는 탑재 설정과 버전을 표시하며, '50m 이하 AND 반경 내'와 '저고도 안정 하강 우선' 사이의 목표 미도달 분기 정책이 확정되기 전 GUI가 FINAL_DESCENT를 판정하지 않는다.

## 11. 대역폭 및 지연 예산

주기 push에서 기존 STATUS frame 75 bytes를 1회 보내는 비용은 75 bytes다. 이전 POLL 왕복 127 bytes를 매번 소비하지 않는다. 아래 frame 길이는 **revision 1 실측 생성 길이**이며 새 필드·스키마에서는 재산정한다.

| 예시 항목 | signed frame 가정 | 예시 주기 | 비용 |
| --- | --- | --- | --- |
| STATUS | 기존 최대 75 B | 5 Hz | 375 B/s |
| GPS | 기존 최대 65 B | 2 Hz | 130 B/s |
| GUIDANCE | 예산용 가정 80 B, 미확정 | 2 Hz | 160 B/s |
| CONTROL | 기존 최대 59 B | 2 Hz | 118 B/s |
| 합계 | 이벤트·명령·수신구간 제외 | — | 783 B/s = 6264 bit/s |

이는 가능한지 판단하기 위한 예시이지 채택 profile이 아니다. air rate 9.6kbps의 약 65.3%를 application 데이터만으로 소비하며, preamble·coding·모듈 overhead·turnaround·uplink·재전송을 포함하면 부족할 수 있다. 따라서 '5Hz면 충분하다' 또는 '9.6kbps에서 된다'고 확정할 수 없다.

확정 절차:
1. 비행 예상 시간 및 관측·수동 개입에 필요한 최대 데이터 나이를 정한다.
2. 단계별 메시지 크기·주기·event burst와 uplink 예약 비용을 계산한다.
3. 실물에서 packet airtime·end-to-end 지연·상위 백분위 지연·손실을 측정한다.
4. 목표를 못 맞추면 필드 묶음·주기·air rate·스케줄을 조정한다.
5. phase profile ID와 revision으로 양쪽 설정을 고정한다.

명령 지연은 UI/queue + uplink 대기 + RF + parser/판단 + response 대기/RF + UI 표시로 나누어 기록한다. 긴급 요청의 최대 지연은 별도 합격 조건이다. '응답 timeout'은 '동작이 안 됐다'는 증거가 아니다.

## 12. GROUND 회수와 장애 조합

GROUND에서는 GCS HELLO/POLL이 없어도 위치·fix 나이·상태 비콘을 일정 시간 송신한다. 기간·주기는 배터리 예산 및 회수 계획으로 결정한다. GNSS 무효 시 마지막 유효 위치와 그 측정 나이를 함께 보내며 현재 위치로 오인시키지 않는다.

| 상황 | 지상 표시·인터페이스 요구 | 탑재 제어 |
| --- | --- | --- |
| E22 끊김, ELRS 유효 | 텔레메트리 오래됨·E22 장애 | E22 단절만으로 제어 중지/FAULT를 강제하지 않음 |
| E22 유효, ELRS 끊김 | RC 무효·실제 fallback 모드 | 승인된 상태별 failsafe 적용 |
| ELRS 끊김, 자동 유도 정상 | AUTO 복귀 후보를 구분 보고 | ConOps 예비안, 승인 필요 |
| ELRS 끊김, 자동 유도 무효 | 복합 오류·실제 적용 정책 표시 | 미정, 임의 AUTO 복귀 금지 |
| GCS 재시작 | 수동 조작 없이 주기 수신 회복, 제어는 fresh handshake | 이전 요청 재실행 없음 |

## 13. ELRS / CRSF 경계

RP1 serial 출력은 CRSF를 사용하는 방향으로 두되 실제 모델·firmware·설정을 검증한다. E22 dialect를 CRSF 대신 삽입하지 않는다. ExpressLRS CH5/arming 의미는 firmware와 switch mode에 따라 검토해야 하며 로켓 ARMED와 동일시하지 않는다. [S6][S7]

조향 채널·부호·범위·중립·deadband·receiver freshness·failsafe는 RC ICD에서 동결한다. E28 송신 target 호환성은 아직 확인되지 않았다. 지상 시스템 담당은 송신 입력·구성, 탑재 담당은 RP1 수신·중재·출력을 담당한다.

## 14. 검증과 완료 기준

| 시험 | 기대 결과 |
| --- | --- |
| 지상국 정지 중 상태 전이 | 탑재 판단·기록·주기 송신 지속 |
| 재접속 후 이벤트 누락 보충 | 실제 event ID만 이력 반영 |
| 목표 설정 ACK 유실·version mismatch | readback 확인 전 적용 완료 표시 안 함 |
| GNSS 무효·저속 course | 유효성 표시 및 미확인 방향 추정 금지 |
| GUIDED_DESCENT 및 금지 상태 모드 요청 | 탑재 허용표와 일치 |
| E22/ELRS 장애 조합 | 각 링크와 적용 정책 구분 |
| 저고도 목표 반경 밖 | 승인된 탑재 정책과 경고, GUI 자체 전이 없음 |
| 혼잡 중 긴급 요청 | 확정된 최악 지연·우선순위·중복 방지 검증 |
| 자동 전개와 긴급 요청 동시 발생 | 승인된 중재·결과, 중복 출력 방지 |
| GROUND GCS 종료·재시작 | poll 없는 위치 수신·fix age 유지 |
| 실제 두 E22의 송신창·RF 지연 | 동결 profile의 손실·지연 예산 충족 |

revision 1에서 확인된 것은 14개 메시지 생성, Python 분할 복원, C parser msgid 수신, HELLO byte 일치, CRC·서명 손상 및 replay 거부다. 이 결과는 revision 2 신규 메시지·스케줄·미션 동작 검증이 아니다.

revision 2 release 순서: 미정 결정 해소 → XML 변경 → generated C/Python·CRC·frame 길이 산출 → golden vector·교차 시험 → 모의 미션 → 출력 분리 PCB 시험 → 실제 탑재 통합. 문서가 개정됐다는 이유로 revision 1 manifest를 새 버전의 시험 증빙으로 사용하지 않는다.

## 15. 미정 결정과 구현 경계

| ID | 결정 | 완료 전 제한 |
| --- | --- | --- |
| TBC-LINK-01 | 송신창 표식·상대시각·guard·동기 상실 복구 | 혼합 송수신 실물 profile 미완료 |
| TBC-LINK-02 | 단계별 Hz·데이터 나이·지연·예산 | 실제 관측 성능 확정 금지 |
| TBC-MISSION-01 | 목표 허용 영역·영속성·ARM 준비 정책 | 실물 목표 적용 승인 전 |
| TBC-MISSION-02 | 저고도 목표 미도달 분기·AGL 추정 | 해당 전이·GUI 경계값 확정 금지 |
| TBC-MODE-01 | 모드 요청 경로 중재·RC/GNSS 무효 조합 | 실물 MANUAL 운용 미완료 |
| TBC-EMG-01 | 긴급 허용표·freshness·최대 지연·확인·재시도·선점 | 실물 긴급 송신 차단 |
| TBC-REC-01 | 회수 beacon 기간·주기·전원 예산 | 회수 운용 합격 기준 미완료 |
| TBC-WIRE-01 | 新필드·단위·ID·bit·offset·CRC·XML | revision 2 encoder/decoder 확정 전 |
| TBC-HW-01 | E22/ELRS 실제 revision·배선·firmware | 실물 지원 확정 금지 |

미정 정책과 무관하게 GUI 레이아웃, 정보 모델, 모의 위치·경로·전이 입력 및 로그 뷰 개발은 가능하다. 실제 명령 송신과 revision 2 serialization은 관련 계약 동결 뒤 구현한다.

## 16. 학습 안내

- ConOps §3.2와 TARGET 계약을 읽고 '입력 목표'와 '적용 목표' 차이를 설명한다.
- §3.9와 GUIDANCE 계약에서 heading/course/bearing의 차이와 오차 부호를 확인한다.
- periodic telemetry는 현재값, event는 발생 이력, response는 요청 결과라는 세 종류를 구분한다.
- ACK 유실 후 실제 적용 여부가 불명확한 사례를 그려 readback·dedup 필요성을 확인한다.
- STATUS 75B×주기와 POLL 왕복 127B×주기를 비교하고 uplink 수신 시간을 따로 예산화한다.
- 물리적 전개 확인 센서가 없을 때 GUI가 무엇까지 말할 수 있는지 구분한다.
- 50m 상대고도와 50m AGL이 같으려면 어떤 지형 가정이 필요한지 검토한다.

## 17. 참고 자료

- ConOps v0.1: 위 로컬 PDF, §1~§5. 미션의 직접 근거.
- S1 [Ebyte 작성 E22-400T22S 매뉴얼 공개 사본](https://fccid.io/2ALPH-E22400T22S/User-Manual/User-manual-4233671.pdf): UART·AUX·mode. 실제 revision 대조 필요.
- S2 [MAVLink Packet Serialization](https://mavlink.io/en/guide/serialization.html): frame·CRC·직렬화.
- S3 [MAVLink Signing](https://mavlink.io/en/guide/message_signing.html): 인증.
- S4 [MAVLink C Signing](https://mavlink.io/en/mavgen_c/message_signing_c.html): persistent timestamp 책임.
- S5 [MAVLink Command Protocol](https://mavlink.io/en/services/command.html): 수락·완료 및 결과 확인 개념.
- S6 [ExpressLRS Receiver Serial Protocols](https://www.expresslrs.org/software/serial-protocols/): 수신 serial 경로.
- S7 [ExpressLRS Radio Preparation](https://www.expresslrs.org/quick-start/transmitters/tx-prep/): arm 입력 의미.
- [v0.1 비교 조사 및 원래 wire 사전](communication_interface_v0.1.md): historical reference.

## 변경 이력

| 버전 | 날짜 | 내용 |
| --- | --- | --- |
| 0.1 | 2026-11-11 | 초기 조회 중심 구조 및 14-message XML 검증 |
| 0.2 | 2026-11-11 | ConOps 기준 주기·이벤트 통신, 목표·유도·모드·긴급·회수 계약과 미정 wire 경계 명시 |
| 0.2 보완 | 2026-11-11 | NURA 검토 후 로컬 HTTP 서비스 경계와 정보 모델 확정; RF wire 동결 상태는 변경 없음 |

## 18. PC 내부 인터페이스: NURA 검토 후 구현 기준

이 절의 HTTP/JSON은 브라우저와 PC 백엔드 사이 계약이다. E22 무선 프레임과 구분하며 NURA V2 Lite 패킷을 TUSI MAVLink 프레임으로 간주하지 않는다. NURA의 UI 구성을 참고하되 `protocol.py`, `uplink.py` 및 기존 브리지 드라이버를 그대로 가져오지 않는다. [검토 기록](nura_gcs_reference_and_decisions.md)에 근거를 남긴다.

### 18.1 상태 모델

공통 응답에는 `api_version: 1`, `source_mode`(REAL/SIM/REPLAY), `session_id`(PC 실행 세션), `vehicle_id`, `boot_id`, `snapshot_revision`을 둔다. 64비트 식별자·순번은 JavaScript 정밀도 손실을 막기 위해 JSON 문자열로 전달한다. 무선 필드에 없는 식별자를 실제 탑재 값으로 만들어 표시하지 않는다. 미수신 `boot_id` 등은 null이며 명령 준비 미완료 사유가 된다.

측정 항목은 `{value, unit, valid, source_time_ms, received_at_utc, age_ms, origin}` 구조를 사용한다. 무효·미제공 값은 null 및 valid=false로 표현하고 0으로 채우지 않는다. `origin`은 ONBOARD/BRIDGE/GCS_DERIVED를 구분한다. `age_ms`는 서버 단조 시계로 계산하며 브라우저는 정지된 응답이 최신인 것처럼 보이지 않게 로컬 경과시간도 반영한다. 재생 시 원본 수신 시각과 재생 시계를 구분한다.

snapshot은 `flight`, `navigation`, `guidance`, `target`, `links`, `health`, `logging`, `command_availability`로 나눈다. flight는 실제 state code/name 및 실제 control mode를 포함한다. 미지 코드는 UNKNOWN과 원시 코드로 보존한다. target은 편집값과 applied/readback revision을 구분한다. command_availability는 명령별 가능 여부와 불가 사유이며 화면 안내용이다. 송신 시 서버·탑재가 다시 검증한다.

### 18.2 엔드포인트

| 메서드·경로 | 계약 |
| --- | --- |
| GET `/api/v1/snapshot` | 현재 저장소 복사본. RF poll, 상태 전이 또는 시뮬레이션 전진을 발생시키지 않음 |
| GET `/api/v1/events?after=<cursor>&limit=200` | 세션 내 순서대로 이벤트 및 next_cursor, has_more 반환. limit 범위 1~1000 |
| POST `/api/v1/commands` | TARGET_SET/ARM/DISARM/MODE_REQUEST/EMERGENCY_REQUEST 요청을 검증하고 operation 생성. 유형별 payload는 본 문서 해당 논리 계약을 따름 |
| GET `/api/v1/commands/<operation_id>` | 현재 명령 상태·거부 사유·관련 ACK·관측 결과 조회 |
| GET `/api/v1/sessions` | 기록 세션 목록 및 source_mode·기간·완전성 조회 |

이벤트 cursor는 불투명 문자열이다. 다른 세션 cursor는 409 SESSION_MISMATCH, 보유 범위 이전 cursor는 410 CURSOR_EXPIRED와 현재 oldest_cursor를 반환한다. UI는 누락을 표시하고 snapshot을 다시 읽으며 중간 전이를 만들지 않는다. 세부 replay 제어·설정 API는 구현 시 별도 계약을 추가하고 RF API와 분리한다.

명령 요청 공통 필드는 `client_request_id`, `session_id`, `expected_boot_id`, `expected_state`, `type`, `payload`이다. 필요한 명령은 `expected_target_revision`과 명시적 운용자 확인을 포함한다. 서버가 wire transaction ID·유효기간·서명을 생성하며 브라우저는 원시 무선 바이트나 인증 키를 다루지 않는다.

유효 요청은 HTTP 202와 operation_id를 반환한다. 이는 로컬 접수일 뿐 로켓 수락이나 실행 성공이 아니다. 잘못된 형식은 400, 상태·세션 충돌은 409, REPLAY/정책 차단은 403, 의존 서비스 미준비는 503으로 반환한다. 오류 본문은 `error.code`, `error.message`, `error.details`를 제공한다. 명령 서비스는 백엔드 내부 큐로 전달하고 HTTP 응답 중 무선 ACK를 기다리지 않는다.

동일 세션에서 같은 client_request_id와 같은 내용은 기존 operation을 반환하고 재송신하지 않는다. 같은 ID의 내용 변경은 409이다. 프로세스 재시작 후에는 이전 세션 요청을 거부하고 미완료 명령을 자동 재개하지 않는다. 이 HTTP 중복 방지와 무선 수신기의 transaction 중복 방지는 별개이다.

명령 상태는 QUEUED, SENT, ACCEPTED, SUCCEEDED, REJECTED, EXPIRED, UNKNOWN을 사용한다. ACCEPTED는 실행 완료가 아니다. SUCCEEDED는 해당 명령 계약의 실행 응답·상태 또는 readback 조건이 충족된 경우에만 설정한다. 송신 후 ACK 유실로 결과를 알 수 없으면 UNKNOWN이며 실패나 성공으로 단정하지 않는다. 사후 상태만으로 명령 인과관계가 확인되지 않으면 관측 상태는 보여주되 명령 성공으로 바꾸지 않는다. 송신 전 유효기간 만료는 EXPIRED다.

### 18.3 서비스 경계와 무선 규격 동결

- 단일 전송 서비스가 serial read/write를 소유한다. 조회·명령·기록은 별도 소비자로 처리하고 웹 요청이 수신 패킷을 빼앗지 않는다.
- HTTP 재조회·화면 새로고침으로 ARM/COMMIT을 자동 재전송하지 않는다. NURA의 동일 프레임 재시도 루프를 이식하지 않으며 기존 COMMIT 재시도 제한을 유지한다.
- localhost 기본 바인딩, 명시적 허용 Host/Origin, 변경 요청의 CSRF 토큰 검증을 적용한다. 토큰은 무선 인증 키와 구분하며 외부 호스팅은 별도 범위이다.
- 모의 입력도 동일 검증·디코딩·상태 모델 경로를 사용한다. wire revision 2 동결 전 논리 모델 fixture와 revision 1 파서 시험은 구분하여 기록한다.
- 초기 구현은 Flask 단일 프로세스로 실행하고 개발용 auto-reloader를 꺼 중복 serial reader를 방지한다.
- 이 PC 계약 확정으로 TBC-WIRE-01, TBC-RF 및 미션 정책 항목이 해소되지는 않는다. 해당 항목은 §15 목록을 유지한다.

## 19. 2026-11-19 구현 참고: 개발용 수신 어댑터

지도·IMU·그래프 개발을 위해 `ground_station/protocol.py`에 **DEV_JSONL_1** 시험 어댑터를 추가했다. SIM과 USB/PTY가 같은 검증·정규화·저장소를 사용한다. [개발용 필드 계약 및 실행법](../ground_station/README.md)을 참조한다.

이 JSONL은 PC 화면 개발용 전체 스냅샷이며 MAVLink 프레임이 아니다. ID/CRC/서명/명령 처리에 대한 본 명세를 대체하지 않는다. 최종 무선 패킷은 사용자가 설계한 뒤 decoder 및 유효성/세션/인증 처리를 통해 정규화 모델로 연결한다. USB 포트가 열리거나 PTY 시험이 통과한 것을 E22 또는 ELRS 통합시험 통과로 기록하지 않는다.

HTTP snapshot에 현재 개발용 `gps`, `imu`, `target`, `transport`, `history`, `events`, `telemetry_age_ms`가 추가되었다. `history`는 최대 1,200개 전체 패킷, `events`는 현재 부팅에서 최대 200개 상태 변경 관측이다. 이는 §18의 최종 분리 이벤트 API·로그 서비스를 아직 구현한 것이 아니며, 파일 영속성이나 누락 이벤트 복구를 보장하지 않는다. 코드의 1초 stale/그래프 공백 기준은 개발 설정이며 최종 RF profile 확정값이 아니다.


## 2026-11-19 구현 계약 추가

- 중앙 3D는 제공된 OpenRocket 외형 치수로 구성한다. 도색·캐노피 형상은 개념 시각화임을 명시한다.
- recovery.main/drogue 보고가 없으면 FSM DEPLOY만으로 물리적 전개를 표시하지 않는다. physical_confirmed는 전개율·상태와 별도 표시한다.
- arming.source=AIRFRAME_BUTTON, button_pressed 및 armed는 bool/null인 선택 보고 필드다. 최종 binary wire allocation은 별도 확정한다.
- SQLite 세션 기록과 60초/정상종료 백업을 구현한다. 큐·디스크 실패·누락은 UI에서 식별할 수 있어야 한다. 백업은 최근 3개 보관하고 원본은 자동 삭제하지 않는다.
- 비행 기록 재생 UI, 최종 RF binary decoder, 실제 탑재 버튼/센서/낙하산 확인 신호 시험은 미완료다.

### 제어기 관측용 개발 확장 (2026-11-19)

DEV_JSONL_1의 선택 객체 `controller`에 제어 샘플 시각·상태·입력 출처·목표/현재 기수방위·오차·정규화 선회 명령·좌우 서보 명령각/실측각/PWM 명령을 추가했다. 상세 필드·범위·null 의미는 [개발 안내의 controller 계약](../ground_station/README.md#controller-개발-패킷-수신-전용)을 따른다. 이 객체는 수신/기록 전용이며 새로운 GCS 제어 명령을 정의하지 않는다. 최종 RF binary allocation·주기·좌표계·서보 보정은 탑재 담당과 합의 후 확정한다.
