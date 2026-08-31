export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'MyLand API',
    version: '1.0.0',
    description:
      'Shared backend for the MyLand public site and admin dashboard. Use Try it out on each endpoint to send live requests.',
  },
  servers: [
    {
      url: 'http://localhost:5000',
      description: 'Local backend',
    },
  ],
  tags: [
    { name: 'Health', description: 'Database connectivity' },
    { name: 'Reviews', description: 'Project reviews and moderation' },
    { name: 'Blogs', description: 'Journal posts and placement' },
  ],
  paths: {
    '/api/health': {
      get: {
        tags: ['Health'],
        summary: 'Check API and database',
        responses: {
          200: {
            description: 'Database is reachable',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/HealthOk' },
                example: { ok: true, db: 'connected' },
              },
            },
          },
          503: {
            description: 'Database is not connected',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/HealthFail' },
                example: { ok: false, db: 'not connected' },
              },
            },
          },
        },
      },
    },
    '/api/reviews': {
      get: {
        tags: ['Reviews'],
        summary: 'List reviews',
        parameters: [
          {
            name: 'project',
            in: 'query',
            description: 'Filter by project slug',
            schema: { type: 'string', example: 'malabe-heights' },
          },
          {
            name: 'status',
            in: 'query',
            description: 'Filter by moderation status',
            schema: {
              type: 'string',
              enum: ['pending', 'approved', 'rejected', 'deleted'],
            },
          },
          {
            name: 'home',
            in: 'query',
            description: 'Set to true to return home-page stories',
            schema: { type: 'string', enum: ['true', 'false'] },
          },
        ],
        responses: {
          200: {
            description: 'Review list',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    reviews: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Review' },
                    },
                  },
                },
              },
            },
          },
          500: { $ref: '#/components/responses/Error' },
        },
      },
      post: {
        tags: ['Reviews'],
        summary: 'Submit a review',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateReview' },
              example: {
                name: 'Amal Perera',
                message: 'Clear paperwork and a thorough site visit.',
                rating: 5,
                projectSlug: 'malabe-heights',
                projectTitle: 'Malabe Heights',
              },
            },
          },
        },
        responses: {
          201: {
            description: 'Review created (status pending)',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { review: { $ref: '#/components/schemas/Review' } },
                },
              },
            },
          },
          400: { $ref: '#/components/responses/Error' },
          500: { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/api/reviews/{id}': {
      patch: {
        tags: ['Reviews'],
        summary: 'Update review status',
        parameters: [{ $ref: '#/components/parameters/Id' }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UpdateReviewStatus' },
              example: {
                status: 'approved',
                authorizerId: 'admin-1',
                authorizerName: 'Kavithra',
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Updated review',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { review: { $ref: '#/components/schemas/Review' } },
                },
              },
            },
          },
          400: { $ref: '#/components/responses/Error' },
          404: { $ref: '#/components/responses/Error' },
          500: { $ref: '#/components/responses/Error' },
        },
      },
      delete: {
        tags: ['Reviews'],
        summary: 'Delete a review',
        parameters: [{ $ref: '#/components/parameters/Id' }],
        requestBody: {
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Authorizer' },
              example: {
                authorizerId: 'admin-1',
                authorizerName: 'Kavithra',
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Review deleted',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ok: { type: 'boolean' },
                    review: { $ref: '#/components/schemas/Review' },
                  },
                },
              },
            },
          },
          404: { $ref: '#/components/responses/Error' },
          500: { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/api/blogs': {
      get: {
        tags: ['Blogs'],
        summary: 'List blogs',
        parameters: [
          {
            name: 'published',
            in: 'query',
            description: 'Filter published (true) or drafts (false). Omit for all.',
            schema: { type: 'string', enum: ['true', 'false'] },
          },
        ],
        responses: {
          200: {
            description: 'Blog list',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    blogs: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Blog' },
                    },
                  },
                },
              },
            },
          },
          500: { $ref: '#/components/responses/Error' },
        },
      },
      post: {
        tags: ['Blogs'],
        summary: 'Create a blog post',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateBlog' },
              example: {
                title: 'How to read a survey plan',
                excerpt: 'What the boundary stones and drain lines actually mean on a first visit.',
                body: 'Start at the road, then walk the three corners marked on the plan.',
                topic: 'Titles',
                imageUrl:
                  'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?q=80&w=2000&auto=format&fit=crop',
                layout: 'auto',
                placement: 'index',
                published: true,
              },
            },
          },
        },
        responses: {
          201: {
            description: 'Blog created',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { blog: { $ref: '#/components/schemas/Blog' } },
                },
              },
            },
          },
          400: { $ref: '#/components/responses/Error' },
          500: { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/api/blogs/{idOrSlug}': {
      get: {
        tags: ['Blogs'],
        summary: 'Get one blog by id or slug',
        parameters: [
          {
            name: 'idOrSlug',
            in: 'path',
            required: true,
            schema: { type: 'string', example: 'clear-title-why-it-matters' },
          },
          {
            name: 'public',
            in: 'query',
            description: 'Set to false to include unpublished posts (admin). Default true.',
            schema: { type: 'string', enum: ['true', 'false'] },
          },
        ],
        responses: {
          200: {
            description: 'Blog found',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { blog: { $ref: '#/components/schemas/Blog' } },
                },
              },
            },
          },
          404: { $ref: '#/components/responses/Error' },
          500: { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/api/blogs/{id}': {
      patch: {
        tags: ['Blogs'],
        summary: 'Update a blog post',
        parameters: [{ $ref: '#/components/parameters/Id' }],
        requestBody: {
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UpdateBlog' },
              example: {
                title: 'Updated title',
                published: true,
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Blog updated',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { blog: { $ref: '#/components/schemas/Blog' } },
                },
              },
            },
          },
          400: { $ref: '#/components/responses/Error' },
          404: { $ref: '#/components/responses/Error' },
          500: { $ref: '#/components/responses/Error' },
        },
      },
      delete: {
        tags: ['Blogs'],
        summary: 'Delete a blog post',
        parameters: [{ $ref: '#/components/parameters/Id' }],
        responses: {
          200: {
            description: 'Blog deleted',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ok: { type: 'boolean' },
                    blog: { $ref: '#/components/schemas/Blog' },
                  },
                },
              },
            },
          },
          404: { $ref: '#/components/responses/Error' },
          500: { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/api/blogs/{id}/reorder': {
      post: {
        tags: ['Blogs'],
        summary: 'Move a blog up or down',
        parameters: [{ $ref: '#/components/parameters/Id' }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  direction: { type: 'string', enum: ['up', 'down'] },
                },
                required: ['direction'],
              },
              example: { direction: 'up' },
            },
          },
        },
        responses: {
          200: {
            description: 'Reordered list',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    blog: { $ref: '#/components/schemas/Blog' },
                    blogs: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Blog' },
                    },
                  },
                },
              },
            },
          },
          404: { $ref: '#/components/responses/Error' },
          500: { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/api/blogs/{id}/place': {
      post: {
        tags: ['Blogs'],
        summary: 'Set blog section placement',
        parameters: [{ $ref: '#/components/parameters/Id' }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  placement: {
                    type: 'string',
                    enum: ['cover', 'features', 'index'],
                  },
                },
                required: ['placement'],
              },
              example: { placement: 'features' },
            },
          },
        },
        responses: {
          200: {
            description: 'Placement updated',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    blog: { $ref: '#/components/schemas/Blog' },
                    blogs: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Blog' },
                    },
                  },
                },
              },
            },
          },
          400: { $ref: '#/components/responses/Error' },
          404: { $ref: '#/components/responses/Error' },
          500: { $ref: '#/components/responses/Error' },
        },
      },
    },
  },
  components: {
    parameters: {
      Id: {
        name: 'id',
        in: 'path',
        required: true,
        schema: { type: 'string' },
      },
    },
    responses: {
      Error: {
        description: 'Error message',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorMessage' },
          },
        },
      },
    },
    schemas: {
      ErrorMessage: {
        type: 'object',
        properties: {
          message: { type: 'string' },
        },
      },
      HealthOk: {
        type: 'object',
        properties: {
          ok: { type: 'boolean', example: true },
          db: { type: 'string', example: 'connected' },
        },
      },
      HealthFail: {
        type: 'object',
        properties: {
          ok: { type: 'boolean', example: false },
          db: { type: 'string', example: 'not connected' },
        },
      },
      Review: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          projectSlug: { type: 'string' },
          projectTitle: { type: 'string' },
          name: { type: 'string' },
          message: { type: 'string' },
          rating: { type: 'integer', minimum: 1, maximum: 5 },
          status: {
            type: 'string',
            enum: ['pending', 'approved', 'rejected', 'deleted'],
          },
          createdAt: { type: 'string', format: 'date-time' },
          reviewedAt: { type: 'string', format: 'date-time' },
          moderatedAt: { type: 'string', format: 'date-time' },
          authorizerId: { type: 'string' },
          authorizerName: { type: 'string' },
          role: { type: 'string' },
          avatar: { type: 'string' },
          showOnHome: { type: 'boolean' },
        },
      },
      CreateReview: {
        type: 'object',
        required: ['name', 'message', 'rating', 'projectSlug'],
        properties: {
          name: { type: 'string', minLength: 2 },
          message: { type: 'string', minLength: 5 },
          rating: { type: 'integer', minimum: 1, maximum: 5 },
          projectSlug: { type: 'string' },
          projectTitle: { type: 'string' },
          idempotencyKey: { type: 'string' },
        },
      },
      UpdateReviewStatus: {
        type: 'object',
        required: ['status'],
        properties: {
          status: {
            type: 'string',
            enum: ['pending', 'approved', 'rejected', 'deleted'],
          },
          authorizerId: { type: 'string' },
          authorizerName: { type: 'string' },
        },
      },
      Authorizer: {
        type: 'object',
        properties: {
          authorizerId: { type: 'string' },
          authorizerName: { type: 'string' },
        },
      },
      Blog: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          slug: { type: 'string' },
          title: { type: 'string' },
          excerpt: { type: 'string' },
          body: { type: 'string' },
          topic: { type: 'string' },
          image: { type: 'string' },
          imageUrl: { type: 'string' },
          readTime: { type: 'string' },
          featured: { type: 'boolean' },
          layout: { type: 'string', enum: ['auto', 'image-left', 'image-right'] },
          sortOrder: { type: 'integer' },
          published: { type: 'boolean' },
          placement: { type: 'string', enum: ['cover', 'features', 'index'] },
          status: { type: 'string', enum: ['active', 'deleted'] },
          publishedAt: { type: 'string', format: 'date-time' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
          date: { type: 'string' },
        },
      },
      CreateBlog: {
        type: 'object',
        required: ['title', 'excerpt', 'imageUrl'],
        properties: {
          title: { type: 'string', minLength: 3 },
          excerpt: { type: 'string', minLength: 8 },
          body: { type: 'string' },
          topic: { type: 'string' },
          imageUrl: { type: 'string', minLength: 8 },
          image: { type: 'string' },
          layout: { type: 'string', enum: ['auto', 'image-left', 'image-right'] },
          placement: { type: 'string', enum: ['cover', 'features', 'index'] },
          published: { type: 'boolean' },
          slug: { type: 'string' },
          readTime: { type: 'string' },
          sortOrder: { type: 'integer' },
          publishedAt: { type: 'string', format: 'date-time' },
        },
      },
      UpdateBlog: {
        type: 'object',
        properties: {
          title: { type: 'string', minLength: 3 },
          excerpt: { type: 'string', minLength: 8 },
          body: { type: 'string' },
          topic: { type: 'string' },
          imageUrl: { type: 'string' },
          image: { type: 'string' },
          layout: { type: 'string', enum: ['auto', 'image-left', 'image-right'] },
          placement: { type: 'string', enum: ['cover', 'features', 'index'] },
          published: { type: 'boolean' },
          status: { type: 'string', enum: ['active', 'deleted'] },
          slug: { type: 'string' },
          readTime: { type: 'string' },
          sortOrder: { type: 'integer' },
          publishedAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
};
