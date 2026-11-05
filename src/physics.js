// Matter.js Rigid-Body Destruction Engine, Weapons, Singularity Vortex, P2P Snapshot Sync & Canvas Renderer

import { WORLD_W, WORLD_H, ABYSS_Y, MATERIALS, WEAPONS } from './stages.js';
import { sound } from './audio.js';

const STEP_MS = 1000 / 60;
const PROJ_AIR_FRICTION = 0.004;

export class SiegeWorld {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');

        this.mode = 'solo'; // 'solo' | 'ai' | 'p2p' | 'editor'
        this.isClientGuest = false;

        this.engine = null;
        this.nextNetId = 1;
        this.tickCount = 0;
        this.settled = false;

        this.blocks = new Map(); // netId -> blockRecord
        this.tanks = {};         // 1, 2 -> tankRecord
        this.projectiles = new Map(); // netId -> projRecord
        this.vortices = [];
        this.shockwaves = [];
        this.particles = [];
        this.pendingNetEvents = [];

        this.launcher = { x: 200, y: 650, aimX: 600, aimY: 450 };
        this.ammo = [3, 1, 0, 0];
        this.shotsFired = 0;
        this.selectedWeapon = 0;

        this.shakeMag = 0;
        this.slowMoTicks = 0;
        this.matchEnded = false;
        this.winnerInfo = null; // { winnerTeam, reason, stars }

        // Viewport transform (screen <-> 1600x900 world)
        this.view = { scale: 1, offsetX: 0, offsetY: 0, dpr: 1 };
        this.resize();
    }

    resize() {
        const rect = this.canvas.parentElement.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.canvas.width = Math.max(1, Math.floor(rect.width * dpr));
        this.canvas.height = Math.max(1, Math.floor(rect.height * dpr));

        const scaleX = rect.width / WORLD_W;
        const scaleY = rect.height / WORLD_H;
        const scale = Math.min(scaleX, scaleY);
        const offsetX = (rect.width - WORLD_W * scale) * 0.5;
        const offsetY = (rect.height - WORLD_H * scale) * 0.5;

        this.view = { scale, offsetX, offsetY, dpr, cssW: rect.width, cssH: rect.height };
    }

    screenToWorld(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();
        const sx = clientX - rect.left;
        const sy = clientY - rect.top;
        return {
            x: (sx - this.view.offsetX) / this.view.scale,
            y: (sy - this.view.offsetY) / this.view.scale
        };
    }

    loadStage(stageData, mode = 'solo', isClientGuest = false) {
        const Matter = window.Matter;
        this.mode = mode;
        this.isClientGuest = isClientGuest;
        this.nextNetId = 1;
        this.tickCount = 0;
        this.settled = false;
        this.matchEnded = false;
        this.winnerInfo = null;
        this._initialTeamCores = undefined;
        this.shotsFired = 0;
        this.shakeMag = 0;
        this.slowMoTicks = 0;

        this.blocks.clear();
        this.projectiles.clear();
        this.tanks = {};
        this.vortices = [];
        this.shockwaves = [];
        this.particles = [];
        this.pendingNetEvents = [];

        this.engine = Matter.Engine.create({
            positionIterations: 8,
            velocityIterations: 6
        });
        this.engine.gravity.y = 1.0;
        this.engine.gravity.scale = 0.001;

        this.launcher = {
            x: stageData.launcher ? stageData.launcher.x : 200,
            y: stageData.launcher ? stageData.launcher.y : 650,
            aimX: 720,
            aimY: 420
        };

        this.ammo = stageData.ammo ? [...stageData.ammo] : [99, 99, 99, 99];
        this.parShots = stageData.parShots || 2;
        this.selectFirstAvailableWeapon();

        // Spawn blocks
        for (const spec of stageData.blocks || []) {
            this.spawnBlock(spec);
        }

        // Spawn duel tanks for 'ai' or 'p2p'
        if (mode === 'ai' || mode === 'p2p') {
            const p1 = stageData.p1Spawn || { x: 340, y: 650 };
            const p2 = stageData.p2Spawn || { x: 1260, y: 650 };
            this.tanks[1] = this.createTank(1, p1.x, p1.y);
            this.tanks[2] = this.createTank(2, p2.x, p2.y);
        }

        if (!isClientGuest) {
            Matter.Events.on(this.engine, 'collisionStart', (ev) => this.onCollisionStart(ev));
        }
    }

    selectFirstAvailableWeapon() {
        if (this.mode !== 'solo') {
            this.selectedWeapon = 0;
            return;
        }
        for (let i = 0; i < WEAPONS.length; i++) {
            if ((this.ammo[i] || 0) > 0) {
                this.selectedWeapon = i;
                return;
            }
        }
        this.selectedWeapon = 0;
    }

    spawnBlock(spec) {
        const Matter = window.Matter;
        const mat = MATERIALS[spec.type] || MATERIALS.stone;
        const netId = this.nextNetId++;
        const angleRad = ((spec.angle || 0) * Math.PI) / 180;

        const body = Matter.Bodies.rectangle(spec.x, spec.y, spec.w, spec.h, {
            isStatic: mat.isStatic,
            density: mat.density,
            friction: mat.friction,
            restitution: mat.restitution,
            frictionAir: 0.012,
            angle: angleRad,
            chamfer: mat.isStatic ? undefined : { radius: 2 }
        });
        body.plugin = { kind: 'block', netId };
        Matter.Composite.add(this.engine.world, body);

        const rec = {
            netId,
            body,
            matId: mat.id,
            w: spec.w,
            h: spec.h,
            hp: mat.hp,
            maxHp: mat.hp,
            team: spec.team || 0
        };
        this.blocks.set(netId, rec);
        return rec;
    }

    createTank(team, x, y) {
        const Matter = window.Matter;
        const w = 48;
        const h = 30;
        const body = Matter.Bodies.rectangle(x, y, w, h, {
            density: 0.0042,
            friction: 0.25,
            frictionAir: 0.018,
            restitution: 0.1,
            inertia: Infinity,
            chamfer: { radius: 9 }
        });
        body.plugin = { kind: 'tank', team };
        Matter.Composite.add(this.engine.world, body);

        return {
            team,
            body,
            w,
            h,
            hp: 160,
            maxHp: 160,
            aimX: team === 1 ? x + 260 : x - 260,
            aimY: y - 120,
            wepId: 0,
            cooldowns: [0, 0, 0, 0],
            groundedUntil: 0,
            lastJumpAt: -1000,
            input: { moveX: 0, jump: false }
        };
    }

    computeLaunchVelocity(ox, oy, targetX, targetY, wepId = 0) {
        const dx = targetX - ox;
        const dy = targetY - oy;
        const dist = Math.hypot(dx, dy) || 1;
        const wep = WEAPONS[wepId] || WEAPONS[0];
        const rawSpeed = Math.min(28.5, Math.max(9.5, dist * 0.048)) * wep.speedMul;
        return {
            vx: (dx / dist) * rawSpeed,
            vy: (dy / dist) * rawSpeed
        };
    }

    predictTrajectory(ox, oy, targetX, targetY, wepId = 0, steps = 40) {
        const { vx: ivx, vy: ivy } = this.computeLaunchVelocity(ox, oy, targetX, targetY, wepId);
        const pts = [];
        let x = ox;
        let y = oy;
        let vx = ivx;
        let vy = ivy;
        const ay = 1.0 * 0.001 * STEP_MS * STEP_MS;

        for (let i = 0; i < steps; i++) {
            vx *= 1 - PROJ_AIR_FRICTION;
            vy = vy * (1 - PROJ_AIR_FRICTION) + ay;
            x += vx;
            y += vy;
            if (i % 2 === 1) {
                pts.push({ x, y });
            }
            if (y > ABYSS_Y) break;
        }
        return pts;
    }

    fireFromLauncher(targetX, targetY, wepId) {
        if (this.matchEnded || this.isClientGuest) return false;
        const count = this.ammo[wepId] || 0;
        if (count <= 0) return false;

        this.ammo[wepId] = count - 1;
        this.shotsFired++;
        const ox = this.launcher.x;
        const oy = this.launcher.y - 16;
        const { vx, vy } = this.computeLaunchVelocity(ox, oy, targetX, targetY, wepId);
        this.spawnProjectile(ox, oy, vx, vy, wepId, 1);

        if ((this.ammo[wepId] || 0) <= 0) {
            this.selectFirstAvailableWeapon();
        }
        return true;
    }

    fireFromTank(team, targetX, targetY, wepId, nowMs = performance.now()) {
        if (this.matchEnded || this.isClientGuest) return false;
        const tank = this.tanks[team];
        if (!tank || tank.hp <= 0) return false;

        const wep = WEAPONS[wepId] || WEAPONS[0];
        if (nowMs < (tank.cooldowns[wepId] || 0)) return false;

        tank.cooldowns[wepId] = nowMs + wep.cooldownMs;
        const dx = targetX - tank.body.position.x;
        const dy = targetY - (tank.body.position.y - 10);
        const len = Math.hypot(dx, dy) || 1;
        const ox = tank.body.position.x + (dx / len) * 34;
        const oy = tank.body.position.y - 10 + (dy / len) * 34;

        const { vx, vy } = this.computeLaunchVelocity(ox, oy, targetX, targetY, wepId);
        this.spawnProjectile(ox, oy, vx, vy, wepId, team);
        return true;
    }

    spawnProjectile(x, y, vx, vy, wepId, ownerTeam, isMini = false) {
        const Matter = window.Matter;
        const wep = WEAPONS[wepId] || WEAPONS[0];
        const netId = this.nextNetId++;
        const radius = isMini ? 5.5 : wep.radius;

        const body = Matter.Bodies.circle(x, y, radius, {
            density: wepId === 0 ? 0.011 : 0.006,
            frictionAir: PROJ_AIR_FRICTION,
            restitution: wepId === 0 ? 0.35 : 0.55,
            friction: 0.1
        });
        body.plugin = { kind: 'proj', netId };
        Matter.Body.setVelocity(body, { x: vx, y: vy });
        Matter.Composite.add(this.engine.world, body);

        this.projectiles.set(netId, {
            netId,
            body,
            wepId,
            ownerTeam,
            radius,
            isMini,
            bornTick: this.tickCount,
            trail: []
        });

        this.emitEvent({ t: 'fire', wepId, x: Math.round(x), y: Math.round(y) });
        sound.fireWeapon(wepId);
        this.burstParticles(x, y, wep.color, isMini ? 4 : 10, 4);
    }

    // Mid-air tactical trigger (Right-Click or E)
    triggerMidAirSpecial(ownerTeam = 1) {
        if (this.matchEnded || this.isClientGuest) return false;
        let targetProj = null;
        for (const proj of this.projectiles.values()) {
            if (proj.ownerTeam === ownerTeam && !proj.isMini && proj.wepId !== 0) {
                targetProj = proj;
            }
        }
        if (!targetProj) return false;

        const pos = targetProj.body.position;
        if (targetProj.wepId === 1) {
            // Mid-air Cluster burst: radial blast + 4 downward shrapnel bomblets
            const px = pos.x;
            const py = pos.y;
            this.removeProjectile(targetProj.netId);
            this.triggerExplosion(px, py, 145, 85, '#ef4444', 1.0);
            for (let i = -1.5; i <= 1.5; i += 1) {
                this.spawnProjectile(px + i * 8, py + 6, i * 4.2, 8.5 + Math.abs(i) * 1.5, 0, ownerTeam, true);
            }
            return true;
        }
        if (targetProj.wepId === 2) {
            const px = pos.x;
            const py = pos.y;
            this.removeProjectile(targetProj.netId);
            this.spawnSingularity(px, py, ownerTeam);
            return true;
        }
        if (targetProj.wepId === 3) {
            // Orbital vertical slam!
            window.Matter.Body.setVelocity(targetProj.body, { x: 0, y: 29 });
            this.burstParticles(pos.x, pos.y, '#a3e635', 16, 6);
            sound.fireWeapon(3);
            return true;
        }
        return false;
    }

    onCollisionStart(event) {
        if (this.matchEnded) return;
        for (const pair of event.pairs) {
            const a = pair.bodyA;
            const b = pair.bodyB;
            const pa = a.plugin || {};
            const pb = b.plugin || {};

            const relVx = (a.velocity?.x || 0) - (b.velocity?.x || 0);
            const relVy = (a.velocity?.y || 0) - (b.velocity?.y || 0);
            const relSpeed = Math.hypot(relVx, relVy);

            // Track tank grounded state
            if (pa.kind === 'tank') this.checkTankGroundContact(pa.team, a, b);
            if (pb.kind === 'tank') this.checkTankGroundContact(pb.team, b, a);

            // Handle projectile impacts
            if (pa.kind === 'proj') {
                this.handleProjectileHit(pa.netId, b, relSpeed);
                continue;
            }
            if (pb.kind === 'proj') {
                this.handleProjectileHit(pb.netId, a, relSpeed);
                continue;
            }

            // Ignore gentle settling contacts right after stage load
            if (!this.settled || relSpeed < 5.2) continue;

            if (pa.kind === 'block') this.applyImpactDamageToBlock(pa.netId, relSpeed * 2.8);
            if (pb.kind === 'block') this.applyImpactDamageToBlock(pb.netId, relSpeed * 2.8);
            if (pa.kind === 'tank' && relSpeed > 8.5) this.damageTank(pa.team, (relSpeed - 7) * 2.4);
            if (pb.kind === 'tank' && relSpeed > 8.5) this.damageTank(pb.team, (relSpeed - 7) * 2.4);
        }
    }

    checkTankGroundContact(team, tankBody, otherBody) {
        const tank = this.tanks[team];
        if (!tank) return;
        if (otherBody.position.y > tankBody.position.y + 8) {
            tank.groundedUntil = this.tickCount + 10;
        }
    }

    handleProjectileHit(projNetId, otherBody, relSpeed) {
        const proj = this.projectiles.get(projNetId);
        if (!proj) return;
        const otherMeta = otherBody.plugin || {};

        // Bounce off Repulsor Bumper pads!
        if (otherMeta.kind === 'block') {
            const blk = this.blocks.get(otherMeta.netId);
            if (blk && blk.matId === 'bumper') {
                sound.impact('bumper', 12);
                this.burstParticles(proj.body.position.x, proj.body.position.y, '#5eead4', 12, 5);
                return;
            }
        }

        const px = proj.body.position.x;
        const py = proj.body.position.y;

        if (proj.isMini) {
            this.removeProjectile(projNetId);
            this.triggerExplosion(px, py, 75, 38, '#fb923c', 0.55);
            return;
        }

        if (proj.wepId === 0) {
            // Kinetic AP Shell
            if (otherMeta.kind === 'block') {
                const blk = this.blocks.get(otherMeta.netId);
                if (blk) {
                    const mult = blk.matId === 'steel' ? 0.35 : 1.15;
                    const dmg = Math.max(45, relSpeed * 4.5) * mult;
                    const destroyed = this.damageBlock(blk.netId, dmg);
                    sound.impact(blk.matId, relSpeed);
                    this.burstParticles(px, py, '#f59e0b', 14, 5.5);
                    if (!destroyed || blk.matId === 'bedrock' || blk.matId === 'steel') {
                        this.removeProjectile(projNetId);
                    }
                    return;
                }
            } else if (otherMeta.kind === 'tank') {
                this.damageTank(otherMeta.team, 42);
                const pushX = Math.sign(proj.body.velocity.x || 1) * 0.22;
                window.Matter.Body.applyForce(otherBody, otherBody.position, { x: pushX, y: -0.14 });
                this.burstParticles(px, py, '#f59e0b', 16, 6);
                sound.impact('steel', 14);
                this.removeProjectile(projNetId);
                return;
            }
            this.removeProjectile(projNetId);
            return;
        }

        if (proj.wepId === 1) {
            // Cluster HE Bomb
            this.removeProjectile(projNetId);
            this.triggerExplosion(px, py, 160, 105, '#ef4444', 1.15);
            return;
        }

        if (proj.wepId === 2) {
            // Singularity Gravity Well
            this.removeProjectile(projNetId);
            this.spawnSingularity(px, py, proj.ownerTeam);
            return;
        }

        if (proj.wepId === 3) {
            // Seismic Bunker-Buster (heavy armor-cracking shockwave)
            this.removeProjectile(projNetId);
            this.triggerExplosion(px, py, 195, 165, '#a3e635', 1.35, true);
        }
    }

    spawnSingularity(x, y, ownerTeam) {
        this.vortices.push({
            x,
            y,
            radius: 255,
            bornTick: this.tickCount,
            durationTicks: 128, // ~2.1s
            ownerTeam
        });
        this.emitEvent({ t: 'vortex', x: Math.round(x), y: Math.round(y) });
        sound.singularityVortex(2.1);
        this.burstParticles(x, y, '#22d3ee', 24, 6);
    }

    triggerExplosion(x, y, radius, maxDamage, color = '#ef4444', intensity = 1.0, armorPiercing = false) {
        const Matter = window.Matter;
        this.shakeMag = Math.min(18, this.shakeMag + 7.5 * intensity);
        this.shockwaves.push({ x, y, r: 10, maxR: radius, color, alpha: 0.92 });
        this.burstParticles(x, y, color, Math.round(24 * intensity), 7.5 * intensity);
        this.emitEvent({
            t: 'exp',
            x: Math.round(x),
            y: Math.round(y),
            r: Math.round(radius),
            c: color,
            i: Number(intensity.toFixed(2))
        });
        sound.explode(intensity);

        // Apply blast damage and radial impulse to blocks
        const toCheck = Array.from(this.blocks.values());
        for (const blk of toCheck) {
            const dx = blk.body.position.x - x;
            const dy = blk.body.position.y - y;
            const dist = Math.hypot(dx, dy);
            if (dist > radius) continue;

            const falloff = 1 - dist / radius;
            if (!blk.body.isStatic) {
                const forceMag = 0.16 * intensity * falloff * blk.body.mass;
                const nx = dist > 1 ? dx / dist : 0;
                const ny = dist > 1 ? dy / dist : -1;
                Matter.Body.applyForce(blk.body, blk.body.position, {
                    x: nx * forceMag,
                    y: (ny - 0.35) * forceMag
                });
            }

            if (blk.hp !== Infinity) {
                let mult = 1.0;
                if (blk.matId === 'steel') {
                    mult = armorPiercing ? 0.95 : 0.32;
                }
                this.damageBlock(blk.netId, maxDamage * falloff * mult);
            }
        }

        // Apply blast damage & knockback to tanks
        for (const team of [1, 2]) {
            const tank = this.tanks[team];
            if (!tank || tank.hp <= 0) continue;
            const dx = tank.body.position.x - x;
            const dy = tank.body.position.y - y;
            const dist = Math.hypot(dx, dy);
            if (dist > radius) continue;

            const falloff = 1 - dist / radius;
            const nx = dist > 1 ? dx / dist : 0;
            const ny = dist > 1 ? dy / dist : -1;
            Matter.Body.setVelocity(tank.body, {
                x: tank.body.velocity.x + nx * 15 * falloff * intensity,
                y: tank.body.velocity.y + (ny - 0.55) * 14 * falloff * intensity
            });
            this.damageTank(team, maxDamage * 0.48 * falloff);
        }
    }

    applyImpactDamageToBlock(netId, rawDmg) {
        const blk = this.blocks.get(netId);
        if (!blk || blk.hp === Infinity) return;
        const mult = blk.matId === 'steel' ? 0.2 : 1.0;
        if (rawDmg * mult < 4) return;
        sound.impact(blk.matId, rawDmg * 0.35);
        this.damageBlock(netId, rawDmg * mult);
    }

    damageBlock(netId, amount) {
        const blk = this.blocks.get(netId);
        if (!blk || blk.hp === Infinity) return false;
        blk.hp -= amount;
        if (blk.hp > 0) return false;

        const pos = { x: blk.body.position.x, y: blk.body.position.y };
        const mat = MATERIALS[blk.matId] || MATERIALS.stone;
        window.Matter.Composite.remove(this.engine.world, blk.body);
        this.blocks.delete(netId);

        this.burstParticles(pos.x, pos.y, mat.color, 16, 5.5);

        if (blk.matId === 'barrel') {
            this.triggerExplosion(pos.x, pos.y, 175, 125, '#f97316', 1.25);
        } else if (blk.matId === 'core') {
            sound.coreShatter();
            this.slowMoTicks = 26;
            this.shakeMag = 14;
            this.shockwaves.push({ x: pos.x, y: pos.y, r: 8, maxR: 150, color: '#fef08a', alpha: 1 });
            this.burstParticles(pos.x, pos.y, '#facc15', 34, 8);
            this.emitEvent({ t: 'core', x: Math.round(pos.x), y: Math.round(pos.y) });
        }
        return true;
    }

    damageTank(team, amount) {
        const tank = this.tanks[team];
        if (!tank || tank.hp <= 0) return;
        tank.hp = Math.max(0, tank.hp - amount);
        if (tank.hp <= 0) {
            const pos = tank.body.position;
            this.triggerExplosion(pos.x, pos.y, 150, 60, team === 1 ? '#f59e0b' : '#22d3ee', 1.3);
        }
    }

    removeProjectile(netId) {
        const proj = this.projectiles.get(netId);
        if (!proj) return;
        window.Matter.Composite.remove(this.engine.world, proj.body);
        this.projectiles.delete(netId);
    }

    burstParticles(x, y, color, count = 14, speed = 5) {
        for (let i = 0; i < count; i++) {
            const ang = Math.random() * Math.PI * 2;
            const spd = (0.25 + Math.random() * 0.85) * speed;
            this.particles.push({
                x,
                y,
                vx: Math.cos(ang) * spd,
                vy: Math.sin(ang) * spd - 1.2,
                size: 2.5 + Math.random() * 4.5,
                color,
                life: 24 + Math.floor(Math.random() * 22),
                maxLife: 46
            });
        }
    }

    emitEvent(ev) {
        this.pendingNetEvents.push(ev);
    }

    // Step authoritative physics (Host / Solo / AI)
    step() {
        this.updateVisualEffects();
        if (this.isClientGuest || !this.engine) return;

        if (this.slowMoTicks > 0) {
            this.slowMoTicks--;
            if (this.slowMoTicks % 2 === 1) return;
        }

        this.tickCount++;
        if (this.tickCount === 28) {
            this.settled = true;
        }

        // Process active Singularity Gravity Vortices
        this.stepVortices();

        // Process Duel Tank movement inputs
        this.stepTanks();

        window.Matter.Engine.update(this.engine, STEP_MS);

        // Update projectile trails & cleanup out-of-bounds entities
        for (const [netId, proj] of this.projectiles.entries()) {
            const pos = proj.body.position;
            proj.trail.push({ x: pos.x, y: pos.y });
            if (proj.trail.length > 16) proj.trail.shift();

            if (pos.y > ABYSS_Y + 60 || pos.x < -250 || pos.x > WORLD_W + 250 || this.tickCount - proj.bornTick > 480) {
                this.removeProjectile(netId);
            }
        }

        for (const [netId, blk] of this.blocks.entries()) {
            if (blk.body.position.y > ABYSS_Y) {
                if (blk.matId === 'core') {
                    sound.coreShatter();
                    this.emitEvent({ t: 'core', x: Math.round(blk.body.position.x), y: WORLD_H - 20 });
                }
                window.Matter.Composite.remove(this.engine.world, blk.body);
                this.blocks.delete(netId);
            }
        }

        for (const team of [1, 2]) {
            const tank = this.tanks[team];
            if (tank && tank.hp > 0 && tank.body.position.y > ABYSS_Y) {
                tank.hp = 0;
                sound.explode(1.1);
            }
        }

        this.evaluateWinConditions();
    }

    stepVortices() {
        const Matter = window.Matter;
        for (let i = this.vortices.length - 1; i >= 0; i--) {
            const v = this.vortices[i];
            const age = this.tickCount - v.bornTick;
            if (age >= v.durationTicks) {
                // Violent final implosion-burst!
                this.vortices.splice(i, 1);
                this.triggerExplosion(v.x, v.y, 175, 75, '#22d3ee', 1.1);
                continue;
            }

            if (age % 3 === 0) {
                const ang = Math.random() * Math.PI * 2;
                const r = v.radius * (0.55 + Math.random() * 0.45);
                this.particles.push({
                    x: v.x + Math.cos(ang) * r,
                    y: v.y + Math.sin(ang) * r,
                    vx: -Math.cos(ang) * 5.2,
                    vy: -Math.sin(ang) * 5.2,
                    size: 3,
                    color: '#22d3ee',
                    life: 18,
                    maxLife: 18
                });
            }

            for (const blk of this.blocks.values()) {
                if (blk.body.isStatic) continue;
                const dx = v.x - blk.body.position.x;
                const dy = v.y - blk.body.position.y;
                const dist = Math.hypot(dx, dy);
                if (dist > 14 && dist < v.radius) {
                    const pull = 0.0042 * (1 - dist / v.radius * 0.5) * blk.body.mass;
                    Matter.Body.applyForce(blk.body, blk.body.position, {
                        x: (dx / dist) * pull,
                        y: (dy / dist) * pull
                    });
                }
            }

            for (const team of [1, 2]) {
                const tank = this.tanks[team];
                if (!tank || tank.hp <= 0) continue;
                const dx = v.x - tank.body.position.x;
                const dy = v.y - tank.body.position.y;
                const dist = Math.hypot(dx, dy);
                if (dist > 18 && dist < v.radius) {
                    const pull = 0.0028 * tank.body.mass;
                    Matter.Body.applyForce(tank.body, tank.body.position, {
                        x: (dx / dist) * pull,
                        y: (dy / dist) * pull
                    });
                }
            }
        }
    }

    stepTanks() {
        const Matter = window.Matter;
        for (const team of [1, 2]) {
            const tank = this.tanks[team];
            if (!tank || tank.hp <= 0) continue;

            const moveX = Math.max(-1, Math.min(1, tank.input.moveX || 0));
            const curVel = tank.body.velocity;
            const desiredVx = moveX * 4.4;
            const blend = moveX !== 0 ? 0.22 : 0.12;
            const nextVx = curVel.x + (desiredVx - curVel.x) * blend;

            let nextVy = curVel.y;
            if (
                tank.input.jump &&
                this.tickCount <= tank.groundedUntil &&
                this.tickCount - tank.lastJumpAt > 24
            ) {
                nextVy = -9.6;
                tank.lastJumpAt = this.tickCount;
                tank.groundedUntil = 0;
                this.burstParticles(tank.body.position.x, tank.body.position.y + 14, '#94a3b8', 6, 2.5);
            }

            Matter.Body.setVelocity(tank.body, { x: nextVx, y: nextVy });
        }
    }

    evaluateWinConditions() {
        if (this.matchEnded) return;

        if (this.mode === 'solo') {
            let remainingCores = 0;
            for (const blk of this.blocks.values()) {
                if (blk.matId === 'core') remainingCores++;
            }
            if (remainingCores === 0) {
                this.matchEnded = true;
                const extraShots = Math.max(0, this.shotsFired - this.parShots);
                const stars = extraShots === 0 ? 3 : extraShots === 1 ? 2 : 1;
                this.winnerInfo = {
                    winnerTeam: 1,
                    title: '목표 코어 완파!',
                    reason: `사용 탄약 ${this.shotsFired}발 (기준 ${this.parShots}발)`,
                    stars
                };
                sound.victory();
                return;
            }

            const totalAmmoLeft = this.ammo.reduce((s, n) => s + n, 0);
            if (
                totalAmmoLeft === 0 &&
                this.projectiles.size === 0 &&
                this.vortices.length === 0 &&
                this.tickCount % 30 === 0
            ) {
                // Wait until all blocks stop moving rapidly before declaring out-of-ammo
                let moving = false;
                for (const blk of this.blocks.values()) {
                    if (!blk.body.isStatic && blk.body.speed > 0.8) {
                        moving = true;
                        break;
                    }
                }
                if (!moving) {
                    this.matchEnded = true;
                    this.winnerInfo = {
                        winnerTeam: 0,
                        title: '탄약 소진',
                        reason: `남은 코어 ${remainingCores}개 — 각도를 바꿔 재도전해 보세요!`,
                        stars: 0
                    };
                }
            }
            return;
        }

        if (this.mode === 'ai' || this.mode === 'p2p') {
            let p1Cores = 0;
            let p2Cores = 0;
            let hadTeamCores = false;
            for (const blk of this.blocks.values()) {
                if (blk.matId === 'core') {
                    if (blk.team === 1) { p1Cores++; hadTeamCores = true; }
                    if (blk.team === 2) { p2Cores++; hadTeamCores = true; }
                }
            }

            const t1Dead = !this.tanks[1] || this.tanks[1].hp <= 0;
            const t2Dead = !this.tanks[2] || this.tanks[2].hp <= 0;
            // Detect whether this arena initially had team cores by checking if either team lost all cores
            if (this._initialTeamCores === undefined) {
                this._initialTeamCores = { 1: p1Cores, 2: p2Cores };
            }
            const c1Lost = this._initialTeamCores[1] > 0 && p1Cores === 0;
            const c2Lost = this._initialTeamCores[2] > 0 && p2Cores === 0;

            if (t2Dead || c2Lost) {
                this.matchEnded = true;
                this.winnerInfo = {
                    winnerTeam: 1,
                    title: '1P (AMBER) 승리!',
                    reason: c2Lost ? '2P 에너지 코어를 파괴했습니다!' : '2P 전차를 격파했습니다!',
                    stars: 3
                };
                sound.victory();
            } else if (t1Dead || c1Lost) {
                this.matchEnded = true;
                this.winnerInfo = {
                    winnerTeam: 2,
                    title: this.mode === 'ai' ? 'AI 전차 승리!' : '2P (TEAL) 승리!',
                    reason: c1Lost ? '1P 에너지 코어가 파괴되었습니다.' : '1P 전차가 격파되었습니다.',
                    stars: 0
                };
                sound.victory();
            }
            void hadTeamCores;
        }
    }

    // Export compact state snapshot from Host -> P2P Guest
    serializeSnapshot() {
        const blocksArr = [];
        for (const blk of this.blocks.values()) {
            if (blk.body.isStatic) continue;
            blocksArr.push([
                blk.netId,
                Math.round(blk.body.position.x * 10) / 10,
                Math.round(blk.body.position.y * 10) / 10,
                Math.round(blk.body.angle * 1000) / 1000,
                Math.round(blk.hp)
            ]);
        }

        const projsArr = [];
        for (const p of this.projectiles.values()) {
            projsArr.push([
                p.netId,
                p.wepId,
                Math.round(p.body.position.x * 10) / 10,
                Math.round(p.body.position.y * 10) / 10,
                p.isMini ? 1 : 0
            ]);
        }

        const tanksArr = {};
        for (const team of [1, 2]) {
            const t = this.tanks[team];
            if (t) {
                tanksArr[team] = [
                    Math.round(t.body.position.x * 10) / 10,
                    Math.round(t.body.position.y * 10) / 10,
                    Math.round(t.hp),
                    Math.round(t.aimX),
                    Math.round(t.aimY),
                    t.wepId
                ];
            }
        }

        const events = this.pendingNetEvents.splice(0, this.pendingNetEvents.length);
        return {
            b: blocksArr,
            p: projsArr,
            tk: tanksArr,
            v: this.vortices.map((vx) => [Math.round(vx.x), Math.round(vx.y)]),
            ev: events,
            end: this.matchEnded ? this.winnerInfo : null
        };
    }

    // Apply Host snapshot on P2P Guest
    applySnapshot(snap) {
        const Matter = window.Matter;
        if (!snap || !this.engine) return;

        const aliveDynamicIds = new Set();
        for (const item of snap.b || []) {
            const [id, x, y, angle, hp] = item;
            aliveDynamicIds.add(id);
            const blk = this.blocks.get(id);
            if (blk) {
                Matter.Body.setPosition(blk.body, {
                    x: blk.body.position.x + (x - blk.body.position.x) * 0.6,
                    y: blk.body.position.y + (y - blk.body.position.y) * 0.6
                });
                Matter.Body.setAngle(blk.body, angle);
                blk.hp = hp;
            }
        }

        for (const [id, blk] of this.blocks.entries()) {
            if (!blk.body.isStatic && !aliveDynamicIds.has(id)) {
                const mat = MATERIALS[blk.matId] || MATERIALS.stone;
                this.burstParticles(blk.body.position.x, blk.body.position.y, mat.color, 10, 4);
                Matter.Composite.remove(this.engine.world, blk.body);
                this.blocks.delete(id);
            }
        }

        // Sync projectiles on guest
        const aliveProjIds = new Set();
        for (const item of snap.p || []) {
            const [id, wepId, x, y, isMini] = item;
            aliveProjIds.add(id);
            let proj = this.projectiles.get(id);
            if (!proj) {
                const wep = WEAPONS[wepId] || WEAPONS[0];
                const radius = isMini ? 5.5 : wep.radius;
                const body = Matter.Bodies.circle(x, y, radius, { isSensor: true });
                proj = { netId: id, body, wepId, radius, isMini: Boolean(isMini), trail: [] };
                this.projectiles.set(id, proj);
            } else {
                Matter.Body.setPosition(proj.body, { x, y });
            }
            proj.trail.push({ x, y });
            if (proj.trail.length > 14) proj.trail.shift();
        }
        for (const id of Array.from(this.projectiles.keys())) {
            if (!aliveProjIds.has(id)) {
                this.projectiles.delete(id);
            }
        }

        // Sync tanks
        for (const team of [1, 2]) {
            const td = snap.tk && snap.tk[team];
            const tank = this.tanks[team];
            if (td && tank) {
                Matter.Body.setPosition(tank.body, {
                    x: tank.body.position.x + (td[0] - tank.body.position.x) * 0.65,
                    y: tank.body.position.y + (td[1] - tank.body.position.y) * 0.65
                });
                tank.hp = td[2];
                if (team === 1) {
                    tank.aimX = td[3];
                    tank.aimY = td[4];
                    tank.wepId = td[5];
                }
            }
        }

        this.vortices = (snap.v || []).map(([x, y]) => ({ x, y, radius: 255 }));

        for (const ev of snap.ev || []) {
            if (ev.t === 'fire') {
                sound.fireWeapon(ev.wepId);
            } else if (ev.t === 'exp') {
                this.shakeMag = Math.min(16, this.shakeMag + 6 * ev.i);
                this.shockwaves.push({ x: ev.x, y: ev.y, r: 10, maxR: ev.r, color: ev.c, alpha: 0.9 });
                this.burstParticles(ev.x, ev.y, ev.c, 18, 6);
                sound.explode(ev.i);
            } else if (ev.t === 'vortex') {
                sound.singularityVortex(2.0);
            } else if (ev.t === 'core') {
                sound.coreShatter();
                this.burstParticles(ev.x, ev.y, '#facc15', 30, 7.5);
            }
        }

        if (snap.end && !this.matchEnded) {
            this.matchEnded = true;
            this.winnerInfo = snap.end;
            sound.victory();
        }
    }

    updateVisualEffects() {
        if (this.shakeMag > 0.1) {
            this.shakeMag *= 0.88;
        } else {
            this.shakeMag = 0;
        }

        for (let i = this.shockwaves.length - 1; i >= 0; i--) {
            const sw = this.shockwaves[i];
            sw.r += (sw.maxR - sw.r) * 0.24;
            sw.alpha -= 0.055;
            if (sw.alpha <= 0) this.shockwaves.splice(i, 1);
        }

        for (let i = this.particles.length - 1; i >= 0; i--) {
            const pt = this.particles[i];
            pt.x += pt.vx;
            pt.y += pt.vy;
            pt.vy += 0.18;
            pt.life--;
            if (pt.life <= 0) this.particles.splice(i, 1);
        }
    }

    render(activeControlTeam = 1, editorOverlayFn = null) {
        const ctx = this.ctx;
        const { scale, offsetX, offsetY, dpr, cssW, cssH } = this.view;

        ctx.save();
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, cssW, cssH);

        const shakeX = this.shakeMag ? (Math.random() - 0.5) * this.shakeMag : 0;
        const shakeY = this.shakeMag ? (Math.random() - 0.5) * this.shakeMag : 0;

        ctx.translate(offsetX + shakeX, offsetY + shakeY);
        ctx.scale(scale, scale);

        // Subtle atmospheric horizon & abyss danger zone
        this.drawArenaBackdrop(ctx);

        // Singularity Gravity Wells
        for (const v of this.vortices) {
            const grad = ctx.createRadialGradient(v.x, v.y, 6, v.x, v.y, v.radius);
            grad.addColorStop(0, 'rgba(8, 15, 28, 0.96)');
            grad.addColorStop(0.22, 'rgba(34, 211, 238, 0.45)');
            grad.addColorStop(1, 'rgba(34, 211, 238, 0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(v.x, v.y, v.radius, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = 'rgba(34, 211, 238, 0.7)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(v.x, v.y, 20 + Math.sin(performance.now() * 0.015) * 4, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Trajectory Aiming Arc (when match active & not editor)
        if (!this.matchEnded && this.mode !== 'editor') {
            this.drawAimPreview(ctx, activeControlTeam);
        }

        // Blocks
        for (const blk of this.blocks.values()) {
            this.drawBlock(ctx, blk);
        }

        // Solo Artillery Pedestal OR Duel Tanks
        if (this.mode === 'solo') {
            this.drawSoloLauncher(ctx);
        } else if (this.mode === 'ai' || this.mode === 'p2p') {
            this.drawTank(ctx, this.tanks[1]);
            this.drawTank(ctx, this.tanks[2]);
        }

        // Projectiles & Trails
        for (const proj of this.projectiles.values()) {
            this.drawProjectile(ctx, proj);
        }

        // Expanding Shockwaves
        for (const sw of this.shockwaves) {
            ctx.save();
            ctx.globalAlpha = Math.max(0, sw.alpha);
            ctx.strokeStyle = sw.color;
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(sw.x, sw.y, sw.r, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        // Debris & Spark Particles
        for (const pt of this.particles) {
            ctx.save();
            ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
            ctx.fillStyle = pt.color;
            ctx.fillRect(pt.x - pt.size * 0.5, pt.y - pt.size * 0.5, pt.size, pt.size);
            ctx.restore();
        }

        if (editorOverlayFn) {
            editorOverlayFn(ctx);
        }

        ctx.restore();
    }

    drawArenaBackdrop(ctx) {
        // Subtle distant mountain silhouettes
        ctx.fillStyle = 'rgba(15, 22, 34, 0.55)';
        ctx.beginPath();
        ctx.moveTo(0, WORLD_H);
        ctx.lineTo(0, 620);
        ctx.lineTo(280, 490);
        ctx.lineTo(590, 640);
        ctx.lineTo(940, 470);
        ctx.lineTo(1310, 610);
        ctx.lineTo(WORLD_W, 520);
        ctx.lineTo(WORLD_W, WORLD_H);
        ctx.closePath();
        ctx.fill();

        // Abyss danger glow at bottom of world
        const abyssGrad = ctx.createLinearGradient(0, WORLD_H - 65, 0, WORLD_H);
        abyssGrad.addColorStop(0, 'rgba(239, 68, 68, 0)');
        abyssGrad.addColorStop(1, 'rgba(239, 68, 68, 0.24)');
        ctx.fillStyle = abyssGrad;
        ctx.fillRect(0, WORLD_H - 65, WORLD_W, 65);
    }

    drawAimPreview(ctx, activeTeam) {
        let ox, oy, ax, ay, wepId;
        if (this.mode === 'solo') {
            ox = this.launcher.x;
            oy = this.launcher.y - 16;
            ax = this.launcher.aimX;
            ay = this.launcher.aimY;
            wepId = this.selectedWeapon;
        } else {
            const tank = this.tanks[activeTeam];
            if (!tank || tank.hp <= 0) return;
            const dx = tank.aimX - tank.body.position.x;
            const dy = tank.aimY - (tank.body.position.y - 10);
            const len = Math.hypot(dx, dy) || 1;
            ox = tank.body.position.x + (dx / len) * 34;
            oy = tank.body.position.y - 10 + (dy / len) * 34;
            ax = tank.aimX;
            ay = tank.aimY;
            wepId = tank.wepId;
        }

        const wep = WEAPONS[wepId] || WEAPONS[0];
        const pts = this.predictTrajectory(ox, oy, ax, ay, wepId, 38);
        ctx.save();
        pts.forEach((p, idx) => {
            const alpha = Math.max(0.08, 0.68 - idx * 0.032);
            ctx.fillStyle = wep.color;
            ctx.globalAlpha = alpha;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 3.1, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.restore();
    }

    drawBlock(ctx, blk) {
        const mat = MATERIALS[blk.matId] || MATERIALS.stone;
        const { x, y } = blk.body.position;
        const angle = blk.body.angle;

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);

        const hw = blk.w * 0.5;
        const hh = blk.h * 0.5;

        // Fill & crisp border
        let fill = mat.color;
        let stroke = mat.stroke;
        if (blk.matId === 'core') {
            if (blk.team === 1) {
                fill = '#d97706';
                stroke = '#fde68a';
            } else if (blk.team === 2) {
                fill = '#0891b2';
                stroke = '#a5f3fc';
            }
        }

        ctx.fillStyle = fill;
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(-hw, -hh, blk.w, blk.h, blk.body.isStatic ? 3 : 4);
        ctx.fill();
        ctx.stroke();

        // Material detail markings
        if (blk.matId === 'barrel') {
            ctx.fillStyle = '#fef08a';
            ctx.fillRect(-hw + 3, -4, blk.w - 6, 8);
        } else if (blk.matId === 'core') {
            const pulse = 7 + Math.sin(performance.now() * 0.008) * 2.2;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(0, 0, pulse, 0, Math.PI * 2);
            ctx.fill();
        } else if (blk.matId === 'steel') {
            ctx.fillStyle = 'rgba(255,255,255,0.22)';
            ctx.fillRect(-hw + 5, -hh + 5, 4, 4);
            ctx.fillRect(hw - 9, hh - 9, 4, 4);
        }

        // Crack overlay when damaged
        if (blk.hp !== Infinity && blk.hp < blk.maxHp) {
            const ratio = blk.hp / blk.maxHp;
            ctx.strokeStyle = 'rgba(10, 14, 20, 0.72)';
            ctx.lineWidth = ratio < 0.45 ? 2.4 : 1.5;
            ctx.beginPath();
            ctx.moveTo(-hw * 0.5, -hh * 0.6);
            ctx.lineTo(0, 0);
            ctx.lineTo(hw * 0.4, hh * 0.55);
            if (ratio < 0.5) {
                ctx.moveTo(hw * 0.45, -hh * 0.4);
                ctx.lineTo(-hw * 0.35, hh * 0.45);
            }
            ctx.stroke();
        }

        ctx.restore();
    }

    drawSoloLauncher(ctx) {
        const { x, y, aimX, aimY } = this.launcher;
        const ang = Math.atan2(aimY - (y - 16), aimX - x);

        ctx.save();
        ctx.translate(x, y - 16);
        ctx.rotate(ang);
        ctx.fillStyle = '#cbd5e1';
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(0, -7, 38, 14, 4);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        // Armored turret base
        ctx.fillStyle = '#f59e0b';
        ctx.strokeStyle = '#fde68a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y - 14, 18, Math.PI, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#334155';
        ctx.fillRect(x - 24, y - 14, 48, 14);
    }

    drawTank(ctx, tank) {
        if (!tank || tank.hp <= 0) return;
        const { x, y } = tank.body.position;
        const mainColor = tank.team === 1 ? '#f59e0b' : '#22d3ee';
        const trimColor = tank.team === 1 ? '#fde68a' : '#a5f3fc';
        const ang = Math.atan2(tank.aimY - (y - 10), tank.aimX - x);

        ctx.save();
        // Turret barrel
        ctx.save();
        ctx.translate(x, y - 10);
        ctx.rotate(ang);
        ctx.fillStyle = '#e2e8f0';
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(0, -5, 32, 10, 3);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        // Chassis body
        ctx.fillStyle = mainColor;
        ctx.strokeStyle = trimColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(x - 24, y - 11, 48, 20, 6);
        ctx.fill();
        ctx.stroke();

        // Dome
        ctx.beginPath();
        ctx.arc(x, y - 11, 11, Math.PI, 0);
        ctx.fill();
        ctx.stroke();

        // Treads
        ctx.fillStyle = '#1e293b';
        ctx.strokeStyle = '#64748b';
        ctx.beginPath();
        ctx.roundRect(x - 26, y + 6, 52, 9, 4);
        ctx.fill();
        ctx.stroke();

        // Overhead mini HP bar
        const hpRatio = Math.max(0, tank.hp / tank.maxHp);
        ctx.fillStyle = 'rgba(10, 14, 22, 0.8)';
        ctx.fillRect(x - 24, y - 34, 48, 5);
        ctx.fillStyle = mainColor;
        ctx.fillRect(x - 24, y - 34, 48 * hpRatio, 5);

        ctx.restore();
    }

    drawProjectile(ctx, proj) {
        const wep = WEAPONS[proj.wepId] || WEAPONS[0];
        const pos = proj.body.position;

        if (proj.trail.length > 1) {
            ctx.save();
            ctx.strokeStyle = wep.color;
            ctx.lineWidth = proj.isMini ? 2 : 3.5;
            ctx.globalAlpha = 0.45;
            ctx.beginPath();
            proj.trail.forEach((pt, idx) => {
                if (idx === 0) ctx.moveTo(pt.x, pt.y);
                else ctx.lineTo(pt.x, pt.y);
            });
            ctx.stroke();
            ctx.restore();
        }

        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = wep.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, proj.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }
}
