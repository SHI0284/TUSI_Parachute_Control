#pragma once // 여러 파일에서 이 헤더를 포함해도 하나의 컴파일 단위에서 중복으로 처리되지 않게 함

namespace avionics {
    // 여기에 비행 타입 정의 추가
    // 우리가 정의한 이름을 avionics라는 공간에 묶어 다른 코드의 이름과 충돌하는 것을 감소

    enum class FlightState { // 정해진 선택지 중 하나를 표현하는 자료형
        INIT,
        SAFE,
        ARMED,
        LAUNCH,
        COAST,
        APOGEE,
        DEPLOY,
        STABILIZATION,
        GUIDED_DESCENT,
        FINAL_DESCENT,
        GROUND,
        FAULT
    };

    enum class ControlMode {
        AUTO,
        MANUAL
    };
};