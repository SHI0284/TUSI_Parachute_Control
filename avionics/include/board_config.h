#pragma once

namespace board{
    namespace flight{
        // I2C 센서 버스
        constexpr int I2C_SDA_PIN = 21;
        constexpr int I2C_SCL_PIN = 22;

        // 낙하산 조향 신호
        constexpr int SERVO_1_PIN = 26;
        constexpr int SERVO_2_PIN = 14;

        // E22 UART: RX/TX는 ESP32 기준
        constexpr int E22_RX_PIN = 16;  // E22 TXD에서 받음
        constexpr int E22_TX_PIN = 17;  // E22 RXD로 보냄

        constexpr int E22_M0_PIN = 18;
        constexpr int E22_M1_PIN = 19;
        constexpr int E22_AUX_PIN = 23;
        constexpr int E22_RESET_PIN = 5;

        // RP1 UART: RX/TX는 ESP32 기준
        constexpr int ELRS_RX_PIN = 32;
        constexpr int ELRS_TX_PIN = 33;

        // GPS TXD에서 받는 ESP32 입력
        constexpr int GPS_RX_PIN = 25;

        // GPS_TX_PIN은 아직 정의하지 않는다.
        // 회로도의 GPS RXD는 입력 전용 GPIO34에 연결되어 있어
        // 송신 배선 수정 또는 운용 방식 확정이 필요하다.

        // 전개 및 착륙다리 제어 신호
        constexpr int PYRO_AUTO_PIN = 13;
        constexpr int PYRO_MANUAL_PIN = 27;

        constexpr int LEG_AUTO_PIN = 4;
        constexpr int LEG_MANUAL_PIN = 2;

        // 전압 감지 입력
        constexpr int PYRO_SENSE_PIN = 36;
        constexpr int LEG_SENSE_PIN = 39;

        // 기본적인 핀 중복 검사
        static_assert(
            I2C_SDA_PIN != I2C_SCL_PIN,
            "I2C SDA and SCL must use different pins"
        );

        static_assert(
            E22_RX_PIN != E22_TX_PIN,
            "E22 RX and TX must use different pins"
        );

    }
}