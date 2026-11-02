#pragma once

#include "flight_types.h"

namespace avionics {
    class FlightFSM { // 현재 상태와 상태를 변경하는 기능을 하나로 묶음
        public: // 외부 코드에서 호출 가능
            FlightState state() const; // 현재 상태를 반환하는 함수

            bool completeInitialization(bool success);

            bool requestArm(); // SAFE 상태에서 ARMED 상태로 변경 요청
            bool requestDisarm(); // ARMED 상태에서 SAFE 상태로 변경 요청
        
        private: // 외부에서 접근 못하게, 다른 코드가 접근 못함
            FlightState state_ = FlightState::INIT; // 현재 상태를 저장하는 변수 끝의 _는 멤버 변수라는 것을 알아보기 위한 이름 규칙

    };
}