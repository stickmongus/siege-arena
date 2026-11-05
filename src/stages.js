// World dimensions, material definitions, weapon specs, campaign stages, duel arenas, and shareable map codec

export const WORLD_W = 1600;
export const WORLD_H = 900;
export const ABYSS_Y = 910;

export const MATERIALS = {
    bedrock: {
        id: 'bedrock',
        label: '기반암',
        color: '#283241',
        stroke: '#44546b',
        hp: Infinity,
        density: 0.01,
        friction: 0.9,
        restitution: 0.15,
        isStatic: true
    },
    wood: {
        id: 'wood',
        label: '목재 보',
        color: '#b7793e',
        stroke: '#e0a463',
        hp: 55,
        density: 0.0014,
        friction: 0.75,
        restitution: 0.18,
        isStatic: false
    },
    stone: {
        id: 'stone',
        label: '석재 블록',
        color: '#677487',
        stroke: '#94a3b8',
        hp: 140,
        density: 0.0032,
        friction: 0.82,
        restitution: 0.12,
        isStatic: false
    },
    steel: {
        id: 'steel',
        label: '강철 장갑',
        color: '#3b4a5e',
        stroke: '#7dd3fc',
        hp: 400,
        density: 0.0058,
        friction: 0.65,
        restitution: 0.22,
        isStatic: false
    },
    barrel: {
        id: 'barrel',
        label: '폭발 드럼통',
        color: '#dc442c',
        stroke: '#fca5a5',
        hp: 26,
        density: 0.0022,
        friction: 0.72,
        restitution: 0.2,
        isStatic: false
    },
    bumper: {
        id: 'bumper',
        label: '반발 패드',
        color: '#16a394',
        stroke: '#5eead4',
        hp: Infinity,
        density: 0.01,
        friction: 0.1,
        restitution: 1.38,
        isStatic: true
    },
    core: {
        id: 'core',
        label: '에너지 코어',
        color: '#f59e0b',
        stroke: '#fef08a',
        hp: 70,
        density: 0.0025,
        friction: 0.78,
        restitution: 0.25,
        isStatic: false
    }
};

export const MATERIAL_ORDER = ['wood', 'stone', 'steel', 'barrel', 'bumper', 'core', 'bedrock'];

export const WEAPONS = [
    {
        id: 0,
        key: '1',
        name: '철갑탄',
        sub: '고속 관통 · 강한 넉백',
        cooldownMs: 1150,
        color: '#f59e0b',
        radius: 9,
        speedMul: 1.08
    },
    {
        id: 1,
        key: '2',
        name: '고폭 파편탄',
        sub: '광역 폭발 · 우클릭 기폭',
        cooldownMs: 1950,
        color: '#ef4444',
        radius: 11,
        speedMul: 0.96
    },
    {
        id: 2,
        key: '3',
        name: '블랙홀 중력탄',
        sub: '중력 흡입 · 우클릭 기폭',
        cooldownMs: 3200,
        color: '#22d3ee',
        radius: 12,
        speedMul: 0.9
    },
    {
        id: 3,
        key: '4',
        name: '지진 파쇄탄',
        sub: '중장갑 균열 · 수직 강타',
        cooldownMs: 2500,
        color: '#a3e635',
        radius: 11,
        speedMul: 0.94
    }
];

function b(type, x, y, w, h, angle = 0, team = 0) {
    return { type, x, y, w, h, angle, team };
}

// Helper to place a block cleanly flush on top of surfaceTopY
function onSurface(type, x, surfaceTopY, w, h, team = 0) {
    return { type, x, y: surfaceTopY - h / 2, w, h, angle: 0, team };
}

export const SOLO_STAGES = [
    {
        id: 'solo-1',
        name: '교량 지지대 붕괴',
        hint: '하단 목재 기둥을 끊어 상부 석재 상판의 무게로 코어를 한 번에 압사시키세요.',
        launcher: { x: 210, y: 650 },
        ammo: [3, 1, 0, 0],
        parShots: 1,
        blocks: [
            b('bedrock', 210, 710, 220, 44),
            b('bedrock', 1080, 740, 560, 48),
            // Left and right wooden pillars on topY = 716
            onSurface('wood', 930, 716, 26, 150),
            onSurface('wood', 1230, 716, 26, 150),
            onSurface('barrel', 1080, 716, 36, 48),
            onSurface('core', 1015, 716, 40, 40, 2),
            onSurface('core', 1145, 716, 40, 40, 2),
            // Heavy stone deck resting on pillars (topY = 716 - 150 = 566)
            onSurface('stone', 1080, 566, 360, 34),
            onSurface('stone', 1080, 532, 220, 32),
            onSurface('core', 1080, 500, 40, 40, 2)
        ]
    },
    {
        id: 'solo-2',
        name: '연쇄 유폭 벙커',
        hint: '정면 강철 방벽 뒤의 드럼통을 곡사포나 고폭탄으로 유폭시키세요.',
        launcher: { x: 200, y: 660 },
        ammo: [2, 2, 0, 1],
        parShots: 2,
        blocks: [
            b('bedrock', 200, 720, 220, 44),
            b('bedrock', 1100, 750, 620, 48),
            // Front steel shield wall (topY = 726)
            onSurface('steel', 875, 726, 36, 190),
            // Inner explosive chain & stone bunker
            onSurface('barrel', 965, 726, 36, 48),
            onSurface('core', 1035, 726, 40, 40, 2),
            onSurface('wood', 1105, 726, 24, 130),
            onSurface('barrel', 1175, 726, 36, 48),
            onSurface('core', 1250, 726, 40, 40, 2),
            onSurface('stone', 1330, 726, 34, 130),
            // Upper bunker roof (topY = 726 - 130 = 596)
            onSurface('stone', 1218, 596, 260, 28),
            onSurface('barrel', 1185, 568, 36, 48),
            onSurface('core', 1255, 568, 40, 40, 2)
        ]
    },
    {
        id: 'solo-3',
        name: '특이점 중력 추출',
        hint: '[3] 블랙홀 중력탄을 수직 벙커 위에서 우클릭 공중 기폭해 코어와 드럼통을 끌어당기세요.',
        launcher: { x: 200, y: 640 },
        ammo: [1, 1, 3, 0],
        parShots: 2,
        blocks: [
            b('bedrock', 200, 700, 210, 44),
            b('bedrock', 1080, 760, 620, 48),
            // Deep steel U-pits (topY = 736)
            onSurface('steel', 860, 736, 36, 180),
            onSurface('steel', 1060, 736, 36, 180),
            onSurface('steel', 1280, 736, 36, 180),
            onSurface('core', 945, 736, 40, 40, 2),
            onSurface('barrel', 995, 736, 34, 46),
            onSurface('barrel', 1145, 736, 34, 46),
            onSurface('core', 1205, 736, 40, 40, 2)
        ]
    },
    {
        id: 'solo-4',
        name: '도미노 거석 회랑',
        hint: '첫 번째 석재 기둥 상단을 철갑탄으로 타격해 연쇄 전도를 일으키세요.',
        launcher: { x: 185, y: 650 },
        ammo: [3, 1, 0, 1],
        parShots: 1,
        blocks: [
            b('bedrock', 185, 710, 200, 44),
            b('bedrock', 1040, 750, 780, 48),
            // Tall domino monoliths on topY = 726
            onSurface('stone', 740, 726, 28, 210),
            onSurface('stone', 855, 726, 28, 210),
            onSurface('stone', 970, 726, 28, 210),
            onSurface('stone', 1085, 726, 28, 210),
            // Target fragile wood shrine at the end
            onSurface('barrel', 1185, 726, 36, 48),
            onSurface('wood', 1245, 726, 22, 120),
            onSurface('wood', 1355, 726, 22, 120),
            onSurface('core', 1300, 726, 40, 40, 2),
            onSurface('stone', 1300, 606, 150, 26),
            onSurface('core', 1300, 580, 40, 40, 2)
        ]
    },
    {
        id: 'solo-5',
        name: '반발 패드 굴절 사격',
        hint: '공중의 청록색 반발 패드에 포탄을 튕겨 강철 천장 너머의 코어를 타격하세요.',
        launcher: { x: 195, y: 660 },
        ammo: [3, 2, 1, 0],
        parShots: 2,
        blocks: [
            b('bedrock', 195, 720, 210, 44),
            b('bedrock', 1120, 760, 540, 48),
            // Front impenetrable bedrock/steel wall
            b('bedrock', 870, 600, 40, 300),
            // Angled repulsor pads in the sky
            b('bumper', 920, 220, 170, 24, 26),
            b('bumper', 1270, 250, 170, 24, -28),
            // Vault targets on topY = 736
            onSurface('barrel', 1030, 736, 36, 48),
            onSurface('core', 1095, 736, 40, 40, 2),
            onSurface('wood', 1165, 736, 24, 120),
            onSurface('core', 1240, 736, 40, 40, 2),
            onSurface('barrel', 1305, 736, 36, 48)
        ]
    },
    {
        id: 'solo-6',
        name: '아이언 시타델',
        hint: '지진 파쇄탄과 블랙홀 중력탄, 고폭탄을 조합해 다층 요새의 코어 3개를 모두 파괴하세요.',
        launcher: { x: 185, y: 650 },
        ammo: [2, 2, 2, 2],
        parShots: 3,
        blocks: [
            b('bedrock', 185, 710, 200, 44),
            b('bedrock', 1110, 770, 640, 48),
            // Outer defense (topY = 746)
            onSurface('steel', 860, 746, 34, 150),
            onSurface('barrel', 925, 746, 36, 48),
            // First floor fortress
            onSurface('stone', 990, 746, 28, 140),
            onSurface('core', 1065, 746, 40, 40, 2),
            onSurface('stone', 1140, 746, 28, 140),
            onSurface('barrel', 1215, 746, 36, 48),
            onSurface('core', 1285, 746, 40, 40, 2),
            onSurface('stone', 1360, 746, 28, 140),
            // Second floor deck (topY = 746 - 140 = 606)
            onSurface('stone', 1065, 606, 190, 28),
            onSurface('stone', 1250, 606, 240, 28),
            // Upper citadel tower (topY = 578)
            onSurface('wood', 1095, 578, 24, 110),
            onSurface('wood', 1235, 578, 24, 110),
            onSurface('barrel', 1140, 578, 34, 46),
            onSurface('core', 1190, 578, 40, 40, 2),
            onSurface('steel', 1165, 468, 190, 26)
        ]
    }
];

export const DUEL_ARENAS = [
    {
        id: 'duel-citadel',
        name: '쌍둥이 부유 성채',
        hint: '적 전차나 적의 에너지 코어를 파괴하거나 절벽 아래로 밀쳐내면 승리합니다.',
        p1Spawn: { x: 350, y: 650 },
        p2Spawn: { x: 1250, y: 650 },
        blocks: [
            // Left Island (P1) — topY = 700
            b('bedrock', 310, 724, 440, 48),
            onSurface('stone', 155, 700, 28, 110),
            onSurface('stone', 255, 700, 28, 110),
            onSurface('core', 205, 700, 40, 40, 1),
            onSurface('wood', 205, 590, 140, 24),
            onSurface('wood', 465, 700, 26, 76),

            // Center crumbling bridge — topY = 736
            b('bedrock', 800, 760, 220, 48),
            onSurface('wood', 735, 736, 24, 90),
            onSurface('wood', 865, 736, 24, 90),
            onSurface('stone', 800, 646, 170, 24),
            onSurface('barrel', 800, 622, 34, 46),

            // Right Island (P2) — topY = 700
            b('bedrock', 1290, 724, 440, 48),
            onSurface('wood', 1135, 700, 26, 76),
            onSurface('stone', 1345, 700, 28, 110),
            onSurface('stone', 1445, 700, 28, 110),
            onSurface('core', 1395, 700, 40, 40, 2),
            onSurface('wood', 1395, 590, 140, 24)
        ]
    },
    {
        id: 'duel-repulsor',
        name: '반발 자기장 협곡',
        hint: '중앙 상공의 반발 패드에 포탄을 튕기면 엄폐물 뒤 적 코어를 위에서 직격할 수 있습니다.',
        p1Spawn: { x: 370, y: 660 },
        p2Spawn: { x: 1230, y: 660 },
        blocks: [
            b('bedrock', 320, 734, 420, 48),
            onSurface('steel', 485, 710, 32, 125),
            onSurface('wood', 165, 710, 24, 100),
            onSurface('wood', 255, 710, 24, 100),
            onSurface('core', 210, 710, 40, 40, 1),
            onSurface('stone', 210, 610, 125, 24),

            // Overhead repulsor diamonds
            b('bumper', 800, 250, 220, 24, 0),
            b('bumper', 630, 420, 130, 22, 28),
            b('bumper', 970, 420, 130, 22, -28),
            b('bedrock', 800, 680, 150, 36),
            onSurface('barrel', 800, 662, 36, 48),

            b('bedrock', 1280, 734, 420, 48),
            onSurface('steel', 1115, 710, 32, 125),
            onSurface('wood', 1345, 710, 24, 100),
            onSurface('wood', 1435, 710, 24, 100),
            onSurface('core', 1390, 710, 40, 40, 2),
            onSurface('stone', 1390, 610, 125, 24)
        ]
    },
    {
        id: 'duel-skybridge',
        name: '무너지는 천공 가교',
        hint: '좁은 기반암 외에는 모두 파괴되는 상판입니다. 바닥을 부숴 상대를 추락시키세요!',
        p1Spawn: { x: 360, y: 610 },
        p2Spawn: { x: 1240, y: 610 },
        blocks: [
            // P1 side narrow bedrock piers + destructible stone bridge floor
            b('bedrock', 190, 700, 140, 44),
            b('bedrock', 460, 700, 110, 44),
            onSurface('stone', 330, 678, 220, 28),
            onSurface('core', 185, 678, 40, 40, 1),
            onSurface('wood', 235, 678, 24, 90),
            onSurface('barrel', 460, 678, 34, 46),

            // Center island
            b('bedrock', 800, 720, 180, 44),
            onSurface('barrel', 765, 698, 34, 46),
            onSurface('barrel', 835, 698, 34, 46),

            // P2 side narrow bedrock piers + destructible stone bridge floor
            b('bedrock', 1140, 700, 110, 44),
            b('bedrock', 1410, 700, 140, 44),
            onSurface('stone', 1270, 678, 220, 28),
            onSurface('barrel', 1140, 678, 34, 46),
            onSurface('wood', 1365, 678, 24, 90),
            onSurface('core', 1415, 678, 40, 40, 2)
        ]
    }
];

// Compact UTF-8 safe URL-friendly Base64 Map Codec
export function encodeMapData(mapObj) {
    const compact = {
        v: 1,
        n: (mapObj.name || '커스텀 요새').slice(0, 40),
        p1: mapObj.p1Spawn ? [Math.round(mapObj.p1Spawn.x), Math.round(mapObj.p1Spawn.y)] : [320, 650],
        p2: mapObj.p2Spawn ? [Math.round(mapObj.p2Spawn.x), Math.round(mapObj.p2Spawn.y)] : [1280, 650],
        b: (mapObj.blocks || []).map((bl) => [
            MATERIAL_ORDER.indexOf(bl.type),
            Math.round(bl.x),
            Math.round(bl.y),
            Math.round(bl.w),
            Math.round(bl.h),
            Math.round(bl.angle || 0),
            bl.team || 0
        ])
    };
    const json = JSON.stringify(compact);
    const bytes = new TextEncoder().encode(json);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeMapData(codeStr) {
    const cleaned = codeStr.trim().replace(/^.*[\?&]map=/, '').split('&')[0];
    const b64 = cleaned.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
    const binary = atob(b64 + pad);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    const obj = JSON.parse(new TextDecoder().decode(bytes));
    if (!obj || !Array.isArray(obj.b)) {
        throw new Error('유효하지 않은 맵 코드 형식입니다.');
    }
    const blocks = obj.b
        .slice(0, 220)
        .map((arr) => {
            const type = MATERIAL_ORDER[arr[0]] || 'stone';
            return {
                type,
                x: Math.max(20, Math.min(WORLD_W - 20, Number(arr[1]) || 800)),
                y: Math.max(20, Math.min(WORLD_H - 20, Number(arr[2]) || 600)),
                w: Math.max(18, Math.min(700, Number(arr[3]) || 60)),
                h: Math.max(18, Math.min(400, Number(arr[4]) || 40)),
                angle: Math.max(-180, Math.min(180, Number(arr[5]) || 0)),
                team: Number(arr[6]) || 0
            };
        });

    return {
        id: 'custom-map',
        name: String(obj.n || '커스텀 요새'),
        hint: '에디터에서 제작된 커스텀 맵입니다.',
        launcher: { x: obj.p1 ? obj.p1[0] : 220, y: obj.p1 ? obj.p1[1] : 650 },
        p1Spawn: { x: obj.p1 ? obj.p1[0] : 320, y: obj.p1 ? obj.p1[1] : 650 },
        p2Spawn: { x: obj.p2 ? obj.p2[0] : 1280, y: obj.p2 ? obj.p2[1] : 650 },
        ammo: [4, 3, 2, 2],
        parShots: 3,
        blocks
    };
}
