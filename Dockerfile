FROM node:18-alpine

# Installation des dépendances pour WireGuard
RUN apk add --no-cache \
    wireguard-tools \
    iptables \
    ip6tables \
    iproute2 \
    bash \
    sudo

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

# Rendre le script d'entrée exécutable
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 10000
EXPOSE 51820/udp

# Utiliser le script d'entrée pour configurer WireGuard et démarrer l'application
ENTRYPOINT ["/docker-entrypoint.sh"]
