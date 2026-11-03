// Local preparation only: no authentication simulation, bindings, routes or admin operations.
export default {
  fetch(): Response {
    return Response.json({ error: 'admin_backend_not_enabled' }, {
      status: 503,
      headers: {
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
      },
    });
  },
};
