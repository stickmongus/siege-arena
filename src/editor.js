// Interactive Fortress Map Editor (Grid Snap, Mirror Symmetry, Shape Presets & Shareable Map Export)

import { WORLD_W, WORLD_H, MATERIALS } from './stages.js';
import { sound } from './audio.js';

export const SHAPE_PRESETS = [
    { id: 'pillar', label: '세로 기둥', w: 28, h: 120 },
    { id: 'beam', label: '가로 상판', w: 150, h: 26 },
    { id: 'cube', label: '블록/코어', w: 42, h: 42 },
    { id: 'island', label: '대형 지형', w: 320, h: 44 }
];

export class FortressEditor {
    constructor() {
        this.blocks = [];
        this.mapName = '커스텀 공성 요새';
        this.p1Spawn = { x: 330, y: 650 };
        this.p2Spawn = { x: 1270, y: 650 };

        this.selectedMaterial = 'wood';
        this.presetIdx = 0;
        this.angleDeg = 0;
        this.mirrorMode = true;
        this.eraseMode = false;

        this.cursorWorld = { x: 800, y: 500 };
        this.resetDefaultTemplate();
    }

    resetDefaultTemplate() {
        this.blocks = [
            { type: 'bedrock', x: 320, y: 724, w: 420, h: 48, angle: 0, team: 0 },
            { type: 'bedrock', x: 800, y: 750, w: 200, h: 44, angle: 0, team: 0 },
            { type: 'bedrock', x: 1280, y: 724, w: 420, h: 48, angle: 0, team: 0 },
            { type: 'core', x: 200, y: 680, w: 40, h: 40, angle: 0, team: 1 },
            { type: 'core', x: 1400, y: 680, w: 40, h: 40, angle: 0, team: 2 }
        ];
        this.p1Spawn = { x: 350, y: 650 };
        this.p2Spawn = { x: 1250, y: 650 };
    }

    loadFromMapObject(mapObj) {
        this.mapName = mapObj.name || '커스텀 공성 요새';
        this.p1Spawn = mapObj.p1Spawn ? { ...mapObj.p1Spawn } : { x: 340, y: 650 };
        this.p2Spawn = mapObj.p2Spawn ? { ...mapObj.p2Spawn } : { x: 1260, y: 650 };
        this.blocks = (mapObj.blocks || []).map((b) => ({ ...b }));
    }

    getCurrentDimensions() {
        if (this.selectedMaterial === 'core') return { w: 40, h: 40 };
        if (this.selectedMaterial === 'barrel') return { w: 36, h: 48 };
        const p = SHAPE_PRESETS[this.presetIdx] || SHAPE_PRESETS[0];
        return { w: p.w, h: p.h };
    }

    snapCoord(val) {
        return Math.round(val / 10) * 10;
    }

    rotateBrush(deltaDeg) {
        this.angleDeg = ((this.angleDeg + deltaDeg + 180) % 360) - 180;
    }

    placeAt(wx, wy) {
        const sx = Math.max(40, Math.min(WORLD_W - 40, this.snapCoord(wx)));
        const sy = Math.max(60, Math.min(WORLD_H - 40, this.snapCoord(wy)));
        const { w, h } = this.getCurrentDimensions();

        const team = this.selectedMaterial === 'core' ? (sx < WORLD_W * 0.5 ? 1 : 2) : 0;
        this.blocks.push({
            type: this.selectedMaterial,
            x: sx,
            y: sy,
            w,
            h,
            angle: this.angleDeg,
            team
        });

        if (this.mirrorMode && Math.abs(sx - WORLD_W * 0.5) > 35) {
            const mx = WORLD_W - sx;
            const mTeam = this.selectedMaterial === 'core' ? (mx < WORLD_W * 0.5 ? 1 : 2) : 0;
            this.blocks.push({
                type: this.selectedMaterial,
                x: mx,
                y: sy,
                w,
                h,
                angle: -this.angleDeg,
                team: mTeam
            });
        }
        sound.uiClick();
    }

    removeAt(wx, wy) {
        for (let i = this.blocks.length - 1; i >= 0; i--) {
            const b = this.blocks[i];
            if (Math.abs(wx - b.x) <= b.w * 0.5 + 16 && Math.abs(wy - b.y) <= b.h * 0.5 + 16) {
                const removed = this.blocks.splice(i, 1)[0];
                if (this.mirrorMode && Math.abs(removed.x - WORLD_W * 0.5) > 35) {
                    const mx = WORLD_W - removed.x;
                    const mirrorIdx = this.blocks.findIndex(
                        (m) => m.type === removed.type && Math.abs(m.x - mx) < 14 && Math.abs(m.y - removed.y) < 14
                    );
                    if (mirrorIdx !== -1) this.blocks.splice(mirrorIdx, 1);
                }
                sound.uiClick();
                return true;
            }
        }
        return false;
    }

    toPlayableStage(forMode = 'duel') {
        const hasRightSideCore = this.blocks.some((b) => b.type === 'core' && b.x >= 520);
        const cloned = this.blocks
            .filter((b) => !(forMode === 'solo' && hasRightSideCore && b.type === 'core' && b.x < 520))
            .map((b) => ({ ...b }));
        return {
            id: 'custom-editor',
            name: this.mapName,
            hint: '에디터에서 제작한 커스텀 전장입니다.',
            launcher: { x: 210, y: 650 },
            p1Spawn: { ...this.p1Spawn },
            p2Spawn: { ...this.p2Spawn },
            ammo: [4, 3, 2, 2],
            parShots: 3,
            blocks: cloned
        };
    }

    renderOverlay(ctx) {
        // Subtle 40px construction guide lines & center symmetry axis
        ctx.save();
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
        ctx.lineWidth = 1;
        for (let x = 80; x < WORLD_W; x += 80) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, WORLD_H);
            ctx.stroke();
        }
        for (let y = 80; y < WORLD_H; y += 80) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(WORLD_W, y);
            ctx.stroke();
        }

        if (this.mirrorMode) {
            ctx.strokeStyle = 'rgba(245, 158, 11, 0.35)';
            ctx.setLineDash([8, 8]);
            ctx.beginPath();
            ctx.moveTo(WORLD_W * 0.5, 0);
            ctx.lineTo(WORLD_W * 0.5, WORLD_H);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Spawn markers
        this.drawSpawnMarker(ctx, this.p1Spawn.x, this.p1Spawn.y, '1P 스폰', '#f59e0b');
        this.drawSpawnMarker(ctx, this.p2Spawn.x, this.p2Spawn.y, '2P 스폰', '#22d3ee');

        if (this.eraseMode) {
            const cx = Math.max(40, Math.min(WORLD_W - 40, this.cursorWorld.x));
            const cy = Math.max(60, Math.min(WORLD_H - 40, this.cursorWorld.y));
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(cx, cy, 22, 0, Math.PI * 2);
            ctx.moveTo(cx - 11, cy - 11);
            ctx.lineTo(cx + 11, cy + 11);
            ctx.moveTo(cx + 11, cy - 11);
            ctx.lineTo(cx - 11, cy + 11);
            ctx.stroke();
        } else {
            // Ghost preview block under cursor
            const sx = Math.max(40, Math.min(WORLD_W - 40, this.snapCoord(this.cursorWorld.x)));
            const sy = Math.max(60, Math.min(WORLD_H - 40, this.snapCoord(this.cursorWorld.y)));
            const { w, h } = this.getCurrentDimensions();
            const mat = MATERIALS[this.selectedMaterial] || MATERIALS.stone;

            this.drawGhostBlock(ctx, sx, sy, w, h, this.angleDeg, mat.color, 0.58);
            if (this.mirrorMode && Math.abs(sx - WORLD_W * 0.5) > 35) {
                this.drawGhostBlock(ctx, WORLD_W - sx, sy, w, h, -this.angleDeg, mat.color, 0.32);
            }
        }

        ctx.restore();
    }

    drawGhostBlock(ctx, x, y, w, h, angleDeg, color, alpha) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate((angleDeg * Math.PI) / 180);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = color;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.fillRect(-w * 0.5, -h * 0.5, w, h);
        ctx.strokeRect(-w * 0.5, -h * 0.5, w, h);
        ctx.restore();
    }

    drawSpawnMarker(ctx, x, y, label, color) {
        ctx.save();
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.75;
        ctx.lineWidth = 2;
        ctx.strokeRect(x - 22, y - 14, 44, 28);
        ctx.font = 'bold 12px "Noto Sans KR", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(label, x, y - 20);
        ctx.restore();
    }
}
