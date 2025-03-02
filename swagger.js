// swagger.js
module.exports = {
  openapi: '3.0.0',
  info: {
    title: 'Brand Exit VPN Network API',
    version: '1.0.0',
    description: 'API for the Brand Exit decentralized VPN network'
  },
  servers: [
    {
      url: 'https://vpn-network.onrender.com',
      description: 'Production server'
    },
    {
      url: 'http://localhost:10000',
      description: 'Development server'
    }
  ],
  paths: {
    '/api/connect': {
      post: {
        summary: 'Connect a node to the network',
        tags: ['Nodes'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  walletAddress: { type: 'string' },
                  nodeIP: { type: 'string' },
                  nodePort: { type: 'number' },
                  location: { type: 'string' }
                },
                required: ['walletAddress', 'nodeIP', 'nodePort']
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Node connected successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    message: { type: 'string' }
                  }
                }
              }
            }
          },
          '400': {
            description: 'Bad request',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    message: { type: 'string' }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/api/disconnect': {
      post: {
        summary: 'Disconnect a node from the network',
        tags: ['Nodes'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  walletAddress: { type: 'string' }
                },
                required: ['walletAddress']
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Node disconnected successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    message: { type: 'string' }
                  }
                }
              }
            }
          },
          '400': {
            description: 'Bad request',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    message: { type: 'string' }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/api/node-rewards/{walletAddress}': {
      get: {
        summary: 'Get rewards for a specific node',
        tags: ['Rewards'],
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'walletAddress',
            in: 'path',
            required: true,
            schema: {
              type: 'string'
            }
          }
        ],
        responses: {
          '200': {
            description: 'Node rewards retrieved successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    rewards: { type: 'number' }
                  }
                }
              }
            }
          },
          '400': {
            description: 'Bad request',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    message: { type: 'string' }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/api/network-stats': {
      get: {
        summary: 'Get network statistics',
        tags: ['Network'],
        responses: {
          '200': {
            description: 'Network statistics retrieved successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    stats: {
                      type: 'object',
                      properties: {
                        totalNodes: { type: 'number' },
                        activeNodes: { type: 'number' },
                        totalClients: { type: 'number' }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/api/dailyClaims': {
      get: {
        summary: 'Get daily claims information',
        tags: ['Rewards'],
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Daily claims information retrieved successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    canClaim: { type: 'boolean' },
                    rewards: { type: 'number' },
                    lastClaimDate: { type: 'string', format: 'date-time' }
                  }
                }
              }
            }
          },
          '400': {
            description: 'Bad request',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    message: { type: 'string' }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/api/connectedClients': {
      get: {
        summary: 'Get connected clients information',
        tags: ['Clients'],
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Connected clients information retrieved successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    clients: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          clientId: { type: 'string' },
                          nodeId: { type: 'string' },
                          connectionTime: { type: 'string', format: 'date-time' }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          '400': {
            description: 'Bad request',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    message: { type: 'string' }
                  }
                }
              }
            }
          }
        }
      }
    }
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT'
      }
    }
  }
};
