# Decentralized VPN Network

A decentralized VPN network with node rewards system, performance monitoring, and WireGuard integration.

## Features

- Node hosting and connection management
- WireGuard VPN protocol integration
- Reward system based on performance and contribution
- Real-time network statistics
- Security middleware and rate limiting
- Performance monitoring with Prometheus
- Caching with Redis
- Structured logging
- Docker containerization

## Prerequisites

- Node.js >= 18
- MongoDB
- Redis
- Docker & Docker Compose (recommended)
- WireGuard (installed automatically in Docker)

## Installation

1. Clone the repository
2. Copy `.env.example` to `.env` and configure your environment variables
3. Install dependencies:
```bash
npm install
```

## Running with Docker (Recommended)

```bash
docker-compose up -d
```

## Running Locally

1. Start MongoDB and Redis
2. Install WireGuard (see [WIREGUARD_SETUP.md](WIREGUARD_SETUP.md))
3. Run the server:
```bash
npm start
```

For development (with WireGuard simulation):
```bash
export SIMULATE_WIREGUARD=true
npm run dev
```

## API Endpoints

### Authentication Required
- `POST /api/connect` - Connect a new node
- `POST /api/disconnect` - Disconnect a node
- `GET /api/node-rewards/:walletAddress` - Get node rewards
- `GET /api/wireguard/config` - Get WireGuard configuration
- `POST /api/wireguard/config` - Create/regenerate WireGuard configuration
- `DELETE /api/wireguard/config` - Deactivate WireGuard configuration
- `GET /api/wireguard/status` - Check WireGuard status

### Admin Only
- `GET /api/wireguard/connected-clients` - Get connected WireGuard clients

### Public
- `GET /api/network-stats` - Get network statistics
- `GET /health` - Health check endpoint
- `GET /metrics` - Prometheus metrics

## WireGuard Integration

This project integrates WireGuard VPN protocol for secure, high-performance connections. Key features:

- Automatic key generation and management
- Dynamic client configuration
- Persistent configuration storage in MongoDB
- IP forwarding and network routing
- Docker integration for easy deployment

For detailed setup instructions, see [WIREGUARD_SETUP.md](WIREGUARD_SETUP.md).

## Deployment on Digital Ocean

For production deployment on Digital Ocean, you can use the included deployment script:

```bash
chmod +x deploy-digitalocean.sh
./deploy-digitalocean.sh YOUR_DROPLET_IP root
```

This script will:
1. Copy files to the server
2. Configure the environment
3. Install Docker if necessary
4. Start the application
5. Configure systemd for automatic startup

See [WIREGUARD_SETUP.md](WIREGUARD_SETUP.md) for detailed deployment instructions.

## Monitoring

- Prometheus metrics available at `/metrics`
- Structured logs in `logs/` directory
- Health check endpoint at `/health`

## Security Features

- JWT Authentication
- Rate limiting
- CORS protection
- XSS protection
- Security headers
- Input validation
- WireGuard encryption for VPN traffic

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request
