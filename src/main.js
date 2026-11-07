// Main Application Controller — Modes, Input, HUD, Editor Integration & P2P Loop

import {
    MATERIALS,
    MATERIAL_ORDER,
    WEAPONS,
    SOLO_STAGES,
    DUEL_ARENAS,
    encodeMapData,
    decodeMapData
} from './stages.js';
import { SiegeWorld } from './physics.js';
import { SiegeBotAI } from './ai.js';
import { P2PRoomManager } from './net.js';
import { FortressEditor, SHAPE_PRESETS } from './editor.js';
import { sound } from './audio.js';

const STARS_STORAGE_KEY = 'breaker_siege_solo_stars_v1';

class BreakerApp {
    constructor() {
        this.canvas = document.getElementById('game-canvas');
        this.world = new SiegeWorld(this.canvas);
        this.botAI = new SiegeBotAI();
        this.editor = new FortressEditor();

        this.activeMode = 'solo'; // 'solo' | 'ai' | 'p2p' | 'editor'
        this.soloIdx = 0;
        this.duelIdx = 0;
        this.currentStageData = SOLO_STAGES[0];
        this.testingFromEditor = false;
        this.resultShownForMatch = false;

        this.keys = {};
        this.touchMoveLeft = false;
        this.touchMoveRight = false;
        this.touchJump = false;
        this.activeTouches = new Map();
        this.aimPointerId = null;
        this.lastPinchMidX = null;

        this.localTeam = 1; // 1 for solo/AI/P2P-host, 2 for P2P-guest
        this.lastNetSentAt = 0;
        this.soloStars = this.loadStars();

        this.p2p = new P2PRoomManager({
            onStatus: (msg, isErr) => this.updateP2PStatus(msg, isErr),
            onRoomReady: (code) => {
                document.getElementById('room-code-box').textContent = code;
            },
            onConnected: (role) => {
                this.localTeam = role === 'host' ? 1 : 2;
                const startBtn = document.getElementById('btn-p2p-start');
                startBtn.disabled = role !== 'host';
                this.showToast(role === 'host' ? '2P 게스트가 입장했습니다!' : '호스트 방에 연결되었습니다!');
            },
            onDisconnected: () => {
                document.getElementById('btn-p2p-start').disabled = true;
                this.showToast('P2P 연결이 종료되었습니다.');
            },
            onData: (pkt) => this.onP2PPacket(pkt)
        });

        this.bindUI();
        this.buildEditorPalette();
        this.populateStageModal();
        this.handleInitialURLParams();

        window.addEventListener('resize', () => this.world.resize());
        window.addEventListener('orientationchange', () => {
            setTimeout(() => this.world.resize(), 120);
        });
        requestAnimationFrame((ts) => this.loop(ts));
    }

    loadStars() {
        try {
            return JSON.parse(localStorage.getItem(STARS_STORAGE_KEY) || '{}');
        } catch (_) {
            return {};
        }
    }

    saveStar(stageId, stars) {
        if (!stageId || stars <= 0) return;
        const prev = this.soloStars[stageId] || 0;
        if (stars > prev) {
            this.soloStars[stageId] = stars;
            try {
                localStorage.setItem(STARS_STORAGE_KEY, JSON.stringify(this.soloStars));
            } catch (_) {}
        }
    }

    showToast(text) {
        const el = document.getElementById('toast-banner');
        el.textContent = text;
        el.classList.add('visible');
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => el.classList.remove('visible'), 2200);
    }

    updateP2PStatus(msg, isErr = false) {
        const log = document.getElementById('p2p-status-log');
        log.textContent = msg;
        log.style.color = isErr ? 'var(--accent-red)' : 'var(--accent-teal)';
    }

    bindHoldButton(btnId, onChange) {
        const btn = document.getElementById(btnId);
        if (!btn) return;
        const activeIds = new Set();
        const release = (e) => {
            if (activeIds.delete(e.pointerId) && activeIds.size === 0) {
                btn.classList.remove('pressed');
                onChange(false);
            }
        };
        btn.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            sound.ensureContext();
            try {
                btn.setPointerCapture(e.pointerId);
            } catch (_) {}
            activeIds.add(e.pointerId);
            btn.classList.add('pressed');
            onChange(true);
        });
        btn.addEventListener('pointerup', release);
        btn.addEventListener('pointercancel', release);
        btn.addEventListener('lostpointercapture', release);
        btn.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    syncEditorEraseBtn() {
        const btn = document.getElementById('btn-editor-erase');
        if (!btn) return;
        btn.textContent = this.editor.eraseMode ? '삭제 모드 ON' : '삭제 모드 OFF';
        btn.classList.toggle('danger-toggle', this.editor.eraseMode);
    }

    bindUI() {
        // Mode tabs
        document.getElementById('tab-solo').addEventListener('click', () => {
            this.testingFromEditor = false;
            this.switchMode('solo', SOLO_STAGES[this.soloIdx]);
        });
        document.getElementById('tab-ai').addEventListener('click', () => {
            this.testingFromEditor = false;
            this.switchMode('ai', DUEL_ARENAS[this.duelIdx]);
        });
        document.getElementById('tab-p2p').addEventListener('click', () => {
            this.testingFromEditor = false;
            this.openModal('modal-p2p');
        });
        document.getElementById('tab-editor').addEventListener('click', () => {
            this.testingFromEditor = false;
            this.enterEditorMode();
        });

        // Header actions
        document.getElementById('btn-zoom-view').addEventListener('click', (e) => {
            const next = !this.world.zoomMode;
            this.world.setZoomMode(next);
            e.currentTarget.textContent = next ? '시야 전체' : '시야 확대';
            e.currentTarget.classList.toggle('active-toggle', next);
            document.getElementById('zoom-pan-bar').classList.toggle('visible', next);
            sound.uiClick();
        });
        document.getElementById('zoom-pan-slider').addEventListener('input', (e) => {
            this.world.setCameraPanNorm(Number(e.target.value) / 100);
        });
        document.getElementById('btn-stage-menu').addEventListener('click', () => {
            this.populateStageModal();
            this.openModal('modal-stages');
        });
        document.getElementById('btn-reset-match').addEventListener('click', () => this.restartCurrent());
        document.getElementById('btn-mute-audio').addEventListener('click', (e) => {
            const muted = sound.toggleMute();
            e.currentTarget.textContent = muted ? '사운드 OFF' : '사운드 ON';
        });
        document.getElementById('btn-editor-return').addEventListener('click', () => {
            this.testingFromEditor = false;
            this.enterEditorMode();
        });

        // Floating Mid-Air Special Detonation Button
        const specialBtn = document.getElementById('btn-midair-special');
        specialBtn.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            sound.ensureContext();
            this.triggerLocalMidAirSpecial();
        });

        // Mobile Duel Tank Touch D-Pad
        this.bindHoldButton('touch-left', (pressed) => { this.touchMoveLeft = pressed; });
        this.bindHoldButton('touch-right', (pressed) => { this.touchMoveRight = pressed; });
        this.bindHoldButton('touch-jump', (pressed) => { this.touchJump = pressed; });

        // Weapon buttons
        for (let i = 0; i < 4; i++) {
            document.getElementById(`wep-btn-${i}`).addEventListener('click', () => this.selectWeapon(i));
        }

        // Modal close buttons
        document.getElementById('btn-close-stages').addEventListener('click', () => this.closeModal('modal-stages'));
        document.getElementById('btn-close-p2p').addEventListener('click', () => this.closeModal('modal-p2p'));
        document.getElementById('btn-close-share').addEventListener('click', () => this.closeModal('modal-share'));

        // P2P Lobby actions
        document.getElementById('btn-create-room').addEventListener('click', () => {
            this.p2p.createRoom();
        });
        document.getElementById('btn-copy-invite').addEventListener('click', () => {
            if (!this.p2p.roomCode) {
                this.showToast('먼저 [방 코드 생성]을 눌러주세요.');
                return;
            }
            const url = `${window.location.origin}${window.location.pathname}?room=${this.p2p.roomCode}`;
            navigator.clipboard?.writeText(url).then(
                () => this.showToast(`초대 링크 복사 완료! (방 코드: ${this.p2p.roomCode})`),
                () => this.showToast(`방 코드: ${this.p2p.roomCode}`)
            );
        });
        document.getElementById('btn-join-room').addEventListener('click', () => {
            const code = document.getElementById('input-join-code').value;
            this.p2p.joinRoom(code);
        });
        document.getElementById('btn-p2p-start').addEventListener('click', () => {
            if (this.p2p.role !== 'host' || !this.p2p.connected) return;
            const sel = document.getElementById('p2p-arena-select').value;
            const stage = sel === 'custom'
                ? this.editor.toPlayableStage()
                : DUEL_ARENAS[Number(sel) || 0];
            this.startHostP2PMatch(stage);
        });

        // Editor controls
        document.getElementById('btn-editor-erase').addEventListener('click', () => {
            this.editor.eraseMode = !this.editor.eraseMode;
            this.syncEditorEraseBtn();
            sound.uiClick();
        });
        document.getElementById('btn-shape-cycle').addEventListener('click', (e) => {
            this.editor.eraseMode = false;
            this.syncEditorEraseBtn();
            this.editor.presetIdx = (this.editor.presetIdx + 1) % SHAPE_PRESETS.length;
            e.currentTarget.textContent = `크기: ${SHAPE_PRESETS[this.editor.presetIdx].label}`;
            sound.uiClick();
        });
        document.getElementById('btn-rot-left').addEventListener('click', () => this.editor.rotateBrush(-15));
        document.getElementById('btn-rot-right').addEventListener('click', () => this.editor.rotateBrush(15));
        document.getElementById('btn-mirror-toggle').addEventListener('click', (e) => {
            this.editor.mirrorMode = !this.editor.mirrorMode;
            e.currentTarget.textContent = this.editor.mirrorMode ? '좌우 대칭 ON' : '좌우 대칭 OFF';
            e.currentTarget.classList.toggle('active-toggle', this.editor.mirrorMode);
        });
        document.getElementById('btn-editor-clear').addEventListener('click', () => {
            this.editor.resetDefaultTemplate();
            this.refreshEditorPreviewWorld();
            this.showToast('기본 지형 템플릿으로 초기화했습니다.');
        });
        document.getElementById('btn-map-share').addEventListener('click', () => {
            const code = encodeMapData(this.editor.toPlayableStage());
            document.getElementById('textarea-map-code').value = code;
            this.openModal('modal-share');
        });
        document.getElementById('btn-copy-map-code').addEventListener('click', () => {
            const code = document.getElementById('textarea-map-code').value;
            navigator.clipboard?.writeText(code);
            this.showToast('맵 코드가 클립보드에 복사되었습니다.');
        });
        document.getElementById('btn-copy-map-url').addEventListener('click', () => {
            const code = encodeMapData(this.editor.toPlayableStage());
            const url = `${window.location.origin}${window.location.pathname}?map=${code}`;
            navigator.clipboard?.writeText(url);
            this.showToast('공유 URL이 클립보드에 복사되었습니다!');
        });
        document.getElementById('btn-load-map-code').addEventListener('click', () => {
            try {
                const raw = document.getElementById('textarea-map-code').value;
                const parsed = decodeMapData(raw);
                this.editor.loadFromMapObject(parsed);
                this.refreshEditorPreviewWorld();
                this.closeModal('modal-share');
                this.showToast('커스텀 맵을 성공적으로 불러왔습니다!');
            } catch (err) {
                this.showToast(err.message || '맵 코드를 해석할 수 없습니다.');
            }
        });
        document.getElementById('btn-test-solo').addEventListener('click', () => {
            this.testingFromEditor = true;
            this.switchMode('solo', this.editor.toPlayableStage('solo'));
        });
        document.getElementById('btn-test-duel').addEventListener('click', () => {
            this.testingFromEditor = true;
            this.switchMode('ai', this.editor.toPlayableStage('duel'));
        });

        // Result modal buttons
        document.getElementById('btn-result-retry').addEventListener('click', () => {
            this.closeModal('modal-result');
            if (this.activeMode === 'p2p' && this.p2p.role === 'host') {
                this.startHostP2PMatch(this.currentStageData);
            } else {
                this.restartCurrent();
            }
        });
        document.getElementById('btn-result-next').addEventListener('click', () => {
            this.closeModal('modal-result');
            if (this.activeMode === 'solo') {
                this.soloIdx = (this.soloIdx + 1) % SOLO_STAGES.length;
                this.switchMode('solo', SOLO_STAGES[this.soloIdx]);
            } else {
                this.duelIdx = (this.duelIdx + 1) % DUEL_ARENAS.length;
                this.switchMode('ai', DUEL_ARENAS[this.duelIdx]);
            }
        });
        document.getElementById('btn-result-editor').addEventListener('click', () => {
            this.closeModal('modal-result');
            this.testingFromEditor = false;
            this.enterEditorMode();
        });

        // Unified Pointer Events (Mouse + Multi-Touch) & Keyboard
        this.canvas.addEventListener('pointerdown', (e) => this.onCanvasPointerDown(e));
        this.canvas.addEventListener('pointermove', (e) => this.onCanvasPointerMove(e));
        this.canvas.addEventListener('pointerup', (e) => this.onCanvasPointerUp(e));
        this.canvas.addEventListener('pointercancel', (e) => this.onCanvasPointerCancel(e));
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
        this.canvas.addEventListener('wheel', (e) => {
            if (this.activeMode === 'editor') {
                e.preventDefault();
                this.editor.rotateBrush(e.deltaY > 0 ? 15 : -15);
            }
        }, { passive: false });

        window.addEventListener('keydown', (e) => this.onKeyDown(e));
        window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
        window.addEventListener('blur', () => {
            this.keys = {};
            this.touchMoveLeft = false;
            this.touchMoveRight = false;
            this.touchJump = false;
            this.activeTouches.clear();
            this.aimPointerId = null;
            this.world.touchAimState.active = false;
        });
    }

    buildEditorPalette() {
        const wrap = document.getElementById('editor-brushes');
        wrap.innerHTML = '';
        MATERIAL_ORDER.forEach((matId) => {
            const mat = MATERIALS[matId];
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `brush-btn${this.editor.selectedMaterial === matId ? ' selected' : ''}`;
            btn.dataset.mat = matId;
            btn.innerHTML = `<span class="swatch" style="background:${mat.color}"></span>${mat.label}`;
            btn.addEventListener('click', () => {
                this.editor.selectedMaterial = matId;
                this.editor.eraseMode = false;
                this.syncEditorEraseBtn();
                wrap.querySelectorAll('.brush-btn').forEach((b) => b.classList.toggle('selected', b.dataset.mat === matId));
                sound.uiClick();
            });
            wrap.appendChild(btn);
        });
    }

    populateStageModal() {
        const soloGrid = document.getElementById('stage-grid-solo');
        soloGrid.innerHTML = '';
        SOLO_STAGES.forEach((st, idx) => {
            const stars = this.soloStars[st.id] || 0;
            const starTxt = '★'.repeat(stars) + '☆'.repeat(3 - stars);
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'stage-item';
            item.innerHTML = `
                <div class="stage-num"><span>STAGE 0${idx + 1}</span><span>${starTxt}</span></div>
                <span class="stage-name">${st.name}</span>
                <span class="stage-hint">${st.hint}</span>
            `;
            item.addEventListener('click', () => {
                this.soloIdx = idx;
                this.testingFromEditor = false;
                this.closeModal('modal-stages');
                this.switchMode('solo', st);
            });
            soloGrid.appendChild(item);
        });

        const duelGrid = document.getElementById('stage-grid-duel');
        duelGrid.innerHTML = '';
        DUEL_ARENAS.forEach((ar, idx) => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'stage-item';
            item.innerHTML = `
                <div class="stage-num"><span>ARENA 0${idx + 1}</span><span>1v1</span></div>
                <span class="stage-name">${ar.name}</span>
                <span class="stage-hint">${ar.hint}</span>
            `;
            item.addEventListener('click', () => {
                this.duelIdx = idx;
                this.testingFromEditor = false;
                this.closeModal('modal-stages');
                this.switchMode('ai', ar);
            });
            duelGrid.appendChild(item);
        });
    }

    handleInitialURLParams() {
        const params = new URLSearchParams(window.location.search);
        const roomParam = params.get('room');
        const mapParam = params.get('map');

        if (mapParam) {
            try {
                const decoded = decodeMapData(mapParam);
                this.editor.loadFromMapObject(decoded);
                this.testingFromEditor = true;
                this.switchMode('ai', decoded);
                this.showToast(`공유받은 맵 [${decoded.name}]을 불러왔습니다!`);
                return;
            } catch (_) {}
        }

        if (roomParam) {
            this.switchMode('solo', SOLO_STAGES[0]);
            document.getElementById('input-join-code').value = roomParam.replace(/[^0-9]/g, '').slice(0, 4);
            this.openModal('modal-p2p');
            this.p2p.joinRoom(roomParam);
            return;
        }

        this.switchMode('solo', SOLO_STAGES[0]);
    }

    setActiveTabHighlight(modeId) {
        const map = { solo: 'tab-solo', ai: 'tab-ai', p2p: 'tab-p2p', editor: 'tab-editor' };
        Object.entries(map).forEach(([k, id]) => {
            document.getElementById(id).classList.toggle('active', k === modeId);
        });
    }

    resetTouchState() {
        this.touchMoveLeft = false;
        this.touchMoveRight = false;
        this.touchJump = false;
        this.activeTouches.clear();
        this.aimPointerId = null;
        this.lastPinchMidX = null;
        this.world.touchAimState.active = false;
        this.world.touchAimState.cancelled = false;
        ['touch-left', 'touch-right', 'touch-jump'].forEach((id) => {
            document.getElementById(id)?.classList.remove('pressed');
        });
    }

    switchMode(mode, stageData, isClientGuest = false) {
        this.activeMode = mode;
        this.currentStageData = stageData;
        this.resultShownForMatch = false;
        this.resetTouchState();
        this.closeModal('modal-result');
        this.setActiveTabHighlight(mode);

        if (mode !== 'p2p') {
            this.localTeam = 1;
        }

        this.world.loadStage(stageData, mode, isClientGuest);
        if (mode === 'ai') {
            this.botAI.reset(stageData.p2Spawn ? stageData.p2Spawn.x : 1250);
        }

        const isDuel = mode === 'ai' || mode === 'p2p';
        document.getElementById('weapon-dock').classList.remove('hidden');
        document.getElementById('editor-dock').classList.remove('visible');
        document.getElementById('duel-vitals-bar').classList.toggle('visible', isDuel);
        document.getElementById('mobile-duel-pad').classList.toggle('visible', isDuel);
        document.getElementById('btn-editor-return').style.display = this.testingFromEditor ? 'inline-block' : 'none';
        document.getElementById('p2-name-label').textContent = mode === 'p2p' ? '2P TEAL' : 'AI BOT';

        const hintEl = document.getElementById('controls-hint');
        if (mode === 'solo') {
            hintEl.textContent = '마우스/터치 드래그: 조준 · 클릭/손 떼기: 발사 · 우클릭/Space/기폭 버튼: 특수탄 기폭 · 1~4: 탄종 선택';
        } else {
            hintEl.textContent = 'A/D 또는 좌하단 패드: 이동 · W/점프: 도약 · 드래그/좌클릭: 발사 · 우클릭/E/기폭 버튼: 특수탄 기폭';
        }

        if (stageData.hint) {
            this.showToast(stageData.hint);
        }
        this.syncHUD();
        this.syncSpecialButton();
    }

    enterEditorMode() {
        this.activeMode = 'editor';
        this.resultShownForMatch = false;
        this.resetTouchState();
        this.closeModal('modal-result');
        this.setActiveTabHighlight('editor');
        this.syncEditorEraseBtn();

        document.getElementById('weapon-dock').classList.add('hidden');
        document.getElementById('editor-dock').classList.add('visible');
        document.getElementById('duel-vitals-bar').classList.remove('visible');
        document.getElementById('mobile-duel-pad').classList.remove('visible');
        document.getElementById('btn-midair-special').classList.remove('visible');
        document.getElementById('btn-editor-return').style.display = 'none';
        document.getElementById('controls-hint').textContent =
            '터치/좌클릭: 블록 배치 · 우클릭/삭제 모드: 블록 삭제 · 휠 또는 회전 버튼(Q/E): 각도 조절';

        this.refreshEditorPreviewWorld();
    }

    refreshEditorPreviewWorld() {
        const previewStage = this.editor.toPlayableStage();
        this.world.loadStage(previewStage, 'editor', true);
        this.syncHUD();
    }

    restartCurrent() {
        if (this.activeMode === 'editor') {
            this.refreshEditorPreviewWorld();
            return;
        }
        if (this.activeMode === 'p2p') {
            if (this.p2p.role === 'host' && this.p2p.connected) {
                this.startHostP2PMatch(this.currentStageData);
            }
            return;
        }
        this.switchMode(this.activeMode, this.currentStageData);
    }

    startHostP2PMatch(stageData) {
        this.closeModal('modal-p2p');
        this.closeModal('modal-result');
        this.localTeam = 1;
        this.switchMode('p2p', stageData, false);
        this.p2p.send({ t: 'start', stage: stageData });
    }

    onP2PPacket(pkt) {
        if (!pkt || typeof pkt !== 'object') return;
        if (pkt.t === 'start' && pkt.stage) {
            this.closeModal('modal-p2p');
            this.closeModal('modal-result');
            this.localTeam = 2;
            this.switchMode('p2p', pkt.stage, true);
            return;
        }
        if (pkt.t === 'snap' && this.activeMode === 'p2p' && this.world.isClientGuest) {
            this.world.applySnapshot(pkt.d);
            return;
        }
        if (pkt.t === 'in' && this.activeMode === 'p2p' && this.p2p.role === 'host') {
            const t2 = this.world.tanks[2];
            if (!t2) return;
            t2.input.moveX = pkt.mx || 0;
            t2.input.jump = Boolean(pkt.jp);
            t2.aimX = Number(pkt.ax) || t2.aimX;
            t2.aimY = Number(pkt.ay) || t2.aimY;
            t2.wepId = Number(pkt.w) || 0;
            if (pkt.fire) {
                this.world.fireFromTank(2, t2.aimX, t2.aimY, t2.wepId);
            }
            if (pkt.midAir) {
                this.world.triggerMidAirSpecial(2);
            }
        }
    }

    selectWeapon(idx) {
        if (idx < 0 || idx >= WEAPONS.length) return;
        if (this.activeMode === 'solo' && (this.world.ammo[idx] || 0) <= 0) {
            this.showToast('해당 특수탄의 잔여 탄약이 없습니다.');
            return;
        }
        this.world.selectedWeapon = idx;
        const myTank = this.world.tanks[this.localTeam];
        if (myTank) myTank.wepId = idx;
        sound.uiClick();
        this.syncHUD();
    }

    triggerLocalMidAirSpecial() {
        if (this.world.matchEnded || this.activeMode === 'editor') return false;
        if (this.activeMode === 'p2p' && this.world.isClientGuest) {
            this.p2p.send({ t: 'in', midAir: true, w: this.world.selectedWeapon });
            return true;
        }
        return this.world.triggerMidAirSpecial(this.localTeam);
    }

    fireTowardWorldPoint(wx, wy) {
        if (this.world.matchEnded || this.activeMode === 'editor') return;
        if (this.activeMode === 'solo') {
            this.world.fireFromLauncher(wx, wy, this.world.selectedWeapon);
            this.syncHUD();
        } else if (this.activeMode === 'ai' || (this.activeMode === 'p2p' && !this.world.isClientGuest)) {
            const myTank = this.world.tanks[1];
            if (myTank) {
                myTank.aimX = wx;
                myTank.aimY = wy;
                this.world.fireFromTank(1, wx, wy, myTank.wepId);
            }
        } else if (this.activeMode === 'p2p' && this.world.isClientGuest) {
            const myTank = this.world.tanks[2];
            const wepId = myTank ? myTank.wepId : this.world.selectedWeapon;
            const now = performance.now();
            if (myTank && now < (myTank.cooldowns[wepId] || 0)) return;
            if (myTank) {
                myTank.cooldowns[wepId] = now + WEAPONS[wepId].cooldownMs;
            }
            this.p2p.send({
                t: 'in',
                mx: this.getLocalMoveAxis(),
                jp: this.getLocalJumpPressed(),
                ax: Math.round(wx),
                ay: Math.round(wy),
                w: wepId,
                fire: true
            });
        }
    }

    updateAimFromPoint(pt, checkCancelZone = false) {
        let ox = 200;
        let oy = 634;
        if (this.activeMode === 'solo') {
            this.world.launcher.aimX = pt.x;
            this.world.launcher.aimY = pt.y;
            ox = this.world.launcher.x;
            oy = this.world.launcher.y - 16;
        } else {
            const myTank = this.world.tanks[this.localTeam];
            if (myTank) {
                myTank.aimX = pt.x;
                myTank.aimY = pt.y;
                ox = myTank.body.position.x;
                oy = myTank.body.position.y - 10;
            }
        }
        if (checkCancelZone) {
            const nearOrigin = Math.hypot(pt.x - ox, pt.y - oy) < 58;
            const behindSoloLauncher = this.activeMode === 'solo' && pt.x < ox - 36;
            this.world.touchAimState.cancelled = nearOrigin || behindSoloLauncher;
        }
    }

    onCanvasPointerDown(e) {
        sound.ensureContext();
        const pt = this.world.screenToWorld(e.clientX, e.clientY);

        // Desktop Mouse: instant click-to-fire & right-click detonate/erase
        if (e.pointerType === 'mouse') {
            if (this.activeMode === 'editor') {
                if (e.button === 2 || (e.button === 0 && this.editor.eraseMode)) {
                    if (this.editor.removeAt(pt.x, pt.y)) {
                        this.refreshEditorPreviewWorld();
                    }
                } else if (e.button === 0) {
                    this.editor.placeAt(pt.x, pt.y);
                    this.refreshEditorPreviewWorld();
                }
                return;
            }
            if (this.world.matchEnded) return;
            if (e.button === 2) {
                this.triggerLocalMidAirSpecial();
                return;
            }
            if (e.button === 0) {
                this.updateAimFromPoint(pt, false);
                this.fireTowardWorldPoint(pt.x, pt.y);
            }
            return;
        }

        // Touch / Stylus input
        e.preventDefault();
        try {
            this.canvas.setPointerCapture(e.pointerId);
        } catch (_) {}
        this.activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });

        // 2-finger gesture pans zoomed camera and cancels any pending 1-finger shot/placement
        if (this.activeTouches.size >= 2) {
            this.aimPointerId = null;
            this.world.touchAimState.active = false;
            this.world.touchAimState.cancelled = false;
            const pts = Array.from(this.activeTouches.values());
            this.lastPinchMidX = (pts[0].x + pts[1].x) * 0.5;
            return;
        }

        if (this.activeMode === 'editor') {
            this.aimPointerId = e.pointerId;
            this.editor.cursorWorld = pt;
            return;
        }

        if (this.world.matchEnded) return;

        // If player's special projectile is currently airborne, tapping canvas triggers mid-air detonation!
        if (this.world.getActiveSpecialProjectile(this.localTeam)) {
            this.triggerLocalMidAirSpecial();
            return;
        }

        // Begin Touch Drag-to-Aim (fires on release)
        this.aimPointerId = e.pointerId;
        this.world.touchAimState.active = true;
        this.updateAimFromPoint(pt, true);
    }

    onCanvasPointerMove(e) {
        const pt = this.world.screenToWorld(e.clientX, e.clientY);

        if (e.pointerType === 'mouse') {
            if (this.activeMode === 'editor') {
                this.editor.cursorWorld = pt;
            } else {
                this.updateAimFromPoint(pt, false);
            }
            return;
        }

        if (this.activeTouches.has(e.pointerId)) {
            this.activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        }

        if (this.activeTouches.size >= 2) {
            const pts = Array.from(this.activeTouches.values());
            const midX = (pts[0].x + pts[1].x) * 0.5;
            if (this.lastPinchMidX !== null && this.world.zoomMode) {
                const norm = this.world.panCameraByPixels(midX - this.lastPinchMidX);
                const slider = document.getElementById('zoom-pan-slider');
                if (slider) slider.value = String(Math.round(norm * 100));
            }
            this.lastPinchMidX = midX;
            return;
        }

        if (e.pointerId !== this.aimPointerId) return;

        if (this.activeMode === 'editor') {
            this.editor.cursorWorld = pt;
            return;
        }

        this.updateAimFromPoint(pt, true);
    }

    onCanvasPointerUp(e) {
        if (e.pointerType === 'mouse') return;

        this.activeTouches.delete(e.pointerId);
        if (this.activeTouches.size < 2) {
            this.lastPinchMidX = null;
        }

        if (e.pointerId !== this.aimPointerId) return;
        this.aimPointerId = null;

        const pt = this.world.screenToWorld(e.clientX, e.clientY);

        if (this.activeMode === 'editor') {
            this.editor.cursorWorld = pt;
            if (this.editor.eraseMode) {
                if (this.editor.removeAt(pt.x, pt.y)) {
                    this.refreshEditorPreviewWorld();
                }
            } else {
                this.editor.placeAt(pt.x, pt.y);
                this.refreshEditorPreviewWorld();
            }
            return;
        }

        this.updateAimFromPoint(pt, true);
        const wasCancelled = this.world.touchAimState.cancelled;
        this.world.touchAimState.active = false;
        this.world.touchAimState.cancelled = false;

        if (!wasCancelled && !this.world.matchEnded) {
            this.fireTowardWorldPoint(pt.x, pt.y);
        }
    }

    onCanvasPointerCancel(e) {
        this.activeTouches.delete(e.pointerId);
        if (this.activeTouches.size < 2) {
            this.lastPinchMidX = null;
        }
        if (e.pointerId === this.aimPointerId) {
            this.aimPointerId = null;
            this.world.touchAimState.active = false;
            this.world.touchAimState.cancelled = false;
        }
    }

    onKeyDown(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
            return;
        }
        this.keys[e.code] = true;

        if (e.code === 'Digit1') this.selectWeapon(0);
        else if (e.code === 'Digit2') this.selectWeapon(1);
        else if (e.code === 'Digit3') this.selectWeapon(2);
        else if (e.code === 'Digit4') this.selectWeapon(3);
        else if (e.code === 'KeyR' && this.activeMode !== 'editor') {
            this.restartCurrent();
        } else if (this.activeMode === 'editor') {
            if (e.code === 'KeyQ') this.editor.rotateBrush(-15);
            else if (e.code === 'KeyE') this.editor.rotateBrush(15);
        } else if (this.activeMode === 'solo' && e.code === 'Space' && !e.repeat) {
            e.preventDefault();
            this.triggerLocalMidAirSpecial();
        } else if ((this.activeMode === 'ai' || this.activeMode === 'p2p') && e.code === 'KeyE' && !e.repeat) {
            this.triggerLocalMidAirSpecial();
        }
    }

    getLocalMoveAxis() {
        let mx = 0;
        if (this.keys['KeyA'] || this.keys['ArrowLeft'] || this.touchMoveLeft) mx -= 1;
        if (this.keys['KeyD'] || this.keys['ArrowRight'] || this.touchMoveRight) mx += 1;
        return Math.max(-1, Math.min(1, mx));
    }

    getLocalJumpPressed() {
        return Boolean(this.keys['KeyW'] || this.keys['ArrowUp'] || this.keys['Space'] || this.touchJump);
    }

    syncSpecialButton() {
        const btn = document.getElementById('btn-midair-special');
        if (!btn) return;
        const proj = this.activeMode !== 'editor' ? this.world.getActiveSpecialProjectile(this.localTeam) : null;
        if (!proj) {
            btn.classList.remove('visible');
            return;
        }
        const labelMap = {
            1: '고폭탄 공중 분열!',
            2: '블랙홀 즉시 기폭!',
            3: '지진탄 수직 급강하!'
        };
        const nextTxt = labelMap[proj.wepId] || '특수탄 공중 기폭!';
        if (btn.textContent !== nextTxt) {
            btn.textContent = nextTxt;
        }
        btn.classList.add('visible');
    }

    syncHUD() {
        const modeLabel = document.getElementById('hud-mode-label');
        const titleEl = document.getElementById('hud-stage-title');
        const subLabel = document.getElementById('hud-sub-stat-label');
        const subVal = document.getElementById('hud-sub-stat-val');

        if (this.activeMode === 'editor') {
            modeLabel.textContent = 'EDITOR';
            titleEl.textContent = this.editor.mapName;
            subLabel.textContent = '배치된 오브젝트';
            subVal.textContent = String(this.editor.blocks.length);
            return;
        }

        modeLabel.textContent = this.activeMode === 'solo' ? 'DEMOLITION' : this.activeMode === 'p2p' ? `P2P ROOM ${this.p2p.roomCode}` : 'AI SIEGE';
        titleEl.textContent = this.currentStageData.name || '전장';

        if (this.activeMode === 'solo') {
            let cores = 0;
            for (const blk of this.world.blocks.values()) {
                if (blk.matId === 'core') cores++;
            }
            subLabel.textContent = `남은 코어 · ★3 (${this.world.parShots}발 이내)`;
            subVal.textContent = `${cores}개 · ${this.world.shotsFired}/${this.world.parShots}발`;
        } else {
            subLabel.textContent = '내 진영';
            subVal.textContent = this.localTeam === 1 ? '1P (좌측)' : '2P (우측)';
        }

        // Update weapon buttons & cooldown bars
        const now = performance.now();
        const myTank = this.world.tanks[this.localTeam];
        const activeWep = this.activeMode === 'solo' ? this.world.selectedWeapon : (myTank ? myTank.wepId : this.world.selectedWeapon);

        for (let i = 0; i < 4; i++) {
            const btn = document.getElementById(`wep-btn-${i}`);
            const ammoEl = document.getElementById(`wep-ammo-${i}`);
            const cdEl = document.getElementById(`wep-cd-${i}`);

            btn.classList.toggle('selected', i === activeWep);

            if (this.activeMode === 'solo') {
                const count = this.world.ammo[i] || 0;
                ammoEl.textContent = `x${count}`;
                btn.disabled = count <= 0;
                cdEl.style.width = '0%';
            } else {
                btn.disabled = false;
                ammoEl.textContent = `${(WEAPONS[i].cooldownMs / 1000).toFixed(1)}s`;
                if (myTank) {
                    const rem = Math.max(0, (myTank.cooldowns[i] || 0) - now);
                    const pct = Math.min(100, (rem / WEAPONS[i].cooldownMs) * 100);
                    cdEl.style.width = `${pct}%`;
                } else {
                    cdEl.style.width = '0%';
                }
            }
        }

        // Duel vitals
        if (this.activeMode === 'ai' || this.activeMode === 'p2p') {
            const t1 = this.world.tanks[1];
            const t2 = this.world.tanks[2];
            document.getElementById('p1-hp-fill').style.width = `${t1 ? (t1.hp / t1.maxHp) * 100 : 0}%`;
            document.getElementById('p2-hp-fill').style.width = `${t2 ? (t2.hp / t2.maxHp) * 100 : 0}%`;

            let c1 = 0;
            let c2 = 0;
            for (const blk of this.world.blocks.values()) {
                if (blk.matId === 'core') {
                    if (blk.team === 1) c1++;
                    if (blk.team === 2) c2++;
                }
            }
            document.getElementById('p1-core-txt').textContent = `코어 ${c1}`;
            document.getElementById('p2-core-txt').textContent = `코어 ${c2}`;
        }
    }

    openModal(id) {
        document.getElementById(id).classList.add('visible');
    }

    closeModal(id) {
        document.getElementById(id).classList.remove('visible');
    }

    showMatchResultModal() {
        const info = this.world.winnerInfo;
        if (!info) return;
        this.resultShownForMatch = true;

        if (this.activeMode === 'solo' && info.stars > 0 && !this.testingFromEditor) {
            this.saveStar(this.currentStageData.id, info.stars);
        }

        document.getElementById('result-title').textContent = info.title;
        document.getElementById('result-reason').textContent = info.reason;
        const starsEl = document.getElementById('result-stars');
        if (this.activeMode === 'solo') {
            starsEl.style.display = 'block';
            starsEl.textContent = '★'.repeat(info.stars) + '☆'.repeat(3 - info.stars);
        } else {
            starsEl.style.display = 'none';
        }

        const retryBtn = document.getElementById('btn-result-retry');
        const nextBtn = document.getElementById('btn-result-next');
        const edBtn = document.getElementById('btn-result-editor');

        retryBtn.style.display = (this.activeMode === 'p2p' && this.p2p.role !== 'host') ? 'none' : 'inline-block';
        nextBtn.style.display = (this.activeMode === 'p2p' || this.testingFromEditor) ? 'none' : 'inline-block';
        edBtn.style.display = this.testingFromEditor ? 'inline-block' : 'none';

        this.openModal('modal-result');
    }

    loop(nowMs) {
        if (this.activeMode !== 'editor') {
            // Apply local tank input
            if (this.activeMode === 'ai' || (this.activeMode === 'p2p' && !this.world.isClientGuest)) {
                const t1 = this.world.tanks[1];
                if (t1) {
                    t1.input.moveX = this.getLocalMoveAxis();
                    t1.input.jump = this.getLocalJumpPressed();
                }
            }

            if (this.activeMode === 'ai') {
                this.botAI.update(this.world, nowMs);
            }

            this.world.step();

            // P2P Synchronization (22 Hz)
            if (this.activeMode === 'p2p' && this.p2p.connected && nowMs - this.lastNetSentAt >= 45) {
                this.lastNetSentAt = nowMs;
                if (this.p2p.role === 'host') {
                    this.p2p.send({ t: 'snap', d: this.world.serializeSnapshot() });
                } else {
                    const t2 = this.world.tanks[2];
                    this.p2p.send({
                        t: 'in',
                        mx: this.getLocalMoveAxis(),
                        jp: this.getLocalJumpPressed(),
                        ax: t2 ? Math.round(t2.aimX) : 800,
                        ay: t2 ? Math.round(t2.aimY) : 450,
                        w: t2 ? t2.wepId : 0
                    });
                }
            }

            if (this.world.matchEnded && !this.resultShownForMatch) {
                this.showMatchResultModal();
            }

            this.syncSpecialButton();
            if (this.world.tickCount % 4 === 0) {
                this.syncHUD();
            }
        }

        this.world.render(
            this.localTeam,
            this.activeMode === 'editor' ? (ctx) => this.editor.renderOverlay(ctx) : null
        );

        requestAnimationFrame((ts) => this.loop(ts));
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.__breakerApp = new BreakerApp();
});
