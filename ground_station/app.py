from uuid import uuid4

from flask import Flask, jsonify, render_template


app = Flask(__name__)

# 서버를 실행할 때 한 번 생성한다.
# 브라우저를 새로고침해도 같은 세션을 유지한다.
snapshot = {
    "api_version": 1,
    "source_mode": "SIM",
    "session_id": str(uuid4()),
    "vehicle_id": None,
    "boot_id": None,
    "snapshot_revision": "0",
    "flight": {
        "state_code": None,
        "state_name": "UNKNOWN",
        "control_mode": None,
    },
}


@app.get("/")
def index():
    return render_template("index.html", snapshot=snapshot)


@app.get("/api/v1/snapshot")
def get_snapshot():
    # 조회만 수행한다. 상태나 모의 시간을 변경하지 않는다.
    response = jsonify(snapshot)
    response.headers["Cache-Control"] = "no-store"
    return response


if __name__ == "__main__":
    app.run(
        host="127.0.0.1",
        port=8080,
        debug=False,
        use_reloader=False,
    )