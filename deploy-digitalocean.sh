#!/bin/bash
# Script de déploiement pour Digital Ocean
# Usage: ./deploy-digitalocean.sh <IP_DROPLET> <USER>

# Vérifier les arguments
if [ "$#" -lt 2 ]; then
    echo "Usage: $0 <IP_DROPLET> <USER>"
    echo "Exemple: $0 123.456.789.123 root"
    exit 1
fi

IP_DROPLET=$1
USER=$2
REMOTE_DIR="/opt/wind-vpn"

echo "🚀 Déploiement vers Digital Ocean ($IP_DROPLET)..."

# Vérifier la connexion SSH
echo "📡 Vérification de la connexion SSH..."
ssh -o BatchMode=yes -o ConnectTimeout=5 $USER@$IP_DROPLET echo "Connexion SSH réussie" || {
    echo "❌ Échec de la connexion SSH. Vérifiez vos clés SSH et que le serveur est accessible."
    exit 1
}

# Créer le répertoire distant s'il n'existe pas
echo "📁 Création du répertoire distant..."
ssh $USER@$IP_DROPLET "mkdir -p $REMOTE_DIR"

# Copier les fichiers
echo "📦 Copie des fichiers vers le serveur..."
rsync -avz --exclude 'node_modules' --exclude '.git' --exclude 'logs' --exclude '.env' . $USER@$IP_DROPLET:$REMOTE_DIR

# Configurer le serveur
echo "⚙️ Configuration du serveur..."
ssh $USER@$IP_DROPLET "cd $REMOTE_DIR && \
    # Créer .env s'il n'existe pas
    if [ ! -f .env ]; then
        cp .env.production .env
        # Remplacer les valeurs par défaut
        sed -i \"s/REMPLACER_PAR_IP_DROPLET/$IP_DROPLET/g\" .env
        echo 'Fichier .env créé et configuré avec les valeurs de production.'
    fi && \
    # Rendre les scripts exécutables
    chmod +x docker-entrypoint.sh && \
    # Activer l'IP Forwarding
    echo 'net.ipv4.ip_forward=1' | sudo tee -a /etc/sysctl.conf && \
    sudo sysctl -p && \
    # Configurer le pare-feu
    sudo ufw allow 22/tcp && \
    sudo ufw allow 51820/udp && \
    sudo ufw allow 10000/tcp && \
    # Installer Docker si nécessaire
    if ! command -v docker &> /dev/null; then
        echo 'Installation de Docker...' && \
        curl -fsSL https://get.docker.com -o get-docker.sh && \
        sudo sh get-docker.sh && \
        sudo apt install -y docker-compose
    fi && \
    # Démarrer les conteneurs
    sudo docker-compose up -d"

# Créer un service systemd
echo "🔄 Configuration du service systemd..."
ssh $USER@$IP_DROPLET "cat > /tmp/wind-vpn.service << 'EOL'
[Unit]
Description=Wind VPN Service
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$REMOTE_DIR
ExecStart=/usr/bin/docker-compose up -d
ExecStop=/usr/bin/docker-compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOL
sudo mv /tmp/wind-vpn.service /etc/systemd/system/ && \
sudo systemctl daemon-reload && \
sudo systemctl enable wind-vpn && \
sudo systemctl start wind-vpn"

# Vérifier le statut
echo "🔍 Vérification du statut..."
ssh $USER@$IP_DROPLET "cd $REMOTE_DIR && sudo docker-compose ps && \
    echo 'IP Forwarding:' && cat /proc/sys/net/ipv4/ip_forward && \
    echo 'Ports ouverts:' && sudo ufw status && \
    echo 'Service systemd:' && sudo systemctl status wind-vpn --no-pager"

echo "✅ Déploiement terminé avec succès!"
echo "📝 Votre fichier .env a été configuré automatiquement avec:"
echo "   - L'adresse IP du serveur: $IP_DROPLET"
echo "🌐 Votre serveur VPN est accessible à l'adresse: http://$IP_DROPLET:10000"
echo "🔒 Interface WireGuard disponible sur UDP port 51820"
