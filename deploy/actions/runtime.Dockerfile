FROM nginx:stable-alpine
COPY container-nginx.conf /etc/nginx/conf.d/default.conf
COPY client/ /usr/share/nginx/html/
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=6 CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
