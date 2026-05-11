import { Router } from 'express';
import { LadderController } from '../controllers/LadderController.ts';
import { authMiddleware, roleMiddleware } from '../middlewares/auth.middleware.ts';

const router = Router();

router.get('/', authMiddleware, LadderController.getAll);
router.post('/', authMiddleware, roleMiddleware(['ADMIN']), LadderController.create);
router.put('/:id', authMiddleware, roleMiddleware(['ADMIN']), LadderController.update);
router.delete('/:id', authMiddleware, roleMiddleware(['ADMIN']), LadderController.delete);

export { router as ladderRouter };
