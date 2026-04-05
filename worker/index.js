const MIME_TYPES = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'application/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.webp': 'image/webp',
	'.gif': 'image/gif',
	'.ico': 'image/x-icon',
	'.webm': 'video/webm',
	'.mp4': 'video/mp4',
	'.ogv': 'video/ogg',
	'.ogg': 'audio/ogg',
	'.mp3': 'audio/mpeg',
	'.wav': 'audio/wav',
	'.woff': 'font/woff',
	'.woff2': 'font/woff2',
};

export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		let key = url.pathname.slice(1);

		if (!key || key === '/') {
			key = 'index.html';
		}

		const object = await env.ASSETS.get(key);

		if (!object) {
			// SPA fallback: serve index.html for any unknown path without an extension
			if (!key.includes('.')) {
				const index = await env.ASSETS.get('index.html');
				if (index) {
					return new Response(index.body, {
						headers: {
							'Content-Type': 'text/html; charset=utf-8',
							'Cache-Control': 'no-cache',
						},
					});
				}
			}
			return new Response('Not Found', { status: 404 });
		}

		const ext = '.' + key.split('.').pop().toLowerCase();
		const contentType = MIME_TYPES[ext] || 'application/octet-stream';

		// Hashed asset files (in /assets/) can be cached aggressively; everything else briefly.
		const cacheControl = key.startsWith('assets/')
			? 'public, max-age=31536000, immutable'
			: 'public, max-age=300';

		const headers = new Headers();
		headers.set('Content-Type', contentType);
		headers.set('Cache-Control', cacheControl);

		return new Response(object.body, { headers });
	},
};
