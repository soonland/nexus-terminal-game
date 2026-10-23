// TEMPORARY: reports the Node version Vercel runs. Delete after checking a preview deploy.
export const GET = (): Response => Response.json({ node: process.version });
