const swaggerUi = require('swagger-ui-express');
const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');

// Load swagger.yaml if present; otherwise, build a minimal spec
let swaggerSpec;
const yamlPath = path.join(process.cwd(), 'swagger.yaml');
if (fs.existsSync(yamlPath)) {
  const file = fs.readFileSync(yamlPath, 'utf8');
  swaggerSpec = yaml.load(file);
} else {
  swaggerSpec = {
    openapi: '3.0.0',
    info: {
      title: 'Daydream API',
      version: '1.0.0',
      description: 'Daydream POS System API with bulk discount support. Orders with 6+ items automatically receive 10% bulk discount. Refunds handle proportional discount returns when applicable.'
    },
    servers: [
      { url: 'http://localhost:4000/api/v1', description: 'Local server (v1)' }
    ],
    tags: [
      { name: 'Health', description: 'Health check endpoints' },
      { name: 'Authentication', description: 'User authentication and authorization' },
      { name: 'Categories', description: 'Category management' },
      { name: 'SubCategories', description: 'SubCategory management' },
      { name: 'Warehouses', description: 'Warehouse management' },
      { name: 'Branches', description: 'Branch management' },
      { name: 'Transfers', description: 'Stock transfer management' },
      { name: 'Products', description: 'Product management with SKU/barcode generation' },
      { name: 'Customers', description: 'Customer management' },
      { name: 'Orders', description: 'Order management and sales transactions' },
      { name: 'Refunds', description: 'Refund management for order items' },
      { name: 'Replacements', description: 'Product replacement management with financial tracking' },
      { name: 'Cashier Discounts', description: 'Cashier discount management with time-based permissions' },
      { name: 'Shifts', description: 'Cashier shift tracking with sales reporting and analytics' },
      { name: 'Analytics - Sales', description: 'Sales analytics and reporting endpoints' },
      { name: 'Analytics - Products', description: 'Product performance and analytics endpoints' }
    ],
    paths: {
      '/health': {
        get: {
          tags: ['Health'],
          summary: 'Health check',
          security: [],
          responses: {
            '200': {
              description: 'OK'
            }
          }
        }
      },
      '/auth/login': {
        post: {
          tags: ['Authentication'],
          summary: 'Login',
          description: 'Authenticate a user and return a JWT token',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['email', 'password'],
                  properties: {
                    email: { type: 'string', format: 'email' },
                    password: { type: 'string', format: 'password' }
                  }
                }
              }
            }
          },
          responses: {
            '200': {
              description: 'Authenticated',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      token: { type: 'string' },
                      user: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          name: { type: 'string' },
                          email: { type: 'string' },
                          role: { type: 'string' },
                          branchId: { type: 'string', nullable: true },
                          warehouseId: { type: 'string', nullable: true }
                        }
                      }
                    }
                  }
                }
              }
            },
            '401': { description: 'Invalid credentials' }
          },
          security: []
        }
      },
      '/auth/register': {
        post: {
          tags: ['Authentication'],
          summary: 'Register user (admin only)',
          description: 'Create a new user account for roles: branch_manager, cashier, stock_keeper',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name', 'email', 'password', 'role'],
                  properties: {
                    name: { type: 'string' },
                    email: { type: 'string', format: 'email' },
                    password: { type: 'string', format: 'password' },
                    role: { type: 'string', enum: ['branch_manager', 'cashier', 'stock_keeper'] },
                    branchId: { type: 'string', nullable: true },
                    warehouseId: { type: 'string', nullable: true }
                  }
                }
              }
            }
          },
          responses: {
            '201': {
              description: 'Created',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      user: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          name: { type: 'string' },
                          email: { type: 'string' },
                          role: { type: 'string' },
                          branchId: { type: 'string', nullable: true },
                          warehouseId: { type: 'string', nullable: true }
                        }
                      }
                    }
                  }
                }
              }
            },
            '400': { description: 'Validation error' },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden' },
            '409': { description: 'Email already in use' }
          },
          security: [{ BearerAuth: [] }]
        }
      },
      '/auth/logout': {
        post: {
          tags: ['Authentication'],
          summary: 'Logout (revoke token for its remaining lifetime)',
          requestBody: {
            required: false,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    token: { type: 'string', description: 'JWT (if not using Authorization header)' }
                  }
                }
              }
            }
          },
          responses: {
            '200': {
              description: 'Logged out',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: { message: { type: 'string' } }
                  }
                }
              }
            },
            '401': { description: 'Unauthorized' }
          },
          security: []
        }
      },
      '/auth/users': {
        get: {
          tags: ['Authentication'],
          summary: 'List all users (admin only)',
          description: 'Get a list of all users in the system with optional filtering by role, branch, or warehouse. Includes pagination support.',
          parameters: [
            {
              in: 'query',
              name: 'role',
              schema: {
                type: 'string',
                enum: ['admin', 'branch_manager', 'cashier', 'stock_keeper']
              },
              description: 'Filter users by role',
              required: false
            },
            {
              in: 'query',
              name: 'branchId',
              schema: {
                type: 'string',
                format: 'uuid'
              },
              description: 'Filter users by branch UUID',
              required: false
            },
            {
              in: 'query',
              name: 'warehouseId',
              schema: {
                type: 'string',
                format: 'uuid'
              },
              description: 'Filter users by warehouse UUID',
              required: false
            },
            {
              in: 'query',
              name: 'limit',
              schema: {
                type: 'integer',
                default: 50,
                minimum: 1,
                maximum: 100
              },
              description: 'Maximum number of results to return',
              required: false
            },
            {
              in: 'query',
              name: 'offset',
              schema: {
                type: 'integer',
                default: 0,
                minimum: 0
              },
              description: 'Number of results to skip for pagination',
              required: false
            }
          ],
          responses: {
            '200': {
              description: 'List of users retrieved successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      users: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: {
                              type: 'string',
                              format: 'uuid',
                              description: 'User UUID'
                            },
                            name: {
                              type: 'string',
                              example: 'John Doe'
                            },
                            email: {
                              type: 'string',
                              format: 'email',
                              example: 'john@example.com'
                            },
                            role: {
                              type: 'string',
                              enum: ['admin', 'branch_manager', 'cashier', 'stock_keeper'],
                              example: 'cashier'
                            },
                            branch: {
                              type: 'object',
                              nullable: true,
                              properties: {
                                id: {
                                  type: 'string',
                                  format: 'uuid'
                                },
                                name: {
                                  type: 'string',
                                  example: 'Downtown Store'
                                }
                              }
                            },
                            warehouse: {
                              type: 'object',
                              nullable: true,
                              properties: {
                                id: {
                                  type: 'string',
                                  format: 'uuid'
                                },
                                name: {
                                  type: 'string',
                                  example: 'Main Warehouse'
                                }
                              }
                            },
                            branchId: {
                              type: 'string',
                              format: 'uuid',
                              nullable: true
                            },
                            warehouseId: {
                              type: 'string',
                              format: 'uuid',
                              nullable: true
                            },
                            createdAt: {
                              type: 'string',
                              format: 'date-time'
                            },
                            updatedAt: {
                              type: 'string',
                              format: 'date-time'
                            }
                          }
                        }
                      },
                      total: {
                        type: 'integer',
                        description: 'Total number of users matching the filter',
                        example: 25
                      },
                      limit: {
                        type: 'integer',
                        example: 50
                      },
                      offset: {
                        type: 'integer',
                        example: 0
                      }
                    }
                  }
                }
              }
            },
            '401': {
              description: 'Unauthorized - missing or invalid JWT token'
            },
            '403': {
              description: 'Forbidden - admin access only'
            },
            '500': {
              description: 'Internal server error'
            }
          },
          security: [{ BearerAuth: [] }]
        }
      },
      '/auth/users/{id}': {
        patch: {
          tags: ['Authentication'],
          summary: 'Update user (admin only)',
          description: 'Update user information. Supports partial updates - only provided fields will be updated. Admin can edit any field including name, email, password, role, branch assignment, and warehouse assignment.',
          parameters: [
            {
              in: 'path',
              name: 'id',
              required: true,
              schema: {
                type: 'string',
                format: 'uuid'
              },
              description: 'User UUID to update'
            }
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    name: {
                      type: 'string',
                      description: 'User full name',
                      example: 'Jane Smith'
                    },
                    email: {
                      type: 'string',
                      format: 'email',
                      description: 'User email address',
                      example: 'jane.smith@example.com'
                    },
                    password: {
                      type: 'string',
                      minLength: 6,
                      description: 'New password (min 6 characters)',
                      example: 'newpassword123'
                    },
                    role: {
                      type: 'string',
                      enum: ['admin', 'branch_manager', 'cashier', 'stock_keeper'],
                      description: 'User role',
                      example: 'branch_manager'
                    },
                    branchId: {
                      type: 'string',
                      format: 'uuid',
                      nullable: true,
                      description: 'Branch UUID to assign user to (null to unassign)',
                      example: '123e4567-e89b-12d3-a456-426614174000'
                    },
                    warehouseId: {
                      type: 'string',
                      format: 'uuid',
                      nullable: true,
                      description: 'Warehouse UUID to assign user to (null to unassign)',
                      example: '123e4567-e89b-12d3-a456-426614174001'
                    }
                  },
                  description: 'All fields are optional. Only provided fields will be updated.'
                }
              }
            }
          },
          responses: {
            '200': {
              description: 'User updated successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: {
                        type: 'string',
                        example: 'User updated successfully'
                      },
                      user: {
                        type: 'object',
                        properties: {
                          id: {
                            type: 'string',
                            format: 'uuid'
                          },
                          name: {
                            type: 'string'
                          },
                          email: {
                            type: 'string',
                            format: 'email'
                          },
                          role: {
                            type: 'string',
                            enum: ['admin', 'branch_manager', 'cashier', 'stock_keeper']
                          },
                          branch: {
                            type: 'object',
                            nullable: true,
                            properties: {
                              id: { type: 'string', format: 'uuid' },
                              name: { type: 'string' }
                            }
                          },
                          warehouse: {
                            type: 'object',
                            nullable: true,
                            properties: {
                              id: { type: 'string', format: 'uuid' },
                              name: { type: 'string' }
                            }
                          },
                          branchId: {
                            type: 'string',
                            format: 'uuid',
                            nullable: true
                          },
                          warehouseId: {
                            type: 'string',
                            format: 'uuid',
                            nullable: true
                          },
                          createdAt: {
                            type: 'string',
                            format: 'date-time'
                          },
                          updatedAt: {
                            type: 'string',
                            format: 'date-time'
                          }
                        }
                      }
                    }
                  }
                }
              }
            },
            '400': {
              description: 'Bad request - validation error or no fields provided',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: {
                        type: 'string',
                        examples: [
                          'Name must be a non-empty string',
                          'Valid email is required',
                          'Password must be at least 6 characters',
                          'Invalid role. Allowed: admin, branch_manager, cashier, stock_keeper',
                          'No valid fields provided for update'
                        ]
                      }
                    }
                  }
                }
              }
            },
            '401': {
              description: 'Unauthorized - missing or invalid JWT token'
            },
            '403': {
              description: 'Forbidden - admin access only'
            },
            '404': {
              description: 'User, branch, or warehouse not found',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: {
                        type: 'string',
                        examples: [
                          'User not found',
                          'Branch not found',
                          'Warehouse not found'
                        ]
                      }
                    }
                  }
                }
              }
            },
            '409': {
              description: 'Conflict - email already in use by another user',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: {
                        type: 'string',
                        example: 'Email already in use by another user'
                      }
                    }
                  }
                }
              }
            },
            '500': {
              description: 'Internal server error'
            }
          },
          security: [{ BearerAuth: [] }]
        },
        delete: {
          tags: ['Authentication'],
          summary: 'Delete user (admin only)',
          description: 'Delete a user account. Prevents deleting your own account and admin accounts. Only accessible by admin users.',
          parameters: [
            {
              in: 'path',
              name: 'id',
              required: true,
              schema: {
                type: 'string',
                format: 'uuid'
              },
              description: 'User UUID to delete'
            }
          ],
          responses: {
            '200': {
              description: 'User deleted successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: {
                        type: 'string',
                        example: 'User deleted successfully'
                      },
                      user: {
                        type: 'object',
                        properties: {
                          id: {
                            type: 'string',
                            format: 'uuid',
                            description: 'Deleted user UUID'
                          },
                          name: {
                            type: 'string',
                            description: 'Deleted user name'
                          },
                          email: {
                            type: 'string',
                            format: 'email',
                            description: 'Deleted user email'
                          },
                          role: {
                            type: 'string',
                            description: 'Deleted user role'
                          }
                        }
                      }
                    }
                  }
                }
              }
            },
            '400': {
              description: 'Bad request - cannot delete own account',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: {
                        type: 'string',
                        example: 'Cannot delete your own account'
                      }
                    }
                  }
                }
              }
            },
            '401': {
              description: 'Unauthorized - missing or invalid JWT token'
            },
            '403': {
              description: 'Forbidden - cannot delete admin accounts or admin access required',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: {
                        type: 'string',
                        example: 'Cannot delete admin accounts'
                      }
                    }
                  }
                }
              }
            },
            '404': {
              description: 'User not found',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: {
                        type: 'string',
                        example: 'User not found'
                      }
                    }
                  }
                }
              }
            },
            '500': {
              description: 'Internal server error'
            }
          },
          security: [{ BearerAuth: [] }]
        }
      },
      '/categories': {
        post: {
          tags: ['Categories'],
          summary: 'Create category (admin only)',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name'],
                  properties: {
                    name: { type: 'string' }
                  }
                }
              }
            }
          },
          responses: {
            '201': {
              description: 'Created'
            },
            '400': { description: 'Validation error' },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden' },
            '409': { description: 'Category name already exists' }
          },
          security: [{ BearerAuth: [] }]
        },
        get: {
          tags: ['Categories'],
          summary: 'List categories (admin, branch_manager, cashier)',
          responses: {
            '200': {
              description: 'OK'
            },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden' }
          },
          security: [{ BearerAuth: [] }]
        }
      },
      '/categories/{id}': {
        put: {
          tags: ['Categories'],
          summary: 'Update category (admin only)',
          parameters: [
            { in: 'path', name: 'id', schema: { type: 'string' }, required: true }
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name'],
                  properties: { name: { type: 'string' } }
                }
              }
            }
          },
          responses: {
            '200': { description: 'Updated' },
            '400': { description: 'Validation error' },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden' },
            '404': { description: 'Not found' },
            '409': { description: 'Category name already exists' }
          },
          security: [{ BearerAuth: [] }]
        },
        delete: {
          tags: ['Categories'],
          summary: 'Delete category (admin only)',
          parameters: [
            { in: 'path', name: 'id', schema: { type: 'string' }, required: true }
          ],
          responses: {
            '204': { description: 'Deleted' },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden' },
            '404': { description: 'Not found' },
            '409': { description: 'Cannot delete category with related records' }
          },
          security: [{ BearerAuth: [] }]
        }
      },
      '/subcategories': {
        post: {
          tags: ['SubCategories'],
          summary: 'Create subcategory (admin only)',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name', 'categoryId'],
                  properties: {
                    name: { type: 'string' },
                    categoryId: { type: 'string', format: 'uuid' }
                  }
                }
              }
            }
          },
          responses: {
            '201': {
              description: 'Created',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      subCategory: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          name: { type: 'string' },
                          categoryId: { type: 'string' },
                          createdAt: { type: 'string', format: 'date-time' },
                          updatedAt: { type: 'string', format: 'date-time' }
                        }
                      }
                    }
                  }
                }
              }
            },
            '400': { description: 'Validation error' },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden' },
            '404': { description: 'Category not found' },
            '409': { description: 'SubCategory name already exists in this category' }
          },
          security: [{ BearerAuth: [] }]
        },
        get: {
          tags: ['SubCategories'],
          summary: 'List subcategories (admin, branch_manager, cashier)',
          parameters: [
            {
              in: 'query',
              name: 'categoryId',
              schema: { type: 'string', format: 'uuid' },
              required: false,
              description: 'Filter subcategories by category ID'
            }
          ],
          responses: {
            '200': {
              description: 'OK',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      subCategories: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'string' },
                            name: { type: 'string' },
                            categoryId: { type: 'string' },
                            createdAt: { type: 'string', format: 'date-time' },
                            updatedAt: { type: 'string', format: 'date-time' }
                          }
                        }
                      }
                    }
                  }
                }
              }
            },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden' }
          },
          security: [{ BearerAuth: [] }]
        }
      },
      '/subcategories/{id}': {
        put: {
          tags: ['SubCategories'],
          summary: 'Update subcategory (admin only)',
          parameters: [
            { in: 'path', name: 'id', schema: { type: 'string' }, required: true }
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name'],
                  properties: {
                    name: { type: 'string' },
                    categoryId: { type: 'string', format: 'uuid' }
                  }
                }
              }
            }
          },
          responses: {
            '200': {
              description: 'Updated',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      subCategory: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          name: { type: 'string' },
                          categoryId: { type: 'string' },
                          createdAt: { type: 'string', format: 'date-time' },
                          updatedAt: { type: 'string', format: 'date-time' }
                        }
                      }
                    }
                  }
                }
              }
            },
            '400': { description: 'Validation error' },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden' },
            '404': { description: 'SubCategory not found or Category not found' },
            '409': { description: 'SubCategory name already exists in this category' }
          },
          security: [{ BearerAuth: [] }]
        },
        delete: {
          tags: ['SubCategories'],
          summary: 'Delete subcategory (admin only)',
          parameters: [
            { in: 'path', name: 'id', schema: { type: 'string' }, required: true }
          ],
          responses: {
            '204': { description: 'Deleted' },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden' },
            '404': { description: 'SubCategory not found' },
            '409': { description: 'Cannot delete subcategory with related records' }
          },
          security: [{ BearerAuth: [] }]
        }
      },
      '/warehouses': {
        post: {
          tags: ['Warehouses'],
          summary: 'Create warehouse (admin only)',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name', 'location', 'type'],
                  properties: {
                    name: { type: 'string' },
                    location: { type: 'string' },
                    type: { type: 'string', enum: ['central', 'stock'] }
                  }
                }
              }
            }
          },
          responses: {
            '201': {
              description: 'Created',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      warehouse: {
                        type: 'object',
                        properties: {
                          id: { type: 'string', format: 'uuid' },
                          name: { type: 'string' },
                          location: { type: 'string' },
                          type: { type: 'string', enum: ['central', 'stock'] },
                          createdAt: { type: 'string', format: 'date-time' },
                          updatedAt: { type: 'string', format: 'date-time' }
                        }
                      }
                    }
                  }
                }
              }
            },
            '400': { description: 'Validation error' },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden' },
            '409': { description: 'Warehouse name already exists' }
          },
          security: [{ BearerAuth: [] }]
        },
        get: {
          tags: ['Warehouses'],
          summary: 'List warehouses (admin, stock_keeper)',
          responses: {
            '200': {
              description: 'OK',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      warehouses: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'string', format: 'uuid' },
                            name: { type: 'string' },
                            location: { type: 'string' },
                            type: { type: 'string', enum: ['central', 'stock'] },
                            createdAt: { type: 'string', format: 'date-time' },
                            updatedAt: { type: 'string', format: 'date-time' }
                          }
                        }
                      }
                    }
                  }
                }
              }
            },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden' }
          },
          security: [{ BearerAuth: [] }]
        }
      },
      '/warehouses/{id}': {
        get: {
          tags: ['Warehouses'],
          summary: 'Get warehouse by ID (admin, stock_keeper)',
          parameters: [
            { in: 'path', name: 'id', schema: { type: 'string', format: 'uuid' }, required: true }
          ],
          responses: {
            '200': {
              description: 'OK',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      warehouse: {
                        type: 'object',
                        properties: {
                          id: { type: 'string', format: 'uuid' },
                          name: { type: 'string' },
                          location: { type: 'string' },
                          type: { type: 'string', enum: ['central', 'stock'] },
                          createdAt: { type: 'string', format: 'date-time' },
                          updatedAt: { type: 'string', format: 'date-time' }
                        }
                      }
                    }
                  }
                }
              }
            },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden' },
            '404': { description: 'Warehouse not found' }
          },
          security: [{ BearerAuth: [] }]
        },
        put: {
          tags: ['Warehouses'],
          summary: 'Update warehouse (admin only) - Partial update supported',
          description: 'Update one or more fields of a warehouse. At least one field must be provided.',
          parameters: [
            { in: 'path', name: 'id', schema: { type: 'string', format: 'uuid' }, required: true }
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string', description: 'Warehouse name (optional)' },
                    location: { type: 'string', description: 'Warehouse location (optional)' },
                    type: { type: 'string', enum: ['central', 'stock'], description: 'Warehouse type (optional)' }
                  },
                  minProperties: 1
                }
              }
            }
          },
          responses: {
            '200': {
              description: 'Updated',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      warehouse: {
                        type: 'object',
                        properties: {
                          id: { type: 'string', format: 'uuid' },
                          name: { type: 'string' },
                          location: { type: 'string' },
                          type: { type: 'string', enum: ['central', 'stock'] },
                          createdAt: { type: 'string', format: 'date-time' },
                          updatedAt: { type: 'string', format: 'date-time' }
                        }
                      }
                    }
                  }
                }
              }
            },
            '400': { description: 'Validation error' },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden' },
            '404': { description: 'Warehouse not found' },
            '409': { description: 'Warehouse name already exists' }
          },
          security: [{ BearerAuth: [] }]
        },
        delete: {
          tags: ['Warehouses'],
          summary: 'Delete warehouse (admin only)',
          parameters: [
            { in: 'path', name: 'id', schema: { type: 'string', format: 'uuid' }, required: true }
          ],
          responses: {
            '204': { description: 'Deleted' },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden' },
            '404': { description: 'Warehouse not found' },
            '409': { description: 'Cannot delete warehouse with related records' }
          },
          security: [{ BearerAuth: [] }]
        }
      },
      '/branches': {
        post: {
          tags: ['Branches'],
          summary: 'Create branch (admin only)',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name', 'location', 'warehouseId'],
                  properties: {
                    name: { type: 'string' },
                    location: { type: 'string' },
                    warehouseId: { type: 'string', format: 'uuid' }
                  }
                }
              }
            }
          },
          responses: {
            '201': {
              description: 'Created',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string' },
                      branch: {
                        type: 'object',
                        properties: {
                          id: { type: 'string', format: 'uuid' },
                          name: { type: 'string' },
                          location: { type: 'string' },
                          warehouseId: { type: 'string', format: 'uuid' },
                          createdAt: { type: 'string', format: 'date-time' },
                          updatedAt: { type: 'string', format: 'date-time' },
                          Warehouse: {
                            type: 'object',
                            properties: {
                              id: { type: 'string', format: 'uuid' },
                              name: { type: 'string' },
                              location: { type: 'string' },
                              type: { type: 'string', enum: ['central', 'stock'] }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            },
            '400': { description: 'Validation error' },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden' },
            '404': { description: 'Warehouse not found' },
            '409': { description: 'Branch with this name already exists for this warehouse' }
          },
          security: [{ BearerAuth: [] }]
        },
        get: {
          tags: ['Branches'],
          summary: 'List branches (admin only)',
          responses: {
            '200': {
              description: 'OK',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      branches: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'string', format: 'uuid' },
                            name: { type: 'string' },
                            location: { type: 'string' },
                            warehouseId: { type: 'string', format: 'uuid' },
                            createdAt: { type: 'string', format: 'date-time' },
                            updatedAt: { type: 'string', format: 'date-time' },
                            Warehouse: {
                              type: 'object',
                              properties: {
                                id: { type: 'string', format: 'uuid' },
                                name: { type: 'string' },
                                location: { type: 'string' },
                                type: { type: 'string', enum: ['central', 'stock'] }
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
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden' }
          },
          security: [{ BearerAuth: [] }]
        }
      },
      '/branches/{id}': {
        get: {
          tags: ['Branches'],
          summary: 'Get branch by ID (admin only)',
          parameters: [
            { in: 'path', name: 'id', schema: { type: 'string', format: 'uuid' }, required: true }
          ],
          responses: {
            '200': {
              description: 'OK',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      branch: {
                        type: 'object',
                        properties: {
                          id: { type: 'string', format: 'uuid' },
                          name: { type: 'string' },
                          location: { type: 'string' },
                          warehouseId: { type: 'string', format: 'uuid' },
                          createdAt: { type: 'string', format: 'date-time' },
                          updatedAt: { type: 'string', format: 'date-time' },
                          Warehouse: {
                            type: 'object',
                            properties: {
                              id: { type: 'string', format: 'uuid' },
                              name: { type: 'string' },
                              location: { type: 'string' },
                              type: { type: 'string', enum: ['central', 'stock'] }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden' },
            '404': { description: 'Branch not found' }
          },
          security: [{ BearerAuth: [] }]
        },
        put: {
          tags: ['Branches'],
          summary: 'Update branch (admin only)',
          parameters: [
            { in: 'path', name: 'id', schema: { type: 'string', format: 'uuid' }, required: true }
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    location: { type: 'string' },
                    warehouseId: { type: 'string', format: 'uuid' }
                  }
                }
              }
            }
          },
          responses: {
            '200': {
              description: 'Updated',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string' },
                      branch: {
                        type: 'object',
                        properties: {
                          id: { type: 'string', format: 'uuid' },
                          name: { type: 'string' },
                          location: { type: 'string' },
                          warehouseId: { type: 'string', format: 'uuid' },
                          createdAt: { type: 'string', format: 'date-time' },
                          updatedAt: { type: 'string', format: 'date-time' },
                          Warehouse: {
                            type: 'object',
                            properties: {
                              id: { type: 'string', format: 'uuid' },
                              name: { type: 'string' },
                              location: { type: 'string' },
                              type: { type: 'string', enum: ['central', 'stock'] }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            },
            '400': { description: 'Validation error' },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden' },
            '404': { description: 'Branch or Warehouse not found' },
            '409': { description: 'Branch with this name already exists for this warehouse' }
          },
          security: [{ BearerAuth: [] }]
        },
        delete: {
          tags: ['Branches'],
          summary: 'Delete branch (admin only)',
          parameters: [
            { in: 'path', name: 'id', schema: { type: 'string', format: 'uuid' }, required: true }
          ],
          responses: {
            '200': {
              description: 'Deleted',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string' }
                    }
                  }
                }
              }
            },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden' },
            '404': { description: 'Branch not found' }
          },
          security: [{ BearerAuth: [] }]
        }
      },
      '/transfer': {
        post: {
          tags: ['Transfers'],
          summary: 'Create and execute stock transfer (admin, stock_keeper)',
          description: 'Creates and immediately executes a stock transfer between warehouses and/or branches. Supports both single product and multiple products transfers with optional specific serial selection.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  oneOf: [
                    {
                      type: 'object',
                      title: 'Single Product Transfer (Legacy Format)',
                      required: ['productId', 'quantity', 'fromLocationType', 'fromLocationId', 'toLocationType', 'toLocationId'],
                      properties: {
                        productId: { type: 'string', format: 'uuid', description: 'Product ID to transfer' },
                        quantity: { type: 'integer', minimum: 1, description: 'Quantity to transfer' },
                        fromLocationType: { type: 'string', enum: ['warehouse', 'branch'] },
                        fromLocationId: { type: 'string', format: 'uuid' },
                        toLocationType: { type: 'string', enum: ['warehouse', 'branch'] },
                        toLocationId: { type: 'string', format: 'uuid' },
                        notes: { type: 'string', description: 'Optional transfer notes' }
                      },
                      examples: {
                        singleProductTransfer: {
                          summary: 'Single product transfer from warehouse to branch',
                          description: 'Transfer 5 units of a product from warehouse to branch with random serial selection',
                          value: {
                            productId: '123e4567-e89b-12d3-a456-426614174000',
                            quantity: 5,
                            fromLocationType: 'warehouse',
                            fromLocationId: '123e4567-e89b-12d3-a456-426614174001',
                            toLocationType: 'branch',
                            toLocationId: '123e4567-e89b-12d3-a456-426614174002',
                            notes: 'Transfer to branch for customer order'
                          }
                        },
                        warehouseToWarehouse: {
                          summary: 'Warehouse to warehouse transfer',
                          description: 'Transfer products between different warehouses',
                          value: {
                            productId: '123e4567-e89b-12d3-a456-426614174003',
                            quantity: 10,
                            fromLocationType: 'warehouse',
                            fromLocationId: '123e4567-e89b-12d3-a456-426614174001',
                            toLocationType: 'warehouse',
                            toLocationId: '123e4567-e89b-12d3-a456-426614174004',
                            notes: 'Redistribute inventory between warehouses'
                          }
                        },
                        branchToWarehouse: {
                          summary: 'Branch to warehouse return',
                          description: 'Return unsold products from branch back to warehouse',
                          value: {
                            productId: '123e4567-e89b-12d3-a456-426614174005',
                            quantity: 3,
                            fromLocationType: 'branch',
                            fromLocationId: '123e4567-e89b-12d3-a456-426614174002',
                            toLocationType: 'warehouse',
                            toLocationId: '123e4567-e89b-12d3-a456-426614174001',
                            notes: 'Return unsold seasonal items'
                          }
                        }
                      }
                    },
                    {
                      type: 'object',
                      title: 'Multiple Products Transfer (New Format)',
                      required: ['items', 'fromLocationType', 'fromLocationId', 'toLocationType', 'toLocationId'],
                      properties: {
                        items: {
                          type: 'array',
                          minItems: 1,
                          items: {
                            type: 'object',
                            required: ['productId', 'quantity'],
                            properties: {
                              productId: { type: 'string', format: 'uuid' },
                              quantity: { type: 'integer', minimum: 1 },
                              selectedSerials: {
                                type: 'array',
                                items: { type: 'string', format: 'uuid' },
                                description: 'Required when selectSpecificSerials is true'
                              }
                            }
                          }
                        },
                        selectSpecificSerials: { 
                          type: 'boolean', 
                          default: false,
                          description: 'If true, specific serials must be provided for each item'
                        },
                        fromLocationType: { type: 'string', enum: ['warehouse', 'branch'] },
                        fromLocationId: { type: 'string', format: 'uuid' },
                        toLocationType: { type: 'string', enum: ['warehouse', 'branch'] },
                        toLocationId: { type: 'string', format: 'uuid' },
                        notes: { type: 'string', description: 'Optional transfer notes' }
                      },
                      examples: {
                        randomSerials: {
                          summary: 'Transfer multiple products with random serials',
                          description: 'Transfer multiple different products from warehouse to branch, selecting random available serials for each product',
                          value: {
                            items: [
                              {
                                productId: '123e4567-e89b-12d3-a456-426614174000',
                                quantity: 3
                              },
                              {
                                productId: '123e4567-e89b-12d3-a456-426614174003',
                                quantity: 2
                              }
                            ],
                            selectSpecificSerials: false,
                            fromLocationType: 'warehouse',
                            fromLocationId: '123e4567-e89b-12d3-a456-426614174001',
                            toLocationType: 'branch',
                            toLocationId: '123e4567-e89b-12d3-a456-426614174002',
                            notes: 'Bulk transfer to branch for new season'
                          }
                        },
                        specificSerials: {
                          summary: 'Transfer multiple products with specific serials',
                          description: 'Transfer specific serial numbers for quality control or customer requirements',
                          value: {
                            items: [
                              {
                                productId: '123e4567-e89b-12d3-a456-426614174000',
                                quantity: 2,
                                selectedSerials: [
                                  '123e4567-e89b-12d3-a456-426614174010',
                                  '123e4567-e89b-12d3-a456-426614174011'
                                ]
                              },
                              {
                                productId: '123e4567-e89b-12d3-a456-426614174003',
                                quantity: 1,
                                selectedSerials: [
                                  '123e4567-e89b-12d3-a456-426614174012'
                                ]
                              }
                            ],
                            selectSpecificSerials: true,
                            fromLocationType: 'warehouse',
                            fromLocationId: '123e4567-e89b-12d3-a456-426614174001',
                            toLocationType: 'branch',
                            toLocationId: '123e4567-e89b-12d3-a456-426614174002',
                            notes: 'Specific serial transfer for quality control'
                          }
                        },
                        largeBulkTransfer: {
                          summary: 'Large bulk transfer with many products',
                          description: 'Transfer many different products in one operation for store opening or restocking',
                          value: {
                            items: [
                              {
                                productId: '123e4567-e89b-12d3-a456-426614174000',
                                quantity: 10
                              },
                              {
                                productId: '123e4567-e89b-12d3-a456-426614174001',
                                quantity: 5
                              },
                              {
                                productId: '123e4567-e89b-12d3-a456-426614174002',
                                quantity: 8
                              },
                              {
                                productId: '123e4567-e89b-12d3-a456-426614174003',
                                quantity: 3
                              },
                              {
                                productId: '123e4567-e89b-12d3-a456-426614174004',
                                quantity: 12
                              }
                            ],
                            selectSpecificSerials: false,
                            fromLocationType: 'warehouse',
                            fromLocationId: '123e4567-e89b-12d3-a456-426614174001',
                            toLocationType: 'branch',
                            toLocationId: '123e4567-e89b-12d3-a456-426614174002',
                            notes: 'Complete store restocking for new branch opening'
                          }
                        },
                        mixedTransfer: {
                          summary: 'Mixed transfer with some specific and some random serials',
                          description: 'Transfer where some products have specific serials selected and others use random selection',
                          value: {
                            items: [
                              {
                                productId: '123e4567-e89b-12d3-a456-426614174000',
                                quantity: 2,
                                selectedSerials: [
                                  '123e4567-e89b-12d3-a456-426614174010',
                                  '123e4567-e89b-12d3-a456-426614174011'
                                ]
                              },
                              {
                                productId: '123e4567-e89b-12d3-a456-426614174001',
                                quantity: 5
                              }
                            ],
                            selectSpecificSerials: true,
                            fromLocationType: 'warehouse',
                            fromLocationId: '123e4567-e89b-12d3-a456-426614174001',
                            toLocationType: 'branch',
                            toLocationId: '123e4567-e89b-12d3-a456-426614174002',
                            notes: 'Mixed transfer - specific high-value items, random for others'
                          }
                        }
                      }
                    }
                  ]
                }
              }
            }
          },
          responses: {
            '201': {
              description: 'Transfer created and executed successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string' },
                      transferredSerials: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            productId: { type: 'string', format: 'uuid' },
                            productName: { type: 'string' },
                            quantity: { type: 'integer' },
                            serials: {
                              type: 'array',
                              items: {
                                type: 'object',
                                properties: {
                                  id: { type: 'string', format: 'uuid' },
                                  serialCode: { type: 'string' },
                                  note: { type: 'string', nullable: true }
                                }
                              }
                            }
                          }
                        }
                      },
                      transfer: {
                        type: 'object',
                        properties: {
                          id: { type: 'string', format: 'uuid' },
                          productId: { type: 'string', format: 'uuid', nullable: true },
                          quantity: { type: 'integer', nullable: true },
                          selectSpecificSerials: { type: 'boolean' },
                          fromLocationType: { type: 'string', enum: ['warehouse', 'branch'] },
                          fromLocationId: { type: 'string', format: 'uuid' },
                          toLocationType: { type: 'string', enum: ['warehouse', 'branch'] },
                          toLocationId: { type: 'string', format: 'uuid' },
                          status: { type: 'string', enum: ['pending', 'completed', 'cancelled'] },
                          requestedBy: { type: 'string', format: 'uuid' },
                          notes: { type: 'string', nullable: true },
                          createdAt: { type: 'string', format: 'date-time' },
                          updatedAt: { type: 'string', format: 'date-time' },
                          Product: {
                            type: 'object',
                            nullable: true,
                            properties: {
                              id: { type: 'string', format: 'uuid' },
                              name: { type: 'string' },
                              sku: { type: 'string' },
                              barcode: { type: 'string', nullable: true }
                            }
                          },
                          Requester: {
                            type: 'object',
                            properties: {
                              id: { type: 'string', format: 'uuid' },
                              name: { type: 'string' },
                              email: { type: 'string' }
                            }
                          },
                          TransferItems: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                id: { type: 'string', format: 'uuid' },
                                transferId: { type: 'string', format: 'uuid' },
                                productId: { type: 'string', format: 'uuid' },
                                quantity: { type: 'integer' },
                                selectedSerials: { type: 'array', items: { type: 'string', format: 'uuid' }, nullable: true },
                                createdAt: { type: 'string', format: 'date-time' },
                                updatedAt: { type: 'string', format: 'date-time' },
                                Product: {
                                  type: 'object',
                                  properties: {
                                    id: { type: 'string', format: 'uuid' },
                                    name: { type: 'string' },
                                    sku: { type: 'string' },
                                    barcode: { type: 'string', nullable: true }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  },
                  examples: {
                    singleProductResponse: {
                      summary: 'Single product transfer response',
                      description: 'Response for a single product transfer from warehouse to branch',
                      value: {
                        message: 'Stock transfer completed successfully',
                        transferredSerials: [
                          {
                            productId: '123e4567-e89b-12d3-a456-426614174000',
                            productName: 'Men\'s Black T-Shirt',
                            quantity: 5,
                            serials: [
                              {
                                id: '987e6543-e21b-12d3-a456-426614174010',
                                serialCode: '2000000000001',
                                note: null
                              },
                              {
                                id: '987e6543-e21b-12d3-a456-426614174011',
                                serialCode: '2000000000002',
                                note: null
                              },
                              {
                                id: '987e6543-e21b-12d3-a456-426614174012',
                                serialCode: '2000000000003',
                                note: null
                              },
                              {
                                id: '987e6543-e21b-12d3-a456-426614174013',
                                serialCode: '2000000000004',
                                note: null
                              },
                              {
                                id: '987e6543-e21b-12d3-a456-426614174014',
                                serialCode: '2000000000005',
                                note: null
                              }
                            ]
                          }
                        ],
                        transfer: {
                          id: '456e7890-e89b-12d3-a456-426614174000',
                          productId: '123e4567-e89b-12d3-a456-426614174000',
                          quantity: 5,
                          selectSpecificSerials: false,
                          fromLocationType: 'warehouse',
                          fromLocationId: '123e4567-e89b-12d3-a456-426614174001',
                          toLocationType: 'branch',
                          toLocationId: '123e4567-e89b-12d3-a456-426614174002',
                          status: 'completed',
                          requestedBy: '789e0123-e89b-12d3-a456-426614174000',
                          notes: 'Transfer to branch for customer order',
                          createdAt: '2025-01-15T10:30:00.000Z',
                          updatedAt: '2025-01-15T10:30:00.000Z',
                          Product: {
                            id: '123e4567-e89b-12d3-a456-426614174000',
                            name: 'Men\'s Black T-Shirt',
                            sku: 'CL-TSH-L-BLK-001',
                            barcode: '1234567890123'
                          },
                          Requester: {
                            id: '789e0123-e89b-12d3-a456-426614174000',
                            name: 'John Smith',
                            email: 'john.smith@company.com'
                          },
                          TransferItems: []
                        }
                      }
                    },
                    multipleProductsResponse: {
                      summary: 'Multiple products transfer response',
                      description: 'Response for a multiple products transfer with specific serials',
                      value: {
                        message: 'Stock transfer completed successfully',
                        transferredSerials: [
                          {
                            productId: '123e4567-e89b-12d3-a456-426614174000',
                            productName: 'Men\'s Black T-Shirt',
                            quantity: 2,
                            serials: [
                              {
                                id: '987e6543-e21b-12d3-a456-426614174010',
                                serialCode: '2000000000001',
                                note: null
                              },
                              {
                                id: '987e6543-e21b-12d3-a456-426614174011',
                                serialCode: '2000000000002',
                                note: null
                              }
                            ]
                          },
                          {
                            productId: '123e4567-e89b-12d3-a456-426614174003',
                            productName: 'Women\'s Blue Jeans',
                            quantity: 1,
                            serials: [
                              {
                                id: '987e6543-e21b-12d3-a456-426614174012',
                                serialCode: '2000000000003',
                                note: null
                              }
                            ]
                          }
                        ],
                        transfer: {
                          id: '456e7890-e89b-12d3-a456-426614174001',
                          productId: null,
                          quantity: null,
                          selectSpecificSerials: true,
                          fromLocationType: 'warehouse',
                          fromLocationId: '123e4567-e89b-12d3-a456-426614174001',
                          toLocationType: 'branch',
                          toLocationId: '123e4567-e89b-12d3-a456-426614174002',
                          status: 'completed',
                          requestedBy: '789e0123-e89b-12d3-a456-426614174000',
                          notes: 'Specific serial transfer for quality control',
                          createdAt: '2025-01-15T10:30:00.000Z',
                          updatedAt: '2025-01-15T10:30:00.000Z',
                          Product: null,
                          Requester: {
                            id: '789e0123-e89b-12d3-a456-426614174000',
                            name: 'John Smith',
                            email: 'john.smith@company.com'
                          },
                          TransferItems: [
                            {
                              id: '111e2222-e89b-12d3-a456-426614174000',
                              transferId: '456e7890-e89b-12d3-a456-426614174001',
                              productId: '123e4567-e89b-12d3-a456-426614174000',
                              quantity: 2,
                              selectedSerials: [
                                '987e6543-e21b-12d3-a456-426614174010',
                                '987e6543-e21b-12d3-a456-426614174011'
                              ],
                              createdAt: '2025-01-15T10:30:00.000Z',
                              updatedAt: '2025-01-15T10:30:00.000Z',
                              Product: {
                                id: '123e4567-e89b-12d3-a456-426614174000',
                                name: 'Men\'s Black T-Shirt',
                                sku: 'CL-TSH-L-BLK-001',
                                barcode: '1234567890123'
                              }
                            },
                            {
                              id: '222e3333-e89b-12d3-a456-426614174000',
                              transferId: '456e7890-e89b-12d3-a456-426614174001',
                              productId: '123e4567-e89b-12d3-a456-426614174003',
                              quantity: 1,
                              selectedSerials: [
                                '987e6543-e21b-12d3-a456-426614174012'
                              ],
                              createdAt: '2025-01-15T10:30:00.000Z',
                              updatedAt: '2025-01-15T10:30:00.000Z',
                              Product: {
                                id: '123e4567-e89b-12d3-a456-426614174003',
                                name: 'Women\'s Blue Jeans',
                                sku: 'CL-JNS-W-BLU-001',
                                barcode: '1234567890124'
                              }
                            }
                          ]
                        }
                      }
                    }
                  }
                }
              }
            },
            '400': { 
              description: 'Validation error, insufficient quantity, or insufficient available serials',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: {
                        type: 'string',
                        examples: [
                          'Either provide single product fields (productId, quantity) or multiple products (items array)',
                          'Cannot provide both single product fields and items array. Use one format only.',
                          'fromLocationType, fromLocationId, toLocationType, and toLocationId are required',
                          'fromLocationType and toLocationType must be either "warehouse" or "branch"',
                          'Cannot transfer to the same location',
                          'Product not found',
                          'From warehouse not found',
                          'To branch not found',
                          'Product Men\'s Black T-Shirt not found in source warehouse',
                          'Insufficient quantity for Men\'s Black T-Shirt. Available: 5, Requested: 10',
                          'When selectSpecificSerials is true, each item must have productId, quantity, and selectedSerials array',
                          'Item for product 123e4567-e89b-12d3-a456-426614174000: selectedSerials length (2) must match quantity (3)',
                          'Each item must have productId and quantity',
                          'Quantity must be greater than 0 for all items',
                          'Not all selected serials are available for Men\'s Black T-Shirt. Found: 2, Expected: 3',
                          'Insufficient available serials for Men\'s Black T-Shirt. Available: 5, Requested: 10'
                        ]
                      },
                      productName: {
                        type: 'string',
                        description: 'Product name (returned in validation errors)',
                        example: 'Men\'s Black T-Shirt'
                      },
                      availableQuantity: {
                        type: 'integer',
                        description: 'Available quantity (returned in insufficient quantity errors)',
                        example: 5
                      },
                      requestedQuantity: {
                        type: 'integer',
                        description: 'Requested quantity (returned in insufficient quantity errors)',
                        example: 10
                      },
                      availableSerials: {
                        type: 'integer',
                        description: 'Available serials count (returned in serial validation errors)',
                        example: 5
                      },
                      requestedSerials: {
                        type: 'integer',
                        description: 'Requested serials count (returned in serial validation errors)',
                        example: 10
                      }
                    }
                  },
                  examples: {
                    validationError: {
                      summary: 'Validation error example',
                      description: 'Error when required fields are missing or invalid',
                      value: {
                        message: 'fromLocationType, fromLocationId, toLocationType, and toLocationId are required'
                      }
                    },
                    insufficientQuantity: {
                      summary: 'Insufficient quantity error',
                      description: 'Error when trying to transfer more quantity than available',
                      value: {
                        message: 'Insufficient quantity for Men\'s Black T-Shirt. Available: 5, Requested: 10',
                        productName: 'Men\'s Black T-Shirt',
                        availableQuantity: 5,
                        requestedQuantity: 10
                      }
                    },
                    insufficientSerials: {
                      summary: 'Insufficient serials error',
                      description: 'Error when trying to transfer more serials than available',
                      value: {
                        message: 'Insufficient available serials for Men\'s Black T-Shirt. Available: 5, Requested: 10',
                        productName: 'Men\'s Black T-Shirt',
                        availableSerials: 5,
                        requestedSerials: 10
                      }
                    },
                    specificSerialsValidation: {
                      summary: 'Specific serials validation error',
                      description: 'Error when selectedSerials length doesn\'t match quantity',
                      value: {
                        message: 'Item for product 123e4567-e89b-12d3-a456-426614174000: selectedSerials length (2) must match quantity (3)'
                      }
                    },
                    sameLocationError: {
                      summary: 'Same location transfer error',
                      description: 'Error when trying to transfer to the same location',
                      value: {
                        message: 'Cannot transfer to the same location'
                      }
                    }
                  }
                }
              }
            },
            '401': { 
              description: 'Unauthorized - Missing or invalid authentication token',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: {
                        type: 'string',
                        example: 'Access denied. No token provided.'
                      }
                    }
                  }
                }
              }
            },
            '403': { 
              description: 'Forbidden - Insufficient permissions',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: {
                        type: 'string',
                        example: 'Access denied. Admin or Stock Keeper role required.'
                      }
                    }
                  }
                }
              }
            },
            '404': { 
              description: 'Not found - Product or location not found',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: {
                        type: 'string',
                        examples: [
                          'Product not found',
                          'From warehouse not found',
                          'To branch not found',
                          'Product Men\'s Black T-Shirt not found in source warehouse'
                        ]
                      }
                    }
                  }
                }
              }
            },
            '500': { 
              description: 'Internal server error',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: {
                        type: 'string',
                        example: 'Internal server error'
                      }
                    }
                  }
                }
              }
            }
          },
          security: [{ BearerAuth: [] }]
        },
        get: {
          tags: ['Transfers'],
          summary: 'List stock transfers (admin, stock_keeper)',
          description: 'Get paginated list of stock transfers with optional filtering',
          parameters: [
            { in: 'query', name: 'page', schema: { type: 'integer', default: 1 }, description: 'Page number' },
            { in: 'query', name: 'limit', schema: { type: 'integer', default: 50 }, description: 'Items per page' },
            { in: 'query', name: 'status', schema: { type: 'string', enum: ['pending', 'completed', 'cancelled'] }, description: 'Filter by status' },
            { in: 'query', name: 'productId', schema: { type: 'string', format: 'uuid' }, description: 'Filter by product ID' }
          ],
          responses: {
            '200': {
              description: 'OK',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      transfers: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'string', format: 'uuid' },
                            productId: { type: 'string', format: 'uuid' },
                            quantity: { type: 'integer' },
                            fromLocationType: { type: 'string', enum: ['warehouse', 'branch'] },
                            fromLocationId: { type: 'string', format: 'uuid' },
                            toLocationType: { type: 'string', enum: ['warehouse', 'branch'] },
                            toLocationId: { type: 'string', format: 'uuid' },
                            status: { type: 'string', enum: ['pending', 'completed', 'cancelled'] },
                            requestedBy: { type: 'string', format: 'uuid' },
                            notes: { type: 'string', nullable: true },
                            createdAt: { type: 'string', format: 'date-time' },
                            updatedAt: { type: 'string', format: 'date-time' },
                            Product: {
                              type: 'object',
                              properties: {
                                id: { type: 'string', format: 'uuid' },
                                name: { type: 'string' },
                                sku: { type: 'string' },
                                barcode: { type: 'string', nullable: true }
                              }
                            },
                            Requester: {
                              type: 'object',
                              properties: {
                                id: { type: 'string', format: 'uuid' },
                                name: { type: 'string' },
                                email: { type: 'string' }
                              }
                            }
                          }
                        }
                      },
                      pagination: {
                        type: 'object',
                        properties: {
                          currentPage: { type: 'integer' },
                          totalPages: { type: 'integer' },
                          totalItems: { type: 'integer' },
                          itemsPerPage: { type: 'integer' }
                        }
                      }
                    }
                  }
                }
              }
            },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden' }
          },
          security: [{ BearerAuth: [] }]
        }
      },
      '/transfer/{id}': {
        get: {
          tags: ['Transfers'],
          summary: 'Get transfer by ID (admin, stock_keeper)',
          parameters: [
            { in: 'path', name: 'id', schema: { type: 'string', format: 'uuid' }, required: true }
          ],
          responses: {
            '200': {
              description: 'OK',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      transfer: {
                        type: 'object',
                        properties: {
                          id: { type: 'string', format: 'uuid' },
                          productId: { type: 'string', format: 'uuid' },
                          quantity: { type: 'integer' },
                          fromLocationType: { type: 'string', enum: ['warehouse', 'branch'] },
                          fromLocationId: { type: 'string', format: 'uuid' },
                          toLocationType: { type: 'string', enum: ['warehouse', 'branch'] },
                          toLocationId: { type: 'string', format: 'uuid' },
                          status: { type: 'string', enum: ['pending', 'completed', 'cancelled'] },
                          requestedBy: { type: 'string', format: 'uuid' },
                          notes: { type: 'string', nullable: true },
                          createdAt: { type: 'string', format: 'date-time' },
                          updatedAt: { type: 'string', format: 'date-time' },
                          Product: {
                            type: 'object',
                            properties: {
                              id: { type: 'string', format: 'uuid' },
                              name: { type: 'string' },
                              sku: { type: 'string' },
                              barcode: { type: 'string', nullable: true }
                            }
                          },
                          Requester: {
                            type: 'object',
                            properties: {
                              id: { type: 'string', format: 'uuid' },
                              name: { type: 'string' },
                              email: { type: 'string' }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden' },
            '404': { description: 'Transfer not found' }
          },
          security: [{ BearerAuth: [] }]
        }
      },
      '/products': {
        post: {
          tags: ['Products'],
          summary: 'Create product with SKU/barcode generation (admin, stock_keeper)',
          description: 'Creates a new product with automatic SKU generation, EAN-13 barcode, inventory record, and serial codes for each unit. Supports clothing and shoes with size specifications.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name', 'price', 'cost', 'categoryId', 'subCategoryId', 'gender', 'quantity'],
                  properties: {
                    name: {
                      type: 'string',
                      description: 'Product display name (e.g., "Men\'s Black Oversized Tee")',
                      example: 'Men\'s Black Oversized Tee'
                    },
                    price: {
                      type: 'number',
                      format: 'decimal',
                      description: 'Base selling price',
                      example: 29.99
                    },
                    cost: {
                      type: 'number',
                      format: 'decimal',
                      description: 'Product cost price',
                      example: 15.5
                    },
                    currency: {
                      type: 'string',
                      description: 'ISO 4217 three-letter currency code (optional)',
                      example: 'EGP',
                      minLength: 3,
                      maxLength: 3
                    },
                    categoryId: {
                      type: 'string',
                      format: 'uuid',
                      description: 'Category UUID from categories table',
                      example: '123e4567-e89b-12d3-a456-426614174000'
                    },
                    cost: {
                      type: 'number',
                      format: 'decimal',
                      description: 'Product cost price',
                      example: 15.5
                    },
                    subCategoryId: {
                      type: 'string',
                      format: 'uuid',
                      description: 'SubCategory UUID from subcategories table',
                      example: '123e4567-e89b-12d3-a456-426614174001'
                    },
                    size: {
                      type: 'string',
                      description: 'Size for clothing (S/M/L/XL) - optional for shoes',
                      example: 'L',
                      enum: ['XS', 'S', 'M', 'L', 'XL', 'XXL']
                    },
                    shoeSize: {
                      type: 'string',
                      description: 'Shoe size (40, 41, 42...) - optional for clothing',
                      example: '42'
                    },
                    color: {
                      type: 'string',
                      description: 'Product color (optional)',
                      example: 'Black'
                    },
                    gender: {
                      type: 'string',
                      enum: ['Men', 'Women', 'Unisex'],
                      description: 'Target gender',
                      example: 'Men'
                    },
                    warehouseId: {
                      type: 'string',
                      format: 'uuid',
                      description: 'Warehouse ID (defaults to central warehouse if not provided)',
                      example: '123e4567-e89b-12d3-a456-426614174002'
                    },
                    quantity: {
                      type: 'integer',
                      minimum: 1,
                      description: 'Number of units to create',
                      example: 50
                    }
                  }
                }
              }
            }
          },
          responses: {
            '201': {
              description: 'Product created successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      product: {
                        type: 'object',
                        properties: {
                          id: { type: 'string', format: 'uuid' },
                          name: { type: 'string' },
                          sku: { type: 'string', description: 'Auto-generated SKU (e.g., CL-TSH-L-BLK-001)' },
                          barcode: { type: 'string', description: 'EAN-13 scannable barcode for product identification (starts with 1)' },
                          price: { type: 'number' },
                          cost: { type: 'number' },
                          currency: { type: 'string' },
                          categoryId: { type: 'string', format: 'uuid' },
                          subCategoryId: { type: 'string', format: 'uuid' },
                          size: { type: 'string', nullable: true },
                          shoeSize: { type: 'string', nullable: true },
                          color: { type: 'string' },
                          gender: { type: 'string' },
                          createdAt: { type: 'string', format: 'date-time' },
                          updatedAt: { type: 'string', format: 'date-time' }
                        }
                      },
                      inventory: {
                        type: 'object',
                        properties: {
                          id: { type: 'string', format: 'uuid' },
                          productId: { type: 'string', format: 'uuid' },
                          warehouseId: { type: 'string', format: 'uuid' },
                          quantity: { type: 'integer' }
                        }
                      },
                      serials: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'string', format: 'uuid' },
                            serialCode: { type: 'string', description: 'EAN-13 scannable barcode for individual unit (starts with 2)' },
                            humanCode: { type: 'string', description: 'Human-readable serial code (e.g., CL-TSH-L-BLK-001-0001)' },
                            note: { type: 'string' },
                            warehouseId: { type: 'string', format: 'uuid' }
                          }
                        }
                      },
                      message: { type: 'string' }
                    }
                  }
                }
              }
            },
            '400': {
              description: 'Validation error',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string' }
                    }
                  }
                }
              }
            },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden' },
            '404': {
              description: 'Category, SubCategory, or Warehouse not found',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string' }
                    }
                  }
                }
              }
            },
            '500': {
              description: 'Internal server error',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string' }
                    }
                  }
                }
              }
            }
          },
          security: [{ BearerAuth: [] }]
        },
        get: {
          tags: ['Products'],
          summary: 'Get all products (admin, stock_keeper)',
          description: 'Retrieve all products with pagination, filtering, and inventory information. Includes category/subcategory details and stock quantities across warehouses and branches.',
          parameters: [
            {
              in: 'query',
              name: 'page',
              schema: { type: 'integer', minimum: 1, default: 1 },
              description: 'Page number for pagination'
            },
            {
              in: 'query',
              name: 'limit',
              schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
              description: 'Number of items per page'
            },
            {
              in: 'query',
              name: 'categoryId',
              schema: { type: 'string', format: 'uuid' },
              description: 'Filter by category ID'
            },
            {
              in: 'query',
              name: 'subCategoryId',
              schema: { type: 'string', format: 'uuid' },
              description: 'Filter by subcategory ID'
            },
            {
              in: 'query',
              name: 'gender',
              schema: { type: 'string', enum: ['Men', 'Women', 'Unisex'] },
              description: 'Filter by gender'
            },
            {
              in: 'query',
              name: 'color',
              schema: { type: 'string' },
              description: 'Filter by color'
            }
          ],
          responses: {
            '200': {
              description: 'Products retrieved successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      products: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'string', format: 'uuid' },
                            name: { type: 'string' },
                            sku: { type: 'string' },
                            barcode: { type: 'string' },
                            price: { type: 'number' },
                            cost: { type: 'number' },
                            currency: { type: 'string' },
                            category: {
                              type: 'object',
                              nullable: true,
                              properties: {
                                id: { type: 'string', format: 'uuid' },
                                name: { type: 'string' }
                              }
                            },
                            subCategory: {
                              type: 'object',
                              nullable: true,
                              properties: {
                                id: { type: 'string', format: 'uuid' },
                                name: { type: 'string' }
                              }
                            },
                            size: { type: 'string', nullable: true },
                            shoeSize: { type: 'string', nullable: true },
                            color: { type: 'string', nullable: true },
                            gender: { type: 'string' },
                            totalQuantity: { type: 'integer', description: 'Total quantity across all warehouses/branches' },
                            inventory: {
                              type: 'array',
                              items: {
                                type: 'object',
                                properties: {
                                  id: { type: 'string', format: 'uuid' },
                                  warehouse: {
                                    type: 'object',
                                    nullable: true,
                                    properties: {
                                      id: { type: 'string', format: 'uuid' },
                                      name: { type: 'string' },
                                      type: { type: 'string', enum: ['central', 'stock'] }
                                    }
                                  },
                                  branch: {
                                    type: 'object',
                                    nullable: true,
                                    properties: {
                                      id: { type: 'string', format: 'uuid' },
                                      name: { type: 'string' }
                                    }
                                  },
                                  quantity: { type: 'integer' }
                                }
                              }
                            },
                            createdAt: { type: 'string', format: 'date-time' },
                            updatedAt: { type: 'string', format: 'date-time' }
                          }
                        }
                      },
                      pagination: {
                        type: 'object',
                        properties: {
                          currentPage: { type: 'integer' },
                          totalPages: { type: 'integer' },
                          totalItems: { type: 'integer' },
                          itemsPerPage: { type: 'integer' }
                        }
                      }
                    }
                  }
                }
              }
            },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden' },
            '500': {
              description: 'Internal server error',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string' }
                    }
                  }
                }
              }
            }
          },
          security: [{ BearerAuth: [] }]
        }
      },
      '/products/search': {
        get: {
          tags: ['Products'],
          summary: 'Search by barcode (product or serial) - all roles with branch filtering',
          description: 'Universal barcode search endpoint that automatically detects if the scanned code is a product barcode (starts with 1) or serial barcode (starts with 2). **Role-based filtering**: Admin and Stock Keeper can search globally across all locations, while Branch Manager and Cashier can only search within their assigned branch. Perfect for POS systems where cashiers scan any barcode.',
          parameters: [
            {
              in: 'query',
              name: 'code',
              required: true,
              schema: { type: 'string' },
              description: 'Barcode to search for. Product barcodes start with "1", serial barcodes start with "2"',
              examples: {
                productBarcode: {
                  summary: 'Product Barcode',
                  value: '1000000000017'
                },
                serialBarcode: {
                  summary: 'Serial Barcode',
                  value: '2000000000001'
                }
              }
            }
          ],
          responses: {
            '200': {
              description: 'Search successful',
              content: {
                'application/json': {
                  schema: {
                    oneOf: [
                      {
                        type: 'object',
                        description: 'Product search result',
                        properties: {
                          type: { type: 'string', enum: ['product'], example: 'product' },
                          product: {
                            type: 'object',
                            properties: {
                              id: { type: 'string', format: 'uuid' },
                              name: { type: 'string', example: 'Men\'s Black Tee' },
                              sku: { type: 'string', example: 'CL-TSH-L-BLK-001' },
                              barcode: { type: 'string', example: '1000000000017' },
                              price: { type: 'number', example: 29.99 },
                              cost: { type: 'number', example: 15.50 },
                              currency: { type: 'string', example: 'EGP' },
                              category: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } } },
                              subCategory: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } } },
                              size: { type: 'string', nullable: true },
                              shoeSize: { type: 'string', nullable: true },
                              color: { type: 'string' },
                              gender: { type: 'string' },
                              isPrinted: { type: 'boolean' },
                              availableInScope: { type: 'integer', description: 'Total available quantity in user\'s scope (branch or global)', example: 5 }
                            }
                          },
                          availableSerials: {
                            type: 'array',
                            description: 'List of available serials in user\'s scope',
                            items: {
                              type: 'object',
                              properties: {
                                id: { type: 'string', format: 'uuid' },
                                serialCode: { type: 'string', example: '2000000000001' },
                                humanCode: { type: 'string', example: 'CL-TSH-L-BLK-001-0001' },
                                isPrinted: { type: 'boolean' },
                                status: { type: 'string', enum: ['available'] },
                                location: {
                                  type: 'object',
                                  properties: {
                                    type: { type: 'string', enum: ['warehouse', 'branch'] },
                                    id: { type: 'string', format: 'uuid' },
                                    name: { type: 'string' },
                                    location: { type: 'string', nullable: true }
                                  }
                                }
                              }
                            }
                          },
                          scope: { type: 'string', enum: ['branch', 'global'], description: 'Search scope based on user role' },
                          branchId: { type: 'string', format: 'uuid', nullable: true, description: 'Branch ID if scope is branch' }
                        }
                      },
                      {
                        type: 'object',
                        description: 'Serial search result (available)',
                        properties: {
                          type: { type: 'string', enum: ['serial'], example: 'serial' },
                          serial: {
                            type: 'object',
                            properties: {
                              id: { type: 'string', format: 'uuid' },
                              serialCode: { type: 'string', example: '2000000000001' },
                              humanCode: { type: 'string', example: 'CL-TSH-L-BLK-001-0001' },
                              status: { type: 'string', enum: ['available', 'sold'], example: 'available' },
                              isPrinted: { type: 'boolean' },
                              batchId: { type: 'string', format: 'uuid', nullable: true }
                            }
                          },
                          product: {
                            type: 'object',
                            description: 'Product information for this serial',
                            properties: {
                              id: { type: 'string', format: 'uuid' },
                              name: { type: 'string' },
                              sku: { type: 'string' },
                              barcode: { type: 'string' },
                              price: { type: 'number' },
                              cost: { type: 'number' },
                              currency: { type: 'string' }
                            }
                          },
                          location: {
                            type: 'object',
                            description: 'Current location of this serial',
                            properties: {
                              type: { type: 'string', enum: ['warehouse', 'branch'] },
                              id: { type: 'string', format: 'uuid' },
                              name: { type: 'string' },
                              location: { type: 'string', nullable: true }
                            }
                          },
                          scope: { type: 'string', enum: ['branch', 'global'] },
                          branchId: { type: 'string', format: 'uuid', nullable: true }
                        }
                      },
                      {
                        type: 'object',
                        description: 'Serial search result (already sold)',
                        properties: {
                          type: { type: 'string', enum: ['serial'], example: 'serial' },
                          serial: { type: 'object' },
                          product: { type: 'object' },
                          location: { type: 'object' },
                          order: {
                            type: 'object',
                            description: 'Order information if serial was sold',
                            properties: {
                              id: { type: 'string', format: 'uuid' },
                              orderNumber: { type: 'string', example: 'ORD-123E4567' },
                              status: { type: 'string' },
                              soldAt: { type: 'string', format: 'date-time' }
                            }
                          },
                          error: { type: 'string', example: 'This item has already been sold' },
                          scope: { type: 'string', enum: ['branch', 'global'] },
                          branchId: { type: 'string', format: 'uuid', nullable: true }
                        }
                      }
                    ]
                  },
                  examples: {
                    productSearch: {
                      summary: 'Product Barcode Search',
                      description: 'Cashier scans product barcode and gets all available serials in their branch',
                      value: {
                        type: 'product',
                        product: {
                          id: '123e4567-e89b-12d3-a456-426614174001',
                          name: 'Men\'s Black Tee',
                          sku: 'CL-TSH-L-BLK-001',
                          barcode: '1000000000017',
                          price: 29.99,
                          cost: 15.50,
                          currency: 'EGP',
                          category: { id: 'cat-uuid', name: 'Clothing' },
                          subCategory: { id: 'subcat-uuid', name: 'T-Shirts' },
                          size: 'L',
                          color: 'Black',
                          gender: 'Men',
                          isPrinted: true,
                          availableInScope: 5
                        },
                        availableSerials: [
                          {
                            id: 'serial-uuid-1',
                            serialCode: '2000000000001',
                            humanCode: 'CL-TSH-L-BLK-001-0001',
                            isPrinted: true,
                            status: 'available',
                            location: {
                              type: 'branch',
                              id: 'branch-uuid',
                              name: 'Downtown Branch',
                              location: 'Main Street'
                            }
                          },
                          {
                            id: 'serial-uuid-2',
                            serialCode: '2000000000002',
                            humanCode: 'CL-TSH-L-BLK-001-0002',
                            isPrinted: true,
                            status: 'available',
                            location: {
                              type: 'branch',
                              id: 'branch-uuid',
                              name: 'Downtown Branch',
                              location: 'Main Street'
                            }
                          }
                        ],
                        scope: 'branch',
                        branchId: 'branch-uuid'
                      }
                    },
                    serialAvailable: {
                      summary: 'Serial Barcode Search (Available)',
                      description: 'Cashier scans serial barcode and item is available for sale',
                      value: {
                        type: 'serial',
                        serial: {
                          id: 'serial-uuid-1',
                          serialCode: '2000000000001',
                          humanCode: 'CL-TSH-L-BLK-001-0001',
                          status: 'available',
                          isPrinted: true,
                          batchId: 'batch-uuid'
                        },
                        product: {
                          id: 'product-uuid',
                          name: 'Men\'s Black Tee',
                          sku: 'CL-TSH-L-BLK-001',
                          barcode: '1000000000017',
                          price: 29.99,
                          cost: 15.50,
                          currency: 'EGP'
                        },
                        location: {
                          type: 'branch',
                          id: 'branch-uuid',
                          name: 'Downtown Branch',
                          location: 'Main Street'
                        },
                        scope: 'branch',
                        branchId: 'branch-uuid'
                      }
                    },
                    serialSold: {
                      summary: 'Serial Barcode Search (Already Sold)',
                      description: 'Cashier scans serial barcode but item was already sold',
                      value: {
                        type: 'serial',
                        serial: {
                          id: 'serial-uuid-1',
                          serialCode: '2000000000001',
                          humanCode: 'CL-TSH-L-BLK-001-0001',
                          status: 'sold',
                          isPrinted: true
                        },
                        product: {
                          id: 'product-uuid',
                          name: 'Men\'s Black Tee',
                          sku: 'CL-TSH-L-BLK-001',
                          price: 29.99
                        },
                        location: {
                          type: 'branch',
                          id: 'branch-uuid',
                          name: 'Downtown Branch'
                        },
                        order: {
                          id: 'order-uuid',
                          orderNumber: 'ORD-123E4567',
                          status: 'completed',
                          soldAt: '2025-10-09T10:30:00Z'
                        },
                        error: 'This item has already been sold',
                        scope: 'branch',
                        branchId: 'branch-uuid'
                      }
                    }
                  }
                }
              }
            },
            '400': {
              description: 'Bad request - missing or invalid barcode format',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: {
                        type: 'string',
                        examples: [
                          'code parameter is required',
                          'Invalid barcode format. Expected product barcode (starts with 1) or serial barcode (starts with 2)'
                        ]
                      },
                      providedCode: { type: 'string', description: 'The code that was provided' }
                    }
                  }
                }
              }
            },
            '401': {
              description: 'Unauthorized - Missing or invalid authentication token'
            },
            '403': {
              description: 'Forbidden - User not assigned to any branch (for branch manager/cashier roles)',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string', example: 'User not assigned to any branch' }
                    }
                  }
                }
              }
            },
            '404': {
              description: 'Not found - Product/serial not found or not in user\'s branch',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: {
                        type: 'string',
                        examples: [
                          'Product not found with this barcode',
                          'Serial not found with this barcode',
                          'Serial not found in your branch. It may exist in another location.'
                        ]
                      },
                      type: { type: 'string', enum: ['product', 'serial'] },
                      available: { type: 'boolean' }
                    }
                  }
                }
              }
            },
            '500': {
              description: 'Internal server error'
            }
          },
          security: [{ BearerAuth: [] }]
        }
      },
      '/products/branch/my-products': {
        get: {
          tags: ['Products'],
          summary: 'Get products in current user\'s branch (branch_manager, cashier)',
          description: 'Retrieve products available in the authenticated user\'s assigned branch. This endpoint is designed for cashiers and branch managers to only see inventory they have access to. Automatically filters products based on the user\'s branchId.',
          parameters: [
            {
              in: 'query',
              name: 'page',
              schema: { type: 'integer', minimum: 1, default: 1 },
              description: 'Page number for pagination'
            },
            {
              in: 'query',
              name: 'limit',
              schema: { type: 'integer', minimum: 1, maximum: 1000, default: 1000 },
              description: 'Number of items per page (default: 1000 for no pagination)'
            },
            {
              in: 'query',
              name: 'categoryId',
              schema: { type: 'string', format: 'uuid' },
              description: 'Filter by category ID'
            },
            {
              in: 'query',
              name: 'subCategoryId',
              schema: { type: 'string', format: 'uuid' },
              description: 'Filter by subcategory ID'
            },
            {
              in: 'query',
              name: 'gender',
              schema: { type: 'string', enum: ['Men', 'Women', 'Unisex', 'Kids'] },
              description: 'Filter by gender'
            },
            {
              in: 'query',
              name: 'color',
              schema: { type: 'string' },
              description: 'Filter by color'
            }
          ],
          responses: {
            '200': {
              description: 'Products retrieved successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      products: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'string', format: 'uuid' },
                            name: { type: 'string' },
                            sku: { type: 'string' },
                            barcode: { type: 'string' },
                            price: { type: 'number' },
                            cost: { type: 'number' },
                            currency: { type: 'string' },
                            category: {
                              type: 'object',
                              nullable: true,
                              properties: {
                                id: { type: 'string', format: 'uuid' },
                                name: { type: 'string' }
                              }
                            },
                            subCategory: {
                              type: 'object',
                              nullable: true,
                              properties: {
                                id: { type: 'string', format: 'uuid' },
                                name: { type: 'string' }
                              }
                            },
                            size: { type: 'string', nullable: true },
                            shoeSize: { type: 'string', nullable: true },
                            color: { type: 'string', nullable: true },
                            gender: { type: 'string' },
                            isPrinted: { type: 'boolean' },
                            totalQuantity: { type: 'integer', description: 'Total quantity in this branch only' },
                            inventory: {
                              type: 'array',
                              description: 'Inventory records for this branch only',
                              items: {
                                type: 'object',
                                properties: {
                                  id: { type: 'string', format: 'uuid' },
                                  branch: {
                                    type: 'object',
                                    nullable: true,
                                    properties: {
                                      id: { type: 'string', format: 'uuid' },
                                      name: { type: 'string' },
                                      location: { type: 'string' }
                                    }
                                  },
                                  quantity: { type: 'integer' }
                                }
                              }
                            },
                            createdAt: { type: 'string', format: 'date-time' },
                            updatedAt: { type: 'string', format: 'date-time' }
                          }
                        }
                      },
                      branch: {
                        type: 'object',
                        description: 'Information about the user\'s branch',
                        properties: {
                          id: { type: 'string', format: 'uuid', description: 'The branchId of the authenticated user' }
                        }
                      },
                      pagination: {
                        type: 'object',
                        properties: {
                          currentPage: { type: 'integer' },
                          totalPages: { type: 'integer' },
                          totalItems: { type: 'integer' },
                          itemsPerPage: { type: 'integer' }
                        }
                      }
                    }
                  }
                }
              }
            },
            '401': {
              description: 'Unauthorized - Missing or invalid authentication token',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string' }
                    }
                  }
                }
              }
            },
            '403': {
              description: 'Forbidden - User role not allowed or user not assigned to any branch',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string', example: 'User is not assigned to any branch' }
                    }
                  }
                }
              }
            },
            '500': {
              description: 'Internal server error',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string' }
                    }
                  }
                }
              }
            }
          },
          security: [{ BearerAuth: [] }]
        }
      },
      '/products/branch/{id}': {
        get: {
          tags: ['Products'],
          summary: 'Get specific product details for current user\'s branch (branch_manager, cashier)',
          description: 'Retrieve detailed information about a specific product including inventory and serial numbers, but ONLY for the authenticated user\'s assigned branch. This ensures branch staff only see data relevant to their location. Returns 404 if product is not available in the branch.',
          parameters: [
            {
              in: 'path',
              name: 'id',
              schema: { type: 'string', format: 'uuid' },
              required: true,
              description: 'Product UUID'
            }
          ],
          responses: {
            '200': {
              description: 'Product details retrieved successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      product: {
                        type: 'object',
                        properties: {
                          id: { type: 'string', format: 'uuid' },
                          name: { type: 'string' },
                          sku: { type: 'string' },
                          barcode: { type: 'string', description: 'EAN-13 product barcode' },
                          price: { type: 'number' },
                          cost: { type: 'number' },
                          currency: { type: 'string' },
                          category: {
                            type: 'object',
                            nullable: true,
                            properties: {
                              id: { type: 'string', format: 'uuid' },
                              name: { type: 'string' }
                            }
                          },
                          subCategory: {
                            type: 'object',
                            nullable: true,
                            properties: {
                              id: { type: 'string', format: 'uuid' },
                              name: { type: 'string' }
                            }
                          },
                          size: { type: 'string', nullable: true },
                          shoeSize: { type: 'string', nullable: true },
                          color: { type: 'string', nullable: true },
                          gender: { type: 'string' },
                          isPrinted: { type: 'boolean', description: 'Whether barcodes have been printed' },
                          totalQuantity: { type: 'integer', description: 'Total quantity in this branch only' },
                          inventory: {
                            type: 'array',
                            description: 'Inventory records for this branch only',
                            items: {
                              type: 'object',
                              properties: {
                                id: { type: 'string', format: 'uuid' },
                                branch: {
                                  type: 'object',
                                  nullable: true,
                                  properties: {
                                    id: { type: 'string', format: 'uuid' },
                                    name: { type: 'string' },
                                    location: { type: 'string' }
                                  }
                                },
                                quantity: { type: 'integer' }
                              }
                            }
                          },
                          serials: {
                            type: 'array',
                            description: 'All serial numbers for this product in this branch only',
                            items: {
                              type: 'object',
                              properties: {
                                id: { type: 'string', format: 'uuid' },
                                serialCode: { type: 'string', description: 'EAN-13 scannable barcode for individual unit' },
                                humanCode: { type: 'string', description: 'Human-readable serial code' },
                                note: { type: 'string' },
                                isPrinted: { type: 'boolean', description: 'Whether this serial barcode has been printed' },
                                batchId: { type: 'string', format: 'uuid', nullable: true, description: 'Batch ID for grouping serials created together' },
                                branch: {
                                  type: 'object',
                                  nullable: true,
                                  properties: {
                                    id: { type: 'string', format: 'uuid' },
                                    name: { type: 'string' }
                                  }
                                },
                                orderItemId: { type: 'string', format: 'uuid', nullable: true, description: 'Order item ID if this serial has been sold' },
                                createdAt: { type: 'string', format: 'date-time' },
                                updatedAt: { type: 'string', format: 'date-time' }
                              }
                            }
                          },
                          createdAt: { type: 'string', format: 'date-time' },
                          updatedAt: { type: 'string', format: 'date-time' }
                        }
                      },
                      branch: {
                        type: 'object',
                        description: 'Information about the user\'s branch',
                        properties: {
                          id: { type: 'string', format: 'uuid', description: 'The branchId of the authenticated user' }
                        }
                      }
                    }
                  }
                }
              }
            },
            '401': {
              description: 'Unauthorized - Missing or invalid authentication token',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string' }
                    }
                  }
                }
              }
            },
            '403': {
              description: 'Forbidden - User role not allowed or user not assigned to any branch',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string', example: 'User is not assigned to any branch' }
                    }
                  }
                }
              }
            },
            '404': {
              description: 'Product not found or not available in user\'s branch',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: {
                        type: 'string',
                        example: 'Product not available in your branch',
                        description: 'Could be "Product not found" if product doesn\'t exist, or "Product not available in your branch" if product exists but has no inventory in this branch'
                      }
                    }
                  }
                }
              }
            },
            '500': {
              description: 'Internal server error',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string' }
                    }
                  }
                }
              }
            }
          },
          security: [{ BearerAuth: [] }]
        }
      },
      '/customers': {
        post: {
          tags: ['Customers'],
          summary: 'Create customer (admin, branch_manager, cashier)',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name', 'phone'],
                  properties: {
                    name: { type: 'string', example: 'John Doe' },
                    phone: { type: 'string', example: '01001234567' }
                  }
                }
              }
            }
          },
          responses: {
            '201': {
              description: 'Customer created successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      customer: {
                        type: 'object',
                        properties: {
                          id: { type: 'string', format: 'uuid' },
                          name: { type: 'string' },
                          phone: { type: 'string' },
                          loyaltyPoints: { type: 'integer' },
                          createdAt: { type: 'string', format: 'date-time' },
                          updatedAt: { type: 'string', format: 'date-time' }
                        }
                      },
                      message: { type: 'string' }
                    }
                  }
                }
              }
            },
            '400': { description: 'Validation error' },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden' },
            '409': { description: 'A customer with this phone already exists' },
            '500': { description: 'Internal server error' }
          },
          security: [{ BearerAuth: [] }]
        },
        get: {
          tags: ['Customers'],
          summary: 'List customers (admin, branch_manager, cashier)',
          responses: {
            '200': {
              description: 'OK',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      customers: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'string', format: 'uuid' },
                            name: { type: 'string' },
                            phone: { type: 'string' },
                            loyaltyPoints: { type: 'integer' },
                            createdAt: { type: 'string', format: 'date-time' },
                            updatedAt: { type: 'string', format: 'date-time' }
                          }
                        }
                      }
                    }
                  }
                }
              }
            },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden' },
            '500': { description: 'Internal server error' }
          },
          security: [{ BearerAuth: [] }]
        }
      },
      '/customers/{id}': {
        get: {
          tags: ['Customers'],
          summary: 'Get customer by ID (admin, branch_manager, cashier)',
          parameters: [
            { in: 'path', name: 'id', schema: { type: 'string', format: 'uuid' }, required: true }
          ],
          responses: {
            '200': {
              description: 'OK',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      customer: {
                        type: 'object',
                        properties: {
                          id: { type: 'string', format: 'uuid' },
                          name: { type: 'string' },
                          phone: { type: 'string' },
                          loyaltyPoints: { type: 'integer' },
                          createdAt: { type: 'string', format: 'date-time' },
                          updatedAt: { type: 'string', format: 'date-time' }
                        }
                      }
                    }
                  }
                }
              }
            },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden' },
            '404': { description: 'Customer not found' },
            '500': { description: 'Internal server error' }
          },
          security: [{ BearerAuth: [] }]
        }
      },
      '/orders': {
        post: {
          tags: ['Orders'],
          summary: 'Create new order/sale (branch_manager, cashier)',
          description: 'Create a new order for a customer with multiple products. **Important**: Cashier must scan/select the specific serial numbers (barcodes) of the actual physical items being sold. The system validates each serial, reduces inventory, updates serial status, awards loyalty points, and supports multiple payment methods (cash, visa, or mixed). **Bulk Discount**: Orders with 6 or more items automatically receive a 10% bulk discount. The cashier can only sell products from their assigned branch.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['customerId', 'paymentMethod', 'items'],
                  properties: {
                    customerId: {
                      type: 'string',
                      format: 'uuid',
                      description: 'Customer UUID',
                      example: '123e4567-e89b-12d3-a456-426614174000'
                    },
                    paymentMethod: {
                      type: 'string',
                      enum: ['cash', 'visa', 'mixed'],
                      description: 'Payment method: cash (full cash payment), visa (full card payment), or mixed (partial cash + partial card)',
                      example: 'mixed'
                    },
                    cashAmount: {
                      type: 'number',
                      format: 'decimal',
                      description: 'Cash payment amount (required for mixed payment, optional for cash/visa)',
                      example: 50.00,
                      minimum: 0
                    },
                    visaAmount: {
                      type: 'number',
                      format: 'decimal',
                      description: 'Card payment amount (required for mixed payment, optional for cash/visa)',
                      example: 79.99,
                      minimum: 0
                    },
                    amountPaid: {
                      type: 'number',
                      format: 'decimal',
                      description: 'The actual amount paid by the customer (optional). If provided, change will be calculated automatically. For cash payments: change = amountPaid - totalPrice. For visa payments: must be exact (no change). For mixed payments: only cash portion can have change, visa must be exact.',
                      example: 400.00,
                      minimum: 0
                    },
                    applyDiscount: {
                      type: 'boolean',
                      description: 'Whether to apply the cashier\'s active discount to this order (optional, defaults to false). If true and the cashier has an active discount, it will be automatically applied to reduce the total price.',
                      example: true,
                      default: false
                    },
                    items: {
                      type: 'array',
                      description: 'Array of products to purchase with their specific serial numbers. Cashier must scan/select the actual physical items being sold.',
                      minItems: 1,
                      items: {
                        type: 'object',
                        required: ['productId', 'serialIds'],
                        properties: {
                          productId: {
                            type: 'string',
                            format: 'uuid',
                            description: 'Product UUID',
                            example: '123e4567-e89b-12d3-a456-426614174001'
                          },
                          serialIds: {
                            type: 'array',
                            description: 'Array of serial IDs for the actual physical units being sold. Cashier scans each item\'s barcode to get these IDs.',
                            minItems: 1,
                            items: {
                              type: 'string',
                              format: 'uuid',
                              description: 'Serial UUID from ProductSerial table'
                            },
                            example: [
                              '987e6543-e21b-12d3-a456-426614174999',
                              '987e6543-e21b-12d3-a456-426614174998'
                            ]
                          }
                        }
                      }
                    }
                  }
                },
                examples: {
                  cashPaymentTwoProducts: {
                    summary: 'Cash Payment - 2 Products (Multiple Items)',
                    description: 'Example showing how to sell 2 different products with multiple units. Cashier scans each physical item to get serial IDs.',
                    value: {
                      customerId: '123e4567-e89b-12d3-a456-426614174000',
                      paymentMethod: 'cash',
                      items: [
                        {
                          productId: '123e4567-e89b-12d3-a456-426614174001',
                          serialIds: [
                            '987e6543-e21b-12d3-a456-426614174999',
                            '987e6543-e21b-12d3-a456-426614174998'
                          ]
                        },
                        {
                          productId: '123e4567-e89b-12d3-a456-426614174002',
                          serialIds: [
                            '987e6543-e21b-12d3-a456-426614174997'
                          ]
                        }
                      ]
                    }
                  },
                  visaPaymentTwoProducts: {
                    summary: 'Card Payment - 2 Products',
                    description: 'Selling 2 t-shirts (2 units) and 1 pair of shoes (1 unit) via card payment.',
                    value: {
                      customerId: '123e4567-e89b-12d3-a456-426614174000',
                      paymentMethod: 'visa',
                      items: [
                        {
                          productId: '123e4567-e89b-12d3-a456-426614174001',
                          serialIds: [
                            '987e6543-e21b-12d3-a456-426614174996',
                            '987e6543-e21b-12d3-a456-426614174995'
                          ]
                        },
                        {
                          productId: '123e4567-e89b-12d3-a456-426614174002',
                          serialIds: [
                            '987e6543-e21b-12d3-a456-426614174994'
                          ]
                        }
                      ]
                    }
                  },
                  mixedPaymentTwoProducts: {
                    summary: 'Mixed Payment (Cash + Card) - 2 Products',
                    description: 'Customer pays $50 cash + $79.99 card for 2 different products. Shows how to handle split payments with multiple products.',
                    value: {
                      customerId: '123e4567-e89b-12d3-a456-426614174000',
                      paymentMethod: 'mixed',
                      cashAmount: 50.00,
                      visaAmount: 79.99,
                      items: [
                        {
                          productId: '123e4567-e89b-12d3-a456-426614174001',
                          serialIds: [
                            '987e6543-e21b-12d3-a456-426614174993',
                            '987e6543-e21b-12d3-a456-426614174992'
                          ]
                        },
                        {
                          productId: '123e4567-e89b-12d3-a456-426614174002',
                          serialIds: [
                            '987e6543-e21b-12d3-a456-426614174991'
                          ]
                        }
                      ]
                    }
                  },
                  cashPaymentWithDiscount: {
                    summary: 'Cash Payment with Cashier Discount',
                    description: 'Example showing how to apply a cashier discount to an order. If the cashier has an active discount, it will be automatically applied to reduce the total price.',
                    value: {
                      customerId: '123e4567-e89b-12d3-a456-426614174000',
                      paymentMethod: 'cash',
                      applyDiscount: true,
                      items: [
                        {
                          productId: '123e4567-e89b-12d3-a456-426614174001',
                          serialIds: [
                            '987e6543-e21b-12d3-a456-426614174990',
                            '987e6543-e21b-12d3-a456-426614174989'
                          ]
                        }
                      ]
                    }
                  }
                }
              }
            }
          },
          responses: {
            '201': {
              description: 'Order created successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      order: {
                        type: 'object',
                        properties: {
                          id: {
                            type: 'string',
                            format: 'uuid',
                            description: 'Order UUID',
                            example: '123e4567-e89b-12d3-a456-426614174000'
                          },
                          orderNumber: {
                            type: 'string',
                            description: 'Formatted order number (first 8 chars of UUID)',
                            example: 'ORD-123E4567'
                          },
                          cashierId: {
                            type: 'string',
                            format: 'uuid',
                            description: 'UUID of the cashier who created the order'
                          },
                          branchId: {
                            type: 'string',
                            format: 'uuid',
                            description: 'UUID of the branch where order was created'
                          },
                          customerId: {
                            type: 'string',
                            format: 'uuid',
                            description: 'UUID of the customer'
                          },
                          subtotal: {
                            type: 'number',
                            format: 'decimal',
                            description: 'Order subtotal before discount',
                            example: 149.99
                          },
                          discountApplied: {
                            type: 'boolean',
                            description: 'Whether a discount was applied to this order',
                            example: true
                          },
                          discountPercentage: {
                            type: 'number',
                            format: 'decimal',
                            nullable: true,
                            description: 'Discount percentage applied (null if no discount)',
                            example: 10.0
                          },
                          discountAmount: {
                            type: 'number',
                            format: 'decimal',
                            nullable: true,
                            description: 'Discount amount in currency (null if no discount)',
                            example: 15.00
                          },
                          bulkDiscountApplied: {
                            type: 'boolean',
                            description: 'Whether a bulk discount was applied to this order (10% for 6+ items)',
                            example: true
                          },
                          bulkDiscountPercentage: {
                            type: 'number',
                            format: 'decimal',
                            nullable: true,
                            description: 'Bulk discount percentage applied (null if no bulk discount)',
                            example: 10.0
                          },
                          bulkDiscountAmount: {
                            type: 'number',
                            format: 'decimal',
                            nullable: true,
                            description: 'Bulk discount amount in currency (null if no bulk discount)',
                            example: 15.00
                          },
                          originalItemCount: {
                            type: 'integer',
                            nullable: true,
                            description: 'Original number of items in the order (used for bulk discount calculations)',
                            example: 6
                          },
                          totalPrice: {
                            type: 'number',
                            format: 'decimal',
                            description: 'Total order amount after all discounts',
                            example: 129.99
                          },
                          paymentMethod: {
                            type: 'string',
                            enum: ['cash', 'visa', 'mixed'],
                            description: 'Payment method used'
                          },
                          cashAmount: {
                            type: 'number',
                            format: 'decimal',
                            nullable: true,
                            description: 'Cash payment amount (null if full visa payment)',
                            example: 50.00
                          },
                          visaAmount: {
                            type: 'number',
                            format: 'decimal',
                            nullable: true,
                            description: 'Card payment amount (null if full cash payment)',
                            example: 79.99
                          },
                          amountPaid: {
                            type: 'number',
                            format: 'decimal',
                            description: 'The actual amount paid by the customer',
                            example: 400.00
                          },
                          changeAmount: {
                            type: 'number',
                            format: 'decimal',
                            description: 'The change amount to be returned to the customer (amountPaid - totalPrice)',
                            example: 50.00
                          },
                          status: {
                            type: 'string',
                            enum: ['pending', 'completed', 'cancelled', 'refunded'],
                            description: 'Order status (defaults to completed)',
                            example: 'completed'
                          },
                          createdAt: {
                            type: 'string',
                            format: 'date-time',
                            description: 'Order creation timestamp'
                          },
                          updatedAt: {
                            type: 'string',
                            format: 'date-time',
                            description: 'Order last update timestamp'
                          }
                        }
                      },
                      items: {
                        type: 'array',
                        description: 'Order items with product details',
                        items: {
                          type: 'object',
                          properties: {
                            id: {
                              type: 'string',
                              format: 'uuid',
                              description: 'Order item ID'
                            },
                            productId: {
                              type: 'string',
                              format: 'uuid',
                              description: 'Product UUID'
                            },
                            productName: {
                              type: 'string',
                              description: 'Product name',
                              example: 'Men\'s Black Tee'
                            },
                            sku: {
                              type: 'string',
                              description: 'Product SKU',
                              example: 'CL-TSH-L-BLK-001'
                            },
                            quantity: {
                              type: 'integer',
                              description: 'Quantity sold',
                              example: 2
                            },
                            unitPrice: {
                              type: 'number',
                              format: 'decimal',
                              description: 'Price per unit at time of sale',
                              example: 29.99
                            },
                            subtotal: {
                              type: 'number',
                              format: 'decimal',
                              description: 'Item subtotal (unitPrice × quantity)',
                              example: 59.98
                            },
                            serials: {
                              type: 'array',
                              description: 'Serial codes assigned to this order item',
                              items: {
                                type: 'string',
                                description: 'EAN-13 serial barcode',
                                example: '2000000000001'
                              }
                            }
                          }
                        }
                      },
                      customer: {
                        type: 'object',
                        description: 'Customer information with loyalty points',
                        properties: {
                          id: {
                            type: 'string',
                            format: 'uuid',
                            description: 'Customer UUID'
                          },
                          name: {
                            type: 'string',
                            description: 'Customer name',
                            example: 'John Doe'
                          },
                          phone: {
                            type: 'string',
                            description: 'Customer phone number',
                            example: '01001234567'
                          },
                          loyaltyPoints: {
                            type: 'integer',
                            description: 'Customer\'s total loyalty points balance after this order',
                            example: 1429
                          },
                          pointsEarned: {
                            type: 'integer',
                            description: 'Loyalty points earned from this order (1 point per currency unit spent, rounded down)',
                            example: 129
                          }
                        }
                      },
                      message: {
                        type: 'string',
                        example: 'Order created successfully'
                      }
                    }
                  }
                }
              }
            },
            '400': {
              description: 'Bad request - validation error, invalid serials, insufficient inventory, or invalid payment amounts',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: {
                        type: 'string',
                        examples: [
                          'customerId is required',
                          'paymentMethod must be cash, visa, or mixed',
                          'items array is required and must not be empty',
                          'Each item must have productId and serialIds array with at least one serial ID',
                          'Cannot sell the same serial twice in one order',
                          'Invalid or unavailable serials for product Men\'s Black Tee. Some serials may be already sold, not in your branch, or don\'t belong to this product.',
                          'Insufficient inventory for product Men\'s Black Tee. Available: 5, Requested: 10',
                          'Some serials don\'t belong to this product',
                          'For mixed payment, both cashAmount and visaAmount are required',
                          'Payment amounts (50.00 + 30.00 = 80.00) do not match total price (129.99)',
                          'Visa payments must be exact. Amount paid (40.00) must equal total price (29.99)',
                          'Visa amount (50.00) cannot be greater than total price (29.99)',
                          'Total paid (35.00) must equal amountPaid (40.00)'
                        ]
                      },
                      productName: {
                        type: 'string',
                        description: 'Product name (returned in serial validation errors)',
                        example: 'Men\'s Black Tee'
                      },
                      providedSerials: {
                        type: 'integer',
                        description: 'Number of serial IDs provided (returned in serial validation errors)',
                        example: 3
                      },
                      validSerials: {
                        type: 'integer',
                        description: 'Number of valid serials found (returned in serial validation errors)',
                        example: 2
                      }
                    }
                  }
                }
              }
            },
            '401': {
              description: 'Unauthorized - Missing or invalid authentication token',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string' }
                    }
                  }
                }
              }
            },
            '403': {
              description: 'Forbidden - User role not allowed or user not assigned to any branch',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: {
                        type: 'string',
                        example: 'User is not assigned to any branch'
                      }
                    }
                  }
                }
              }
            },
            '404': {
              description: 'Not found - Customer or product not found',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: {
                        type: 'string',
                        examples: [
                          'Customer not found',
                          'Product with id 123e4567-e89b-12d3-a456-426614174001 not found'
                        ]
                      }
                    }
                  }
                }
              }
            },
            '500': {
              description: 'Internal server error',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string' },
                      error: {
                        type: 'string',
                        description: 'Error details (only in development mode)'
                      }
                    }
                  }
                }
              }
            }
          },
          security: [{ BearerAuth: [] }]
        },
        get: {
          tags: ['Orders'],
          summary: 'Get all orders across all branches (admin, stock_keeper)',
          description: 'Retrieve all orders from all branches with filtering options. Only admin and stock_keeper roles can access this endpoint. Supports filtering by branch and date range.',
          parameters: [
            {
              in: 'query',
              name: 'branchId',
              schema: { type: 'string', format: 'uuid' },
              required: false,
              description: 'Filter orders by specific branch UUID'
            },
            {
              in: 'query',
              name: 'startDate',
              schema: { type: 'string', format: 'date' },
              required: false,
              description: 'Filter orders from this date onwards (YYYY-MM-DD format)',
              example: '2024-01-01'
            },
            {
              in: 'query',
              name: 'endDate',
              schema: { type: 'string', format: 'date' },
              required: false,
              description: 'Filter orders up to this date (YYYY-MM-DD format)',
              example: '2024-01-31'
            }
          ],
          responses: {
            '200': {
              description: 'Orders retrieved successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      orders: {
                        type: 'array',
                        description: 'Array of orders with full details',
                        items: {
                          type: 'object',
                          properties: {
                            id: {
                              type: 'string',
                              format: 'uuid',
                              description: 'Order UUID',
                              example: '123e4567-e89b-12d3-a456-426614174000'
                            },
                            orderNumber: {
                              type: 'string',
                              description: 'Formatted order number (first 8 chars of UUID)',
                              example: 'ORD-123E4567'
                            },
                            totalPrice: {
                              type: 'number',
                              format: 'decimal',
                              description: 'Total order amount',
                              example: 129.99
                            },
                            paymentMethod: {
                              type: 'string',
                              enum: ['cash', 'visa', 'mixed'],
                              description: 'Payment method used'
                            },
                            cashAmount: {
                              type: 'number',
                              format: 'decimal',
                              nullable: true,
                              description: 'Cash payment amount (null if full visa payment)',
                              example: 50.00
                            },
                            visaAmount: {
                              type: 'number',
                              format: 'decimal',
                              nullable: true,
                              description: 'Card payment amount (null if full cash payment)',
                              example: 79.99
                            },
                            amountPaid: {
                              type: 'number',
                              format: 'decimal',
                              nullable: true,
                              description: 'The actual amount paid by the customer',
                              example: 400.00
                            },
                            changeAmount: {
                              type: 'number',
                              format: 'decimal',
                              nullable: true,
                              description: 'The change amount to be returned to the customer',
                              example: 50.00
                            },
                            status: {
                              type: 'string',
                              enum: ['pending', 'completed', 'cancelled', 'refunded'],
                              description: 'Order status',
                              example: 'completed'
                            },
                            createdAt: {
                              type: 'string',
                              format: 'date-time',
                              description: 'Order creation timestamp'
                            },
                            updatedAt: {
                              type: 'string',
                              format: 'date-time',
                              description: 'Order last update timestamp'
                            },
                            customer: {
                              type: 'object',
                              description: 'Customer information',
                              properties: {
                                id: {
                                  type: 'string',
                                  format: 'uuid',
                                  description: 'Customer UUID'
                                },
                                name: {
                                  type: 'string',
                                  description: 'Customer name',
                                  example: 'John Doe'
                                },
                                phone: {
                                  type: 'string',
                                  description: 'Customer phone number',
                                  example: '01001234567'
                                },
                                loyaltyPoints: {
                                  type: 'integer',
                                  description: 'Customer\'s current loyalty points balance',
                                  example: 1429
                                }
                              }
                            },
                            branch: {
                              type: 'object',
                              description: 'Branch information',
                              properties: {
                                id: {
                                  type: 'string',
                                  format: 'uuid',
                                  description: 'Branch UUID'
                                },
                                name: {
                                  type: 'string',
                                  description: 'Branch name',
                                  example: 'Downtown Branch'
                                },
                                location: {
                                  type: 'string',
                                  description: 'Branch location',
                                  example: '123 Main St, Downtown'
                                }
                              }
                            },
                            cashier: {
                              type: 'object',
                              description: 'Cashier information',
                              properties: {
                                id: {
                                  type: 'string',
                                  format: 'uuid',
                                  description: 'Cashier UUID'
                                },
                                name: {
                                  type: 'string',
                                  description: 'Cashier name',
                                  example: 'Jane Smith'
                                },
                                email: {
                                  type: 'string',
                                  format: 'email',
                                  description: 'Cashier email',
                                  example: 'jane@example.com'
                                }
                              }
                            },
                            items: {
                              type: 'array',
                              description: 'Order items with product details',
                              items: {
                                type: 'object',
                                properties: {
                                  id: {
                                    type: 'string',
                                    format: 'uuid',
                                    description: 'Order item ID'
                                  },
                                  quantity: {
                                    type: 'integer',
                                    description: 'Quantity sold',
                                    example: 2
                                  },
                                  product: {
                                    type: 'object',
                                    description: 'Product information',
                                    properties: {
                                      id: {
                                        type: 'string',
                                        format: 'uuid',
                                        description: 'Product UUID'
                                      },
                                      name: {
                                        type: 'string',
                                        description: 'Product name',
                                        example: 'Men\'s Black Tee'
                                      },
                                      sku: {
                                        type: 'string',
                                        description: 'Product SKU',
                                        example: 'CL-TSH-L-BLK-001'
                                      },
                                      price: {
                                        type: 'number',
                                        format: 'decimal',
                                        description: 'Product price at time of sale',
                                        example: 29.99
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      },
                      totalCount: {
                        type: 'integer',
                        description: 'Total number of orders returned',
                        example: 25
                      },
                      filters: {
                        type: 'object',
                        description: 'Applied filters',
                        properties: {
                          branchId: {
                            type: 'string',
                            format: 'uuid',
                            nullable: true,
                            description: 'Applied branch filter'
                          },
                          startDate: {
                            type: 'string',
                            format: 'date',
                            nullable: true,
                            description: 'Applied start date filter'
                          },
                          endDate: {
                            type: 'string',
                            format: 'date',
                            nullable: true,
                            description: 'Applied end date filter'
                          }
                        }
                      }
                    }
                  }
                }
              }
            },
            '401': {
              description: 'Unauthorized - Missing or invalid authentication token',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string' }
                    }
                  }
                }
              }
            },
            '403': {
              description: 'Forbidden - User role not allowed (only admin and stock_keeper can access)',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: {
                        type: 'string',
                        example: 'Forbidden'
                      }
                    }
                  }
                }
              }
            },
            '500': {
              description: 'Internal server error',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string' },
                      error: {
                        type: 'string',
                        description: 'Error details (only in development mode)'
                      }
                    }
                  }
                }
              }
            }
          },
          security: [{ BearerAuth: [] }]
        }
      },
      '/orders/{id}': {
        get: {
          tags: ['Orders'],
          summary: 'Get order by ID (admin, stock_keeper)',
          description: 'Retrieve a specific order by its UUID with full details including customer, branch, cashier, order items, and product serials. Only admin and stock_keeper roles can access this endpoint.',
          parameters: [
            {
              in: 'path',
              name: 'id',
              schema: { type: 'string', format: 'uuid' },
              required: true,
              description: 'Order UUID',
              example: '123e4567-e89b-12d3-a456-426614174000'
            }
          ],
          responses: {
            '200': {
              description: 'Order retrieved successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      order: {
                        type: 'object',
                        properties: {
                          id: {
                            type: 'string',
                            format: 'uuid',
                            description: 'Order UUID',
                            example: '123e4567-e89b-12d3-a456-426614174000'
                          },
                          orderNumber: {
                            type: 'string',
                            description: 'Formatted order number (first 8 chars of UUID)',
                            example: 'ORD-123E4567'
                          },
                          totalPrice: {
                            type: 'number',
                            format: 'decimal',
                            description: 'Total order amount',
                            example: 129.99
                          },
                          paymentMethod: {
                            type: 'string',
                            enum: ['cash', 'visa', 'mixed'],
                            description: 'Payment method used'
                          },
                          cashAmount: {
                            type: 'number',
                            format: 'decimal',
                            nullable: true,
                            description: 'Cash payment amount (null if full visa payment)',
                            example: 50.00
                          },
                          visaAmount: {
                            type: 'number',
                            format: 'decimal',
                            nullable: true,
                            description: 'Card payment amount (null if full cash payment)',
                            example: 79.99
                          },
                          status: {
                            type: 'string',
                            enum: ['pending', 'completed', 'cancelled', 'refunded'],
                            description: 'Order status',
                            example: 'completed'
                          },
                          createdAt: {
                            type: 'string',
                            format: 'date-time',
                            description: 'Order creation timestamp'
                          },
                          updatedAt: {
                            type: 'string',
                            format: 'date-time',
                            description: 'Order last update timestamp'
                          },
                          customer: {
                            type: 'object',
                            description: 'Customer information',
                            properties: {
                              id: {
                                type: 'string',
                                format: 'uuid',
                                description: 'Customer UUID'
                              },
                              name: {
                                type: 'string',
                                description: 'Customer name',
                                example: 'John Doe'
                              },
                              phone: {
                                type: 'string',
                                description: 'Customer phone number',
                                example: '01001234567'
                              },
                              loyaltyPoints: {
                                type: 'integer',
                                description: 'Customer\'s current loyalty points balance',
                                example: 1429
                              }
                            }
                          },
                          branch: {
                            type: 'object',
                            description: 'Branch information',
                            properties: {
                              id: {
                                type: 'string',
                                format: 'uuid',
                                description: 'Branch UUID'
                              },
                              name: {
                                type: 'string',
                                description: 'Branch name',
                                example: 'Downtown Branch'
                              },
                              location: {
                                type: 'string',
                                description: 'Branch location',
                                example: '123 Main St, Downtown'
                              }
                            }
                          },
                          cashier: {
                            type: 'object',
                            description: 'Cashier information',
                            properties: {
                              id: {
                                type: 'string',
                                format: 'uuid',
                                description: 'Cashier UUID'
                              },
                              name: {
                                type: 'string',
                                description: 'Cashier name',
                                example: 'Jane Smith'
                              },
                              email: {
                                type: 'string',
                                format: 'email',
                                description: 'Cashier email',
                                example: 'jane@example.com'
                              }
                            }
                          },
                          items: {
                            type: 'array',
                            description: 'Order items with product details and serials',
                            items: {
                              type: 'object',
                              properties: {
                                id: {
                                  type: 'string',
                                  format: 'uuid',
                                  description: 'Order item ID'
                                },
                                quantity: {
                                  type: 'integer',
                                  description: 'Quantity sold',
                                  example: 2
                                },
                                product: {
                                  type: 'object',
                                  description: 'Product information',
                                  properties: {
                                    id: {
                                      type: 'string',
                                      format: 'uuid',
                                      description: 'Product UUID'
                                    },
                                    name: {
                                      type: 'string',
                                      description: 'Product name',
                                      example: 'Men\'s Black Tee'
                                    },
                                    sku: {
                                      type: 'string',
                                      description: 'Product SKU',
                                      example: 'CL-TSH-L-BLK-001'
                                    },
                                    price: {
                                      type: 'number',
                                      format: 'decimal',
                                      description: 'Product selling price',
                                      example: 29.99
                                    },
                                    cost: {
                                      type: 'number',
                                      format: 'decimal',
                                      description: 'Product cost price',
                                      example: 15.50
                                    },
                                    currency: {
                                      type: 'string',
                                      description: 'Product currency',
                                      example: 'EGP'
                                    }
                                  }
                                },
                                serials: {
                                  type: 'array',
                                  description: 'Product serials for this order item',
                                  items: {
                                    type: 'object',
                                    properties: {
                                      id: {
                                        type: 'string',
                                        format: 'uuid',
                                        description: 'Serial UUID'
                                      },
                                      serialCode: {
                                        type: 'string',
                                        description: 'Serial barcode',
                                        example: '2000000000001'
                                      },
                                      note: {
                                        type: 'string',
                                        description: 'Serial note/status',
                                        example: 'sold - order 123e4567-e89b-12d3-a456-426614174000'
                                      }
                                    }
                                  }
                                }
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
            '400': {
              description: 'Bad request - Invalid UUID format',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: {
                        type: 'string',
                        example: 'Invalid order ID format. Must be a valid UUID.'
                      }
                    }
                  }
                }
              }
            },
            '401': {
              description: 'Unauthorized - Missing or invalid authentication token',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string' }
                    }
                  }
                }
              }
            },
            '403': {
              description: 'Forbidden - User role not allowed (only admin and stock_keeper can access)',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: {
                        type: 'string',
                        example: 'Forbidden'
                      }
                    }
                  }
                }
              }
            },
            '404': {
              description: 'Not found - Order not found',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: {
                        type: 'string',
                        example: 'Order not found'
                      }
                    }
                  }
                }
              }
            },
            '500': {
              description: 'Internal server error',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string' },
                      error: {
                        type: 'string',
                        description: 'Error details (only in development mode)'
                      }
                    }
                  }
                }
              }
            }
          },
          security: [{ BearerAuth: [] }]
        }
      },
      '/orders/branch': {
        get: {
          tags: ['Orders'],
          summary: 'Get orders for current user\'s branch (branch_manager, cashier)',
          description: 'Retrieve orders from the current user\'s assigned branch from the last 18 days. Only branch_manager and cashier roles can access this endpoint. Users can only see orders from their assigned branch.',
          responses: {
            '200': {
              description: 'Branch orders retrieved successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      orders: {
                        type: 'array',
                        description: 'Array of orders from the user\'s branch',
                        items: {
                          type: 'object',
                          properties: {
                            id: {
                              type: 'string',
                              format: 'uuid',
                              description: 'Order UUID',
                              example: '123e4567-e89b-12d3-a456-426614174000'
                            },
                            orderNumber: {
                              type: 'string',
                              description: 'Formatted order number (first 8 chars of UUID)',
                              example: 'ORD-123E4567'
                            },
                            totalPrice: {
                              type: 'number',
                              format: 'decimal',
                              description: 'Total order amount',
                              example: 129.99
                            },
                            paymentMethod: {
                              type: 'string',
                              enum: ['cash', 'visa', 'mixed'],
                              description: 'Payment method used'
                            },
                            cashAmount: {
                              type: 'number',
                              format: 'decimal',
                              nullable: true,
                              description: 'Cash payment amount (null if full visa payment)',
                              example: 50.00
                            },
                            visaAmount: {
                              type: 'number',
                              format: 'decimal',
                              nullable: true,
                              description: 'Card payment amount (null if full cash payment)',
                              example: 79.99
                            },
                            amountPaid: {
                              type: 'number',
                              format: 'decimal',
                              nullable: true,
                              description: 'The actual amount paid by the customer',
                              example: 400.00
                            },
                            changeAmount: {
                              type: 'number',
                              format: 'decimal',
                              nullable: true,
                              description: 'The change amount to be returned to the customer',
                              example: 50.00
                            },
                            status: {
                              type: 'string',
                              enum: ['pending', 'completed', 'cancelled', 'refunded'],
                              description: 'Order status',
                              example: 'completed'
                            },
                            createdAt: {
                              type: 'string',
                              format: 'date-time',
                              description: 'Order creation timestamp'
                            },
                            updatedAt: {
                              type: 'string',
                              format: 'date-time',
                              description: 'Order last update timestamp'
                            },
                            customer: {
                              type: 'object',
                              description: 'Customer information',
                              properties: {
                                id: {
                                  type: 'string',
                                  format: 'uuid',
                                  description: 'Customer UUID'
                                },
                                name: {
                                  type: 'string',
                                  description: 'Customer name',
                                  example: 'John Doe'
                                },
                                phone: {
                                  type: 'string',
                                  description: 'Customer phone number',
                                  example: '01001234567'
                                },
                                loyaltyPoints: {
                                  type: 'integer',
                                  description: 'Customer\'s current loyalty points balance',
                                  example: 1429
                                }
                              }
                            },
                            branch: {
                              type: 'object',
                              description: 'Branch information',
                              properties: {
                                id: {
                                  type: 'string',
                                  format: 'uuid',
                                  description: 'Branch UUID'
                                },
                                name: {
                                  type: 'string',
                                  description: 'Branch name',
                                  example: 'Downtown Branch'
                                },
                                location: {
                                  type: 'string',
                                  description: 'Branch location',
                                  example: '123 Main St, Downtown'
                                }
                              }
                            },
                            cashier: {
                              type: 'object',
                              description: 'Cashier information',
                              properties: {
                                id: {
                                  type: 'string',
                                  format: 'uuid',
                                  description: 'Cashier UUID'
                                },
                                name: {
                                  type: 'string',
                                  description: 'Cashier name',
                                  example: 'Jane Smith'
                                },
                                email: {
                                  type: 'string',
                                  format: 'email',
                                  description: 'Cashier email',
                                  example: 'jane@example.com'
                                }
                              }
                            },
                            items: {
                              type: 'array',
                              description: 'Order items with product details',
                              items: {
                                type: 'object',
                                properties: {
                                  id: {
                                    type: 'string',
                                    format: 'uuid',
                                    description: 'Order item ID'
                                  },
                                  quantity: {
                                    type: 'integer',
                                    description: 'Quantity sold',
                                    example: 2
                                  },
                                  product: {
                                    type: 'object',
                                    description: 'Product information',
                                    properties: {
                                      id: {
                                        type: 'string',
                                        format: 'uuid',
                                        description: 'Product UUID'
                                      },
                                      name: {
                                        type: 'string',
                                        description: 'Product name',
                                        example: 'Men\'s Black Tee'
                                      },
                                      sku: {
                                        type: 'string',
                                        description: 'Product SKU',
                                        example: 'CL-TSH-L-BLK-001'
                                      },
                                      price: {
                                        type: 'number',
                                        format: 'decimal',
                                        description: 'Product price at time of sale',
                                        example: 29.99
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      },
                      totalCount: {
                        type: 'integer',
                        description: 'Total number of orders returned from this branch',
                        example: 15
                      },
                      branch: {
                        type: 'object',
                        description: 'Branch information for the orders',
                        properties: {
                          id: {
                            type: 'string',
                            format: 'uuid',
                            description: 'Branch UUID'
                          },
                          name: {
                            type: 'string',
                            description: 'Branch name',
                            example: 'Downtown Branch'
                          },
                          location: {
                            type: 'string',
                            description: 'Branch location',
                            example: '123 Main St, Downtown'
                          }
                        }
                      },
                      filters: {
                        type: 'object',
                        description: 'Applied filters',
                        properties: {}
                      }
                    }
                  }
                }
              }
            },
            '401': {
              description: 'Unauthorized - Missing or invalid authentication token',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string' }
                    }
                  }
                }
              }
            },
            '403': {
              description: 'Forbidden - User role not allowed or user not assigned to any branch',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: {
                        type: 'string',
                        examples: [
                          'Forbidden',
                          'User is not assigned to any branch'
                        ]
                      }
                    }
                  }
                }
              }
            },
            '500': {
              description: 'Internal server error',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string' },
                      error: {
                        type: 'string',
                        description: 'Error details (only in development mode)'
                      }
                    }
                  }
                }
              }
            }
          },
          security: [{ BearerAuth: [] }]
        }
      },
      '/refunds': {
        post: {
          tags: ['Refunds'],
          summary: 'Create refund for order item (branch_manager, cashier)',
          description: 'Process a refund for a specific order item. The refund must be requested within 18 days of purchase. The system will return inventory to the branch, unassign serial numbers, and create a refund record. **Bulk Discount Logic**: If the original order had a bulk discount (6+ items) and the refund causes remaining items to fall below 6, the customer loses the entire bulk discount benefit. Refund amount = Item price - Total discount applied.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['orderItemId', 'serialIds'],
                  properties: {
                    orderItemId: {
                      type: 'string',
                      format: 'uuid',
                      description: 'Order item UUID to refund',
                      example: '123e4567-e89b-12d3-a456-426614174000'
                    },
                    serialIds: {
                      type: 'array',
                      description: 'Array of serial IDs for the specific physical items being returned. Cashier scans each returned item\'s barcode.',
                      minItems: 1,
                      items: {
                        type: 'string',
                        format: 'uuid',
                        description: 'Serial UUID from ProductSerial table'
                      },
                      example: [
                        '987e6543-e21b-12d3-a456-426614174999',
                        '987e6543-e21b-12d3-a456-426614174998'
                      ]
                    },
                    reason: {
                      type: 'string',
                      description: 'Reason for refund (optional)',
                      example: 'Customer changed mind'
                    }
                  }
                }
              }
            }
          },
          responses: {
            '201': {
              description: 'Refund processed successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      refund: {
                        type: 'object',
                        properties: {
                          id: {
                            type: 'string',
                            format: 'uuid',
                            description: 'Refund UUID'
                          },
                          orderItemId: {
                            type: 'string',
                            format: 'uuid',
                            description: 'Order item UUID'
                          },
                          branchId: {
                            type: 'string',
                            format: 'uuid',
                            description: 'Branch UUID'
                          },
                          quantity: {
                            type: 'integer',
                            description: 'Number of units refunded',
                            example: 2
                          },
                          status: {
                            type: 'string',
                            enum: ['pending', 'approved', 'rejected'],
                            description: 'Refund status',
                            example: 'approved'
                          },
                          refundAmount: {
                            type: 'number',
                            format: 'decimal',
                            description: 'Total refund amount',
                            example: 59.98
                          },
                          requestedBy: {
                            type: 'string',
                            format: 'uuid',
                            description: 'User UUID who requested the refund'
                          },
                          reason: {
                            type: 'string',
                            nullable: true,
                            description: 'Refund reason',
                            example: 'Customer changed mind'
                          },
                          approvedBy: {
                            type: 'string',
                            format: 'uuid',
                            nullable: true,
                            description: 'User UUID who approved the refund'
                          },
                          createdAt: {
                            type: 'string',
                            format: 'date-time',
                            description: 'Refund creation timestamp'
                          }
                        }
                      },
                      product: {
                        type: 'object',
                        properties: {
                          id: {
                            type: 'string',
                            format: 'uuid',
                            description: 'Product UUID'
                          },
                          name: {
                            type: 'string',
                            description: 'Product name',
                            example: 'T-Shirt'
                          },
                          sku: {
                            type: 'string',
                            description: 'Product SKU',
                            example: 'SKU-12345'
                          }
                        }
                      },
                      serialsRefunded: {
                        type: 'array',
                        description: 'Array of serial codes that were refunded',
                        items: {
                          type: 'string',
                          example: 'SN-ABC123'
                        }
                      },
                      message: {
                        type: 'string',
                        example: 'Refund processed successfully'
                      }
                    }
                  }
                }
              }
            },
            '400': {
              description: 'Bad request - validation error or refund window expired',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: {
                        type: 'string',
                        examples: [
                          'orderItemId is required',
                          'serialIds array is required and must not be empty',
                          'Invalid serials provided. Some serials don\'t belong to this order item or don\'t exist',
                          'Cannot refund the same serial twice',
                          'Refund window expired. Orders can only be refunded within 18 days of purchase',
                          'Cannot refund more than purchased quantity. Purchased: 2, Requested: 3',
                          'This order item has already been refunded'
                        ]
                      },
                      orderDate: {
                        type: 'string',
                        format: 'date-time',
                        description: 'Order creation date (only for expired refund window)'
                      },
                      minutesSinceOrder: {
                        type: 'integer',
                        description: 'Minutes since order was created (only for expired refund window)'
                      }
                    }
                  }
                }
              }
            },
            '401': {
              description: 'Unauthorized'
            },
            '403': {
              description: 'Forbidden - user not assigned to branch or trying to refund from another branch',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: {
                        type: 'string',
                        examples: [
                          'User is not assigned to any branch',
                          'Cannot refund items from other branches'
                        ]
                      }
                    }
                  }
                }
              }
            },
            '404': {
              description: 'Order item not found',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: {
                        type: 'string',
                        example: 'Order item not found'
                      }
                    }
                  }
                }
              }
            },
            '500': {
              description: 'Internal server error',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: {
                        type: 'string',
                        example: 'Internal server error'
                      },
                      error: {
                        type: 'string',
                        description: 'Error details (only in development mode)'
                      }
                    }
                  }
                }
              }
            }
          },
          security: [{ BearerAuth: [] }]
        },
        get: {
          tags: ['Refunds'],
          summary: 'List all refunds system-wide (admin only)',
          description: 'Get a list of all refunds across all branches with their associated serial codes. Only accessible to admins. For branch-specific refunds, branch managers and cashiers should use /refunds/branch endpoint. Supports filtering by status and pagination.',
          parameters: [
            {
              in: 'query',
              name: 'status',
              schema: {
                type: 'string',
                enum: ['pending', 'approved', 'rejected']
              },
              description: 'Filter refunds by status',
              required: false
            },
            {
              in: 'query',
              name: 'limit',
              schema: {
                type: 'integer',
                default: 50,
                minimum: 1,
                maximum: 100
              },
              description: 'Maximum number of results to return',
              required: false
            },
            {
              in: 'query',
              name: 'offset',
              schema: {
                type: 'integer',
                default: 0,
                minimum: 0
              },
              description: 'Number of results to skip for pagination',
              required: false
            }
          ],
          responses: {
            '200': {
              description: 'List of refunds retrieved successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      refunds: {
                        type: 'array',
                        description: 'Array of refund objects',
                        items: {
                          type: 'object',
                          properties: {
                            id: {
                              type: 'string',
                              format: 'uuid',
                              description: 'Refund UUID'
                            },
                            orderItemId: {
                              type: 'string',
                              format: 'uuid',
                              description: 'Order item UUID'
                            },
                            orderId: {
                              type: 'string',
                              format: 'uuid',
                              description: 'Order UUID',
                              nullable: true
                            },
                            orderNumber: {
                              type: 'string',
                              description: 'Human-readable order number',
                              example: 'ORD-12345678',
                              nullable: true
                            },
                            orderDate: {
                              type: 'string',
                              format: 'date-time',
                              description: 'Date when the order was created',
                              nullable: true
                            },
                            branch: {
                              type: 'object',
                              nullable: true,
                              properties: {
                                id: {
                                  type: 'string',
                                  format: 'uuid',
                                  description: 'Branch UUID'
                                },
                                name: {
                                  type: 'string',
                                  description: 'Branch name',
                                  example: 'Downtown Store'
                                }
                              }
                            },
                            product: {
                              type: 'object',
                              nullable: true,
                              properties: {
                                id: {
                                  type: 'string',
                                  format: 'uuid',
                                  description: 'Product UUID'
                                },
                                name: {
                                  type: 'string',
                                  description: 'Product name',
                                  example: 'T-Shirt'
                                },
                                sku: {
                                  type: 'string',
                                  description: 'Product SKU',
                                  example: 'SKU-12345'
                                },
                                price: {
                                  type: 'number',
                                  format: 'decimal',
                                  description: 'Product unit price',
                                  example: 29.99
                                }
                              }
                            },
                            quantity: {
                              type: 'integer',
                              description: 'Number of units refunded',
                              example: 2
                            },
                            status: {
                              type: 'string',
                              enum: ['pending', 'approved', 'rejected'],
                              description: 'Refund status',
                              example: 'approved'
                            },
                            refundAmount: {
                              type: 'number',
                              format: 'decimal',
                              description: 'Total refund amount',
                              example: 59.98
                            },
                            reason: {
                              type: 'string',
                              nullable: true,
                              description: 'Reason for refund',
                              example: 'Customer changed mind'
                            },
                            serials: {
                              type: 'array',
                              description: 'Array of serial codes that were refunded',
                              items: {
                                type: 'object',
                                properties: {
                                  id: {
                                    type: 'string',
                                    format: 'uuid',
                                    description: 'Serial UUID'
                                  },
                                  serialCode: {
                                    type: 'string',
                                    description: 'Serial barcode/number',
                                    example: 'SN-ABC123'
                                  },
                                  productId: {
                                    type: 'string',
                                    format: 'uuid',
                                    description: 'Product UUID'
                                  }
                                }
                              }
                            },
                            requestedBy: {
                              type: 'object',
                              nullable: true,
                              properties: {
                                id: {
                                  type: 'string',
                                  format: 'uuid',
                                  description: 'User UUID'
                                },
                                name: {
                                  type: 'string',
                                  description: 'User full name',
                                  example: 'John Doe'
                                },
                                email: {
                                  type: 'string',
                                  format: 'email',
                                  description: 'User email',
                                  example: 'john@example.com'
                                },
                                role: {
                                  type: 'string',
                                  description: 'User role',
                                  example: 'cashier'
                                }
                              }
                            },
                            approvedBy: {
                              type: 'object',
                              nullable: true,
                              properties: {
                                id: {
                                  type: 'string',
                                  format: 'uuid',
                                  description: 'User UUID'
                                },
                                name: {
                                  type: 'string',
                                  description: 'User full name',
                                  example: 'Jane Smith'
                                },
                                email: {
                                  type: 'string',
                                  format: 'email',
                                  description: 'User email',
                                  example: 'jane@example.com'
                                },
                                role: {
                                  type: 'string',
                                  description: 'User role',
                                  example: 'branch_manager'
                                }
                              }
                            },
                            createdAt: {
                              type: 'string',
                              format: 'date-time',
                              description: 'Refund creation timestamp'
                            },
                            updatedAt: {
                              type: 'string',
                              format: 'date-time',
                              description: 'Last update timestamp'
                            }
                          }
                        }
                      },
                      total: {
                        type: 'integer',
                        description: 'Total number of refunds matching the filter criteria',
                        example: 42
                      },
                      limit: {
                        type: 'integer',
                        description: 'Maximum number of results returned',
                        example: 50
                      },
                      offset: {
                        type: 'integer',
                        description: 'Number of results skipped',
                        example: 0
                      }
                    }
                  }
                }
              }
            },
            '401': {
              description: 'Unauthorized - missing or invalid JWT token'
            },
            '403': {
              description: 'Forbidden - admin access only',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: {
                        type: 'string',
                        example: 'Forbidden'
                      }
                    }
                  }
                }
              }
            },
            '500': {
              description: 'Internal server error',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: {
                        type: 'string',
                        example: 'Internal server error'
                      },
                      error: {
                        type: 'string',
                        description: 'Error details (only in development mode)'
                      }
                    }
                  }
                }
              }
            }
          },
          security: [{ BearerAuth: [] }]
        }
      },
      '/refunds/branch': {
        get: {
          tags: ['Refunds'],
          summary: 'List refunds for user\'s branch (branch_manager, cashier)',
          description: 'Get a list of refunds for the authenticated user\'s branch with their associated serial codes. Only accessible to branch managers and cashiers assigned to a branch. Returns refunds from their assigned branch only.',
          parameters: [
            {
              in: 'query',
              name: 'status',
              schema: {
                type: 'string',
                enum: ['pending', 'approved', 'rejected']
              },
              description: 'Filter refunds by status',
              required: false
            },
            {
              in: 'query',
              name: 'limit',
              schema: {
                type: 'integer',
                default: 50,
                minimum: 1,
                maximum: 100
              },
              description: 'Maximum number of results to return',
              required: false
            },
            {
              in: 'query',
              name: 'offset',
              schema: {
                type: 'integer',
                default: 0,
                minimum: 0
              },
              description: 'Number of results to skip for pagination',
              required: false
            }
          ],
          responses: {
            '200': {
              description: 'List of branch refunds retrieved successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      refunds: {
                        type: 'array',
                        description: 'Array of refund objects',
                        items: {
                          type: 'object',
                          properties: {
                            id: {
                              type: 'string',
                              format: 'uuid',
                              description: 'Refund UUID'
                            },
                            orderItemId: {
                              type: 'string',
                              format: 'uuid',
                              description: 'Order item UUID'
                            },
                            orderId: {
                              type: 'string',
                              format: 'uuid',
                              description: 'Order UUID',
                              nullable: true
                            },
                            orderNumber: {
                              type: 'string',
                              description: 'Human-readable order number',
                              example: 'ORD-12345678',
                              nullable: true
                            },
                            orderDate: {
                              type: 'string',
                              format: 'date-time',
                              description: 'Date when the order was created',
                              nullable: true
                            },
                            branch: {
                              type: 'object',
                              nullable: true,
                              properties: {
                                id: {
                                  type: 'string',
                                  format: 'uuid',
                                  description: 'Branch UUID'
                                },
                                name: {
                                  type: 'string',
                                  description: 'Branch name',
                                  example: 'Downtown Store'
                                }
                              }
                            },
                            product: {
                              type: 'object',
                              nullable: true,
                              properties: {
                                id: {
                                  type: 'string',
                                  format: 'uuid',
                                  description: 'Product UUID'
                                },
                                name: {
                                  type: 'string',
                                  description: 'Product name',
                                  example: 'T-Shirt'
                                },
                                sku: {
                                  type: 'string',
                                  description: 'Product SKU',
                                  example: 'SKU-12345'
                                },
                                price: {
                                  type: 'number',
                                  format: 'decimal',
                                  description: 'Product unit price',
                                  example: 29.99
                                }
                              }
                            },
                            quantity: {
                              type: 'integer',
                              description: 'Number of units refunded',
                              example: 2
                            },
                            status: {
                              type: 'string',
                              enum: ['pending', 'approved', 'rejected'],
                              description: 'Refund status',
                              example: 'approved'
                            },
                            refundAmount: {
                              type: 'number',
                              format: 'decimal',
                              description: 'Total refund amount',
                              example: 59.98
                            },
                            reason: {
                              type: 'string',
                              nullable: true,
                              description: 'Reason for refund',
                              example: 'Customer changed mind'
                            },
                            serials: {
                              type: 'array',
                              description: 'Array of serial codes that were refunded',
                              items: {
                                type: 'object',
                                properties: {
                                  id: {
                                    type: 'string',
                                    format: 'uuid',
                                    description: 'Serial UUID'
                                  },
                                  serialCode: {
                                    type: 'string',
                                    description: 'Serial barcode/number',
                                    example: 'SN-ABC123'
                                  },
                                  productId: {
                                    type: 'string',
                                    format: 'uuid',
                                    description: 'Product UUID'
                                  }
                                }
                              }
                            },
                            requestedBy: {
                              type: 'object',
                              nullable: true,
                              properties: {
                                id: {
                                  type: 'string',
                                  format: 'uuid',
                                  description: 'User UUID'
                                },
                                name: {
                                  type: 'string',
                                  description: 'User full name',
                                  example: 'John Doe'
                                },
                                email: {
                                  type: 'string',
                                  format: 'email',
                                  description: 'User email',
                                  example: 'john@example.com'
                                },
                                role: {
                                  type: 'string',
                                  description: 'User role',
                                  example: 'cashier'
                                }
                              }
                            },
                            approvedBy: {
                              type: 'object',
                              nullable: true,
                              properties: {
                                id: {
                                  type: 'string',
                                  format: 'uuid',
                                  description: 'User UUID'
                                },
                                name: {
                                  type: 'string',
                                  description: 'User full name',
                                  example: 'Jane Smith'
                                },
                                email: {
                                  type: 'string',
                                  format: 'email',
                                  description: 'User email',
                                  example: 'jane@example.com'
                                },
                                role: {
                                  type: 'string',
                                  description: 'User role',
                                  example: 'branch_manager'
                                }
                              }
                            },
                            createdAt: {
                              type: 'string',
                              format: 'date-time',
                              description: 'Refund creation timestamp'
                            },
                            updatedAt: {
                              type: 'string',
                              format: 'date-time',
                              description: 'Last update timestamp'
                            }
                          }
                        }
                      },
                      total: {
                        type: 'integer',
                        description: 'Total number of refunds in the branch',
                        example: 15
                      },
                      limit: {
                        type: 'integer',
                        description: 'Maximum number of results returned',
                        example: 50
                      },
                      offset: {
                        type: 'integer',
                        description: 'Number of results skipped',
                        example: 0
                      }
                    }
                  }
                }
              }
            },
            '401': {
              description: 'Unauthorized - missing or invalid JWT token'
            },
            '403': {
              description: 'Forbidden - user not assigned to a branch or insufficient permissions',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: {
                        type: 'string',
                        example: 'User must be assigned to a branch'
                      }
                    }
                  }
                }
              }
            },
            '500': {
              description: 'Internal server error',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: {
                        type: 'string',
                        example: 'Internal server error'
                      },
                      error: {
                        type: 'string',
                        description: 'Error details (only in development mode)'
                      }
                    }
                  }
                }
              }
            }
          },
          security: [{ BearerAuth: [] }]
        }
      },
      '/refunds/request': {
        post: {
          tags: ['Refunds'],
          summary: 'Request refund for expired orders (after 18 days) - branch_manager, cashier',
          description: 'Create a pending refund request for orders that are beyond the 18-day auto-approval window. The request will be sent to admin for approval. Reason is mandatory for late refund requests. **Bulk Discount Logic**: If the refund causes remaining items to fall below 6, the customer loses the entire bulk discount benefit. Refund amount = Item price - Total discount applied.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['orderItemId', 'serialIds', 'reason'],
                  properties: {
                    orderItemId: {
                      type: 'string',
                      format: 'uuid',
                      description: 'Order item UUID to refund',
                      example: '123e4567-e89b-12d3-a456-426614174000'
                    },
                    serialIds: {
                      type: 'array',
                      description: 'Array of serial IDs for the items being returned',
                      minItems: 1,
                      items: {
                        type: 'string',
                        format: 'uuid',
                        description: 'Serial UUID from ProductSerial table'
                      },
                      example: ['987e6543-e21b-12d3-a456-426614174999', '987e6543-e21b-12d3-a456-426614174998']
                    },
                    reason: {
                      type: 'string',
                      description: 'Reason for the late refund request (mandatory)',
                      example: 'Customer was out of town and just returned'
                    }
                  }
                }
              }
            }
          },
          responses: {
            '201': {
              description: 'Refund request created successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      refund: {
                        type: 'object',
                        properties: {
                          id: {
                            type: 'string',
                            format: 'uuid',
                            description: 'Refund UUID'
                          },
                          orderItemId: {
                            type: 'string',
                            format: 'uuid',
                            description: 'Order item UUID'
                          },
                          branchId: {
                            type: 'string',
                            format: 'uuid',
                            description: 'Branch UUID'
                          },
                          quantity: {
                            type: 'integer',
                            description: 'Number of units to be refunded',
                            example: 2
                          },
                          status: {
                            type: 'string',
                            enum: ['pending'],
                            description: 'Refund status',
                            example: 'pending'
                          },
                          refundAmount: {
                            type: 'number',
                            format: 'decimal',
                            description: 'Total refund amount',
                            example: 59.98
                          },
                          requestedBy: {
                            type: 'string',
                            format: 'uuid',
                            description: 'User UUID who requested the refund'
                          },
                          reason: {
                            type: 'string',
                            description: 'Refund reason'
                          },
                          createdAt: {
                            type: 'string',
                            format: 'date-time',
                            description: 'Request creation timestamp'
                          }
                        }
                      },
                      product: {
                        type: 'object',
                        properties: {
                          id: {
                            type: 'string',
                            format: 'uuid'
                          },
                          name: {
                            type: 'string',
                            example: 'T-Shirt'
                          },
                          sku: {
                            type: 'string',
                            example: 'SKU-12345'
                          }
                        }
                      },
                      orderDate: {
                        type: 'string',
                        format: 'date-time',
                        description: 'Date when order was placed'
                      },
                      daysSinceOrder: {
                        type: 'integer',
                        description: 'Number of days since order was placed',
                        example: 25
                      },
                      serialsRequested: {
                        type: 'array',
                        description: 'Array of serial codes requested for refund',
                        items: {
                          type: 'string',
                          example: 'SN-ABC123'
                        }
                      },
                      message: {
                        type: 'string',
                        example: 'Refund request created successfully. Awaiting admin approval.'
                      }
                    }
                  }
                }
              }
            },
            '400': {
              description: 'Bad request - validation error or item already has refund',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: {
                        type: 'string',
                        examples: [
                          'orderItemId is required',
                          'serialIds array is required and must not be empty',
                          'reason is required for late refund requests',
                          'This order item already has a refund with status: pending'
                        ]
                      }
                    }
                  }
                }
              }
            },
            '401': {
              description: 'Unauthorized'
            },
            '403': {
              description: 'Forbidden - user not assigned to branch or trying to refund from another branch'
            },
            '404': {
              description: 'Order item not found'
            },
            '500': {
              description: 'Internal server error'
            }
          },
          security: [{ BearerAuth: [] }]
        }
      },
      '/refunds/{id}/approve': {
        put: {
          tags: ['Refunds'],
          summary: 'Approve pending refund request (admin only)',
          description: 'Approve a pending refund request. This will process the refund by returning inventory to the branch and unassigning serial numbers. Only admins can approve refund requests.',
          parameters: [
            {
              in: 'path',
              name: 'id',
              required: true,
              schema: {
                type: 'string',
                format: 'uuid'
              },
              description: 'Refund request UUID'
            }
          ],
          responses: {
            '200': {
              description: 'Refund approved and processed successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: {
                        type: 'string',
                        example: 'Refund approved and processed successfully'
                      },
                      refund: {
                        type: 'object',
                        properties: {
                          id: {
                            type: 'string',
                            format: 'uuid'
                          },
                          orderItemId: {
                            type: 'string',
                            format: 'uuid'
                          },
                          branchId: {
                            type: 'string',
                            format: 'uuid'
                          },
                          quantity: {
                            type: 'integer',
                            example: 2
                          },
                          status: {
                            type: 'string',
                            enum: ['approved'],
                            example: 'approved'
                          },
                          refundAmount: {
                            type: 'number',
                            format: 'decimal',
                            example: 59.98
                          },
                          reason: {
                            type: 'string'
                          },
                          requestedBy: {
                            type: 'string',
                            format: 'uuid'
                          },
                          approvedBy: {
                            type: 'string',
                            format: 'uuid'
                          },
                          createdAt: {
                            type: 'string',
                            format: 'date-time'
                          },
                          updatedAt: {
                            type: 'string',
                            format: 'date-time'
                          }
                        }
                      },
                      product: {
                        type: 'object',
                        properties: {
                          id: {
                            type: 'string',
                            format: 'uuid'
                          },
                          name: {
                            type: 'string',
                            example: 'T-Shirt'
                          },
                          sku: {
                            type: 'string',
                            example: 'SKU-12345'
                          }
                        }
                      },
                      serialsRefunded: {
                        type: 'array',
                        description: 'Array of serial codes that were refunded',
                        items: {
                          type: 'string',
                          example: 'SN-ABC123'
                        }
                      }
                    }
                  }
                }
              }
            },
            '400': {
              description: 'Bad request - refund not in pending status or serials invalid',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: {
                        type: 'string',
                        examples: [
                          'Cannot approve refund with status: approved. Only pending refunds can be approved.',
                          'Serial IDs not found in refund request',
                          'Some serials are no longer valid or don\'t belong to this order item'
                        ]
                      }
                    }
                  }
                }
              }
            },
            '401': {
              description: 'Unauthorized'
            },
            '403': {
              description: 'Forbidden - admin access only'
            },
            '404': {
              description: 'Refund request not found'
            },
            '500': {
              description: 'Internal server error'
            }
          },
          security: [{ BearerAuth: [] }]
        }
      },
      '/refunds/{id}/reject': {
        put: {
          tags: ['Refunds'],
          summary: 'Reject pending refund request (admin only)',
          description: 'Reject a pending refund request. No inventory or serial changes will be made. Only admins can reject refund requests.',
          parameters: [
            {
              in: 'path',
              name: 'id',
              required: true,
              schema: {
                type: 'string',
                format: 'uuid'
              },
              description: 'Refund request UUID'
            }
          ],
          requestBody: {
            required: false,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    rejectionReason: {
                      type: 'string',
                      description: 'Optional reason for rejection',
                      example: 'Product condition not acceptable for refund'
                    }
                  }
                }
              }
            }
          },
          responses: {
            '200': {
              description: 'Refund request rejected',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: {
                        type: 'string',
                        example: 'Refund request rejected'
                      },
                      refund: {
                        type: 'object',
                        properties: {
                          id: {
                            type: 'string',
                            format: 'uuid'
                          },
                          orderItemId: {
                            type: 'string',
                            format: 'uuid'
                          },
                          branchId: {
                            type: 'string',
                            format: 'uuid'
                          },
                          quantity: {
                            type: 'integer',
                            example: 2
                          },
                          status: {
                            type: 'string',
                            enum: ['rejected'],
                            example: 'rejected'
                          },
                          refundAmount: {
                            type: 'number',
                            format: 'decimal',
                            example: 59.98
                          },
                          reason: {
                            type: 'string',
                            description: 'Original reason plus rejection reason if provided'
                          },
                          requestedBy: {
                            type: 'string',
                            format: 'uuid'
                          },
                          approvedBy: {
                            type: 'string',
                            format: 'uuid',
                            description: 'Admin who rejected the request'
                          },
                          createdAt: {
                            type: 'string',
                            format: 'date-time'
                          },
                          updatedAt: {
                            type: 'string',
                            format: 'date-time'
                          }
                        }
                      },
                      product: {
                        type: 'object',
                        nullable: true,
                        properties: {
                          id: {
                            type: 'string',
                            format: 'uuid'
                          },
                          name: {
                            type: 'string',
                            example: 'T-Shirt'
                          },
                          sku: {
                            type: 'string',
                            example: 'SKU-12345'
                          }
                        }
                      }
                    }
                  }
                }
              }
            },
            '400': {
              description: 'Bad request - refund not in pending status',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: {
                        type: 'string',
                        example: 'Cannot reject refund with status: approved. Only pending refunds can be rejected.'
                      }
                    }
                  }
                }
              }
            },
            '401': {
              description: 'Unauthorized'
            },
            '403': {
              description: 'Forbidden - admin access only'
            },
            '404': {
              description: 'Refund request not found'
            },
            '500': {
              description: 'Internal server error'
            }
          },
          security: [{ BearerAuth: [] }]
        }
      },
      '/refunds/order/{orderId}': {
        post: {
          tags: ['Refunds'],
          summary: 'Refund entire order (branch_manager, cashier)',
          description: 'Process a refund for ALL items in an order at once. The refund must be requested within 18 days of purchase. The system will return all inventory to the branch, unassign all serial numbers, and create refund records for each item. **Bulk Discount Logic**: If the original order had a bulk discount, customers receive back the full bulk discount amount along with all item prices.',
          parameters: [
            {
              in: 'path',
              name: 'orderId',
              schema: { type: 'string', format: 'uuid' },
              required: true,
              description: 'Order UUID to refund'
            }
          ],
          requestBody: {
            required: false,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    reason: {
                      type: 'string',
                      description: 'Reason for refund (optional)',
                      example: 'Customer returned all items'
                    }
                  }
                }
              }
            }
          },
          responses: {
            '201': {
              description: 'Entire order refunded successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      orderId: {
                        type: 'string',
                        format: 'uuid',
                        description: 'Order UUID'
                      },
                      orderNumber: {
                        type: 'string',
                        description: 'Formatted order number',
                        example: 'ORD-123E4567'
                      },
                      totalRefundAmount: {
                        type: 'number',
                        format: 'decimal',
                        description: 'Total amount refunded for all items',
                        example: 179.97
                      },
                      itemsRefunded: {
                        type: 'integer',
                        description: 'Number of different items refunded',
                        example: 3
                      },
                      refundedItems: {
                        type: 'array',
                        description: 'Details of each refunded item',
                        items: {
                          type: 'object',
                          properties: {
                            refundId: {
                              type: 'string',
                              format: 'uuid',
                              description: 'Refund record UUID'
                            },
                            orderItemId: {
                              type: 'string',
                              format: 'uuid',
                              description: 'Order item UUID'
                            },
                            productId: {
                              type: 'string',
                              format: 'uuid',
                              description: 'Product UUID'
                            },
                            productName: {
                              type: 'string',
                              description: 'Product name',
                              example: 'T-Shirt'
                            },
                            productSku: {
                              type: 'string',
                              description: 'Product SKU',
                              example: 'SKU-12345'
                            },
                            quantity: {
                              type: 'integer',
                              description: 'Quantity refunded',
                              example: 2
                            },
                            refundAmount: {
                              type: 'number',
                              format: 'decimal',
                              description: 'Refund amount for this item',
                              example: 59.98
                            },
                            serialsRefunded: {
                              type: 'array',
                              description: 'Serial codes refunded',
                              items: {
                                type: 'string',
                                example: 'SN-ABC123'
                              }
                            }
                          }
                        }
                      },
                      reason: {
                        type: 'string',
                        nullable: true,
                        description: 'Refund reason',
                        example: 'Customer returned all items'
                      },
                      message: {
                        type: 'string',
                        example: 'Entire order refunded successfully'
                      }
                    }
                  }
                }
              }
            },
            '400': {
              description: 'Bad request - validation error, refund window expired, or items already refunded',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: {
                        type: 'string',
                        examples: [
                          'Order has no items to refund',
                          'Refund window expired. Orders can only be refunded within 18 days of purchase',
                          'Some items in this order have already been refunded. Cannot refund entire order.'
                        ]
                      },
                      orderDate: {
                        type: 'string',
                        format: 'date-time',
                        description: 'Order creation date (only for expired refund window)'
                      },
                      daysSinceOrder: {
                        type: 'integer',
                        description: 'Days since order was created (only for expired refund window)'
                      }
                    }
                  }
                }
              }
            },
            '401': {
              description: 'Unauthorized'
            },
            '403': {
              description: 'Forbidden - user not assigned to branch or trying to refund from another branch',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: {
                        type: 'string',
                        examples: [
                          'User is not assigned to any branch',
                          'Cannot refund orders from other branches'
                        ]
                      }
                    }
                  }
                }
              }
            },
            '404': {
              description: 'Order not found',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: {
                        type: 'string',
                        example: 'Order not found'
                      }
                    }
                  }
                }
              }
            },
            '500': {
              description: 'Internal server error',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: {
                        type: 'string',
                        example: 'Internal server error'
                      },
                      error: {
                        type: 'string',
                        description: 'Error details (only in development mode)'
                      }
                    }
                  }
                }
              }
            }
          },
          security: [{ BearerAuth: [] }]
        }
      },
      '/refunds/{id}': {
        get: {
          tags: ['Refunds'],
          summary: 'Get refund by ID (admin only)',
          description: 'Get detailed information about a specific refund by its ID. Only accessible to admins.',
          parameters: [
            {
              in: 'path',
              name: 'id',
              required: true,
              schema: { type: 'string', format: 'uuid' },
              description: 'Refund ID'
            }
          ],
          responses: {
            '200': {
              description: 'Refund details retrieved successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      refund: {
                        type: 'object',
                        properties: {
                          id: { type: 'string', format: 'uuid' },
                          orderItemId: { type: 'string', format: 'uuid' },
                          branchId: { type: 'string', format: 'uuid' },
                          quantity: { type: 'integer' },
                          status: { type: 'string', enum: ['pending', 'approved', 'rejected'] },
                          refundAmount: { type: 'number', format: 'decimal' },
                          requestedBy: { type: 'string', format: 'uuid' },
                          reason: { type: 'string' },
                          approvedBy: { type: 'string', format: 'uuid', nullable: true },
                          createdAt: { type: 'string', format: 'date-time' },
                          updatedAt: { type: 'string', format: 'date-time' },
                          OrderItem: {
                            type: 'object',
                            properties: {
                              id: { type: 'string', format: 'uuid' },
                              productId: { type: 'string', format: 'uuid' },
                              quantity: { type: 'integer' },
                              Product: {
                                type: 'object',
                                properties: {
                                  id: { type: 'string', format: 'uuid' },
                                  name: { type: 'string' },
                                  sku: { type: 'string' },
                                  price: { type: 'number', format: 'decimal' }
                                }
                              }
                            }
                          },
                          Branch: {
                            type: 'object',
                            properties: {
                              id: { type: 'string', format: 'uuid' },
                              name: { type: 'string' },
                              location: { type: 'string' }
                            }
                          },
                          RequestedByUser: {
                            type: 'object',
                            properties: {
                              id: { type: 'string', format: 'uuid' },
                              name: { type: 'string' },
                              email: { type: 'string' }
                            }
                          },
                          ApprovedByUser: {
                            type: 'object',
                            nullable: true,
                            properties: {
                              id: { type: 'string', format: 'uuid' },
                              name: { type: 'string' },
                              email: { type: 'string' }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            },
            '400': {
              description: 'Invalid refund ID format',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string', example: 'Invalid refund ID format' }
                    }
                  }
                }
              }
            },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden - admin access required' },
            '404': {
              description: 'Refund not found',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string', example: 'Refund not found' }
                    }
                  }
                }
              }
            },
            '500': {
              description: 'Internal server error',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string', example: 'Internal server error' }
                    }
                  }
                }
              }
            }
          },
          security: [{ BearerAuth: [] }]
        }
      },
      '/products/{id}/mark-printed': {
        post: {
          tags: ['Products'],
          summary: 'Mark product barcodes as printed (admin, stock_keeper)',
          description: 'Mark all barcodes for this product as printed. This marks the product and all its unassigned serials as printed across all locations.',
          parameters: [
            {
              in: 'path',
              name: 'id',
              schema: { type: 'string', format: 'uuid' },
              required: true,
              description: 'Product UUID'
            }
          ],
          requestBody: {
            required: false,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {}
                }
              }
            }
          },
          responses: {
            '200': {
              description: 'Product barcodes marked as printed successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string', example: 'Product barcodes marked as printed successfully' },
                      product: {
                        type: 'object',
                        properties: {
                          id: { type: 'string', format: 'uuid' },
                          name: { type: 'string' },
                          isPrinted: { type: 'boolean', example: true }
                        }
                      },
                      serialsMarked: { type: 'integer', example: 10, description: 'Number of serials marked as printed' }
                    }
                  }
                }
              }
            },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden' },
            '404': {
              description: 'Product not found',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string' }
                    }
                  }
                }
              }
            },
            '500': {
              description: 'Internal server error',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string' }
                    }
                  }
                }
              }
            }
          },
          security: [{ BearerAuth: [] }]
        }
      },
      '/products/{id}': {
        get: {
          tags: ['Products'],
          summary: 'Get specific product by ID (admin, stock_keeper)',
          description: 'Retrieve detailed information about a specific product including inventory, serials, and category details.',
          parameters: [
            {
              in: 'path',
              name: 'id',
              schema: { type: 'string', format: 'uuid' },
              required: true,
              description: 'Product UUID'
            }
          ],
          responses: {
            '200': {
              description: 'Product retrieved successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      product: {
                        type: 'object',
                        properties: {
                          id: { type: 'string', format: 'uuid' },
                          name: { type: 'string' },
                          sku: { type: 'string' },
                          barcode: { type: 'string' },
                          price: { type: 'number' },
                          cost: { type: 'number' },
                          currency: { type: 'string' },
                          category: {
                            type: 'object',
                            nullable: true,
                            properties: {
                              id: { type: 'string', format: 'uuid' },
                              name: { type: 'string' }
                            }
                          },
                          subCategory: {
                            type: 'object',
                            nullable: true,
                            properties: {
                              id: { type: 'string', format: 'uuid' },
                              name: { type: 'string' }
                            }
                          },
                          size: { type: 'string', nullable: true },
                          shoeSize: { type: 'string', nullable: true },
                          color: { type: 'string', nullable: true },
                          gender: { type: 'string' },
                          isPrinted: { type: 'boolean', description: 'Whether barcodes for this product have been printed' },
                          totalQuantity: { type: 'integer', description: 'Total quantity across all warehouses/branches' },
                          inventory: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                id: { type: 'string', format: 'uuid' },
                                warehouse: {
                                  type: 'object',
                                  nullable: true,
                                  properties: {
                                    id: { type: 'string', format: 'uuid' },
                                    name: { type: 'string' },
                                    type: { type: 'string', enum: ['central', 'stock'] },
                                    location: { type: 'string' }
                                  }
                                },
                                branch: {
                                  type: 'object',
                                  nullable: true,
                                  properties: {
                                    id: { type: 'string', format: 'uuid' },
                                    name: { type: 'string' },
                                    location: { type: 'string' }
                                  }
                                },
                                quantity: { type: 'integer' }
                              }
                            }
                          },
                          serials: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                id: { type: 'string', format: 'uuid' },
                                serialCode: { type: 'string', description: 'EAN-13 scannable barcode' },
                                humanCode: { type: 'string', description: 'Human-readable serial code' },
                                note: { type: 'string' },
                                isPrinted: { type: 'boolean', description: 'Whether this serial barcode has been printed' },
                                batchId: { type: 'string', format: 'uuid', nullable: true, description: 'Batch ID for grouping serials created together' },
                                warehouse: {
                                  type: 'object',
                                  nullable: true,
                                  properties: {
                                    id: { type: 'string', format: 'uuid' },
                                    name: { type: 'string' },
                                    type: { type: 'string', enum: ['central', 'stock'] }
                                  }
                                },
                                branch: {
                                  type: 'object',
                                  nullable: true,
                                  properties: {
                                    id: { type: 'string', format: 'uuid' },
                                    name: { type: 'string' }
                                  }
                                },
                                orderItemId: { type: 'string', format: 'uuid', nullable: true },
                                createdAt: { type: 'string', format: 'date-time' },
                                updatedAt: { type: 'string', format: 'date-time' }
                              }
                            }
                          },
                          createdAt: { type: 'string', format: 'date-time' },
                          updatedAt: { type: 'string', format: 'date-time' }
                        }
                      }
                    }
                  }
                }
              }
            },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden' },
            '404': {
              description: 'Product not found',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string' }
                    }
                  }
                }
              }
            },
            '500': {
              description: 'Internal server error',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string' }
                    }
                  }
                }
              }
            }
          },
          security: [{ BearerAuth: [] }]
        },
        put: {
          tags: ['Products'],
          summary: 'Update product (admin, stock_keeper) - fields and quantity adjust with print tracking',
          description: 'Update one or more fields of a product. At least one field must be provided. Also supports increasing or decreasing inventory quantity at a specific warehouse/branch with serial synchronization and print tracking. When decreasing printed inventory, specific serials must be selected.',
          parameters: [
            {
              in: 'path',
              name: 'id',
              schema: { type: 'string', format: 'uuid' },
              required: true,
              description: 'Product UUID'
            }
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    name: {
                      type: 'string',
                      description: 'Product name (optional)'
                    },
                    price: {
                      type: 'number',
                      format: 'decimal',
                      description: 'Product price (optional)'
                    },
                    cost: {
                      type: 'number',
                      format: 'decimal',
                      description: 'Product cost (optional)'
                    },
                    currency: {
                      type: 'string',
                      description: 'ISO 4217 three-letter currency code (optional)',
                      minLength: 3,
                      maxLength: 3
                    },
                    size: {
                      type: 'string',
                      description: 'Size for clothing (optional)'
                    },
                    color: {
                      type: 'string',
                      description: 'Product color (optional - can be added to existing products)'
                    },
                    shoeSize: {
                      type: 'string',
                      description: 'Shoe size (optional)'
                    },
                    gender: {
                      type: 'string',
                      enum: ['Men', 'Women', 'Unisex'],
                      description: 'Target gender (optional)'
                    },
                    operation: {
                      type: 'string',
                      enum: ['increase', 'decrease'],
                      description: "Quantity operation: 'increase' or 'decrease' (optional). Print tracking applies automatically."
                    },
                    quantity: {
                      type: 'integer',
                      minimum: 1,
                      description: 'Quantity to add/remove (required when operation is provided). Location is required.'
                    },
                    warehouseId: {
                      type: 'string',
                      format: 'uuid',
                      description: 'Target warehouse for quantity change (required for increase and decrease; one of warehouseId or branchId)'
                    },
                    branchId: {
                      type: 'string',
                      format: 'uuid',
                      description: 'Target branch for quantity change (required for increase and decrease; one of warehouseId or branchId)'
                    },
                    selectedSerials: {
                      type: 'array',
                      items: {
                        type: 'string',
                        format: 'uuid'
                      },
                      description: 'Array of serial IDs to delete (REQUIRED when decreasing printed inventory). Must match quantity. Returned in error if not provided for printed inventory.'
                    }
                  },
                  minProperties: 1
                }
              }
            }
          },
          responses: {
            '200': {
              description: 'Product updated successfully (and quantity adjusted if requested)',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      product: {
                        type: 'object',
                        properties: {
                          id: { type: 'string', format: 'uuid' },
                          name: { type: 'string' },
                          sku: { type: 'string' },
                          barcode: { type: 'string' },
                          price: { type: 'number' },
                          cost: { type: 'number' },
                          currency: { type: 'string' },
                          category: {
                            type: 'object',
                            nullable: true,
                            properties: {
                              id: { type: 'string', format: 'uuid' },
                              name: { type: 'string' }
                            }
                          },
                          subCategory: {
                            type: 'object',
                            nullable: true,
                            properties: {
                              id: { type: 'string', format: 'uuid' },
                              name: { type: 'string' }
                            }
                          },
                          size: { type: 'string', nullable: true },
                          shoeSize: { type: 'string', nullable: true },
                          color: { type: 'string', nullable: true },
                          gender: { type: 'string' },
                          totalQuantity: { type: 'integer' },
                          inventory: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                id: { type: 'string', format: 'uuid' },
                                warehouse: {
                                  type: 'object',
                                  nullable: true,
                                  properties: {
                                    id: { type: 'string', format: 'uuid' },
                                    name: { type: 'string' },
                                    type: { type: 'string', enum: ['central', 'stock'] }
                                  }
                                },
                                branch: {
                                  type: 'object',
                                  nullable: true,
                                  properties: {
                                    id: { type: 'string', format: 'uuid' },
                                    name: { type: 'string' }
                                  }
                                },
                                quantity: { type: 'integer' }
                              }
                            }
                          },
                          createdAt: { type: 'string', format: 'date-time' },
                          updatedAt: { type: 'string', format: 'date-time' }
                        }
                      },
                      createdSerials: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'string', format: 'uuid' },
                            serialCode: { type: 'string' },
                            warehouseId: { type: 'string', format: 'uuid', nullable: true },
                            branchId: { type: 'string', format: 'uuid', nullable: true },
                            batchId: { type: 'string', format: 'uuid', description: 'Batch ID for grouping serials created together' }
                          }
                        }
                      },
                      deletedSerials: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'string', format: 'uuid' },
                            serialCode: { type: 'string' },
                            warehouseId: { type: 'string', format: 'uuid', nullable: true },
                            branchId: { type: 'string', format: 'uuid', nullable: true }
                          }
                        }
                      },
                      updatedInventory: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'string', format: 'uuid' },
                            warehouseId: { type: 'string', format: 'uuid', nullable: true },
                            branchId: { type: 'string', format: 'uuid', nullable: true },
                            quantity: { type: 'integer' },
                            wasPrinted: { type: 'boolean', description: 'Indicates if this inventory was previously marked as printed (relevant for increase operations)' },
                            newBatchId: { type: 'string', format: 'uuid', description: 'Batch ID for newly created serials (returned on increase operations)' }
                          }
                        }
                      },
                      message: { type: 'string' }
                    }
                  }
                }
              }
            },
            '400': {
              description: 'Validation error or serial selection required for printed inventory',
              content: {
                'application/json': {
                  schema: {
                    oneOf: [
                      {
                        type: 'object',
                        properties: {
                          message: { type: 'string', example: 'Validation error message' }
                        }
                      },
                      {
                        type: 'object',
                        description: 'Serial selection required for printed inventory',
                        properties: {
                          message: { type: 'string', example: 'Since barcodes were printed, you must select exactly 2 serial(s) to remove' },
                          requiresSerialSelection: { type: 'boolean', example: true },
                          availableSerials: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                id: { type: 'string', format: 'uuid' },
                                serialCode: { type: 'string' },
                                humanCode: { type: 'string' }
                              }
                            }
                          }
                        }
                      }
                    ]
                  }
                }
              }
            },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden' },
            '404': {
              description: 'Product not found',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string' }
                    }
                  }
                }
              }
            },
            '500': {
              description: 'Internal server error',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string' }
                    }
                  }
                }
              }
            }
          },
          security: [{ BearerAuth: [] }]
        },
        delete: {
          tags: ['Products'],
          summary: 'Delete product or reduce quantity (admin, stock_keeper)',
          description: 'Delete entire product with all inventory or reduce specific quantity. Supports location-specific deletion and serial tracking.',
          parameters: [
            {
              in: 'path',
              name: 'id',
              schema: { type: 'string', format: 'uuid' },
              required: true,
              description: 'Product UUID'
            }
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    deleteAll: {
                      type: 'boolean',
                      default: false,
                      description: 'Delete entire product and all inventory (true) or reduce quantity (false)'
                    },
                    quantity: {
                      type: 'integer',
                      minimum: 1,
                      description: 'Number of units to delete (required when deleteAll is false)'
                    },
                    warehouseId: {
                      type: 'string',
                      format: 'uuid',
                      description: 'Delete from specific warehouse (optional)'
                    },
                    branchId: {
                      type: 'string',
                      format: 'uuid',
                      description: 'Delete from specific branch (optional)'
                    }
                  }
                }
              }
            }
          },
          responses: {
            '200': {
              description: 'Product deleted successfully',
              content: {
                'application/json': {
                  schema: {
                    oneOf: [
                      {
                        type: 'object',
                        properties: {
                          message: { type: 'string' },
                          deletedProduct: {
                            type: 'object',
                            properties: {
                              id: { type: 'string', format: 'uuid' },
                              name: { type: 'string' },
                              sku: { type: 'string' },
                              totalQuantityDeleted: { type: 'integer' }
                            }
                          }
                        }
                      },
                      {
                        type: 'object',
                        properties: {
                          message: { type: 'string' },
                          deletedQuantity: { type: 'integer' },
                          deletedSerials: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                id: { type: 'string', format: 'uuid' },
                                serialCode: { type: 'string' },
                                humanCode: { type: 'string' },
                                location: { type: 'string' }
                              }
                            }
                          },
                          updatedInventory: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                id: { type: 'string', format: 'uuid' },
                                location: { type: 'string' },
                                remainingQuantity: { type: 'integer' }
                              }
                            }
                          },
                          remainingTotalQuantity: { type: 'integer' }
                        }
                      }
                    ]
                  }
                }
              }
            },
            '400': {
              description: 'Validation error',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string' }
                    }
                  }
                }
              }
            },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden' },
            '404': {
              description: 'Product not found or no inventory found',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string' }
                    }
                  }
                }
              }
            },
            '500': {
              description: 'Internal server error',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string' }
                    }
                  }
                }
              }
            }
          },
          security: [{ BearerAuth: [] }]
        }
      },
      '/replacements': {
        post: {
          tags: ['Replacements'],
          summary: 'Create a product replacement',
          description: 'Process a replacement where a customer returns items and receives different items in exchange. Handles inventory management, serial tracking, and financial calculations. Available to cashiers and branch managers.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['originalOrderItemId', 'returnSerialIds', 'newItems', 'paymentMethod'],
                  properties: {
                    originalOrderItemId: {
                      type: 'string',
                      format: 'uuid',
                      description: 'ID of the order item being returned'
                    },
                    returnSerialIds: {
                      type: 'array',
                      items: { type: 'string', format: 'uuid' },
                      description: 'Array of serial IDs being returned',
                      example: ['serial-uuid-1', 'serial-uuid-2']
                    },
                    newItems: {
                      type: 'array',
                      items: {
                        type: 'object',
                        required: ['productId', 'serialIds'],
                        properties: {
                          productId: {
                            type: 'string',
                            format: 'uuid',
                            description: 'Product ID for replacement item'
                          },
                          serialIds: {
                            type: 'array',
                            items: { type: 'string', format: 'uuid' },
                            description: 'Serial IDs to assign to this product'
                          }
                        }
                      },
                      description: 'Array of new products and their serials for replacement'
                    },
                    paymentMethod: {
                      type: 'string',
                      enum: ['cash', 'visa', 'mixed', 'none'],
                      description: 'Payment method (use "none" if customer receives money back or even exchange)'
                    },
                    cashAmount: {
                      type: 'number',
                      format: 'decimal',
                      description: 'Amount paid in cash (required if paymentMethod is cash or mixed)'
                    },
                    visaAmount: {
                      type: 'number',
                      format: 'decimal',
                      description: 'Amount paid via visa (required if paymentMethod is visa or mixed)'
                    },
                    reason: {
                      type: 'string',
                      description: 'Reason for the replacement'
                    }
                  }
                }
              }
            }
          },
          responses: {
            '201': {
              description: 'Replacement created successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      replacement: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          originalOrderId: { type: 'string' },
                          originalOrderNumber: { type: 'string' },
                          newOrderId: { type: 'string' },
                          newOrderNumber: { type: 'string' },
                          status: { type: 'string' },
                          reason: { type: 'string' },
                          createdAt: { type: 'string', format: 'date-time' }
                        }
                      },
                      financialSummary: {
                        type: 'object',
                        properties: {
                          returnedAmount: { type: 'number' },
                          newItemsAmount: { type: 'number' },
                          priceDifference: { type: 'number' },
                          customerPayment: { type: 'number', description: 'Amount customer paid (if new items cost more)' },
                          refundToCustomer: { type: 'number', description: 'Amount refunded to customer (if new items cost less)' },
                          paymentMethod: { type: 'string' },
                          transactionType: { type: 'string', description: 'Human-readable transaction summary' }
                        }
                      },
                      transactionLog: {
                        type: 'object',
                        description: 'Complete transaction log with all details for audit trail'
                      },
                      message: { type: 'string' }
                    }
                  }
                }
              }
            },
            '400': {
              description: 'Bad request - validation error',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string' }
                    }
                  }
                }
              }
            },
            '403': {
              description: 'Forbidden - user not assigned to branch or wrong branch',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string' }
                    }
                  }
                }
              }
            },
            '404': {
              description: 'Order item or product not found',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string' }
                    }
                  }
                }
              }
            },
            '500': {
              description: 'Internal server error',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string' }
                    }
                  }
                }
              }
            }
          },
          security: [{ BearerAuth: [] }]
        },
        get: {
          tags: ['Replacements'],
          summary: 'List all replacements (Admin only)',
          description: 'Get a list of all replacements system-wide. Only accessible to administrators.',
          parameters: [
            {
              in: 'query',
              name: 'status',
              schema: {
                type: 'string',
                enum: ['completed', 'cancelled']
              },
              description: 'Filter by replacement status'
            },
            {
              in: 'query',
              name: 'limit',
              schema: {
                type: 'integer',
                default: 50
              },
              description: 'Maximum number of results to return'
            },
            {
              in: 'query',
              name: 'offset',
              schema: {
                type: 'integer',
                default: 0
              },
              description: 'Number of results to skip'
            }
          ],
          responses: {
            '200': {
              description: 'List of replacements',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      replacements: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'string' },
                            originalOrderNumber: { type: 'string' },
                            newOrderNumber: { type: 'string' },
                            customer: {
                              type: 'object',
                              properties: {
                                id: { type: 'string' },
                                name: { type: 'string' },
                                phone: { type: 'string' }
                              }
                            },
                            returnedAmount: { type: 'number' },
                            newItemsAmount: { type: 'number' },
                            priceDifference: { type: 'number' },
                            refundToCustomer: { type: 'number' },
                            customerPayment: { type: 'number' },
                            status: { type: 'string' },
                            serialsReturned: {
                              type: 'array',
                              items: {
                                type: 'object',
                                properties: {
                                  id: { type: 'string' },
                                  serialCode: { type: 'string' },
                                  productId: { type: 'string' }
                                }
                              },
                              description: 'Serial codes of items returned by customer'
                            },
                            createdAt: { type: 'string', format: 'date-time' }
                          }
                        }
                      },
                      total: { type: 'integer' },
                      limit: { type: 'integer' },
                      offset: { type: 'integer' }
                    }
                  }
                }
              }
            },
            '401': {
              description: 'Unauthorized',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string' }
                    }
                  }
                }
              }
            },
            '403': {
              description: 'Forbidden - insufficient permissions',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string' }
                    }
                  }
                }
              }
            },
            '500': {
              description: 'Internal server error',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string' }
                    }
                  }
                }
              }
            }
          },
          security: [{ BearerAuth: [] }]
        }
      },
      '/replacements/branch': {
        get: {
          tags: ['Replacements'],
          summary: 'List replacements for user\'s branch',
          description: 'Get a list of replacements for the authenticated user\'s branch. Available to branch managers and cashiers.',
          parameters: [
            {
              in: 'query',
              name: 'status',
              schema: {
                type: 'string',
                enum: ['completed', 'cancelled']
              },
              description: 'Filter by replacement status'
            },
            {
              in: 'query',
              name: 'limit',
              schema: {
                type: 'integer',
                default: 50
              },
              description: 'Maximum number of results to return'
            },
            {
              in: 'query',
              name: 'offset',
              schema: {
                type: 'integer',
                default: 0
              },
              description: 'Number of results to skip'
            }
          ],
          responses: {
            '200': {
              description: 'List of branch replacements',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      replacements: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'string' },
                            originalOrderNumber: { type: 'string' },
                            newOrderNumber: { type: 'string' },
                            customer: {
                              type: 'object',
                              properties: {
                                id: { type: 'string' },
                                name: { type: 'string' },
                                phone: { type: 'string' }
                              }
                            },
                            returnedAmount: { type: 'number' },
                            newItemsAmount: { type: 'number' },
                            priceDifference: { type: 'number' },
                            refundToCustomer: { type: 'number', description: 'Money returned to customer' },
                            customerPayment: { type: 'number', description: 'Additional payment from customer' },
                            paymentMethod: { type: 'string' },
                            status: { type: 'string' },
                            serialsReturned: {
                              type: 'array',
                              items: {
                                type: 'object',
                                properties: {
                                  id: { type: 'string' },
                                  serialCode: { type: 'string' },
                                  productId: { type: 'string' }
                                }
                              },
                              description: 'Serial codes of items returned by customer'
                            },
                            processedBy: {
                              type: 'object',
                              properties: {
                                id: { type: 'string' },
                                name: { type: 'string' },
                                role: { type: 'string' }
                              }
                            },
                            createdAt: { type: 'string', format: 'date-time' }
                          }
                        }
                      },
                      total: { type: 'integer' },
                      limit: { type: 'integer' },
                      offset: { type: 'integer' }
                    }
                  }
                }
              }
            },
            '401': {
              description: 'Unauthorized',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string' }
                    }
                  }
                }
              }
            },
            '403': {
              description: 'Forbidden - user not assigned to branch',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string' }
                    }
                  }
                }
              }
            },
            '500': {
              description: 'Internal server error',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string' }
                    }
                  }
                }
              }
            }
          },
          security: [{ BearerAuth: [] }]
        }
      },
      '/replacements/{id}': {
        get: {
          tags: ['Replacements'],
          summary: 'Get replacement details by ID',
          description: 'Get detailed information about a specific replacement including complete transaction log, items, and serials. Available to all authenticated users (with branch restriction for non-admins).',
          parameters: [
            {
              in: 'path',
              name: 'id',
              required: true,
              schema: {
                type: 'string',
                format: 'uuid'
              },
              description: 'Replacement ID'
            }
          ],
          responses: {
            '200': {
              description: 'Replacement details',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      replacement: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          originalOrder: {
                            type: 'object',
                            properties: {
                              orderId: { type: 'string' },
                              orderNumber: { type: 'string' },
                              orderDate: { type: 'string', format: 'date-time' },
                              product: {
                                type: 'object',
                                properties: {
                                  id: { type: 'string' },
                                  name: { type: 'string' },
                                  sku: { type: 'string' },
                                  price: { type: 'number' }
                                }
                              },
                              serialsReturned: {
                                type: 'array',
                                items: {
                                  type: 'object',
                                  properties: {
                                    id: { type: 'string' },
                                    serialCode: { type: 'string' }
                                  }
                                }
                              }
                            }
                          },
                          newOrder: {
                            type: 'object',
                            properties: {
                              orderId: { type: 'string' },
                              orderNumber: { type: 'string' },
                              orderDate: { type: 'string', format: 'date-time' },
                              items: {
                                type: 'array',
                                items: {
                                  type: 'object',
                                  properties: {
                                    orderItemId: { type: 'string' },
                                    product: {
                                      type: 'object',
                                      properties: {
                                        id: { type: 'string' },
                                        name: { type: 'string' },
                                        sku: { type: 'string' },
                                        price: { type: 'number' }
                                      }
                                    },
                                    quantity: { type: 'integer' },
                                    serials: {
                                      type: 'array',
                                      items: {
                                        type: 'object',
                                        properties: {
                                          id: { type: 'string' },
                                          serialCode: { type: 'string' }
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          },
                          financial: {
                            type: 'object',
                            properties: {
                              returnedAmount: { type: 'number' },
                              newItemsAmount: { type: 'number' },
                              priceDifference: { type: 'number' },
                              refundToCustomer: { type: 'number', description: 'Money returned to customer' },
                              customerPayment: { type: 'number', description: 'Additional payment from customer' },
                              paymentMethod: { type: 'string' },
                              cashAmount: { type: 'number', nullable: true },
                              visaAmount: { type: 'number', nullable: true }
                            }
                          },
                          transactionLog: {
                            type: 'object',
                            description: 'Complete JSON log of the replacement transaction including all items, serials, and financial details'
                          },
                          status: { type: 'string' },
                          reason: { type: 'string' },
                          processedBy: {
                            type: 'object',
                            properties: {
                              id: { type: 'string' },
                              name: { type: 'string' },
                              email: { type: 'string' },
                              role: { type: 'string' }
                            }
                          },
                          createdAt: { type: 'string', format: 'date-time' },
                          updatedAt: { type: 'string', format: 'date-time' }
                        }
                      }
                    }
                  }
                }
              }
            },
            '401': {
              description: 'Unauthorized',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string' }
                    }
                  }
                }
              }
            },
            '403': {
              description: 'Forbidden - cannot view replacements from other branches',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string' }
                    }
                  }
                }
              }
            },
            '404': {
              description: 'Replacement not found',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string' }
                    }
                  }
                }
              }
            },
            '500': {
              description: 'Internal server error',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string' }
                    }
                  }
                }
              }
            }
          },
          security: [{ BearerAuth: [] }]
        }
      },
      '/cashier-discounts': {
        post: {
          tags: ['Cashier Discounts'],
          summary: 'Create a discount for a cashier (Admin only)',
          description: 'Create a time-bound discount that a cashier can choose to apply to orders. Admin sets the percentage and validity period.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['cashierId', 'discountPercentage', 'startDate', 'endDate'],
                  properties: {
                    cashierId: {
                      type: 'string',
                      format: 'uuid',
                      description: 'ID of the cashier/branch manager to assign discount to'
                    },
                    discountPercentage: {
                      type: 'number',
                      format: 'decimal',
                      minimum: 0,
                      maximum: 100,
                      description: 'Discount percentage (0-100)',
                      example: 10
                    },
                    startDate: {
                      type: 'string',
                      format: 'date-time',
                      description: 'When the discount becomes active',
                      example: '2025-10-10T00:00:00Z'
                    },
                    endDate: {
                      type: 'string',
                      format: 'date-time',
                      description: 'When the discount expires',
                      example: '2025-10-20T23:59:59Z'
                    },
                    description: {
                      type: 'string',
                      description: 'Optional description or reason for discount'
                    }
                  }
                }
              }
            }
          },
          responses: {
            '201': {
              description: 'Discount created successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string' },
                      discount: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          cashier: {
                            type: 'object',
                            properties: {
                              id: { type: 'string' },
                              name: { type: 'string' },
                              email: { type: 'string' },
                              role: { type: 'string' }
                            }
                          },
                          discountPercentage: { type: 'number' },
                          startDate: { type: 'string', format: 'date-time' },
                          endDate: { type: 'string', format: 'date-time' },
                          isActive: { type: 'boolean' },
                          description: { type: 'string' },
                          createdAt: { type: 'string', format: 'date-time' }
                        }
                      }
                    }
                  }
                }
              }
            },
            '400': { description: 'Bad request - validation error' },
            '404': { description: 'Cashier not found' },
            '409': { description: 'Overlapping active discount exists' },
            '500': { description: 'Internal server error' }
          },
          security: [{ BearerAuth: [] }]
        },
        get: {
          tags: ['Cashier Discounts'],
          summary: 'List all cashier discounts (Admin only)',
          description: 'Get a list of all cashier discounts with filtering options',
          parameters: [
            {
              in: 'query',
              name: 'isActive',
              schema: { type: 'boolean' },
              description: 'Filter by active status'
            },
            {
              in: 'query',
              name: 'cashierId',
              schema: { type: 'string', format: 'uuid' },
              description: 'Filter by cashier ID'
            },
            {
              in: 'query',
              name: 'limit',
              schema: { type: 'integer', default: 50 },
              description: 'Maximum number of results'
            },
            {
              in: 'query',
              name: 'offset',
              schema: { type: 'integer', default: 0 },
              description: 'Number of results to skip'
            }
          ],
          responses: {
            '200': {
              description: 'List of cashier discounts',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      discounts: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'string' },
                            cashier: {
                              type: 'object',
                              properties: {
                                id: { type: 'string' },
                                name: { type: 'string' },
                                email: { type: 'string' },
                                role: { type: 'string' },
                                branchId: { type: 'string' }
                              }
                            },
                            discountPercentage: { type: 'number' },
                            startDate: { type: 'string', format: 'date-time' },
                            endDate: { type: 'string', format: 'date-time' },
                            isActive: { type: 'boolean' },
                            description: { type: 'string' },
                            createdBy: {
                              type: 'object',
                              properties: {
                                id: { type: 'string' },
                                name: { type: 'string' },
                                email: { type: 'string' }
                              }
                            },
                            createdAt: { type: 'string', format: 'date-time' },
                            updatedAt: { type: 'string', format: 'date-time' }
                          }
                        }
                      },
                      total: { type: 'integer' },
                      limit: { type: 'integer' },
                      offset: { type: 'integer' }
                    }
                  }
                }
              }
            },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden' },
            '500': { description: 'Internal server error' }
          },
          security: [{ BearerAuth: [] }]
        }
      },
      '/cashier-discounts/my-discount': {
        get: {
          tags: ['Cashier Discounts'],
          summary: 'Get cashier\'s active discount (Cashier/Branch Manager)',
          description: 'Retrieve the currently active discount for the authenticated cashier, if any',
          responses: {
            '200': {
              description: 'Cashier discount information',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      hasDiscount: { type: 'boolean' },
                      discount: {
                        type: 'object',
                        nullable: true,
                        properties: {
                          id: { type: 'string' },
                          discountPercentage: { type: 'number' },
                          startDate: { type: 'string', format: 'date-time' },
                          endDate: { type: 'string', format: 'date-time' },
                          description: { type: 'string' }
                        }
                      },
                      message: { type: 'string' }
                    }
                  }
                }
              }
            },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden' },
            '500': { description: 'Internal server error' }
          },
          security: [{ BearerAuth: [] }]
        }
      },
      '/cashier-discounts/{id}': {
        put: {
          tags: ['Cashier Discounts'],
          summary: 'Update cashier discount (Admin only)',
          description: 'Update discount percentage, dates, active status, or description',
          parameters: [
            {
              in: 'path',
              name: 'id',
              required: true,
              schema: { type: 'string', format: 'uuid' },
              description: 'Discount ID'
            }
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    discountPercentage: {
                      type: 'number',
                      format: 'decimal',
                      minimum: 0,
                      maximum: 100
                    },
                    startDate: {
                      type: 'string',
                      format: 'date-time'
                    },
                    endDate: {
                      type: 'string',
                      format: 'date-time'
                    },
                    isActive: {
                      type: 'boolean',
                      description: 'Set to false to disable discount'
                    },
                    description: {
                      type: 'string'
                    }
                  }
                }
              }
            }
          },
          responses: {
            '200': {
              description: 'Discount updated successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string' },
                      discount: { type: 'object' }
                    }
                  }
                }
              }
            },
            '400': { description: 'Bad request - validation error' },
            '404': { description: 'Discount not found' },
            '500': { description: 'Internal server error' }
          },
          security: [{ BearerAuth: [] }]
        },
        delete: {
          tags: ['Cashier Discounts'],
          summary: 'Delete cashier discount (Admin only)',
          description: 'Permanently delete a cashier discount. Orders that used this discount will retain their discount information.',
          parameters: [
            {
              in: 'path',
              name: 'id',
              required: true,
              schema: { type: 'string', format: 'uuid' },
              description: 'Discount ID'
            }
          ],
          responses: {
            '200': {
              description: 'Discount deleted successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string' },
                      ordersAffected: { type: 'integer' },
                      note: { type: 'string' }
                    }
                  }
                }
              }
            },
            '404': { description: 'Discount not found' },
            '500': { description: 'Internal server error' }
          },
          security: [{ BearerAuth: [] }]
        }
      },
      '/shifts/start': {
        post: {
          tags: ['Shifts'],
          summary: 'Start a new shift (Cashier/Branch Manager)',
          description: 'Start a new shift for the authenticated cashier. Only one active shift is allowed per cashier at a time.',
          responses: {
            '201': {
              description: 'Shift started successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string' },
                      shift: {
                        type: 'object',
                        properties: {
                          id: { type: 'string', format: 'uuid' },
                          cashier: {
                            type: 'object',
                            properties: {
                              id: { type: 'string', format: 'uuid' },
                              name: { type: 'string' },
                              email: { type: 'string' }
                            }
                          },
                          branch: {
                            type: 'object',
                            properties: {
                              id: { type: 'string', format: 'uuid' },
                              name: { type: 'string' },
                              location: { type: 'string' }
                            }
                          },
                          startTime: { type: 'string', format: 'date-time' },
                          status: { type: 'string', enum: ['active'] }
                        }
                      }
                    }
                  }
                }
              }
            },
            '400': { description: 'Already has an active shift' },
            '403': { description: 'User not assigned to any branch' },
            '500': { description: 'Internal server error' }
          },
          security: [{ BearerAuth: [] }]
        }
      },
      '/shifts/end': {
        post: {
          tags: ['Shifts'],
          summary: 'End current shift (Cashier/Branch Manager)',
          description: 'End the currently active shift and calculate all sales statistics including total sales, cash/visa breakdown, refunds processed, net sales, and products sold.',
          responses: {
            '200': {
              description: 'Shift ended successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string' },
                      shift: {
                        type: 'object',
                        properties: {
                          id: { type: 'string', format: 'uuid' },
                          cashier: {
                            type: 'object',
                            properties: {
                              id: { type: 'string', format: 'uuid' },
                              name: { type: 'string' },
                              email: { type: 'string' }
                            }
                          },
                          branch: {
                            type: 'object',
                            properties: {
                              id: { type: 'string', format: 'uuid' },
                              name: { type: 'string' },
                              location: { type: 'string' }
                            }
                          },
                          startTime: { type: 'string', format: 'date-time' },
                          endTime: { type: 'string', format: 'date-time' },
                          status: { type: 'string', enum: ['completed'] },
                          totalSales: { type: 'number', format: 'decimal' },
                          totalOrders: { type: 'integer' },
                          cashSales: { type: 'number', format: 'decimal' },
                          visaSales: { type: 'number', format: 'decimal' },
                          totalRefunds: { type: 'number', format: 'decimal' },
                          refundCount: { type: 'integer' },
                          totalReplacements: { type: 'number', format: 'decimal' },
                          replacementCount: { type: 'integer' },
                          totalReplacementRefunds: { type: 'number', format: 'decimal' },
                          totalReplacementPayments: { type: 'number', format: 'decimal' },
                          netSales: { type: 'number', format: 'decimal' },
                          productsSold: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                productId: { type: 'string', format: 'uuid' },
                                productName: { type: 'string' },
                                sku: { type: 'string' },
                                quantity: { type: 'integer' },
                                unitPrice: { type: 'number' },
                                totalPrice: { type: 'number' }
                              }
                            }
                          },
                          productsRefunded: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                productId: { type: 'string', format: 'uuid' },
                                productName: { type: 'string' },
                                sku: { type: 'string' },
                                quantity: { type: 'integer' },
                                refundAmount: { type: 'number', format: 'decimal' }
                              }
                            }
                          },
                          productsReplaced: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                productId: { type: 'string', format: 'uuid' },
                                productName: { type: 'string' },
                                sku: { type: 'string' },
                                returnedAmount: { type: 'number', format: 'decimal' },
                                newItemsAmount: { type: 'number', format: 'decimal' },
                                priceDifference: { type: 'number', format: 'decimal' }
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
            '404': { description: 'No active shift found' },
            '500': { description: 'Internal server error' }
          },
          security: [{ BearerAuth: [] }]
        }
      },
      '/shifts/current': {
        get: {
          tags: ['Shifts'],
          summary: 'Get current active shift (Cashier/Branch Manager)',
          description: 'Get the currently active shift with real-time sales statistics including refunds and net sales',
          responses: {
            '200': {
              description: 'Current shift information',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      shift: {
                        type: 'object',
                        properties: {
                          id: { type: 'string', format: 'uuid' },
                          cashier: {
                            type: 'object',
                            properties: {
                              id: { type: 'string', format: 'uuid' },
                              name: { type: 'string' },
                              email: { type: 'string' }
                            }
                          },
                          branch: {
                            type: 'object',
                            properties: {
                              id: { type: 'string', format: 'uuid' },
                              name: { type: 'string' },
                              location: { type: 'string' }
                            }
                          },
                          startTime: { type: 'string', format: 'date-time' },
                          status: { type: 'string', enum: ['active'] },
                          currentTotalSales: { type: 'number', format: 'decimal' },
                          currentTotalOrders: { type: 'integer' },
                          currentCashSales: { type: 'number', format: 'decimal' },
                          currentVisaSales: { type: 'number', format: 'decimal' },
                          currentTotalRefunds: { type: 'number', format: 'decimal' },
                          currentRefundCount: { type: 'integer' },
                          currentTotalReplacements: { type: 'number', format: 'decimal' },
                          currentReplacementCount: { type: 'integer' },
                          currentTotalReplacementRefunds: { type: 'number', format: 'decimal' },
                          currentTotalReplacementPayments: { type: 'number', format: 'decimal' },
                          currentNetSales: { type: 'number', format: 'decimal' },
                          currentProductsRefunded: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                productId: { type: 'string', format: 'uuid' },
                                productName: { type: 'string' },
                                sku: { type: 'string' },
                                quantity: { type: 'integer' },
                                refundAmount: { type: 'number', format: 'decimal' }
                              }
                            }
                          },
                          currentProductsReplaced: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                productId: { type: 'string', format: 'uuid' },
                                productName: { type: 'string' },
                                sku: { type: 'string' },
                                returnedAmount: { type: 'number', format: 'decimal' },
                                newItemsAmount: { type: 'number', format: 'decimal' },
                                priceDifference: { type: 'number', format: 'decimal' }
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
            '404': { description: 'No active shift found' },
            '500': { description: 'Internal server error' }
          },
          security: [{ BearerAuth: [] }]
        }
      },
      '/shifts': {
        get: {
          tags: ['Shifts'],
          summary: 'Get all shifts (Admin only)',
          description: 'Get all shifts across all branches with filtering and pagination options',
          parameters: [
            {
              in: 'query',
              name: 'cashierId',
              schema: { type: 'string', format: 'uuid' },
              description: 'Filter by cashier ID'
            },
            {
              in: 'query',
              name: 'branchId',
              schema: { type: 'string', format: 'uuid' },
              description: 'Filter by branch ID'
            },
            {
              in: 'query',
              name: 'status',
              schema: { type: 'string', enum: ['active', 'completed'] },
              description: 'Filter by shift status'
            },
            {
              in: 'query',
              name: 'startDate',
              schema: { type: 'string', format: 'date-time' },
              description: 'Filter shifts from this date'
            },
            {
              in: 'query',
              name: 'endDate',
              schema: { type: 'string', format: 'date-time' },
              description: 'Filter shifts until this date'
            },
            {
              in: 'query',
              name: 'page',
              schema: { type: 'integer', default: 1 },
              description: 'Page number'
            },
            {
              in: 'query',
              name: 'limit',
              schema: { type: 'integer', default: 50 },
              description: 'Results per page'
            }
          ],
          responses: {
            '200': {
              description: 'List of shifts',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      shifts: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'string', format: 'uuid' },
                            cashier: {
                              type: 'object',
                              properties: {
                                id: { type: 'string', format: 'uuid' },
                                name: { type: 'string' },
                                email: { type: 'string' },
                                role: { type: 'string' }
                              }
                            },
                            branch: {
                              type: 'object',
                              properties: {
                                id: { type: 'string', format: 'uuid' },
                                name: { type: 'string' },
                                location: { type: 'string' }
                              }
                            },
                            startTime: { type: 'string', format: 'date-time' },
                            endTime: { type: 'string', format: 'date-time', nullable: true },
                            status: { type: 'string', enum: ['active', 'completed'] },
                            totalSales: { type: 'number', format: 'decimal' },
                            totalOrders: { type: 'integer' },
                            cashSales: { type: 'number', format: 'decimal' },
                            visaSales: { type: 'number', format: 'decimal' },
                            totalRefunds: { type: 'number', format: 'decimal' },
                            refundCount: { type: 'integer' },
                            totalReplacements: { type: 'number', format: 'decimal' },
                            replacementCount: { type: 'integer' },
                            totalReplacementRefunds: { type: 'number', format: 'decimal' },
                            totalReplacementPayments: { type: 'number', format: 'decimal' },
                            netSales: { type: 'number', format: 'decimal' },
                            productsSold: { type: 'array' },
                            productsRefunded: { type: 'array' },
                            productsReplaced: { type: 'array' },
                            createdAt: { type: 'string', format: 'date-time' },
                            updatedAt: { type: 'string', format: 'date-time' }
                          }
                        }
                      },
                      pagination: {
                        type: 'object',
                        properties: {
                          totalCount: { type: 'integer' },
                          currentPage: { type: 'integer' },
                          totalPages: { type: 'integer' },
                          limit: { type: 'integer' }
                        }
                      },
                      filters: { type: 'object' }
                    }
                  }
                }
              }
            },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden - Admin only' },
            '500': { description: 'Internal server error' }
          },
          security: [{ BearerAuth: [] }]
        }
      },
      '/shifts/{id}': {
        get: {
          tags: ['Shifts'],
          summary: 'Get shift by ID (Admin only)',
          description: 'Get detailed information about a specific shift including all orders made during the shift',
          parameters: [
            {
              in: 'path',
              name: 'id',
              required: true,
              schema: { type: 'string', format: 'uuid' },
              description: 'Shift ID'
            }
          ],
          responses: {
            '200': {
              description: 'Shift details',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      shift: {
                        type: 'object',
                        properties: {
                          id: { type: 'string', format: 'uuid' },
                          cashier: {
                            type: 'object',
                            properties: {
                              id: { type: 'string', format: 'uuid' },
                              name: { type: 'string' },
                              email: { type: 'string' },
                              role: { type: 'string' }
                            }
                          },
                          branch: {
                            type: 'object',
                            properties: {
                              id: { type: 'string', format: 'uuid' },
                              name: { type: 'string' },
                              location: { type: 'string' }
                            }
                          },
                          startTime: { type: 'string', format: 'date-time' },
                          endTime: { type: 'string', format: 'date-time', nullable: true },
                          status: { type: 'string', enum: ['active', 'completed'] },
                          totalSales: { type: 'number', format: 'decimal' },
                          totalOrders: { type: 'integer' },
                          cashSales: { type: 'number', format: 'decimal' },
                          visaSales: { type: 'number', format: 'decimal' },
                          totalRefunds: { type: 'number', format: 'decimal' },
                          refundCount: { type: 'integer' },
                          totalReplacements: { type: 'number', format: 'decimal' },
                          replacementCount: { type: 'integer' },
                          totalReplacementRefunds: { type: 'number', format: 'decimal' },
                          totalReplacementPayments: { type: 'number', format: 'decimal' },
                          netSales: { type: 'number', format: 'decimal' },
                          productsSold: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                productId: { type: 'string', format: 'uuid' },
                                productName: { type: 'string' },
                                sku: { type: 'string' },
                                quantity: { type: 'integer' },
                                unitPrice: { type: 'number' },
                                totalPrice: { type: 'number' }
                              }
                            }
                          },
                          productsRefunded: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                productId: { type: 'string', format: 'uuid' },
                                productName: { type: 'string' },
                                sku: { type: 'string' },
                                quantity: { type: 'integer' },
                                refundAmount: { type: 'number', format: 'decimal' }
                              }
                            }
                          },
                          productsReplaced: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                productId: { type: 'string', format: 'uuid' },
                                productName: { type: 'string' },
                                sku: { type: 'string' },
                                returnedAmount: { type: 'number', format: 'decimal' },
                                newItemsAmount: { type: 'number', format: 'decimal' },
                                priceDifference: { type: 'number', format: 'decimal' }
                              }
                            }
                          },
                          orders: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                id: { type: 'string', format: 'uuid' },
                                orderNumber: { type: 'string' },
                                totalPrice: { type: 'number' },
                                paymentMethod: { type: 'string' },
                                createdAt: { type: 'string', format: 'date-time' }
                              }
                            }
                          },
                          createdAt: { type: 'string', format: 'date-time' },
                          updatedAt: { type: 'string', format: 'date-time' }
                        }
                      }
                    }
                  }
                }
              }
            },
            '400': { description: 'Invalid shift ID format' },
            '404': { description: 'Shift not found' },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden - Admin only' },
            '500': { description: 'Internal server error' }
          },
          security: [{ BearerAuth: [] }]
        }
      },
      '/analytics/sales-overview': {
        get: {
          tags: ['Analytics - Sales'],
          summary: 'Get overall sales metrics',
          description: 'Returns comprehensive sales overview including total sales, orders, payment methods, and discounts',
          parameters: [
            {
              in: 'query',
              name: 'startDate',
              schema: { type: 'string', format: 'date' },
              description: 'Start date for analytics (YYYY-MM-DD)'
            },
            {
              in: 'query',
              name: 'endDate',
              schema: { type: 'string', format: 'date' },
              description: 'End date for analytics (YYYY-MM-DD)'
            },
            {
              in: 'query',
              name: 'branchId',
              schema: { type: 'string', format: 'uuid' },
              description: 'Filter by specific branch ID'
            }
          ],
          responses: {
            '200': {
              description: 'Sales overview data',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: {
                        type: 'object',
                        properties: {
                        totalSales: { type: 'number', format: 'decimal' },
                        totalOrders: { type: 'integer' },
                        averageOrderValue: { type: 'number', format: 'decimal' },
                        cashSales: { type: 'number', format: 'decimal' },
                        visaSales: { type: 'number', format: 'decimal' },
                        totalDiscounts: { type: 'number', format: 'decimal' },
                        totalRefunds: { type: 'number', format: 'decimal' },
                        totalReplacements: { type: 'number', format: 'decimal' },
                        netProfit: { type: 'number', format: 'decimal' },
                          period: {
                            type: 'object',
                            properties: {
                              startDate: { type: 'string', format: 'date' },
                              endDate: { type: 'string', format: 'date' }
                            }
                          },
                          generatedAt: { type: 'string', format: 'date-time' }
                        }
                      }
                    }
                  }
                }
              }
            },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden - Admin access required' },
            '500': { description: 'Internal server error' }
          },
          security: [{ BearerAuth: [] }]
        }
      },
      '/analytics/sales-by-period': {
        get: {
          tags: ['Analytics - Sales'],
          summary: 'Get sales trends by time period',
          description: 'Returns sales data grouped by daily, weekly, or monthly periods',
          parameters: [
            {
              in: 'query',
              name: 'period',
              schema: { type: 'string', enum: ['daily', 'weekly', 'monthly'], default: 'daily' },
              description: 'Time period grouping (daily, weekly, monthly)'
            },
            {
              in: 'query',
              name: 'startDate',
              schema: { type: 'string', format: 'date' },
              description: 'Start date for analytics (YYYY-MM-DD)'
            },
            {
              in: 'query',
              name: 'endDate',
              schema: { type: 'string', format: 'date' },
              description: 'End date for analytics (YYYY-MM-DD)'
            },
            {
              in: 'query',
              name: 'branchId',
              schema: { type: 'string', format: 'uuid' },
              description: 'Filter by specific branch ID'
            }
          ],
          responses: {
            '200': {
              description: 'Sales trends by period',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            period: { type: 'string' },
                            date: { type: 'string', format: 'date' },
                            totalSales: { type: 'number', format: 'decimal' },
                            orderCount: { type: 'integer' },
                            averageOrderValue: { type: 'number', format: 'decimal' },
                            cashSales: { type: 'number', format: 'decimal' },
                            visaSales: { type: 'number', format: 'decimal' }
                          }
                        }
                      },
                      summary: {
                        type: 'object',
                        properties: {
                          totalPeriods: { type: 'integer' },
                          periodType: { type: 'string' },
                          dateRange: {
                            type: 'object',
                            properties: {
                              startDate: { type: 'string', format: 'date' },
                              endDate: { type: 'string', format: 'date' }
                            }
                          },
                          generatedAt: { type: 'string', format: 'date-time' }
                        }
                      }
                    }
                  }
                }
              }
            },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden - Admin access required' },
            '500': { description: 'Internal server error' }
          },
          security: [{ BearerAuth: [] }]
        }
      },
      '/analytics/sales-by-branch': {
        get: {
          tags: ['Analytics - Sales'],
          summary: 'Get branch performance comparison',
          description: 'Returns sales performance metrics for each branch',
          parameters: [
            {
              in: 'query',
              name: 'startDate',
              schema: { type: 'string', format: 'date' },
              description: 'Start date for analytics (YYYY-MM-DD)'
            },
            {
              in: 'query',
              name: 'endDate',
              schema: { type: 'string', format: 'date' },
              description: 'End date for analytics (YYYY-MM-DD)'
            },
            {
              in: 'query',
              name: 'sortBy',
              schema: { type: 'string', enum: ['totalSales', 'orderCount', 'averageOrderValue'], default: 'totalSales' },
              description: 'Sort branches by metric'
            },
            {
              in: 'query',
              name: 'sortOrder',
              schema: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
              description: 'Sort order (ascending or descending)'
            }
          ],
          responses: {
            '200': {
              description: 'Branch performance comparison',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            branchId: { type: 'string', format: 'uuid' },
                            branchName: { type: 'string' },
                            branchLocation: { type: 'string' },
                            totalSales: { type: 'number', format: 'decimal' },
                            orderCount: { type: 'integer' },
                            averageOrderValue: { type: 'number', format: 'decimal' },
                            cashSales: { type: 'number', format: 'decimal' },
                            visaSales: { type: 'number', format: 'decimal' },
                            totalDiscounts: { type: 'number', format: 'decimal' },
                            salesPercentage: { type: 'number', format: 'decimal' }
                          }
                        }
                      },
                      summary: {
                        type: 'object',
                        properties: {
                          totalBranches: { type: 'integer' },
                          totalSales: { type: 'number', format: 'decimal' },
                          averageSalesPerBranch: { type: 'number', format: 'decimal' },
                          topPerformingBranch: {
                            type: 'object',
                            properties: {
                              branchId: { type: 'string' },
                              branchName: { type: 'string' },
                              sales: { type: 'number', format: 'decimal' }
                            }
                          },
                          dateRange: {
                            type: 'object',
                            properties: {
                              startDate: { type: 'string', format: 'date' },
                              endDate: { type: 'string', format: 'date' }
                            }
                          },
                          generatedAt: { type: 'string', format: 'date-time' }
                        }
                      }
                    }
                  }
                }
              }
            },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden - Admin access required' },
            '500': { description: 'Internal server error' }
          },
          security: [{ BearerAuth: [] }]
        }
      },
      '/analytics/sales-by-payment-method': {
        get: {
          tags: ['Analytics - Sales'],
          summary: 'Get sales breakdown by payment method',
          description: 'Returns sales data grouped by payment methods (cash, visa, mixed)',
          parameters: [
            {
              in: 'query',
              name: 'startDate',
              schema: { type: 'string', format: 'date' },
              description: 'Start date for analytics (YYYY-MM-DD)'
            },
            {
              in: 'query',
              name: 'endDate',
              schema: { type: 'string', format: 'date' },
              description: 'End date for analytics (YYYY-MM-DD)'
            },
            {
              in: 'query',
              name: 'branchId',
              schema: { type: 'string', format: 'uuid' },
              description: 'Filter by specific branch ID'
            }
          ],
          responses: {
            '200': {
              description: 'Payment method breakdown',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            paymentMethod: { type: 'string', enum: ['cash', 'visa', 'mixed'] },
                            totalSales: { type: 'number', format: 'decimal' },
                            orderCount: { type: 'integer' },
                            averageOrderValue: { type: 'number', format: 'decimal' },
                            percentage: { type: 'number', format: 'decimal' },
                            cashAmount: { type: 'number', format: 'decimal' },
                            visaAmount: { type: 'number', format: 'decimal' }
                          }
                        }
                      },
                      summary: {
                        type: 'object',
                        properties: {
                          totalSales: { type: 'number', format: 'decimal' },
                          totalOrders: { type: 'integer' },
                          paymentMethods: {
                            type: 'object',
                            properties: {
                              cash: {
                                type: 'object',
                                properties: {
                                  sales: { type: 'number', format: 'decimal' },
                                  percentage: { type: 'number', format: 'decimal' }
                                }
                              },
                              visa: {
                                type: 'object',
                                properties: {
                                  sales: { type: 'number', format: 'decimal' },
                                  percentage: { type: 'number', format: 'decimal' }
                                }
                              },
                              mixed: {
                                type: 'object',
                                properties: {
                                  sales: { type: 'number', format: 'decimal' },
                                  percentage: { type: 'number', format: 'decimal' }
                                }
                              }
                            }
                          },
                          dateRange: {
                            type: 'object',
                            properties: {
                              startDate: { type: 'string', format: 'date' },
                              endDate: { type: 'string', format: 'date' }
                            }
                          },
                          generatedAt: { type: 'string', format: 'date-time' }
                        }
                      }
                    }
                  }
                }
              }
            },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden - Admin access required' },
            '500': { description: 'Internal server error' }
          },
          security: [{ BearerAuth: [] }]
        }
      },
      '/analytics/top-products': {
        get: {
          tags: ['Analytics - Products'],
          summary: 'Get best selling products',
          description: 'Returns the top performing products by quantity sold or revenue',
          parameters: [
            {
              in: 'query',
              name: 'startDate',
              schema: { type: 'string', format: 'date' },
              description: 'Start date for analytics (YYYY-MM-DD)'
            },
            {
              in: 'query',
              name: 'endDate',
              schema: { type: 'string', format: 'date' },
              description: 'End date for analytics (YYYY-MM-DD)'
            },
            {
              in: 'query',
              name: 'branchId',
              schema: { type: 'string', format: 'uuid' },
              description: 'Filter by specific branch ID'
            },
            {
              in: 'query',
              name: 'limit',
              schema: { type: 'integer', default: 10, minimum: 1, maximum: 100 },
              description: 'Number of top products to return'
            },
            {
              in: 'query',
              name: 'sortBy',
              schema: { type: 'string', enum: ['quantity', 'revenue'], default: 'quantity' },
              description: 'Sort by quantity sold or revenue generated'
            },
            {
              in: 'query',
              name: 'categoryId',
              schema: { type: 'string', format: 'uuid' },
              description: 'Filter by specific category ID'
            }
          ],
          responses: {
            '200': {
              description: 'Top selling products',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            productId: { type: 'string', format: 'uuid' },
                            productName: { type: 'string' },
                            sku: { type: 'string' },
                            price: { type: 'number', format: 'decimal' },
                            totalQuantitySold: { type: 'integer' },
                            totalRevenue: { type: 'number', format: 'decimal' },
                            averageOrderValue: { type: 'number', format: 'decimal' },
                            orderCount: { type: 'integer' },
                            categoryName: { type: 'string' },
                            subCategoryName: { type: 'string' }
                          }
                        }
                      },
                      summary: {
                        type: 'object',
                        properties: {
                          totalProducts: { type: 'integer' },
                          totalQuantitySold: { type: 'integer' },
                          totalRevenue: { type: 'number', format: 'decimal' },
                          sortBy: { type: 'string' },
                          dateRange: {
                            type: 'object',
                            properties: {
                              startDate: { type: 'string', format: 'date' },
                              endDate: { type: 'string', format: 'date' }
                            }
                          },
                          generatedAt: { type: 'string', format: 'date-time' }
                        }
                      }
                    }
                  }
                }
              }
            },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden - Admin access required' },
            '500': { description: 'Internal server error' }
          },
          security: [{ BearerAuth: [] }]
        }
      },
      '/analytics/product-performance': {
        get: {
          tags: ['Analytics - Products'],
          summary: 'Get product sales trends over time',
          description: 'Returns product performance data grouped by time periods for trend analysis',
          parameters: [
            {
              in: 'query',
              name: 'productId',
              schema: { type: 'string', format: 'uuid' },
              description: 'Specific product ID to analyze'
            },
            {
              in: 'query',
              name: 'period',
              schema: { type: 'string', enum: ['daily', 'weekly', 'monthly'], default: 'daily' },
              description: 'Time period grouping (daily, weekly, monthly)'
            },
            {
              in: 'query',
              name: 'startDate',
              schema: { type: 'string', format: 'date' },
              description: 'Start date for analytics (YYYY-MM-DD)'
            },
            {
              in: 'query',
              name: 'endDate',
              schema: { type: 'string', format: 'date' },
              description: 'End date for analytics (YYYY-MM-DD)'
            },
            {
              in: 'query',
              name: 'branchId',
              schema: { type: 'string', format: 'uuid' },
              description: 'Filter by specific branch ID'
            },
            {
              in: 'query',
              name: 'categoryId',
              schema: { type: 'string', format: 'uuid' },
              description: 'Filter by specific category ID'
            },
            {
              in: 'query',
              name: 'limit',
              schema: { type: 'integer', default: 10, minimum: 1, maximum: 50 },
              description: 'Number of top products to analyze (when productId not specified)'
            }
          ],
          responses: {
            '200': {
              description: 'Product performance trends',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            productId: { type: 'string', format: 'uuid' },
                            productName: { type: 'string' },
                            sku: { type: 'string' },
                            period: { type: 'string', format: 'date' },
                            quantitySold: { type: 'integer' },
                            revenue: { type: 'number', format: 'decimal' },
                            orderCount: { type: 'integer' },
                            averageOrderValue: { type: 'number', format: 'decimal' }
                          }
                        }
                      },
                      summary: {
                        type: 'object',
                        properties: {
                          totalProducts: { type: 'integer' },
                          periodType: { type: 'string' },
                          dateRange: {
                            type: 'object',
                            properties: {
                              startDate: { type: 'string', format: 'date' },
                              endDate: { type: 'string', format: 'date' }
                            }
                          },
                          generatedAt: { type: 'string', format: 'date-time' }
                        }
                      }
                    }
                  }
                }
              }
            },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden - Admin access required' },
            '404': { description: 'Product not found (when productId is specified)' },
            '500': { description: 'Internal server error' }
          },
          security: [{ BearerAuth: [] }]
        }
      },
      '/analytics/daily-report': {
        get: {
          tags: ['Analytics - Sales'],
          summary: 'Generate daily report with comprehensive sales data',
          description: 'Returns comprehensive daily report including products sold, refunds, discounts, payment methods, and net totals with time filtering',
          parameters: [
            {
              in: 'query',
              name: 'startDate',
              schema: { type: 'string', format: 'date' },
              required: true,
              description: 'Start date for report (YYYY-MM-DD)'
            },
            {
              in: 'query',
              name: 'endDate',
              schema: { type: 'string', format: 'date' },
              required: true,
              description: 'End date for report (YYYY-MM-DD)'
            },
            {
              in: 'query',
              name: 'branchId',
              schema: { type: 'string', format: 'uuid' },
              description: 'Filter by specific branch ID'
            }
          ],
          responses: {
            '200': {
              description: 'Daily report data',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: {
                        type: 'object',
                        properties: {
                          productsSold: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                item_name: { type: 'string' },
                                total_quantity_sold: { type: 'integer' },
                                unit_price: { type: 'number', format: 'decimal' },
                                total_before_discount: { type: 'number', format: 'decimal' },
                                total_after_discount: { type: 'number', format: 'decimal' },
                                discount_share: { type: 'number', format: 'decimal' }
                              }
                            }
                          },
                          refundedItems: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                item_name: { type: 'string' },
                                total_refunded_quantity: { type: 'integer' },
                                unit_price: { type: 'number', format: 'decimal' },
                                total_refunded_value: { type: 'number', format: 'decimal' }
                              }
                            }
                          },
                          discountsSummary: {
                            type: 'object',
                            properties: {
                              total_discount_amount: { type: 'number', format: 'decimal' },
                              total_before_discount: { type: 'number', format: 'decimal' },
                              total_after_discount: { type: 'number', format: 'decimal' }
                            }
                          },
                          paymentMethodsSummary: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                payment_method: { type: 'string' },
                                total_after_discount: { type: 'number', format: 'decimal' }
                              }
                            }
                          },
                          replacedItems: {
                            type: 'object',
                            properties: {
                              total_returned_amount: { type: 'number', format: 'decimal' },
                              total_new_items_amount: { type: 'number', format: 'decimal' },
                              total_price_difference: { type: 'number', format: 'decimal' },
                              total_refund_to_customer: { type: 'number', format: 'decimal' },
                              total_customer_payment: { type: 'number', format: 'decimal' }
                            }
                          },
                          netTotalAfterRefunds: {
                            type: 'object',
                            properties: {
                              total_after_discount_orders: { type: 'number', format: 'decimal' },
                              total_refunds: { type: 'number', format: 'decimal' },
                              net_total_after_refunds: { type: 'number', format: 'decimal' }
                            }
                          }
                        }
                      },
                      summary: {
                        type: 'object',
                        properties: {
                          dateRange: {
                            type: 'object',
                            properties: {
                              startDate: { type: 'string', format: 'date' },
                              endDate: { type: 'string', format: 'date' }
                            }
                          },
                          branchId: { type: 'string' },
                          totalProductsSold: { type: 'integer' },
                          totalRefundedItems: { type: 'integer' },
                          generatedAt: { type: 'string', format: 'date-time' }
                        }
                      }
                    }
                  }
                }
              }
            },
            '400': { description: 'Bad request - Invalid date format or missing required parameters' },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden - Admin access required' },
            '500': { description: 'Internal server error' }
          },
          security: [{ BearerAuth: [] }]
        }
      }
    }
  };
}

// Ensure Bearer JWT security scheme exists so Swagger UI shows the Authorize button
swaggerSpec.components = swaggerSpec.components || {};
swaggerSpec.components.securitySchemes = swaggerSpec.components.securitySchemes || {};
swaggerSpec.components.securitySchemes.BearerAuth = {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT'
};

// Optionally, you can enforce auth globally by uncommenting below and then making public endpoints set security: []
// swaggerSpec.security = [{ BearerAuth: [] }];

module.exports = {
  swaggerUi,
  swaggerSpec
};


