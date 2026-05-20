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

function normalizeData(value) {
  const data = value && typeof value === 'object' ? value : {};

  return {
    adminContent: normalizeAdminContent(data.adminContent || data.content),
    registeredTeams: cleanTeamList(data.registeredTeams || DEFAULT_REGISTERED_TEAMS),
    updatedAt: data.updatedAt || new Date().toISOString()
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
    registeredTeams: DEFAULT_REGISTERED_TEAMS
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
    return jsonResponse(await readData());
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