const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  try {
    // Admin details
    const adminEmail = 'yohannesb139@gmail.com';
    const adminName = 'Yohannis Birhane';
    const adminPassword = '3141Ybe#';
    const adminPhone = '0987654321';

    console.log('🔍 Checking for existing admin...');
    
    // Delete any existing admin with this email
    const existingAdmin = await prisma.user.findUnique({
      where: { email: adminEmail },
    });

    if (existingAdmin) {
      console.log(`❌ Found existing admin: ${existingAdmin.email}. Deleting...`);
      await prisma.user.delete({
        where: { id: existingAdmin.id },
      });
      console.log('✅ Existing admin deleted');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    // Create new admin
    console.log('➕ Creating new admin...');
    const admin = await prisma.user.create({
      data: {
        name: adminName,
        email: adminEmail,
        password: hashedPassword,
        phone: adminPhone,
        role: 'ADMIN',
      },
    });

    console.log('✅ Admin created successfully!');
    console.log('📋 Admin Details:');
    console.log(`   Name: ${admin.name}`);
    console.log(`   Email: ${admin.email}`);
    console.log(`   Phone: ${admin.phone}`);
    console.log(`   Role: ${admin.role}`);
    console.log(`   ID: ${admin.id}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
