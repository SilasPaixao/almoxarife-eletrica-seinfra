import { Router } from 'express';
import multer from 'multer';
import { DemandController } from '../controllers/DemandController.ts';
import { authMiddleware, adminMiddleware } from '../middlewares/auth.middleware.ts';

const demandRouter = Router();
const upload = multer({ storage: multer.memoryStorage() });

demandRouter.use(authMiddleware as any);

demandRouter.get('/', DemandController.getAll as any);
demandRouter.post('/', adminMiddleware as any, DemandController.create as any);
demandRouter.put('/:id', adminMiddleware as any, DemandController.update as any);
demandRouter.patch('/:id/approve', adminMiddleware as any, DemandController.approve as any);

demandRouter.post('/bulk', adminMiddleware as any, DemandController.bulkCreate as any);
demandRouter.post('/:id/finish', upload.single('photo'), DemandController.finish as any);

export { demandRouter };
