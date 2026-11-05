// Ballistic Trajectory Solver & Tactical Movement AI for Solo vs AI Duel

export class SiegeBotAI {
    constructor() {
        this.nextThinkTick = 40;
        this.nextShotAt = 0;
        this.desiredX = 1250;
        this.homeCenterX = 1250;
    }

    reset(spawnX = 1250) {
        this.homeCenterX = spawnX;
        this.desiredX = spawnX;
        this.nextThinkTick = 35;
        this.nextShotAt = performance.now() + 1400;
    }

    update(world, nowMs = performance.now()) {
        const bot = world.tanks[2];
        const enemy = world.tanks[1];
        if (!bot || bot.hp <= 0 || world.matchEnded) return;

        // Evade incoming enemy projectiles & stay near safe island center
        let evadeDir = 0;
        let wantJump = false;
        for (const proj of world.projectiles.values()) {
            if (proj.ownerTeam === 1) {
                const dx = proj.body.position.x - bot.body.position.x;
                const dy = proj.body.position.y - bot.body.position.y;
                if (Math.abs(dx) < 190 && dy > -190 && dy < 50 && proj.body.velocity.x > 2) {
                    evadeDir = dx > 0 ? -1 : 1;
                    if (Math.abs(dx) < 110) wantJump = true;
                    break;
                }
            }
        }

        if (world.tickCount >= this.nextThinkTick) {
            this.nextThinkTick = world.tickCount + 42;
            this.desiredX = this.homeCenterX + (Math.random() - 0.5) * 140;
        }

        const offsetFromTarget = this.desiredX - bot.body.position.x;
        let moveX = evadeDir !== 0 ? evadeDir : Math.abs(offsetFromTarget) > 18 ? Math.sign(offsetFromTarget) : 0;

        // Safety clamp so bot does not drive off outer island cliff edges
        if (bot.body.position.x < this.homeCenterX - 155 && moveX < 0) moveX = 1;
        if (bot.body.position.x > this.homeCenterX + 155 && moveX > 0) moveX = -1;

        bot.input.moveX = moveX;
        bot.input.jump = wantJump;

        // Choose target (alternate between P1 tank and P1 core)
        let targetPos = enemy && enemy.hp > 0 ? enemy.body.position : null;
        for (const blk of world.blocks.values()) {
            if (blk.matId === 'core' && blk.team === 1) {
                if (!targetPos || Math.random() < 0.42) {
                    targetPos = blk.body.position;
                }
                break;
            }
        }
        if (!targetPos) return;

        if (nowMs < this.nextShotAt) return;

        // Pick an off-cooldown weapon
        const candidates = [1, 0, 3, 2].filter((w) => nowMs >= (bot.cooldowns[w] || 0));
        if (candidates.length === 0) return;
        const wepId = candidates[Math.floor(Math.random() * candidates.length)];
        bot.wepId = wepId;

        // Sample parabolic aim elevations to find best trajectory to targetPos
        const ox = bot.body.position.x - 28;
        const oy = bot.body.position.y - 12;
        let bestAim = { x: targetPos.x, y: targetPos.y - 220 };
        let bestDist = Infinity;

        for (let lift = 60; lift <= 540; lift += 40) {
            const ax = targetPos.x + (Math.random() - 0.5) * 35;
            const ay = targetPos.y - lift;
            const pts = world.predictTrajectory(ox, oy, ax, ay, wepId, 56);
            for (const p of pts) {
                const d = Math.hypot(p.x - targetPos.x, p.y - targetPos.y);
                if (d < bestDist) {
                    bestDist = d;
                    bestAim = { x: ax, y: ay };
                }
            }
        }

        // Smooth aim & fire with slight human-like scatter
        bot.aimX = bestAim.x + (Math.random() - 0.5) * 38;
        bot.aimY = bestAim.y + (Math.random() - 0.5) * 34;
        world.fireFromTank(2, bot.aimX, bot.aimY, wepId, nowMs);
        this.nextShotAt = nowMs + 1550 + Math.random() * 850;
    }
}
