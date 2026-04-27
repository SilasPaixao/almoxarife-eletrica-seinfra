import express from 'express';
import ViteExpress from 'vite-express';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import prisma from './src/infra/database/prisma.ts';
import { authRouter } from './src/infra/http/routes/auth.routes.ts';
import { materialRouter } from './src/infra/http/routes/material.routes.ts';
import { demandRouter } from './src/infra/http/routes/demand.routes.ts';
import { userRouter } from './src/infra/http/routes/user.routes.ts';
import { reportRouter } from './src/infra/http/routes/report.routes.ts';

dotenv.config();

const app = express();
const port = 3000;

app.use(express.json());
app.use('/uploads', express.static('public/uploads'));

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/users', userRouter);
app.use('/api/materials', materialRouter);
app.use('/api/demands', demandRouter);
app.use('/api/reports', reportRouter);

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).send({ error: 'Something went wrong!' });
});

async function main() {
  try {
    if (!process.env.DATABASE_URL) {
      console.warn('WARNING: DATABASE_URL is not set. Prisma will fail if it tries to connect.');
    }

    // Ensure Silas exists with correct password and status
    const hashedPassword = await bcrypt.hash('87304508', 10);
    await prisma.user.upsert({
      where: { username: 'silas' },
      update: {
        password: hashedPassword,
        status: 'APPROVED',
        role: 'ADMIN',
        name: 'Silas Paixão'
      },
      create: {
        username: 'silas',
        password: hashedPassword,
        name: 'Silas Paixão',
        role: 'ADMIN',
        status: 'APPROVED'
      }
    });
    console.log('Admin Silas ensured: silas / 87304508');

    // Fallback admin
    const adminExists = await prisma.user.findUnique({
      where: { username: 'admin' }
    });

    if (!adminExists) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await prisma.user.create({
        data: {
          username: 'admin',
          password: hashedPassword,
          name: 'Administrador Sistema',
          role: 'ADMIN',
          status: 'APPROVED'
        }
      });
      console.log('Initial default admin created: admin / admin123');
    }

    ViteExpress.listen(app, port, () => {
      console.log(`Server is listening on port ${port}...`);
    });
  } catch (err) {
    console.error('CRITICAL: Server failed to start during initialization:');
    if (err instanceof Error) {
      console.error('Message:', err.message);
      console.error('Stack:', err.stack);
    } else {
      console.error('Unknown error:', err);
    }
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Server failed to start:', err);
  process.exit(1);
});
