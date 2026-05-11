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
        where.electricians = {
          some: { id: req.user.id }
        };
      } else if (electricianId) {
        where.electricians = {
          some: { id: electricianId as string }
        };
      }

      const demands = await prisma.demand.findMany({
        where,
        include: {
          electricians: { select: { id: true, name: true } },
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
      const { date, description, location, clientNumber, electricianIds, materials } = req.body;

      const demand = await prisma.demand.create({
        data: {
          date: new Date(date),
          description,
          location,
          clientNumber,
          electricians: {
            connect: electricianIds.map((id: string) => ({ id }))
          },
          createdById: req.user!.id,
          plannedMaterials: {
            create: materials.map((m: any) => ({
              materialId: m.materialId,
              quantity: Number(m.quantity),
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
      const { 
        date, 
        description, 
        location, 
        clientNumber, 
        electricianIds, 
        materials,
        transformerNumber,
        observation,
        vehicles,
        ladder,
        usedMaterials,
        returnedMaterials
      } = req.body;

      const isAdmin = req.user?.role === 'ADMIN';

      const existingDemand = await prisma.demand.findUnique({ where: { id } });
      if (!existingDemand) return res.status(404).json({ error: 'Demand not found' });

      if (existingDemand.status !== 'PENDING' && !isAdmin) {
        return res.status(403).json({ error: 'Apenas administradores podem editar demandas em aprovação ou finalizadas.' });
      }

      // Use dynamic data object
      const updateData: any = {
        date: date ? new Date(date) : undefined,
        description,
        location,
        clientNumber,
      };

      if (electricianIds) {
        updateData.electricians = {
          set: electricianIds.map((id: string) => ({ id }))
        };
      }

      const isReturningToPending = existingDemand.status === 'PENDING_APPROVAL' && req.body.status === 'PENDING';
      
      if (isReturningToPending) {
        updateData.status = 'PENDING';
        updateData.photoUrl = null;
        updateData.transformerNumber = null;
        updateData.observation = null;
        updateData.vehicles = [];
        updateData.ladder = null;
      } else if (req.body.status) {
        updateData.status = req.body.status;
      }

      if (isAdmin) {
        if (transformerNumber !== undefined) updateData.transformerNumber = transformerNumber;
        if (observation !== undefined) updateData.observation = observation;
        if (vehicles !== undefined) {
          updateData.vehicles = Array.isArray(vehicles) ? vehicles : (typeof vehicles === 'string' ? vehicles.split(',').map((v: string) => v.trim()).filter(Boolean) : []);
        }
        if (ladder !== undefined) updateData.ladder = ladder;
      }

      await prisma.$transaction(async (tx) => {
        // Handlers for both Planned and Used materials
        let materialsChanged = false;

        // Handle Planned Materials
        if (materials) {
          await tx.demandMaterial.deleteMany({ where: { demandId: id } });
          await tx.demandMaterial.createMany({
            data: materials.map((m: any) => ({
              demandId: id,
              materialId: m.materialId,
              quantity: Number(m.quantity) || 0,
            }))
          });
          materialsChanged = true;
        }

        // If returning to PENDING, clear used/returned materials
        if (isReturningToPending) {
          await tx.usedMaterial.deleteMany({ where: { demandId: id } });
          await tx.returnedMaterial.deleteMany({ where: { demandId: id } });
          materialsChanged = false; // No need to recalculate if cleared
        }

        // Handle Service Completion Fields (Admin only)
        if (isAdmin) {
          if (usedMaterials) {
            await tx.usedMaterial.deleteMany({ where: { demandId: id } });
            
            // Create used materials
            await tx.usedMaterial.createMany({
              data: usedMaterials.map((m: any) => ({
                demandId: id,
                materialId: m.materialId,
                quantity: Number(m.quantity) || 0,
              }))
            });
            materialsChanged = true;
          }

          if (materialsChanged && !isReturningToPending) {
            // Recalculate NOT_USED materials
            const updatedDemand = await tx.demand.findUnique({
              where: { id },
              include: { 
                plannedMaterials: true,
                usedMaterials: true
              }
            });

            // Only recalculate if we have used materials (meaning it's at least PENDING_APPROVAL or CONCLUDED)
            if (updatedDemand && updatedDemand.usedMaterials.length > 0) {
              await tx.returnedMaterial.deleteMany({ 
                where: { demandId: id, type: 'NOT_USED' } 
              });

              for (const planned of updatedDemand.plannedMaterials) {
                const used = updatedDemand.usedMaterials.find((u: any) => u.materialId === planned.materialId);
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
            }
          }

          if (returnedMaterials) {
            // Only delete and recreate DEFECTIVE ones
            await tx.returnedMaterial.deleteMany({ 
              where: { demandId: id, type: 'DEFECTIVE' } 
            });
            
            await tx.returnedMaterial.createMany({
              data: returnedMaterials.map((m: any) => ({
                demandId: id,
                materialId: m.materialId,
                quantity: Number(m.quantity) || 0,
                type: 'DEFECTIVE'
              }))
            });
          }
        }

        await tx.demand.update({
          where: { id },
          data: updateData,
        });
      });

      await AuditService.log('UPDATE', 'DEMAND', req.user!.id, id, { description, location });

      res.json({ message: 'Demand updated successfully' });
    } catch (error) {
      console.error(error);
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
        ladder,
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
            ladder,
          }
        });

        // 2. Record used materials
        const usedItems = JSON.parse(usedMaterials || '[]');
        await tx.usedMaterial.createMany({
          data: usedItems.map((m: any) => ({
            demandId: id,
            materialId: m.materialId,
            quantity: Number(m.quantity) || 0,
          }))
        });

        // 3. Record returned/defective materials
        const replacedItems = JSON.parse(replacedMaterials || '[]');
        await tx.returnedMaterial.createMany({
          data: replacedItems.map((m: any) => ({
            demandId: id,
            materialId: m.materialId,
            quantity: Number(m.quantity) || 0,
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
              electricians: {
                connect: Array.isArray(item.electricianIds) 
                  ? item.electricianIds.map((id: string) => ({ id }))
                  : (item.electricianId ? [{ id: item.electricianId }] : [])
              },
              createdById: req.user!.id,
              status: 'PENDING'
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

  static async delete(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      await prisma.demand.delete({ where: { id } });

      await AuditService.log('DELETE', 'DEMAND', req.user!.id, id);

      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}
