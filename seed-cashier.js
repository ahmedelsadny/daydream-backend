const bcrypt = require('bcryptjs');
const { User, Branch, Warehouse } = require('./models');

async function seedCashier() {
  try {
    // 1. التأكد من وجود فرع لربطه بالكاشير
    let branch = await Branch.findOne();
    if (!branch) {
      let warehouse = await Warehouse.findOne();
      if (!warehouse) {
        warehouse = await Warehouse.create({
          name: 'المستودع الرئيسي',
          location: 'المركز الرئيسي',
          type: 'central'
        });
        console.log('✅ تم إنشاء مستودع رئيسي');
      }

      branch = await Branch.create({
        name: 'الفرع الرئيسي - سوبر ماركت',
        location: 'المركز الرئيسي',
        warehouseId: warehouse.id
      });
      console.log('✅ تم إنشاء فرع رئيسي للسوبر ماركت');
    }

    // 2. إنشاء وتحديث حساب الكاشير
    const email = 'cashier@daydream.com';
    let cashier = await User.findOne({ where: { email } });
    const hashedPassword = await bcrypt.hash('password123', 10);
    const hashedPin = await bcrypt.hash('1234', 10);

    const userData = {
      name: 'كاشير 1',
      email: email,
      password: hashedPassword,
      passwordHash: hashedPassword,
      role: 'cashier',
      branchId: branch.id,
      supervisorPin: hashedPin
    };

    if (cashier) {
      await cashier.update(userData);
      console.log('🔄 تم تحديث حساب الكاشير وربطه بالفرع بنجاح.');
    } else {
      cashier = await User.create(userData);
      console.log('✨ تم إنشاء مستخدم الكاشير بنجاح.');
    }

    console.log('\n=======================================');
    console.log('🎉 تم تجهيز بيانات دخول الكاشير بنجاح:');
    console.log('📧 البريد الإلكتروني: cashier@daydream.com');
    console.log('🔑 كلمة المرور:      password123');
    console.log('🛡️ كود المشرف (PIN): 1234');
    console.log('🏪 الفرع المربوط:    ' + branch.name);
    console.log('=======================================\n');
    process.exit(0);
  } catch (err) {
    console.error('❌ خطأ أثناء إنشاء الكاشير:', err);
    process.exit(1);
  }
}

seedCashier();
