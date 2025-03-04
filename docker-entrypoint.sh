#!/bin/bash
set -e

# Fonction pour activer l'IP Forwarding
enable_ip_forwarding() {
    echo "Activation de l'IP Forwarding..."
    
    # Méthode 1: Utiliser sysctl
    if ! sysctl -w net.ipv4.ip_forward=1; then
        echo "Échec de l'activation de l'IP Forwarding avec sysctl, essai de la méthode alternative..."
        
        # Méthode 2: Écrire directement dans /proc
        if ! echo 1 > /proc/sys/net/ipv4/ip_forward; then
            echo "AVERTISSEMENT: Impossible d'activer l'IP Forwarding. WireGuard pourrait ne pas fonctionner correctement."
        else
            echo "IP Forwarding activé avec succès via /proc."
        fi
    else
        echo "IP Forwarding activé avec succès via sysctl."
    fi
    
    # Vérifier l'état actuel
    echo "État actuel de l'IP Forwarding:"
    cat /proc/sys/net/ipv4/ip_forward
}

# Fonction pour configurer WireGuard
setup_wireguard() {
    echo "Configuration de WireGuard..."
    
    # Vérifier si le module WireGuard est chargé
    if ! lsmod | grep -q wireguard; then
        echo "Chargement du module WireGuard..."
        modprobe wireguard || echo "AVERTISSEMENT: Impossible de charger le module WireGuard. Cela pourrait être normal dans un environnement conteneurisé."
    fi
    
    # Vérifier si les outils WireGuard sont installés
    if ! command -v wg &> /dev/null; then
        echo "ERREUR: Les outils WireGuard ne sont pas installés."
        exit 1
    fi
    
    echo "WireGuard est configuré et prêt à être utilisé."
}

# Fonction pour configurer les règles iptables
setup_iptables() {
    echo "Configuration des règles iptables..."
    
    # Activer le masquerading pour permettre aux clients WireGuard d'accéder à Internet
    iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
    
    echo "Règles iptables configurées."
}

# Fonction principale
main() {
    echo "Démarrage du script d'initialisation..."
    
    # Activer l'IP Forwarding
    enable_ip_forwarding
    
    # Configurer WireGuard
    setup_wireguard
    
    # Configurer iptables
    setup_iptables
    
    echo "Initialisation terminée. Démarrage de l'application Node.js..."
    
    # Démarrer l'application Node.js
    exec npm start
}

# Exécuter la fonction principale
main
