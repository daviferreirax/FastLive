// PeekMe no navegador: transmitir ou assistir uma tela via LiveKit.
const { Room, RoomEvent, Track, VideoPreset, AudioPresets, ConnectionQuality } = LivekitClient;

const $ = id => document.getElementById(id);
const views = ['home', 'live', 'join', 'ended'];
function show(name) {
  for (const v of views) $(`view-${v}`).hidden = v !== name;
  $('live-badge').hidden = name !== 'live';
}
const isFirefox = /firefox/i.test(navigator.userAgent);
const canCapture = window.isSecureContext && !!navigator.mediaDevices?.getDisplayMedia;

// Por padrão o LiveKit fica no mesmo domínio do site (o Caddy encaminha /rtc).
function livekitUrl(url) {
  if (url) return url;
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;
}

// Servidores TURN extras (Cloudflare), quando o servidor fornece.
function connectOptions(session) {
  return session.iceServers?.length ? { rtcConfig: { iceServers: session.iceServers } } : {};
}

async function api(path, body) {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Algo deu errado.'), { status: res.status });
  return data;
}

function ended(title, text) {
  resetStage();
  $('ended-title').textContent = title;
  $('ended-text').textContent = text;
  show('ended');
  document.title = 'PeekMe';
}

// ---------- Transmitir ----------

// Qualidades que quem transmite pode escolher. O upload de quem hospeda o servidor é o limite:
// com 5 espectadores, 720p usa ~15 Mbps e 1080p ~25 Mbps.
// As camadas menores servem quem tem internet fraca.
const QUALITIES = {
  '720': {
    resolution: { width: 1280, height: 720, frameRate: 60 },
    encoding: { maxBitrate: 3_000_000, maxFramerate: 60 },
    layers: [new VideoPreset(640, 360, 600_000, 30)],
  },
  '1080': {
    resolution: { width: 1920, height: 1080, frameRate: 60 },
    encoding: { maxBitrate: 5_000_000, maxFramerate: 60 },
    layers: [new VideoPreset(640, 360, 600_000, 30), new VideoPreset(1280, 720, 2_500_000, 60)],
  },
};
const SCREEN_CAPTURE = {
  contentHint: 'motion',
  selfBrowserSurface: 'exclude',
  surfaceSwitching: 'include',
  systemAudio: 'include',
};
const SCREEN_PUBLISH = {
  videoCodec: 'vp8',
  simulcast: true,
  degradationPreference: 'maintain-framerate',
  audioPreset: AudioPresets.musicHighQualityStereo,
  dtx: false,
  red: true,
  forceStereo: true,
};

const MIC_CAPTURE = { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 2 };
const MIC_PUBLISH = { audioPreset: AudioPresets.musicHighQualityStereo, dtx: false, red: true, forceStereo: true };

// Captura a tela e publica na sala. beforePublish roda entre a escolha da tela e a publicação
// (quem assiste pede permissão ao servidor nessa hora). Devolve a faixa de vídeo.
async function publishScreen(room, { quality = '720', audio = true, beforePublish } = {}) {
  const q = QUALITIES[quality] || QUALITIES['720'];
  const lp = room.localParticipant;
  const tracks = await lp.createScreenTracks({
    ...SCREEN_CAPTURE,
    resolution: q.resolution,
    audio: audio && { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  try {
    if (beforePublish) await beforePublish();
    for (const track of tracks) {
      await lp.publishTrack(track, { ...SCREEN_PUBLISH, screenShareEncoding: q.encoding, screenShareSimulcastLayers: q.layers });
    }
  } catch (err) {
    tracks.forEach(t => t.stop());
    throw err;
  }
  // O Firefox não manda o som junto com a tela: usa uma entrada de áudio (no Linux,
  // "Monitor of …" envia o som do computador). Nos outros navegadores isso pegaria o
  // microfone, então ali só avisamos que a tela está sem áudio.
  if (audio && isFirefox && !tracks.some(t => t.kind === Track.Kind.Audio)) {
    try {
      await lp.setMicrophoneEnabled(true, MIC_CAPTURE, MIC_PUBLISH);
    } catch (err) {
      console.error('Sem entrada de áudio:', err);
    }
  }
  const video = tracks.find(t => t.kind === Track.Kind.Video);
  showLocalScreen(room, video);
  return video;
}

async function unpublishScreen(room) {
  const lp = room.localParticipant;
  for (const source of [Track.Source.ScreenShare, Track.Source.ScreenShareAudio, Track.Source.Microphone]) {
    const pub = lp.getTrackPublication(source);
    if (pub?.track) await lp.unpublishTrack(pub.track, true).catch(() => {});
  }
  const tile = tiles.get(lp.identity);
  if (tile) { tile.hasVideo = false; tile.video.srcObject = null; }
  render();
}

function hasAudio(participant) {
  return !!(participant.getTrackPublication(Track.Source.ScreenShareAudio) || participant.getTrackPublication(Track.Source.Microphone));
}

// ---------- Telas na sala ----------
// Cada pessoa transmitindo vira um quadro. Com uma tela só, ela ocupa tudo; com várias,
// dá para ver em grade ou escolher uma pelas abas. Quadros escondidos não recebem vídeo
// (adaptiveStream), e na grade cada um recebe uma versão menor: isso poupa o upload do servidor.

let live = null;          // { room, role: 'host' | 'viewer', code, session }
let hostSession = null;   // reserva do primeiro visitante, válida antes e durante a transmissão
let hostHeartbeatTimer = null;
let pendingViewerSession = null;
const tiles = new Map();  // identity -> { identity, participant, el, video, label, audio, isLocal, hasVideo, videoAt }
let focus = null;         // identity da tela em destaque; null = grade
let picked = false;       // a pessoa escolheu a visualização (senão, escolhemos sozinhos)
let statusText = 'Conectando…';
let sharing = false;      // quem assiste está transmitindo a própria tela
let shareBusy = false;    // pedido de transmitir/parar em andamento

function tileFor(participant) {
  let tile = tiles.get(participant.identity);
  if (tile) return tile;
  const el = document.createElement('div');
  el.className = 'tile';
  el.dataset.id = participant.identity;
  const video = document.createElement('video');
  video.autoplay = true;
  video.playsInline = true;
  video.muted = true; // o som vai pelo elemento de áudio
  const label = document.createElement('span');
  label.className = 'tile-name';
  el.append(video, label);
  $('tiles').append(el);
  tile = { identity: participant.identity, participant, el, video, label, audio: new Audio(), isLocal: participant.isLocal, hasVideo: false, videoAt: 0 };
  tiles.set(participant.identity, tile);
  return tile;
}

function removeTile(identity) {
  const tile = tiles.get(identity);
  if (!tile) return;
  tile.el.remove();
  tile.audio.srcObject = null;
  tiles.delete(identity);
  render();
}

function resetStage() {
  for (const id of [...tiles.keys()]) removeTile(id);
  focus = null;
  picked = false;
  sharing = false;
  statusText = 'Conectando…';
}

function showLocalScreen(room, video) {
  if (!video) return;
  const tile = tileFor(room.localParticipant);
  tile.video.srcObject = new MediaStream([video.mediaStreamTrack]);
  tile.hasVideo = true;
  render();
}

function setFocus(identity) {
  focus = identity;
  picked = true;
  render();
}

function setStatus(text) {
  statusText = text;
  render();
}

function screensOnAir() {
  if (!live) return 0;
  return [live.room.localParticipant, ...live.room.remoteParticipants.values()]
    .filter(p => p.getTrackPublication(Track.Source.ScreenShare)).length;
}

function render() {
  const list = [...tiles.values()].filter(t => t.hasVideo);
  if (focus && !list.some(t => t.identity === focus)) { focus = null; picked = false; }
  // Sem escolha da pessoa: uma tela fica em destaque, várias ficam em grade.
  if (!picked) focus = list.length === 1 ? list[0].identity : null;
  const grid = focus === null;
  $('stage').classList.toggle('grid', grid && list.length > 1);
  // Com uma tela em destaque, ela ocupa a coluna toda.
  $('tiles').style.setProperty('--cols', grid ? Math.ceil(Math.sqrt(list.length)) || 1 : 1);

  const muted = $('mute').dataset.muted === '1';
  for (const t of tiles.values()) {
    const visible = t.hasVideo && (grid || t.identity === focus);
    t.el.hidden = !visible;
    t.label.textContent = t.isLocal ? 'Você' : (t.participant.name || 'Alguém');
    // Na grade toca o som de todos; com uma tela em destaque, só o dela.
    t.audio.muted = muted || !(grid || t.identity === focus);
  }

  const tabs = list.length > 1 ? [{ id: null, text: '▦ Grade' }, ...list.map(t => ({ id: t.identity, text: t.isLocal ? 'Você' : (t.participant.name || 'Alguém') }))] : [];
  $('tabs').hidden = !tabs.length;
  $('tabs').replaceChildren(...tabs.map(({ id, text }) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.setAttribute('aria-pressed', String(id === focus));
    b.addEventListener('click', e => { e.stopPropagation(); setFocus(id); });
    return b;
  }));

  $('waiting').textContent = statusText || 'Aguardando a tela…';
  $('waiting').hidden = !statusText && list.length > 0;

  // Aviso de tela sem áudio (dá um tempo para o som chegar depois do vídeo).
  const shown = !grid && tiles.get(focus);
  $('no-audio').hidden = !(shown && !shown.isLocal && Date.now() - shown.videoAt > 2500 && !hasAudio(shown.participant));

  if (live?.role === 'viewer') {
    const full = !sharing && screensOnAir() >= live.session.maxScreens;
    $('share').textContent = sharing ? '⏹ Parar minha tela' : '🖥️ Transmitir minha tela';
    $('share').classList.toggle('danger', sharing);
    $('share').disabled = full || shareBusy;
    $('share').title = full ? `Já tem ${live.session.maxScreens} telas no ar` : '';
  }
  if (live?.role === 'host') updateViewers();
}

let toastTimer = null;
function toast(text) {
  $('toast').textContent = text;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 6000);
}

// Eventos da sala iguais para quem criou e para quem assiste.
function wireRoom(room) {
  room
    .on(RoomEvent.TrackSubscribed, (track, pub, participant) => {
      const tile = tileFor(participant);
      if (track.kind === Track.Kind.Video) {
        track.attach(tile.video);
        tile.hasVideo = true;
        tile.videoAt = Date.now();
        setTimeout(render, 3000);
      } else if (track.kind === Track.Kind.Audio) {
        track.attach(tile.audio);
        applyVolume();
        // Alguns navegadores bloqueiam o som até um novo clique.
        tile.audio.play().catch(() => { $('unmute').hidden = false; });
      }
      render();
    })
    .on(RoomEvent.TrackUnsubscribed, (track, pub, participant) => {
      track.detach();
      const tile = tiles.get(participant.identity);
      if (tile && track.kind === Track.Kind.Video) tile.hasVideo = false;
      render();
    })
    .on(RoomEvent.TrackPublished, render)
    .on(RoomEvent.TrackUnpublished, render)
    .on(RoomEvent.LocalTrackUnpublished, render)
    .on(RoomEvent.ParticipantConnected, render)
    .on(RoomEvent.ParticipantDisconnected, p => removeTile(p.identity))
    .on(RoomEvent.AudioPlaybackStatusChanged, () => { $('unmute').hidden = room.canPlaybackAudio; })
    .on(RoomEvent.ConnectionQualityChanged, (quality, participant) => {
      if (!participant.isLocal) return;
      $('quality').textContent = quality === ConnectionQuality.Poor ? 'Conexão fraca' : '';
    })
    .on(RoomEvent.Reconnecting, () => setStatus('Reconectando…'))
    .on(RoomEvent.Reconnected, () => setStatus(''));
}

// ---------- Entrada automática e anfitrião ----------

function stopHostHeartbeat() {
  if (hostHeartbeatTimer) clearInterval(hostHeartbeatTimer);
  hostHeartbeatTimer = null;
}

function startHostHeartbeat(session) {
  stopHostHeartbeat();
  hostHeartbeatTimer = setInterval(async () => {
    try {
      await api('/api/heartbeat', { room: session.room, hostSecret: session.hostSecret });
    } catch (err) {
      if (err.status !== 403 || hostSession?.hostSecret !== session.hostSecret) return;
      stopHostHeartbeat();
      hostSession = null;
      if (live?.role === 'host') {
        const room = live.room;
        live = null;
        await room.disconnect().catch(() => {});
        ended('Reserva encerrada', 'Abra o link novamente para entrar na sala.');
      } else {
        $('start-error').textContent = 'Sua reserva expirou. Atualize a página para entrar novamente.';
        $('start-form').querySelector('button').disabled = true;
      }
    }
  }, 20_000);
}

async function startStream() {
  const btn = $('start-form').querySelector('button');
  $('start-error').textContent = '';
  btn.disabled = true;
  const session = hostSession;
  if (!session) {
    btn.disabled = false;
    $('start-error').textContent = 'Sua reserva não está mais ativa. Atualize a página para entrar novamente.';
    return;
  }

  const room = new Room({ adaptiveStream: true, dynacast: true });
  live = { room, role: 'host', code: session.room, session };
  wireRoom(room);
  let video;
  try {
    await room.connect(livekitUrl(session.url), session.token, connectOptions(session));
    room.on(RoomEvent.Disconnected, () => {
      if (live?.room !== room) return;
      live = null;
      hostSession = null;
      stopHostHeartbeat();
      api('/api/stop', { room: session.room, hostSecret: session.hostSecret }).catch(() => {});
      ended('Transmissão encerrada', 'A conexão com o servidor caiu.');
    });
    video = await publishScreen(room, { quality: $('quality-select').value, audio: $('audio').checked });
  } catch (err) {
    console.error(err);
    live = null;
    await room.disconnect().catch(() => {});
    resetStage();
    show('home');
    btn.disabled = false;
    $('start-error').textContent = err.name === 'NotAllowedError'
      ? 'Você cancelou a escolha da tela.'
      : 'Não foi possível iniciar a transmissão. Veja se o navegador permite compartilhar a tela.';
    return;
  }
  btn.disabled = false;

  // O usuário clicou em "Parar de compartilhar" na barra do navegador.
  video.on('ended', () => stopStream());
  // Avisa quando o navegador não entregou o áudio (janela ou caixa desmarcada).
  $('host-audio').hidden = !$('audio').checked || hasAudio(room.localParticipant);

  $('share-link').value = `${location.origin}/assistir/${session.watchCode || session.room}`;
  $('viewer-max').textContent = session.maxViewers;
  room
    .on(RoomEvent.Reconnecting, () => { $('host-status').textContent = 'Conexão instável, reconectando…'; })
    .on(RoomEvent.Reconnected, () => { $('host-status').textContent = ''; });

  history.replaceState(null, '', '/');
  document.title = '🔴 Ao vivo · PeekMe';
  $('view-live').classList.remove('watch');
  $('host-panel').hidden = false;
  $('share').hidden = true;
  statusText = '';
  show('live');
  render();
}

function updateViewers() {
  if (live?.role !== 'host') return;
  const viewers = [...live.room.remoteParticipants.values()];
  $('viewer-count').textContent = viewers.length;
  $('viewer-list').replaceChildren(...viewers.map(p => {
    const li = document.createElement('li');
    li.textContent = (p.name || 'Alguém') + (p.getTrackPublication(Track.Source.ScreenShare) ? ' · transmitindo' : '');
    return li;
  }));
}

async function stopStream(silent = false) {
  if (live?.role !== 'host') return;
  const { room, code, session } = live;
  live = null;
  hostSession = null;
  stopHostHeartbeat();
  await api('/api/stop', { room: code, hostSecret: session.hostSecret }).catch(() => {});
  await room.disconnect();
  if (silent) resetStage();
  else ended('Transmissão encerrada', 'Você parou de compartilhar a tela.');
}

$('start-form').addEventListener('submit', e => { e.preventDefault(); startStream(); });
$('stop').addEventListener('click', () => stopStream());
$('copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('share-link').value);
  } catch {
    $('share-link').select();
    document.execCommand('copy');
  }
  $('copy').textContent = 'Copiado!';
  setTimeout(() => { $('copy').textContent = 'Copiar'; }, 1500);
});
window.addEventListener('beforeunload', e => { if (hostSession || live?.role === 'host' || sharing) e.preventDefault(); });
window.addEventListener('pagehide', () => {
  if (hostSession) navigator.sendBeacon('/api/stop', new Blob([JSON.stringify({ room: hostSession.room, hostSecret: hostSession.hostSecret })], { type: 'application/json' }));
});

// ---------- Assistir ----------

async function watch(session) {
  const btn = $('join-form').querySelector('button');
  $('join-error').textContent = '';
  btn.disabled = true;
  try { localStorage.setItem('peekme-name', $('name').value); } catch {}

  const room = new Room({ adaptiveStream: true, dynacast: true });
  // /api/enter já resolve o apelido público e devolve o código interno real.
  // /api/share e /api/unshare precisam desse mesmo código.
  live = { room, role: 'viewer', code: session.room, session };
  wireRoom(room);
  room.on(RoomEvent.Disconnected, () => {
    if (live?.room !== room) return;
    live = null;
    ended('Transmissão encerrada', 'Quem criou a sala parou de transmitir.');
  });

  $('view-live').classList.add('watch');
  $('host-panel').hidden = true;
  // No celular o navegador não compartilha a tela, então o botão nem aparece.
  $('share').hidden = !(session.maxScreens > 1 && canCapture);
  show('live');
  render();
  try {
    await room.connect(livekitUrl(session.url), session.token, connectOptions(session));
    // O clique em "Assistir" libera o som no navegador.
    await room.startAudio();
  } catch (err) {
    console.error(err);
    live = null;
    ended('Não foi possível conectar', 'Verifique sua internet e abra o link de novo.');
    return;
  }
  btn.disabled = false;
  setStatus('');
  document.title = 'Assistindo · PeekMe';
}

// Espera o servidor liberar a publicação (chega pela conexão com o LiveKit).
function waitForPermission(room) {
  return new Promise((resolve, reject) => {
    const check = () => {
      if (!room.localParticipant.permissions?.canPublish) return;
      clearTimeout(timer);
      room.off(RoomEvent.ParticipantPermissionsChanged, check);
      resolve();
    };
    const timer = setTimeout(() => {
      room.off(RoomEvent.ParticipantPermissionsChanged, check);
      reject(new Error('O servidor demorou para liberar a transmissão. Tente de novo.'));
    }, 8000);
    room.on(RoomEvent.ParticipantPermissionsChanged, check);
    check();
  });
}

async function startSharing() {
  const { room, code, session } = live;
  const cred = { room: code, identity: session.identity, key: session.key };
  let video;
  try {
    video = await publishScreen(room, {
      beforePublish: async () => {
        await api('/api/share', cred);
        await waitForPermission(room);
      },
    });
  } catch (err) {
    console.error(err);
    api('/api/unshare', cred).catch(() => {});
    toast(err.name === 'NotAllowedError' ? 'Você cancelou a escolha da tela.' : err.message || 'Não foi possível transmitir a sua tela.');
    return;
  }
  sharing = true;
  video.on('ended', () => { if (sharing) stopSharing(); });
  if (!hasAudio(room.localParticipant)) {
    toast('Sua tela está sem áudio. Para mandar o som, pare e escolha uma aba ou a tela inteira marcando "Compartilhar áudio".');
  }
  render();
}

async function stopSharing() {
  if (!live || !sharing) return;
  const { room, code, session } = live;
  sharing = false;
  await unpublishScreen(room);
  await api('/api/unshare', { room: code, identity: session.identity, key: session.key }).catch(() => {});
  render();
}

$('share').addEventListener('click', async () => {
  if (live?.role !== 'viewer' || shareBusy) return;
  shareBusy = true;
  render();
  try {
    if (sharing) await stopSharing();
    else await startSharing();
  } finally {
    shareBusy = false;
    render();
  }
});

$('unmute').addEventListener('click', async () => {
  try {
    await live?.room.startAudio();
    await Promise.all([...tiles.values()].map(t => t.audio.srcObject && t.audio.play()));
    $('unmute').hidden = true;
  } catch (err) {
    console.error(err);
  }
});

function applyVolume() {
  const volume = Number($('volume').value);
  for (const t of tiles.values()) t.audio.volume = volume;
  $('mute').textContent = $('mute').dataset.muted === '1' || volume === 0 ? '🔇' : '🔊';
  render();
}
$('volume').addEventListener('input', () => { $('mute').dataset.muted = '0'; applyVolume(); });
$('mute').addEventListener('click', () => { $('mute').dataset.muted = $('mute').dataset.muted === '1' ? '0' : '1'; applyVolume(); });
$('fullscreen').addEventListener('click', () => {
  const stage = $('stage');
  const video = tiles.get(focus)?.video || [...tiles.values()].find(t => t.hasVideo)?.video;
  if (document.fullscreenElement) document.exitFullscreen();
  else if (stage.requestFullscreen) stage.requestFullscreen();
  else if (video?.webkitEnterFullscreen) video.webkitEnterFullscreen(); // iPhone
});
$('tiles').addEventListener('dblclick', () => $('fullscreen').click());
// Na grade, clicar numa tela coloca ela em destaque. No celular, tocar no vídeo mostra os controles.
$('tiles').addEventListener('click', e => {
  const tile = e.target.closest('.tile');
  if (!tile) return;
  if ($('stage').classList.contains('grid')) setFocus(tile.dataset.id);
  else $('stage').classList.toggle('show-controls');
});

// ---------- Início ----------

function prepareHostHome() {
  if (!window.isSecureContext) {
    $('start-error').textContent = 'Para compartilhar a tela, abra o PeekMe pelo endereço com https:// (o seu domínio).';
    $('start-form').querySelector('button').disabled = true;
  } else if (!navigator.mediaDevices?.getDisplayMedia) {
    $('start-error').textContent = 'Este navegador não consegue compartilhar a tela. Use Chrome, Edge ou Firefox no computador.';
    $('start-form').querySelector('button').disabled = true;
  }
  if (isFirefox) {
    if (!$('start-error').textContent) $('start-error').textContent = 'No Firefox, o som vai por uma entrada de áudio: quando ele pedir o microfone, escolha "Monitor of …" (Linux) para enviar o som do computador.';
  }
  show('home');
  if ($('start-form').querySelector('button').disabled && hostSession) {
    const session = hostSession;
    hostSession = null;
    stopHostHeartbeat();
    api('/api/stop', { room: session.room, hostSecret: session.hostSecret }).catch(() => {});
  }
}

$('join-form').addEventListener('submit', e => {
  e.preventDefault();
  if (pendingViewerSession) watch(pendingViewerSession);
});

async function enterUnifiedLink() {
  try {
    $('name').value = localStorage.getItem('peekme-name') || '';
  } catch {}
  $('join-title').textContent = 'Conectando ao PeekMe';
  $('join-description').textContent = 'Verificando se você será o anfitrião ou um convidado…';
  show('join');
  try {
    const session = await api('/api/enter', { name: $('name').value });
    if (session.role === 'host') {
      hostSession = session;
      startHostHeartbeat(session);
      prepareHostHome();
      return;
    }
    if (session.role !== 'viewer') throw new Error('O servidor não reconheceu o papel desta conexão.');
    pendingViewerSession = session;
    $('join-title').textContent = 'Entrar como convidado';
    $('join-description').textContent = session.hostLive
      ? 'Já existe alguém na sala. Entre para assistir e, se quiser, compartilhar sua tela.'
      : 'O anfitrião chegou primeiro e está se preparando. Você pode entrar e aguardar a transmissão.';
    $('join-form').querySelector('button').textContent = session.hostLive ? 'Assistir transmissão' : 'Entrar e aguardar';
  } catch (err) {
    ended('Não foi possível entrar', err.message || 'Atualize a página e tente novamente.');
  }
}

enterUnifiedLink();
