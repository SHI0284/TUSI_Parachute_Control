#include "flight_fsm.h"

namespace avionics {
    FlightState FlightFSM::state() const {
        return state_;
    }

    bool FlightFSM::completeInitialization(bool success) {
        if (state_ != FlightState::INIT) {
            return false; // 이미 초기화가 완료된 상태라면 false 반환
        }
        state_ = success ? FlightState::SAFE : FlightState::FAULT;
        return true; // 초기화 완료 상태로 변경 성공
    }

    bool FlightFSM::requestArm() {
        if (state_ != FlightState::SAFE) {
            return false;
        }

        state_ = FlightState::ARMED;
        return true;
    }

    bool FlightFSM::requestDisarm() {
        if (state_ != FlightState::ARMED) {
            return false;
        }

        state_ = FlightState::SAFE;
        return true;
    }
}