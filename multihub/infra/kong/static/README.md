Drop static files here (e.g. exported course thumbnails) — they're served
directly by Kong's embedded Nginx layer at http://localhost:8088/static/...,
completely bypassing Kong's Lua/plugin pipeline. See
infra/kong/nginx/custom.conf and the `nginx_http_include` directive in
infra/kong/kong.conf.
