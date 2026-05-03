const User = require('../models/User');
const Listing = require('../models/Listing');

const ensureDemoLogin = async ({ email, password, defaults }) => {
  let user = await User.findOne({ email }).select('+password');

  if (!user) {
    user = await User.create({ ...defaults, email, password });
    return user;
  }

  user.set({ ...defaults, password, isActive: true });
  await user.save();
  return user;
};

/**
 * Seeds initial data if the database is empty.
 * Called automatically on server start when using in-memory MongoDB.
 */
const seedIfEmpty = async () => {
  const userCount = await User.countDocuments();
  if (userCount > 0) {
    await ensureDemoLogin({
      email: 'admin@lastbyte.com',
      password: 'admin123',
      defaults: {
        name: 'Admin',
        role: 'admin',
        phone: '9999999999',
      },
    });
    console.log('✅ Demo admin login ready: admin@lastbyte.com / admin123');
    return;
  }

  console.log('🌱 Seeding initial data...');

  // Create Admin
  const admin = await User.create({
    name: 'Admin', email: 'admin@lastbyte.com',
    password: 'admin123', role: 'admin', phone: '9999999999',
  });

  // Create Shop Owners
  const shop1 = await User.create({
    name: 'Ravi Kumar', email: 'ravi@lastbyte.com',
    password: 'shop123', role: 'shopOwner', phone: '9876543210',
    shopName: 'Ravi Fresh Bakery', shopAddress: '12 MG Road, Bangalore',
    shopDescription: 'Fresh baked goods daily',
    shopApprovalStatus: 'approved',
    shopLocation: { type: 'Point', coordinates: [77.5946, 12.9716] },
    averagePickupMinutes: 10,
  });

  const shop2 = await User.create({
    name: 'Priya Sharma', email: 'priya@lastbyte.com',
    password: 'shop123', role: 'shopOwner', phone: '9876543211',
    shopName: 'Priya Meals Corner', shopAddress: '45 Brigade Road, Bangalore',
    shopDescription: 'Home-style meals and snacks',
    shopApprovalStatus: 'approved',
    shopLocation: { type: 'Point', coordinates: [77.6080, 12.9701] },
    averagePickupMinutes: 15,
  });

  // Create Test User
  await User.create({
    name: 'Test User', email: 'user@lastbyte.com',
    password: 'user123', role: 'user', phone: '9876543212',
  });

  // Create Sample Listings
  await Listing.create([
    {
      title: 'Chocolate Croissants (Pack of 4)',
      description: 'Freshly baked this morning. Best before tonight.',
      originalPrice: 240, discountedPrice: 120,
      maxQuantityPerUser: 2,
      quantity: 5, category: 'bakery', cuisine: 'bakery', dietaryType: 'veg',
      moderationStatus: 'approved',
      availabilityType: 'ready_now', averagePickupMinutes: 10,
      shopOwner: shop1._id, shopLocation: shop1.shopLocation,
      expiresAt: new Date(Date.now() + 6 * 3600000),
      pickupStartAt: new Date(), pickupEndAt: new Date(Date.now() + 6 * 3600000),
    },
    {
      title: 'Whole Wheat Bread Loaf',
      description: 'Baked today. Perfectly fresh.',
      originalPrice: 60, discountedPrice: 30,
      maxQuantityPerUser: 2,
      quantity: 8, category: 'bakery', cuisine: 'bakery', dietaryType: 'veg',
      moderationStatus: 'approved',
      availabilityType: 'ready_now', averagePickupMinutes: 10,
      shopOwner: shop1._id, shopLocation: shop1.shopLocation,
      expiresAt: new Date(Date.now() + 8 * 3600000),
      pickupStartAt: new Date(), pickupEndAt: new Date(Date.now() + 8 * 3600000),
    },
    {
      title: 'Veg Thali Combo',
      description: '2 rotis, dal, sabzi, rice, salad. Made fresh today.',
      originalPrice: 150, discountedPrice: 80,
      maxQuantityPerUser: 3,
      quantity: 10, category: 'meals', cuisine: 'indian', dietaryType: 'veg',
      moderationStatus: 'approved',
      availabilityType: 'ready_now', averagePickupMinutes: 15,
      shopOwner: shop2._id, shopLocation: shop2.shopLocation,
      expiresAt: new Date(Date.now() + 4 * 3600000),
      pickupStartAt: new Date(), pickupEndAt: new Date(Date.now() + 4 * 3600000),
    },
    {
      title: 'Samosa (Pack of 6)',
      description: 'Crispy potato samosas. Evening batch.',
      originalPrice: 90, discountedPrice: 45,
      maxQuantityPerUser: 4,
      quantity: 15, category: 'snacks', cuisine: 'indian', dietaryType: 'veg',
      moderationStatus: 'approved',
      availabilityType: 'ready_now', averagePickupMinutes: 15,
      shopOwner: shop2._id, shopLocation: shop2.shopLocation,
      expiresAt: new Date(Date.now() + 20 * 60000),
      pickupStartAt: new Date(), pickupEndAt: new Date(Date.now() + 20 * 60000),
    },
    {
      title: 'Fresh Fruit Salad Bowl',
      description: 'Mixed seasonal fruits. Ready to eat.',
      originalPrice: 120, discountedPrice: 60,
      maxQuantityPerUser: 2,
      quantity: 6, category: 'fruits', cuisine: 'other', dietaryType: 'veg',
      moderationStatus: 'approved',
      availabilityType: 'pre_order', readyAt: new Date(Date.now() + 45 * 60000),
      averagePickupMinutes: 15,
      shopOwner: shop2._id, shopLocation: shop2.shopLocation,
      expiresAt: new Date(Date.now() + 3 * 3600000),
      pickupStartAt: new Date(Date.now() + 45 * 60000),
      pickupEndAt: new Date(Date.now() + 3 * 3600000),
    },
    {
      title: 'Arabic Chicken Shawarma Box',
      description: 'Chicken shawarma with hummus, pita, and pickles.',
      originalPrice: 250, discountedPrice: 50,
      maxQuantityPerUser: 1,
      quantity: 4, category: 'meals', cuisine: 'arabic', dietaryType: 'non-veg',
      moderationStatus: 'approved',
      availabilityType: 'ready_now', averagePickupMinutes: 15,
      shopOwner: shop2._id, shopLocation: shop2.shopLocation,
      expiresAt: new Date(Date.now() + 20 * 60000),
      pickupStartAt: new Date(), pickupEndAt: new Date(Date.now() + 20 * 60000),
    },
  ]);

  console.log('✅ Seed data created!');
  console.log('   Admin:      admin@lastbyte.com / admin123');
  console.log('   Shop Owner: ravi@lastbyte.com  / shop123');
  console.log('   Shop Owner: priya@lastbyte.com / shop123');
  console.log('   User:       user@lastbyte.com  / user123\n');
};

module.exports = seedIfEmpty;
