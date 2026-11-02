#pragma once

#include <cstdint>

namespace avionics {

struct LaunchDetectorConfig {
    float thresholdMps2;           // 가속도 임계값 (m/s^2)
    std::uint64_t holdTimeMs;      // 임계값을 초과한 상태를 유지해야 하는 최소 시간 (ms)
    std::uint64_t maxSampleGapMs;  // 이전 샘플과 현재 샘플 사이의 최대 허용 시간 간격 (ms)
};

class LaunchDetector {
public:
    explicit LaunchDetector(LaunchDetectorConfig config);   // 생성자: 구성 설정을 받아서 초기화

    bool update(
        float acceleration,      // 현재 가속도 값 (m/s^2)
        std::uint64_t timeMs,    // 현재 샘플의 시간 (ms)
        bool valid               // 현재 샘플이 유효한지 여부
    );

    void reset();                // 상태를 초기화하여 추적을 중단하고 이전 샘플 정보를 지움

private:
    LaunchDetectorConfig config_; // 구성 설정을 저장하는 멤버 변수

    bool hasPreviousSample_ = false;  // 이전 샘플이 있는지 여부
    bool tracking_ = false;           // 추적 중인지 여부

    std::uint64_t previousTimeMs_ = 0;  // 이전 샘플의 시간 (ms)
    std::uint64_t startTimeMs_ = 0;    // 추적 시작 시간 (ms)
};

}  // namespace avionics