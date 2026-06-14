require('dotenv').config();
const express = require('express');
const cors = require('cors');

// Import modular routes
const authRoutes = require('./modules/auth/authRoutes');
const adminRoutes = require('./modules/admin/adminRoutes');
const inventoryRoutes = require('./modules/inventory/inventoryRoutes');
const medicinesRoutes = require('./modules/medicines/medicinesRoutes');
const ordersRoutes = require('./modules/orders/ordersRoutes');
const paymentsRoutes = require('./modules/payments/paymentsRoutes');
const prescriptionsRoutes = require('./modules/prescriptions/prescriptionsRoutes');

const app = express();
app.use(cors());
app.use(express.json());

// Mount modular routes
app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);
app.use('/inventory', inventoryRoutes);
app.use('/medicines', medicinesRoutes);
app.use('/orders', ordersRoutes);
app.use('/payments', paymentsRoutes);
app.use('/prescriptions', prescriptionsRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`DPMS backend running on http://localhost:${PORT}`);
});
