// Source for the ATHLORA API function. `npm run build` bundles this (with express,
// serverless-http, etc.) into netlify/dist/api-bundle.mjs so the deployed function
// has no external packages to resolve.
import { getStore } from '@netlify/blobs';
import handlerModule from '../../server/netlify-handler.js';

export default handlerModule.createNetlifyHandler(() => getStore({ name: 'athlora', consistency: 'strong' }));
