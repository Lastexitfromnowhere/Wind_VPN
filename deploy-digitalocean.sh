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

# Installer sshpass si nécessaire
if ! command -v sshpass &> /dev/null; then
    echo "📦 Installation de sshpass pour l'authentification par mot de passe..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        brew install sshpass
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        sudo apt-get update && sudo apt-get install -y sshpass
    elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
        # Windows avec Git Bash ou similaire
        echo "⚠️ Sur Windows, veuillez installer sshpass manuellement ou utiliser WSL."
        echo "Vous pouvez continuer sans sshpass, mais vous devrez saisir votre mot de passe plusieurs fois."
    fi
fi

# Demander le mot de passe SSH
read -sp "Entrez le mot de passe SSH pour $USER@$IP_DROPLET: " SSH_PASSWORD
echo ""

# Fonction pour exécuter des commandes SSH avec mot de passe
run_ssh_command() {
    if command -v sshpass &> /dev/null; then
        sshpass -p "$SSH_PASSWORD" ssh -o StrictHostKeyChecking=no $USER@$IP_DROPLET "$1"
    else
        ssh -o StrictHostKeyChecking=no $USER@$IP_DROPLET "$1"
    fi
}

# Fonction pour copier des fichiers avec rsync et mot de passe
run_rsync_command() {
    if command -v sshpass &> /dev/null; then
        sshpass -p "$SSH_PASSWORD" rsync $1 $USER@$IP_DROPLET:$2
    else
        rsync $1 $USER@$IP_DROPLET:$2
    fi
}

# Vérifier la connexion SSH
echo "📡 Vérification de la connexion SSH..."
if command -v sshpass &> /dev/null; then
    sshpass -p "$SSH_PASSWORD" ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 $USER@$IP_DROPLET echo "Connexion SSH réussie" || {
        echo "❌ Échec de la connexion SSH. Vérifiez votre mot de passe et que le serveur est accessible."
        exit 1
    }
else
    ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 $USER@$IP_DROPLET echo "Connexion SSH réussie" || {
        echo "❌ Échec de la connexion SSH. Vérifiez votre mot de passe et que le serveur est accessible."
        exit 1
    }
fi

# Créer le répertoire distant s'il n'existe pas
echo "📁 Création du répertoire distant..."
run_ssh_command "mkdir -p $REMOTE_DIR"

# Copier les fichiers
echo "📦 Copie des fichiers vers le serveur..."
if command -v sshpass &> /dev/null; then
    sshpass -p "$SSH_PASSWORD" rsync -avz --exclude 'node_modules' --exclude '.git' --exclude 'logs' --exclude '.env' . $USER@$IP_DROPLET:$REMOTE_DIR
else
    rsync -avz --exclude 'node_modules' --exclude '.git' --exclude 'logs' --exclude '.env' . $USER@$IP_DROPLET:$REMOTE_DIR
fi

# Configurer le serveur
echo "⚙️ Configuration du serveur..."
run_ssh_command "cd $REMOTE_DIR && \
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
run_ssh_command "cat > /tmp/wind-vpn.service << 'EOL'
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
run_ssh_command "cd $REMOTE_DIR && sudo docker-compose ps && \
    echo 'IP Forwarding:' && cat /proc/sys/net/ipv4/ip_forward && \
    echo 'Ports ouverts:' && sudo ufw status && \
    echo 'Service systemd:' && sudo systemctl status wind-vpn --no-pager"

echo "✅ Déploiement terminé avec succès!"
echo "📝 Votre fichier .env a été configuré automatiquement avec:"
echo "   - L'adresse IP du serveur: $IP_DROPLET"
echo "🌐 Votre serveur VPN est accessible à l'adresse: http://$IP_DROPLET:10000"
echo "🔒 Interface WireGuard disponible sur UDP port 51820"
