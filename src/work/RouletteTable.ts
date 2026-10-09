import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { getAssetUrlById, type EngineLike } from 'types/game.js';
import type { PlayerController } from 'engine/PlayerController.js';
import { InteractableComponent } from 'engine/InteractableComponent.js';
import { PhysicsBodyFactory } from 'engine/physics/PhysicsBodyFactory.js';
import { CollisionGroup } from 'engine/CollisionLayers.js';
import { GameState, getGameStateManager } from 'engine/GameStateManager.js';
import type { GameHUD } from './GameHUD.js';
import { RouletteRound, ROULETTE_SPIN_SECONDS, ROULETTE_STAKES, WHEEL_ORDER, rouletteColor, type RouletteBet, type RouletteWallet } from './RouletteRound.js';

export const ROULETTE_POSITION = new THREE.Vector3(-5.7, .025, 41.1);
const labels = { red: 'Red', black: 'Black', odd: 'Odd', even: 'Even', low: '1–18', high: '19–36' };
const betLabel = (bet: RouletteBet) => typeof bet === 'number' ? `Number ${bet}` : labels[bet];

import { NpcIdleBehavior } from 'engine/npc/behaviors/NpcIdleBehavior.js';
import type { NpcController } from 'engine/npc/core/NpcController.js';

const DEALER_ID = "starlight_croupier";
const TOP = 1.02;
const TAU = Math.PI * 2;
type Spot = { x: number; z: number; w: number; d: number; label: string; bet?: RouletteBet; stake?: number; spin?: boolean };
class DealerBehavior extends NpcIdleBehavior {
    constructor() { super({ lookAtPlayer: true, lookAtRange: 5, randomIdleMotions: false }); }
    override update(): THREE.Vector3 | null { return null; }
    override clone(): DealerBehavior { return new DealerBehavior(); }
    override getName(): string { return "Starlight croupier"; }
}

/** Play on the felt with the same E / touch interaction as the slot machine. */
export class RouletteTable {
    private root = new THREE.Group();
    private interaction: InteractableComponent | null = null;
    private body: ReturnType<typeof PhysicsBodyFactory.createStaticBody> | null = null;
    private dealer: NpcController | null = null;
    private pose: ReturnType<NpcController["acquirePoseOverride"]> = null;
    private handTarget = new THREE.Object3D();
    private restingHand = new THREE.Vector3();
    private reaching = false;
    private readonly round: RouletteRound;
    private selected: RouletteBet = "red";
    private stake = 5;
    private message = "PLACE YOUR BETS";
    private wheel = new THREE.Group();
    private ball = new THREE.Mesh(new THREE.SphereGeometry(.026, 16, 12), new THREE.MeshStandardMaterial({color:0xffffee,roughness:.2}));
    private chip = new THREE.Mesh(new THREE.CylinderGeometry(.055,.055,.025,24), new THREE.MeshStandardMaterial({color:0xe6c768,metalness:.4,roughness:.35}));
    private spots: Spot[] = [];
    private canvas = document.createElement("canvas");
    private texture = new THREE.CanvasTexture(this.canvas);
    private audioBuffer: AudioBuffer | null = null;
    private audioSource: AudioBufferSourceNode | null = null;
    private audioGain: GainNode | null = null;
    private readonly audioAbort = new AbortController();
    private readonly onState = (state: GameState): void => { if (state !== GameState.PLAYING) this.stopRollSound(); };
    private wheelStart = 0;
    private wheelEnd = 0;
    private disposed = false;
    private hovered: Spot | null = null;
    private readonly ray = new THREE.Ray();
    private readonly plane = new THREE.Plane(new THREE.Vector3(0,1,0), -(ROULETTE_POSITION.y+TOP+.015));
    private readonly hit = new THREE.Vector3();

    constructor(private readonly engine: EngineLike, private readonly player: PlayerController,
        private readonly camera: () => THREE.Camera, private readonly wallet: RouletteWallet,
        private readonly hud: GameHUD, private readonly onRoundComplete: () => void = () => {}) {
        this.round = new RouletteRound(wallet);
        getGameStateManager().addListener(this.onState);
    }

    async load(): Promise<void> {
        const url = getAssetUrlById(this.engine.getGameData?.() ?? null, "starlight-roulette-table");
        if (!url) throw new Error("Missing Starlight roulette table asset");
        const model = (await new GLTFLoader().loadAsync(url)).scene;
        this.root.add(model);
        if (this.disposed) { this.releaseModel(); return; }
        model.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(model), size = bounds.getSize(new THREE.Vector3());
        // Reuse the walnut pedestal below the working replacement tabletop.
        model.scale.set(3.3/size.x,.88/size.y,1.6/size.z);
        model.updateMatrixWorld(true); bounds.setFromObject(model);
        const centre = bounds.getCenter(new THREE.Vector3());
        model.position.set(-centre.x,-bounds.min.y,-centre.z);
        this.root.name = "Starlight roulette table"; this.root.position.copy(ROULETTE_POSITION);
        this.buildMechanism();
        this.root.traverse(o => { if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true; } });
        this.engine.getWorldGroup().add(this.root);
        const physics = this.engine.physicsWorld;
        if (!physics) throw new Error("Roulette table requires physics");
        this.body = PhysicsBodyFactory.createStaticBody(physics, ROULETTE_POSITION.clone().add(new THREE.Vector3(0,.52,0)), {
            shape: { type: "box", halfExtents: new THREE.Vector3(1.88,.52,.95) },
            collisionGroup: CollisionGroup.ENVIRONMENT, collisionMask: CollisionGroup.PLAYER,
        });
        this.interaction = new InteractableComponent(physics, {
            object3D: this.root, radius: 3.5,
            interactable: {
                interactionEnabled: () => this.accessible(),
                getInteractStartDisplayName: () => this.prompt(),
                onInteractStart: () => this.interact(),
            },
        });
        const manager = this.engine.registerNpc(DEALER_ID, new DealerBehavior(), {
            characterAssetId: "asset_1791127414097_8138sk", importance: "hero", damageable: { canDie: false },
        });
        await manager.spawn(-6.8,42.55,1.5);
        this.dealer = this.engine.getNpcRegistry?.()?.get(DEALER_ID)?.getAllNpcs()[0] ?? null;
        if (!this.dealer) throw new Error("Roulette dealer failed to spawn");
        if (this.disposed) { this.engine.getNpcRegistry?.()?.unregisterController(DEALER_ID); return; }
        this.dealer.teleportTo(-6.8,.04,42.55);
        this.dealer.getCharacter().rotation.y = Math.PI;
        this.dealer.setRetreatFromPlayerOverlap(false);
        this.dealer.setInteractionEnabledOverride(() => false);
        if (!this.dealer.isRenderingSkinnedMesh()) this.pose = this.dealer.acquirePoseOverride({parts:["rightUpperArm","rightForearm","rightHand"],preserveFeet:true,preserveRootHeight:true});
        this.engine.getWorldGroup().add(this.handTarget);
        await this.loadRollSound();
        this.refresh();
    }

    private surface(canvas: HTMLCanvasElement, w: number, d: number, x: number, y: number, z: number): THREE.Mesh {
        const texture = canvas === this.canvas ? this.texture : new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8;
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w,d), new THREE.MeshStandardMaterial({map:texture,roughness:.85}));
        mesh.rotation.x = -Math.PI/2; mesh.position.set(x,y,z); return mesh;
    }

    private buildMechanism(): void {
        const brass = new THREE.MeshStandardMaterial({color:0xb99751,metalness:.65,roughness:.35});
        const rim = new THREE.Mesh(new THREE.BoxGeometry(3.76,.13,1.9),new THREE.MeshStandardMaterial({color:0x53321e,roughness:.4}));
        rim.position.y=.94;
        const trim = new THREE.Mesh(new THREE.BoxGeometry(3.78,.025,1.92),brass);trim.position.y=.885;
        this.canvas.width=1880;this.canvas.height=950;
        this.root.add(rim,trim,this.surface(this.canvas,3.64,1.78,0,TOP,0));
        // Standard three-row / twelve-column single-zero betting layout.
        this.spots.push({x:-.68,z:.03,w:.18,d:.75,label:"0",bet:0});
        for(let col=0;col<12;col++) for(let row=0;row<3;row++) {
            const n=col*3+3-row;
            this.spots.push({x:-.48+col*.19,z:-.22+row*.25,w:.19,d:.25,label:String(n),bet:n});
        }
        (["low","even","red","black","odd","high"] as const).forEach((bet,i)=>this.spots.push({x:-.385+i*.38,z:.54,w:.38,d:.22,label:labels[bet],bet}));
        ROULETTE_STAKES.forEach((stake,i)=>this.spots.push({x:-.52+i*.45,z:-.65,w:.4,d:.22,label:`${stake} mk`,stake}));
        this.spots.push({x:1.22,z:-.65,w:.68,d:.22,label:"SPIN",spin:true});
        const bowl = new THREE.Mesh(new THREE.CylinderGeometry(.51,.47,.075,64),brass);
        bowl.position.set(-1.27,TOP+.04,.05); this.root.add(bowl);
        const wc=document.createElement("canvas");wc.width=1024;wc.height=1024;
        const c=wc.getContext("2d")!;c.fillStyle="#543020";c.fillRect(0,0,1024,1024);
        WHEEL_ORDER.forEach((n,i)=>{
            const a=(i-.5)*TAU/37-Math.PI/2,b=(i+.5)*TAU/37-Math.PI/2;
            c.beginPath();c.moveTo(512,512);c.arc(512,512,506,a,b);c.closePath();
            c.fillStyle=n===0?"#166a45":rouletteColor(n)==="red"?"#b62435":"#172125";c.fill();
            c.strokeStyle="#d8ba75";c.lineWidth=2;c.stroke();
            const t=i*TAU/37; c.save();c.translate(512+Math.sin(t)*427,512-Math.cos(t)*427);c.rotate(t);
            c.fillStyle="#fff5d7";c.font="bold 34px Georgia";c.textAlign="center";c.textBaseline="middle";c.fillText(String(n),0,0);c.restore();
        });
        c.beginPath();c.arc(512,512,310,0,TAU);c.fillStyle="#694022";c.fill();c.strokeStyle="#e4c781";c.lineWidth=14;c.stroke();
        const disc=this.surface(wc,.96,.96,0,0,0);
        disc.geometry.dispose();disc.geometry=new THREE.CircleGeometry(.48,96);this.wheel.add(disc);
        // Physical separators in the numbered pockets rotate with the wheel.
        for(let i=0;i<37;i++) {
            const a=(i+.5)*TAU/37;
            const divider=new THREE.Mesh(new THREE.BoxGeometry(.006,.018,.13),brass);
            divider.position.set(Math.sin(a)*.407,.012,-Math.cos(a)*.407);divider.rotation.y=-a;this.wheel.add(divider);
        }
        const hub=new THREE.Mesh(new THREE.CylinderGeometry(.06,.13,.1,32),brass);hub.position.y=.05;this.wheel.add(hub);
        this.wheel.position.set(-1.27,TOP+.085,.05);
        this.ball.position.set(-1.27,TOP+.12,-.35);
        this.root.add(this.wheel,this.ball,this.chip);
        this.refresh();
    }

    private accessible(): boolean {
        const p=this.player.getGroundPosition();
        if(Math.abs(p.y)>.5||Math.hypot(p.x-ROULETTE_POSITION.x,p.z-ROULETTE_POSITION.z)>3.5)return false;
        const camera=this.camera();
        const toward=ROULETTE_POSITION.clone().add(new THREE.Vector3(0,TOP,0)).sub(camera.getWorldPosition(new THREE.Vector3())).normalize();
        return camera.getWorldDirection(new THREE.Vector3()).dot(toward)>.55;
    }
    private aimedSpot(): Spot | null {
        const camera=this.camera();camera.getWorldPosition(this.ray.origin);camera.getWorldDirection(this.ray.direction);
        if(!this.ray.intersectPlane(this.plane,this.hit))return null;
        this.hit.sub(ROULETTE_POSITION);
        return this.spots.find(s=>Math.abs(this.hit.x-s.x)<=s.w/2&&Math.abs(this.hit.z-s.z)<=s.d/2)??null;
    }
    private prompt(): string {
        if(this.round.pending)return "Roulette · No more bets";
        const s=this.aimedSpot();
        return s?.spin?`Spin roulette · ${this.stake} mk on ${betLabel(this.selected)}`
            :s?.stake?`Roulette · Stake ${s.stake} mk`
            :s?.bet!==undefined?`Roulette · Bet on ${betLabel(s.bet)}`:"Roulette · Aim at felt to bet, then SPIN";
    }
    private interact(): boolean {
        if(this.disposed||!this.accessible()||!this.player.getControlsEnabled()||!getGameStateManager().isState(GameState.PLAYING))return false;
        if(this.round.pending)return false;
        const s=this.aimedSpot();
        if(s?.spin)this.startSpin();
        else if(s?.stake){this.stake=s.stake;this.sound("coin");}
        else if(s?.bet!==undefined){this.selected=s.bet;this.sound("coin");}
        else this.hud.showToast("Croupier: Aim at a number or outside bet, choose your stake, then SPIN. First completed round earns 100 trip points.",{duration:5000});
        this.refresh();return true;
    }
    private startSpin(): void {
        const outcome=this.round.start(this.selected,this.stake);
        if(outcome==="started") {
            this.sound("coin");
            this.wheelStart=this.wheel.rotation.y;
            const target=WHEEL_ORDER.indexOf(this.round.pending!.number)*TAU/37;
            this.wheelEnd=this.wheelStart+TAU*6+((target-this.wheelStart)%TAU+TAU)%TAU;
            this.message="NO MORE BETS";
            if(this.dealer?.isRenderingSkinnedMesh()) {
                this.dealer.getBodyPartObject("rightHand")?.getWorldPosition(this.restingHand);
                this.handTarget.position.copy(this.restingHand);
                this.dealer.setSkinnedArmGrip("right",this.handTarget,new THREE.Vector3(),new THREE.Euler());
                this.reaching=true;
            }
            this.hud.showToast(`Croupier: No more bets · ${this.stake} mk on ${betLabel(this.selected)}`,{duration:2500});
        } else if(outcome==="funds") {
            this.message="INSUFFICIENT FUNDS";
            this.hud.showToast(`Croupier: You need ${this.stake} mk available.`,{duration:3500});
        }
    }
    update(dt: number): void {
        if(!getGameStateManager().isState(GameState.PLAYING))return;
        const result=this.round.update(Math.max(0,Math.min(dt,.1)));
        if(this.round.pending||result) {
            const t=result?1:Math.min(1,this.round.pending!.elapsed/ROULETTE_SPIN_SECONDS);
            this.wheel.rotation.y=this.wheelStart+(this.wheelEnd-this.wheelStart)*(1-Math.pow(1-t,3));
            // Counter-rotating ball falls into the winning pocket for the final turn.
            const capture=THREE.MathUtils.smoothstep(t,.68,.94);
            const winning=this.round.pending?.number??result!.number;
            const pocket=WHEEL_ORDER.indexOf(winning)*TAU/37-this.wheel.rotation.y;
            const orbit=-TAU*5*(1-Math.pow(1-t,2));
            const wrapped=pocket+Math.round((orbit-pocket)/TAU)*TAU;
            const angle=orbit+(wrapped-orbit)*capture;
            const radius=.465-(.465-.40)*capture;
            this.ball.position.set(-1.27+Math.sin(angle)*radius,TOP+.15-.035*capture,.05-Math.cos(angle)*radius);
            if(t<.25) {
                const reach=Math.sin(t/.25*Math.PI);
                if(this.reaching)this.handTarget.position.lerpVectors(this.restingHand,ROULETTE_POSITION.clone().add(new THREE.Vector3(-1.15,TOP+.22,.45)),reach);
                this.pose?.setWeight(reach);
                this.pose?.setHandTarget("right",ROULETTE_POSITION.clone().add(new THREE.Vector3(-1.15,TOP+.22,.45)));
            } else {
                this.pose?.setWeight(0);
                if(this.reaching){this.dealer?.clearSkinnedArmGrip("right");this.reaching=false;}
            }
        }
        if(result) {
            this.stopRollSound();this.sound("stop");
            if(result.returned)this.sound("win");
            this.onRoundComplete();
            this.message=`${result.number} ${rouletteColor(result.number).toUpperCase()} · ${result.returned?`RETURN ${result.returned} mk`:`LOST ${result.stake} mk`}`;
            this.hud.showToast(`Croupier: ${this.message}`,{duration:5000});this.refresh();
        }
        this.updateRollSound();
        const hovered=this.accessible()?this.aimedSpot():null;
        if(hovered!==this.hovered){this.hovered=hovered;this.refresh();}
    }
    private sound(name: 'coin' | 'stop' | 'win'): void {
        const ids = {coin:'755afca7-ac46-4f40-84c5-929b1d2a9d2a',stop:'4487bbbe-e8f6-4bbd-a80d-30e5aacd2180',win:'cc3c8c36-121e-43ec-80d2-81e1a20da844'};
        const volume = this.soundVolume();
        if (volume > 0) this.engine.playSound(ids[name], {volume: volume * .7});
    }
    private soundVolume(): number {
        return .65 * Math.max(0, 1 - this.player.getGroundPosition().distanceTo(ROULETTE_POSITION)/12) ** 2;
    }
    private async loadRollSound(): Promise<void> {
        const context=this.engine.getAudioContext?.();
        const url=getAssetUrlById(this.engine.getGameData?.() ?? null,'13ce90e5-ea60-48ff-bbc6-bd79e4b48459');
        if(!context || !url) throw new Error('Roulette roll audio is missing');
        try {
            const response=await fetch(url,{signal:this.audioAbort.signal});
            if(!response.ok)throw new Error(`Roulette sound download failed: ${response.status}`);
            const buffer=await context.decodeAudioData(await response.arrayBuffer());
            if(!this.disposed)this.audioBuffer=buffer;
        } catch(error) { if(!this.disposed)throw error; }
    }
    private updateRollSound(): void {
        const pending=this.round.pending,context=this.engine.getAudioContext?.(),destination=this.engine.getAudioDestination?.();
        if(!pending || !context || !destination || !this.audioBuffer)return;
        if(!this.audioSource) {
            const source=context.createBufferSource(),gain=context.createGain();
            source.buffer=this.audioBuffer;
            // Match the generated recording to gameplay time, including resume offsets.
            source.playbackRate.value=this.audioBuffer.duration/ROULETTE_SPIN_SECONDS;
            gain.gain.value=this.soundVolume();
            source.connect(gain);gain.connect(destination);
            source.start(0,pending.elapsed/ROULETTE_SPIN_SECONDS*this.audioBuffer.duration);
            this.audioSource=source;this.audioGain=gain;
        }
        this.audioGain!.gain.setTargetAtTime(this.soundVolume(),context.currentTime,.08);
    }
    private stopRollSound(): void {
        this.audioSource?.stop();this.audioSource?.disconnect();this.audioGain?.disconnect();
        this.audioSource=null;this.audioGain=null;
    }
    private refresh(): void {
        const c=this.canvas.getContext("2d")!;
        const x=(v:number)=>(v/3.64+.5)*1880,z=(v:number)=>(v/1.78+.5)*950;
        c.fillStyle="#07523d";c.fillRect(0,0,1880,950);
        c.textAlign="center";c.textBaseline="middle";
        const text=(label:string,px:number,pz:number)=>{c.save();c.translate(x(px),z(pz));c.rotate(Math.PI);c.fillText(label,0,0);c.restore();};
        for(const s of this.spots) {
            const left=x(s.x-s.w/2),top=z(s.z-s.d/2),w=s.w/3.64*1880,h=s.d/1.78*950;
            c.fillStyle=typeof s.bet==="number"?({red:"#a62132",black:"#142523",green:"#096442"}[rouletteColor(s.bet)])
                :s.bet==="red"?"#a62132":s.bet==="black"?"#142523":s.spin?"#c6a254":"#07523d";
            c.fillRect(left,top,w,h);c.strokeStyle=s===this.hovered?"#ffffff":"#d7cda5";c.lineWidth=s===this.hovered?6:2;c.strokeRect(left,top,w,h);
            c.fillStyle=s.spin?"#172c28":"#fff4cf";c.font=`bold ${typeof s.bet==="number"?43:28}px Georgia`;text(s.label,s.x,s.z);
            if(s.stake===this.stake){c.strokeStyle="#f0cb6e";c.lineWidth=5;c.strokeRect(left+7,top+7,w-14,h-14);}
        }
        c.fillStyle="#f2d88b";c.font="bold 25px Georgia";text(this.message,-.05,.78);
        c.font="20px Georgia";text("STARLIGHT",-1.27,-.66);
        c.font="17px Georgia";text("35:1 NUMBER · 1:1 OUTSIDE",.55,-.43);
        this.texture.needsUpdate=true;
        const selected=this.spots.find(s=>s.bet===this.selected)!;
        this.chip.position.set(selected.x,TOP+.033,selected.z);
    }
    private releaseModel(): void {
        this.root.removeFromParent();
        const resources=new Set<THREE.BufferGeometry|THREE.Material|THREE.Texture>();
        this.root.traverse(o=>{if(o instanceof THREE.Mesh){resources.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){resources.add(m);for(const v of Object.values(m))if(v instanceof THREE.Texture)resources.add(v);}}});
        for(const resource of resources)resource.dispose();this.root.clear();
    }
    dispose(): void {
        this.disposed=true;this.audioAbort.abort();this.stopRollSound();
        getGameStateManager().removeListener(this.onState);
        this.audioBuffer=null;this.round.cancel();this.pose?.release();this.pose=null;
        this.dealer?.clearSkinnedArmGrip("right");this.handTarget.removeFromParent();
        this.engine.getNpcRegistry?.()?.unregisterController(DEALER_ID);this.dealer=null;
        this.interaction?.dispose();this.interaction=null;
        if(this.body)this.engine.physicsWorld?.removeRigidBody(this.body.rigidBody);
        this.body=null;this.releaseModel();
    }
}
