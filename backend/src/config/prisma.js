const { PrismaClient } = require('@prisma/client');

// Initialize the Prisma Client
const prisma = new PrismaClient();

// Export it so other files can use the exact same DB connection
module.exports = prisma;