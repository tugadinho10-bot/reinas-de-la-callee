import { getStore } from '@netlify/blobs';

const STORE_NAME = 'reinas-calle-site-data';
const DATA_KEY = 'site-data';

const DEFAULT_ADMIN_CONTENT = {
  seasonBadge: 'CODIGO ECLIPSE 2026',
  seasonText: 'Reinas de la Calle toma el concreto con energia fucsia. Formato 3vs3 en cancha urbana. Aqui no importa tu club, manda tu talento bajo el eclipse.',
  rulesTitle: 'Codigo Eclipse',
  rules: [
    'Partidos de 10 minutos o a 3 goles: lo que ocurra primero.',
    'El "Cano" (tunel) elimina a una rival por 1 minuto del partido.',
    'Sin portera fija: todas defienden, todas atacan.',
    'Faltas acumulativas: a la 3ra falta, penal desde media cancha.'
  ]
};

const DEFAULT_REGISTERED_TEAMS = ['LAS ECLIPSE FC', 'REINAS DEL ASFALTO', 'PINK CREW'];

const jsonHeaders = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type'
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function normalizeText(value, fallback = '', maxLength = 800) {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  return (text || fallback).slice(0, maxLength);
}

function normalizePhotoDataURL(value) {
  const photo = typeof value === 'string' ? value : '';
  if (!/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(photo)) return '';
  return photo.length <= 450000 ? photo : '';
}

function sameTeamName(a, b) {
  return normalizeText(a).toLowerCase() === normalizeText(b).toLowerCase();
}

function cleanTeamList(teams) {
  const clean = [];
  const source = Array.isArray(teams) ? teams : [];

  for (const teamName of source) {
    const team = normalizeText(teamName, '', 80);
    if (team && !clean.some((existingTeam) => sameTeamName(existingTeam, team))) {
      clean.push(team);
    }
  }

  return clean.slice(0, 200);
}

function normalizeRules(value) {
  const source = Array.isArray(value) ? value : String(value || '').split(/\r?\n/);
  const rules = source.map((rule) => normalizeText(rule, '', 220)).filter(Boolean);
  return rules.length ? rules.slice(0, 20) : DEFAULT_ADMIN_CONTENT.rules.slice();
}

function normalizeAdminContent(value) {
  const content = value && typeof value === 'object' ? value : {};

  return {
    seasonBadge: normalizeText(content.seasonBadge, DEFAULT_ADMIN_CONTENT.seasonBadge, 80),
    seasonText: normalizeText(content.seasonText, DEFAULT_ADMIN_CONTENT.seasonText, 900),
    rulesTitle: normalizeText(content.rulesTitle, DEFAULT_ADMIN_CONTENT.rulesTitle, 80),
    rules: normalizeRules(content.rules)
  };
}

function createRegistrationId(data) {
  const raw = [data.equipo, data.delegado, data.whatsapp, data.fechaRegistro].join('|');
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) - hash) + raw.charCodeAt(i);
    hash |= 0;
  }
  return 'reg-' + Math.abs(hash).toString(36);
}

function normalizeRegistrationPlayer(player, index) {
  const source = player && typeof player === 'object' ? player : {};
  return {
    numeroDeRegistro: Number(source.numeroDeRegistro) || index + 1,
    nombreCompleto: normalizeText(source.nombreCompleto, '', 120),
    numeroJugador: normalizeText(source.numeroJugador, '', 12),
    fotografia: normalizeText(source.fotografia, '', 120),
    fotografiaDataURL: normalizePhotoDataURL(source.fotografiaDataURL)
  };
}

function normalizeRegistration(value) {
  const source = value && typeof value === 'object' ? value : {};
  const players = Array.isArray(source.jugadores)
    ? source.jugadores.map((player, index) => normalizeRegistrationPlayer(player, index)).filter((player) => player.nombreCompleto && player.numeroJugador)
    : [];
  const registration = {
    id: normalizeText(source.id, '', 80),
    equipo: normalizeText(source.equipo, '', 80),
    delegado: normalizeText(source.delegado, '', 120),
    whatsapp: normalizeText(source.whatsapp, '', 32),
    fechaRegistro: normalizeText(source.fechaRegistro, '', 80),
    recibidoEn: normalizeText(source.recibidoEn || source.receivedAt, '', 80),
    jugadores: players.slice(0, 12)
  };

  if (!registration.fechaRegistro) registration.fechaRegistro = new Date().toISOString();
  if (!registration.recibidoEn) registration.recibidoEn = new Date().toISOString();
  if (!registration.id) registration.id = createRegistrationId(registration);
  return registration;
}

function cleanRegistrations(registrations) {
  const clean = [];
  const source = Array.isArray(registrations) ? registrations : [];

  for (const registration of source) {
    const normalized = normalizeRegistration(registration);
    if (normalized.equipo && !clean.some((item) => item.id === normalized.id)) {
      clean.push(normalized);
    }
  }

  return clean.slice(0, 100);
}

function normalizeData(value) {
  const data = value && typeof value === 'object' ? value : {};

  return {
    adminContent: normalizeAdminContent(data.adminContent || data.content),
    registeredTeams: cleanTeamList(data.registeredTeams || DEFAULT_REGISTERED_TEAMS),
    registrations: cleanRegistrations(data.registrations || []),
    updatedAt: data.updatedAt || new Date().toISOString()
  };
}

function publicData(data) {
  return {
    adminContent: data.adminContent,
    registeredTeams: data.registeredTeams,
    updatedAt: data.updatedAt
  };
}

function getStoreRef() {
  return getStore(STORE_NAME);
}

async function readData() {
  const store = getStoreRef();
  const stored = await store.get(DATA_KEY, { type: 'json', consistency: 'strong' });
  return normalizeData(stored || {
    adminContent: DEFAULT_ADMIN_CONTENT,
    registeredTeams: DEFAULT_REGISTERED_TEAMS,
    registrations: []
  });
}

async function writeData(data) {
  const normalized = normalizeData({
    ...data,
    updatedAt: new Date().toISOString()
  });

  const store = getStoreRef();
  await store.setJSON(DATA_KEY, normalized);
  return normalized;
}

function isAuthorized(payload) {
  const expectedUser = normalizeText(process.env.ADMIN_USER || 'TUGA').toUpperCase();
  const expectedPassword = String(process.env.ADMIN_PASSWORD || '2026').trim();
  const user = normalizeText(payload.adminUser).toUpperCase();
  const password = String(payload.adminPassword || '').trim();

  return user === expectedUser && password === expectedPassword;
}

export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('', { status: 204, headers: jsonHeaders });
  }

  if (req.method === 'GET') {
    return jsonResponse(publicData(await readData()));
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Metodo no permitido.' }, 405);
  }

  let payload;
  try {
    payload = await req.json();
  } catch (error) {
    return jsonResponse({ error: 'JSON invalido.' }, 400);
  }

  if (payload.action === 'registerTeam') {
    const team = normalizeText(payload.team, '', 80);
    if (!team) return jsonResponse({ error: 'Nombre de escuadra requerido.' }, 400);

    const current = await readData();
    if (!current.registeredTeams.some((existingTeam) => sameTeamName(existingTeam, team))) {
      current.registeredTeams.push(team);
    }

    return jsonResponse(publicData(await writeData(current)));
  }

  if (payload.action === 'submitRegistration') {
    const registration = normalizeRegistration(payload.registration);
    if (!registration.equipo || !registration.delegado || registration.jugadores.length < 1) {
      return jsonResponse({ error: 'Ficha de inscripcion incompleta.' }, 400);
    }

    const current = await readData();
    current.registrations = [registration].concat(current.registrations.filter((item) => item.id !== registration.id));
    if (!current.registeredTeams.some((existingTeam) => sameTeamName(existingTeam, registration.equipo))) {
      current.registeredTeams.push(registration.equipo);
    }

    return jsonResponse(publicData(await writeData(current)));
  }

  if (payload.action === 'getAdminData') {
    if (!isAuthorized(payload)) {
      return jsonResponse({ error: 'Administrador no autorizado.' }, 401);
    }

    return jsonResponse(await readData());
  }

  if (payload.action === 'deleteRegistration') {
    if (!isAuthorized(payload)) {
      return jsonResponse({ error: 'Administrador no autorizado.' }, 401);
    }

    const current = await readData();
    const id = normalizeText(payload.id, '', 80);
    current.registrations = current.registrations.filter((registration) => registration.id !== id);
    return jsonResponse(await writeData(current));
  }

  if (payload.action === 'replace') {
    if (!isAuthorized(payload)) {
      return jsonResponse({ error: 'Administrador no autorizado.' }, 401);
    }

    return jsonResponse(await writeData(payload.data));
  }

  return jsonResponse({ error: 'Accion no soportada.' }, 400);
};