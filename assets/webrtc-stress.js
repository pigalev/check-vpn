import { runWebRtcTest } from './webrtc-test.js';

export async function runWebRtcStress({
  destinations = [],
  timeoutMs,
  sessionsPerDestination = 1,
  runSession = runWebRtcTest,
  now = () => Date.now(),
  trigger = 'stress'
} = {}) {
  const jobs = [];
  let sessionSequence = 0;
  for (const destination of destinations) {
    for (let i = 0; i < sessionsPerDestination; i += 1) {
      sessionSequence += 1;
      jobs.push({ destination, sessionId: `webrtc-${sessionSequence}` });
    }
  }

  const settled = await Promise.all(jobs.map(async ({ destination, sessionId }) => {
    const timestampMs = now();
    try {
      const result = await runSession({ stunUrls: destination.urls, timeoutMs });
      return { destination, sessionId, timestampMs, result };
    } catch (error) {
      return { destination, sessionId, timestampMs, result: { status: 'error', candidates: [], error: error?.message ?? 'WebRTC stress session failed.' } };
    }
  }));

  const sessions = settled.map(({ destination, sessionId, timestampMs, result }) => ({
    sessionId,
    serverId: destination.id,
    serverGroup: destination.group ?? destination.id,
    serverLabel: destination.label ?? destination.id,
    timestampMs,
    trigger,
    status: result?.status ?? 'error',
    error: result?.error ?? null,
    candidateCount: result?.candidates?.length ?? 0
  }));

  const candidates = [];
  for (const { destination, sessionId, timestampMs, result } of settled) {
    for (const candidate of result?.candidates ?? []) {
      candidates.push({
        ...candidate,
        sessionId,
        serverId: destination.id,
        serverGroup: destination.group ?? destination.id,
        serverLabel: destination.label ?? destination.id,
        timestampMs,
        trigger
      });
    }
  }

  const destinationHealth = {};
  for (const destination of destinations) {
    const own = sessions.filter((session) => session.serverId === destination.id);
    const complete = own.filter((session) => session.status === 'complete').length;
    const errors = own.filter((session) => session.status === 'error').length;
    destinationHealth[destination.id] = {
      id: destination.id,
      group: destination.group ?? destination.id,
      label: destination.label ?? destination.id,
      attempted: own.length,
      complete,
      status: complete === own.length && own.length ? 'complete' : complete ? 'partial' : errors ? 'error' : 'unavailable'
    };
  }

  const completed = sessions.filter((session) => session.status === 'complete').length;
  const status = sessions.length === 0 ? 'unavailable' : completed === sessions.length ? 'complete' : completed > 0 ? 'partial' : 'error';
  const operatorGroups = [...new Set(destinations.map((destination) => destination.group ?? destination.id))];
  return {
    status,
    sessions,
    candidates,
    destinationHealth,
    operatorGroups,
    transports: {
      udp: candidates.some((candidate) => candidate.protocol === 'udp'),
      tcp: candidates.some((candidate) => candidate.protocol === 'tcp')
    }
  };
}
