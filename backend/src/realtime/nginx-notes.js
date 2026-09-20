/**
 * Nginx SSE notes for Update Me (development / future VPS).
 * Not applied automatically — no production Nginx config lives in this repo.
 *
 * Required proxy behaviour for GET /api/v1/realtime/events:
 *
 *   location /api/v1/realtime/ {
 *     proxy_pass http://127.0.0.1:5000;
 *     proxy_http_version 1.1;
 *     proxy_set_header Connection '';
 *     proxy_buffering off;
 *     proxy_cache off;
 *     chunked_transfer_encoding off;
 *     proxy_read_timeout 3600s;
 *   }
 *
 * The API also sends X-Accel-Buffering: no on SSE responses.
 */
export const NGINX_SSE_NOTES = true;
