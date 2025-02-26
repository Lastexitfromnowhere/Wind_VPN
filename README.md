# Decentralized VPN Network

A decentralized VPN network with node rewards system and performance monitoring.

## Features

- Node hosting and connection management
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
- Docker & Docker Compose (optional)

## Installation

1. Clone the repository
2. Copy `.env.example` to `.env` and configure your environment variables
3. Install dependencies:
```bash
npm install
```

## Running with Docker

```bash
docker-compose up -d
```

## Running Locally

1. Start MongoDB and Redis
2. Run the server:
```bash
npm start
```

For development:
```bash
npm run dev
```

## API Endpoints

### Authentication Required
- `POST /api/connect` - Connect a new node
- `POST /api/disconnect` - Disconnect a node
- `GET /api/node-rewards/:walletAddress` - Get node rewards

### Public
- `GET /api/network-stats` - Get network statistics
- `GET /health` - Health check endpoint
- `GET /metrics` - Prometheus metrics

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

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request
