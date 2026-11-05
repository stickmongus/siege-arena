// Serverless WebRTC P2P Room Manager powered by PeerJS

const PEER_PREFIX = 'smcsiege-v1-';

export class P2PRoomManager {
    constructor(callbacks = {}) {
        this.cb = callbacks;
        this.peer = null;
        this.conn = null;
        this.role = null; // 'host' | 'guest' | null
        this.roomCode = '';
        this.connected = false;
    }

    cleanup() {
        if (this.conn) {
            try { this.conn.close(); } catch (_) {}
            this.conn = null;
        }
        if (this.peer) {
            try { this.peer.destroy(); } catch (_) {}
            this.peer = null;
        }
        this.role = null;
        this.connected = false;
    }

    createRoom() {
        this.cleanup();
        if (!window.Peer) {
            this.emitStatus('PeerJS 라이브러리를 불러오지 못했습니다. 네트워크 연결을 확인하세요.', true);
            return '';
        }

        const code = String(Math.floor(1000 + Math.random() * 9000));
        this.roomCode = code;
        this.role = 'host';
        this.emitStatus(`방 코드 [${code}] 생성 중...`);

        const peer = new window.Peer(`${PEER_PREFIX}${code}`, {
            debug: 0
        });
        this.peer = peer;

        peer.on('open', () => {
            this.emitStatus(`대기 중 — 친구에게 방 코드 [${code}] 또는 초대 링크를 보내세요.`);
            if (this.cb.onRoomReady) this.cb.onRoomReady(code);
        });

        peer.on('connection', (conn) => {
            if (this.conn && this.connected) {
                conn.close();
                return;
            }
            this.bindConnection(conn);
        });

        peer.on('error', (err) => {
            if (err && err.type === 'unavailable-id') {
                // Retry with another random 4-digit code
                this.createRoom();
                return;
            }
            this.emitStatus(`P2P 오류: ${err?.type || err?.message || '연결 실패'}`, true);
        });

        return code;
    }

    joinRoom(rawCode) {
        const cleaned = String(rawCode || '').replace(/[^0-9]/g, '').slice(0, 4);
        if (cleaned.length !== 4) {
            this.emitStatus('4자리 숫자 방 코드를 입력해 주세요.', true);
            return;
        }

        this.cleanup();
        if (!window.Peer) {
            this.emitStatus('PeerJS 라이브러리를 불러오지 못했습니다.', true);
            return;
        }

        this.roomCode = cleaned;
        this.role = 'guest';
        this.emitStatus(`방 [${cleaned}]에 연결 시도 중...`);

        const peer = new window.Peer({ debug: 0 });
        this.peer = peer;

        peer.on('open', () => {
            const conn = peer.connect(`${PEER_PREFIX}${cleaned}`, { reliable: true });
            this.bindConnection(conn);
        });

        peer.on('error', (err) => {
            const msg = err?.type === 'peer-unavailable'
                ? `방 [${cleaned}]을 찾을 수 없습니다. 호스트가 대기 중인지 확인하세요.`
                : `연결 오류: ${err?.type || err?.message || '알 수 없음'}`;
            this.emitStatus(msg, true);
        });
    }

    bindConnection(conn) {
        this.conn = conn;

        conn.on('open', () => {
            this.connected = true;
            this.emitStatus(
                this.role === 'host'
                    ? '2P 플레이어 접속 완료! 맵을 고르고 대전을 시작하세요.'
                    : `방 [${this.roomCode}] 연결 완료! 호스트가 게임을 시작하면 자동 진입합니다.`
            );
            if (this.cb.onConnected) this.cb.onConnected(this.role, this.roomCode);
        });

        conn.on('data', (data) => {
            if (this.cb.onData) this.cb.onData(data);
        });

        conn.on('close', () => {
            this.connected = false;
            this.emitStatus('상대방과의 P2P 연결이 종료되었습니다.', true);
            if (this.cb.onDisconnected) this.cb.onDisconnected();
        });

        conn.on('error', () => {
            this.connected = false;
            this.emitStatus('데이터 채널 오류가 발생했습니다.', true);
        });
    }

    send(payload) {
        if (this.conn && this.connected && this.conn.open) {
            try {
                this.conn.send(payload);
            } catch (_) {}
        }
    }

    emitStatus(text, isError = false) {
        if (this.cb.onStatus) this.cb.onStatus(text, isError);
    }
}
