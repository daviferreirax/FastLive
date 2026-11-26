// FastLive no navegador: transmitir ou assistir uma tela via LiveKit.
const { Room, RoomEvent, Track, VideoPreset, AudioPresets, ConnectionQuality, VideoQuality } = LivekitClient;

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
  document.title = 'FastLive';
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

// O SDK LiveKit usado aqui ainda não repassa windowAudio para getDisplayMedia.
// Injeta a opção só durante a chamada de captura; Chrome recente pode então
// oferecer o áudio do aplicativo selecionado, em vez da mixagem inteira do sistema.
async function createScreenTracksWithWindowAudio(participant, options) {
  const mediaDevices = navigator.mediaDevices;
  const original = mediaDevices.getDisplayMedia;
  const wrapped = function (constraints) {
    if (mediaDevices.getDisplayMedia === wrapped) mediaDevices.getDisplayMedia = original;
    return original.call(mediaDevices, { ...constraints, windowAudio: options.audio ? 'window' : 'exclude' });
  };
  mediaDevices.getDisplayMedia = wrapped;
  try {
    return await participant.createScreenTracks(options);
  } finally {
    if (mediaDevices.getDisplayMedia === wrapped) mediaDevices.getDisplayMedia = original;
  }
}

// Captura a tela e publica na sala. beforePublish roda entre a escolha da tela e a publicação
// (quem assiste pede permissão ao servidor nessa hora). Devolve a faixa de vídeo.
function buildCaptureConfig(quality, audio) {
  const q = QUALITIES[quality] || QUALITIES['1080'];
  return {
    q,
    captureOptions: {
      ...SCREEN_CAPTURE,
      resolution: q.resolution,
      audio: audio && { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    },
  };
}

async function publishCapturedTracks(room, tracks, q, audio) {
  const lp = room.localParticipant;
  try {
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
  activeLocalVideo = video || null;
  showLocalScreen(room, video);
  return video;
}

async function publishScreen(room, { quality = '1080', audio = false, beforePublish } = {}) {
  const { q, captureOptions } = buildCaptureConfig(quality, audio);
  const tracks = await createScreenTracksWithWindowAudio(room.localParticipant, captureOptions);
  if (beforePublish) {
    try {
      await beforePublish();
    } catch (err) {
      tracks.forEach(t => t.stop());
      throw err;
    }
  }
  return publishCapturedTracks(room, tracks, q, audio);
}

// Captura a nova tela antes de remover a atual: se o usuário cancelar o seletor,
// a transmissão anterior continua no ar sem interromper a sala.
async function replaceScreen(room, { quality = '1080', audio = false } = {}) {
  const { q, captureOptions } = buildCaptureConfig(quality, audio);
  const tracks = await createScreenTracksWithWindowAudio(room.localParticipant, captureOptions);
  const newVideo = tracks.find(t => t.kind === Track.Kind.Video);
  activeLocalVideo = newVideo || null;
  await unpublishScreen(room);
  return publishCapturedTracks(room, tracks, q, audio);
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
const CONTROLS_HIDE_MS = 3000;
const WATCH_QUALITY_DIMS = {
  '1080': { width: 1920, height: 1080 },
  '720': { width: 1280, height: 720 },
  '360': { width: 640, height: 360 },
};
let controlsHideTimer = null;
let qualityPollTimer = null;
let qualityReqSeq = 0;
let controlsPointerDown = false;
let lastPointerPos = null;
let lastPointerType = 'mouse';
let watchQuality = 'auto';
let statsOpen = false;
let activeLocalVideo = null;
let switchBusy = false;
let currentShareOpts = { quality: '1080', audio: false };
let shareDialogResolve = null;
const lastUnpublishedAt = new Map();

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
  const onVideoMetrics = () => { if (isControlsVisible() || statsOpen) updateStreamQuality(); };
  video.addEventListener('resize', onVideoMetrics);
  video.addEventListener('loadedmetadata', onVideoMetrics);
  const label = document.createElement('span');
  label.className = 'tile-name';
  const audioControls = document.createElement('div');
  audioControls.className = 'tile-audio';
  audioControls.hidden = true;
  for (const ev of ['click', 'dblclick', 'pointerdown']) {
    audioControls.addEventListener(ev, e => e.stopPropagation());
  }
  const muteBtn = document.createElement('button');
  muteBtn.type = 'button';
  muteBtn.textContent = '🔊';
  const volInput = document.createElement('input');
  volInput.type = 'range';
  volInput.min = '0';
  volInput.max = '1';
  volInput.step = '0.05';
  volInput.value = '1';
  volInput.setAttribute('aria-label', 'Volume desta tela');
  const soloBtn = document.createElement('button');
  soloBtn.type = 'button';
  soloBtn.textContent = '🎧';
  soloBtn.setAttribute('aria-pressed', 'false');
  audioControls.append(muteBtn, volInput, soloBtn);
  el.append(video, label, audioControls);
  $('tiles').append(el);
  tile = {
    identity: participant.identity,
    participant,
    el,
    video,
    label,
    audio: new Audio(),
    isLocal: participant.isLocal,
    hasVideo: false,
    videoAt: 0,
    lastStats: null,
    muted: false,
    volume: 1,
    audioControls,
    muteBtn,
    volInput,
    soloBtn,
  };
  muteBtn.addEventListener('click', () => {
    tile.muted = !tile.muted;
    if (!tile.muted && tile.volume === 0) {
      tile.volume = 1;
      volInput.value = '1';
    }
    render();
  });
  volInput.addEventListener('input', () => {
    tile.volume = Number(volInput.value);
    tile.muted = tile.volume === 0;
    render();
  });
  soloBtn.addEventListener('click', () => {
    const others = [...tiles.values()].filter(t => t !== tile && t.hasVideo && !t.isLocal && hasAudio(t.participant));
    const alreadySolo = !tile.muted && others.length > 0 && others.every(o => o.muted);
    if (alreadySolo) {
      for (const t of tiles.values()) {
        if (!t.isLocal) t.muted = false;
      }
    } else {
      tile.muted = false;
      if (tile.volume === 0) {
        tile.volume = 1;
        volInput.value = '1';
      }
      for (const o of others) o.muted = true;
    }
    render();
  });
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
  if ($('share-dialog').open) $('share-dialog').close();
  setStatsOpen(false);
  hideControls();
  clearTimeout(toastTimer);
  $('toast').hidden = true;
  $('quality-box').hidden = true;
  $('stream-quality').textContent = '';
  $('stream-stats').replaceChildren();
  watchQuality = 'auto';
  $('watch-quality').value = 'auto';
  $('watch-quality').hidden = true;
  activeLocalVideo = null;
  switchBusy = false;
  lastUnpublishedAt.clear();
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
  tile.lastStats = null;
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

  const masterMuted = $('mute').dataset.muted === '1';
  const masterVolume = Number($('volume').value);
  const remoteAudioTiles = list.filter(t => !t.isLocal && hasAudio(t.participant));
  for (const t of tiles.values()) {
    const visible = t.hasVideo && (grid || t.identity === focus);
    t.el.hidden = !visible;
    t.label.textContent = t.isLocal ? 'Você' : (t.participant.name || 'Alguém');
    // Na grade respeita mudo/volume individual; em destaque toca só a tela focada.
    if (grid) {
      t.audio.muted = masterMuted || t.muted;
      t.audio.volume = masterVolume * t.volume;
    } else {
      t.audio.muted = masterMuted || t.identity !== focus;
      t.audio.volume = masterVolume;
    }
    const showTileAudio = !t.isLocal && hasAudio(t.participant);
    t.audioControls.hidden = !showTileAudio;
    t.muteBtn.textContent = t.muted || t.volume === 0 ? '🔇' : '🔊';
    t.muteBtn.title = t.muted ? 'Ativar som desta tela' : 'Silenciar esta tela';
    t.volInput.value = String(t.volume);
    const isSolo = remoteAudioTiles.length > 1 && !t.muted && remoteAudioTiles.every(o => o === t || o.muted);
    t.soloBtn.hidden = remoteAudioTiles.length <= 1;
    t.soloBtn.setAttribute('aria-pressed', String(isSolo));
    t.soloBtn.title = isSolo ? 'Ouvir todas as telas' : 'Ouvir só esta tela';
  }

  const tabs = list.length > 1 ? [{ id: null, text: '▦ Grade' }, ...list.map(t => ({ id: t.identity, text: t.isLocal ? 'Você' : (t.participant.name || 'Alguém') }))] : [];
  $('tabs').hidden = !tabs.length;
  $('stage').classList.toggle('has-tabs', tabs.length > 0);
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

  const hasRemoteVideo = list.some(t => !t.isLocal);
  $('watch-quality').hidden = !(shown ? !shown.isLocal : hasRemoteVideo);

  const canSwitch = canCapture && (live?.role === 'host' || (live?.role === 'viewer' && sharing));
  $('switch-screen').hidden = !canSwitch;
  $('switch-screen').disabled = switchBusy || shareBusy;
  $('host-switch').disabled = switchBusy;

  if (live?.role === 'viewer') {
    const full = !sharing && screensOnAir() >= live.session.maxScreens;
    $('share').textContent = sharing ? '⏹ Parar minha tela' : '🖥️ Transmitir minha tela';
    $('share').classList.toggle('danger', sharing);
    $('share').disabled = full || shareBusy || switchBusy;
    $('share').title = full ? `Já tem ${live.session.maxScreens} telas no ar` : '';
  }
  if (live?.role === 'host') updateViewers();
  if (!activeVideoTile()) {
    if (statsOpen) setStatsOpen(false);
    $('quality-box').hidden = true;
    $('stream-quality').textContent = '';
    $('stream-stats').replaceChildren();
  } else if (isControlsVisible() || statsOpen) {
    updateStreamQuality();
  }
}

function applyWatchQualityToPub(pub) {
  if (!pub || pub.isLocal || pub.kind !== Track.Kind.Video) return;
  if (watchQuality === 'auto') {
    pub.setVideoQuality(VideoQuality.HIGH);
  } else {
    const dims = WATCH_QUALITY_DIMS[watchQuality];
    if (dims) pub.setVideoDimensions(dims);
  }
}

function applyWatchQualityAll() {
  if (!live) return;
  for (const p of live.room.remoteParticipants.values()) {
    applyWatchQualityToPub(p.getTrackPublication(Track.Source.ScreenShare));
  }
}

let toastTimer = null;
function toast(text, duration = 6000) {
  $('toast').textContent = text;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, duration);
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
        tile.lastStats = null;
        applyWatchQualityToPub(pub);
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
    .on(RoomEvent.TrackPublished, (pub, p) => {
      if (p && !p.isLocal && pub?.source === Track.Source.ScreenShare) {
        const name = p.name || 'Alguém';
        const switched = Date.now() - (lastUnpublishedAt.get(p.identity) || 0) < 5000;
        lastUnpublishedAt.delete(p.identity);
        toast(switched ? `${name} trocou a tela.` : `${name} começou a transmitir.`, 3500);
      }
      render();
    })
    .on(RoomEvent.TrackUnpublished, (pub, p) => {
      if (p && !p.isLocal && pub?.source === Track.Source.ScreenShare) {
        lastUnpublishedAt.set(p.identity, Date.now());
      }
      render();
    })
    .on(RoomEvent.LocalTrackUnpublished, render)
    .on(RoomEvent.ParticipantConnected, p => {
      if (p && !p.isLocal) toast(`${p.name || 'Alguém'} entrou na sala.`, 3500);
      render();
    })
    .on(RoomEvent.ParticipantDisconnected, p => {
      lastUnpublishedAt.delete(p.identity);
      removeTile(p.identity);
      if (!p.isLocal && p.identity !== 'host') toast(`${p.name || 'Alguém'} saiu da sala.`, 3500);
    })
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

function watchLocalVideoEnded(video) {
  if (!video) return;
  video.on('ended', () => {
    if (video !== activeLocalVideo) return;
    if (live?.role === 'host') stopStream();
    else if (sharing) stopSharing();
  });
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
  const opts = { quality: $('quality-select').value, audio: $('audio').checked };
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
    currentShareOpts = opts;
    video = await publishScreen(room, opts);
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
  watchLocalVideoEnded(video);
  // Avisa quando o navegador não entregou o áudio (janela ou caixa desmarcada).
  $('host-audio').hidden = !opts.audio || hasAudio(room.localParticipant);

  // Sala única: anfitrião e convidados usam a raiz do domínio.
  $('share-link').value = location.origin;
  $('viewer-max').textContent = session.maxViewers;
  room
    .on(RoomEvent.Reconnecting, () => { $('host-status').textContent = 'Conexão instável, reconectando…'; })
    .on(RoomEvent.Reconnected, () => { $('host-status').textContent = ''; });

  history.replaceState(null, '', '/');
  document.title = '🔴 Ao vivo · FastLive';
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
  try { localStorage.setItem('fastlive-name', $('name').value); } catch {}

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
  document.title = 'Assistindo · FastLive';
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

function closeShareDialog(result = null) {
  const dlg = $('share-dialog');
  const resolve = shareDialogResolve;
  shareDialogResolve = null;
  if (dlg.open) dlg.close();
  if (resolve) resolve(result);
}

function openShareDialog({ title, submitText, quality = '1080', audio = false }) {
  if (shareDialogResolve) closeShareDialog(null);
  $('share-dialog-title').textContent = title;
  $('share-dialog-submit').textContent = submitText;
  $('dialog-quality').value = QUALITIES[quality] ? quality : '1080';
  $('dialog-audio').checked = Boolean(audio);
  showControls({ persist: true });
  return new Promise(resolve => {
    shareDialogResolve = resolve;
    $('share-dialog').showModal();
  });
}

async function startSharing(opts = { quality: '1080', audio: false }) {
  const { room, code, session } = live;
  const cred = { room: code, identity: session.identity, key: session.key };
  let video;
  try {
    currentShareOpts = opts;
    video = await publishScreen(room, {
      ...opts,
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
  watchLocalVideoEnded(video);
  if (opts.audio && !hasAudio(room.localParticipant)) {
    toast('Sua tela está sem áudio. Para mandar o som, troque para uma aba ou tela inteira marcando "Compartilhar áudio".');
  }
  render();
}

async function stopSharing() {
  if (!live || !sharing) return;
  const { room, code, session } = live;
  sharing = false;
  activeLocalVideo = null;
  await unpublishScreen(room);
  await api('/api/unshare', { room: code, identity: session.identity, key: session.key }).catch(() => {});
  render();
}

async function switchCurrentScreen() {
  if (!live || switchBusy || shareBusy) return;
  if (live.role === 'viewer' && !sharing) return;
  const opts = await openShareDialog({
    title: 'Trocar tela',
    submitText: 'Escolher tela',
    quality: currentShareOpts.quality,
    audio: currentShareOpts.audio,
  });
  if (!opts) return;
  switchBusy = true;
  render();
  try {
    const newVideo = await replaceScreen(live.room, opts);
    currentShareOpts = opts;
    watchLocalVideoEnded(newVideo);
    if (live.role === 'host') {
      $('host-audio').hidden = !opts.audio || hasAudio(live.room.localParticipant);
    } else if (opts.audio && !hasAudio(live.room.localParticipant)) {
      toast('Sua tela está sem áudio. Para mandar o som, troque para uma aba ou tela inteira marcando "Compartilhar áudio".');
    }
  } catch (err) {
    if (err.name === 'NotAllowedError') {
      toast('Troca cancelada. A tela anterior continua no ar.', 3500);
    } else {
      console.error(err);
      toast('Não foi possível trocar a tela.');
    }
  } finally {
    switchBusy = false;
    render();
  }
}

$('share').addEventListener('click', async () => {
  if (live?.role !== 'viewer' || shareBusy || switchBusy) return;
  if (sharing) {
    shareBusy = true;
    render();
    try {
      await stopSharing();
    } finally {
      shareBusy = false;
      render();
    }
    return;
  }
  const opts = await openShareDialog({
    title: 'Transmitir minha tela',
    submitText: 'Transmitir',
    quality: '1080',
    audio: false,
  });
  if (!opts) return;
  shareBusy = true;
  render();
  try {
    await startSharing(opts);
  } finally {
    shareBusy = false;
    render();
  }
});

$('switch-screen').addEventListener('click', () => switchCurrentScreen());
$('host-switch').addEventListener('click', () => switchCurrentScreen());

for (const ev of ['click', 'dblclick', 'pointerdown']) {
  $('share-dialog').addEventListener(ev, e => e.stopPropagation());
}
$('share-dialog-form').addEventListener('submit', e => {
  e.preventDefault();
  closeShareDialog({
    quality: $('dialog-quality').value,
    audio: $('dialog-audio').checked,
  });
});
$('share-dialog-cancel').addEventListener('click', () => closeShareDialog(null));
$('share-dialog').addEventListener('close', () => {
  if (shareDialogResolve) {
    const resolve = shareDialogResolve;
    shareDialogResolve = null;
    resolve(null);
  }
  if (isControlsVisible()) scheduleHideControls();
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
  $('mute').textContent = $('mute').dataset.muted === '1' || volume === 0 ? '🔇' : '🔊';
  render();
}
function isControlsVisible() {
  return $('stage').classList.contains('show-controls');
}

function activeVideoTile() {
  if (!live || focus === null) return null;
  const tile = tiles.get(focus);
  return tile?.hasVideo ? tile : null;
}

function formatBitrate(bps) {
  if (!Number.isFinite(bps) || bps <= 0) return '';
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(1).replace('.', ',')} Mbps`;
  return `${Math.round(bps / 1000)} kbps`;
}

async function readTileStreamQuality(tile) {
  let width = tile.video.videoWidth || 0;
  let height = tile.video.videoHeight || 0;
  let fps = 0;
  let bitrate = 0;
  let codec = '';
  let lossPct = null;
  let jitter = null;
  let rtt = null;

  const track = tile.participant.getTrackPublication(Track.Source.ScreenShare)?.track;
  if (track && typeof track.getRTCStatsReport === 'function') {
    const report = await track.getRTCStatsReport().catch(() => null);
    if (report) {
      const codecs = new Map();
      let candidateRtt = null;
      for (const s of report.values()) {
        if (s.type === 'codec') codecs.set(s.id, s);
        else if (s.type === 'candidate-pair' && s.state === 'succeeded' && (s.nominated || s.selected) && Number.isFinite(s.currentRoundTripTime) && s.currentRoundTripTime > 0) {
          candidateRtt = s.currentRoundTripTime;
        }
      }

      if (!tile.isLocal) {
        let inbound = null;
        for (const s of report.values()) {
          if (s.type === 'inbound-rtp' && (s.kind === 'video' || s.mediaType === 'video')) {
            inbound = s;
            break;
          }
        }
        if (inbound) {
          if (!width || !height) {
            width = inbound.frameWidth || width;
            height = inbound.frameHeight || height;
          }
          if (Number.isFinite(inbound.framesPerSecond) && inbound.framesPerSecond > 0) {
            fps = inbound.framesPerSecond;
          }
          const prev = tile.lastStats;
          if (prev && Number.isFinite(inbound.timestamp) && inbound.timestamp > prev.timestamp) {
            const dt = (inbound.timestamp - prev.timestamp) / 1000;
            if (!(fps > 0) && Number.isFinite(inbound.framesDecoded) && Number.isFinite(prev.framesDecoded) && inbound.framesDecoded >= prev.framesDecoded) {
              fps = (inbound.framesDecoded - prev.framesDecoded) / dt;
            }
            if (Number.isFinite(inbound.bytesReceived) && Number.isFinite(prev.bytes) && inbound.bytesReceived >= prev.bytes) {
              bitrate = ((inbound.bytesReceived - prev.bytes) * 8) / dt;
            }
            if (
              Number.isFinite(inbound.packetsReceived) && Number.isFinite(prev.packetsReceived) && inbound.packetsReceived >= prev.packetsReceived &&
              Number.isFinite(inbound.packetsLost) && Number.isFinite(prev.packetsLost) && inbound.packetsLost >= prev.packetsLost
            ) {
              const dRecv = inbound.packetsReceived - prev.packetsReceived;
              const dLost = inbound.packetsLost - prev.packetsLost;
              if (dRecv + dLost > 0) lossPct = (dLost / (dRecv + dLost)) * 100;
            }
          }
          if (lossPct === null && Number.isFinite(inbound.packetsReceived) && Number.isFinite(inbound.packetsLost) && inbound.packetsReceived + inbound.packetsLost > 0) {
            lossPct = Math.max(0, (inbound.packetsLost / (inbound.packetsReceived + inbound.packetsLost)) * 100);
          }
          if (Number.isFinite(inbound.jitter) && inbound.jitter >= 0) jitter = inbound.jitter;
          if (inbound.codecId && codecs.get(inbound.codecId)?.mimeType) {
            codec = codecs.get(inbound.codecId).mimeType.replace(/^video\//i, '').toUpperCase();
          }
          if (Number.isFinite(inbound.timestamp)) {
            tile.lastStats = {
              framesDecoded: inbound.framesDecoded,
              bytes: inbound.bytesReceived,
              packetsReceived: inbound.packetsReceived,
              packetsLost: inbound.packetsLost,
              timestamp: inbound.timestamp,
            };
          }
        }
      } else {
        let best = null;
        for (const s of report.values()) {
          if (s.type !== 'outbound-rtp' || (s.kind !== 'video' && s.mediaType !== 'video') || s.active === false) continue;
          const h = s.frameHeight || 0;
          const bestH = best?.frameHeight || 0;
          const hasFps = Number.isFinite(s.framesPerSecond) && s.framesPerSecond > 0;
          const bestHasFps = best && Number.isFinite(best.framesPerSecond) && best.framesPerSecond > 0;
          if (!best || h > bestH || (h === bestH && hasFps && !bestHasFps)) best = s;
        }
        if (best) {
          if (!width || !height) {
            width = best.frameWidth || width;
            height = best.frameHeight || height;
          }
          if (Number.isFinite(best.framesPerSecond) && best.framesPerSecond > 0) {
            fps = best.framesPerSecond;
          }
          const prev = tile.lastStats;
          if (prev && Number.isFinite(best.timestamp) && best.timestamp > prev.timestamp) {
            const dt = (best.timestamp - prev.timestamp) / 1000;
            if (!(fps > 0) && Number.isFinite(best.framesSent) && Number.isFinite(prev.framesSent) && best.framesSent >= prev.framesSent) {
              fps = (best.framesSent - prev.framesSent) / dt;
            }
            if (Number.isFinite(best.bytesSent) && Number.isFinite(prev.bytes) && best.bytesSent >= prev.bytes) {
              bitrate = ((best.bytesSent - prev.bytes) * 8) / dt;
            }
          }
          if (best.codecId && codecs.get(best.codecId)?.mimeType) {
            codec = codecs.get(best.codecId).mimeType.replace(/^video\//i, '').toUpperCase();
          }
          const remote = best.remoteId && report.get(best.remoteId);
          if (remote && Number.isFinite(remote.roundTripTime) && remote.roundTripTime > 0) {
            rtt = remote.roundTripTime;
          }
          if (Number.isFinite(best.timestamp)) {
            tile.lastStats = {
              framesSent: best.framesSent,
              bytes: best.bytesSent,
              timestamp: best.timestamp,
            };
          }
        }
      }
      if (rtt === null && candidateRtt !== null) rtt = candidateRtt;
    }
    if (!(bitrate > 0) && Number.isFinite(track.currentBitrate) && track.currentBitrate > 0) {
      bitrate = track.currentBitrate;
    }
    if (!(fps > 0)) {
      const settingsFps = track.mediaStreamTrack?.getSettings?.()?.frameRate;
      if (Number.isFinite(settingsFps) && settingsFps > 0) fps = settingsFps;
    }
  }

  const res = width > 0 && height > 0 ? Math.min(width, height) : 0;
  if (!res) return { label: '', details: [] };
  const label = fps >= 1 ? `${res}p · ${Math.round(fps)} fps` : `${res}p`;
  const details = [
    ['Resolução', `${width}×${height}`],
    ['Quadros', fps >= 1 ? `${Math.round(fps)} fps` : '—'],
  ];
  const bitrateText = formatBitrate(bitrate);
  if (bitrateText) details.push(['Bitrate', bitrateText]);
  if (codec) details.push(['Codec', codec]);
  if (!tile.isLocal && lossPct !== null) {
    details.push(['Perda', lossPct === 0 ? '0%' : `${lossPct.toFixed(1).replace('.', ',')}%`]);
  }
  if (!tile.isLocal && Number.isFinite(jitter) && jitter >= 0) {
    details.push(['Jitter', `${Math.round(jitter * 1000)} ms`]);
  }
  if (Number.isFinite(rtt) && rtt > 0) {
    details.push(['Latência', `${Math.round(rtt * 1000)} ms`]);
  }
  return { label, details };
}

function renderStreamStats(details) {
  const nodes = [];
  for (const [key, val] of details) {
    const dt = document.createElement('dt');
    dt.textContent = key;
    const dd = document.createElement('dd');
    dd.textContent = val;
    nodes.push(dt, dd);
  }
  $('stream-stats').replaceChildren(...nodes);
}

function setStatsOpen(open) {
  statsOpen = Boolean(open);
  $('quality-box').classList.toggle('stats-open', statsOpen);
  $('stream-quality').setAttribute('aria-expanded', String(statsOpen));
  $('stream-stats').hidden = !statsOpen;
  if (statsOpen) {
    updateStreamQuality();
    startQualityPolling();
  } else if (!isControlsVisible()) {
    stopQualityPolling();
  }
}

async function updateStreamQuality() {
  const seq = ++qualityReqSeq;
  const tile = activeVideoTile();
  if (!tile) {
    $('quality-box').hidden = true;
    $('stream-quality').textContent = '';
    $('stream-stats').replaceChildren();
    return;
  }
  if (!isControlsVisible() && !statsOpen) return;
  const { label, details } = await readTileStreamQuality(tile);
  if (seq !== qualityReqSeq || (!isControlsVisible() && !statsOpen) || activeVideoTile() !== tile) return;
  $('stream-quality').textContent = label;
  $('quality-box').hidden = !label;
  if (statsOpen) {
    renderStreamStats(details);
    $('stream-stats').hidden = !details.length;
  }
}

function stopQualityPolling() {
  if (qualityPollTimer) clearInterval(qualityPollTimer);
  qualityPollTimer = null;
}

function startQualityPolling() {
  if (qualityPollTimer) return;
  qualityPollTimer = setInterval(updateStreamQuality, 1000);
}

function scheduleHideControls() {
  clearTimeout(controlsHideTimer);
  controlsHideTimer = null;
  if (!controlsPointerDown) {
    controlsHideTimer = setTimeout(hideControls, CONTROLS_HIDE_MS);
  }
}

function showControls({ persist = false } = {}) {
  $('stage').classList.add('show-controls');
  updateStreamQuality();
  startQualityPolling();
  if (persist) {
    clearTimeout(controlsHideTimer);
    controlsHideTimer = null;
  } else {
    scheduleHideControls();
  }
}

function hideControls() {
  clearTimeout(controlsHideTimer);
  controlsHideTimer = null;
  if (!statsOpen) {
    stopQualityPolling();
    qualityReqSeq++;
  }
  $('stage').classList.remove('show-controls');
}

const stageEl = $('stage');
const controlsEl = stageEl.querySelector('.controls');

for (const ev of ['click', 'dblclick', 'pointerdown']) {
  $('quality-box').addEventListener(ev, e => e.stopPropagation());
}
$('stream-quality').addEventListener('click', () => setStatsOpen(!statsOpen));

$('watch-quality').addEventListener('focus', () => showControls({ persist: true }));
$('watch-quality').addEventListener('blur', () => {
  if (isControlsVisible()) scheduleHideControls();
});
$('watch-quality').addEventListener('change', () => {
  watchQuality = $('watch-quality').value;
  applyWatchQualityAll();
  $('watch-quality').blur();
  showControls();
});

stageEl.addEventListener('pointermove', e => {
  if (e.pointerType === 'touch') return;
  if (lastPointerPos && e.clientX === lastPointerPos.x && e.clientY === lastPointerPos.y) return;
  lastPointerPos = { x: e.clientX, y: e.clientY };
  showControls();
});

stageEl.addEventListener('pointerleave', e => {
  if (e.pointerType === 'touch') return;
  lastPointerPos = null;
  if (!controlsPointerDown) hideControls();
});

controlsEl.addEventListener('pointerdown', () => {
  controlsPointerDown = true;
  showControls({ persist: true });
});

window.addEventListener('pointerup', () => {
  if (!controlsPointerDown) return;
  controlsPointerDown = false;
  if (isControlsVisible()) scheduleHideControls();
});

window.addEventListener('pointercancel', () => {
  if (!controlsPointerDown) return;
  controlsPointerDown = false;
  if (isControlsVisible()) scheduleHideControls();
});

document.addEventListener('fullscreenchange', () => {
  lastPointerPos = null;
  if (isControlsVisible()) scheduleHideControls();
});

document.addEventListener('keydown', e => {
  if ($('view-live').hidden || e.ctrlKey || e.metaKey || e.altKey || $('share-dialog').open) return;
  const tag = e.target?.tagName;
  const isTextField = (tag === 'INPUT' && !['range', 'checkbox', 'radio', 'button'].includes(e.target.type)) ||
    tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable;
  if (e.key === 'Escape') {
    if (statsOpen && !document.fullscreenElement) setStatsOpen(false);
    return;
  }
  if (isTextField) return;
  const key = e.key.toLowerCase();
  if (key === 'f') {
    e.preventDefault();
    $('fullscreen').click();
  } else if (key === 'm') {
    e.preventDefault();
    $('mute').click();
    showControls();
  } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    if (tag === 'INPUT' && e.target.type === 'range') return;
    e.preventDefault();
    const delta = e.key === 'ArrowUp' ? 0.05 : -0.05;
    const next = Math.min(1, Math.max(0, Math.round((Number($('volume').value) + delta) * 20) / 20));
    $('volume').value = String(next);
    if (next > 0) $('mute').dataset.muted = '0';
    applyVolume();
    showControls();
  } else if (key === 'g') {
    const list = [...tiles.values()].filter(t => t.hasVideo);
    if (list.length > 1) {
      e.preventDefault();
      setFocus(null);
      showControls();
    }
  } else if (/^[1-9]$/.test(e.key)) {
    const list = [...tiles.values()].filter(t => t.hasVideo);
    const target = list[Number(e.key) - 1];
    if (list.length > 1 && target) {
      e.preventDefault();
      setFocus(target.identity);
      showControls();
    }
  } else if (key === 'i') {
    if (activeVideoTile()) {
      e.preventDefault();
      setStatsOpen(!statsOpen);
    }
  }
});

$('volume').addEventListener('input', () => {
  $('mute').dataset.muted = '0';
  applyVolume();
  showControls({ persist: controlsPointerDown });
});
$('mute').addEventListener('click', () => { $('mute').dataset.muted = $('mute').dataset.muted === '1' ? '0' : '1'; applyVolume(); });
$('fullscreen').addEventListener('click', () => {
  const stage = $('stage');
  const video = tiles.get(focus)?.video || [...tiles.values()].find(t => t.hasVideo)?.video;
  if (document.fullscreenElement) document.exitFullscreen();
  else if (stage.requestFullscreen) stage.requestFullscreen();
  else if (video?.webkitEnterFullscreen) video.webkitEnterFullscreen(); // iPhone
});
$('tiles').addEventListener('dblclick', () => $('fullscreen').click());
$('tiles').addEventListener('pointerdown', e => {
  lastPointerType = e.pointerType || 'mouse';
});
// Na grade, clicar numa tela coloca ela em destaque. No celular, tocar no vídeo alterna os controles.
$('tiles').addEventListener('click', e => {
  const tile = e.target.closest('.tile');
  if (!tile) return;
  if ($('stage').classList.contains('grid')) setFocus(tile.dataset.id);
  else if (lastPointerType === 'touch' && isControlsVisible()) hideControls();
  else showControls();
});

// ---------- Início ----------

function prepareHostHome() {
  if (!window.isSecureContext) {
    $('start-error').textContent = 'Para compartilhar a tela, abra o FastLive pelo endereço com https:// (o seu domínio).';
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
    $('name').value = localStorage.getItem('fastlive-name') || '';
  } catch {}
  $('join-title').textContent = 'Conectando ao FastLive';
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
