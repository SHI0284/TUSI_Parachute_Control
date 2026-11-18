#include <iostream>
#include <limits>

#include "flight_config.h"
#include "launch_detector.h"

int failures = 0;

void check(const char* name, bool passed) {
    std::cout << (passed ? "[PASS] " : "[FAIL] ")
              << name << '\n';

    if (!passed) {
        ++failures;
    }
}

int main() {
    // PC 테스트용 설정. 실제 비행 설정이 아니다.
    avionics::LaunchDetectorConfig config{
        20.0f,  // 가속도 기준: m/s²
        60,     // 유지 시간: ms
        30      // 최대 샘플 간격: ms
    };

    avionics::LaunchDetector detector(config);

    // 1. 한 번 높은 값이 나왔다고 감지하면 안 된다.
    check("First high sample", !detector.update(25.0f, 0, true));

    check("High for 20 ms", !detector.update(25.0f, 20, true));

    check("High for 40 ms", !detector.update(25.0f, 40, true));

    check("High for 60 ms", detector.update(25.0f, 60, true));

    // 2. 중간에 기준 미만이 되면 처음부터 다시 세야 한다.
    detector.reset();

    detector.update(25.0f, 0, true);
    detector.update(10.0f, 20, true);

    check(
        "Low sample resets the timer",
        !detector.update(25.0f, 40, true)
    );

    check(
        "Old high time is not reused",
        !detector.update(25.0f, 60, true)
    );

    // 3. 측정값이 오래 끊겼다면 연속 유지로 인정하지 않는다.
    detector.reset();

    detector.update(25.0f, 0, true);

    check(
        "Long sample gap rejected",
        !detector.update(25.0f, 100, true)
    );

    // 4. 무효 데이터는 감지에 사용하지 않는다.
    detector.reset();

    detector.update(25.0f, 0, true);

    check(
        "Invalid sample rejected",
        !detector.update(25.0f, 20, false)
    );

    check(
        "Timer restarts after invalid sample",
        !detector.update(25.0f, 40, true)
    );

    // 5. 같은 시각의 샘플을 중복 사용하지 않는다.
    detector.reset();

    detector.update(25.0f, 100, true);

    check(
        "Duplicate timestamp rejected",
        !detector.update(25.0f, 100, true)
    );

    // 6. 설정 검증: 잘못된 설정은 configValid()가 거절해야 한다.
    const float nan = std::numeric_limits<float>::quiet_NaN();
    const float inf = std::numeric_limits<float>::infinity();
    const float g = avionics::kStandardGravityMps2;

    // 임계값, 유지 시간, 최대 간격으로 감지기를 만들고 설정 유효 여부를 돌려준다.
    auto configIsValid = [](float thresholdMps2,
                            std::uint64_t holdTimeMs,
                            std::uint64_t maxSampleGapMs) {
        avionics::LaunchDetectorConfig c{thresholdMps2, holdTimeMs, maxSampleGapMs};
        return avionics::LaunchDetector(c).configValid();
    };

    check(
        "Test config is valid",
        avionics::LaunchDetector(avionics::kTestLaunchConfig).configValid()
    );

    check("Config used above is valid", detector.configValid());

    check("NaN threshold rejected", !configIsValid(nan, 60, 30));

    check("Infinite threshold rejected", !configIsValid(inf, 60, 30));

    check("Zero threshold rejected", !configIsValid(0.0f, 60, 30));

    check("Negative threshold rejected", !configIsValid(-20.0f, 60, 30));

    // 경계값: 정확히 1 g는 정지 상태에서도 충족되므로 거절한다.
    check("Threshold equal to 1 g rejected", !configIsValid(g, 60, 30));

    check("Threshold below 1 g rejected", !configIsValid(5.0f, 60, 30));

    check("Zero hold time rejected", !configIsValid(20.0f, 0, 30));

    check("Zero max sample gap rejected", !configIsValid(20.0f, 60, 0));

    check("All-zero config rejected", !configIsValid(0.0f, 0, 0));

    // 7. 설정이 잘못되면 높은 가속도가 계속 들어와도 감지하지 않는다.
    avionics::LaunchDetectorConfig belowGravity{5.0f, 60, 30};
    avionics::LaunchDetector invalidDetector(belowGravity);

    bool detectedWithInvalidConfig = false;
    for (std::uint64_t t = 0; t <= 200; t += 20) {
        if (invalidDetector.update(25.0f, t, true)) {
            detectedWithInvalidConfig = true;
        }
    }

    check(
        "Invalid config never detects launch",
        !detectedWithInvalidConfig
    );

    std::cout << "Failures: " << failures << '\n';

    return failures == 0 ? 0 : 1;
}