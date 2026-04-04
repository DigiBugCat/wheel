const MIME_TYPES = {
	'.html': 'text/html',
	'.js': 'application/javascript',
	'.wasm': 'application/wasm',
	'.pck': 'application/octet-stream',
	'.png': 'image/png',
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
			return new Response('Not Found', { status: 404 });
		}

		const ext = '.' + key.split('.').pop();
		const contentType = MIME_TYPES[ext] || 'application/octet-stream';

		const headers = new Headers();
		headers.set('Content-Type', contentType);
		headers.set('Cache-Control', 'public, max-age=3600');
		headers.set('Cross-Origin-Opener-Policy', 'same-origin');
		headers.set('Cross-Origin-Embedder-Policy', 'require-corp');

		return new Response(object.body, { headers });
	},
};
