/** Small table-scoped WebRTC voice mesh. Signalling stays on the game socket. */
export class VoiceChat {
  private stream: MediaStream | null = null;
  private peers = new Map<string, RTCPeerConnection>();
  private audio = new Map<string, HTMLAudioElement>();
  private muted = false;

  constructor(private signal: (to: string, data: unknown) => void) {}

  get active(): boolean { return !!this.stream; }
  get isMuted(): boolean { return this.muted; }

  async start(): Promise<void> {
    if (this.stream) return;
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
  }

  toggleMute(): void {
    if (!this.stream) return;
    this.muted = !this.muted;
    for (const track of this.stream.getAudioTracks()) track.enabled = !this.muted;
  }

  sync(peerIds: string[], me: string): void {
    if (!this.stream) return;
    const wanted = new Set(peerIds.filter((id) => id !== me));
    for (const [id, pc] of this.peers) if (!wanted.has(id)) this.close(id, pc);
    for (const id of wanted) if (!this.peers.has(id) && me.localeCompare(id) < 0) void this.offer(id);
  }

  async receive(from: string, data: unknown): Promise<void> {
    const msg = data as { type?: string; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };
    if (!this.stream) return;
    const pc = this.get(from);
    if (msg.type === 'offer' && msg.sdp) {
      await pc.setRemoteDescription(msg.sdp);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.signal(from, { type: 'answer', sdp: pc.localDescription });
    } else if (msg.type === 'answer' && msg.sdp) {
      await pc.setRemoteDescription(msg.sdp);
    } else if (msg.type === 'ice' && msg.candidate) {
      await pc.addIceCandidate(msg.candidate);
    }
  }

  stop(): void {
    for (const [id, pc] of this.peers) this.close(id, pc);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.muted = false;
  }

  private async offer(id: string): Promise<void> {
    const pc = this.get(id);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.signal(id, { type: 'offer', sdp: pc.localDescription });
  }

  private get(id: string): RTCPeerConnection {
    let pc = this.peers.get(id);
    if (pc) return pc;
    pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    this.peers.set(id, pc);
    for (const track of this.stream?.getTracks() ?? []) pc.addTrack(track, this.stream!);
    pc.onicecandidate = (e) => { if (e.candidate) this.signal(id, { type: 'ice', candidate: e.candidate.toJSON() }); };
    pc.ontrack = (e) => {
      const player = document.createElement('audio');
      player.autoplay = true;
      player.srcObject = e.streams[0];
      document.body.appendChild(player);
      this.audio.set(id, player);
    };
    pc.onconnectionstatechange = () => { if (pc?.connectionState === 'failed' || pc?.connectionState === 'closed') this.close(id, pc!); };
    return pc;
  }

  private close(id: string, pc: RTCPeerConnection): void {
    pc.close(); this.peers.delete(id); this.audio.get(id)?.remove(); this.audio.delete(id);
  }
}
