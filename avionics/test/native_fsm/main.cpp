//이 파일은 PC에서만 테스트를 진행하기 위해 작성된 코드입니다.
#include <iostream>
#include "flight_fsm.h"

int failures = 0;

void check(const char* name, bool passed) {
    std::cout << (passed ? "[PASS] " : "[FAIL] ")
              << name << '\n';

    if (!passed) {
        ++failures;
    }
}

int main() {
    using avionics::FlightFSM;
    using avionics::FlightState;

    FlightFSM normalFsm;

    check(
        "Starts in INIT",
        normalFsm.state() == FlightState::INIT
    );

    bool accepted = normalFsm.completeInitialization(true);

    check(
        "Initialization success: INIT -> SAFE",
        accepted && normalFsm.state() == FlightState::SAFE
    );

    accepted = normalFsm.completeInitialization(false);

    check(
        "Repeated initialization cannot change SAFE",
        !accepted && normalFsm.state() == FlightState::SAFE
    );

    FlightFSM failedFsm;

    accepted = failedFsm.completeInitialization(false);

    check(
        "Initialization failure: INIT -> FAULT",
        accepted && failedFsm.state() == FlightState::FAULT
    );

    accepted = failedFsm.completeInitialization(true);

    check(
        "Repeated initialization cannot clear FAULT",
        !accepted && failedFsm.state() == FlightState::FAULT
    );

    // 아직 초기화하지 않은 객체에서는 ARM 거절
    FlightFSM uninitializedFsm;

    accepted = uninitializedFsm.requestArm();

    check(
        "ARM rejected in INIT",
        !accepted &&
        uninitializedFsm.state() == FlightState::INIT
    );

    // 기존 성공 경로 객체는 현재 SAFE 상태
    accepted = normalFsm.requestDisarm();

    check(
        "DISARM rejected in SAFE",
        !accepted &&
        normalFsm.state() == FlightState::SAFE
    );

    // SAFE에서 ARM 허용
    accepted = normalFsm.requestArm();

    check(
        "ARM: SAFE -> ARMED",
        accepted &&
        normalFsm.state() == FlightState::ARMED
    );

    // 이미 ARMED이면 반복 ARM 거절
    accepted = normalFsm.requestArm();

    check(
        "Repeated ARM rejected",
        !accepted &&
        normalFsm.state() == FlightState::ARMED
    );

    // ARMED에서 DISARM 허용
    accepted = normalFsm.requestDisarm();

    check(
        "DISARM: ARMED -> SAFE",
        accepted &&
        normalFsm.state() == FlightState::SAFE
    );

    // 기존 실패 경로 객체는 현재 FAULT 상태
    accepted = failedFsm.requestArm();

    check(
        "ARM rejected in FAULT",
        !accepted &&
        failedFsm.state() == FlightState::FAULT
    );

    std::cout << "Failures: " << failures << '\n';

    return failures == 0 ? 0 : 1;
}