import { Response } from 'express';
import prisma from '../../database/prisma.ts';
import { StorageService } from '../../storage/StorageService.ts';
import { AuthRequest } from '../middlewares/auth.middleware.ts';
import { AuditService } from '../../database/audit.ts';
import path from 'path';
import fs from 'fs';
import PDFDocument from 'pdfkit';
import axios from 'axios';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

function parseDateAtNoon(dateInput: string | Date | undefined | null): Date {
  if (!dateInput) return new Date();
  let baseDateStr = typeof dateInput === 'string' ? dateInput : new Date(dateInput).toISOString();
  const matchYMD = baseDateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (matchYMD) {
    return new Date(`${matchYMD[1]}-${matchYMD[2]}-${matchYMD[3]}T12:00:00`);
  }
  return new Date();
}

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
        orderBy: { createdAt: 'desc' },
      });
      res.json(demands.map(d => StorageService.mapDemand(d)));
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async create(req: AuthRequest, res: Response) {
    try {
      const { date, description, location, clientNumber, electricianIds, materials } = req.body;

      const demand = await prisma.demand.create({
        data: {
          date: parseDateAtNoon(date),
          description,
          location,
          clientNumber,
          electricians: {
            connect: (electricianIds || []).map((id: string) => ({ id }))
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

      res.status(201).json(StorageService.mapDemand(demand));
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
        tools,
        usedMaterials,
        returnedMaterials
      } = req.body;

      const isAdmin = req.user?.role === 'ADMIN';

      const existingDemand = await prisma.demand.findUnique({ where: { id } });
      if (!existingDemand) return res.status(404).json({ error: 'Demand not found' });

      if (!isAdmin && existingDemand.status === 'CONCLUDED') {
        return res.status(403).json({ error: 'Apenas administradores podem editar demandas finalizadas.' });
      }

      // Use dynamic data object
      const updateData: any = {
        date: date ? parseDateAtNoon(date) : undefined,
        description,
        location,
        clientNumber,
      };

      if (electricianIds && isAdmin) {
        updateData.electricians = {
          set: electricianIds.map((id: string) => ({ id }))
        };
      }

      const isReturningToPending = existingDemand.status === 'PENDING_APPROVAL' && req.body.status === 'PENDING';
      
      const canEditCompletionFields = isAdmin || (existingDemand.status === 'PENDING_APPROVAL' && req.user?.role === 'ELECTRICIAN');

      if (isReturningToPending) {
        updateData.status = 'PENDING';
        updateData.photoUrl = null;
        updateData.transformerNumber = null;
        updateData.observation = null;
        updateData.vehicles = [];
        updateData.tools = [];
      } else if (req.body.status) {
        updateData.status = req.body.status;
      }

      if (canEditCompletionFields) {
        if (transformerNumber !== undefined) updateData.transformerNumber = transformerNumber;
        if (observation !== undefined) updateData.observation = observation;
        if (vehicles !== undefined) {
          updateData.vehicles = Array.isArray(vehicles) ? vehicles : (typeof vehicles === 'string' ? vehicles.split(',').map((v: string) => v.trim()).filter(Boolean) : []);
        }
        if (tools !== undefined) {
          updateData.tools = Array.isArray(tools) ? tools : (typeof tools === 'string' ? tools.split(',').map((v: string) => v.trim()).filter(Boolean) : []);
        }
      }

      await prisma.$transaction(async (tx) => {
        // Handlers for both Planned and Used materials
        let materialsChanged = false;

        // Handle Planned Materials
        if (materials && (isAdmin || existingDemand.status === 'PENDING')) {
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

        // Handle Service Completion Fields
        if (canEditCompletionFields) {
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
            // Delete and recreate DEFECTIVE and RECOVERED ones
            await tx.returnedMaterial.deleteMany({ 
              where: { 
                demandId: id, 
                type: { in: ['DEFECTIVE', 'RECOVERED'] } 
              } 
            });
            
            const returnedToCreate = returnedMaterials.map((m: any) => ({
              demandId: id,
              materialId: m.materialId,
              quantity: Number(m.quantity) || 0,
              type: m.type || 'DEFECTIVE'
            }));

            await tx.returnedMaterial.createMany({
              data: returnedToCreate
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
        tools,
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
        // 0. Clear existing completion data (if any) to allow for re-finishing (edits)
        await tx.usedMaterial.deleteMany({ where: { demandId: id } });
        await tx.returnedMaterial.deleteMany({ where: { demandId: id } });

        // 1. Mark as PENDING_APPROVAL
        const updateData: any = {
          status: 'PENDING_APPROVAL',
          transformerNumber,
          observation,
          vehicles: typeof vehicles === 'string' ? vehicles.split(',') : vehicles,
          tools: typeof tools === 'string' ? tools.split(',') : tools,
        };

        // Only update photoUrl if a new file was uploaded
        if (photoUrl) {
          updateData.photoUrl = photoUrl;
        }

        await tx.demand.update({
          where: { id },
          data: updateData
        });

        // 2. Record used materials
        const usedItems = JSON.parse(usedMaterials || '[]');
        if (usedItems.length > 0) {
          await tx.usedMaterial.createMany({
            data: usedItems.map((m: any) => ({
              demandId: id,
              materialId: m.materialId,
              quantity: Number(m.quantity) || 0,
            }))
          });
        }

        // 3. Record returned/defective materials
        const replacedItems = JSON.parse(replacedMaterials || '[]');
        if (replacedItems.length > 0) {
          await tx.returnedMaterial.createMany({
            data: replacedItems.map((m: any) => ({
              demandId: id,
              materialId: m.materialId,
              quantity: Number(m.quantity) || 0,
              type: 'DEFECTIVE'
            }))
          });
        }

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
              date: parseDateAtNoon(item.date),
              description: item.description,
              location: item.location,
              clientNumber: item.clientNumber,
              electricians: {
                connect: Array.isArray(item.electricianIds) 
                  ? item.electricianIds.map((id: string) => ({ id }))
                  : (item.electricianId ? [{ id: item.electricianId }] : [])
              },
              createdById: req.user!.id,
              status: 'PENDING',
              plannedMaterials: item.materials && Array.isArray(item.materials) ? {
                create: item.materials.map((m: any) => ({
                  materialId: m.materialId,
                  quantity: Number(m.quantity) || 0,
                }))
              } : undefined
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

  static async getPendingReturns(req: AuthRequest, res: Response) {
    try {
      const where: any = { type: 'NOT_USED', isReturned: false };
      
      if (req.user?.role === 'ELECTRICIAN') {
        where.demand = {
          electricians: {
            some: { id: req.user.id }
          }
        };
      }

      const returns = await prisma.returnedMaterial.findMany({
        where,
        include: {
          material: true,
          demand: {
            include: {
              electricians: { select: { id: true, name: true, username: true } }
            }
          }
        },
        orderBy: { date: 'desc' },
      });

      res.json(returns);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Erro ao buscar retornos pendentes.' });
    }
  }

  static async clearPendingReturn(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      
      if (req.user?.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Apenas administradores podem dar baixa em materiais pendentes.' });
      }

      await prisma.returnedMaterial.update({
        where: { id },
        data: { isReturned: true }
      });

      await AuditService.log('UPDATE', 'RETURNED_MATERIAL_CLEAR', req.user.id, id, { isReturned: true });

      res.json({ message: 'Baixa efetuada com sucesso.' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Erro ao dar baixa no material pendente.' });
    }
  }

  static async getSeparationData(req: AuthRequest, res: Response) {
    try {
      const { electricianId } = req.query;

      // Determine target electrician
      let targetElectricianId = electricianId as string;
      if (req.user?.role === 'ELECTRICIAN') {
        targetElectricianId = req.user.id;
      }

      if (targetElectricianId) {
        // Fetch detailed data for a specific electrician
        const electrician = await prisma.user.findUnique({
          where: { id: targetElectricianId },
          select: { id: true, name: true, username: true }
        });

        if (!electrician) {
          return res.status(404).json({ error: 'Eletricista não encontrado.' });
        }

        const demands = await prisma.demand.findMany({
          where: {
            status: 'PENDING',
            electricians: {
              some: { id: targetElectricianId }
            }
          },
          include: {
            plannedMaterials: {
              include: {
                material: true
              }
            },
            electricians: {
              select: { id: true, name: true, username: true }
            }
          },
          orderBy: { date: 'asc' }
        });

        // Compute material totals
        const materialTotals: { [key: string]: { id: string; name: string; unit: string; quantity: number } } = {};
        demands.forEach(d => {
          d.plannedMaterials.forEach(pm => {
            if (!pm.material) return;
            const matId = pm.material.id;
            if (!materialTotals[matId]) {
              materialTotals[matId] = {
                id: matId,
                name: pm.material.name,
                unit: pm.material.unit || 'un',
                quantity: 0
              };
            }
            materialTotals[matId].quantity += pm.quantity;
          });
        });

        return res.json({
          electrician,
          demands: demands.map(d => StorageService.mapDemand(d)),
          totals: Object.values(materialTotals)
        });
      }

      // If no electricianId is specified and user is Admin, list ALL electricians who have PENDING demands
      if (req.user?.role === 'ADMIN') {
        const electriciansWithDemands = await prisma.user.findMany({
          where: {
            role: 'ELECTRICIAN',
            status: 'APPROVED',
            assignedDemands: {
              some: { status: 'PENDING' }
            }
          },
          select: {
            id: true,
            name: true,
            username: true,
            assignedDemands: {
              where: { status: 'PENDING' },
              select: { id: true }
            }
          },
          orderBy: { name: 'asc' }
        });

        const mapped = electriciansWithDemands.map(e => ({
          id: e.id,
          name: e.name,
          username: e.username,
          pendingDemandsCount: e.assignedDemands.length
        }));

        return res.json({ electricians: mapped });
      }

      return res.status(400).json({ error: 'Parâmetros inválidos.' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Erro ao obter dados de separação.' });
    }
  }

  static async downloadSeparationPdf(req: AuthRequest, res: Response) {
    try {
      const { electricianId } = req.params;
      let targetId = electricianId;

      if (req.user?.role === 'ELECTRICIAN' && req.user.id !== electricianId) {
        return res.status(403).json({ error: 'Você não tem permissão para visualizar o kit de outro eletricista.' });
      }

      const electrician = await prisma.user.findUnique({
        where: { id: targetId },
        select: { id: true, name: true, username: true }
      });

      if (!electrician) {
        return res.status(404).json({ error: 'Eletricista não encontrado.' });
      }

      const demands = await prisma.demand.findMany({
        where: {
          status: 'PENDING',
          electricians: {
            some: { id: targetId }
          }
        },
        include: {
          plannedMaterials: {
            include: {
              material: true
            }
          }
        },
        orderBy: { date: 'asc' }
      });

      if (demands.length === 0) {
        return res.status(400).json({ error: 'Este eletricista não possui nenhuma demanda pendente para separação.' });
      }

      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const chunks: Buffer[] = [];
      doc.on('data', chunk => chunks.push(chunk));
      
      const pdfGenerationPromise = new Promise<Buffer>((resolve, reject) => {
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', err => reject(err));
      });

      // --- RESOLVE FONTS PATH ---
      const isProd = process.env.NODE_ENV === 'production';
      const projectRoot = process.cwd();
      const fontsBaseDir = isProd 
        ? path.resolve(projectRoot, 'dist/assets/fonts')
        : path.resolve(projectRoot, 'src/assets/fonts');

      const regularPath = path.join(fontsBaseDir, 'Roboto-Regular.ttf');
      const boldPath = path.join(fontsBaseDir, 'Roboto-Bold.ttf');
      const italicPath = path.join(fontsBaseDir, 'Roboto-Italic.ttf');

      // Register fonts with PDFKit
      let fontRegular = 'Helvetica';
      let fontBold = 'Helvetica-Bold';
      let fontItalic = 'Helvetica-Oblique';

      if (fs.existsSync(regularPath) && fs.existsSync(boldPath) && fs.existsSync(italicPath)) {
        doc.registerFont('AppFont', regularPath);
        doc.registerFont('AppFont-Bold', boldPath);
        doc.registerFont('AppFont-Italic', italicPath);
        fontRegular = 'AppFont';
        fontBold = 'AppFont-Bold';
        fontItalic = 'AppFont-Italic';
      }

      // --- MUNICIPIO LOGO ---
      const [logoRes] = await Promise.allSettled([
        axios.get('https://i.postimg.cc/W3n0DdqH/pref-logo-sha.png', { responseType: 'arraybuffer', timeout: 5000, headers: { 'User-Agent': 'Mozilla/5.0' } })
      ]);

      // Header Banner
      doc.rect(0, 0, 612, 110).fill('#1e3a8a');
      if (logoRes.status === 'fulfilled') {
        try {
          doc.image(logoRes.value.data, 40, 20, { width: 100 });
        } catch (err) {
          console.error('[downloadSeparationPdf] Image parsing failed', err);
        }
      }

      doc.fillColor('#ffffff').font(fontBold).fontSize(16).text('KIT DE SEPARAÇÃO - ALMOXARIFADO', 160, 30);
      doc.fontSize(10).font(fontRegular).text('CONTROLE DE CARGA E SEPARAÇÃO POR ELETRICISTA', 160, 52);
      doc.fontSize(8.5).font(fontItalic).text('EMISSÃO COMPILADA DAS SOBRAS E PLANEJAMENTO DE SERVIÇO', 160, 68);

      doc.y = 130;

      // Meta Context Card
      const metaY = doc.y;
      doc.rect(40, metaY, 512, 70).fill('#f8fafc').stroke('#e2e8f0');
      doc.fillColor('#0f172a'); // slate-900

      doc.font(fontBold).fontSize(9.5).text('Eletricista:', 55, metaY + 12);
      doc.font(fontRegular).fontSize(9.5).text(electrician.name, 125, metaY + 12);

      doc.font(fontBold).fontSize(9.5).text('Usuário:', 55, metaY + 28);
      doc.font(fontRegular).fontSize(9.5).text(electrician.username, 125, metaY + 28);

      doc.font(fontBold).fontSize(9.5).text('Demanda(s):', 55, metaY + 44);
      doc.font(fontRegular).fontSize(9.5).text(`${demands.length} pendente(s) de execução`, 125, metaY + 44);

      doc.font(fontBold).fontSize(9.5).text('Data de Geração:', 300, metaY + 12);
      doc.font(fontRegular).fontSize(9.5).text(format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR }), 390, metaY + 12);

      doc.font(fontBold).fontSize(9.5).text('Finalidade:', 300, metaY + 28);
      doc.font(fontRegular).fontSize(9.5).text('Agrupamento para separação', 390, metaY + 28);

      doc.y = metaY + 95;

      // Section 1 Heading
      doc.fillColor('#1e293b').font(fontBold).fontSize(12).text('1. DETALHAMENTO DE MATERIAIS - POR DEMANDA', 40);
      doc.moveDown(0.3);
      doc.rect(40, doc.y, 512, 1.5).fill('#3b82f6');
      doc.moveDown(0.6);

      demands.forEach((d: any, idx: number) => {
        if (doc.y > 680) {
          doc.addPage();
        }

        const demandY = doc.y;
        doc.rect(40, demandY, 512, 22).fill('#eff6ff');
        doc.fillColor('#1d4ed8').font(fontBold).fontSize(9.5).text(`DEMANDA: ${d.location ? d.location.toUpperCase() : 'SEM LOCAL'}`, 50, demandY + 6);
        doc.fillColor('#475569').font(fontBold).fontSize(8.5).text(`DATA: ${format(new Date(d.date), 'dd/MM/yyyy', { locale: ptBR })}`, 440, demandY + 7);
        
        doc.y = demandY + 27;
        doc.fillColor('#334155').font(fontItalic).fontSize(8.5).text(`Descrição da Demanda: ${d.description || 'Sem descrição'}`, 50);
        doc.moveDown(0.4);

        const mats = d.plannedMaterials || [];
        if (mats.length === 0) {
          doc.fillColor('#94a3b8').font(fontItalic).fontSize(8.5).text('Não há materiais planejados para esta demanda.', 60);
          doc.moveDown(0.8);
        } else {
          // Table Header
          const headerY = doc.y;
          doc.rect(50, headerY, 492, 16).fill('#f8fafc');
          doc.fillColor('#475569').font(fontBold).fontSize(8.5).text('Descrição do Material', 60, headerY + 4);
          doc.text('Unidade', 380, headerY + 4);
          doc.text('Quantidade', 450, headerY + 4);
          doc.y = headerY + 18;

          mats.forEach((pm: any) => {
            if (doc.y > 740) {
              doc.addPage();
            }
            const rowY = doc.y;
            doc.rect(50, rowY, 492, 16).fill('#ffffff');
            doc.fillColor('#0f172a').font(fontRegular).fontSize(8.5).text(pm.material?.name || 'Material sem nome', 60, rowY + 4);
            doc.fillColor('#475569').text(pm.material?.unit || 'un', 380, rowY + 4);
            doc.fillColor('#0f172a').font(fontBold).text(String(pm.quantity), 450, rowY + 4);
            doc.rect(50, rowY + 15, 492, 0.5).fill('#e2e8f0');
            doc.y = rowY + 17;
          });
          doc.moveDown(0.8);
        }
      });

      // Section 2 Heading: Consolidated Total
      doc.addPage();
      const summaryY = doc.y;
      doc.rect(40, summaryY, 512, 26).fill('#1e3a8a');
      doc.fillColor('#ffffff').font(fontBold).fontSize(11).text('2. RESUMO CONSOLIDADO DA CARGA (PARA SEPARAÇÃO)', 50, summaryY + 8);
      doc.y = summaryY + 34;

      doc.fillColor('#475569').font(fontRegular).fontSize(9).text('Este quadro exibe o somatório total de cada item necessário para a execução simultânea de todas as demandas pendentes deste eletricista, facilitando a separação física do kit no almoxarifado.', 40);
      doc.moveDown(0.8);

      // Compute static consolidation
      const consolidated: { [key: string]: { name: string; unit: string; qty: number } } = {};
      demands.forEach(d => {
        d.plannedMaterials?.forEach((pm: any) => {
          if (!pm.material) return;
          const matId = pm.material.id;
          if (!consolidated[matId]) {
            consolidated[matId] = {
              name: pm.material.name,
              unit: pm.material.unit || 'un',
              qty: 0
            };
          }
          consolidated[matId].qty += pm.quantity;
        });
      });

      const consolidatedList = Object.values(consolidated);

      const tableHeaderY = doc.y;
      doc.rect(40, tableHeaderY, 512, 18).fill('#eff6ff');
      doc.fillColor('#1e40af').font(fontBold).fontSize(8.5).text('Check', 48, tableHeaderY + 5);
      doc.text('Descrição do Material', 90, tableHeaderY + 5);
      doc.text('Unidade', 380, tableHeaderY + 5);
      doc.text('Separar (Total)', 450, tableHeaderY + 5);
      doc.y = tableHeaderY + 22;

      consolidatedList.forEach((item) => {
        if (doc.y > 740) {
          doc.addPage();
        }
        const rowY = doc.y;
        doc.rect(40, rowY, 512, 20).fill('#ffffff');
        
        // Draw comfortable checkbox
        doc.rect(50, rowY + 4, 10, 10).stroke('#94a3b8');

        doc.fillColor('#0f172a').font(fontRegular).fontSize(9).text(item.name, 90, rowY + 5);
        doc.fillColor('#475569').text(item.unit, 380, rowY + 5);
        doc.fillColor('#1d4ed8').font(fontBold).fontSize(9.5).text(String(item.qty), 450, rowY + 5);
        doc.rect(40, rowY + 19, 512, 0.5).fill('#e2e8f0');
        doc.y = rowY + 22;
      });

      doc.moveDown(2);
      
      if (doc.y > 650) {
        doc.addPage();
      }

      const sigY = doc.y + 40;
      doc.rect(50, sigY, 200, 0.7).fill('#94a3b8');
      doc.rect(340, sigY, 200, 0.7).fill('#94a3b8');
      
      doc.font(fontRegular).fillColor('#334155').fontSize(8);
      doc.text('Assinatura do Responsável (Separação)', 50, sigY + 5, { width: 200, align: 'center' });
      doc.text('Assinatura do Eletricista (Recebimento)', 340, sigY + 5, { width: 200, align: 'center' });

      doc.end();

      const finalBuffer = await pdfGenerationPromise;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=Almoxarifado-Kit-${electrician.username}.pdf`);
      res.send(finalBuffer);

    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Erro ao gerar PDF de separação de kit.' });
    }
  }
}
