import { Response } from 'express';
import prisma from '../../database/prisma.ts';
import { AuthRequest } from '../middlewares/auth.middleware.ts';
import { AuditService } from '../../database/audit.ts';

export class LadderController {
  static async getAll(req: AuthRequest, res: Response) {
    try {
      const ladders = await prisma.ladder.findMany({
        orderBy: { name: 'asc' },
      });
      res.json(ladders);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async create(req: AuthRequest, res: Response) {
    try {
      const { name, code } = req.body;
      const ladder = await prisma.ladder.create({
        data: { name, code },
      });

      await AuditService.log('CREATE', 'LADDER', req.user!.id, ladder.id, { name, code });
      res.status(201).json(ladder);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async update(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { name, code } = req.body;
      const ladder = await prisma.ladder.update({
        where: { id },
        data: { name, code },
      });

      await AuditService.log('UPDATE', 'LADDER', req.user!.id, id, { name, code });
      res.json(ladder);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async delete(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      await prisma.ladder.delete({ where: { id } });

      await AuditService.log('DELETE', 'LADDER', req.user!.id, id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}
