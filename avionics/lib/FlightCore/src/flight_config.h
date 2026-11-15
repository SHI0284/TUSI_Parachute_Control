#pragma once

#include "launch_detector.h"

namespace avionics {

// 표준 중력가속도 (정의값). 발사 임계값의 하한 검사에 사용한다. (발사 조건으로는 이 값보다 높은 값이 유지되어야 한다.)
constexpr float kStandardGravityMps2 = 9.80665f;

// TEST ONLY, 비행값 아님. 비행용 값은 DEC-07에서 확정
constexpr LaunchDetectorConfig kTestLaunchConfig{
    30.0f,                // thresholdMps2
    100,                  // holdTimeMs
    50                    // maxSampleGapMs
};
static_assert(kTestLaunchConfig.thresholdMps2 > kStandardGravityMps2, "Launch threshold is not above standard gravity");
} // namespace avionics
