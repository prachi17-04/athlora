// Netlify Function that runs the ATHLORA API at /api/*. Data is stored in Netlify Blobs.
import { getStore } from '@netlify/blobs';
import handlerModule from '../../server/netlify-handler.js';

const handler = handlerModule.createNetlifyHandler(() => getStore({ name: 'athlora', consistency: 'strong' }));

export default async (req) => handler(req);

export const config = { path: '/api/*' };
