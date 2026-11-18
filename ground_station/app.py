import argparse
from pathlib import Path
from recorder import FlightRecorder
from flask import Flask, jsonify, render_template
from state_store import StateStore
from simulator import Simulator


def create_app(store=None):
    app = Flask(__name__)
    app.config["TEMPLATES_AUTO_RELOAD"] = True
    store = store if store is not None else StateStore()

    @app.get("/")
    def index():
        return render_template("index.html")

    @app.get("/api/v1/snapshot")
    def get_snapshot():
        response = jsonify(store.get_snapshot())
        response.headers["Cache-Control"] = "no-store"
        return response

    return app


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="TUSI Ground Station")
    parser.add_argument("--mode", choices=["sim", "serial"], default="sim")
    parser.add_argument("--port", help="예: /dev/ttyUSB0")
    parser.add_argument("--baud", type=int, default=115200)
    parser.add_argument("--http-port", type=int, default=8080)
    parser.add_argument("--data-dir", default=str(Path(__file__).parent / "data"))
    args = parser.parse_args()
    if args.mode == "serial" and not args.port:
        parser.error("serial 모드에는 --port가 필요합니다.")
    store = StateStore("SIM" if args.mode == "sim" else "REAL")
    if args.mode == "sim":
        source = Simulator(store)
    else:
        from transport import SerialReceiver
        source = SerialReceiver(store, args.port, args.baud)
    recorder = FlightRecorder(args.data_dir, store.get_snapshot()["source_mode"], store.get_snapshot()["session_id"])
    store.recorder = recorder
    recorder.start()
    recorder.ready.wait(5)
    app = create_app(store)
    source.start()
    try:
        app.run(host="127.0.0.1", port=args.http_port, debug=False, use_reloader=False)
    finally:
        source.stop()
        source.join()
        recorder.stop()
        recorder.join()
