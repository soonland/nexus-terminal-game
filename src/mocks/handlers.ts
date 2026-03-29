import { http, HttpResponse } from 'msw';

export const handlers = [
  http.post('/api/world-ai', () => {
    return HttpResponse.json({ unlockedNodeIds: [] });
  }),

  http.post('/api/file', () => {
    return HttpResponse.json({ content: '[MOCK FILE CONTENT]' });
  }),

  http.post('/api/node-description', () => {
    return HttpResponse.json({ description: '[MOCK NODE DESCRIPTION]' });
  }),

  http.post('/api/aria', () => {
    return HttpResponse.json({ message: '[MOCK ARIA RESPONSE]' });
  }),
];
