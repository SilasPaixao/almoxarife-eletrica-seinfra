import { Router } from 'express';
import { ReportController } from '../controllers/ReportController.ts';
import { authMiddleware, adminMiddleware } from '../middlewares/auth.middleware.ts';

const reportRouter = Router();

reportRouter.use(authMiddleware as any);
reportRouter.use(adminMiddleware as any);

reportRouter.get('/data', ReportController.getReportData as any);
reportRouter.get('/download/pdf', ReportController.downloadPdf as any);
reportRouter.get('/download/docx', ReportController.downloadDocx as any);

export { reportRouter };
