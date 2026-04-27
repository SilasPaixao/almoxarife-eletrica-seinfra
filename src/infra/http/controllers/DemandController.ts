import { Response } from 'express';
import prisma from '../../database/prisma.ts';
import { StorageService } from '../../storage/StorageService.ts';
import { AuthRequest } from '../middlewares/auth.middleware.ts';
import { AuditService } from '../../database/audit.ts';

export class DemandController {
  static async getAll(req: AuthRequest, res: Response) {
    try {
      const { electricianId } = req.query;
      const where: any = {};
      
      if (req.user?.role === 'ELECTRICIAN') {
        where.electricianId = req.user.id;
      } else if (electricianId) {
        where.electricianId = electricianId as string;
      }

      const demands = await prisma.demand.findMany({
        where,
        include: {
          electrician: { select: { name: true } },
          plannedMaterials: { include: { material: true } },
          usedMaterials: { include: { material: true } },
          returnedMaterials: { include: { material: true } },
        },
        orderBy: { date: 'desc' },
      });
      res.json(demands);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async create(req: AuthRequest, res: Response) {
    try {
      const { date, description, location, clientNumber, electricianId, materials } = req.body;

      const demand = await prisma.demand.create({
        data: {
          date: new Date(date),
          description,
          location,
          clientNumber,
          electricianId,
          createdById: req.user!.id,
          plannedMaterials: {
            create: materials.map((m: any) => ({
              materialId: m.materialId,
              quantity: m.quantity,
            })),
          },
        },
      });

      await AuditService.log('CREATE', 'DEMAND', req.user!.id, demand.id, { description, location });

      res.status(201).json(demand);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async update(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { date, description, location, clientNumber, electricianId, materials } = req.body;

      // Simple implementation: delete planned and recreate
      await prisma.demandMaterial.deleteMany({ where: { demandId: id } });

      const demand = await prisma.demand.update({
        where: { id },
        data: {
          date: date ? new Date(date) : undefined,
          description,
          location,
          clientNumber,
          electricianId,
          plannedMaterials: {
            create: materials?.map((m: any) => ({
              materialId: m.materialId,
              quantity: m.quantity,
            })),
          },
        },
      });

      await AuditService.log('UPDATE', 'DEMAND', req.user!.id, id, { description, location });

      res.json(demand);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async finish(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { 
        usedMaterials, 
        replacedMaterials, 
        vehicles, 
        transformerNumber, 
        observation 
      } = req.body;
      
      console.log(`[DemandController.finish] Body:`, req.body);
      console.log(`[DemandController.finish] File:`, req.file ? 'Received' : 'Missing');

      let photoUrl = null;
      if (req.file) {
        const fileKey = `services/${id}/${Date.now()}-${req.file.originalname}`;
        photoUrl = await StorageService.uploadFile(
          'service-photos',
          fileKey,
          req.file.buffer,
          req.file.mimetype
        );
      }

      const demand = await prisma.demand.findUnique({
        where: { id },
        include: { plannedMaterials: true }
      });

      if (!demand) return res.status(404).json({ error: 'Demand not found' });

      // Transactions to ensure atomicity
      await prisma.$transaction(async (tx) => {
        // 1. Mark as PENDING_APPROVAL
        await tx.demand.update({
          where: { id },
          data: {
            status: 'PENDING_APPROVAL',
            photoUrl,
            transformerNumber,
            observation,
            vehicles: typeof vehicles === 'string' ? vehicles.split(',') : vehicles,
          }
        });

        // 2. Record used materials
        const usedItems = JSON.parse(usedMaterials);
        await tx.usedMaterial.createMany({
          data: usedItems.map((m: any) => ({
            demandId: id,
            materialId: m.materialId,
            quantity: m.quantity,
          }))
        });

        // 3. Record returned/defective materials
        const replacedItems = JSON.parse(replacedMaterials);
        await tx.returnedMaterial.createMany({
          data: replacedItems.map((m: any) => ({
            demandId: id,
            materialId: m.materialId,
            quantity: m.quantity,
            type: 'DEFECTIVE'
          }))
        });

        // 4. Calculate "Not Used" materials
        // Planned - Used = Not Used (if > 0)
        for (const planned of demand.plannedMaterials) {
          const used = usedItems.find((u: any) => u.materialId === planned.materialId);
          const usedQty = used ? used.quantity : 0;
          const notUsedQty = planned.quantity - usedQty;

          if (notUsedQty > 0) {
            await tx.returnedMaterial.create({
              data: {
                demandId: id,
                materialId: planned.materialId,
                quantity: notUsedQty,
                type: 'NOT_USED'
              }
            });
          }
        }
      });

      res.json({ message: 'Demand sent for approval' });
      
      await AuditService.log('FINISH', 'DEMAND', req.user!.id, id);
      console.log(`NOTIFICATION: Task ${id} marked as PENDING_APPROVAL by ${req.user!.name}. Admin notification sent.`);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async approve(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      await prisma.demand.update({
        where: { id },
        data: { status: 'CONCLUDED' }
      });

      await AuditService.log('APPROVE', 'DEMAND', req.user!.id, id);

      res.json({ message: 'Demand completion approved and moved to reports' });
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async bulkCreate(req: AuthRequest, res: Response) {
    try {
      const { demands } = req.body;
      
      const createdCount = await prisma.$transaction(async (tx) => {
        let count = 0;
        for (const item of demands) {
          await tx.demand.create({
            data: {
              date: new Date(item.date),
              description: item.description,
              location: item.location,
              clientNumber: item.clientNumber,
              electricianId: item.electricianId,
              createdById: req.user!.id,
              status: 'PLANNED'
            }
          });
          count++;
        }
        return count;
      });

      await AuditService.log('BULK_CREATE', 'DEMAND', req.user!.id, null, { count: createdCount });

      res.status(201).json({ count: createdCount });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}
