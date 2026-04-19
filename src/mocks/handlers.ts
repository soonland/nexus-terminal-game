import { http, HttpResponse } from 'msw';

export const handlers = [
  http.post('/api/world', () => {
    return HttpResponse.json({
      narrative: '[MOCK WORLD RESPONSE]',
      traceChange: 0,
      accessGranted: false,
      newAccessLevel: null,
      flagsSet: {},
      nodesUnlocked: [],
      isUnknown: false,
    });
  }),

  http.post('/api/file', () => {
    return HttpResponse.json({ content: '[MOCK FILE CONTENT]' });
  }),

  http.post('/api/node-description', () => {
    return HttpResponse.json({ description: '[MOCK NODE DESCRIPTION]' });
  }),

  http.post('/api/aria', () => {
    return HttpResponse.json({ reply: '[ARIA: signal received]', trustDelta: 2 });
  }),

  http.post('/api/camera-feed', () => {
    return HttpResponse.json({ description: '[MOCK CAMERA FEED]' });
  }),
];
