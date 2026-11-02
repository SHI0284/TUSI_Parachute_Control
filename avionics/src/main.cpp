#include <Arduino.h>
#include "flight_fsm.h"

void printCheck(const char* name, bool passed) {
    Serial.print(name);
    Serial.println(passed ? ": PASS" : ": FAIL");
}

void setup() {
    Serial.begin(115200);

    avionics::FlightFSM normalFsm;

    printCheck(
        "Initial state",
        normalFsm.state() == avionics::FlightState::INIT
    );

    bool accepted = normalFsm.completeInitialization(true);

    printCheck(
        "INIT -> SAFE",
        accepted &&
        normalFsm.state() == avionics::FlightState::SAFE
    );

    accepted = normalFsm.completeInitialization(false);

    printCheck(
        "Repeated initialization rejected",
        !accepted &&
        normalFsm.state() == avionics::FlightState::SAFE
    );

    avionics::FlightFSM failedFsm;
    accepted = failedFsm.completeInitialization(false);

    printCheck(
        "INIT -> FAULT",
        accepted &&
        failedFsm.state() == avionics::FlightState::FAULT
    );
}

void loop() {
    delay(1000);
}