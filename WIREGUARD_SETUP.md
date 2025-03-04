# Guide d'installation et de configuration de WireGuard

Ce document explique comment installer et configurer WireGuard pour le projet Wind_VPN.

## Prérequis

- Un serveur Linux (Ubuntu 22.04 LTS recommandé)
- Docker et Docker Compose installés
- Un accès root ou sudo

## Installation sur Digital Ocean

### Étape 1 : Créer un Droplet

1. Connectez-vous à votre compte Digital Ocean
2. Cliquez sur "Create" puis "Droplets"
3. Choisissez les spécifications suivantes :
   - **Distribution** : Ubuntu 22.04 LTS
   - **Plan** : Basic (Standard)
   - **CPU** : Au moins 2 vCPU / 4 GB RAM (recommandé pour WireGuard + Docker)
   - **Région** : Choisissez la plus proche de vos utilisateurs
   - **Authentification** : SSH Keys (recommandé) ou Password
   - **Hostname** : wind-vpn-server (ou un nom de votre choix)
4. Cliquez sur "Create Droplet"

### Étape 2 : Se connecter au VPS et installer les dépendances

```bash
ssh root@VOTRE_IP_DROPLET

# Mettre à jour le système
apt update && apt upgrade -y

# Installer les dépendances de base
apt install -y git curl wget nano ufw
```

### Étape 3 : Installer Docker et Docker Compose

```bash
# Installer Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Installer Docker Compose
apt install -y docker-compose
```

### Étape 4 : Configurer le pare-feu (UFW)

```bash
# Autoriser SSH
ufw allow 22/tcp

# Autoriser les ports pour WireGuard
ufw allow 51820/udp

# Autoriser les ports pour votre API
ufw allow 10000/tcp

# Activer le pare-feu
ufw enable
```

### Étape 5 : Cloner le dépôt

```bash
mkdir -p /opt/wind-vpn
cd /opt/wind-vpn
git clone https://github.com/Lastexitfromnowhere/Wind_VPN.git .
```

### Étape 6 : Configurer le fichier .env

```bash
cp .env.example .env
nano .env
```

Ajoutez le contenu suivant :

```
PORT=10000
MONGODB_URI=mongodb://mongodb:27017/vpn
REDIS_URI=redis://redis:6379
JWT_SECRET=votre-clé-secrète-très-sécurisée
NODE_ENV=production
CORS_ORIGIN=*
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100
LOG_LEVEL=info
SERVER_PUBLIC_IP=VOTRE_IP_DROPLET
```

Remplacez `VOTRE_IP_DROPLET` par l'adresse IP publique de votre serveur.

### Étape 7 : Activer l'IP Forwarding au niveau du système hôte

```bash
# Activer temporairement
sysctl -w net.ipv4.ip_forward=1

# Activer de façon permanente
echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf
sysctl -p
```

### Étape 8 : Démarrer l'application avec Docker Compose

```bash
cd /opt/wind-vpn
chmod +x docker-entrypoint.sh
docker-compose up -d
```

### Étape 9 : Vérifier que tout fonctionne

```bash
# Vérifier que les conteneurs Docker sont en cours d'exécution
docker ps

# Vérifier les logs de l'application
docker-compose logs -f app

# Tester l'API
curl http://localhost:10000/api/health
```

### Étape 10 : Configurer un service systemd pour le démarrage automatique

```bash
nano /etc/systemd/system/wind-vpn.service
```

Contenu :

```ini
[Unit]
Description=Wind VPN Service
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/wind-vpn
ExecStart=/usr/bin/docker-compose up -d
ExecStop=/usr/bin/docker-compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
```

Activez le service :

```bash
systemctl enable wind-vpn
systemctl start wind-vpn
```

## Déploiement automatisé

Pour un déploiement automatisé, vous pouvez utiliser le script `deploy-digitalocean.sh` inclus dans le dépôt :

```bash
# Sur votre machine locale
chmod +x deploy-digitalocean.sh
./deploy-digitalocean.sh VOTRE_IP_DROPLET root
```

Ce script va :
1. Copier les fichiers sur le serveur
2. Configurer l'environnement
3. Installer Docker si nécessaire
4. Démarrer l'application
5. Configurer le service systemd

## Configuration des clients WireGuard

### Utilisation de l'API

L'API Wind_VPN expose les endpoints suivants pour gérer les configurations WireGuard :

- `GET /api/wireguard/config` : Obtenir la configuration WireGuard de l'utilisateur
- `POST /api/wireguard/config` : Créer ou régénérer la configuration WireGuard de l'utilisateur
- `DELETE /api/wireguard/config` : Désactiver la configuration WireGuard de l'utilisateur
- `GET /api/wireguard/status` : Vérifier le statut de WireGuard
- `GET /api/wireguard/connected-clients` : Obtenir la liste des clients connectés (admin seulement)

### Installation du client WireGuard

1. Téléchargez et installez le client WireGuard pour votre plateforme :
   - [Windows](https://download.wireguard.com/windows-client/wireguard-installer.exe)
   - [macOS](https://apps.apple.com/us/app/wireguard/id1451685025)
   - [iOS](https://apps.apple.com/us/app/wireguard/id1441195209)
   - [Android](https://play.google.com/store/apps/details?id=com.wireguard.android)
   - Linux : `sudo apt install wireguard` (Ubuntu/Debian)

2. Obtenez votre configuration via l'API Wind_VPN

3. Importez la configuration dans le client WireGuard :
   - Windows/macOS : Cliquez sur "Import tunnel(s) from file" et sélectionnez le fichier de configuration
   - iOS/Android : Scannez le code QR ou importez le fichier de configuration
   - Linux : Placez le fichier de configuration dans `/etc/wireguard/` et activez-le avec `wg-quick up wg0`

## Dépannage

### Problèmes courants

1. **L'IP Forwarding n'est pas activé**
   - Vérifiez l'état avec `cat /proc/sys/net/ipv4/ip_forward`
   - Si la valeur est 0, activez-le avec `sysctl -w net.ipv4.ip_forward=1`

2. **Les clients ne peuvent pas se connecter**
   - Vérifiez que le port UDP 51820 est ouvert dans le pare-feu
   - Vérifiez les logs avec `docker-compose logs -f app`
   - Assurez-vous que l'adresse IP du serveur est correcte dans les configurations client

3. **WireGuard n'est pas disponible dans le conteneur**
   - Vérifiez que le module est chargé avec `lsmod | grep wireguard`
   - Si nécessaire, installez-le manuellement avec `apt install -y wireguard`

### Commandes utiles

- Vérifier l'état de WireGuard : `wg show`
- Redémarrer l'interface WireGuard : `wg-quick down wg0 && wg-quick up wg0`
- Voir les logs en temps réel : `docker-compose logs -f app`
- Redémarrer tous les services : `docker-compose restart`

## Mode développement

En mode développement, vous pouvez simuler WireGuard sans l'installer en ajoutant cette variable d'environnement :

```
SIMULATE_WIREGUARD=true
```

Cela permet de tester les fonctionnalités WireGuard sans avoir à installer le logiciel sur votre machine de développement.
