"""USB 시리얼 수신. 한 스레드만 포트를 소유하며 명령은 송신하지 않는다."""
from threading import Event, Thread
from protocol import decode_frame, MAX_FRAME_BYTES


class LineDecoder:
    def __init__(self, store):
        self.store = store
        self.buffer = bytearray()
        self.discard = False

    def feed(self, chunk):
        for byte in chunk:
            if byte == 10:
                if not self.discard and self.buffer:
                    self.store.capture_raw(bytes(self.buffer))
                    try:
                        self.store.ingest(decode_frame(bytes(self.buffer)))
                    except (ValueError, TypeError, KeyError, UnicodeError, RecursionError) as error:
                        self.store.reject(error)
                self.buffer.clear()
                self.discard = False
            elif not self.discard:
                self.buffer.append(byte)
                if len(self.buffer) > MAX_FRAME_BYTES:
                    self.store.reject("프레임 크기 초과: 다음 줄바꿈까지 폐기")
                    self.buffer.clear()
                    self.discard = True


class SerialReceiver(Thread):
    def __init__(self, store, port, baud):
        super().__init__(name="serial-receiver", daemon=True)
        import serial
        self.serial = serial
        self.store, self.port, self.baud = store, port, baud
        self.stop_event = Event()

    def run(self):
        while not self.stop_event.is_set():
            self.store.set_transport("CONNECTING", self.port)
            try:
                with self.serial.Serial(self.port, self.baud, timeout=.2, exclusive=True) as link:
                    parser = LineDecoder(self.store)
                    self.store.set_transport("OPEN", f"{self.port} · {self.baud} baud · USB 열림, RF 미확인")
                    while not self.stop_event.is_set():
                        parser.feed(link.read(1024))
            except (self.serial.SerialException, OSError) as error:
                self.store.set_transport("DISCONNECTED", str(error)[:180])
                self.stop_event.wait(1)
        self.store.set_transport("STOPPED", "시리얼 수신 종료")

    def stop(self):
        self.stop_event.set()
