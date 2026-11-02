#include "launch_detector.h"

#include <cmath>

namespace avionics {

LaunchDetector::LaunchDetector(LaunchDetectorConfig config)
    : config_(config) {
}

void LaunchDetector::reset() {
    hasPreviousSample_ = false;
    tracking_ = false;

    previousTimeMs_ = 0;
    startTimeMs_ = 0;
}

bool LaunchDetector::update(
    float acceleration,
    std::uint64_t timeMs,
    bool valid
) {
    // 설정이 잘못됐으면 감지하지 않는다.
    if (!std::isfinite(config_.thresholdMps2) ||
        config_.thresholdMps2 <= 0.0f ||
        config_.holdTimeMs == 0 ||
        config_.maxSampleGapMs == 0) {
        reset();
        return false;
    }

    // 무효 데이터는 조건 유지의 근거로 사용하지 않는다.
    if (!valid || !std::isfinite(acceleration)) {
        reset();
        return false;
    }

    if (hasPreviousSample_) {
        // 시간이 중복되거나 과거로 돌아간 경우
        if (timeMs <= previousTimeMs_) {
            reset();
            return false;
        }

        // 데이터가 너무 오래 끊긴 경우
        if (timeMs - previousTimeMs_ > config_.maxSampleGapMs) {
            reset();
            return false;
        }
    }

    previousTimeMs_ = timeMs;
    hasPreviousSample_ = true;

    // 기준 미만이면 연속 유지 구간을 종료한다.
    if (acceleration < config_.thresholdMps2) {
        tracking_ = false;
        return false;
    }

    // 기준 이상인 첫 샘플에서 시간 측정을 시작한다.
    if (!tracking_) {
        tracking_ = true;
        startTimeMs_ = timeMs;
        return false;
    }

    // 기준 이상인 상태가 충분히 오래 유지됐는지 확인한다.
    return timeMs - startTimeMs_ >= config_.holdTimeMs;
}

}  // namespace avionics