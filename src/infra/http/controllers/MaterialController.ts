import { Response } from 'express';
import prisma from '../../database/prisma.ts';
import { StorageService } from '../../storage/StorageService.ts';
import { AuthRequest } from '../middlewares/auth.middleware.ts';
import { AuditService } from '../../database/audit.ts';

export class MaterialController {
  static async getAll(req: AuthRequest, res: Response) {
    try {
      const materials = await prisma.material.findMany();
      res.json(materials.map(m => StorageService.mapMaterial(m)));
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async create(req: AuthRequest, res: Response) {
    try {
      const { name, unit, components } = req.body;
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

      let parsedComponents = null;
      if (components) {
        try {
          parsedComponents = typeof components === 'string' ? JSON.parse(components) : components;
        } catch (e) {
          console.error('[MaterialController] Error parsing components on create:', e);
        }
      }

      const material = await prisma.material.create({
        data: { 
          name, 
          imageUrl, 
          unit: unit || 'un',
          components: parsedComponents || null
        },
      });

      await AuditService.log('CREATE', 'MATERIAL', req.user!.id, material.id, { name, unit });

      res.status(201).json(StorageService.mapMaterial(material));
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async update(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { name, unit, removeImage, components } = req.body;
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

      let parsedComponents = undefined;
      if (components !== undefined) {
        try {
          parsedComponents = typeof components === 'string' ? JSON.parse(components) : components;
        } catch (e) {
          console.error('[MaterialController] Error parsing components on update:', e);
        }
      }

      const material = await prisma.material.update({
        where: { id },
        data: { 
          name, 
          unit, 
          imageUrl,
          components: parsedComponents !== undefined ? (parsedComponents || null) : undefined
        },
      });

      await AuditService.log('UPDATE', 'MATERIAL', req.user!.id, id, { name, unit });

      res.json(StorageService.mapMaterial(material));
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
