#include <iostream>

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

    std::cout << "Failures: " << failures << '\n';

    return failures == 0 ? 0 : 1;
}