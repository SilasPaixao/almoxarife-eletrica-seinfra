import { Response } from 'express';
import prisma from '../../database/prisma.ts';
import { StorageService } from '../../storage/StorageService.ts';
import { AuthRequest } from '../middlewares/auth.middleware.ts';
import { AuditService } from '../../database/audit.ts';

export class MaterialController {
  static async getAll(req: AuthRequest, res: Response) {
    try {
      const materials = await prisma.material.findMany();
      res.json(materials);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async create(req: AuthRequest, res: Response) {
    try {
      const { name } = req.body;
      let imageUrl = null;

      if (req.file) {
        const fileKey = `materials/${Date.now()}-${req.file.originalname}`;
        imageUrl = await StorageService.uploadFile(
          'materials-images',
          fileKey,
          req.file.buffer,
          req.file.mimetype
        );
      }

      const material = await prisma.material.create({
        data: { name, imageUrl },
      });

      await AuditService.log('CREATE', 'MATERIAL', req.user!.id, material.id, { name });

      res.status(201).json(material);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async update(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { name, removeImage } = req.body;
      let imageUrl = undefined;

      if (req.file) {
        const fileKey = `materials/${Date.now()}-${req.file.originalname}`;
        imageUrl = await StorageService.uploadFile(
          'materials-images',
          fileKey,
          req.file.buffer,
          req.file.mimetype
        );
      } else if (removeImage === 'true') {
        imageUrl = null;
      }

      const material = await prisma.material.update({
        where: { id },
        data: { name, imageUrl },
      });

      await AuditService.log('UPDATE', 'MATERIAL', req.user!.id, id, { name });

      res.json(material);
    } catch (error) {
      console.error('Error updating material:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async delete(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      await prisma.material.delete({ where: { id } });

      await AuditService.log('DELETE', 'MATERIAL', req.user!.id, id);

      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}
